const {Router} = require('express');

const router = Router();

const { getCompaniestByFilters, createCompany, 
    updateCompany, deleteCompany } = require('../controllers/companies.controllers')

router.get('/companies', getCompaniestByFilters)
router.post('/companies', createCompany)
router.put('/companies/:id', updateCompany)
router.delete('/companies/:id', deleteCompany)

module.exports = router;