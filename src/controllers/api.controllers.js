const pool = require('../db');
const { selectApiCompanyById } = require('../libs/company.libs');
const { ApiClient } = require('../libs/api.libs');
const { update_doc_api, checkConnection } = require('../libs/connection');
const { select_document_by_id, select_all_documents, update_document, update_document_state, update_document_anulate, formatAnulate, sendAllDocsPerCompany, formatAnulatePerCompany, verifyingExternalIds, sendAllAnulateDocsPerCompany, countingDocsState, consultAnulation, select_all_documents_to_consult_void, sendAllConsultVoidPerCompany, sendDoc } = require('../libs/document.libs');
const { getSettingApiRuc } = require('../libs/settings.lib');
const { ApiRUC } = require('../libs/apiClient.lib');
const { formatDateForSunat, translateSystemStatus, getEnvironmentLabel, validateVoucherOnSunat, SUNAT_STATUS_LABELS, translateSunatStatus } = require('../libs/sunatValidation.libs');
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
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'E' });
            return res.json({ success: true, message: 'El comprobante existe y está ACEPTADO en SUNAT. Estado local sincronizado a Enviado (E).' });
        } else if (estadoCp === '2') {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'A' });
            return res.json({ success: true, message: 'El comprobante existe y está ANULADO en SUNAT. Estado local sincronizado a Anulado (A).' });
        } else if (estadoCp === '4') {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'R' });
            return res.json({ success: true, message: 'El comprobante fue RECHAZADO por SUNAT. Estado local actualizado a Rechazado (R).' });
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
        const formattedSerieNum = `${serieClean}-${numeroClean}`;
        const formattedPadded = `${serieClean}-${numeroClean.padStart(8, '0')}`;

        const match = apidocs.data.find(el => {
            if (docu.external_id && el.external_id === docu.external_id) return true;
            if (el.number === formattedSerieNum || el.number === formattedPadded) return true;
            if (el.filename && el.filename.includes(`${serieClean}-${numeroClean}`)) return true;
            return false;
        });

        if (!match) {
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
                await update_document_state(id_document, company.tenant, { id: id_document, state: 'E' });
                return res.json({ success: true, message: 'El comprobante existe y está ACEPTADO por SUNAT en el PRO (con CDR). Estado local sincronizado a Enviado (E).' });
            } else {
                await update_document_state(id_document, company.tenant, { id: id_document, state: 'Y' });
                return res.json({ 
                    success: true, 
                    message: '⚠️ ATENCIÓN: El comprobante está en el PRO pero PENDIENTE de CDR/envío a SUNAT. Estado actualizado a Y. Usa la opción \'Forzar Envío PRO -> SUNAT\' para declararlo.' 
                });
            }
        } else if (stateTypeId === '11') {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'A' });
            return res.json({ success: true, message: 'El comprobante figura ANULADO en el PRO. Estado local sincronizado a Anulado (A).' });
        } else if (stateTypeId === '09') {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'R' });
            return res.json({ success: true, message: `El comprobante fue RECHAZADO por SUNAT según el PRO: ${stateDesc}. Estado local actualizado a Rechazado (R).` });
        } else if (stateTypeId === '01' || stateTypeId === '03' || stateTypeId === '13') {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'Y' });
            return res.json({ 
                success: true, 
                message: `⚠️ ATENCIÓN: El comprobante está REGISTRADO en el PRO (${stateDesc}) pero PENDIENTE de envío a SUNAT. Usa la opción 'Forzar Envío PRO -> SUNAT' para declararlo.` 
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
            monto: docu.amount || 0,
        });
    } catch (sunatErr) {
        console.error('Error al consultar SUNAT directamente:', sunatErr.message);
        sunatNetworkError = true;
    }

    const estadoCp = String(sunatResponse?.data?.estadoCp || '');

    if (estadoCp === '1' || estadoCp === '3') {
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
        let nextState = ['A', 'S', 'P', 'C', 'Z'].includes(docu.states) ? 'S' : 'N';
        await update_document_state(id_document, company.tenant, { id: id_document, state: nextState });
        return { 
            success: false, 
            message: `No encontrado en SUNAT. La empresa no cuenta con URL/Token del PRO para verificar. Estado local: ${nextState}.` 
        };
    }

    let dateObj = new Date(fechaEmision);
    if (Number.isNaN(dateObj.getTime())) {
        dateObj = new Date(docu.date);
    }

    const dayBefore = new Date(dateObj.getTime() - 86400000).toISOString().slice(0, 10);
    const dayAfter = new Date(dateObj.getTime() + 86400000).toISOString().slice(0, 10);

    const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token);
    const apidocs = await api.getListDocumentByDate(`${company.url}/api/documents/lists/${dayBefore}/${dayAfter}`);

    const formattedSerieNum = `${serieClean}-${numeroClean}`;
    const formattedPadded = `${serieClean}-${numeroClean.padStart(8, '0')}`;

    const match = Array.isArray(apidocs?.data) ? apidocs.data.find(el => {
        if (docu.external_id && el.external_id === docu.external_id) return true;
        if (el.number === formattedSerieNum || el.number === formattedPadded) return true;
        if (el.filename && el.filename.includes(`${serieClean}-${numeroClean}`)) return true;
        return false;
    }) : null;

    // PASO 3 & 4: Regularizar PRO y Faqture
    if (match) {
        const stateTypeId = String(match.state_type_id || '');
        const hasCdr = match.has_cdr === true || (match.has_cdr !== false && !!match.download_cdr);

        if (stateTypeId === '05' && hasCdr) {
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
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'R' });
            return { 
                success: true, 
                sunat_status: 'NO_ENCONTRADO_DIRECTO',
                pro_status: 'RECHAZADO',
                final_state: 'R',
                message: 'PRO: El comprobante fue RECHAZADO por SUNAT en el PRO. Estado sincronizado a Rechazado (R).' 
            };
        }

        if (sunatNetworkError) {
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
            await update_document_state(id_document, company.tenant, { id: id_document, state: finalSt });
            return { 
                success: true, 
                sunat_status: 'DECLARADO',
                pro_status: 'ACEPTADO',
                final_state: finalSt,
                message: `REGULARIZADO: Comprobante forzado y declarado a SUNAT exitosamente (Estado: ${finalSt}).` 
            };
        } else {
            await update_document_state(id_document, company.tenant, { id: id_document, state: 'Y' });
            const errMsg = typeof sendResult.message === 'string' ? sendResult.message : JSON.stringify(sendResult.message);
            return { 
                success: false, 
                sunat_status: 'NO_ENCONTRADO',
                pro_status: 'PENDIENTE',
                final_state: 'Y',
                message: `Comprobante registrado en PRO pero falló al declarar a SUNAT: ${errMsg}. Queda en estado Y.` 
            };
        }
    } else {
        const isAnulation = ['A', 'S', 'P', 'C', 'Z'].includes(docu.states);
        const targetState = isAnulation ? 'S' : 'N';
        await update_document_state(id_document, company.tenant, { id: id_document, state: targetState });
        return { 
            success: true, 
            sunat_status: 'NO_ENCONTRADO',
            pro_status: 'NO_EXISTE',
            final_state: targetState,
            message: `El comprobante NO EXISTE en SUNAT ni en el PRO. Estado sincronizado a ${targetState} para envío.` 
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
            SELECT id_document, cod_sale, serie, numero, type, states, date, amount, external_id 
            FROM ${tenant}.document 
            WHERE states IN ('X', 'M', 'S', 'Z', 'P', 'C') AND type <> '80' 
            ORDER BY id_document ASC
        `;
        const result = await pool.query(query);
        const docs = result.rows || [];

        let send_errors = 0;
        let void_errors = 0;
        let void_pending = 0;

        for (const d of docs) {
            if (['X', 'M', 'S'].includes(d.states)) {
                send_errors++;
            } else if (d.states === 'Z') {
                void_errors++;
            } else if (['P', 'C'].includes(d.states)) {
                void_pending++;
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
                total: docs.length,
            },
            documents: docs,
        });
    } catch (error) {
        console.error('Error in getCompanyErrorDocuments:', error);
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
};
