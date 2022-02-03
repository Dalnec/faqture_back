const pool = require('../db')
const { ApiClient } = require('../libs/api.libs');
const { selectAllApiCompany } = require('./company.libs');

const select_all_documents = async (tenant) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format FROM ${tenant}.document WHERE states in ('N', 'X', 'M') ORDER BY id_document limit 50`);
        if (!docs.rowCount) { return false; }
        return docs.rows;

    } catch (error) {
        console.log(error);
        return false;
    }
}

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


const sendAllDocsPerCompany = async (company, api, docus) => {

    let result;
    let num_aceptados = 0;
    let num_error = 0;
    let num_rechazados = 0;

    for (let docu of docus) {
        result = await api.sendDocument(docu.json_format)
        if (!result.success) {
            result.state = 'X';
            num_error += 1;

            if (result.message.search('ya se encuentra registrado') > 0) {
                result.state = 'E';
            }
            await update_document(docu.id_document, company.tenant, result)
        }
        else {
            result.state = 'E';
            if (result.data.state_type_description == 'Rechazado') {
                result.state = 'R';
                num_rechazados += 1;
            }
            // Guardar nuevo estado del documento
            const doc = update_document(docu.id_document, company.tenant, result)
            if (!doc)
                num_error += 1;
            num_aceptados += 1;
        }
    }

    return { num_aceptados, num_error, num_rechazados }
};



const sendAllDocsAllCompanies = async () => {
    
    const companies = await selectAllApiCompany()
    for (let company of companies) {
        const docus = await select_all_documents(company.tenant)
        if (docus.length > 0) {
            const api = new ApiClient(`${company.url}/api/documents`, company.token)
            let { num_aceptados, num_error, num_rechazados } = await sendAllDocsPerCompany(company, api, docus)
            console.log({ 
                company: company.tenant, 
                message: 'Comprobantes Nuevos Enviados',
                num_aceptados: `Aceptados ${num_aceptados}`,
                num_rechazados: `Rechazados ${num_rechazados}`,
                num_error: `Con Error ${num_error}`
            });
        }
        console.log(company.tenant, "no documents");
    }
};


module.exports = {
    select_all_documents,
    update_document,
    update_document_anulate,
    formatAnulate,
    sendAllDocsPerCompany,
    sendAllDocsAllCompanies,
};