"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customersCommand = void 0;
const commander_1 = require("commander");
const db_1 = require("../db");
exports.customersCommand = new commander_1.Command('customers')
    .description('Consulta y gestión de empresas/clientes del sistema')
    .option('-t, --tenant <tenant>', 'Buscar detalles de una empresa específica por RUC')
    .option('-j, --json', 'Devuelve la salida en formato JSON puro (para pipes)')
    .action(async (options) => {
    try {
        if (options.tenant) {
            const query = `
          SELECT tenant, company, state 
          FROM public.company 
          WHERE tenant = $1
        `;
            const res = await db_1.pool.query(query, [options.tenant]);
            if (res.rows.length === 0) {
                if (options.json)
                    console.log(JSON.stringify({ error: `No se encontró la empresa con RUC: ${options.tenant}` }));
                else
                    console.log(`❌ No se encontró la empresa con RUC: ${options.tenant}`);
                return;
            }
            if (options.json) {
                console.log(JSON.stringify(res.rows[0]));
            }
            else {
                console.log(`\n🏢 Perfil de la Empresa:`);
                console.table(res.rows);
            }
        }
        else {
            const query = `
          SELECT tenant, company, state 
          FROM public.company 
          ORDER BY company ASC
        `;
            const res = await db_1.pool.query(query);
            if (options.json) {
                console.log(JSON.stringify(res.rows));
            }
            else {
                console.log(`\n🏢 Empresas Registradas en el Sistema (${res.rows.length}):`);
                console.table(res.rows.map(r => ({
                    RUC: r.tenant,
                    Nombre: r.company ? r.company.substring(0, 30) : 'Sin nombre',
                    Estado: r.state ? 'Activo' : 'Inactivo'
                })));
            }
        }
    }
    catch (error) {
        if (options.json) {
            console.error(JSON.stringify({ error: error.message || 'Error desconocido' }));
        }
        else {
            console.error('❌ Error consultando empresas:', error);
        }
        process.exit(1);
    }
});
