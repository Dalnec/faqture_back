const pool = require('../db')
const cron = require('node-cron');
const fs = require('fs');
const { setNewValues } = require('../libs/functions')
const { getBackup } = require('../libs/backup.libs');
const { uploadFile, searchFile, updateFile } = require('../libs/drive.libs');
const { sendAllDocsAllCompanies, sendAllAnulateDocsAllCompanies, consultAllAnulateDocsAllCompanies, verifyErrorDocsAllCompanies } = require('../libs/document.libs');
const { verifyCompanyPayments } = require('../libs/company.libs');
const { processSummariesAndPendingAllCompanies } = require('../libs/summary.libs');

// ========== CLASE TASKMANAGER MEJORADA ==========
class TaskManager {
    constructor() {
        this.tasks = new Map();
        this.executingTasks = new Set(); // Nuevo: rastrear tareas en ejecución
    }

    async initializeTasks() {
        try {
            // Resetear tareas que quedaron en estado 'E' (ejecutando) por reinicio
            await pool.query(`
                UPDATE tasks 
                SET state = 'N', modified = NOW() 
                WHERE state = 'E'
            `);
            console.log('⚠️ Reset interrupted tasks from previous session');

            // Asegurar que la tarea 7 (Verificar comprobantes con error) exista en la tabla
            const task7Check = await pool.query(`SELECT id_task FROM tasks WHERE id_task = 7`);
            if (task7Check.rows.length === 0) {
                await pool.query(`
                    INSERT INTO tasks (id_task, name, description, on_off, time, created, modified)
                    VALUES (7, 'Verificar Comprobantes con Error', 'Verificación y regularización automática de comprobantes con error (X, M, S, Z)', true, '*/10 * * * * *', NOW(), NOW())
                    ON CONFLICT (id_task) DO UPDATE 
                    SET name = EXCLUDED.name, description = EXCLUDED.description, on_off = EXCLUDED.on_off, time = EXCLUDED.time
                `);
            }

            // Iniciar solo las tareas que están marcadas como activas (on_off = true)
            const activeTasks = await pool.query('SELECT id_task, time FROM tasks WHERE on_off = true');
            console.log(`Found ${activeTasks.rows.length} active tasks to start`);

            for (const task of activeTasks.rows) {
                this.startTask(task.id_task, task.time);
            }
        } catch (error) {
            console.error('Error initializing tasks:', error);
        }
    }

    startTask(taskId, cronTime) {
        // Si ya existe una tarea con este ID, la detenemos primero
        if (this.tasks.has(taskId)) {
            this.stopTask(taskId);
        }

        const getTaskDocTypes = async (id) => {
            try {
                const r = await pool.query('SELECT doc_types FROM tasks WHERE id_task = $1', [id]);
                return r.rows[0]?.doc_types || ['01', '03', '07', '08'];
            } catch (e) {
                return ['01', '03', '07', '08'];
            }
        };

        const taskHandlers = {
            1: async () => {
                console.log('----- taskDocs running ----- ');
                const docTypes = await getTaskDocTypes(1);
                await sendAllDocsAllCompanies({ source: 'cron', docTypes });
            },
            2: async () => {
                console.log('----- taskDocsVoided running -----');
                const docTypes = await getTaskDocTypes(2);
                await sendAllAnulateDocsAllCompanies({ docTypes });
            },
            3: async () => {
                console.log('----- taskSummary running ----- ');
                const docTypes = await getTaskDocTypes(3);
                await consultAllAnulateDocsAllCompanies({ docTypes });
            },
            4: async () => {
                console.log('----- taskbackup running ----- ');
                await getBackup();
            },
            5: async () => {
                console.log('----- taskSummaryBoletas running ----- ');
                const docTypes = await getTaskDocTypes(5);
                await processSummariesAndPendingAllCompanies({ source: 'cron', docTypes });
            },
            6: async () => {
                console.log('----- taskVerifyPayments running ----- ');
                await verifyCompanyPayments();
            },
            7: async () => {
                console.log('----- taskVerifyErrorDocs running ----- ');
                const docTypes = await getTaskDocTypes(7);
                await verifyErrorDocsAllCompanies({ source: 'cron', docTypes });
            }
        };

        if (!taskHandlers[taskId]) {
            console.error(`No handler found for task ID: ${taskId}`);
            return false;
        }

        const task = cron.schedule(cronTime, async () => {
            // ✅ PREVENIR EJECUCIONES CONCURRENTES
            if (this.executingTasks.has(taskId)) {
                console.log(`⏭️ Task ${taskId} is still running, skipping this execution`);
                return;
            }

            this.executingTasks.add(taskId);
            const startTime = new Date();

            try {
                await updateTaskState(taskId, 'E'); // En ejecución
                console.log(`▶️ Task ${taskId} started at ${startTime.toISOString()}`);

                await taskHandlers[taskId]();       // Ejecuta la lógica correspondiente

                await updateTaskState(taskId, 'C'); // Completado
                const duration = ((new Date() - startTime) / 1000).toFixed(2);
                console.log(`✅ Task ${taskId} completed successfully in ${duration}s`);

            } catch (error) {
                console.error(`❌ Task ${taskId} error:`, error);
                await updateTaskState(taskId, 'F'); // Falló

                // Opcional: guardar el error en la DB
                await pool.query(
                    `UPDATE tasks SET last_error = $1, modified = NOW() WHERE id_task = $2`,
                    [error.message, taskId]
                );
            } finally {
                // ✅ SIEMPRE LIBERAR EL LOCK
                this.executingTasks.delete(taskId);
                const duration = ((new Date() - startTime) / 1000).toFixed(2);
                console.log(`⏹️ Task ${taskId} finished (total time: ${duration}s)`);
            }
        }, {
            scheduled: false,
            timezone: "America/Lima"
        });

        this.tasks.set(taskId, task);
        task.start();
        console.log(`✅ Task ${taskId} started with schedule: ${cronTime}`);
        return true;
    }

    stopTask(taskId) {
        const task = this.tasks.get(taskId);
        if (task) {
            task.stop();
            this.tasks.delete(taskId);

            // Si estaba ejecutándose, también remover del set
            if (this.executingTasks.has(taskId)) {
                console.log(`⚠️ Stopping task ${taskId} while it was executing`);
                this.executingTasks.delete(taskId);
            }

            console.log(`⏹️ Task ${taskId} stopped and removed`);
            return true;
        }
        return false;
    }

    updateTaskSchedule(taskId, newCronTime) {
        if (this.tasks.has(taskId)) {
            this.stopTask(taskId);
            return this.startTask(taskId, newCronTime);
        }
        return false;
    }

    getActiveTasks() {
        return Array.from(this.tasks.keys());
    }

    isTaskRunning(taskId) {
        return this.tasks.has(taskId);
    }

    isTaskExecuting(taskId) {
        return this.executingTasks.has(taskId);
    }

    // ✅ NUEVO: Manejo de cierre graceful
    async shutdown() {
        console.log('🛑 Shutting down TaskManager gracefully...');

        try {
            // 1. Detener todos los cron jobs
            for (let [taskId, task] of this.tasks.entries()) {
                task.stop();
                console.log(`Stopped task ${taskId}`);
            }

            // 2. Actualizar TODAS las tareas en ejecución para que no queden colgadas en 'E'
            if (this.executingTasks.size > 0) {
                const taskIds = Array.from(this.executingTasks);
                console.log(`Resetting executing tasks state: ${taskIds.join(', ')}`);

                const result = await pool.query(
                    `UPDATE tasks 
                 SET state = 'N', modified = NOW() 
                 WHERE id_task = ANY($1::int[])
                 RETURNING id_task, name`,
                    [taskIds]
                );

                console.log(`✅ Reset state to 'N' for ${result.rowCount} tasks (on_off preserved):`, result.rows);
            }

            // 3. Limpiar memoria
            this.tasks.clear();
            this.executingTasks.clear();

            console.log('✅ TaskManager shutdown complete');

        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            throw error; // Re-lanzar para que el proceso sepa que hubo un error
        }
    }
}

// Instancia global del TaskManager
const taskManager = new TaskManager();

// ✅ MANEJO DE SEÑALES DE CIERRE
/* Estas funciones capturan las señales del sistema operativo 
que indican que tu aplicación debe cerrarse, permitiendo 
hacer una limpieza ordenada antes de terminar. */
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    try {
        await taskManager.shutdown();
        console.log('👋 Goodbye!');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    try {
        await taskManager.shutdown();
        console.log('👋 Goodbye!');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// PM2 graceful shutdown
process.on('message', async (msg) => {
    if (msg === 'shutdown') {
        console.log('\n🛑 Received PM2 shutdown signal...');
        try {
            await taskManager.shutdown();
            console.log('👋 Goodbye!');
            process.exit(0);
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
});

// ========== FUNCIONES API ==========
const getTask = async (req, res, next) => {
    try {
        const id = req.params.id;
        const response = await pool.query(`SELECT * FROM tasks WHERE id_task=$1`, [id])
        res.json(response.rows[0]);
    } catch (error) {
        console.log(error);
        res.json({ error });
    }
};

const getTasks = async (req, res, next) => {
    try {
        const response = await pool.query(`SELECT id_task, modified::text, name, description, state, on_off, time, last_error, doc_types FROM tasks ORDER BY id_task`)
        res.json(response.rows);
    } catch (error) {
        console.log(error);
        res.json({ error });
    }
};

const createTask = async (req, res, next) => {
    try {
        const { name, state, on_off, time, doc_types } = req.body
        const now = new Date()
        const valid = cron.validate(time);
        if (!valid) {
            return res.json({ success: false, message: "Error Time format" });
        }

        const formattedDocTypes = doc_types ? (typeof doc_types === 'object' ? JSON.stringify(doc_types) : doc_types) : '["01", "03", "07", "08"]';

        const response = await pool.query(
            `INSERT INTO tasks(created, modified, name, state, on_off, time, doc_types) 
            VALUES ( $1, $2, $3, $4, $5, $6, $7) RETURNING id_task`,
            [now, now, name, state, on_off, time, formattedDocTypes]);

        const newTaskId = response.rows[0].id_task;

        // Si la tarea se crea como activa, la iniciamos inmediatamente
        if (on_off) {
            taskManager.startTask(newTaskId, time);
            await updateTaskState(newTaskId, 'P'); // Programada
        }

        res.json({
            success: true,
            message: "Task Created",
            taskId: newTaskId
        });

    } catch (error) {
        res.json({ error: error.message });
    }
};

const updateTask = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const now = new Date()
        const valid = cron.validate(req.body.time);
        if (!valid) {
            return res.json({ success: false, message: "Error Time format" });
        }

        // Obtener datos actuales de la tarea
        const currentTask = await pool.query(`SELECT * FROM tasks WHERE id_task=$1`, [id]);
        if (!currentTask.rowCount) {
            return res.json({ success: false, message: "Task not found" });
        }

        if (req.body.doc_types && typeof req.body.doc_types === 'object') {
            req.body.doc_types = JSON.stringify(req.body.doc_types);
        }

        const newData = setNewValues(req.body)
        const response = await pool.query(`UPDATE public.tasks SET ${newData}, modified=$1 WHERE id_task = $2`, [now, id]);

        // Si la tarea está activa y cambió el horario, actualizamos el schedule
        if (currentTask.rows[0].on_off && req.body.time && req.body.time !== currentTask.rows[0].time) {
            taskManager.updateTaskSchedule(id, req.body.time);
        }

        res.json({
            success: true,
            message: "Task Updated"
        })
    } catch (error) {
        console.log(error);
        res.json({ error });
    }
};

const deleteTask = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);

        // Detener la tarea si está corriendo
        taskManager.stopTask(id);

        await pool.query('DELETE FROM tasks where id_task = $1', [id]);
        res.json({
            success: true,
            message: "Task Deleted"
        })
    } catch (error) {
        res.json({ error: error.message });
        next();
    }
};

const startStopTask = async (req, res, next) => {
    try {
        const id = parseInt(req.body.id);

        // Buscar la tarea en la base de datos
        const scheduler = await pool.query(`SELECT * FROM tasks WHERE id_task=$1`, [id])
        if (!scheduler.rowCount) {
            return res.json({ error: 'No scheduler found.' });
        }

        const task = scheduler.rows[0];
        const isCurrentlyRunning = taskManager.isTaskRunning(id);

        if (task.on_off && isCurrentlyRunning) {
            // DETENER TAREA
            const success = taskManager.stopTask(id);
            if (!success) {
                return res.json({ error: 'Failed to stop task' });
            }

            await updateTaskOnOff(id, false);
            await updateTaskState(id, 'N'); // No activa

            return res.json({
                success: true,
                message: 'Task stopped!'
            });
        } else {
            // INICIAR TAREA
            const success = taskManager.startTask(id, task.time);
            if (!success) {
                return res.json({ error: 'Failed to start task' });
            }

            await updateTaskOnOff(id, true);
            await updateTaskState(id, 'P'); // Programada

            return res.json({
                success: true,
                message: 'Task started!'
            });
        }

    } catch (error) {
        console.error('Error in startStopTask:', error);
        res.json({ error: error.message });
    }
};

// ========== FUNCIONES AUXILIARES ==========
const updateTaskOnOff = async (id, state) => {
    try {
        const now = new Date()
        console.log("on_off: ", state);
        const response = await pool.query(`UPDATE public.tasks SET on_off=$1, modified=$2 WHERE id_task = $3`, [state, now, id]);
        return true;
    } catch (error) {
        console.error('Error updating task on_off:', error);
        return false;
    }
};

const updateTaskState = async (id, state) => {
    try {
        const now = new Date()
        const response = await pool.query(`UPDATE public.tasks SET state=$1, modified=$2 WHERE id_task = $3`, [state, now, id]);
        return true;
    } catch (error) {
        console.error('Error updating task state:', error);
        return false;
    }
};

const createBackup = async (req, res, next) => {
    try {
        const file_name = await getBackup();
        console.log(file_name)
        if (!file_name) {
            return res.status(403).json({ success: false, message: "Backup Error" })
        }

        await searchFile(file_name);

        return res.json({
            success: true,
            message: "Backup Created"
        })
    } catch (error) {
        res.json({ error: error.message });
        next();
    }
};

const initializeTaskManager = async () => {
    await taskManager.initializeTasks();
};

const initTaskManager = async (req, res, next) => {
    try {
        await initializeTaskManager();
        res.json({ success: true, message: "Task Manager Initialized" });
    } catch (error) {
        res.json({ error: error.message });
    }
};

// ✅ MEJORADO: Incluir información de ejecución
const getTasksStatus = async (req, res, next) => {
    try {
        const dbTasks = await pool.query(`
            SELECT id_task, name, on_off, state, time, modified::text, last_error 
            FROM public.tasks 
            ORDER BY id_task
        `);

        const activeTasks = taskManager.getActiveTasks();

        const tasksWithStatus = dbTasks.rows.map(task => ({
            ...task,
            is_scheduled: activeTasks.includes(task.id_task),
            is_executing: taskManager.isTaskExecuting(task.id_task),
            in_memory: activeTasks.includes(task.id_task)
        }));

        res.json({
            success: true,
            tasks: tasksWithStatus,
            scheduled_count: activeTasks.length,
            executing_count: taskManager.executingTasks.size
        });
    } catch (error) {
        res.json({ error: error.message });
    }
};

// boton de pruebas
const sendallDocumentsCompanies = async (req, res, next) => {
    try {
        await sendAllDocsAllCompanies({ source: 'manual' });
        return res.status(200).json({
            success: true,
            message: "Sent!",
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        })
    }
};

// Internal Cleanup Task (Runs daily at 3:00 AM)
cron.schedule('0 3 * * *', async () => {
    try {
        console.log('🧹 Running system_logs cleanup task...');
        const res = await pool.query(`DELETE FROM public.system_logs WHERE created_at < NOW() - INTERVAL '30 days'`);
        console.log(`✅ Cleaned ${res.rowCount} old logs.`);
    } catch (error) {
        console.error('❌ Error in cleanup task:', error);
    }
}, { timezone: "America/Lima" });


module.exports = {
    getTask,
    getTasks,
    createTask,
    updateTask,
    deleteTask,
    startStopTask,
    createBackup,
    updateTaskState,
    initializeTaskManager,
    getTasksStatus,
    taskManager,
    initTaskManager,
    sendallDocumentsCompanies,
};
