const https = require('https');
const axios = require('axios');

class ApiZenda {
    constructor(url, token, params) {
        this.agent = new https.Agent({
            rejectUnauthorized: false
        });
        this.config = {
            method: 'get',
            url: url,
            headers: {
                'Authorization': 'Token ' + token,
                'Content-Type': 'application/json'
            },
            params: params,
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

module.exports = { ApiZenda };