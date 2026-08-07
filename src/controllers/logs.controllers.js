const pool = require('../db');

const getSystemLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, tenant, level } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM public.system_logs WHERE 1=1';
        let queryParams = [];
        let countQuery = 'SELECT COUNT(*) FROM public.system_logs WHERE 1=1';

        if (tenant) {
            queryParams.push(tenant);
            query += ` AND tenant = $${queryParams.length}`;
            countQuery += ` AND tenant = $${queryParams.length}`;
        }

        if (level) {
            queryParams.push(level);
            query += ` AND level = $${queryParams.length}`;
            countQuery += ` AND level = $${queryParams.length}`;
        }

        query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

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

const deleteSystemLogs = async (req, res, next) => {
    try {
        await pool.query('DELETE FROM public.system_logs');
        res.json({ success: true, message: 'Todos los logs del sistema han sido eliminados correctamente' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSystemLogs,
    getReportsList,
    downloadReport,
    deleteAllReports,
    deleteReport,
    deleteSystemLogs
};
