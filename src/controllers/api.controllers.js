// const pool = require('../db')
// const axios = require('axios');
// const https = require('https');
const { selectApiCompanyById } = require('../libs/company.libs');
const { ApiClient } = require('../libs/api.libs');
const { update_doc_api } = require('../libs/connection');
const { select_all_documents, update_document, update_document_anulate, formatAnulate, sendAllDocsPerCompany,  } = require('../libs/document.libs');

const sendDocument = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        res.status(405).json({ success: false, message: `Company Error!` })

    const api = new ApiClient(`${company.url}/api/documents`, company.token)
    let result = await api.sendDocument(req.body.json_format)

    if (!result.success) {
        result.state = 'X';
        update_document(req.body.id_document, company.tenant, result)
        return res.status(504).json(result);
    }
    result.state = 'E';
    if (result.data.state_type_description == 'Rechazado')
        result.state = 'R';

    // Guardar nuevo estado del documento
    const doc = update_document(req.body.id_document, company.tenant, result)
    if (!doc)
        res.status(405).json({ success: false, message: `Document Error!` })

    res.status(200).json({ result });
}

const sendDocumentAll = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })

    const docus = await select_all_documents(company.tenant)
    const api = new ApiClient(`${company.url}/api/documents`, company.token)

    const { num_aceptados, num_error, num_rechazados } = await sendAllDocsPerCompany(company, api, docus)

    return res.status(200).json({ 
        success: true, 
        message: 'Comprobantes Nuevos Enviados',
        num_aceptados: `Aceptados ${num_aceptados}`,
        num_rechazados: `Rechazados ${num_rechazados}`,
        num_error: `Con Error ${num_error}`
    });
}


const anulateDocument = async (req, res, next) => {
    const company = await selectApiCompanyById(req.body.id_company)
    if (!company)
        return res.status(405).json({ success: false, message: `Company Error!` })


    const format = await formatAnulate(req.body.id_document, company.tenant)
    if (!format)
        return res.status(405).json({ success: false, message: `Document Error!` })

    const ext_id = JSON.parse(format).documentos[0].external_id
    //verify state in API
    const api_doc = await update_doc_api(ext_id, company.url)
    if (api_doc)
        return res.status(405).json({ success: false, message: `API Document Error!` })


    const api = new ApiClient(`${company.url}/api/summaries`, company.token)
    let r = await api.sendDocument(format)
    // console.log(r);
    if (!r.success) {
        // return res.status(405).json({ success: false, message: `Request Error!` })
        return res.status(405).json(r)
    }
    r.state = 'A';


    const doc = update_document_anulate(req.body.id_document, company.tenant, r)
    if (!doc)
        return res.status(405).json({ success: false, message: `Document Error!` })
    //Guardar nuevo estado del documento
    res.status(200).json(r)
}


// const sendDocument = async (req, res, next) => {
//     const id_company = req.body.id_company;
//     // const data = JSON.parse(req.body.json_format)
//     const data = req.body.json_format

//     const company = await pool.query(`SELECT url, token FROM public.company WHERE id_company = $1`, [id_company]);
//     if (!company.rowCount) {
//         res.status(405).json({ error: "No Company found!" })
//     }

//     const url = `${company.rows[0].url}/api/documents`
//     const token = company.rows[0].token

//     //ssl disabled
//     const agent = new https.Agent({
//         rejectUnauthorized: false
//     });

//     const config = {
//         method: 'post',
//         url: url,
//         headers: {
//             'Authorization': 'Bearer ' + token,
//             'Content-Type': 'application/json'
//         },
//         data: data,
//         httpsAgent: agent
//     };

//     await axios(config)
//         .then(response => {
//             let r = response.data
//             delete r.data.qr

//             res.json({
//                 success: true,
//                 state: 'N',
//                 message: `Comprobante ${r.data.number} ${r.data.state_type_description}`
//             })
//         })
//         .catch((error) => {
//             if (error.response) {
//                 // The request was made and the server responded with a status code
//                 // that falls out of the range of 2xx
//                 console.log(error.response.data);
//                 console.log(error.response.status);
//                 console.log(error.response.headers);
//             } else if (error.request) {
//                 // The request was made but no response was received
//                 // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
//                 // http.ClientRequest in node.js
//                 console.log(error.request);
//             } else {
//                 // Something happened in setting up the request that triggered an Error
//                 console.log('Error', error.message);
//             }
//             console.log(error.config);
//             res.json({ error, state: 'E' })
//         });
// }

module.exports = {
    sendDocument,
    anulateDocument,
    sendDocumentAll,
};