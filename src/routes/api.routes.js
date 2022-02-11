const {Router} = require('express');
const {verifyToken} = require("../middlewares/verifyToken");
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');

const router = Router();

const { sendDocumentAll, sendDocument, anulateDocument, anulateDocumentAll, verifyExternalIds } = require('../controllers/api.controllers');

// router.post('/api-documents/:tenant', [verifyToken], getDocuments)
// router.post('/api-documents/:tenant', [verifyToken], getDocumentById)

router.post('/api-documents', sendDocument)
router.post('/api-documents-all', sendDocumentAll)
router.post('/api-documents/voided', anulateDocument)
router.post('/api-documents-all/voided', anulateDocumentAll)
router.post('/api-documents/verify', verifyExternalIds)

module.exports = router;