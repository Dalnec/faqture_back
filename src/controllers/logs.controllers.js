const pool = require('../db');

const getSystemLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, tenant, level } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT l.*, c.company, c.company_number 
            FROM public.system_logs l
            LEFT JOIN public.company c ON l.tenant = c.tenant
            WHERE 1=1
        `;
        let queryParams = [];
        let countQuery = `
            SELECT COUNT(*) 
            FROM public.system_logs l
            LEFT JOIN public.company c ON l.tenant = c.tenant
            WHERE 1=1
        `;

        if (tenant) {
            queryParams.push(`%${tenant.trim()}%`);
            query += ` AND (l.tenant ILIKE $${queryParams.length} OR l.message ILIKE $${queryParams.length} OR c.company ILIKE $${queryParams.length} OR c.company_number ILIKE $${queryParams.length} OR (l.meta->>'document') ILIKE $${queryParams.length})`;
            countQuery += ` AND (l.tenant ILIKE $${queryParams.length} OR l.message ILIKE $${queryParams.length} OR c.company ILIKE $${queryParams.length} OR c.company_number ILIKE $${queryParams.length} OR (l.meta->>'document') ILIKE $${queryParams.length})`;
        }

        if (level) {
            queryParams.push(level);
            query += ` AND l.level = $${queryParams.length}`;
            countQuery += ` AND l.level = $${queryParams.length}`;
        }

        query += ` ORDER BY l.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

        const logsPromise = pool.query(query, [...queryParams, limit, offset]);
        const countPromise = pool.query(countQuery, queryParams);

        const [logs, countResult] = await Promise.all([logsPromise, countPromise]);

        res.status(200).json({
            success: true,
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            data: logs.rows
        });
    } catch (error) {
        console.error('Error in getSystemLogs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const fs = require('fs');
const path = require('path');

const getReportsList = async (req, res, next) => {
    try {
        const reportsDir = path.join(__dirname, '../../faqture_cli/reports');
        if (!fs.existsSync(reportsDir)) {
            return res.status(200).json({ success: true, data: [] });
        }

        const files = fs.readdirSync(reportsDir);
        const mdFiles = files.filter(f => f.endsWith('.md')).map(f => {
            const stat = fs.statSync(path.join(reportsDir, f));
            return {
                filename: f,
                size: stat.size,
                createdAt: stat.birthtime
            };
        }).sort((a, b) => b.createdAt - a.createdAt);

        res.status(200).json({ success: true, data: mdFiles });
    } catch (error) {
        console.error('Error in getReportsList:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const downloadReport = async (req, res, next) => {
    try {
        const { filename } = req.params;
        const reportsDir = path.join(__dirname, '../../faqture_cli/reports');
        const filepath = path.join(reportsDir, filename);

        if (!fs.existsSync(filepath) || !filename.endsWith('.md')) {
            return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
        }

        res.download(filepath, filename);
    } catch (error) {
        console.error('Error in downloadReport:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const deleteAllReports = async (req, res, next) => {
    try {
        const reportsDir = path.join(__dirname, '../../faqture_cli/reports');
        if (fs.existsSync(reportsDir)) {
            const files = fs.readdirSync(reportsDir);
            for (const file of files) {
                if (file.endsWith('.md')) {
                    fs.unlinkSync(path.join(reportsDir, file));
                }
            }
        }
        res.status(200).json({ success: true, message: 'Todos los reportes eliminados' });
    } catch (error) {
        console.error('Error in deleteAllReports:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const deleteReport = async (req, res, next) => {
    try {
        const { filename } = req.params;
        const filepath = path.join(__dirname, '../../faqture_cli/reports', filename);

        if (fs.existsSync(filepath) && filename.endsWith('.md')) {
            fs.unlinkSync(filepath);
            res.status(200).json({ success: true, message: 'Reporte eliminado' });
        } else {
            res.status(404).json({ success: false, message: 'Reporte no encontrado' });
        }
    } catch (error) {
        console.error('Error in deleteReport:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const { exec } = require('child_process');

const deleteSystemLogs = async (req, res, next) => {
    try {
        await pool.query('DELETE FROM public.system_logs');
        res.json({ success: true, message: 'Todos los logs del sistema han sido eliminados correctamente' });
    } catch (error) {
        next(error);
    }
};

const generateReport = async (req, res, next) => {
    try {
        const cliPath = path.join(__dirname, '../../faqture_cli');
        const cmd = 'node dist/index.js logs --report --all --json';
        
        exec(cmd, { cwd: cliPath }, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return res.status(500).json({ success: false, message: 'Error al generar reporte: ' + error.message });
            }
            try {
                // El stdout puede tener múltiples líneas si hay advertencias de Node, buscaremos la que parece JSON.
                const jsonStr = stdout.split('\n').find(line => {
                    const t = line.trim();
                    return t.startsWith('{') || t.startsWith('[');
                });
                if (!jsonStr) throw new Error("No JSON found in stdout");
                
                const result = JSON.parse(jsonStr);
                
                // Si devuelve un array vacío, no hay errores
                if (Array.isArray(result) && result.length === 0) {
                    return res.status(200).json({ success: true, filepath: null, message: 'No hay errores recientes para generar un reporte.' });
                }
                
                res.status(200).json(result);
            } catch(e) {
                console.error('Error parsing CLI output:', stdout);
                res.status(500).json({ success: false, message: 'Error parsing CLI output', output: stdout });
            }
        });
    } catch (error) {
        console.error('Error in generateReport:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getSystemLogs,
    getReportsList,
    downloadReport,
    deleteAllReports,
    deleteReport,
    deleteSystemLogs,
    generateReport
};
