const {Router} = require('express');

const router = Router();

const { getDocuments, getDocumentById, createDocument, 
    updateDocument, deleteDocument, getDocumentByFilters } = require('../controllers/documents.controllers')

router.get('/documents', getDocuments)
router.get('/documents/:id', getDocumentById)
router.get('/documents_filters/:tenant', getDocumentByFilters)
router.post('/documents/:tenant', createDocument)
router.put('/documents/:id', updateDocument)
router.delete('/documents/:id', deleteDocument)

module.exports = router;