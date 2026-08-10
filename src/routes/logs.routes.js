const { Router } = require('express');
const { verifyToken } = require("../middlewares/verifyToken");
const { getSystemLogs, getReportsList, downloadReport, deleteAllReports, deleteReport, deleteSystemLogs, generateReport } = require('../controllers/logs.controllers');

const router = Router();

// Endpoint for the UI to fetch system logs
router.get('/system-logs', [verifyToken], getSystemLogs);
router.delete('/system-logs', [verifyToken], deleteSystemLogs);

// Endpoints for CLI reports
router.get('/system-logs/reports', [verifyToken], getReportsList);
router.post('/system-logs/reports/generate', [verifyToken], generateReport);
router.get('/system-logs/reports/:filename', [verifyToken], downloadReport);
router.delete('/system-logs/reports', [verifyToken], deleteAllReports);
router.delete('/system-logs/reports/:filename', [verifyToken], deleteReport);

module.exports = router;
