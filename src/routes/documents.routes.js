const { Router } = require('express');
const { verifyToken } = require("../middlewares/verifyToken");
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');

const router = Router();

const { getDocuments, getDocumentById, createDocument, updateDocument, deleteDocument, getDocumentByFilters,
    getDocumentCustomers, getDocumentByFiltersReport, updateApiDocument, clearDocuments, createApiDocument,
    externalIdFormatNotaCredito, getXML, getXMLByTenant, reportDocuments, getRejected, reports, updateJsonFormat } = require('../controllers/documents.controllers');
const { verifyCompanyByTenant } = require('../middlewares/company.middleware');

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
router.get('/documents/rejected', getRejected)
router.post('/documents/update/:tenant/json', updateJsonFormat)
// Pinche Zendita
router.get('/api/documents/:tenant', verifyLocalToken, getDocumentByFilters)
router.get('/api/documents/report/:tenant', getDocumentByFiltersReport)
router.get('/api/documents/reports/:tenant', reports)
router.post('/api/documents/:tenant', verifyLocalToken, createApiDocument)
router.put('/api/documents/:tenant/:id', verifyLocalToken, updateApiDocument)

router.get('/documents/:tenant/xml/:external_id', getXMLByTenant)
router.get('/downloads/document/xml', getXML)
router.get('/api/documents/report/accountant/:tenant', [verifyCompanyByTenant], reportDocuments)

module.exports = router;