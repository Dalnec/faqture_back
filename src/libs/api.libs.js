// const https = require('https');
// const axios = require('axios');

// class ApiClient {
//     constructor(url, token, data) {
//         this.agent = new https.Agent({
//             rejectUnauthorized: false
//         });
//         this.config = {
//             method: 'post',
//             url: url,
//             headers: {
//                 'Authorization': 'Bearer ' + token,
//                 'Content-Type': 'application/json'
//             },
//             // data: data,
//             httpsAgent: this.agent,
//         };

//     }

//     async sendDocument(data) {
//         this.config.data = data;
//         this.config.timeout = 10000; // 10 seconds timeout
//         let res;

//         await axios(this.config)
//             .then(response => {
//                 res = response?.data
//                 delete res?.data?.qr
//             })
//             .catch((error) => {
//                 res = error.response.data;
//             });
//         return res;
//     }
//     async getListDocumentByDate(url) {
//         this.config.method = 'get';
//         this.config.url = url;

//         let res;
//         await axios(this.config)
//             .then(response => {
//                 res = response.data
//             })
//             .catch((error) => {
//                 res = error.response.data;
//             });
//         return res;
//     }

//     // errors(error){
//     //     if (error.response) {
//     //         // The request was made and the server responded with a status code
//     //         // that falls out of the range of 2xx
//     //         console.log(error.response.data);
//     //         console.log(error.response.status);
//     //         console.log(error.response.headers);
//     //     } else if (error.request) {
//     //         // The request was made but no response was received
//     //         // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
//     //         // http.ClientRequest in node.js
//     //         console.log(error.request);
//     //     } else {
//     //         // Something happened in setting up the request that triggered an Error
//     //         console.log('Error', error.message);
//     //     }
//     //     console.log(error.config);
//     //     res.json({ error, state: 'E' })
//     // }
// }

// module.exports = { ApiClient };

const https = require('https');
const axios = require('axios');

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
                // Server responded with non-2xx
                return error.response.data ?? {
                    error: 'HTTP_ERROR',
                    status: error.response.status,
                    message: error.message,
                };
            } else if (error.request) {
                // Request made, no response
                return {
                    error: 'NO_RESPONSE',
                    message: error.message,
                    code: error.code,
                };
            } else {
                // Setup error
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
                return {
                    error: 'NO_RESPONSE',
                    message: error.message,
                    code: error.code,
                };
            } else {
                return {
                    error: 'REQUEST_SETUP_ERROR',
                    message: error.message,
                };
            }
        }
    }
}

module.exports = { ApiClient };