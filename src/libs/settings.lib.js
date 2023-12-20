const pool = require('../db')

const getSettingByKey = async (key) => {
    try {
        const docs = await pool.query(`SELECT * FROM public.settings WHERE key=$1`, [key]);
        if (!docs.rowCount) { return false; }
        return docs.rows[0];

    } catch (error) {
        console.log(error);
        return false;
    }
}

const getSettingApiRuc = async () => {
    try {
        const docs = await pool.query(`SELECT * FROM public.settings WHERE key in ('url_api_ruc', 'token_api_ruc') ORDER BY key`);
        if (!docs.rowCount) { return false; }
        return docs.rows;

    } catch (error) {
        console.log(error);
        return false;
    }
}

module.exports = {
    getSettingByKey,
    getSettingApiRuc,
}