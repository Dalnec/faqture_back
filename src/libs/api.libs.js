const https = require('https');
const axios = require('axios');

class ApiClient {
    constructor(url, token, data) {
        this.agent = new https.Agent({
            rejectUnauthorized: false
        });
        this.config = {
            method: 'post',
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            // data: data,
            httpsAgent: this.agent
        };
        
    }

    async sendDocument(data){
        this.config.data = data;
        let res;
        await axios(this.config)
            .then(response => {
                res = response.data
                delete res.data.qr
            })
            .catch((error) => {
                res =  error.response.data;
            });
        return res;
    }
    async getListDocumentByDate(url){
        this.config.method = 'get';
        this.config.url = url;

        let res;
        await axios(this.config)
            .then(response => {
                res = response.data
            })
            .catch((error) => {
                res =  error.response.data;
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