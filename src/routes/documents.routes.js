const {Router} = require('express');
const {verifyToken} = require("../middlewares/verifyToken");
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');

const router = Router();

const { getDocuments, getDocumentById, createDocument, 
    updateDocument, deleteDocument, getDocumentByFilters, getDocumentCustomers, getDocumentByFiltersReport, updateApiDocument, clearDocuments, createApiDocument, externalIdFormatNotaCredito } = require('../controllers/documents.controllers');

// router.get('/documents/:tenant', [verifyToken], getDocuments)
router.get('/documents/:tenant/:id', [verifyToken], getDocumentById)
router.get('/documents-filters/:tenant', [verifyToken], getDocumentByFilters)
router.post('/documents/:tenant', verifyLocalToken, createDocument)
router.put('/documents/:tenant/:id', updateDocument)
router.put('/documents/:tenant/api/:id', verifyLocalToken, updateApiDocument)
router.delete('/documents/:tenant/:id', [verifyToken], deleteDocument)
router.get('/documents-customers/:tenant', getDocumentCustomers)
router.post('/documents/clear/:tenant', [verifyToken], clearDocuments)
router.put('/documents/nota-credito-format/:tenant/:id', externalIdFormatNotaCredito)
// Pinche Zendita
router.get('/api/documents/:tenant', verifyLocalToken, getDocumentByFilters)
router.get('/api/documents/report/:tenant', getDocumentByFiltersReport)
router.post('/api/documents/:tenant', verifyLocalToken, createApiDocument)
router.put('/api/documents/:tenant/:id', verifyLocalToken, updateApiDocument)

module.exports = router;