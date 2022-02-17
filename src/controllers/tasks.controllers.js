const pool = require('../db')
const cron = require('node-cron');
const { setNewValues } = require('../libs/functions')
const { getBackup } = require('../libs/backup.libs');
const { sendAllDocsAllCompanies, sendAllAnulateDocsAllCompanies } = require('../libs/document.libs');
let taskBackup;
let taskDocs;
let taskDocsVoided;
let taskSummary;


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
        const id = req.params.id;
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
            VALUES ( $1, $2, $3, $4, $5, $6)`,
            [now, now, name, state, on_off, time]);

        res.json({
            success: true,
            message: "Task Created"
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
        const newData = setNewValues(req.body)
        const response = await pool.query(`UPDATE public.tasks SET ${newData}, modified=$1 WHERE id_task = $2`, [now, id]);

        // setTask(req.body.time);

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



const setTaskBackup = (time, res) => {
    taskBackup = cron.schedule(time, () => {
        // updateTaskState(4, 'E')
        console.log('taskbackup running ************ ');
        getBackup();
        // res.json({
        //     success: true,
        //     message: "Task Updated"
        // })
    }, {
        scheduled: false,
        timezone: "America/Lima"
    });
};
const setTaskDocuments = (time) => {
    taskDocs = cron.schedule(time, () => {
        // updateTaskState(1, E)
        console.log('taskDocs running ------------- ');
        sendAllDocsAllCompanies();
    }, {
        scheduled: false,
        timezone: "America/Lima"
    });
};
const setTaskDocumentsVoided = (time) => {
    taskDocsVoided = cron.schedule(time, () => {
        // updateTaskState(2, E)
        console.log('taskDocsVoided running ///////////// ');
        sendAllAnulateDocsAllCompanies()
    }, {
        scheduled: false,
        timezone: "America/Lima"
    });
};
const setTaskSummary = (time) => {
    taskSummary = cron.schedule(time, () => {
        // updateTaskState(3, E)
        console.log('taskSummary running ++++++++++++ ');
    }, {
        scheduled: false,
        timezone: "America/Lima"
    });
};


const startStopTask = async (req, res, next) => {
    let flag = true;
    try {
        const id = parseInt(req.body.id);
        // finds the scheduler db
        const scheduler = await pool.query(`SELECT * FROM tasks WHERE id_task=$1`, [id])
        // checks whether there is a scheduler or not
        if (!scheduler.rowCount) { return res.json({ error: 'No scheduler found.' }); }

        if (scheduler.rows[0].on_off) {
            const taskstate = updateTaskOnOff(id, false);
            if (!taskstate) { return res.json({ error: 'Task Updating Error!' }); }

            switch (scheduler.rows[0].id_task) {
                case 1:
                    updateTaskState(1, 'N')
                    taskDocs.stop(); delete taskDocs;
                    break;
                case 2:
                    updateTaskState(2, 'N')
                    taskDocsVoided.stop(); delete taskDocsVoided;
                    break;
                case 3:
                    updateTaskState(3, 'N')
                    taskSummary.stop(); delete taskSummary;
                    break;
                case 4:
                    updateTaskState(4, 'N')
                    taskBackup.stop(); delete taskBackup;
                    break;
                default:
                    console.log("DEFAULT");
                    break;
            }            
            
            return res.json({
                success: true,
                message: 'Task stopped!'
            });
        }

        switch (scheduler.rows[0].id_task) {
            case 1:
                updateTaskState(1, 'P')
                setTaskDocuments(scheduler.rows[0].time);
                taskDocs.start();
                break;
            case 2:
                updateTaskState(2, 'P')
                setTaskDocumentsVoided(scheduler.rows[0].time);
                taskDocsVoided.start();
                break;
            case 3:
                updateTaskState(3, 'P')
                setTaskSummary(scheduler.rows[0].time);
                taskSummary.start();
                break;
            case 4:
                updateTaskState(4, 'P')
                setTaskBackup(scheduler.rows[0].time);
                taskBackup.start();
                break;
            default:
                console.log("DEFAULT");
                break;
        }
        const taskstate = updateTaskOnOff(scheduler.rows[0].id_task, true);
        if (!taskstate) { return res.json({ error: 'Task Updating Error!' }); }

        res.json({
            success: true,
            message: 'Task started!'
        });
    } catch (error) {
        flag = false;
        res.json({ error: error.message });
    // } finally {
    //     if (!flag) {
    //         updateTaskOnOff(req.body.id, false);
    //     }
    }
};


// const destroyTask = async (req, res, next) => {
//     try {
//         const id = parseInt(req.body.id);

//         const scheduler = await pool.query(`SELECT * FROM tasks WHERE id_task=$1`, [id])
//         if (!scheduler.rowCount) { return res.json({ error: 'No task found.' }); }

//         if (!scheduler.rows[0].state) { return res.json({ error: 'No task activated.' }); }

//         switch (scheduler.rows[0].id_task) {
//             case 1:
//                 taskDocs.destroy();
//                 break;
//             case 2:
//                 taskDocsVoided.destroy();
//                 break;
//             case 3:
//                 taskSummary.destroy();
//                 break;
//             case 4:
//                 taskBackup.stop(); delete taskBackup;
//                 // taskBackup.destroy();
//                 break;
//             default:
//                 console.log("DEFAULT");
//                 break;
//         }

//         const taskstate = updateTaskState(scheduler.rows[0].id_task, false)
//         const taskon_off = updateTaskOnOff(scheduler.rows[0].id_task, false)
//         if (!taskstate && !taskon_off) { return res.json({ error: 'Task Updating Error!' }); }


//         res.json({
//             success: true,
//             message: `Task ${scheduler.rows[0].name} destroyed`
//         });
//     } catch (error) {
//         res.json({ error: error.message });
//         next();
//     }
// };


// Is the task running

const updateTaskOnOff = async (id, state) => {
    try {
        const now = new Date()
        console.log("on_off: ", state);
        const response = await pool.query(`UPDATE public.tasks SET on_off=$1, modified=$2 WHERE id_task = $3`, [state, now, id]);
        return true;
    } catch (error) {
        return false;
    }
};
const updateTaskState = async (id, state) => {
    try {
        const now = new Date()
        const response = await pool.query(`UPDATE public.tasks SET state=$1, modified=$2 WHERE id_task = $3`, [state, now, id]);
        return true;
    } catch (error) {
        return false;
    }
};

const createBackup = async (req, res, next) => {
    try {
        await getBackup();
        res.json({
            success: true,
            message: "Backup Created"
        })
    } catch (error) {
        res.json({ error: error.message });
        next();
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
    // destroyTask,
}