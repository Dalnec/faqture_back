const { Router } = require('express');
// const upload = multer();

const router = Router();

const { getTask, getTasks, createTask, updateTask, deleteTask, startStopTask, createBackup,
    destroyTask, getTasksStatus, initTaskManager
} = require('../controllers/tasks.controllers')

router.get('/tasks/status', getTasksStatus);
router.get('/tasks/:id', getTask)
router.get('/tasks', getTasks)
router.post('/tasks', createTask)
router.put('/tasks/:id', updateTask)
router.delete('/tasks/:id', deleteTask)
router.post('/tasks/startstop', startStopTask)
router.post('/tasks/createbk', createBackup)
// router.post('/tasks/destroy', destroyTask)
router.post('/tasks/initialize', initTaskManager);

module.exports = router;