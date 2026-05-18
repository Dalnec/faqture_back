// const https = require('https');
// const axios = require('axios');
// [código legacy comentado omitido por brevedad]

const https = require('https');
const axios = require('axios');
const { notifyError } = require('./logger');

class ApiClient {
    constructor(url, token) {
        this.agent = new https.Agent({ rejectUnauthorized: false });
        this.config = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            httpsAgent: this.agent,
            timeout: 10000,
            // validateStatus: () => true, // optional: treat all HTTP statuses as resolved
        };
    }

    async sendDocument(data) {
        try {
            const response = await axios({ ...this.config, data });
            const res = response?.data ?? null;
            // only delete if shape matches
            if (res && res.data && typeof res.data === 'object') {
                delete res.data.qr;
            }
            return res;
        } catch (error) {
            // Normalize error object
            if (error.response) {
                // Server responded with non-2xx — error esperado, no notificar
                return error.response.data ?? {
                    error: 'HTTP_ERROR',
                    status: error.response.status,
                    message: error.message,
                };
            } else if (error.request) {
                // Request made, no response — problema de red/timeout
                notifyError({
                    type:    'Error API externa - sin respuesta (sendDocument)',
                    error,
                    payload: { url: this.config.url },
                });
                return {
                    error: 'NO_RESPONSE',
                    message: error.message,
                    code: error.code,
                };
            } else {
                notifyError({
                    type:    'Error API externa - configuración de request (sendDocument)',
                    error,
                    payload: { url: this.config.url },
                });
                return {
                    error: 'REQUEST_SETUP_ERROR',
                    message: error.message,
                };
            }
        }
    }

    async getListDocumentByDate(url) {
        try {
            const response = await axios({
                ...this.config,
                method: 'get',
                url,
            });
            return response?.data ?? null;
        } catch (error) {
            if (error.response) {
                return error.response.data ?? {
                    error: 'HTTP_ERROR',
                    status: error.response.status,
                    message: error.message,
                };
            } else if (error.request) {
                notifyError({
                    type:    'Error API externa - sin respuesta (getListDocumentByDate)',
                    error,
                    payload: { url },
                });
                return {
                    error: 'NO_RESPONSE',
                    message: error.message,
                    code: error.code,
                };
            } else {
                notifyError({
                    type:    'Error API externa - configuración de request (getListDocumentByDate)',
                    error,
                    payload: { url },
                });
                return {
                    error: 'REQUEST_SETUP_ERROR',
                    message: error.message,
                };
            }
        }
    }
}

module.exports = { ApiClient };