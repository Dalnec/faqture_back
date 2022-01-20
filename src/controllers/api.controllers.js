// const pool = require('../db')
// const axios = require('axios');
const https = require('https');
const {selectApiCompanyById} = require('../libs/company.libs');
const {ApiClient} = require('../libs/api.libs');

const sendDocument = async (req, res, next) => {
    // const data = JSON.parse(req.body.json_format)
    // const data = req.body.json_format
    const company = await selectApiCompanyById(req.body.id_company)
    console.log(company);
    if (!company) {
        res.status(401).json({ success: false, message: `Company Error!` })
    }

    //ssl disabled
    const agent = new https.Agent({
        rejectUnauthorized: false
    });

    const api = new ApiClient(`${company.url}/api/documents`, company.token, agent)
    const r = await api.sendDocument(req.body.json_format)
    console.log(r);
    if (!r.success) {
        res.status(401).json({ success: false, message: `Error Request!` })
    }

    //Guardar nuevo estado del documento
    res.status(200).json(r)
}
// const sendDocument = async (req, res, next) => {
//     const id_company = req.body.id_company;
//     // const data = JSON.parse(req.body.json_format)
//     const data = req.body.json_format

//     const company = await pool.query(`SELECT url, token FROM public.company WHERE id_company = $1`, [id_company]);
//     if (!company.rowCount) {
//         res.status(401).json({ error: "No Company found!" })
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
};