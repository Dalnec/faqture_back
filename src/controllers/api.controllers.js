const pool = require('../db')
const axios = require('axios');
var https = require('https');

const sendDocument = async (req, res, next) => {
    const id_company = req.body.id_company;
    // const data = JSON.parse(req.body.json_format)
    const data = req.body.json_format

    const company = await pool.query(`SELECT url, token FROM public.company WHERE id_company = $1`, [id_company]);
    if (!company.rowCount) {
        res.status(401).json({ error: "No Company found!" })
    }

    const url = `${company.rows[0].url}/api/documents`
    const token = company.rows[0].token
    
    //ssl disabled
    const agent = new https.Agent({
        rejectUnauthorized: false
    });

    const config = {
        method: 'post',
        url: url,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        data: data,
        httpsAgent: agent
    };

    await axios(config)
    .then(response => {        
        let r = response.data
        delete r.data.qr

        res.json({
            success: true,
            state: 'N',
            message: `Comprobante ${r.data.number} ${r.data.state_type_description}`
        })
    })
    .catch((error) => {
        res.json({ error, state: 'E' })
    });
}

module.exports = {
    sendDocument,
};