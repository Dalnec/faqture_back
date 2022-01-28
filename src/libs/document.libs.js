const pool = require('../db')

const update_document = async (id, tenant, data) => {
    try {
        if (!id) { return false; }
        const now = new Date()
        const datos = JSON.stringify(data, null, 4)
        const r = await pool.query(`UPDATE ${tenant}.document SET states=$1, response_send=$2, modified=$3 WHERE id_document=$4`, [data.state, JSON.stringify(datos, null, 4), now, id]);
        if (!r.rowCount) { return false; }

        return true;

    } catch (error) {
        console.log(error);
        return false;
    }
}
const update_document_anulate = async (id, tenant, data) => {
    try {
        if (!id) { return false; }
        const now = new Date()
        const datos = JSON.stringify(data, null, 4)
        const r = await pool.query(`UPDATE ${tenant}.document SET states=$1, response_anulate=$2, modified=$3 WHERE id_document=$4`, [data.state, JSON.stringify(datos, null, 4), now, id]);
        if (!r.rowCount) { return false; }

        return true;

    } catch (error) {
        console.log(error);
        return false;
    }
}


const formatAnulate = async (id, tenant) => {
    try {
        if (!id) { return false; }

        const r = await pool.query(`SELECT json_format, response_send FROM ${tenant}.document WHERE id_document = $1`, [id]);
        if (!r.rowCount) { return false; }

        const doc = JSON.parse(r.rows[0].json_format);
        const res = JSON.parse(r.rows[0].response_send);
        const format = {
            fecha_de_emision_de_documentos: doc.fecha_de_emision,
            codigo_tipo_proceso: '3',
            documentos: [
                {
                    external_id: res.data.external_id,
                    motivo_anulacion: 'Error en documento'
                }
            ]
        }
        return JSON.stringify(format);

    } catch (error) {
        return false;
    }
}

module.exports = { update_document, update_document_anulate, formatAnulate };