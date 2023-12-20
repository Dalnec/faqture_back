const https = require('https');
const axios = require('axios');

class ApiRUC {
    constructor(url, token) {
        this.agent = new https.Agent({
            rejectUnauthorized: false
        });
        this.config = {
            method: 'get',
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            httpsAgent: this.agent
        };

    }

    async getData() {
        let res;
        await axios(this.config)
            .then(response => {
                res = response.data
            })
            .catch((error) => {
                res = error.response;
            });
        return res;
    }
}

module.exports = { ApiRUC };