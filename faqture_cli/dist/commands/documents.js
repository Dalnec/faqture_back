"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentsCommand = void 0;
const commander_1 = require("commander");
const db_1 = require("../db");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.documentsCommand = new commander_1.Command('documents')
    .description('Consulta y gestión de comprobantes (ventas y anulaciones)')
    .option('-t, --tenant <tenant>', 'Filtrar por empresa (RUC/Nombre)')
    .option('-s, --status <status>', 'Filtrar por estado del comprobante (E, X, P, Z, N)')
    .option('-l, --limit <number>', 'Cantidad máxima a mostrar', '50')
    .option('-j, --json', 'Devuelve la salida en formato JSON puro (para pipes)')
    .option('-r, --report', 'Genera un reporte Markdown con los resultados')
    .action(async (options) => {
    try {
        const limit = parseInt(options.limit, 10);
        let tenantsToQuery = [];
        if (options.tenant) {
            tenantsToQuery.push(options.tenant);
        }
        else {
            const companies = await db_1.pool.query('SELECT tenant FROM public.company WHERE tenant IS NOT NULL');
            tenantsToQuery = companies.rows.map(r => r.tenant);
        }
        const allResults = [];
        for (const tenant of tenantsToQuery) {
            let query = `SELECT id_document, type, serie, states, date FROM ${tenant}.document`;
            const params = [];
            if (options.status) {
                query += ` WHERE states = $1`;
                params.push(options.status);
            }
            query += ` ORDER BY date DESC LIMIT $${params.length + 1}`;
            params.push(limit);
            try {
                const res = await db_1.pool.query(query, params);
                for (const row of res.rows) {
                    allResults.push({
                        Empresa: tenant,
                        Tipo: row.type,
                        Serie: row.serie,
                        Estado: row.states,
                        Emision: row.date ? new Date(row.date).toISOString().split('T')[0] : 'N/A'
                    });
                }
            }
            catch (e) {
                // Skip if schema doesn't exist
            }
        }
        if (allResults.length === 0) {
            if (options.json)
                console.log(JSON.stringify([]));
            else
                console.log('📭 No se encontraron comprobantes con esos filtros.');
            return;
        }
        // If querying all tenants, group and sort or just show top
        allResults.sort((a, b) => new Date(b.Emision).getTime() - new Date(a.Emision).getTime());
        const finalResults = allResults.slice(0, limit);
        if (options.json) {
            console.log(JSON.stringify(finalResults));
        }
        else if (options.report) {
            const reportsDir = path_1.default.join(__dirname, '../../reports');
            if (!fs_1.default.existsSync(reportsDir)) {
                fs_1.default.mkdirSync(reportsDir, { recursive: true });
            }
            const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `documents-report-${options.tenant || 'global'}-${dateStr}.md`;
            const filepath = path_1.default.join(reportsDir, filename);
            let md = `# Reporte de Comprobantes - Faqture\n\n`;
            md += `Generado el: ${new Date().toISOString()}\n`;
            if (options.tenant)
                md += `**Empresa:** ${options.tenant}\n`;
            if (options.status)
                md += `**Estado Filtrado:** ${options.status}\n`;
            md += `\n## Detalle de Comprobantes\n\n`;
            md += `| Empresa | Tipo | Serie | Estado | Emisión |\n`;
            md += `|---------|------|-------|--------|---------|\n`;
            finalResults.forEach(r => {
                md += `| ${r.Empresa} | ${r.Tipo} | ${r.Serie} | ${r.Estado} | ${r.Emision} |\n`;
            });
            if (options.status && !options.tenant) {
                const summary = {};
                allResults.forEach(r => {
                    summary[r.Empresa] = (summary[r.Empresa] || 0) + 1;
                });
                md += `\n## Resumen de comprobantes en estado '${options.status}'\n\n`;
                md += `| Empresa | Cantidad |\n`;
                md += `|---------|----------|\n`;
                const summaryArray = Object.entries(summary).map(([empresa, cantidad]) => ({ Empresa: empresa, Cantidad: cantidad }));
                summaryArray.sort((a, b) => b.Cantidad - a.Cantidad);
                summaryArray.forEach(s => {
                    md += `| ${s.Empresa} | ${s.Cantidad} |\n`;
                });
            }
            fs_1.default.writeFileSync(filepath, md);
            console.log(`✅ Reporte generado exitosamente en: ${filepath}`);
        }
        else {
            console.log(`\n📄 Comprobantes Encontrados (Mostrando ${finalResults.length}):`);
            console.table(finalResults);
            if (options.status && !options.tenant) {
                // Show summary by tenant
                const summary = {};
                allResults.forEach(r => {
                    summary[r.Empresa] = (summary[r.Empresa] || 0) + 1;
                });
                console.log(`\n📊 Resumen de comprobantes en estado '${options.status}':`);
                const summaryArray = Object.entries(summary).map(([empresa, cantidad]) => ({ Empresa: empresa, Cantidad: cantidad }));
                summaryArray.sort((a, b) => b.Cantidad - a.Cantidad);
                console.table(summaryArray);
            }
        }
    }
    catch (error) {
        console.error('❌ Error consultando comprobantes:', error);
        process.exit(1);
    }
});
