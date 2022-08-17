const { select_document_by_external_id } = require("../libs/document.libs")

const verifyDocWsp = async (req, res, next) => {
    try {
        const {tenant, external_id} = req.params        
        const doc = await select_document_by_external_id(external_id, tenant)
        if (!doc){
            return res.status(403).json({
                error: 'No external_id'
            })
        }
        if (doc.states == 'E' && doc.response_send) {
            const response_send = JSON.parse(doc.response_send);
            req.links = response_send.links
            req.filename = response_send.data.filename
            return next()
        }
        return res.status(403).send({ success: false, message: `Estado del Comprobante es ${doc.states}`, });
    } catch (e) {
        console.log(e)
        return res.status(409).send({ error: e })
    }
}

const verifyCreateDocument = async (req, res, next) => {
    try {
        // const tenant = req.params.tenant;
        // const document = req.body

        // const { id_venta, serie_documento, numero_documento } = document

        // const doc = await select_document_by_external_id(external_id, tenant)
        // if (!doc){
        //     return res.status(403).json({
        //         error: 'No external_id'
        //     })
        // }





        // if (doc.states == 'E' && doc.response_send) {
        //     const response_send = JSON.parse(doc.response_send);
        //     req.links = response_send.links
        //     req.filename = response_send.data.filename
        //     return next()
        // }
        // return res.status(403).send({ success: false, message: `Estado del Comprobante es ${doc.states}`, });
    } catch (e) {
        console.log(e)
        return res.status(409).send({ error: e })
    }
}

module.exports = {
    verifyDocWsp,
    verifyCreateDocument
}