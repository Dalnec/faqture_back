const {Router} = require('express');

const router = Router();

const { getCompanyId, getCompaniestByFilters, createCompany, 
    updateCompany, deleteCompany, generateToken, getCompaniesList, leerExcel } = require('../controllers/companies.controllers')

router.get('/companies/:id', getCompanyId)
router.get('/companies', getCompaniestByFilters)
router.post('/companies', createCompany)
router.put('/companies/:id', updateCompany)
router.delete('/companies/:id', deleteCompany)
router.post('/companies/generateToken', generateToken)
router.get('/companies-list', getCompaniesList)
router.post('/companies-excel', leerExcel)

module.exports = router;