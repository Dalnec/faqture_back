const pool = require('../db')
const { ApiClient } = require('../libs/api.libs');
const { adaptGuiaTransportista } = require('../models/apiSunat/adaptGuiaTransportista');
const { ApiSunat } = require('./apiApiSunat.libs');
const { selectAllApiCompany, incrementCronAuthFailure, resetCronAuthFailure } = require('./company.libs');
const { update_doc_api } = require('./connection');
const { notifyError } = require('./logger');
const { validateVoucherOnSunat, formatDateForSunat, translateSunatStatus, SUNAT_STATUS_LABELS } = require('./sunatValidation.libs');
// const limit = require('p-limit');
// const limiter = limit(10);

const MAX_ADDRESS_LENGTH = 100;

const truncateAddress = (value) => {
    if (typeof value !== 'string') return value;
    return value.length > MAX_ADDRESS_LENGTH ? value.slice(0, MAX_ADDRESS_LENGTH) : value;
};

const isPseInstance = (url = '') => /\.pse\.tsi\.pe/.test(url || '');

const toDMY = (iso) => {
    if (typeof iso !== 'string') return iso;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
};

const isVoidedDocument = (type) => type !== '03';

const sanitizeGuiaFormat = (docu) => {
    if (!docu || (docu.type !== '09' && docu.type !== '31')) return docu.json_format;
    try {
        const json = JSON.parse(docu.json_format);
        if (json.direccion_llegada?.direccion) {
            json.direccion_llegada.direccion = truncateAddress(json.direccion_llegada.direccion);
        }
        if (json.direccion_partida?.direccion) {
            json.direccion_partida.direccion = truncateAddress(json.direccion_partida.direccion);
        }
        if (json.datos_del_cliente_o_receptor?.direccion) {
            json.datos_del_cliente_o_receptor.direccion = truncateAddress(json.datos_del_cliente_o_receptor.direccion);
        }
        if (json.datos_del_emisor?.direccion) {
            json.datos_del_emisor.direccion = truncateAddress(json.datos_del_emisor.direccion);
        }
        return JSON.stringify(json);
    } catch (error) {
        return docu.json_format;
    }
};

const select_document_by_id = async (id, tenant) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format, response_send, response_anulate, states, type, external_id, serie, numero, date, amount FROM ${tenant}.document WHERE id_document=$1`, [id]);
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

const buildTypeClause = (docTypes) => {
    if (Array.isArray(docTypes) && docTypes.length > 0) {
        const cleanTypes = docTypes.filter(t => /^[0-9a-zA-Z]+$/.test(t)).map(t => `'${t}'`);
        if (cleanTypes.length > 0) {
            return `type IN (${cleanTypes.join(',')})`;
        }
    }
    return "type <> '80'";
};

const select_all_documents = async (tenant, docTypes = null) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, cod_sale, serie, numero, json_format, states, type, response_send, external_id FROM ${tenant}.document WHERE states in ('N', 'X', 'M', 'S') AND ${buildTypeClause(docTypes)} ORDER BY id_document limit 100`);
        if (!docs.rowCount) { return false; }
        return docs.rows;

    } catch (error) {
        console.log(error);
        return false;
    }
}

const select_error_documents = async (tenant, docTypes = null) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, cod_sale, serie, numero, json_format, states, type, response_send, external_id, date, amount FROM ${tenant}.document WHERE states IN ('X', 'M', 'S', 'Z') AND ${buildTypeClause(docTypes)} ORDER BY id_document ASC LIMIT 50`);
        if (!docs.rowCount) { return false; }
        return docs.rows;
    } catch (error) {
        console.error(`[CRON Task 7] Error al consultar comprobantes con error en ${tenant}:`, error.message);
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

const select_all_documents_to_anulate = async (tenant, docTypes = null) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format, states, response_send, type, serie, numero, date, amount FROM ${tenant}.document WHERE states in ('P', 'Z') AND ${buildTypeClause(docTypes)} ORDER BY id_document limit 50`);
        if (!docs.rowCount) { return false; }
        return docs.rows;

    } catch (error) {
        console.log(error);
        return false;
    }
}

const select_all_documents_to_consult_void = async (tenant, docTypes = null) => {
    try {
        if (!tenant) { return false; }
        const docs = await pool.query(`SELECT id_document, json_format, states, response_send, response_anulate, type FROM ${tenant}.document WHERE states = 'C' AND ${buildTypeClause(docTypes)} ORDER BY id_document limit 50`);
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


const formatAnulate = async (id, tenant, company = null) => {
    try {
        if (!id) { return false; }

        const r = await pool.query(`SELECT id_document, json_format, response_send, type, states FROM ${tenant}.document WHERE id_document = $1`, [id]);
        if (!r.rowCount) { throw new Error('Documento no encontrado'); }

        const docState = r.rows[0].states;
        if (docState !== 'E' && docState !== 'P') {
            throw new Error(`Operación denegada: El comprobante no se encuentra declarado en SUNAT (Estado actual: ${docState || 'Ninguno'}).`);
        }

        const doc = JSON.parse(r.rows[0].json_format);
        const res = JSON.parse(r.rows[0].response_send);

        let fechaLimpia = doc.fecha_de_emision || '';
        if (fechaLimpia.length > 10) {
            fechaLimpia = fechaLimpia.substring(0, 10);
        }

        const useDMY = isPseInstance(company?.url) && isVoidedDocument(r.rows[0].type);

        const format = {
            id_document: r.rows[0].id_document,
            fecha_de_emision_de_documentos: useDMY ? toDMY(fechaLimpia) : fechaLimpia,
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
        console.error('Error en formatAnulate:', error.message);
        throw error; // Lanzar el error para que el controlador pueda atraparlo y mostrar el mensaje real
    }
}


const sunatAnulationCheckCache = new Map();
const SUNAT_ANULATION_CHECK_TTL_MS = 12 * 60 * 60 * 1000;
const ANULATION_MAX_AGE_DAYS = 8;

const shouldSkipAnulation = async (company, doc) => {
    if (!company?.company_number) return null;

    // Tope de edad: SUNAT no admite bajas de comprobantes antiguos
    if (doc.date) {
        const ageDays = (Date.now() - new Date(doc.date).getTime()) / (24 * 60 * 60 * 1000);
        if (ageDays > ANULATION_MAX_AGE_DAYS) {
            return `Documento con más de ${ANULATION_MAX_AGE_DAYS} días de antigüedad - anulación omitida`;
        }
    }

    const cacheKey = `${company.tenant}:${doc.id_document}`;
    const cached = sunatAnulationCheckCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < SUNAT_ANULATION_CHECK_TTL_MS) {
        return cached.reason;
    }

    let reason = null;
    try {
        if (doc.type && doc.serie && doc.numero && doc.date && doc.amount != null) {
            const response = await validateVoucherOnSunat({
                ruc: company.company_number,
                codigoComp: String(doc.type),
                serie: doc.serie,
                numero: doc.numero,
                fechaEmision: formatDateForSunat(doc.date),
                monto: Number(doc.amount),
            });

            const status = translateSunatStatus(response?.data?.estadoCp);
            if (status === SUNAT_STATUS_LABELS.NOT_FOUND || status === SUNAT_STATUS_LABELS.ANNULLED || status === SUNAT_STATUS_LABELS.REJECTED) {
                reason = status === SUNAT_STATUS_LABELS.NOT_FOUND
                    ? 'CPE no declarado en SUNAT - anulación omitida'
                    : `CPE en estado "${status}" en SUNAT - anulación no procede`;
            }

            sunatAnulationCheckCache.set(cacheKey, { reason, ts: Date.now() });
        }
    } catch (error) {
        // Si la validación SUNAT falla (API caída), no bloquear: se intenta anular igual
        console.log('Error al verificar CPE en SUNAT (se intentará anular):', error.message);
    }

    return reason;
};

const formatAnulatePerCompany = async (tenant, company = null, docTypes = null) => {
    try {
        if (!tenant) { return false; }

        const docs = await select_all_documents_to_anulate(tenant, docTypes)
        if (docs == false || docs.length <= 0) { return []; }

        let listformat = [];

        for (let doc of docs) {
            let docu = JSON.parse(doc.json_format);

            // Validar si response_send es null o vacío
            if (!doc.response_send) {
                console.log('response_send es null o vacío');
                continue;
            }

            let res;
            try {
                res = JSON.parse(doc.response_send);
            } catch (parseError) {
                console.log('Error al parsear response_send:', parseError);
                continue;
            }

            // Validar estructura completa antes de acceder a external_id
            if (!res || !res.data || !res.data.external_id) {
                console.log('external_id no encontrado - estructura inválida:', {
                    hasRes: !!res,
                    hasData: !!(res && res.data),
                    hasExternalId: !!(res && res.data && res.data.external_id)
                });
                continue;
            }

            // Verificar en SUNAT que el CPE esté declarado antes de anular
            const skipReason = await shouldSkipAnulation(company, doc);
            if (skipReason) {
                console.log(`Anulación omitida: ${company?.tenant || tenant} doc ${doc.id_document} - ${skipReason}`);
                await update_document_anulate(doc.id_document, tenant, {
                    success: false,
                    state: doc.states,
                    skipped: true,
                    message: skipReason,
                    timestamp: new Date().toISOString(),
                });
                continue;
            }

            const useDMY = isPseInstance(company?.url) && isVoidedDocument(doc.type);
            let format = {
                id_document: doc.id_document,
                fecha_de_emision_de_documentos: useDMY ? toDMY(docu.fecha_de_emision) : docu.fecha_de_emision,
                ...((doc.type == '03') && { codigo_tipo_proceso: '3' }),
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
        console.log('Error en formatAnulatePerCompany:', error);
        return false;
    }
}


const sendDoc = async (company, docu) => {
    let token = company.token;
    let payloadObj = null;
    try {
        payloadObj = typeof docu.json_format === 'string' ? JSON.parse(docu.json_format) : docu.json_format;
        if (typeof payloadObj === 'string') {
            try { payloadObj = JSON.parse(payloadObj); } catch (e) {}
        }
    } catch (e) {
        payloadObj = docu.json_format;
    }

    if (company.token_series && company.token_series.length > 0 && payloadObj?.serie_documento) {
        let branch = company.token_series.find(e => {
            return Array.isArray(e.series) && e.series.includes(payloadObj.serie_documento);
        });
        if (branch?.token) {
            token = branch.token;
        }
    }
    let result;
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

    const api = new ApiClient(url, token);
    
    // Primero, aplicamos sanitizeGuiaFormat para las Guías (tipos 09 y 31)
    let payloadToSent = sanitizeGuiaFormat(docu);
    
    // Segundo, aplicamos sanitización para Facturas y Boletas (tipos 01 y 03) usando truncateAddress
    try {
        let tempObj = typeof payloadToSent === 'string' ? JSON.parse(payloadToSent) : payloadToSent;
        if (typeof tempObj === 'string') {
            try { tempObj = JSON.parse(tempObj); } catch (e) {}
        }

        if (tempObj && typeof tempObj === 'object') {
            if (tempObj.delivery?.address) {
                tempObj.delivery.address = truncateAddress(tempObj.delivery.address);
            }
            if (tempObj.datos_del_cliente_o_receptor?.direccion) {
                tempObj.datos_del_cliente_o_receptor.direccion = truncateAddress(tempObj.datos_del_cliente_o_receptor.direccion);
            }
            payloadToSent = tempObj;
        }
    } catch (e) {
        console.error("Error sanitizing document payload:", e);
    }

    result = await api.sendDocument(payloadToSent);

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
        if (result.state === 'X') {
            notifyError({
                type:     'Fallo envío documento al PRO',
                error:    new Error(typeof result.message === 'string' ? result.message : JSON.stringify(result.message)),
                tenant:   company.tenant,
                ruc:      company.company_number,
                document: getDocumentLabel(docu),
                payload:  getDocumentPayload(docu, result),
            });
        }
    } else {
        if (docu.states == 'S') // Cuando aun no fue declarado pero se debe anular.
            result.state = 'P'; // Pendiente de anulación
        else
            result.state = 'E';

        if (result.data.state_type_description == 'Rechazado') {
            result.state = 'R';
            notifyError({
                type:     'Documento rechazado por SUNAT',
                error:    new Error(`Documento rechazado: ${result.data.state_type_description}`),
                tenant:   company.tenant,
                ruc:      company.company_number,
                document: getDocumentLabel(docu),
                payload:  getDocumentPayload(docu, result),
            });
        }

        if (docu.type == '09' || docu.type == '31') {
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
    if (typeof result?.message === 'string' && result.message.search('ya se encuentra registrado') > 0) {
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
        throw new Error(`Error al enviar Guia a SUNAT: ${typeof result.message === 'string' ? result.message : JSON.stringify(result.message)}`);
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

const validarMensajeError = (response) => {
    // Si no hay respuesta o success no es false, retornar true
    if (!response || response.success !== false) {
        return true;
    }

    // Lista de mensajes de error a detectar
    const mensajesError = [
        'Undefined index: totales',
        'Invalid argument supplied for foreach()',
        'No se encontró la URL especificada',
        'serie ingresada',
        'SQLSTATE[23000]: Integrity constraint violation:',
        'El tipo doc. identidad Doc.trib.no.dom.sin.ruc del cliente no es válido.',
        'fecha de emisión no puede ser menor',
        'Integrity constraint violation: 1062 Duplicate entry',
        'Trying to access array offset on value of type null',
        'Division by zero',
        'Could not resolve host',
        'cURL error',
        'No query results for model',
        'file_get_contents',
        'Is a directory'
    ];

    // Verificar si el mensaje contiene alguno de los errores
    const mensaje = response.message || '';

    for (let error of mensajesError) {
        if (typeof mensaje === 'string' && mensaje.includes(error)) {
            return false; // Error detectado
        }
    }

    return true; // No hay errores conocidos
};

const getDocumentLabel = (docu = {}) => {
    if (docu.serie && docu.numero) {
        return `${docu.serie}-${docu.numero}`;
    }

    if (docu.serie_documento && docu.numero_documento) {
        return `${docu.serie_documento}-${docu.numero_documento}`;
    }

    if (docu.json_format) {
        try {
            let j = typeof docu.json_format === 'string' ? JSON.parse(docu.json_format) : docu.json_format;
            if (typeof j === 'string') { try { j = JSON.parse(j); } catch (e) {} }
            if (j?.serie_documento && j?.numero_documento) {
                return `${j.serie_documento}-${j.numero_documento}`;
            }
        } catch (e) {}
    }

    if (docu.cod_sale) {
        return docu.cod_sale;
    }

    if (docu.external_id) {
        return docu.external_id;
    }

    return docu.id_document ? `ID:${docu.id_document}` : 'Documento sin identificador';
};

const getDocumentPayload = (docu = {}, result) => ({
    result,
    id_document: docu.id_document,
    cod_sale: docu.cod_sale,
    serie: docu.serie,
    numero: docu.numero,
    external_id: docu.external_id,
    json_format: docu.json_format,
});

/**
 * Detecta si un resultado de envío es un error de autenticación/configuración irrecuperable.
 * Estos errores indican que la empresa tiene credenciales o URL incorrectas y no tiene
 * sentido continuar enviando documentos hasta que el admin corrija la configuración.
 */
const isAuthError = (result) => {
    const msg = typeof result?.message === 'string'
        ? result.message
        : JSON.stringify(result?.message ?? '');
    const status = result?.status ?? result?.statusCode ?? 0;

    const authPatterns = [
        'El tipo SOAP no coincide',
        'tipo SOAP',
        'Unauthorized',
        'Unauthenticated',
        'Invalid token',
        'token inválido',
        'token expirado',
        'No autorizado',
    ];

    if (status === 401 || status === 403 || status === 409) return true;
    return authPatterns.some(p => msg.toLowerCase().includes(p.toLowerCase()));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sendAllDocsPerCompany = async (company, docus, options = {}) => {

    let result;
    let num_aceptados = 0;
    let num_error = 0;
    let num_rechazados = 0;
    let api;
    const isCronSource = options.source === 'cron';

    for (let i = 0; i < docus.length; i++) {
        const docu = docus[i];

        // Pausa preventiva entre comprobantes de la misma empresa para evitar Rate Limiting (Too Many Attempts) en Facturalo PRO
        if (i > 0) {
            await sleep(250);
        }

        if (docu.states !== 'M' && docu.states !== 'N' && docu.response_send) {
            let parsedRes = null;
            try {
                parsedRes = typeof docu.response_send === 'string' ? JSON.parse(docu.response_send) : docu.response_send;
                if (typeof parsedRes === 'string') {
                    try { parsedRes = JSON.parse(parsedRes); } catch (e) {}
                }
            } catch (e) {}
            if (parsedRes && validarMensajeError(parsedRes) === false) {
                num_error += 1;
                continue;
            }
        }
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
        api = new ApiClient(url, company.token);
        result = await api.sendDocument(sanitizeGuiaFormat(docu));

        // Manejo inteligente ante HTTP 429 / Too Many Attempts devuelto por Facturalo PRO
        const isRateLimit = result?.status === 429 || 
            (typeof result?.message === 'string' && result.message.toLowerCase().includes('too many attempts'));

        if (!result?.success && isRateLimit) {
            console.warn(`[CRON] ${company.tenant}: Rate Limit detectado ('Too Many Attempts'). Pausando 2.5s antes de reintentar doc ${getDocumentLabel(docu)}...`);
            await sleep(2500);
            result = await api.sendDocument(sanitizeGuiaFormat(docu));
        }

        if (!result.success) {
            // Detectar fallo de autenticación → abortar empresa y registrar fallo
            if (isAuthError(result)) {
                notifyError({
                    type:    isCronSource ? 'Error de autenticación en cron - empresa abortada' : 'Error de autenticación en envío manual',
                    error:   new Error(typeof result.message === 'string' ? result.message : JSON.stringify(result.message)),
                    tenant:  company.tenant,
                    ruc:     company.company_number,
                    document: getDocumentLabel(docu),
                    payload: getDocumentPayload(docu, result),
                });

                if (isCronSource) {
                    const { disabled, count } = await incrementCronAuthFailure(company.id_company, company.tenant);
                    if (disabled) {
                        console.warn(`[CRON] ${company.tenant}: cron_enabled=false automático tras ${count} fallos de auth consecutivos`);
                    }
                }
                // Abortar todos los documentos restantes de esta empresa
                return { num_aceptados, num_error: num_error + 1, num_rechazados };
            }

            console.log("TASK", { result });
            result.state = 'X';
            if (docu.states === 'S' || docu.original_intention === 'S') {
                result.original_intention = 'S'; // Recordar que la intención original era anularlo
            } else if (docu.response_send) {
                try {
                    const prevRes = JSON.parse(docu.response_send);
                    if (prevRes.original_intention === 'S') {
                        result.original_intention = 'S';
                    }
                } catch(e) {}
            }
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
            if (result.state === 'X') {
                notifyError({
                    type:     'Fallo envío masivo documento al PRO',
                    error:    new Error(typeof result.message === 'string' ? result.message : JSON.stringify(result.message)),
                    tenant:   company.tenant,
                    ruc:      company.company_number,
                    document: getDocumentLabel(docu),
                    payload:  getDocumentPayload(docu, result),
                });
            }
            await update_document(docu.id_document, company.tenant, result)
        }
        else {
            // Envío exitoso: resetear contador de fallos de auth si había alguno
            if (isCronSource && company.cron_failure_count > 0) {
                await resetCronAuthFailure(company.id_company);
            }

            // Determinar si el documento tenía intención de ser anulado
            let isIntendedForAnulation = (docu.states === 'S');
            if (!isIntendedForAnulation && docu.response_send) {
                try {
                    const prevRes = JSON.parse(docu.response_send);
                    if (prevRes.original_intention === 'S') {
                        isIntendedForAnulation = true;
                    }
                } catch(e) {}
            }

            if (isIntendedForAnulation) {
                result.state = 'P';
                result.original_intention = null; // Limpiar la memoria una vez que tuvo éxito
            } else {
                result.state = 'E';
            }

            if (result.data.state_type_description == 'Rechazado') {
                result.state = 'R';
                num_rechazados += 1;
            }
            if (docu.type == '09' || docu.type == '31') {
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
            notifyError({
                type:     'Error al anular documento en PRO',
                error:    new Error(typeof result.message === 'string' ? result.message : JSON.stringify(result.message)),
                tenant:   company.tenant,
                ruc:      company.company_number,
                document: getDocumentLabel(format),
                payload:  getDocumentPayload(format, result),
            });
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

// Used by tasks
let isProcessing = false;
const sendAllDocsAllCompanies = async (options = {}) => {
    if (isProcessing) {
        console.log('Previous execution still running, skipping...');
        return;
    }

    isProcessing = true;
    try {
        const companies = await selectAllApiCompany();
        for (let company of companies) {
            try {
                if (company.state && company.url && company.token) {
                    const docus = await select_all_documents(company.tenant, options?.docTypes);
                    if (docus.length > 0) {
                        console.log(`Processing company: ${company.tenant} with ${docus.length} documents`);
                        let { num_aceptados, num_error, num_rechazados } = await sendAllDocsPerCompany(company, docus, options);
                        console.log({
                            company: company.tenant,
                            message: 'Comprobantes Nuevos Enviados',
                            num_aceptados: `Aceptados ${num_aceptados}`,
                            num_rechazados: `Rechazados ${num_rechazados}`,
                            num_error: `Con Error ${num_error}`
                        });
                    } else {
                        console.log(company.tenant, "no documents");
                    }
                } else {
                    console.log(company.tenant, "company blocked or missing url/token");
                }
            } catch (companyError) {
                console.error(`[CRON] Error inesperado procesando empresa ${company.tenant}:`, companyError?.message);
                notifyError({
                    type:   'Error inesperado en sendAllDocsAllCompanies por empresa',
                    error:  companyError,
                    tenant: company.tenant,
                    ruc:    company.company_number,
                });
            }
        }
    } catch (error) {
        console.error('Error in sendAllDocsAllCompanies:', error);
        notifyError({
            type:    'Error en tarea automática sendAllDocsAllCompanies',
            error,
        });
    } finally {
        isProcessing = false;
    }
};

// Used by tasks
let isProcessingNullify = false;
const sendAllAnulateDocsAllCompanies = async (options = {}) => {
    if (isProcessingNullify) {
        console.log('Nullify Previous execution still running, skipping...');
        return;
    }

    isProcessingNullify = true;
    try {
        const companies = await selectAllApiCompany()
        for (let company of companies) {
            try {
                if (!company.url || !company.token) {
                    console.log(company.tenant, "missing url/token — skipping");
                    continue;
                }
                const listformat = await formatAnulatePerCompany(company.tenant, company, options?.docTypes)
                if (listformat.length > 0) {
                    const api_doc = await update_doc_api(null, company.url)
                    const api = new ApiClient(`${company.url}/api/summaries`, company.token)
                    const apif = new ApiClient(`${company.url}/api/voided`, company.token)

                    const { num_anulados, num_error } = await sendAllAnulateDocsPerCompany(company, api, apif, listformat)

                    console.log({
                        success: true,
                        message: 'Comprobantes Enviados Anulados',
                        num_anulados: `Anulados ${num_anulados}`,
                        num_error: `Con Error ${num_error}`
                    });
                } else {
                    console.log(company.tenant, "No documents");
                }
            } catch (companyError) {
                console.error(`[CRON] Error inesperado procesando anulaciones empresa ${company.tenant}:`, companyError?.message);
                notifyError({
                    type:   'Error inesperado en sendAllAnulateDocsAllCompanies por empresa',
                    error:  companyError,
                    tenant: company.tenant,
                    ruc:    company.company_number,
                });
            }
        }
    } catch (error) {
        console.error('Error in sendAllAnulateDocsAllCompanies:', error);
        notifyError({
            type:    'Error en tarea automática sendAllAnulateDocsAllCompanies',
            error,
        });
    } finally {
        isProcessingNullify = false;
    }
};

// Used by tasks
let isProcessingNullifyConsult = false;
const consultAllAnulateDocsAllCompanies = async (options = {}) => {
    if (isProcessingNullifyConsult) {
        console.log('Consulting Previous execution still running, skipping...');
        return;
    }

    isProcessingNullifyConsult = true;
    try {
        const companies = await selectAllApiCompany()
        for (let company of companies) {
            console.log(`Consulting company: ${company.tenant}`)
            const docs = await select_all_documents_to_consult_void(company.tenant, options?.docTypes)
            if (!docs) {
                console.log(`No nullified documents to consult!`)
                continue;
            }
            const { num_anulados, num_error, num_error_updating } = await sendAllConsultVoidPerCompany(company, docs)

            console.log({
                company: company.tenant,
                message: 'Anulaciones Consultadas',
                num_anulados: `Consultados ${num_anulados}`,
                num_error: `Con error ${num_error}`,
                num_error_updating: `No actualizado en la BD. ${num_error_updating}`,
            });
        }
    } catch (error) {
        console.error('Error in sendAllAnulateDocsAllCompanies:', error);
        notifyError({
            type:    'Error en tarea automática consultAllAnulateDocsAllCompanies',
            error,
        });
    } finally {
        isProcessingNullifyConsult = false;
    }
};


const getAllRejectedDocsAllCompanies = async () => {
    try {
        const { rows: schemas } = await pool.query(
            `SELECT id_company, company_number, company, url, token, tenant, state
             FROM public.company
             WHERE state = true
             ORDER BY company ASC`
        );

        if (!schemas || schemas.length === 0) {
            return [];
        }

        const validSchemas = schemas.filter(s => s.tenant && /^[a-zA-Z0-9_]+$/.test(s.tenant));
        if (validSchemas.length === 0) return [];

        const chunkSize = 25;
        const allRejected = [];

        for (let i = 0; i < validSchemas.length; i += chunkSize) {
            const chunk = validSchemas.slice(i, i + chunkSize);
            const unionQueries = chunk.map((s) => `
                SELECT id_document, 
                       TO_CHAR(date::DATE, 'yyyy-mm-dd') AS date, 
                       TO_CHAR(date, 'HH24:MI:SS') AS time, 
                       cod_sale, type, serie, numero, 
                       customer_number, customer, amount, states, verified,
                       json_format, response_send, response_anulate, 
                       id_company, external_id,
                       '${s.tenant}' AS _tenant
                FROM ${s.tenant}.document 
                WHERE states = 'R' AND (verified IS NULL OR verified = false)
            `);

            try {
                const { rows } = await pool.query(unionQueries.join('\nUNION ALL\n'));
                allRejected.push(...rows);
            } catch (err) {
                console.error('Error procesando lote de esquemas rechazados:', err.message);
            }
        }

        if (allRejected.length === 0) {
            return [];
        }

        // Agrupar filas por empresa en memoria
        const companyMap = new Map();
        for (const doc of allRejected) {
            const tenant = doc._tenant;
            if (!companyMap.has(tenant)) {
                const schemaInfo = validSchemas.find(s => s.tenant === tenant);
                companyMap.set(tenant, {
                    ...schemaInfo,
                    rows: []
                });
            }
            const { _tenant, ...cleanDoc } = doc;
            companyMap.get(tenant).rows.push(cleanDoc);
        }

        return Array.from(companyMap.values());

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
                        // si existe 'filename' lo agrega, en caso contrario no lo agrega
                        filename: element.filename ? element.filename : null,
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
};

let isProcessingErrorCron = false;
const verifyErrorDocsAllCompanies = async (options = {}) => {
    if (isProcessingErrorCron) {
        console.log('[CRON Task 7] Previa ejecución en proceso, omitiendo ciclo...');
        return;
    }

    isProcessingErrorCron = true;
    try {
        const { executeUnifiedValidation } = require('../controllers/api.controllers');
        const companies = await selectAllApiCompany();
        for (let company of companies) {
            try {
                if (company.state && company.url && company.token) {
                    const errorDocs = await select_error_documents(company.tenant);
                    if (errorDocs && errorDocs.length > 0) {
                        console.log(`[CRON Task 7] Procesando ${errorDocs.length} comprobantes con error para ${company.tenant}`);
                        let num_procesados = 0;
                        let num_exitosos = 0;

                        for (let docu of errorDocs) {
                            try {
                                const res = await executeUnifiedValidation(company, docu);
                                num_procesados++;
                                if (res.success) num_exitosos++;
                            } catch (docErr) {
                                console.error(`[CRON Task 7] Error validando doc ${docu.id_document} en ${company.tenant}:`, docErr.message);
                            }
                        }

                        console.log({
                            company: company.tenant,
                            message: 'Verificación de Comprobantes con Error Finalizada',
                            procesados: num_procesados,
                            regularizados: num_exitosos
                        });
                    }
                }
            } catch (companyError) {
                console.error(`[CRON Task 7] Error procesando empresa ${company.tenant}:`, companyError?.message);
            }
        }
    } catch (error) {
        console.error('[CRON Task 7] Error en verifyErrorDocsAllCompanies:', error);
    } finally {
        isProcessingErrorCron = false;
    }
};

module.exports = {
    select_document_by_id,
    select_all_documents,
    select_error_documents,
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
    consultAllAnulateDocsAllCompanies,
    verifyErrorDocsAllCompanies,
};
