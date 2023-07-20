const { Router } = require('express');
const router = Router();

const { sendMessages, sendFiles, getCountries } = require('../controllers/whatsapp.controller');
const { verifyDocWsp, verifyNumSerieWsp } = require('../middlewares/verifyDocument');
const { verifyLocalToken } = require('../middlewares/verifyLocalToken');
const { verifyWsp } = require('../middlewares/verifyWhatsapp');


router.get('/wsp/countries', getCountries)
router.post('/wsp/send_message', [verifyWsp], sendMessages)
router.post('/wsp/send_files', sendMessages)
router.post('/documents/:tenant/wsp/:external_id',
    [verifyLocalToken, verifyDocWsp, verifyWsp],
    sendMessages)
router.post('/documents/:tenant/wsp',
    [verifyLocalToken, verifyNumSerieWsp, verifyWsp],
    sendFiles)

const multer = require('multer');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/")
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname)
    },
})
const upload = multer({ storage: storage });
const fs = require('fs');

router.post('/wsp/upload', upload.single('file'), function (req, res) {
    console.log(req.file);

    const file = req.file;
    const filePath = './' + file.originalname;

    fs.writeFile(filePath, file.buffer, (err) => {
        if (err) {
            console.error(err);
            res.sendStatus(500);
        } else {
            res.send('File uploaded and saved successfully');
        }
    });
})

module.exports = router;