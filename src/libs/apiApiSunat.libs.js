const https = require('https');
const axios = require('axios');

class ApiSunat {
    constructor(url, params) {
        this.agent = new https.Agent({
            rejectUnauthorized: false
        });
        this.config = {
            method: 'post',
            url: url,
            headers: {
                'Content-Type': 'application/json'
            },
            params: params,
            httpsAgent: this.agent
        };

    }

    async sendDocument(data) {
        this.config.data = data;
        let res;
        await axios(this.config)
            .then(response => {
                res = response.data
            })
            .catch((error) => {
                res = error.response.data;
            });
        return res;
    }

    async getDocument() {
        this.config.method = 'get';
        let res;
        await axios(this.config)
            .then(response => {
                res = response.data
            })
            .catch((error) => {
                res = error.response.data;
            });
        return res;
    }
}

module.exports = { ApiSunat };