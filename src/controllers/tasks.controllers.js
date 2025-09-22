const pool = require('../db')
const cron = require('node-cron');
const fs = require('fs');
const { setNewValues } = require('../libs/functions')
const { getBackup } = require('../libs/backup.libs');
const { uploadFile, searchFile, updateFile } = require('../libs/drive.libs');
const { sendAllDocsAllCompanies, sendAllAnulateDocsAllCompanies } = require('../libs/document.libs');

// ========== CLASE TASKMANAGER ==========
class TaskManager {
    constructor() {
        this.tasks = new Map();
    }

    async initializeTasks() {
        try {
            const activeTasks = await pool.query(`SELECT * FROM tasks WHERE on_off = true`);
            console.log(`Initializing ${activeTasks.rows.length} active tasks...`);

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

        const taskHandlers = {
            1: () => {
                console.log('----- taskDocs running ----- ');
                return sendAllDocsAllCompanies();
            },
            2: () => {
                console.log('----- taskDocsVoided running -----');
                return sendAllAnulateDocsAllCompanies();
            },
            3: () => {
                console.log('----- taskSummary running ----- ');
                // Aquí puedes agregar la lógica del summary cuando la tengas
                return Promise.resolve();
            },
            4: () => {
                console.log('----- taskbackup running ----- ');
                return getBackup();
            }
        };

        if (!taskHandlers[taskId]) {
            console.error(`No handler found for task ID: ${taskId}`);
            return false;
        }

        const task = cron.schedule(cronTime, async () => {
            try {
                await updateTaskState(taskId, 'E'); // En ejecución
                await taskHandlers[taskId]();       // Ejecuta la lógica correspondiente
                await updateTaskState(taskId, 'C'); // Completado
                console.log(`Task ${taskId} completed successfully`);
            } catch (error) {
                console.error(`Task ${taskId} error:`, error);
                await updateTaskState(taskId, 'F'); // Falló
            }
        }, {
            scheduled: false,
            timezone: "America/Lima"
        });

        this.tasks.set(taskId, task);
        task.start();
        console.log(`Task ${taskId} started with schedule: ${cronTime}`);
        return true;
    }

    stopTask(taskId) {
        const task = this.tasks.get(taskId);
        if (task) {
            task.stop();
            this.tasks.delete(taskId);
            console.log(`Task ${taskId} stopped and removed`);
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
}

// Instancia global del TaskManager
const taskManager = new TaskManager();

// ========== FUNCIONES API (MANTENIDAS IGUALES) ==========
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
        const response = await pool.query(`SELECT id_task, modified::text, name, state, on_off, time FROM tasks ORDER BY id_task`)
        res.json(response.rows);
    } catch (error) {
        console.log(error);
        res.json({ error });
    }
};

const createTask = async (req, res, next) => {
    try {
        const { name, state, on_off, time } = req.body
        const now = new Date()
        const valid = cron.validate(time);
        if (!valid) {
            return res.json({ success: false, message: "Error Time format" });
        }

        const response = await pool.query(
            `INSERT INTO tasks(created, modified, name, state, on_off, time) 
            VALUES ( $1, $2, $3, $4, $5, $6) RETURNING id_task`,
            [now, now, name, state, on_off, time]);

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

// ========== FUNCIÓN PRINCIPAL REFACTORIZADA ==========
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

// ========== FUNCIONES AUXILIARES (MANTENIDAS) ==========
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

// ========== NUEVA FUNCIÓN PARA INICIALIZAR ==========
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

// ========== NUEVA FUNCIÓN PARA OBTENER STATUS ==========
const getTasksStatus = async (req, res, next) => {
    try {
        const dbTasks = await pool.query(`SELECT id_task, name, on_off, state FROM public.tasks ORDER BY id_task`);

        const activeTasks = taskManager.getActiveTasks();

        const tasksWithStatus = dbTasks.rows.map(task => ({
            ...task,
            is_running: activeTasks.includes(task.id_task),
            in_memory: activeTasks.includes(task.id_task)
        }));

        res.json({
            success: true,
            tasks: tasksWithStatus,
            active_count: activeTasks.length
        });
    } catch (error) {
        res.json({ error: error.message });
    }
};

module.exports = {
    getTask,
    getTasks,
    createTask,
    updateTask,
    deleteTask,
    startStopTask,
    createBackup,
    updateTaskState,
    initializeTaskManager,  // NUEVA
    getTasksStatus,         // NUEVA
    taskManager,             // EXPORTAR PARA USO EXTERNO
    initTaskManager,         // NUEVA
};