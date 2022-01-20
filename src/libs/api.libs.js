const axios = require('axios');
const { response } = require('express');

class ApiClient {
    constructor(url, token, agent) {
        this.config = {
            method: 'post',
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            // data: data,
            httpsAgent: agent
        };
        
    }

    async sendDocument(data){
        this.config.data = data;
        const res = await axios(this.config)
            .then(response => {
                let r = response.data
                delete r.data.qr

                return {
                    success: true,
                    state: 'N',
                    message: `Comprobante ${r.data.number} ${r.data.state_type_description}`,
                    data: r
                }
            })
            .catch((error) => {
                return error.response.data
            });
        return res;
    }

    // errors(error){
    //     if (error.response) {
    //         // The request was made and the server responded with a status code
    //         // that falls out of the range of 2xx
    //         console.log(error.response.data);
    //         console.log(error.response.status);
    //         console.log(error.response.headers);
    //     } else if (error.request) {
    //         // The request was made but no response was received
    //         // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
    //         // http.ClientRequest in node.js
    //         console.log(error.request);
    //     } else {
    //         // Something happened in setting up the request that triggered an Error
    //         console.log('Error', error.message);
    //     }
    //     console.log(error.config);
    //     res.json({ error, state: 'E' })
    // }
}

module.exports = {ApiClient};