const { Router } = require('express');
const { verifyToken } = require("../middlewares/verifyToken");
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');

const router = Router();

const { sendDocumentAll, sendDocument, anulateDocument, anulateDocumentAll, verifyExternalIds, verifyMySqlConnection, consultAnulateDocument, consultAnulateDocumentAll, getCustomerData, validateSalesRange, validateSunatSingle, validateProSingle, forceSendProToSunat, validateUnifiedSingle, getCompanyErrorDocuments, repairBadGateways, createCreditNotesForExpired } = require('../controllers/api.controllers');

router.post('/api-documents', sendDocument)
router.post('/api-documents-all', sendDocumentAll)
router.post('/api-documents/voided', anulateDocument)
router.post('/api-documents-all/voided', anulateDocumentAll)
router.post('/api-documents/voided/consult', consultAnulateDocument)
router.post('/api-documents-all/voided/consult', consultAnulateDocumentAll)
router.post('/api-documents/validate-sunat-single', validateSunatSingle)
router.post('/api-documents/validate-pro-single', validateProSingle)
router.post('/api-documents/force-send-sunat-pro', forceSendProToSunat)
router.post('/api-documents/validate-unified', validateUnifiedSingle)
router.post('/api-documents/company-errors', getCompanyErrorDocuments)
router.post('/api-documents/create-credit-notes-expired', verifyToken, createCreditNotesForExpired)
router.post('/api-documents/verify', verifyExternalIds)
router.post('/api-documents/repair-bad-gateways', repairBadGateways)
router.get('/api-documents/verify-conn', verifyMySqlConnection)
router.get('/api/ruc/:ruc', getCustomerData)
router.post('/sales/:tenant/validate-range', verifyLocalToken, validateSalesRange)

module.exports = router;