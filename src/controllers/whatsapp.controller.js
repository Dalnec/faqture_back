const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode')

const sendMessages = async (req, res, next) => {}
const sendFiles = async (req, res, next) => {
    try {
        const client = req.clientWs
        let mimetype;
        // const number = req.params.number
        const number = '51956455974@c.us'
        const links = req.links
        // const fileUrl = 'https://bahamas.faqture.com/downloads/document/xml/8ebe187f-e370-4a90-9707-38f255c04d43';
        for (let file in links){
            const attachment = await axios.get(links[file], {
                responseType: 'arraybuffer'
            }).then(response => {
                mimetype = response.headers['content-type'];
                return response.data.toString('base64');
            });
    
            const media = new MessageMedia(mimetype, attachment, `${req.filename}-${file}`);
    
            client.sendMessage(number, media, {
                caption: file
            }).then(response => {
                console.log("****************", response.data);
            }).catch(err => {
                console.log(err);
            });
        }
        

        res.json({
            state: 'success',
            message: "Message Sent!",
            response: "",
        });

    } catch (error) {
        res.json({ error: error.message });
        next();
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
                console.log("LLEGO!!!!!");
                res.json({
                    state: 'success',
                    message: "Connection is Ready!",
                });
            });

            // if (!init) {
            client.on('qr', (qr) => {
                console.log("LLEGO22222!!!!!");
                qrcode.toDataURL(qr, function (err, code) {
                    if (err) return res.send(err.message);

                    resolve(code)
                });
                console.log(code_qr);
            })
            setTimeout(() => {
                reject(new Error("QR event wasn't emitted in 15 seconds."))
            }, 20000)
            // client.initialize();
            // }
        })

        res.json({
            state: 'success',
            message: "New Session Created!",
            qr_url: qr
        });

    } catch (err) {
        res.send(err.message)
    }
};

module.exports = { sendMessages, sendFiles, getQR }