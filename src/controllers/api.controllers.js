const pool = require('../db');
const { selectApiCompanyById, selectAllApiCompany } = require('../libs/company.libs');
const { ApiClient } = require('../libs/api.libs');
const { update_doc_api, checkConnection } = require('../libs/connection');
const { select_document_by_id, select_all_documents, update_document, update_document_state, update_document_anulate, formatAnulate, sendAllDocsPerCompany, formatAnulatePerCompany, verifyingExternalIds, sendAllAnulateDocsPerCompany, countingDocsState, consultAnulation, select_all_documents_to_consult_void, sendAllConsultVoidPerCompany, sendDoc, recoverExistingDocumentFromPro } = require('../libs/document.libs');
const { parseJsonField } = require('../libs/json.libs');
const { getSettingApiRuc } = require('../libs/settings.lib');
const { ApiRUC } = require('../libs/apiClient.lib');
const { formatDateForSunat, formatDateISO, translateSystemStatus, getEnvironmentLabel, validateVoucherOnSunat, SUNAT_STATUS_LABELS, translateSunatStatus } = require('../libs/sunatValidation.libs');
const { getCompanyByTenant } = require('../libs/company.libs');

const sendDocument = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })

    if (!company.state)
        return res.status(405).json({ success: false, message: `Company Blocked!` })

    const docu = await select_document_by_id(req.body.id_document, company.tenant)
    if (!docu)
        return res.status(405).json({ success: false, message: `Document Finding Error!` })
    if (docu.type === '80')
        return res.status(405).json({ success: false, message: `Not Allowed!` })

    let result = await sendDoc(company, docu)

    const counting = await countingDocsState(company.tenant)
    result.counting = counting

    res.status(200).json({ result });
}

const sendDocumentAll = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })
    if (!company.state)
        return res.status(405).json({ success: false, message: `Company Blocked!` })

    const docus = await select_all_documents(company.tenant)

    const { num_aceptados, num_error, num_rechazados } = await sendAllDocsPerCompany(company, docus, { source: 'manual' })

    const counting = await countingDocsState(company.tenant)

    return res.status(200).json({
        success: true,
        message: 'Comprobantes Nuevos Enviados',
        num_aceptados: `Aceptados ${num_aceptados}`,
        num_rechazados: `Rechazados ${num_rechazados}`,
        num_error: `Con Error ${num_error}`,
        counting: counting
    });
}


const anulateDocument = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })

    let format;
    try {
        format = await formatAnulate(req.body.id_document, company.tenant, company);
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }

    if (!format)
        return res.status(400).json({ success: false, message: `Document Error1!` })

    let api;
    let type;
    if (!!format.codigo_tipo_proceso) {
        const ext_id = format.documentos[0].external_id
        //update state in API
        const api_doc = await update_doc_api(ext_id, company.url)
        if (api_doc)
            return res.status(405).json({ success: false, message: `API Document Error!` })
        type = '03'
        api = new ApiClient(`${company.url}/api/summaries`, company.token)
    } else {
        type = '01'
        api = new ApiClient(`${company.url}/api/voided`, company.token)
    }


    let result = await api.sendDocument(format)
    result.type = type;
    if (!result.success) {
        return res.status(405).json(result)
    }
    result.state = 'C';
    if (company.autosend) {
        consult_result = await consultAnulation(result, company)
        if (consult_result.success) {
            result = consult_result;
            result.state = 'A';
        }
    }

    const doc = await update_document_anulate(req.body.id_document, company.tenant, result)
    if (!doc)
        return res.status(405).json({ success: false, message: `Document Error2!` })

    const counting = await countingDocsState(company.tenant)
    result.counting = counting

    res.status(200).json(result)
}

const anulateDocumentAll = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })


    const listformat = await formatAnulatePerCompany(company.tenant, company)
    if (!listformat)
        return res.status(405).json({ success: false, message: `No hay documentos Por Anular!` })

    //update state in API
    const api_doc = await update_doc_api('', company.url)
    if (api_doc)
        return res.status(405).json({ success: false, message: `API Documents Error!` })

    const api = new ApiClient(`${company.url}/api/summaries`, company.token)
    const apif = new ApiClient(`${company.url}/api/voided`, company.token)

    const { num_anulados, num_error } = await sendAllAnulateDocsPerCompany(company, api, apif, listformat)

    const counting = await countingDocsState(company.tenant)

    return res.status(200).json({
        success: true,
        message: 'Comprobantes Enviados Anulados',
        num_anulados: `Anulados ${num_anulados}`,
        num_error: `Con Error ${num_error}`,
        counting: counting
    });
}

const consultAnulateDocument = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: 'Company Error!' })

    const docu = await select_document_by_id(req.body.id_document, company.tenant)
    if (!docu)
        return res.status(405).json({ success: false, message: 'Document Finding Error!' })

    const result = await consultAnulation(docu.response_anulate, company)
    if (result.success) {
        result.state = 'A';
        const doc = await update_document_anulate(req.body.id_document, company.tenant, result)

        const counting = await countingDocsState(company.tenant)
        result.counting = counting
        if (doc)
            return res.status(200).json(result)
    }
    res.status(405).json(result)
}

const consultAnulateDocumentAll = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: 'Company Error!' })

    const docs = await select_all_documents_to_consult_void(company.tenant)
    if (!docs)
        return res.status(405).json({ success: false, message: 'Error finding documents!' })

    const { num_anulados, num_error, num_error_updating } = await sendAllConsultVoidPerCompany(company, docs)

    const counting = await countingDocsState(company.tenant)

    return res.status(200).json({
        success: true,
        message: 'Anulaciones Consultadas',
        num_anulados: `Consultados ${num_anulados}`,
        num_error: `Con error ${num_error}`,
        num_error_updating: `No actualizado en la BD. ${num_error_updating}`,
        counting: counting
    });
}

const verifyExternalIds = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })

    const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token)

    const { num_aceptados, num_rechazados, num_por_anular, num_anulados } = await verifyingExternalIds(company.tenant, api)

    const counting = await countingDocsState(company.tenant)

    return res.status(200).json({
        success: true,
        message: 'Comprobantes Actualizados',
        num_aceptados: `Aceptados ${num_aceptados}`,
        num_rechazados: `Rechazados ${num_rechazados}`,
        num_poranular: `Por Anular ${num_por_anular}`,
        num_anulados: `Anulados ${num_anulados}`,
        counting: counting
    });
}

const verifyMySqlConnection = async (req, res, next) => {
    const verify_data = await checkConnection(req.query.url)
    if (!verify_data) {
        return res.status(409).json({
            success: false,
            data: verify_data,
        });
    }
    return res.status(200).json({
        success: true,
        data: verify_data,
    });
}

const getCustomerData = async (req, res, next) => {
    const ruc = req.params.ruc
    if (!ruc)
        return res.status(405).json({ success: false, message: `RUC Error!` })

    const setting = await getSettingApiRuc()
    if (!setting)
        return res.status(405).json({ success: false, message: `Settings Error!` })
    const [token, url] = setting
    const api = new ApiRUC(`${url.value}/ruc/${ruc}`, token.value)
    const response = await api.getData()
    return res.status(200).json(response)

}

const validateSalesRange = async (req, res, next) => {
    try {
        const { serie, numero_inicio, numero_fin } = req.body;

        if (!serie || numero_inicio === undefined || numero_fin === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos: serie, numero_inicio, numero_fin',
            });
        }

        const tenant = req.params.tenant;
        if (!tenant) {
            return res.status(401).json({
                success: false,
                message: 'Tenant no encontrado',
            });
        }

        const start = Number(numero_inicio);
        const end = Number(numero_fin);
        if (!Number.isInteger(start) || !Number.isInteger(end)) {
            return res.status(400).json({
                success: false,
                message: 'numero_inicio y numero_fin deben ser enteros',
            });
        }

        if (end < start) {
            return res.status(400).json({
                success: false,
                message: 'numero_fin no puede ser menor a numero_inicio',
            });
        }

        const maxRange = 500;
        if (end - start + 1 > maxRange) {
            return res.status(400).json({
                success: false,
                message: `Rango maximo permitido: ${maxRange}`,
            });
        }

        const company = await getCompanyByTenant(tenant);
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado',
            });
        }

        const params = [serie, start, end];
        let query = `SELECT id_document, date, type, serie, numero, customer, customer_doc, amount, states
        FROM ${tenant}.document
        WHERE serie = $1 AND numero >= $2 AND numero <= $3`;

        query += ' ORDER BY numero ASC';

        const docsResult = await pool.query(query, params);
        const docs = docsResult.rows || [];

        const totalExpected = end - start + 1;
        const totalFound = docs.length;
        const totalMissing = totalExpected - totalFound;

        if (!docs.length) {
            return res.status(200).json({
                success: true,
                timestamp: new Date().toISOString().split('T')[0],
                summary: {
                    serie,
                    numero_inicio: start,
                    numero_fin: end,
                    total_expected: totalExpected,
                    total_found: totalFound,
                    total_missing: totalMissing,
                    total_errors: 0,
                    total_accepted: 0,
                },
                results: [],
            });
        }

        const results = [];
        let totalErrors = 0;
        let totalAccepted = 0;

        for (const doc of docs) {
            const normalized = {
                environment: getEnvironmentLabel(),
                document: `${doc.serie}-${String(doc.numero).padStart(4, '0')}`,
                serie: doc.serie,
                number: String(doc.numero),
                issue_date: doc.date ? new Date(doc.date).toLocaleDateString('es-PE') : null,
                customer: doc.customer,
                customer_document: doc.customer_doc,
                code: doc.type,
                system_status: translateSystemStatus(doc.states),
                sunat_status: SUNAT_STATUS_LABELS.PENDING,
                amount: doc.amount ? String(Number(doc.amount).toFixed(2)) : null,
                company_ruc: company.company_number,
            };

            try {
                if (!doc.type || !doc.date) {
                    throw new Error('Comprobante sin tipo o fecha para validar en SUNAT');
                }

                const fechaEmision = formatDateForSunat(doc.date);
                const sunatResponse = await validateVoucherOnSunat({
                    ruc: company.company_number,
                    codigoComp: doc.type,
                    serie: doc.serie,
                    numero: doc.numero,
                    fechaEmision,
                    monto: doc.amount,
                });

                const estadoCp = sunatResponse?.data?.estadoCp;
                normalized.sunat_status = translateSunatStatus(estadoCp);

                if (normalized.sunat_status === SUNAT_STATUS_LABELS.ACCEPTED) {
                    totalAccepted += 1;
                }

                normalized.sunat_response = {
                    success: !!sunatResponse?.success,
                    message: sunatResponse?.message || null,
                    data: sunatResponse?.data || null,
                };
            } catch (error) {
                totalErrors += 1;
                normalized.sunat_status = SUNAT_STATUS_LABELS.ERROR;
                normalized.sunat_error = error.message;
            }

            results.push(normalized);
        }

        return res.status(200).json({
            success: totalErrors === 0,
            timestamp: new Date().toISOString().split('T')[0],
            summary: {
                serie,
                numero_inicio: start,
                numero_fin: end,
                total_expected: totalExpected,
                total_found: totalFound,
                total_missing: totalMissing,
                total_errors: totalErrors,
                total_accepted: totalAccepted,
            },
            results,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const validateSunatSingle = async (req, res, next) => {
    try {
        const { id_company, id_document, external_id } = req.body;
        const company = await selectApiCompanyById(id_company);
        if (!company) {
            return res.json({ success: false, message: 'Company Error!' });
        }
        
        const docu = await select_document_by_id(id_document, company.tenant);
        if (!docu) {
            return res.json({ success: false, message: 'Document Finding Error!' });
        }

        if (!docu.type || !docu.date) {
            return res.json({ success: false, message: 'Comprobante sin tipo o fecha para validar en SUNAT' });
        }

        if (docu.type === '80') {
            return res.json({ success: false, message: 'Las Notas de Venta (tipo 80) son documentos internos y no se declaran ante SUNAT.' });
        }

        if (docu.type === '09' || docu.type === '31') {
            return res.json({ success: false, message: 'Las Guías de Remisión (tipo 09/31) se procesan por el servicio de Guías (GRE) y no mediante esta consulta.' });
        }

        const serieClean = String(docu.serie || '').trim();
        const numeroClean = String(docu.numero || '').trim();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateEmision = new Date(docu.date);
        dateEmision.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - dateEmision.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        let limitDays = 30; // Por defecto para Boletas
        let docuLabel = 'boletas';
        if (docu.type === '01' || (serieClean && serieClean.toUpperCase().startsWith('F'))) {
            limitDays = 3;
            docuLabel = 'facturas';
        }

        if (diffDays > limitDays) {
            return res.json({ 
                success: false, 
                message: `El comprobante superó el plazo máximo de envío permitido por SUNAT (${limitDays} días para ${docuLabel}). No se puede reenviar.` 
            });
        }

        const fechaEmision = formatDateForSunat(docu.date);
        
        const sunatResponse = await validateVoucherOnSunat({
            ruc: company.company_number,
            codigoComp: docu.type,
            serie: serieClean,
            numero: numeroClean,
            fechaEmision: fechaEmision,
            monto: docu.amount || 0,
        });

        const estadoCp = String(sunatResponse?.data?.estadoCp || '');

        if (estadoCp === '1' || estadoCp === '3') {
            if (docu.states === 'P' || docu.states === 'C') {
                return res.json({ success: true, message: `El comprobante está ACEPTADO en SUNAT y se mantiene en espera de anulación (Estado: ${docu.states}).` });
            }
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'E' });
            return res.json({ success: true, message: 'El comprobante existe y está ACEPTADO en SUNAT. Estado local sincronizado a Enviado (E).' });
        } else if (estadoCp === '2') {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'A' });
            return res.json({ success: true, message: 'El comprobante existe y está ANULADO en SUNAT. Estado local sincronizado a Anulado (A).' });
        } else if (estadoCp === '4') {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'R' });
            return res.json({ success: true, message: 'El comprobante fue RECHAZADO por SUNAT. Estado local actualizado a Rechazado (R).' });
        } else if (['P', 'C'].includes(docu.states)) {
            return res.json({ success: true, message: `No encontrado en SUNAT. El comprobante se mantiene en ${docu.states} (espera de anulación); no se modifica su estado.` });
        } else {
            let nextState = 'N';
            let stateMessage = 'Estado actualizado a N (Nuevo) para reenvío.';

            if (['A', 'S', 'P', 'C', 'Z'].includes(docu.states)) {
                nextState = 'S';
                stateMessage = 'Estado actualizado a S (Nuevo para anulación) para reintentar baja.';
            } else if (['E', 'Y', 'W'].includes(docu.states)) {
                nextState = 'Y';
                stateMessage = 'El comprobante está en el PRO pero pendiente en SUNAT. Estado actualizado a Y (Registrado en PRO). Usa \'Forzar Envío PRO -> SUNAT\' para declararlo.';
            }

            await update_document_state(id_document, company.tenant, { id: id_document, state: nextState });
            return res.json({ success: true, message: `No encontrado en SUNAT. ${stateMessage}` });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
    }
}

const validateProSingle = async (req, res, next) => {
    try {
        const { id_company, id_document } = req.body;
        const company = await selectApiCompanyById(id_company);
        if (!company) {
            return res.json({ success: false, message: 'Company Error!' });
        }
        
        const docu = await select_document_by_id(id_document, company.tenant);
        if (!docu) {
            return res.json({ success: false, message: 'Document Finding Error!' });
        }

        if (docu.type === '80') {
            return res.json({ success: false, message: 'Las Notas de Venta (tipo 80) son documentos internos y no se registran en el PRO.' });
        }

        if (docu.type === '09' || docu.type === '31') {
            return res.json({ success: false, message: 'Las Guías de Remisión (tipo 09/31) se procesan por el módulo de Guías y no mediante este validador.' });
        }

        if (!company.url || !company.token) {
            return res.json({ success: false, message: 'La empresa no cuenta con URL o Token del PRO configurados.' });
        }

        let dateBaseStr = null;
        try {
            if (docu.json_format) {
                const parsed = typeof docu.json_format === 'string' ? JSON.parse(docu.json_format) : docu.json_format;
                dateBaseStr = parsed.fecha_de_emision;
            }
        } catch (e) {}

        let dateObj = new Date(docu.date);
        if (dateBaseStr && /^\d{4}-\d{2}-\d{2}$/.test(dateBaseStr)) {
            dateObj = new Date(`${dateBaseStr}T12:00:00.000Z`);
        }

        if (Number.isNaN(dateObj.getTime())) {
            return res.json({ success: false, message: 'Fecha de comprobante inválida.' });
        }

        const dayBefore = new Date(dateObj.getTime() - 86400000).toISOString().slice(0, 10);
        const dayAfter = new Date(dateObj.getTime() + 86400000).toISOString().slice(0, 10);

        const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token);
        const apidocs = await api.getListDocumentByDate(`${company.url}/api/documents/lists/${dayBefore}/${dayAfter}`);

        if (!apidocs || !Array.isArray(apidocs.data)) {
            return res.json({ success: false, message: 'No se pudo obtener respuesta del servidor PRO (Verifique URL/Token o estado del servidor PRO).' });
        }

        const serieClean = String(docu.serie || '').trim();
        const numeroClean = String(docu.numero || '').trim();
        const numeroInt = parseInt(numeroClean, 10);

        const match = apidocs.data.find(el => {
            if (docu.external_id && el.external_id === docu.external_id) return true;
            if (el.number) {
                const parts = String(el.number).trim().split('-');
                if (parts.length === 2) {
                    const elSerie = parts[0].trim().toUpperCase();
                    const elNum = parseInt(parts[1].trim(), 10);
                    if (elSerie === serieClean.toUpperCase() && elNum === numeroInt) return true;
                }
            }
            if (el.filename && el.filename.includes(`${serieClean}-${numeroClean}`)) return true;
            return false;
        });

        if (!match) {
            if (['P', 'C'].includes(docu.states)) {
                return res.json({
                    success: false,
                    message: `El comprobante NO EXISTE en el sistema PRO. Se mantiene en ${docu.states} (espera de anulación); no se modifica su estado.`
                });
            }
            const isAnulation = ['A', 'S', 'P', 'C', 'Z'].includes(docu.states);
            const targetState = isAnulation ? 'S' : 'N';
            await update_document_state(id_document, company.tenant, { id: id_document, state: targetState });
            return res.json({ 
                success: false, 
                message: `El comprobante NO EXISTE en el sistema PRO. Estado local actualizado a ${targetState} para reenvío al PRO.` 
            });
        }

        const stateTypeId = String(match.state_type_id || '');
        const stateDesc = match.state_type_description || match.sunat_shipping_status || 'Registrado';

        if (stateTypeId === '05') {
            const hasCdr = match.has_cdr === true || (match.has_cdr !== false && !!match.download_cdr);
            if (hasCdr) {
                if (docu.states === 'P' || docu.states === 'C') {
                    return res.json({ success: true, message: `El comprobante está ACEPTADO en el PRO y se mantiene en espera de anulación (Estado: ${docu.states}).` });
                }
                await update_document_state(id_document, company.tenant, { id: id_document, state: 'E' });
                return res.json({ success: true, message: 'El comprobante existe y está ACEPTADO por SUNAT en el PRO (con CDR). Estado local sincronizado a Enviado (E).' });
            } else {
                if (['P', 'C'].includes(docu.states)) {
                    return res.json({ success: true, message: `El comprobante está en el PRO pero PENDIENTE de CDR/envío a SUNAT. Se mantiene en ${docu.states} (espera de anulación).` });
                }
                await update_document_state(id_document, company.tenant, { id: id_document, state: 'Y' });
                return res.json({ 
                    success: true, 
                    message: 'ATENCIÓN: El comprobante está en el PRO pero PENDIENTE de CDR/envío a SUNAT. Estado actualizado a Y. Usa la opción \'Forzar Envío PRO -> SUNAT\' para declararlo.' 
                });
            }
        } else if (stateTypeId === '11') {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'A' });
            return res.json({ success: true, message: 'El comprobante figura ANULADO en el PRO. Estado local sincronizado a Anulado (A).' });
        } else if (stateTypeId === '09') {
            let recordData = null;
            if (match.id) {
                try {
                    recordData = await api.getDocumentRecord(`${company.url}/api/documents/record/${match.id}`);
                } catch (errRec) {
                    console.warn('[validateProSingle] No se pudo obtener record completo de PRO:', errRec.message);
                }
            }
            const recRoot = recordData || {};
            const recInner = (recordData && typeof recordData.data === 'object' && recordData.data !== null) ? recordData.data : {};
            const extId = recInner.external_id || recRoot.external_id || match.external_id || docu.external_id;

            const extractedLinks = recRoot.links || recInner.links || {
                xml: extId ? `${company.url}/downloads/document/xml/${extId}` : (match.download_xml || null),
                pdf: recInner.download_pdf || (extId ? `${company.url}/downloads/document/pdf/${extId}` : null),
                cdr: extId ? `${company.url}/downloads/document/cdr/${extId}` : (match.download_cdr || null)
            };

            let extractedResponse = recRoot.response || recInner.response || null;
            if (!extractedResponse && recInner.response_message) {
                const rawMsg = String(recInner.response_message).trim();
                const matchCode = rawMsg.match(/^(\d+)\s*-\s*(.+)$/s);
                extractedResponse = {
                    code: matchCode ? matchCode[1] : (recInner.response_type || 'RECHAZADO'),
                    description: matchCode ? matchCode[2] : rawMsg,
                    notes: []
                };
            }
            if (!extractedResponse) {
                extractedResponse = {
                    code: match.sunat_shipping_status || 'RECHAZADO',
                    description: stateDesc,
                    notes: []
                };
            }

            const extractedDataWs = recRoot.data_ws || recInner.data_ws || (recInner.message_text ? {
                message_text: recInner.message_text,
                pdf_a4_filename: recInner.pdf_a4_filename || null,
                full_filename: recInner.filename ? `${recInner.filename}.pdf` : null,
                customer_telephone: recInner.customer_telephone || null
            } : null);

            const responsePayload = {
                success: false,
                data: {
                    ...match,
                    ...recInner
                },
                links: extractedLinks,
                response: extractedResponse,
                ...(extractedDataWs ? { data_ws: extractedDataWs } : {}),
                state: 'R',
                external_id: extId
            };
            await update_document(id_document, company.tenant, responsePayload);
            return res.json({ success: true, message: `El comprobante fue RECHAZADO por SUNAT según el PRO: ${stateDesc}. Estado local actualizado a Rechazado (R).` });
        } else if (stateTypeId === '01' || stateTypeId === '03' || stateTypeId === '13') {
            if (['P', 'C'].includes(docu.states)) {
                return res.json({ success: true, message: `El comprobante está REGISTRADO en el PRO (${stateDesc}) pero PENDIENTE de envío a SUNAT. Se mantiene en ${docu.states} (espera de anulación).` });
            }
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'Y' });
            return res.json({ 
                success: true, 
                message: `ATENCIÓN: El comprobante está REGISTRADO en el PRO (${stateDesc}) pero PENDIENTE de envío a SUNAT. Usa la opción 'Forzar Envío PRO -> SUNAT' para declararlo.` 
            });
        } else {
            return res.json({ success: true, message: `El comprobante existe en el PRO con estado: ${stateDesc} (Código: ${stateTypeId}).` });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Error al consultar estado en el PRO', error: error.message });
    }
};

const forceSendProToSunat = async (req, res, next) => {
    try {
        const { id_company, id_document } = req.body;
        const company = await selectApiCompanyById(id_company);
        if (!company) {
            return res.json({ success: false, message: 'Company Error!' });
        }
        
        const docu = await select_document_by_id(id_document, company.tenant);
        if (!docu) {
            return res.json({ success: false, message: 'Document Finding Error!' });
        }

        if (docu.type === '80') {
            return res.json({ success: false, message: 'Las Notas de Venta (tipo 80) son documentos internos y no se declaran ante SUNAT.' });
        }

        if (docu.type === '09' || docu.type === '31') {
            return res.json({ success: false, message: 'Las Guías de Remisión (tipo 09/31) se procesan por el módulo de Guías y no mediante este reenvío.' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateEmision = new Date(docu.date);
        dateEmision.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - dateEmision.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        const serieClean = String(docu.serie || '').trim();
        let limitDays = 30;
        let docuLabel = 'boletas';
        if (docu.type === '01' || (serieClean && serieClean.toUpperCase().startsWith('F'))) {
            limitDays = 3;
            docuLabel = 'facturas';
        }

        if (diffDays > limitDays) {
            return res.json({ 
                success: false, 
                message: `No se puede forzar el envío: El comprobante superó el plazo máximo permitido por SUNAT (${limitDays} días para ${docuLabel}).` 
            });
        }

        const result = await sendDoc(company, docu);

        if (result.state === 'E' || result.state === 'P' || result.success) {
            const msg = result.state === 'P' 
                ? '¡Éxito! Comprobante enviado al PRO y puesto en cola de anulación (P).' 
                : '¡Éxito! Comprobante forzado y declarado a SUNAT a través del PRO correctamente.';
            return res.json({ success: true, message: msg });
        } else if (result.state === 'R') {
            return res.json({ success: false, message: `SUNAT rechazó el comprobante al forzar el envío: ${typeof result.message === 'string' ? result.message : JSON.stringify(result.message)}` });
        } else {
            const errorMsg = typeof result.message === 'string' ? result.message : JSON.stringify(result.message);
            return res.json({ success: false, message: `Resultado del reenvío PRO -> SUNAT: ${errorMsg || 'No completado'}` });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Error interno al forzar envío PRO -> SUNAT', error: error.message });
    }
};

const executeUnifiedValidation = async (company, docu) => {
    const id_document = docu.id_document;
    if (docu.type === '80') {
        return { success: false, message: 'Las Notas de Venta (tipo 80) son documentos internos y no se registran ante SUNAT ni el PRO.' };
    }

    if (docu.type === '09' || docu.type === '31') {
        return { success: false, message: 'Las Guías de Remisión (tipo 09/31) se procesan por el módulo de Guías.' };
    }

    const serieClean = String(docu.serie || '').trim();
    const numeroClean = String(docu.numero || '').trim();
    let fechaBase = docu.date;
    try {
        if (docu.json_format) {
            const parsed = typeof docu.json_format === 'string' ? JSON.parse(docu.json_format) : docu.json_format;
            if (parsed.fecha_de_emision) fechaBase = parsed.fecha_de_emision;
        }
    } catch (e) {}

    const fechaEmision = formatDateForSunat(fechaBase);

    // PASO 1: Preguntar a SUNAT (Fuente de Verdad Principal)
    let sunatResponse = null;
    let sunatNetworkError = false;
    try {
        sunatResponse = await validateVoucherOnSunat({
            ruc: company.company_number,
            codigoComp: docu.type,
            serie: serieClean,
            numero: numeroClean,
            fechaEmision: fechaEmision,
            monto: Number(Number(docu.amount || 0).toFixed(2)),
        });
    } catch (sunatErr) {
        console.error('Error al consultar SUNAT directamente:', sunatErr.message);
        sunatNetworkError = true;
    }

    const estadoCp = String(sunatResponse?.data?.estadoCp || '');

    if (estadoCp === '1' || estadoCp === '3') {
        if (docu.states === 'P' || docu.states === 'C') {
            return { 
                success: true, 
                sunat_status: 'ACEPTADO',
                final_state: docu.states,
                message: `SUNAT: El comprobante está ACEPTADO en SUNAT y se mantiene en espera de anulación (Estado: ${docu.states}).` 
            };
        }
        await update_document_state(id_document, company.tenant, { id: id_document, state: 'E' });
        return { 
            success: true, 
            sunat_status: 'ACEPTADO',
            final_state: 'E',
            message: 'SUNAT: El comprobante existe y está ACEPTADO en SUNAT. Estado local sincronizado a Enviado (E).' 
        };
    } else if (estadoCp === '2') {
        await update_document_state(id_document, company.tenant, { id: id_document, state: 'A' });
        return { 
            success: true, 
            sunat_status: 'ANULADO',
            final_state: 'A',
            message: 'SUNAT: El comprobante existe y está ANULADO en SUNAT. Estado local sincronizado a Anulado (A).' 
        };
    } else if (estadoCp === '4') {
        await update_document_state(id_document, company.tenant, { id: id_document, state: 'R' });
        return { 
            success: true, 
            sunat_status: 'RECHAZADO',
            final_state: 'R',
            message: 'SUNAT: El comprobante fue RECHAZADO por SUNAT. Estado local actualizado a Rechazado (R).' 
        };
    }

    // PASO 2: SUNAT responde No Encontrado (0) o Error de Red. Verificar en PRO.
    if (!company.url || !company.token) {
        if (['P', 'C'].includes(docu.states)) {
            return {
                success: false,
                sunat_status: sunatNetworkError ? 'ERROR_RED' : 'NO_ENCONTRADO',
                pro_status: 'SIN_CONFIGURACION_PRO',
                final_state: docu.states,
                message: `No se pudo verificar en el PRO porque la empresa no tiene URL/Token configurados. El comprobante se mantiene en ${docu.states} (espera de anulación).`
            };
        }
        let isAnulation = ['A', 'S', 'P', 'C', 'Z'].includes(docu.states);
        if (!isAnulation && docu.response_send) {
            const prev = parseJsonField(docu.response_send, {});
            if (prev?.original_intention === 'S') isAnulation = true;
        }
        let nextState = isAnulation ? 'S' : 'N';
        await pool.query(`UPDATE ${company.tenant}.document SET states = $1, external_id = NULL, modified = NOW() WHERE id_document = $2`, [nextState, id_document]);
        return { 
            success: false, 
            message: `No encontrado en SUNAT. La empresa no cuenta con URL/Token del PRO para verificar. Estado local: ${nextState}.` 
        };
    }

    const dateBaseISO = formatDateISO(fechaBase) || (typeof docu.date === 'string' ? docu.date.slice(0, 10) : new Date(docu.date).toISOString().slice(0, 10));
    const dateObj = new Date(`${dateBaseISO}T12:00:00Z`);
    const dayBefore = new Date(dateObj.getTime() - 86400000).toISOString().slice(0, 10);
    const dayAfter = new Date(dateObj.getTime() + 86400000).toISOString().slice(0, 10);

    const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token);
    const apidocs = await api.getListDocumentByDate(`${company.url}/api/documents/lists/${dayBefore}/${dayAfter}`);

    const numeroInt = parseInt(numeroClean, 10);

    const match = Array.isArray(apidocs?.data) ? apidocs.data.find(el => {
        if (docu.external_id && el.external_id === docu.external_id) return true;
        if (el.number) {
            const parts = String(el.number).trim().split('-');
            if (parts.length === 2) {
                const elSerie = parts[0].trim().toUpperCase();
                const elNum = parseInt(parts[1].trim(), 10);
                if (elSerie === serieClean.toUpperCase() && elNum === numeroInt) return true;
            }
        }
        if (el.filename && el.filename.includes(`${serieClean}-${numeroClean}`)) return true;
        return false;
    }) : null;

    // PASO 3 & 4: Regularizar PRO y Faqture
    if (match) {
        const stateTypeId = String(match.state_type_id || '');
        const hasCdr = match.has_cdr === true || (match.has_cdr !== false && !!match.download_cdr);

        if (stateTypeId === '05' && hasCdr) {
            if (docu.states === 'P' || docu.states === 'C') {
                return { 
                    success: true, 
                    sunat_status: 'NO_ENCONTRADO_DIRECTO',
                    pro_status: 'ACEPTADO',
                    final_state: docu.states,
                    message: `PRO: El comprobante figura ACEPTADO en el PRO y se mantiene en espera de anulación (Estado: ${docu.states}).` 
                };
            }
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'E' });
            return { 
                success: true, 
                sunat_status: 'NO_ENCONTRADO_DIRECTO',
                pro_status: 'ACEPTADO',
                final_state: 'E',
                message: 'PRO: El comprobante figura ACEPTADO con CDR en el PRO. Estado sincronizado a Enviado (E).' 
            };
        } else if (stateTypeId === '11') {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'A' });
            return { 
                success: true, 
                sunat_status: 'NO_ENCONTRADO_DIRECTO',
                pro_status: 'ANULADO',
                final_state: 'A',
                message: 'PRO: El comprobante figura ANULADO en el PRO. Estado sincronizado a Anulado (A).' 
            };
        } else if (stateTypeId === '09') {
            let recordData = null;
            if (match.id) {
                try {
                    recordData = await api.getDocumentRecord(`${company.url}/api/documents/record/${match.id}`);
                } catch (errRec) {
                    console.warn('[executeUnifiedValidation] No se pudo obtener record completo de PRO:', errRec.message);
                }
            }
            const recRoot = recordData || {};
            const recInner = (recordData && typeof recordData.data === 'object' && recordData.data !== null) ? recordData.data : {};
            const extId = recInner.external_id || recRoot.external_id || match.external_id || docu.external_id;

            const extractedLinks = recRoot.links || recInner.links || {
                xml: extId ? `${company.url}/downloads/document/xml/${extId}` : (match.download_xml || null),
                pdf: recInner.download_pdf || (extId ? `${company.url}/downloads/document/pdf/${extId}` : null),
                cdr: extId ? `${company.url}/downloads/document/cdr/${extId}` : (match.download_cdr || null)
            };

            let extractedResponse = recRoot.response || recInner.response || null;
            if (!extractedResponse && recInner.response_message) {
                const rawMsg = String(recInner.response_message).trim();
                const matchCode = rawMsg.match(/^(\d+)\s*-\s*(.+)$/s);
                extractedResponse = {
                    code: matchCode ? matchCode[1] : (recInner.response_type || 'RECHAZADO'),
                    description: matchCode ? matchCode[2] : rawMsg,
                    notes: []
                };
            }
            if (!extractedResponse) {
                extractedResponse = {
                    code: match.sunat_shipping_status || 'RECHAZADO',
                    description: match.state_type_description || 'Rechazado',
                    notes: []
                };
            }

            const extractedDataWs = recRoot.data_ws || recInner.data_ws || (recInner.message_text ? {
                message_text: recInner.message_text,
                pdf_a4_filename: recInner.pdf_a4_filename || null,
                full_filename: recInner.filename ? `${recInner.filename}.pdf` : null,
                customer_telephone: recInner.customer_telephone || null
            } : null);

            const responsePayload = {
                success: false,
                data: {
                    ...match,
                    ...recInner
                },
                links: extractedLinks,
                response: extractedResponse,
                ...(extractedDataWs ? { data_ws: extractedDataWs } : {}),
                state: 'R',
                external_id: extId
            };
            await update_document(id_document, company.tenant, responsePayload);
            return { 
                success: true, 
                sunat_status: 'NO_ENCONTRADO_DIRECTO',
                pro_status: 'RECHAZADO',
                final_state: 'R',
                message: 'PRO: El comprobante fue RECHAZADO por SUNAT en el PRO. Estado sincronizado a Rechazado (R).' 
            };
        }

        if (sunatNetworkError) {
            if (['P', 'C'].includes(docu.states)) {
                return { 
                    success: true, 
                    sunat_status: 'ERROR_RED',
                    pro_status: 'REGISTRADO',
                    final_state: docu.states,
                    message: `No se pudo verificar en SUNAT por error de red. El comprobante se mantiene en ${docu.states} (espera de anulación).` 
                };
            }
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'Y' });
            return { 
                success: true, 
                sunat_status: 'ERROR_RED',
                pro_status: 'REGISTRADO',
                final_state: 'Y',
                message: `No se pudo verificar en SUNAT por error de red. El comprobante figura en el PRO y se mantiene en estado Y.` 
            };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateEmisionObj = new Date(docu.date);
        dateEmisionObj.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today.getTime() - dateEmisionObj.getTime()) / (1000 * 60 * 60 * 24));
        let limitDays = (docu.type === '01' || serieClean.toUpperCase().startsWith('F')) ? 3 : 30;

        if (diffDays > limitDays) {
            if (['P', 'C'].includes(docu.states)) {
                return { 
                    success: true, 
                    sunat_status: 'NO_ENCONTRADO',
                    pro_status: 'REGISTRADO_PLAZO_VENCIDO',
                    final_state: docu.states,
                    message: `El comprobante está en el PRO pero superó el plazo máximo de envío a SUNAT (${limitDays} días). Se mantiene en ${docu.states} (espera de anulación).` 
                };
            }
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'Y' });
            return { 
                success: true, 
                sunat_status: 'NO_ENCONTRADO',
                pro_status: 'REGISTRADO_PLAZO_VENCIDO',
                final_state: 'Y',
                message: `El comprobante está en el PRO pero superó el plazo máximo de envío a SUNAT (${limitDays} días). Queda en estado Y.` 
            };
        }

        const sendResult = await sendDoc(company, docu);

        if (sendResult.state === 'E' || sendResult.state === 'P' || sendResult.success || (typeof sendResult.message === 'string' && sendResult.message.includes('ya se encuentra registrado'))) {
            const finalSt = sendResult.state || 'E';
            if (['P', 'C'].includes(docu.states) && finalSt !== 'A') {
                return { 
                    success: true, 
                    sunat_status: 'DECLARADO',
                    pro_status: 'ACEPTADO',
                    final_state: docu.states,
                    message: `Comprobante declarado en SUNAT. Se mantiene en ${docu.states} (espera de anulación).` 
                };
            }
            await update_document_state(id_document, company.tenant, { id: id_document, state: finalSt });
            return { 
                success: true, 
                sunat_status: 'DECLARADO',
                pro_status: 'ACEPTADO',
                final_state: finalSt,
                message: `REGULARIZADO: Comprobante forzado y declarado a SUNAT exitosamente (Estado: ${finalSt}).` 
            };
        } else {
            const errMsg = typeof sendResult.message === 'string' ? sendResult.message : JSON.stringify(sendResult.message);
            if (['P', 'C'].includes(docu.states)) {
                return { 
                    success: false, 
                    sunat_status: 'NO_ENCONTRADO',
                    pro_status: 'PENDIENTE',
                    final_state: docu.states,
                    message: `Comprobante registrado en PRO pero falló al declarar a SUNAT: ${errMsg}. Se mantiene en ${docu.states} (espera de anulación).` 
                };
            }
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'Y' });
            return { 
                success: false, 
                sunat_status: 'NO_ENCONTRADO',
                pro_status: 'PENDIENTE',
                final_state: 'Y',
                message: `Comprobante registrado en PRO pero falló al declarar a SUNAT: ${errMsg}. Queda en estado Y.` 
            };
        }
    } else {
        // Salvaguarda: si el PRO en un intento previo ya respondió explícitamente que ya se encuentra registrado,
        // sabemos con certeza que existe en el PRO (aunque no figure en la ventana de 3 días del listado).
        let isAlreadyInPro = false;
        if (docu.response_send) {
            const prev = parseJsonField(docu.response_send, {});
            const msg = typeof prev?.message === 'string' ? prev.message : (prev?.message ? JSON.stringify(prev.message) : '');
            if (msg.includes('ya se encuentra registrado')) {
                isAlreadyInPro = true;
            }
        }

        if (isAlreadyInPro) {
            const sendResult = await sendDoc(company, docu);
            if (sendResult.state === 'E' || sendResult.state === 'P' || sendResult.success || (typeof sendResult.message === 'string' && sendResult.message.includes('ya se encuentra registrado'))) {
                const finalSt = sendResult.state || 'E';
                if (['P', 'C'].includes(docu.states) && finalSt !== 'A') {
                    return {
                        success: true,
                        sunat_status: 'DECLARADO',
                        pro_status: 'REGISTRADO_PREVIAMENTE',
                        final_state: docu.states,
                        message: `PRO: El comprobante ya se encontraba registrado. Se mantiene en ${docu.states} (espera de anulación).`
                    };
                }
                await update_document_state(id_document, company.tenant, { id: id_document, state: finalSt });
                return {
                    success: true,
                    sunat_status: 'DECLARADO',
                    pro_status: 'REGISTRADO_PREVIAMENTE',
                    final_state: finalSt,
                    message: `PRO: El comprobante ya se encontraba registrado en el PRO. Sincronizado a ${finalSt}.`
                };
            } else {
                if (['P', 'C'].includes(docu.states)) {
                    return {
                        success: true,
                        sunat_status: 'NO_ENCONTRADO',
                        pro_status: 'REGISTRADO_PREVIAMENTE',
                        final_state: docu.states,
                        message: `El comprobante ya existe en el PRO pero no pudo declararse a SUNAT. Se mantiene en ${docu.states} (espera de anulación).`
                    };
                }
                await update_document_state(id_document, company.tenant, { id: id_document, state: 'Y' });
                return {
                    success: true,
                    sunat_status: 'NO_ENCONTRADO',
                    pro_status: 'REGISTRADO_PREVIAMENTE',
                    final_state: 'Y',
                    message: `El comprobante ya existe en el PRO pero no pudo declararse a SUNAT. Queda en estado Y.`
                };
            }
        }

        if (['P', 'C'].includes(docu.states)) {
            return {
                success: false,
                sunat_status: 'NO_ENCONTRADO',
                pro_status: 'NO_EXISTE',
                final_state: docu.states,
                message: `El comprobante NO EXISTE en SUNAT ni en el PRO. Se mantiene en ${docu.states} (espera de anulación); no se modifica su estado.`
            };
        }

        let isAnulation = ['A', 'S', 'P', 'C', 'Z'].includes(docu.states);
        if (!isAnulation && docu.response_send) {
            const prev = parseJsonField(docu.response_send, {});
            if (prev?.original_intention === 'S') isAnulation = true;
        }
        const targetState = isAnulation ? 'S' : 'N';
        if (targetState === 'N') {
            await pool.query(`UPDATE ${company.tenant}.document SET states = 'N', external_id = NULL, modified = NOW() WHERE id_document = $1`, [id_document]);
        } else {
            // Comprobantes con intención de anularse (S, P, C, Z): se restablecen a 'S' con external_id = NULL
            // para que Tarea 1 lo emita primero al PRO/SUNAT y luego transicione a 'P' (Por anular)
            await pool.query(`UPDATE ${company.tenant}.document SET states = 'S', external_id = NULL, modified = NOW() WHERE id_document = $1`, [id_document]);
        }
        return { 
            success: true, 
            sunat_status: 'NO_ENCONTRADO',
            pro_status: 'NO_EXISTE',
            final_state: targetState,
            message: targetState === 'S' 
                ? 'El comprobante NO EXISTE en SUNAT ni en el PRO. Estado sincronizado a S para su emisión y posterior anulación.'
                : 'El comprobante NO EXISTE en SUNAT ni en el PRO. Estado sincronizado a N para su emisión limpia.'
        };
    }
};

const validateUnifiedSingle = async (req, res, next) => {
    try {
        const { id_company, id_document } = req.body;
        const company = await selectApiCompanyById(id_company);
        if (!company) {
            return res.json({ success: false, message: 'Company Error!' });
        }

        const docu = await select_document_by_id(id_document, company.tenant);
        if (!docu) {
            return res.json({ success: false, message: 'Document Finding Error!' });
        }

        const result = await executeUnifiedValidation(company, docu);
        return res.json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Error interno en validación unificada', error: error.message });
    }
};

const getCompanyErrorDocuments = async (req, res, next) => {
    try {
        const { id_company } = req.body;
        const company = await selectApiCompanyById(id_company);
        if (!company) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada' });
        }

        const tenant = company.tenant;
        const query = `
            SELECT id_document, cod_sale, serie, numero, type, states, date,
                   TO_CHAR(date::DATE, 'YYYY-MM-DD') AS emission_date,
                   amount, customer, customer_number, external_id
            FROM ${tenant}.document 
            WHERE type NOT IN ('80', '09', '31')
              AND (
                  states IN ('X', 'M', 'S', 'Z', 'P', 'C')
                  OR (states = 'Y' AND type IN ('03', '07', '08'))
              )
            ORDER BY id_document ASC
        `;
        const result = await pool.query(query);
        const docs = result.rows || [];

        let send_errors = 0;
        let void_errors = 0;
        let void_pending = 0;
        let query_pending = 0;

        for (const d of docs) {
            if (['X', 'M', 'S'].includes(d.states)) {
                send_errors++;
            } else if (d.states === 'Z') {
                void_errors++;
            } else if (['P', 'C'].includes(d.states)) {
                void_pending++;
            } else if (d.states === 'Y') {
                query_pending++;
            }
        }

        return res.json({
            success: true,
            tenant: company.tenant,
            company_name: company.company,
            summary: {
                send_errors,
                void_errors,
                void_pending,
                query_pending,
                total: docs.length,
            },
            documents: docs,
        });
    } catch (error) {
        console.error('Error in getCompanyErrorDocuments:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

const repairBadGateways = async (req, res, next) => {
    try {
        const { id_company } = req.body || {};
        let companies = [];
        if (id_company) {
            const comp = await selectApiCompanyById(id_company);
            if (comp) companies.push(comp);
        } else {
            companies = await selectAllApiCompany();
        }

        const results = [];
        for (const company of companies) {
            const tenant = company.tenant;
            if (!tenant || !/^[a-zA-Z0-9_]+$/.test(tenant)) continue;

            const q = `
                SELECT id_document, cod_sale, serie, numero, json_format, states, response_send, external_id, date 
                FROM ${tenant}.document 
                WHERE response_send::text LIKE '%Bad Gateway%' 
                   OR response_send::text LIKE '%Gateway Timeout%' 
                   OR response_send::text LIKE '%ya se encuentra registrado%'
                ORDER BY id_document DESC
            `;
            const { rows } = await pool.query(q);
            if (!rows || !rows.length) continue;

            for (const doc of rows) {
                const recovered = await recoverExistingDocumentFromPro(company, doc);
                if (recovered) {
                    await update_document(doc.id_document, tenant, recovered);
                    results.push({
                        tenant,
                        id_document: doc.id_document,
                        document: `${doc.serie}-${doc.numero}`,
                        previous_state: doc.states,
                        new_state: recovered.state,
                        success: true,
                    });
                } else {
                    results.push({
                        tenant,
                        id_document: doc.id_document,
                        document: `${doc.serie}-${doc.numero}`,
                        previous_state: doc.states,
                        success: false,
                        message: 'No encontrado en PRO para esa fecha o correlativo',
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: `Proceso de reparación finalizado. Comprobantes procesados: ${results.length}`,
            repaired: results.filter(r => r.success).length,
            data: results,
        });
    } catch (error) {
        console.error('Error en repairBadGateways:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

const NC_LIMA_TZ = 'America/Lima';
const NC_TOTAL_MOTIVES = new Set(['01', '06']);
const ncInFlight = new Set();

const ncGetLimaParts = (value = new Date()) => {
    if (value === null || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: NC_LIMA_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {});
};

const ncGetLimaTodayIso = () => {
    const p = ncGetLimaParts();
    return `${p.year}-${p.month}-${p.day}`;
};

const ncGetLimaTimeHms = () => {
    const p = ncGetLimaParts();
    return `${p.hour}:${p.minute}:${p.second}`;
};

const ncToLimaIsoDate = (value) => {
    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        if (/^\d{4}-\d{2}-\d{2}[ T]/.test(value) && !/(?:z|[+-]\d{2}:?\d{2})$/i.test(value)) {
            return value.slice(0, 10);
        }
    }
    const p = ncGetLimaParts(value);
    return p ? `${p.year}-${p.month}-${p.day}` : null;
};

const ncIsoToUtc = (iso) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const utc = Date.UTC(y, m - 1, d);
    if (Number.isNaN(utc)) return null;
    const parsed = new Date(utc);
    if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
        return null;
    }
    return utc;
};

const ncDaysBetween = (fromIso, toIso) => {
    const from = ncIsoToUtc(fromIso);
    const to = ncIsoToUtc(toIso);
    if (from === null || to === null) return null;
    return Math.floor((to - from) / 86400000);
};

const ncParseNumber = (data, fallbackSerie) => {
    const candidates = [];
    if (data?.number) candidates.push(String(data.number).trim());
    if (data?.number_full) candidates.push(String(data.number_full).trim());
    if (data?.serie_documento && data?.numero_documento) {
        candidates.push(`${String(data.serie_documento).trim()}-${String(data.numero_documento).trim()}`);
    }
    for (const raw of candidates) {
        const full = raw.match(/^([A-Za-z0-9]{4})-(\d{1,12})$/);
        if (full) {
            const numero = Number(full[2]);
            if (Number.isSafeInteger(numero) && numero > 0) {
                const serie = full[1].toUpperCase();
                return { serie, numero, numberFull: `${serie}-${full[2]}` };
            }
        }
        if (/^\d{1,12}$/.test(raw)) {
            const numero = Number(raw);
            if (Number.isSafeInteger(numero) && numero > 0) {
                return { serie: fallbackSerie, numero, numberFull: `${fallbackSerie}-${raw}` };
            }
        }
    }
    return null;
};

const createCreditNotesForExpired = async (req, res, next) => {
    try {
        const { id_company, id_documents, serie_factura_nc, serie_boleta_nc, fecha_emision_nc, codigo_motivo_nc, descripcion_motivo_nc } = req.body || {};

        if (!id_company) {
            return res.status(400).json({ success: false, message: 'El id_company es requerido.' });
        }
        if (!Array.isArray(id_documents) || id_documents.length === 0) {
            return res.status(400).json({ success: false, message: 'Debe seleccionar al menos un comprobante para emitir Nota de Crédito.' });
        }
        if (id_documents.length > 50) {
            return res.status(400).json({ success: false, message: 'El máximo permitido es 50 comprobantes por solicitud.' });
        }

        const company = await selectApiCompanyById(id_company);
        if (!company || !company.tenant) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
        }
        if (!company.url || !company.token) {
            return res.status(400).json({ success: false, message: 'La empresa no tiene URL o token del PRO configurados.' });
        }

        const tenant = company.tenant;
        if (!/^[a-zA-Z0-9_]+$/.test(tenant)) {
            return res.status(400).json({ success: false, message: 'Tenant inválido.' });
        }

        const todayIso = ncGetLimaTodayIso();
        const horaEmision = ncGetLimaTimeHms();
        const fechaEmision = fecha_emision_nc ? String(fecha_emision_nc).trim() : todayIso;

        if (ncIsoToUtc(fechaEmision) === null) {
            return res.status(400).json({ success: false, message: 'fecha_emision_nc debe tener formato YYYY-MM-DD.' });
        }
        if (fechaEmision > todayIso) {
            return res.status(400).json({ success: false, message: 'La fecha de emisión de la NC no puede ser futura.' });
        }

        const motivoDoc = String(codigo_motivo_nc || '01').trim().padStart(2, '0');
        if (!NC_TOTAL_MOTIVES.has(motivoDoc)) {
            return res.status(400).json({ success: false, message: 'Motivo no soportado. Use 01 (anulación de la operación) o 06 (devolución total). Los motivos 02, 03 y 07 requieren datos corregidos o devolución por ítem.' });
        }
        const motivoDesc = (descripcion_motivo_nc ? String(descripcion_motivo_nc).trim() : 'ANULACION DE LA OPERACION').slice(0, 250);

        const serieFacturaNc = String(serie_factura_nc || 'FC01').trim().toUpperCase();
        const serieBoletaNc = String(serie_boleta_nc || 'BC01').trim().toUpperCase();
        if (!/^F[A-Z0-9]{3}$/.test(serieFacturaNc) || !/^B[A-Z0-9]{3}$/.test(serieBoletaNc)) {
            return res.status(400).json({ success: false, message: 'Las series de NC deben tener 4 caracteres: F### para facturas y B### para boletas.' });
        }

        const invalidIds = [];
        const normalizedIds = [];
        for (const rawId of id_documents) {
            const parsedId = Number(rawId);
            if (Number.isInteger(parsedId) && parsedId > 0) normalizedIds.push(parsedId);
            else invalidIds.push(rawId);
        }
        const uniqueIds = [...new Set(normalizedIds)];
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const invalidId of invalidIds) {
            results.push({ id_document: invalidId, success: false, message: 'ID de comprobante inválido.' });
            errorCount++;
        }

        for (let idx = 0; idx < uniqueIds.length; idx++) {
            const id_doc = uniqueIds[idx];
            if (idx > 0) await new Promise((resolve) => setTimeout(resolve, 250));
            const lockKey = `${id_company}:${id_doc}`;
            if (ncInFlight.has(lockKey)) {
                results.push({ id_document: id_doc, success: false, message: 'Ya existe una emisión de NC en proceso para este comprobante. Espere a que finalice.' });
                errorCount++;
                continue;
            }
            ncInFlight.add(lockKey);
            try {
                const { rows: docRows } = await pool.query(
                    `SELECT id_document, cod_sale, type, serie, numero, date,
                            TO_CHAR(date::DATE, 'YYYY-MM-DD') AS emission_date, amount,
                            customer_number, customer, json_format, response_send, response_anulate, states, external_id
                     FROM ${tenant}.document
                     WHERE id_document = $1`,
                    [id_doc]
                );

                if (docRows.length === 0) {
                    results.push({ id_document: id_doc, document: `ID ${id_doc}`, success: false, message: 'Comprobante no encontrado en la base de datos local.' });
                    errorCount++;
                    continue;
                }

                const doc = docRows[0];
                const docLabel = `${doc.serie || ''}-${doc.numero || ''}`.trim();

                if (!['01', '03'].includes(String(doc.type))) {
                    results.push({ id_document: id_doc, document: docLabel, success: false, message: 'Solo se pueden regularizar facturas (01) y boletas (03) con Nota de Crédito.' });
                    errorCount++;
                    continue;
                }

                if (!['P', 'C'].includes(String(doc.states))) {
                    results.push({ id_document: id_doc, document: docLabel, success: false, message: `El comprobante está en estado ${doc.states}; solo se permite regularizar comprobantes en P o C.` });
                    errorCount++;
                    continue;
                }

                const docIso = doc.emission_date || ncToLimaIsoDate(doc.date);
                const age = ncDaysBetween(docIso, todayIso);
                if (docIso === null || age === null) {
                    results.push({ id_document: id_doc, document: docLabel, success: false, message: 'La fecha del comprobante es inválida.' });
                    errorCount++;
                    continue;
                }
                if (age <= 7) {
                    results.push({ id_document: id_doc, document: docLabel, success: false, message: `El comprobante tiene ${age} días; aún está dentro del plazo legal de baja (7 días). Use la anulación ordinaria.` });
                    errorCount++;
                    continue;
                }
                if (fechaEmision < docIso) {
                    results.push({ id_document: id_doc, document: docLabel, success: false, message: 'La fecha de la NC no puede ser anterior a la fecha del comprobante original.' });
                    errorCount++;
                    continue;
                }

                const refSend = parseJsonField(doc.response_send, {});
                const refAnulate = parseJsonField(doc.response_anulate, {});
                const refExternalId = refSend?.data?.external_id || refSend?.external_id || refAnulate?.data?.external_id || refAnulate?.external_id || doc.external_id || null;

                if (!refExternalId) {
                    results.push({ id_document: id_doc, document: docLabel, success: false, message: 'El comprobante no tiene external_id registrado del facturador PRO.' });
                    errorCount++;
                    continue;
                }

                let originalJson = parseJsonField(doc.json_format, null);
                if (typeof originalJson === 'string') {
                    try { originalJson = JSON.parse(originalJson); } catch (e) {}
                }
                if (!originalJson || typeof originalJson !== 'object') {
                    results.push({ id_document: id_doc, document: docLabel, success: false, message: 'Formato JSON del comprobante original inválido o corrupto.' });
                    errorCount++;
                    continue;
                }

                if (!Array.isArray(originalJson.items) || originalJson.items.length === 0) {
                    results.push({ id_document: id_doc, document: docLabel, success: false, message: 'El JSON del comprobante original no contiene items; no es posible emitir una NC total.' });
                    errorCount++;
                    continue;
                }

                const existingNc = await pool.query(
                    `SELECT id_document, states, serie, numero
                     FROM ${tenant}.document
                     WHERE type = '07'
                       AND (json_format->'documento_afectado'->>'external_id' = $1
                            OR json_format::text LIKE $2)
                     ORDER BY id_document DESC`,
                    [refExternalId, `%${refExternalId}%`]
                );

                const existingNcRows = existingNc.rows;
                const acceptedNc = existingNcRows.find((nc) => nc.states === 'E');
                const pendingNc = existingNcRows.find((nc) => ['Y', 'P', 'C'].includes(nc.states));
                const annulledNc = existingNcRows.find((nc) => nc.states === 'A');

                if (acceptedNc) {
                    const ncLabel = `${acceptedNc.serie}-${acceptedNc.numero}`;
                    const updateRes = await pool.query(
                        `UPDATE ${tenant}.document SET states = 'A', modified = NOW() WHERE id_document = $1 AND states IN ('P', 'C')`,
                        [id_doc]
                    );
                    const marked = updateRes.rowCount > 0;
                    results.push({
                        id_document: id_doc,
                        document: docLabel,
                        success: true,
                        nc_number: ncLabel,
                        nc_state: 'E',
                        message: marked
                            ? `Ya existe la NC ${ncLabel} aceptada. Comprobante marcado como ANULADO (A).`
                            : `Ya existe la NC ${ncLabel} aceptada, pero el comprobante ya no está en P/C; no se modificó.`
                    });
                    successCount++;
                    continue;
                }

                if (pendingNc) {
                    const ncLabel = `${pendingNc.serie}-${pendingNc.numero}`;
                    results.push({ id_document: id_doc, document: docLabel, success: false, nc_number: ncLabel, nc_state: pendingNc.states, message: `Ya existe la NC ${ncLabel} en estado ${pendingNc.states}. No se emite otra; requiere revisión manual.` });
                    errorCount++;
                    continue;
                }

                if (annulledNc) {
                    const ncLabel = `${annulledNc.serie}-${annulledNc.numero}`;
                    results.push({ id_document: id_doc, document: docLabel, success: false, nc_number: ncLabel, nc_state: 'A', message: `Ya existe la NC ${ncLabel}, pero está ANULADA (A). El comprobante original no se modifica; requiere revisión manual.` });
                    errorCount++;
                    continue;
                }

                const ncSerie = String(doc.type) === '01' ? serieFacturaNc : serieBoletaNc;
                let token = company.token;
                if (Array.isArray(company.token_series)) {
                    const branch = company.token_series.find(e => Array.isArray(e.series) && e.series.includes(ncSerie));
                    if (branch?.token) token = branch.token;
                }

                const originalCustomer = (originalJson.datos_del_cliente_o_receptor && typeof originalJson.datos_del_cliente_o_receptor === 'object')
                    ? originalJson.datos_del_cliente_o_receptor
                    : {};
                const originalTotals = (originalJson.totales && typeof originalJson.totales === 'object')
                    ? originalJson.totales
                    : {};

                const ncPayload = {
                    serie_documento: ncSerie,
                    numero_documento: '#',
                    fecha_de_emision: fechaEmision,
                    hora_de_emision: horaEmision,
                    codigo_tipo_operacion: originalJson?.codigo_tipo_operacion || '0101',
                    codigo_tipo_documento: '07',
                    codigo_tipo_moneda: originalJson?.codigo_tipo_moneda || 'PEN',
                    fecha_de_vencimiento: fechaEmision,
                    numero_orden_de_compra: originalJson?.numero_orden_de_compra || '',
                    datos_del_cliente_o_receptor: {
                        ...originalCustomer,
                        codigo_tipo_documento_identidad: originalCustomer.codigo_tipo_documento_identidad || (String(doc.type) === '01' ? '6' : '1'),
                        numero_documento: originalCustomer.numero_documento || doc.customer_number || '00000000',
                        apellidos_y_nombres_o_razon_social: originalCustomer.apellidos_y_nombres_o_razon_social || doc.customer || 'CLIENTE VARIOS',
                        codigo_pais: originalCustomer.codigo_pais || 'PE',
                        ubigeo: originalCustomer.ubigeo ?? '',
                        direccion: originalCustomer.direccion || '-'
                    },
                    codigo_motivo_documento: motivoDoc,
                    descripcion_motivo: motivoDesc,
                    documento_afectado: {
                        external_id: refExternalId,
                        codigo_tipo_documento: doc.type
                    },
                    totales: {
                        total_exportacion: 0,
                        total_operaciones_gravadas: Number(doc.amount) || 0,
                        total_operaciones_inafectas: 0,
                        total_operaciones_exoneradas: 0,
                        total_operaciones_gratuitas: 0,
                        total_igv: 0,
                        total_impuestos: 0,
                        total_valor: Number(doc.amount) || 0,
                        total_venta: Number(doc.amount) || 0,
                        ...originalTotals
                    },
                    items: originalJson.items
                };

                const baseUrl = String(company.url).trim().replace(/\/+$/, '');
                const api = new ApiClient(`${baseUrl}/api/documents`, token);
                let resPro = await api.sendDocument(ncPayload);
                const isRateLimit = resPro?.status === 429
                    || (typeof resPro?.message === 'string' && resPro.message.toLowerCase().includes('too many attempts'));
                if ((!resPro || !resPro.success) && isRateLimit) {
                    await new Promise((resolve) => setTimeout(resolve, 2500));
                    resPro = await api.sendDocument(ncPayload);
                }

                if (!resPro || !resPro.success) {
                    let errMsg = 'Error al emitir la Nota de Crédito en el PRO';
                    if (typeof resPro?.message === 'string') errMsg = resPro.message;
                    else if (resPro?.message && typeof resPro.message === 'object') {
                        errMsg = Object.values(resPro.message).flat().join('; ');
                    }
                    if (/ya se encuentra registrado/i.test(errMsg)) {
                        errMsg = `El PRO ya tiene una NC registrada para este comprobante (${errMsg}). Verifique manualmente su serie/número antes de reintentar.`;
                    }
                    results.push({ id_document: id_doc, document: docLabel, success: false, message: errMsg });
                    errorCount++;
                    continue;
                }

                const ncData = Array.isArray(resPro.data)
                    ? (resPro.data[0] || {})
                    : (resPro.data && typeof resPro.data === 'object' ? resPro.data : resPro);
                const ncExternalId = ncData.external_id || null;
                const stateTypeId = String(ncData.state_type_id || '');
                const ncState = stateTypeId === '05' ? 'E' : (stateTypeId === '09' ? 'R' : (stateTypeId === '11' ? 'A' : 'Y'));
                const parsedNumber = ncParseNumber(ncData, ncSerie);

                if (!parsedNumber) {
                    results.push({
                        id_document: id_doc,
                        document: docLabel,
                        success: false,
                        message: `El PRO emitió la NC (${ncExternalId || 'sin external_id'}) pero no devolvió una serie/número válidos. No se registró localmente ni se marcó el original como A.`
                    });
                    errorCount++;
                    continue;
                }

                const { serie: genSerie, numero: genNumero, numberFull: ncNumberFull } = parsedNumber;
                const storedNcPayload = { ...ncPayload, serie_documento: genSerie, numero_documento: String(genNumero) };

                const anulatePayload = {
                    success: ncState !== 'R',
                    anulado_por_nc: ncState === 'E',
                    nc_pending: ncState === 'Y',
                    nc_state: ncState,
                    nc_number: ncNumberFull,
                    nc_serie: genSerie,
                    nc_numero: genNumero,
                    nc_external_id: ncExternalId,
                    message: ncState === 'E'
                        ? `Anulado mediante Nota de Crédito ${ncNumberFull}`
                        : ncState === 'Y'
                            ? `Nota de Crédito ${ncNumberFull} emitida, pendiente de aceptación en SUNAT`
                            : ncState === 'A'
                                ? `Nota de Crédito ${ncNumberFull} anulada; el comprobante original se mantiene`
                                : `Nota de Crédito ${ncNumberFull} rechazada por SUNAT`,
                    date: new Date().toISOString()
                };

                const client = await pool.connect();
                try {
                    await client.query('BEGIN');

                    const insert = await client.query(
                        `INSERT INTO ${tenant}.document (
                            created, modified, date, cod_sale, type, serie, numero,
                            customer_number, customer, amount, states, json_format,
                            response_send, id_company, external_id
                        ) VALUES (
                            NOW(), NOW(), $1, $2, '07', $3, $4,
                            $5, $6, $7, $8, $9,
                            $10, $11, $12
                        )
                        ON CONFLICT (serie, numero) DO NOTHING
                        RETURNING id_document, states`,
                        [
                            `${fechaEmision} ${horaEmision}`,
                            doc.cod_sale || '0',
                            genSerie,
                            genNumero,
                            doc.customer_number || '00000000',
                            doc.customer || 'CLIENTE',
                            doc.amount || 0,
                            ncState,
                            JSON.stringify(storedNcPayload),
                            JSON.stringify(resPro),
                            id_company,
                            ncExternalId
                        ]
                    );

                    let finalNcState = ncState;
                    if (insert.rowCount === 0) {
                        const existing = await client.query(
                            `SELECT states, json_format FROM ${tenant}.document WHERE serie = $1 AND numero = $2 LIMIT 1`,
                            [genSerie, genNumero]
                        );
                        const existingRow = existing.rows[0];
                        const existingJson = parseJsonField(existingRow?.json_format, {});
                        const existingAffected = existingJson?.documento_afectado?.external_id || null;
                        if (!existingAffected || existingAffected !== refExternalId) {
                            await client.query('ROLLBACK');
                            results.push({
                                id_document: id_doc,
                                document: docLabel,
                                success: false,
                                message: `Conflicto: la NC ${genSerie}-${genNumero} ya existe para otro comprobante. No se modificó el original.`
                            });
                            errorCount++;
                            continue;
                        }
                        finalNcState = existingRow?.states || 'Y';
                    }

                    const shouldAnnul = finalNcState === 'E';
                    const finalAnulatePayload = {
                        ...anulatePayload,
                        success: finalNcState !== 'R',
                        anulado_por_nc: shouldAnnul,
                        nc_pending: finalNcState === 'Y',
                        nc_state: finalNcState
                    };

                    const updateRes = await client.query(
                        `UPDATE ${tenant}.document
                         SET states = CASE WHEN $3 THEN 'A' ELSE states END,
                             response_anulate = $1::jsonb,
                             modified = NOW()
                         WHERE id_document = $2 AND states IN ('P', 'C')`,
                        [JSON.stringify(finalAnulatePayload), id_doc, shouldAnnul]
                    );
                    const originalUpdated = updateRes.rowCount > 0;

                    await client.query('COMMIT');

                    const isRejected = finalNcState === 'R';
                    let resultMessage;
                    if (shouldAnnul) {
                        resultMessage = originalUpdated
                            ? `Nota de Crédito ${ncNumberFull} aceptada. Comprobante original marcado como ANULADO (A).`
                            : `Nota de Crédito ${ncNumberFull} aceptada, pero el comprobante ya no está en P/C; no se modificó.`;
                    } else if (isRejected) {
                        resultMessage = `Nota de Crédito ${ncNumberFull} rechazada por SUNAT. El comprobante original se mantiene en ${doc.states}.`;
                    } else if (finalNcState === 'A') {
                        resultMessage = `Nota de Crédito ${ncNumberFull} anulada. El comprobante original se mantiene en ${doc.states}.`;
                    } else {
                        resultMessage = `Nota de Crédito ${ncNumberFull} registrada en estado ${finalNcState}. El comprobante original se mantiene en ${doc.states} hasta la aceptación de la NC.${originalUpdated ? '' : ' No se pudo actualizar su response_anulate.'}`;
                    }

                    results.push({
                        id_document: id_doc,
                        document: docLabel,
                        success: !isRejected,
                        nc_number: ncNumberFull,
                        nc_state: finalNcState,
                        message: resultMessage
                    });
                    if (isRejected) errorCount++; else successCount++;
                } catch (dbErr) {
                    try { await client.query('ROLLBACK'); } catch (e) {}
                    dbErr.ncNumber = ncNumberFull;
                    dbErr.ncExternalId = ncExternalId;
                    throw dbErr;
                } finally {
                    client.release();
                }
            } catch (docErr) {
                console.error(`[createCreditNotesForExpired] Error procesando doc ${id_doc}:`, docErr);
                const ncInfo = docErr?.ncNumber
                    ? ` La NC ${docErr.ncNumber} ya fue emitida en el PRO (external_id: ${docErr.ncExternalId || 'N/D'}) y requiere conciliación manual.`
                    : '';
                results.push({ id_document: id_doc, success: false, message: `${docErr.message || 'Error inesperado durante la emisión'}${ncInfo}` });
                errorCount++;
            } finally {
                ncInFlight.delete(lockKey);
            }
        }

        return res.status(200).json({
            success: true,
            total: uniqueIds.length + invalidIds.length,
            success_count: successCount,
            error_count: errorCount,
            results
        });
    } catch (error) {
        console.error('[createCreditNotesForExpired] Error general:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    sendDocument,
    anulateDocument,
    consultAnulateDocument,
    sendDocumentAll,
    anulateDocumentAll,
    consultAnulateDocumentAll,
    verifyExternalIds,
    verifyMySqlConnection,
    getCustomerData,
    validateSalesRange,
    validateSunatSingle,
    validateProSingle,
    forceSendProToSunat,
    validateUnifiedSingle,
    executeUnifiedValidation,
    getCompanyErrorDocuments,
    repairBadGateways,
    createCreditNotesForExpired,
};
