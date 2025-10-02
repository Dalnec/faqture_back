const pool = require('../db')
const { ApiClient } = require('../libs/api.libs');
const { adaptGuiaTransportista } = require('../models/apiSunat/adaptGuiaTransportista');
const { ApiSunat } = require('./apiApiSunat.libs');
const { selectAllApiCompany } = require('./company.libs');
// const limit = require('p-limit');
// const limiter = limit(10);

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
        const docs = await pool.query(`SELECT id_document, cod_sale, serie, numero, json_format, response_send, response_anulate, states, external_id, type FROM ${tenant}.document WHERE serie=$1 AND numero=$2`, [serie, numero]);
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
const update_document_state = async (id, tenant, data) => {
    try {
        if (!id) { return false; }
        const now = new Date()
        const r = await pool.query(
            `UPDATE ${tenant}.document SET states=$1, modified=$2 WHERE id_document=$3
            RETURNING id_document, cod_sale, serie, numero, json_format, response_send, response_anulate, states, type, external_id `,
            [data.state, now, data.id]
        );
        if (!r.rowCount) { return false; }

        return r.rows[0];

    } catch (error) {
        console.log(error);
        return false;
    }
}

const update_returning_document = async (id, tenant, data) => {
    try {
        if (!id) { return false; }
        const now = new Date()
        const datos = JSON.stringify(data, null, 4)
        const r = await pool.query(
            `UPDATE ${tenant}.document SET states=$1, response_send=$2, modified=$3 WHERE id_document=$4
            RETURNING id_document, json_format, response_send, response_anulate, states, type, external_id`,
            [data.state, JSON.stringify(datos, null, 4), now, id]
        );
        if (!r.rowCount) { return false; }
        return r.rows[0];

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
    let doc = await select_document_by_serie_number(company.tenant, docu.serie_documento, docu.numero_documento);
    if (doc) {
        return JSON.parse(doc.response_send);
    }
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
    let result;
    // Esto funciona con la api externa APISUNAT
    // if (docu.type == '31') {
    // const apiSunat = new ApiSunat(`${company.external_api.apisunat.url}/personas/v1/sendBill`)
    // const format_doc = adaptGuiaTransportista(company, JSON.parse(docu.json_format))

    // result = await apiSunat.sendDocument(format_doc);

    // if (result.status === 'ERROR' || result.error) {
    //     result.state = 'X';
    //     if (result.message && result.message.search('Numeración repetida') > 0) {
    //         result.state = 'E';
    //     }
    // } else {
    //     result.state = 'E';
    //     result.data = { filename: format_doc.fileName };
    //     result.links = {
    //         xml: "",
    //         pdf: `${company.external_api.apisunat.url}/documents/${result.documentId}/getPDF/A4/${format_doc.fileName}.pdf`,
    //         cdr: ""
    //     }
    // }

    // result.external_id = docu.external_id
    // const doc = await update_document(docu.id_document, company.tenant, result);
    // if (!doc) result.state = 'U';
    // return result
    // }
    let url = `${company.url}/api/`;
    switch (docu.type) {
        case '09':
            url += 'dispatches';
            break;
        case '31':
            url += 'dispatch-carrier';
            break;
        default:
            url += 'documents';
            break;
    }

    const api = new ApiClient(url, token)
    result = await api.sendDocument(docu.json_format)

    if (!result.success) {
        result.state = 'X'; //Error de envio al PRO
        if (typeof result?.message === 'string') {
            if (result?.message?.search('ya se encuentra registrado') > 0) {
                result.state = 'E';
            }
        } else { // sometimes message is an object so show all messages
            const messages = Object.values(result.message).map(m => (Array.isArray(m) ? m.join(', ') : m)).join('; ');
            if (messages.search('ya se encuentra registrado') > 0) {
                result.state = 'E';
            }
        }
    } else {
        if (docu.states == 'S') // Cuando aun no fue declarado pero se debe anular.
            result.state = 'P'; // Pendiente de anulación
        else
            result.state = 'E';

        if (result.data.state_type_description == 'Rechazado')
            result.state = 'R';

        if (docu.type == '09') {
            result.state = 'Y'; // Guia enviada al pro mas no a sunat
        }
    }
    result.external_id = docu.external_id
    // Guardar nuevo estado del documento
    const boolupdated = await update_document(docu.id_document, company.tenant, result)
    if (!boolupdated)
        result.state = 'U'; // updating error

    return result;
}

// API EXTERNA APISUNAT
const getDocGuiaTransportista = async (company, docu) => {
    data = JSON.parse(docu.response_send)
    const apiSunat = new ApiSunat(`${company.external_api.apisunat.url}/documents/${data.documentId}/getById`)
    result = await apiSunat.getDocument();
    return result
}

const sendDispatch = async (company, docu) => {
    const external_id = docu.data.external_id
    const api = new ApiClient(`${company.url}/api/dispatches/send`, company.token)
    const result = await api.sendDocument({ external_id });
    result.state = 'E'; // Enviado de PRO a SUNAT
    if (!result.success) {
        result.state = 'X';
    }
    const doc = await update_document_state(docu.id_document, company.tenant, { id: docu.id_document, state: result.state })
    return { result, doc };
}
const checkDispatchStatusTicket = async (company, docu_response) => {
    const external_id = docu_response.data.external_id
    const api = new ApiClient(`${company.url}/api/dispatches/status_ticket`, company.token)
    const result = await api.sendDocument({ external_id });
    result.state = 'W'; // Guia consultada en SUNAT
    if (!result.success)
        result.state = 'X';
    if (result.data.state_type_id === '09')
        result.state = 'R';

    const doc = await update_returning_document(docu_response.id_document, company.tenant, result)
    return result;
}

const processDispatchStateN = async (company, docu) => {
    const result = await sendDoc(company, docu);
    console.log({ result });
    if (result?.message?.search('ya se encuentra registrado') > 0) {
        console.log('Documento ya registrado N');
        const doc = await select_document_by_id(docu.id_document, company.tenant);
        return { ...result, doc };
    }
    if (!result.success) {
        throw new Error("El documento no aceptado por PRO");
    }
    const doc = await select_document_by_id(docu.id_document, company.tenant);
    // return processDispatchStateY(company, doc);
    return { ...result, doc };
};

const processDispatchStateY = async (company, docu) => {
    const parsed = JSON.parse(docu.response_send);
    if (!parsed?.data?.external_id) {
        throw new Error("External ID no encontrado");
    }
    parsed.id_document = docu.id_document;
    const { result, doc } = await sendDispatch(company, parsed);
    if (!result.success) {
        throw new Error("Error al enviar Guia a SUNAT");
    }
    // return processDispatchStateE(company, doc);
    return { ...result, doc };
};

const processDispatchStateE = async (company, doc) => {
    const parsed = JSON.parse(doc.response_send);
    if (!parsed?.data?.external_id) {
        throw new Error("External ID no encontrado");
    }
    parsed.id_document = doc.id_document;
    return await checkDispatchStatusTicket(company, parsed);
};

const sendAllDocsPerCompany = async (company, docus) => {

    let result;
    let num_aceptados = 0;
    let num_error = 0;
    let num_rechazados = 0;
    let api;

    for (let docu of docus) {
        let url = `${company.url}/api/`;
        switch (docu.type) {
            case '09':
                url += 'dispatches';
                break;
            case '31':
                url += 'dispatch-carrier';
                break;
            default:
                url += 'documents';
                break;
        }
        api = new ApiClient(url, company.token)
        result = await api.sendDocument(docu.json_format)
        if (!result.success) {
            result.state = 'X';
            num_error += 1;

            if (typeof result?.message === 'string') {
                if (result?.message?.search('ya se encuentra registrado') > 0) {
                    result.state = 'E';
                }
            } else { // sometimes message is an object so show all messages
                const messages = Object.values(result.message).map(m => (Array.isArray(m) ? m.join(', ') : m)).join('; ');
                if (messages.search('ya se encuentra registrado') > 0) {
                    result.state = 'E';
                }
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
            if (docu.type == '09') {
                result.state = 'Y'; // Guia enviada al pro mas no a sunat
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
        if (company.state && company.url && company.token) {
            const docus = await select_all_documents(company.tenant)
            if (docus.length > 0) {
                let { num_aceptados, num_error, num_rechazados } = await sendAllDocsPerCompany(company, docus)
                console.log({
                    company: company.tenant,
                    message: 'Comprobantes Nuevos Enviados',
                    num_aceptados: `Aceptados ${num_aceptados}`,
                    num_rechazados: `Rechazados ${num_rechazados}`,
                    num_error: `Con Error ${num_error}`
                });
                console.log(`Processing company: ${company.tenant} with ${docus.length} documents`);
            } else {
                console.log(company.tenant, "no documents");
            }
        } else {
            console.log(company.tenant, "company blocked or missing url/token");
        }
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

// const getAllRejectedDocsAllCompanies = async () => {

//     const schemas = await selectAllApiCompany()
//     const queries = schemas.map(async schema => {
//         const { rows } = await pool.query(`SELECT id_document, TO_CHAR(date::DATE, 'yyyy-mm-dd') AS date, cod_sale, type, serie, numero, 
//         customer_number, customer, amount, states, json_format, response_send, response_anulate, id_company, external_id FROM ${schema.tenant}.document WHERE verified IS NOT TRUE AND  states = 'R';`)
//         return {
//             ...schema,
//             rows
//         }
//     });
//     return await Promise.all(queries)
//         .then(values => values.filter(v => v.rows.length > 0))
//     // .then(values => values.map(v => ({ count: v.rows.length, ...v })));
// };
const getAllRejectedDocsAllCompanies = async () => {
    try {
        const schemas = await selectAllApiCompany();

        if (!schemas || schemas.length === 0) {
            return [];
        }

        const results = await Promise.allSettled(
            schemas.map(async (schema) => {
                // Validar el nombre del schema por seguridad
                if (!/^[a-zA-Z0-9_]+$/.test(schema.tenant)) {
                    throw new Error(`Invalid schema name: ${schema.tenant}`);
                }

                const query = `
                SELECT id_document, TO_CHAR(date::DATE, 'yyyy-mm-dd') AS date, cod_sale, type, serie, numero, 
                        customer_number, customer, amount, states, json_format, response_send, response_anulate, 
                        id_company, external_id
                FROM ${schema.tenant}.document 
                WHERE verified IS NOT TRUE AND states = 'R'
                `;

                const { rows } = await pool.query(query);
                return { ...schema, rows };
            })
        );

        // Filtrar solo las respuestas exitosas con resultados
        const filtered = results
            .filter(r => r.status === 'fulfilled' && r.value.rows.length > 0)
            .map(r => r.value);

        return filtered;

    } catch (error) {
        console.error('Error en getAllRejectedDocsAllCompanies:', error);
        return [];
    }
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
    update_document_state,
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
    getDocGuiaTransportista,
    checkDispatchStatusTicket,
    sendDispatch,
    processDispatchStateN,
    processDispatchStateY,
    processDispatchStateE,
};