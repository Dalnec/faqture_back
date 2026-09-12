const { Router } = require('express');
// const upload = multer();

const router = Router();

const { getTask, getTasks, createTask, updateTask, deleteTask, startStopTask, createBackup,
    destroyTask, getTasksStatus, initTaskManager,
    sendallDocumentsCompanies, triggerWhatsAppReport
} = require('../controllers/tasks.controllers')

const { getZendyChannels } = require('../controllers/zendy.controllers');

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
router.post('/tasks/send-all', sendallDocumentsCompanies)
router.post('/tasks/whatsapp-report', triggerWhatsAppReport);

// Rutas Zendy WhatsApp (API Pública Directa)
router.get('/zendy/channels', getZendyChannels);

module.exports = router;