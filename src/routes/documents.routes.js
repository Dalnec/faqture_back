const {Router} = require('express');
const {verifyToken} = require("../middlewares/verifyToken");
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');

const router = Router();

const { getDocuments, getDocumentById, createDocument, 
    updateDocument, deleteDocument, getDocumentByFilters, getDocumentCustomers, getDocumentByFilters1, updateApiDocument, clearDocuments } = require('../controllers/documents.controllers');

router.get('/documents/:tenant', [verifyToken], getDocuments)
router.get('/documents/:tenant/:id', [verifyToken], getDocumentById)
router.get('/documents-filters/:tenant', [verifyToken], getDocumentByFilters)
router.get('/documents-filters1/:tenant', [verifyToken],getDocumentByFilters1)
router.post('/documents/:tenant', verifyLocalToken, createDocument)
router.put('/documents/:tenant/:id', updateDocument)
router.put('/documents/:tenant/api/:id', verifyLocalToken, updateApiDocument)
router.delete('/documents/:tenant/:id', [verifyToken], deleteDocument)
router.get('/documents-customers/:tenant', getDocumentCustomers)
router.post('/documents/clear/:tenant', [verifyToken], clearDocuments)

module.exports = router;