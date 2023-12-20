const { Router } = require('express');
const { verifyToken } = require("../middlewares/verifyToken");
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');

const router = Router();

const { sendDocumentAll, sendDocument, anulateDocument, anulateDocumentAll, verifyExternalIds, verifyMySqlConnection, consultAnulateDocument, consultAnulateDocumentAll, getCustomerData } = require('../controllers/api.controllers');

router.post('/api-documents', sendDocument)
router.post('/api-documents-all', sendDocumentAll)
router.post('/api-documents/voided', anulateDocument)
router.post('/api-documents-all/voided', anulateDocumentAll)
router.post('/api-documents/voided/consult', consultAnulateDocument)
router.post('/api-documents-all/voided/consult', consultAnulateDocumentAll)
router.post('/api-documents/verify', verifyExternalIds)
router.get('/api-documents/verify-conn', verifyMySqlConnection)
router.get('/api/ruc/:ruc', getCustomerData)

module.exports = router;