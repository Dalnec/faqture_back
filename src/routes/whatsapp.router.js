const {Router} = require('express');

const router = Router();

const {sendMessages, sendFiles, getQR, deleteAuthDirectory, getSendFiles} = require('../controllers/whatsapp.controller');
const { verifyDocWsp } = require('../middlewares/verifyDocument');
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');
const { verifyWspClient, initClient, verifyWspClient2 } = require('../middlewares/verifyWhatsapp');


router.post('/wsp/send_message', [verifyWspClient], sendMessages)
router.post('/documents/:tenant/wsp/:external_id', [verifyLocalToken, verifyDocWsp, verifyWspClient], sendFiles)
router.post('/wsp/send_files', sendFiles)
router.post('/wsp/init/delete_directory_session', [verifyWspClient2], deleteAuthDirectory)
router.post('/wsp/init', [initClient], getQR)
router.post('/wsp/sendfiles', [verifyWspClient], getSendFiles)

module.exports = router;