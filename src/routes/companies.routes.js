const { Router } = require('express');
const { verifyToken } = require("../middlewares/verifyToken");
const router = Router();

const { getCompanyId, getCompaniestByFilters, createCompany,
    updateCompany, deleteCompany, generateToken, getCompaniesList,
    leerExcel, clearCompanyDocs, disableAutoSendCompanies } = require('../controllers/companies.controllers')

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