const { Pool } = require('pg')

const config = {
    database: 'faqturedb',
    user: 'faqture',
    password: 'faqture',
    host: 'localhost',
    port: '5432',
}

const pool = new Pool(config)

module.exports = pool;