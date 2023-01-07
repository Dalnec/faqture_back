const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode')
const fs = require('fs');


const sendMessages = async (req, res, next) => { }

const sendFiles = async (req, res, next) => {
    try {
        const number = req.body.number.trim()
        if (number.length != 9) {
            return res.status(204).json({ success: false, message: "Number no Valid!" });
        }
        let mimetype;
        let success = false;

        const client = req.clientWs
        const formated_number = `51${number}@c.us`
        const links = req.links

        for (let file in links) {
            if (file !== 'cdr') {                
                const attachment = await axios.get(links[file], {
                    responseType: 'arraybuffer'
                }).then(response => {
                    mimetype = response.headers['content-type'];
                    return response.data.toString('base64');
                });
    
                const media = new MessageMedia(mimetype, attachment, `${req.filename}-${file}`);
    
                await client.sendMessage(formated_number, media, {
                    caption: file
                }).then(response => {
                    console.log("Archivos Enviando!");
                    success = true;
                }).catch(err => {
                    console.log(err);
                });
            }
        }

        if (!success) {
            return res.status(204).json({
                success: false,
                message: "Error sending files!",
            });
        }
        return res.status(200).json({
            success: true,
            message: "Files Sent!",
        });

    } catch (error) {
        return res.json({ error: error.message });
    }
};


const getSendFiles = async (req, res, next) => {
    try {

        const number = req.body.number.trim()
        if (number.length != 9) {
            return res.status(204).json({ success: false, message: "Number no Valid!" });
        }
        let mimetype;
        let success = false;

        const client = req.clientWs
        const formated_number = `51${number}@c.us`
        const files = req.body.files

        for (let file in files) {
            console.log(file);
            const base64Str = Buffer.from(file, 'utf8').toString('base64');
            const media = new MessageMedia("application/pdf", file, "hehe");

            await client.sendMessage(formated_number, media, {
                caption: file
            }).then(response => {
                console.log("Archivos Enviando!");
                success = true;
            }).catch(err => {
                console.log(err);
            });
        }

        if (!success) {
            return res.status(204).json({
                success: false,
                message: "Error sending files!",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Files Sent!",
        });

    } catch (error) {
        console.log("Error!", error);
    }
};

// const { Client, LocalAuth } = require('whatsapp-web.js');
const getQR = async (req, res) => {
    try {
        console.log("INIT");
        let client = req.clientWs

        console.log('No tenemos session guardada');
        let {qr, ready} = await new Promise((resolve, reject) => {

            client.on('ready', () => {
                console.log('Client is ready!');
                return resolve({qr:"Ready", ready:true})
            });

            client.on('qr', (qr) => {
                console.log("Generating QR Code!");
                qrcode.toDataURL(qr, function (err, code) {
                    if (err) { return res.json(err.message) }
                    return resolve({qr:code, ready:false})
                });
            })
            setTimeout(() => {
                return reject(new Error("QR event wasn't emitted in 20 seconds."))
            }, 20000)
        })
        
        console.log(ready, qr);
        if (ready) {
            return res.send({
                state: 'success',
                message: "Connection is Ready!",
            });
        }       

        return res.send({
            state: 'success',
            message: "New Session Created!",
            qr_url: qr
        });

    } catch (err) {
        return res.send(err.message)
    }
};

const deleteAuthDirectory = (req, res) => {
    let directoryPath = "./.wwebjs_auth"
    const client = req.clientWs
    
    fs.rmSync(directoryPath, { recursive: true, force: true });
    client.destroy();
    return res.send({
        success: true,
        message: "Directory Deleted!"
    });
}

module.exports = { sendMessages, sendFiles, getSendFiles, getQR, deleteAuthDirectory }