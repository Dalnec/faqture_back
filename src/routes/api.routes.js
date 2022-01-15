const {Router} = require('express');
const {verifyToken} = require("../middlewares/verifyToken");
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');

const router = Router();

const { sendDocument } = require('../controllers/api.controllers');

// router.post('/api-documents/:tenant', [verifyToken], getDocuments)
// router.post('/api-documents/:tenant', [verifyToken], getDocumentById)

router.post('/api-documents', sendDocument)

module.exports = router;