const {Router} = require('express');
// const upload = multer();

const router = Router();

const { getTask, getTasks, createTask, updateTask, deleteTask, startStopTask, createBackup, destroyTask } = require('../controllers/tasks.controllers')

router.get('/tasks/:id', getTask)
router.get('/tasks', getTasks)
router.post('/tasks', createTask)
router.put('/tasks/:id', updateTask)
router.delete('/tasks/:id', deleteTask)
router.post('/tasks/startstop', startStopTask)
router.post('/tasks/createbk', createBackup)
// router.post('/tasks/destroy', destroyTask)

module.exports = router;