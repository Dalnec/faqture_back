const { Router } = require('express');
const { verifyToken } = require("../middlewares/verifyToken");
const { getSystemLogs } = require('../controllers/logs.controllers');

const router = Router();

// Endpoint for the UI to fetch system logs
router.get('/system-logs', [verifyToken], getSystemLogs);

module.exports = router;
