const { select_document_by_external_id } = require("../libs/document.libs")

const verifyDocWsp = async (req, res, next) => {
    try {
        const {tenant, external_id} = req.params        
        const doc = await select_document_by_external_id(external_id, tenant)
        if (!doc){
            res.status(409).json({
                error: 'No external_id'
            })
        }
        if (doc.states == 'E' && doc.response_send) {
            const response_send = JSON.parse(doc.response_send);
            req.links = response_send.links
            req.filename = response_send.data.filename
            next()
        }
    } catch (e) {
        console.log(e)
        res.status(409)
        res.send({ error: 'Client Error' })
    }

}

module.exports = {
    verifyDocWsp
}