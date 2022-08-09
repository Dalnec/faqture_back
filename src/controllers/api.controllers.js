// const pool = require('../db')
// const axios = require('axios');
// const https = require('https');
const { selectApiCompanyById } = require('../libs/company.libs');
const { ApiClient } = require('../libs/api.libs');
const { update_doc_api, checkConnection } = require('../libs/connection');
const { select_document_by_id, select_all_documents, update_document, update_document_anulate, formatAnulate, sendAllDocsPerCompany, formatAnulatePerCompany, verifyingExternalIds, sendAllAnulateDocsPerCompany, countingDocsState,  } = require('../libs/document.libs');

const sendDocument = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        res.status(405).json({ success: false, message: `Company Error!` })

    const docu = await select_document_by_id(req.body.id_document, company.tenant)
    if (!docu)
        res.status(405).json({ success: false, message: `Document Finding Error!` })
    
    const api = new ApiClient(`${company.url}/api/documents`, company.token)
    let result = await api.sendDocument(docu.json_format)

    if (!result.success) {
        result.state = 'X';
        if (result.message.search('ya se encuentra registrado') > 0) {
            result.state = 'E';
        }
        await update_document(req.body.id_document, company.tenant, result)
        return res.status(504).json(result);
    }

    if (docu.states=='S')
        result.state = 'P';
    else
        result.state = 'E';

    if (result.data.state_type_description == 'Rechazado')
        result.state = 'R';

    // Guardar nuevo estado del documento
    const doc = await update_document(req.body.id_document, company.tenant, result)
    if (!doc)
        res.status(405).json({ success: false, message: `Document Updating Error!` })

    const counting = await countingDocsState(company.tenant)
    result.counting = counting

    res.status(200).json({ result });
}

const sendDocumentAll = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })

    const docus = await select_all_documents(company.tenant)
    const api = new ApiClient(`${company.url}/api/documents`, company.token)

    const { num_aceptados, num_error, num_rechazados } = await sendAllDocsPerCompany(company, api, docus)

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
    if (!!format.codigo_tipo_proceso) {
        const ext_id = format.documentos[0].external_id
        //update state in API
        const api_doc = await update_doc_api(ext_id, company.url)
        if (api_doc)
            return res.status(405).json({ success: false, message: `API Document Error!` })

        api = new ApiClient(`${company.url}/api/summaries`, company.token)
    } else {
        api = new ApiClient(`${company.url}/api/voided`, company.token)
    }


    let r = await api.sendDocument(format)
    if (!r.success) {
        // return res.status(405).json({ success: false, message: `Request Error!` })
        return res.status(405).json(r)
    }
    r.state = 'A';


    const doc = update_document_anulate(req.body.id_document, company.tenant, r)
    if (!doc)
        return res.status(405).json({ success: false, message: `Document Error2!` })

    const counting = await countingDocsState(company.tenant)
    r.counting = counting

    res.status(200).json(r)
}


const anulateDocumentAll = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })


    const listformat = await formatAnulatePerCompany(company.tenant)
    if (!listformat)
        return res.status(405).json({ success: false, message: `No hay documentos Por Anular!` })
    
    // for (let format of listformat) {
    //     if (!!format.codigo_tipo_proceso) {
            
    //         let ext_id = format.documentos[0].external_id
    //         //update state in API
    //         const api_doc = await update_doc_api(ext_id, company.url)
    
    //         if (api_doc)
    //             return res.status(405).json({ success: false, message: `API Documents Error!` })
    //     }
    // }    

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

const verifyExternalIds = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })

    const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token)

    const { num_aceptados, num_rechazados, num_por_anular, num_anulados } = await verifyingExternalIds(company.tenant, api)
    // if (!response)
    //     return res.status(405).json({ success: false, message: `Documents Error!` })

    return res.status(200).json({ 
        success: true, 
        message: 'Comprobantes Actualizados',
        num_aceptados: `Aceptados ${num_aceptados}`,
        num_rechazados: `Rechazados ${num_rechazados}`,
        num_poranular: `Por Anular ${num_por_anular}`,
        num_anulados: `Anulados ${num_anulados}`
    });
}

const verifyMySqlConnection = async (req, res, next) => {
    const conn = await checkConnection(req.query.url)
    return res.status(200).json({ 
        success: true,
        data: conn,
    });
}
module.exports = {
    sendDocument,
    anulateDocument,
    sendDocumentAll,
    anulateDocumentAll,
    verifyExternalIds,
    verifyMySqlConnection,
};