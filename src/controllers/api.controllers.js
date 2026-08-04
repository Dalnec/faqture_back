const { selectApiCompanyById } = require('../libs/company.libs');
const { ApiClient } = require('../libs/api.libs');
const { update_doc_api, checkConnection } = require('../libs/connection');
const { select_document_by_id, select_all_documents, update_document, update_document_anulate, formatAnulate, sendAllDocsPerCompany, formatAnulatePerCompany, verifyingExternalIds, sendAllAnulateDocsPerCompany, countingDocsState, consultAnulation, select_all_documents_to_consult_void, sendAllConsultVoidPerCompany, sendDoc, pool } = require('../libs/document.libs');
const { getSettingApiRuc } = require('../libs/settings.lib');
const { ApiRUC } = require('../libs/apiClient.lib');
const { formatDateForSunat, translateSystemStatus, getEnvironmentLabel, validateVoucherOnSunat, SUNAT_STATUS_LABELS, translateSunatStatus } = require('../libs/sunatValidation.libs');
const { getCompanyByTenant } = require('../libs/company.libs');

const sendDocument = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        res.status(405).json({ success: false, message: `Company Error!` })

    if (!company.state)
        return res.status(405).json({ success: false, message: `Company Blocked!` })

    const docu = await select_document_by_id(req.body.id_document, company.tenant)
    if (!docu)
        res.status(405).json({ success: false, message: `Document Finding Error!` })
    if (docu.type === '80')
        res.status(405).json({ success: false, message: `Not Allowed!` })

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

    const format = await formatAnulate(req.body.id_document, company.tenant)
    if (!format)
        return res.status(405).json({ success: false, message: `Document Error1!` })

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


    const listformat = await formatAnulatePerCompany(company.tenant)
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
};
