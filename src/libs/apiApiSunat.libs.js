const https = require('https');
const axios = require('axios');
const { notifyError } = require('./logger');

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
        try {
            const response = await axios(this.config);
            res = response.data;
        } catch (error) {
            if (error.response) {
                res = error.response.data;
            } else {
                notifyError({
                    type:    'Error ApiSunat - fallo al enviar documento',
                    error,
                    payload: { url: this.config.url },
                });
                res = { error: error.message };
            }
        }
        return res;
    }

    async getDocument() {
        this.config.method = 'get';
        let res;
        try {
            const response = await axios(this.config);
            res = response.data;
        } catch (error) {
            if (error.response) {
                res = error.response.data;
            } else {
                notifyError({
                    type:    'Error ApiSunat - fallo al consultar documento',
                    error,
                    payload: { url: this.config.url },
                });
                res = { error: error.message };
            }
        }
        return res;
    }
}

module.exports = { ApiSunat };