#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const logs_1 = require("./commands/logs");
const documents_1 = require("./commands/documents");
const customers_1 = require("./commands/customers");
const db_1 = require("./db");
const program = new commander_1.Command();
program
    .name('fq')
    .description('Faqture CLI - Herramienta Avanzada de Diagnóstico')
    .version('2.0.0');
program.addCommand(logs_1.logsCommand);
program.addCommand(documents_1.documentsCommand);
program.addCommand(customers_1.customersCommand);
// Comando de prueba de estado
program
    .command('status')
    .description('Verifica el estado del sistema y la base de datos')
    .action(async () => {
    try {
        const res = await db_1.pool.query('SELECT NOW()');
        console.log('✅ Conexión a Base de Datos: OK');
        console.log(`Hora del servidor DB: ${res.rows[0].now}`);
    }
    catch (e) {
        console.error('❌ Error de conexión:', e);
        process.exit(1);
    }
});
program.parseAsync(process.argv)
    .catch((err) => {
    console.error('❌ Error fatal en la ejecución del CLI:', err);
    process.exit(1);
})
    .finally(() => {
    // El pool se cierra globalmente una sola vez cuando el comando termina
    db_1.pool.end();
});
