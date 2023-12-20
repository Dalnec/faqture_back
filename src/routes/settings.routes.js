const { Router } = require('express');
const { verifyToken } = require("../middlewares/verifyToken");
const router = Router();

const { getSettings, updateSetting } = require('../controllers/settings.controllers')

router.get('/settings', getSettings)
router.put('/settings/:id', updateSetting)
// router.post('/companies/clear/:id', [verifyToken], clearCompanyDocs)

module.exports = router;