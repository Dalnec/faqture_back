const { select_document_by_external_id, select_document_by_serie_number } = require("../libs/document.libs")

const verifyDocWsp = async (req, res, next) => {
    try {
        const { tenant, external_id } = req.params
        const doc = await select_document_by_external_id(external_id, tenant)
        if (!doc) {
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

const verifyNumSerieWsp = async (req, res, next) => {
    try {
        const { tenant } = req.params
        const { serie, number } = req.body
        const doc = await select_document_by_serie_number(tenant, serie, number)
        if (!doc) {
            return res.status(404).json({
                error: 'Document Not Found!'
            })
        }
        if (doc.states == 'E' && doc.response_send) {
            const response_send = JSON.parse(doc.response_send);
            const sale = JSON.parse(doc.json_format);
            req.body.links = response_send.links
            req.body.filename = response_send.data.filename
            req.body.serie = `${sale.serie_documento}-${sale.numero_documento}`
            req.body.date = `${sale.fecha_de_emision}`
            req.body.number = sale.datos_del_cliente_o_receptor.numero_documento
            req.body.customer = sale.datos_del_cliente_o_receptor.apellidos_y_nombres_o_razon_social
            req.body.phone = sale.datos_del_cliente_o_receptor.telefono || '99999999'
            req.body.total = sale.totales.total_venta.toFixed(2);
            return next()
        }
        return res.status(403).send({ success: false, message: `Estado del Comprobante es ${doc.states}`, });
    } catch (e) {
        console.log(e)
        return res.status(409).send({ error: e })
    }
}

module.exports = {
    verifyDocWsp,
    verifyNumSerieWsp
}