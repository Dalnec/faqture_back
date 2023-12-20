const pool = require('../db')
const { ApiClient } = require('../libs/api.libs');
const { selectAllApiCompany } = require('./company.libs');

const select_document_by_id = async (id, tenant) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format, response_send, response_anulate, states, type, external_id FROM ${tenant}.document WHERE id_document=$1`, [id]);
        if (!docs.rowCount) { return false; }
        return docs.rows[0];

    } catch (error) {
        console.log(error);
        return false;
    }
}

const select_document_by_external_id = async (external_id, tenant) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format, response_send, response_anulate, states, type, external_id FROM ${tenant}.document WHERE external_id=$1`, [external_id]);
        if (!docs.rowCount) { return false; }
        return docs.rows[0];

    } catch (error) {
        console.log(error);
        return false;
    }
}

const select_document_by_serie_number = async (tenant, serie, numero) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, cod_sale, json_format, response_send, response_anulate, states, external_id FROM ${tenant}.document WHERE serie=$1 AND numero=$2`, [serie, numero]);
        if (!docs.rowCount) { return false; }
        return docs.rows[0];

    } catch (error) {
        console.log(error);
        return false;
    }
}

const select_all_documents = async (tenant) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format, states FROM ${tenant}.document WHERE states in ('N', 'X', 'M', 'S') ORDER BY id_document limit 100`);
        if (!docs.rowCount) { return false; }
        return docs.rows;

    } catch (error) {
        console.log(error);
        return false;
    }
}

const select_all_responses = async (tenant) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format, response_send, states FROM ${tenant}.document WHERE response_send::text LIKE '%false%'`);
        if (!docs.rowCount) { return false; }
        return docs.rows;

    } catch (error) {
        console.log(error);
        return false;
    }
}

const select_all_documents_to_anulate = async (tenant) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format, states, response_send, type FROM ${tenant}.document WHERE states in ('P') ORDER BY id_document limit 50`);
        if (!docs.rowCount) { return false; }
        return docs.rows;

    } catch (error) {
        console.log(error);
        return false;
    }
}

const select_all_documents_to_consult_void = async (tenant) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format, states, response_send, response_anulate, type FROM ${tenant}.document WHERE states = 'C' ORDER BY id_document limit 50`);
        if (!docs.rowCount) { return false; }
        return docs.rows;

    } catch (error) {
        console.log(error);
        return false;
    }
}

const get_docs_month_filter = async (tenant, filters) => {
    try {
        if (!tenant && !filters) { return false; }
        const docs = await pool.query(`SELECT id_document, TO_CHAR(date::DATE, 'yyyy-mm-dd') AS date, cod_sale, type, serie, numero, 
        customer_number, customer, amount, states, json_format, response_send, response_anulate, id_company, external_id FROM ${tenant}.document 
        WHERE EXTRACT(YEAR FROM date)=${filters.year} AND EXTRACT(MONTH FROM date)=${filters.month} ORDER BY id_document DESC`);
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


const get_correlative_number = async (serie, tenant) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT numero FROM ${tenant}.document WHERE serie=$1 ORDER BY id_document DESC LIMIT 1`, [serie]);
        if (docs.rowCount == 0) {
            return 1;
        }

        return parseInt(docs.rows[0].numero) + 1;

    } catch (error) {
        console.log(error);
        return false;
    }
}


const formatAnulate = async (id, tenant) => {
    try {
        if (!id) { return false; }

        const r = await pool.query(`SELECT id_document, json_format, response_send, type FROM ${tenant}.document WHERE id_document = $1`, [id]);
        if (!r.rowCount) { return false; }

        const doc = JSON.parse(r.rows[0].json_format);
        const res = JSON.parse(r.rows[0].response_send);

        const format = {
            id_document: r.rows[0].id_document,
            fecha_de_emision_de_documentos: doc.fecha_de_emision,
            ...((r.rows[0].type == '03') && { codigo_tipo_proceso: '3' }),// codigo_tipo_proceso: '3',
            documentos: [
                {
                    external_id: res.data.external_id,
                    motivo_anulacion: 'Error en documento'
                }
            ]
        }
        return format;

    } catch (error) {
        return false;
    }
}


const formatAnulatePerCompany = async (tenant) => {
    try {
        if (!tenant) { return false; }

        const docs = await select_all_documents_to_anulate(tenant)
        if (docs.length <= 0) { return false; }

        let listformat = [];

        for (let doc of docs) {
            let docu = JSON.parse(doc.json_format);
            let res = JSON.parse(doc.response_send);
            let format = {
                id_document: doc.id_document,
                fecha_de_emision_de_documentos: docu.fecha_de_emision,
                ...((doc.type == '03') && { codigo_tipo_proceso: '3' }),// codigo_tipo_proceso: '3',
                // codigo_tipo_proceso: doc.type=='03' ? '3' : '1',
                documentos: [
                    {
                        external_id: res.data.external_id,
                        motivo_anulacion: 'Error en documento'
                    }
                ]
            }
            listformat.push(format);
        }

        return listformat;

    } catch (error) {
        console.log(error);
        return false;
    }
}


const sendDoc = async (company, docu) => {
    let token = company.token
    if (company.token_series && company.token_series.length > 0) {
        const sale = JSON.parse(docu.json_format)
        let branch = company.token_series.find(e => {
            return e.series.includes(sale.serie_documento)
        });
        if (branch) {
            token = branch.token
        }
    }
    const api = new ApiClient(`${company.url}/api/documents`, token)
    let result = await api.sendDocument(docu.json_format)

    if (!result.success) {
        result.state = 'X';
        if (result.message.search('ya se encuentra registrado') > 0) {
            result.state = 'E';
        }
    } else {
        if (docu.states == 'S')
            result.state = 'P';
        else
            result.state = 'E';

        if (result.data.state_type_description == 'Rechazado')
            result.state = 'R';
    }
    result.external_id = docu.external_id
    // Guardar nuevo estado del documento
    const doc = await update_document(docu.id_document, company.tenant, result)
    if (!doc)
        result.state = 'U'; // updating error

    return result;
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
            if (docu.states == 'S')
                result.state = 'P';
            else
                result.state = 'E';

            if (result.data.state_type_description == 'Rechazado') {
                result.state = 'R';
                num_rechazados += 1;
            }
            result.external_id = docu.external_id
            // Guardar nuevo estado del documento
            const doc = await update_document(docu.id_document, company.tenant, result)
            if (!doc)
                num_error += 1;
            num_aceptados += 1;
        }
    }

    return { num_aceptados, num_error, num_rechazados }
};

const consultAnulation = async (format, company) => {
    let api;
    if (typeof format == 'string') {
        format = JSON.parse(format)
    }
    if (format.type == '03') {
        api = new ApiClient(`${company.url}/api/summaries/status`, company.token)
    } else {
        api = new ApiClient(`${company.url}/api/voided/status`, company.token)
    }
    let res = await api.sendDocument(format.data)
    return res
}


const sendAllConsultVoidPerCompany = async (company, docs) => {
    let num_error = 0;
    let num_anulados = 0;
    let num_error_updating = 0;

    for (let doc of docs) {
        result = await consultAnulation(doc.response_anulate, company)
        if (result.success) {
            num_anulados += 1;
            result.state = 'A';
            let doc_consult = await update_document_anulate(doc.id_document, company.tenant, result)
            if (!doc_consult)
                num_error_updating += 1;
        } else {
            num_error += 1;
        }
    }
    return { num_anulados, num_error, num_error_updating }
};


const sendAllAnulateDocsPerCompany = async (company, api, apif, listformat) => {

    let result;
    let num_anulados = 0;
    let num_error = 0;

    for (let format of listformat) {
        if ('codigo_tipo_proceso' in format) {
            result = await api.sendDocument(format)
            result.type = '03'
        } else {
            result = await apif.sendDocument(format)
            result.type = '01'
        }
        if (!result.success) {
            result.state = 'Z'; //anulado con error
            num_error += 1;
        } else {
            num_anulados += 1;
            result.state = 'C';
            if (company.autosend) {
                consult_result = await consultAnulation(result, company)
                if (consult_result.success) {
                    result = consult_result;
                    result.state = 'A';
                }
            }
        }
        // Guardar nuevo estado del documento
        const doc = await update_document_anulate(format.id_document, company.tenant, result)
        if (!doc)
            num_error += 1;
    }

    return { num_anulados, num_error }
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


const sendAllAnulateDocsAllCompanies = async () => {
    let error = 0;
    const companies = await selectAllApiCompany()
    for (let company of companies) {
        const listformat = await formatAnulatePerCompany(company.tenant)
        if (listformat.length > 0) {
            for (let format of listformat) {
                let ext_id = JSON.parse(format).documentos[0].external_id
                //update state in API
                const api_doc = await update_doc_api(ext_id, company.url)

                if (api_doc)
                    error++
            }
            const api = new ApiClient(`${company.url}/api/summaries`, company.token)
            const apif = new ApiClient(`${company.url}/api/voided`, company.token)

            const { num_anulados, num_error } = await sendAllAnulateDocsPerCompany(company, api, apif, listformat)

            console.log({
                success: true,
                message: 'Comprobantes Enviados Anulados',
                num_anulados: `Anulados ${num_anulados}`,
                num_error: `Con Error ${num_error}`
            });
        }
        console.log(company.tenant, "No documents");
    }
};

const getAllRejectedDocsAllCompanies = async () => {

    const schemas = await selectAllApiCompany()
    const queries = schemas.map(async schema => {
        const { rows } = await pool.query(`SELECT id_document, TO_CHAR(date::DATE, 'yyyy-mm-dd') AS date, cod_sale, type, serie, numero, 
        customer_number, customer, amount, states, json_format, response_send, response_anulate, id_company, external_id FROM ${schema.tenant}.document WHERE verified IS NULL AND  states = 'R';`)
        return {
            ...schema,
            rows
        }
    });
    return await Promise.all(queries)
        .then(values => values.filter(v => v.rows.length > 0))
    // .then(values => values.map(v => ({ count: v.rows.length, ...v })));
};

const verifyingExternalIds = async (tenant, api) => {
    if (!tenant) { return false; }
    let num_aceptados = 0, num_rechazados = 0, num_por_anular = 0, num_anulados = 0
    // get docs without external_ids
    const docs = await select_all_responses(tenant);
    // console.log("verifying", docs);
    if (!docs) { return false; }
    // get dates to check
    const docsbydate = docs.filter((value, index, self) =>
        index === self.findIndex((t) => (
            JSON.parse(t.json_format).fecha_de_emision === JSON.parse(value.json_format).fecha_de_emision
        ))
    )

    const url = api.config.url;
    for await (let docdate of docsbydate) {
        // get docs from api
        let state;
        let state_actual = docdate.states;
        let date = JSON.parse(docdate.json_format).fecha_de_emision
        const apidocs = await api.getListDocumentByDate(`${url}${date}/${date}`);

        // apidocs.data.forEachAsync(element => {
        for await (let element of apidocs.data) {
            let d = docs.filter((e) => {
                let serie_num = `${JSON.parse(e.json_format).serie_documento}-${JSON.parse(e.json_format).numero_documento}`
                return serie_num == element.number
            });
            if (d[0]) {
                switch (element.state_type_id) {
                    case '11': //anulado
                        state = 'A'
                        num_anulados += 1
                        break;
                    case '05': //aceptado
                        state = 'E'
                        num_aceptados += 1
                        break;
                    case '13': //por anular
                        state = 'P'
                        num_por_anular += 1
                        break;
                    case '09': //rechazado
                        state = 'R'
                        num_rechazados += 1
                        break;
                    default:
                        state = ''
                        break;
                }
                let response_send = {
                    success: true,
                    data: {
                        number: element.number,
                        external_id: element.external_id,
                        state_type_id: element.state_type_id,
                        state_type_description: element.state_type_description,
                    },
                    links: {
                        xml: element.download_xml,
                        pdf: element.download_pdf,
                        cdr: element.download_cdr
                    },
                    state: (state_actual == 'P' && state == 'E') ? state = 'P' : state,
                    external_id: d[0].external_id
                }
                await update_document(d[0].id_document, tenant, response_send);
            }
        }//);
    }
    return { num_aceptados, num_rechazados, num_por_anular, num_anulados }
};

const countingDocsState = async (tenant) => {
    try {
        const counting = await pool.query(`SELECT count(states) FILTER (WHERE states = ANY ('{N, S, M}')) AS num_new
                                        , count(states) FILTER (WHERE states = 'P') AS num_void
                                        , count(states) FILTER (WHERE states = 'X') AS num_error
                                        , count(states) FILTER (WHERE states = 'C') AS num_void_consult
                                        , count(states) FILTER (WHERE states = 'Z') AS num_void_error
                                FROM ${tenant}.document;`);

        if (!counting.rowCount) {
            return false;
        }

        return counting.rows[0]

    } catch (error) {
        return false;
    }
}

module.exports = {
    select_document_by_id,
    select_all_documents,
    update_document,
    update_document_anulate,
    formatAnulate,
    formatAnulatePerCompany,
    sendAllDocsPerCompany,
    sendAllDocsAllCompanies,
    sendAllAnulateDocsPerCompany,
    verifyingExternalIds,
    sendAllAnulateDocsAllCompanies,
    sendDoc,
    countingDocsState,
    select_document_by_external_id,
    consultAnulation,
    select_all_documents_to_consult_void,
    sendAllConsultVoidPerCompany,
    select_document_by_serie_number,
    get_correlative_number,
    getAllRejectedDocsAllCompanies,
    get_docs_month_filter,
};