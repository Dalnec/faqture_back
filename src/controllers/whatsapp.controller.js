const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode')

const sendMessages = async (req, res, next) => {}

const sendFiles = async (req, res, next) => {
    try {
        const number = req.body.number
        if (number.length != 9){
            return res.json({ success: false, message: "Number no Valid!"});
        }
        let mimetype;
        const client = req.clientWs
        const formated_number = `51${number}@c.us`
        const links = req.links
        for (let file in links){
            const attachment = await axios.get(links[file], {
                responseType: 'arraybuffer'
            }).then(response => {
                mimetype = response.headers['content-type'];
                return response.data.toString('base64');
            });
    
            const media = new MessageMedia(mimetype, attachment, `${req.filename}-${file}`);
    
            client.sendMessage(formated_number, media, {
                caption: file
            }).then(response => {
                console.log("Archivos Enviando!");
            }).catch(err => {
                console.log(err);
            });
        }
        

        return res.json({
            success: true,
            message: "Files Sent!",
        });

    } catch (error) {
        return res.json({ error: error.message });
    }
};


const sendFiles2 = (req, res) => {
    try {

        res.json({
            state: 'success',
            message: "Message Sent!",
            response: "",
        });

    } catch (error) {
        console.log("Error!", error);
    }
};

// const { Client, LocalAuth } = require('whatsapp-web.js');
const getQR = async (req, res) => {
    try {
        console.log("INIT");
        let init = false;
        let client = req.clientWs


        // client.on('ready', () => {
        //     console.log('Client is ready!');
        //     init = true
        //     console.log("LLEGO!!!!!");
        //     res.json({
        //         state: 'success',
        //         message: "Connection is Ready!",
        //     });
        // });


        console.log('No tenemos session guardada');
        let qr = await new Promise((resolve, reject) => {
            client.on('ready', () => {
                console.log('Client is ready!');
                init = true
                return res.json({
                    state: 'success',
                    message: "Connection is Ready!",
                });
            });

            client.on('qr', (qr) => {
                console.log("Generating QR Code!");
                qrcode.toDataURL(qr, function (err, code) {
                    if (err) {return res.json(err.message)}
                    return resolve(code)
                });
            })
            setTimeout(() => {
                return reject(new Error("QR event wasn't emitted in 15 seconds."))
            }, 20000)
        })

        return res.json({
            state: 'success',
            message: "New Session Created!",
            qr_url: qr
        });

    } catch (err) {
        return res.send(err.message)
    }
};

module.exports = { sendMessages, sendFiles, getQR }