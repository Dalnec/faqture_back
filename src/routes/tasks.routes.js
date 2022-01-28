const {Router} = require('express');

const router = Router();

const { getTask, getTasks, createTask, updateTask, deleteTask, startStopTask } = require('../controllers/tasks.controllers')

router.get('/tasks/:id', getTask)
router.get('/tasks', getTasks)
router.post('/tasks', createTask)
router.put('/tasks/:id', updateTask)
router.delete('/tasks/:id', deleteTask)
router.post('/tasks/startstop', startStopTask)

module.exports = router;