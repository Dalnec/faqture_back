"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logsCommand = void 0;
const commander_1 = require("commander");
const db_1 = require("../db");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prompts_1 = __importDefault(require("prompts"));
exports.logsCommand = new commander_1.Command('logs')
    .description('Consulta y gestión de logs del sistema')
    .option('-t, --tenant <tenant>', 'Filtrar por empresa específica')
    .option('-r, --report', 'Generar reporte Markdown para la IA en lugar de mostrar en consola')
    .option('-l, --limit <number>', 'Cantidad máxima de logs a mostrar', '100')
    .option('-a, --all', 'Obtener absolutamente todos los logs sin límite')
    .option('-c, --clean', 'Limpiar los logs que tengan más de 30 días de antigüedad')
    .option('--json', 'Devuelve la salida en formato JSON puro (para pipes)')
    .option('-y, --yes', 'Omitir confirmación en acciones destructivas (logs --clean)')
    .action(async (options) => {
    try {
        if (options.clean) {
            if (!options.yes) {
                const response = await (0, prompts_1.default)({
                    type: 'confirm',
                    name: 'confirm',
                    message: '⚠️ ¿Estás súper seguro de eliminar permanentemente los logs con más de 30 días de antigüedad?',
                    initial: false
                });
                if (!response.confirm) {
                    if (!options.json)
                        console.log('🛑 Operación cancelada.');
                    return;
                }
            }
            const cleanRes = await db_1.pool.query(`DELETE FROM public.system_logs WHERE created_at < NOW() - INTERVAL '30 days' RETURNING id_log`);
            if (options.json) {
                console.log(JSON.stringify({ success: true, deleted: cleanRes.rowCount }));
            }
            else {
                console.log(`✅ Limpieza completada. Se eliminaron ${cleanRes.rowCount} logs antiguos.`);
            }
            return;
        }
        let query = `
        SELECT tenant, level, message, meta, created_at
        FROM public.system_logs 
        WHERE level IN ('error', 'warn')
      `;
        const params = [];
        if (options.tenant) {
            params.push(options.tenant);
            query += ` AND tenant = $${params.length}`;
        }
        query += ` ORDER BY created_at DESC`;
        if (!options.all) {
            const limit = parseInt(options.limit, 10);
            query += ` LIMIT $${params.length + 1}`;
            params.push(limit);
        }
        const res = await db_1.pool.query(query, params);
        if (res.rows.length === 0) {
            if (options.json)
                console.log(JSON.stringify([]));
            else
                console.log('✅ No se encontraron errores recientes. El sistema está limpio.');
            return;
        }
        if (options.report) {
            generateReport(res.rows, options.tenant, options.json);
        }
        else {
            if (options.json) {
                console.log(JSON.stringify(res.rows));
            }
            else {
                console.log(`\nÚltimos logs${options.tenant ? ` de ${options.tenant}` : ''}:`);
                console.table(res.rows.map(r => ({
                    Empresa: r.tenant,
                    Fecha: r.created_at.toISOString(),
                    Nivel: r.level,
                    Mensaje: typeof r.message === 'string' ? r.message.substring(0, 80) : JSON.stringify(r.message).substring(0, 80)
                })));
            }
        }
    }
    catch (e) {
        if (options.json) {
            console.error(JSON.stringify({ error: e.message || 'Error desconocido' }));
        }
        else {
            console.error('❌ Error buscando logs:', e);
        }
        process.exit(1);
    }
});
function generateReport(rows, tenant, isJson) {
    let errorDictionary = {};
    try {
        const kbPath = path_1.default.join(__dirname, '../../docs/kb.json');
        if (fs_1.default.existsSync(kbPath)) {
            errorDictionary = JSON.parse(fs_1.default.readFileSync(kbPath, 'utf8'));
        }
    }
    catch (e) {
        // Ignore, fallback to empty
    }
    const getErrorAdvice = (msg) => {
        const key = Object.keys(errorDictionary).find(k => msg.toLowerCase().includes(k.toLowerCase()));
        return key ? errorDictionary[key] : null;
    };
    const patterns = {};
    for (const row of rows) {
        let msg = typeof row.message === 'string' ? row.message : JSON.stringify(row.message);
        if (!patterns[msg]) {
            patterns[msg] = { count: 0, tenants: new Set(), last_seen: row.created_at };
        }
        patterns[msg].count++;
        patterns[msg].tenants.add(row.tenant);
    }
    const reportsDir = path_1.default.join(__dirname, '../../reports');
    if (!fs_1.default.existsSync(reportsDir)) {
        fs_1.default.mkdirSync(reportsDir, { recursive: true });
    }
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `logs-report-${tenant || 'global'}-${dateStr}.md`;
    const filepath = path_1.default.join(reportsDir, filename);
    let md = `# Reporte de Errores del Sistema - Faqture\n\n`;
    md += `Generado el: ${new Date().toISOString()}\n`;
    md += `Total de errores analizados: ${rows.length}\n`;
    if (tenant)
        md += `Filtro aplicado: Empresa = ${tenant}\n`;
    md += `\n## Patrones de Errores Encontrados\n\n`;
    const sortedPatterns = Object.entries(patterns).sort((a, b) => b[1].count - a[1].count);
    for (const [msg, data] of sortedPatterns) {
        md += `### 🔴 Error: ${msg}\n`;
        md += `- **Ocurrencias:** ${data.count}\n`;
        md += `- **Empresas Afectadas:** ${Array.from(data.tenants).join(', ')}\n`;
        md += `- **Última vez visto:** ${data.last_seen}\n`;
        const advice = getErrorAdvice(msg);
        if (advice) {
            md += `\n**💡 Análisis Automático CLI:**\n`;
            md += `- **Por qué sucede:** ${advice.causa}\n`;
            md += `- **Solución sugerida:** ${advice.solucion}\n`;
            md += `- **Instrucción para la IA:** ${advice.accion_ia}\n`;
        }
        else {
            md += `\n**💡 Análisis Automático CLI:**\n`;
            md += `- **Por qué sucede:** El CLI detectó un error inusual o nuevo que no está en el diccionario rápido.\n`;
            md += `- **Instrucción para la IA:** El error detectado es "${msg}". 1) Realiza un Análisis de Causa Raíz (RCA). 2) Identifica y explícale al usuario claramente si el error proviene internamente de Faqture (ej. Node.js, JSON mal formados) o si es un error devuelto por un sistema externo (Laravel/Pro o SUNAT). 3) Propón una solución para lo que se pueda arreglar dentro de Faqture. NUNCA escribas ni modifiques código inmediatamente; espera siempre la autorización y confirmación del usuario para proceder.\n`;
        }
        md += `\n---\n\n`;
    }
    fs_1.default.writeFileSync(filepath, md);
    if (isJson) {
        console.log(JSON.stringify({ success: true, filepath }));
    }
    else {
        console.log(`✅ Reporte generado exitosamente en: ${filepath}`);
    }
}
