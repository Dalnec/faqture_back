const {Router} = require('express');
const {verifyToken} = require("../middlewares/verifyToken");
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');

const router = Router();

const { sendDocument, anulateDocument } = require('../controllers/api.controllers');

// router.post('/api-documents/:tenant', [verifyToken], getDocuments)
// router.post('/api-documents/:tenant', [verifyToken], getDocumentById)

router.post('/api-documents', sendDocument)
router.post('/api-documents/voided', anulateDocument)

module.exports = router;