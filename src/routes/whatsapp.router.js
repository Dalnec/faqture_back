const { Router } = require('express');
const router = Router();

const { sendMessages, sendFiles, getCountries } = require('../controllers/whatsapp.controller');
const { verifyDocWsp, verifyNumSerieWsp } = require('../middlewares/verifyDocument');
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');
const { verifyWsp } = require('../middlewares/verifyWhatsapp');


router.get('/wsp/countries', getCountries)
router.post('/wsp/send_message', [verifyWsp], sendMessages)
router.post('/wsp/send_files', sendMessages)


module.exports = router;