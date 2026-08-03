const { Router } = require('express');
const { verifyToken } = require("../middlewares/verifyToken");
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');

const router = Router();

const { getDocuments, getDocumentById, createDocument, updateDocument, deleteDocument, getDocumentByFilters,
    getDocumentCustomers, getDocumentByFiltersReport, updateApiDocument, clearDocuments, createApiDocument,
    externalIdFormatNotaCredito, getXML, getXMLByTenant, getCDRByTenant, getXMLByTenant2, reportDocuments, getRejected, reports,
    updateJsonFormat, verifyDocumentBySerieNumber, reportConcar, reportContaSisCorp,
    verifyDispatchesStatusTicket, nullifyDocument, sendallDocumentsCompanies, verifyDocumentsRangeSunat } = require('../controllers/documents.controllers');
const { verifyCompanyByTenant } = require('../middlewares/company.middleware');

router.get('/documents/:tenant/xml/', getXMLByTenant)
router.get('/documents/:tenant/cdr/', getCDRByTenant)
// router.get('/documents/:tenant', [verifyToken], getDocuments)
router.get('/documents/:tenant/:id', [verifyToken], getDocumentById)
router.get('/documents-filters/:tenant', [verifyToken], getDocumentByFilters)
router.post('/documents/:tenant/nullify', verifyLocalToken, nullifyDocument)
router.post('/documents/:tenant', verifyLocalToken, createDocument)
router.put('/documents/:tenant/:id', updateDocument)
router.put('/documents/:tenant/api/:id', verifyLocalToken, updateApiDocument)
router.delete('/documents/:tenant/:id', [verifyToken], deleteDocument)
router.get('/documents-customers/:tenant', getDocumentCustomers)
router.post('/documents/clear/:tenant', [verifyToken], clearDocuments)
router.put('/documents/nota-credito-format/:tenant/:id', externalIdFormatNotaCredito)
router.get('/documents/rejected', getRejected)
router.post('/documents/update/:tenant/json', updateJsonFormat)
router.post('/documents/:tenant/dispatch/status-ticket', verifyDispatchesStatusTicket)
/**
 * @swagger
 * /documents/{tenant}/verify:
 *   post:
 *     summary: Consulta externa de un documento
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant de la empresa
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serie:
 *                 type: string
 *                 example: "B001"
 *               number:
 *                 type: string
 *                 example: "100"
 *     responses:
 *       200:
 *         description: Documento verificado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */

router.post('/documents/:tenant/verify', verifyLocalToken, verifyDocumentBySerieNumber)

/**
 * @swagger
 * /documents/{tenant}/verify-range:
 *   post:
 *     summary: Consulta SUNAT para un rango de comprobantes
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant de la empresa
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serie:
 *                 type: string
 *                 example: "F001"
 *               numero_inicio:
 *                 type: integer
 *                 example: 1
 *               numero_fin:
 *                 type: integer
 *                 example: 20
 *               codigo_tipo_documento:
 *                 type: string
 *                 example: "01"
 *     responses:
 *       200:
 *         description: Rango validado correctamente
 */
router.post('/documents/:tenant/verify-range', verifyLocalToken, verifyDocumentsRangeSunat)
// Pinche Zendita
router.get('/api/documents/:tenant', verifyLocalToken, getDocumentByFilters)
router.get('/api/documents/report/:tenant', getDocumentByFiltersReport)
router.get('/api/documents/reports/:tenant', reports)
router.post('/api/documents/:tenant', verifyLocalToken, createApiDocument)
router.put('/api/documents/:tenant/:id', verifyLocalToken, updateApiDocument)

// router.get('/documents/:tenant/xml/:external_id', getXMLByTenant)
router.get('/api/documents/:tenant/xml/:external_id', getXMLByTenant2)
router.get('/downloads/document/xml', getXML)
router.get('/api/documents/report/accountant/:tenant', [verifyCompanyByTenant], reportDocuments)
router.get('/api/documents/report/concar/:type/:tenant', [verifyCompanyByTenant], reportConcar)
router.get('/api/documents/reports/contasiscorp/:tenant', [verifyLocalToken], reportContaSisCorp)

module.exports = router;