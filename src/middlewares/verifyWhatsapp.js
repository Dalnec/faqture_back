const { getClient, getClient2 } = require("../whatsapp");
const fs = require('fs');

const verifyWspClient = async (req, res, next) => {
    try {
        const client = await getClient2()
        if (!client) {
            console.log("Cliente no Iniciado")
            return res.status(204).json({ success: false, message: "NO WSP Session!" })
        }
        // if (client) {
            console.log("Cliente INICIADO")
            req.clientWs = client;
            return next()
        // }
        // console.log("Cliente no Iniciado")
        // return res.send({ success: false, message: "NO WSP Session!" })
        
    } catch (e) {
        console.log(e)
        return res.status(409).send({ error: 'Client Error' })
    }
}

const initClient = async (req, res, next) => {
    try {
        const client = await getClient()
        req.clientWs = client
        return next()

    } catch (e) {
        console.log(e)
        return res.status(204).send({ error: 'Error init client' })
    }

}

const verifyWspClient2 = async (req, res, next) => {
    try {
        let directoryPath = "./.wwebjs_auth"
        if (!fs.existsSync(directoryPath)) {
            return res.send({
                success: false,
                message: "Directory no found!",
            });
        }
        const client = await getClient2()
        req.clientWs = client
        return next()
        
    } catch (e) {
        console.log(e)
        return res.status(204).send({ error: 'Client Error' })
    }
}
module.exports = { verifyWspClient, initClient, verifyWspClient2 }