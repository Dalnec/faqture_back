const { getClient, getClient2 } = require("../whatsapp");

const verifyWspClient = async (req, res, next) => {
    try {
        const client = await getClient2()
        // if (!client) {
        //     console.log("Cliente no Iniciado")
        //     return res.status(401).json({ success: false, message: "NO WSP Session!" })
        // }
        if (client) {
            console.log("Cliente INICIADO")
            req.clientWs = client;
            return next()
        }
        console.log("Cliente no Iniciado")
        return res.status(401).json({ success: false, message: "NO WSP Session!" })
        
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
        return res.status(409).send({ error: 'Error init client' })
    }

}
module.exports = { verifyWspClient, initClient }