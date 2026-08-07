"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anulationsCommand = void 0;
const commander_1 = require("commander");
const db_1 = require("../db");
exports.anulationsCommand = new commander_1.Command('anulations')
    .description('Gestión de bajas y anulaciones en SUNAT');
exports.anulationsCommand
    .command('pending')
    .description('Muestra la cantidad de anulaciones pendientes por empresa')
    .action(async () => {
    try {
        const companies = await db_1.pool.query('SELECT tenant FROM public.company WHERE tenant IS NOT NULL');
        const results = [];
        for (const row of companies.rows) {
            const tenant = row.tenant;
            try {
                const res = await db_1.pool.query(`
            SELECT states, COUNT(*) as total 
            FROM ${tenant}.document 
            WHERE states IN ('P', 'Z') 
            GROUP BY states
          `);
                for (const r of res.rows) {
                    results.push({ tenant, state: r.states, total: parseInt(r.total, 10) });
                }
            }
            catch (e) {
                // Schema or table might not exist
            }
        }
        if (results.length === 0) {
            console.log('✅ Cero anulaciones pendientes o en error. Todo está limpio.');
            return;
        }
        results.sort((a, b) => b.total - a.total);
        console.log('📊 Estado de Anulaciones Pendientes:\n');
        console.table(results.map(r => ({
            Empresa: r.tenant,
            Estado: r.state === 'P' ? 'Pendiente (P)' : 'Error (Z)',
            Cantidad: r.total
        })));
    }
    catch (error) {
        console.error('❌ Error consultando anulaciones:', error);
    }
    finally {
        await db_1.pool.end();
    }
});
exports.anulationsCommand
    .command('force')
    .description('Fuerza la ejecución del proceso de anulación sin esperar al CRON')
    .action(async () => {
    console.log('🚀 Iniciando proceso de envío de anulaciones a SUNAT...');
    try {
        // Importamos dinámicamente la función original del backend en JS
        const docLibs = require('../../src/libs/document.libs');
        if (docLibs.sendAllAnulateDocsAllCompanies) {
            await docLibs.sendAllAnulateDocsAllCompanies();
            console.log('✅ Proceso de anulaciones finalizado.');
        }
        else {
            console.error('❌ No se pudo encontrar la función sendAllAnulateDocsAllCompanies en el backend.');
        }
    }
    catch (error) {
        console.error('❌ Error forzando anulaciones:', error);
    }
    finally {
        // process.exit() is needed because the backend lib might leave the DB pool open
        process.exit(0);
    }
});
