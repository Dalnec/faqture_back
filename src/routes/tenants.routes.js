const {Router} = require('express');

const router = Router();

const { getTenant, createTenant, deleteTenant } = require('../controllers/tenant.controllers')

router.get('/tenants', getTenant)
router.post('/tenants', createTenant)
router.delete('/tenants/:schema', deleteTenant)

module.exports = router;