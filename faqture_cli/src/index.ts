#!/usr/bin/env node
import { Command } from 'commander';
import { logsCommand } from './commands/logs';
import { documentsCommand } from './commands/documents';
import { customersCommand } from './commands/customers';
import { pool } from './db';

const program = new Command();

program
  .name('fq')
  .description('Faqture CLI - Herramienta Avanzada de Diagnóstico')
  .version('2.0.0');

program.addCommand(logsCommand);
program.addCommand(documentsCommand);
program.addCommand(customersCommand);

// Comando de prueba de estado
program
  .command('status')
  .description('Verifica el estado del sistema y la base de datos')
  .action(async () => {
    try {
      const res = await pool.query('SELECT NOW()');
      console.log('✅ Conexión a Base de Datos: OK');
      console.log(`Hora del servidor DB: ${res.rows[0].now}`);
    } catch (e) {
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
    pool.end();
  });
