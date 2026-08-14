const pool = require('../src/db');
const fs = require('fs');

async function run() {
    try {
        const sql = fs.readFileSync('./database/patch_tasks_doc_types.sql', 'utf8');
        await pool.query(sql);
        console.log('Successfully executed patch_tasks_doc_types.sql');
        const res = await pool.query('SELECT id_task, name, doc_types FROM public.tasks ORDER BY id_task');
        console.log('Current tasks in DB:');
        console.table(res.rows);
    } catch (e) {
        console.error('Error executing patch:', e);
    } finally {
        process.exit(0);
    }
}
run();
