const pool = require('../db')
const cron = require('node-cron');
const { setNewValues } = require('../libs/functions')
let taskBackup;


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
        const response = await pool.query(`SELECT id_task, modified::text, name, state, on_off, time FROM tasks`)
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



const setTask = (time) => {
    console.log("setting taskbackup");
    taskBackup = cron.schedule(time, () => {
        console.log('stopped task');
    }, {
        scheduled: false,
        timezone: "America/Lima"
    });
};


const startStopTask = async (req, res, next) => {
    try {
        const id = parseInt(req.body.id);
        // finds the scheduler db
        const scheduler = await pool.query(`SELECT * FROM tasks WHERE id_task=$1`, [id])

        // checks whether there is a scheduler or not
        if (!scheduler.rowCount) {
            return res.json({
                error: 'No scheduler found.'
            });
        }

        // checks if the scheduler is already running or not. If it is then it stops the scheduler
        if (scheduler.rows[0].on_off) {
            // scheduler stopped
            taskBackup.stop();
            updateTaskOnOff(id, false);

            return res.json({
                success: true,
                message: 'Scheduler stopped!'
            });
        }

        // starts the scheduler
        setTask(scheduler.rows[0].time);
        taskBackup.start();
        updateTaskOnOff(id, true);

        res.json({
            success: true,
            message: 'Scheduler started!'
        });
    } catch (error) {
        res.json({ error: error.message });
    }
};

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


module.exports = { getTask, getTasks, createTask, updateTask, deleteTask, startStopTask }