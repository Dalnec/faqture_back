const { Router } = require('express');
const { verifyToken } = require("../middlewares/verifyToken");
const router = Router();

const { getCompanyId, getCompaniestByFilters, createCompany,
    updateCompany, deleteCompany, generateToken, getCompaniesList,
    leerExcel, clearCompanyDocs, disableAutoSendCompanies } = require('../controllers/companies.controllers')

/**
 * @swagger
 * /companies/{id}:
 *   get:
 *     summary: Obtiene información de una empresa
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la empresa
 *     responses:
 *       200:
 *         description: Éxito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: "Empresa X"
 *                 id:
 *                   type: string
 *                   example: "123"
 */
router.get('/companies/:id', getCompanyId)
router.get('/companies', getCompaniestByFilters)
router.post('/companies', createCompany)
router.put('/companies/:id', updateCompany)
router.delete('/companies/:id', deleteCompany)
router.post('/companies/generateToken', generateToken)
router.get('/companies-list', getCompaniesList)
router.post('/companies-excel', leerExcel)
router.post('/companies/clear/:id', [verifyToken], clearCompanyDocs)
router.post('/companies/disable-auto-send/all', disableAutoSendCompanies)

module.exports = router;