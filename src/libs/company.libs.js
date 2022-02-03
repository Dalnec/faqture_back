const pool = require('../db')

const selectApiCompanyById = async (id) => {
    try {
        if (!id) { return false; }

        const company = await pool.query(`SELECT url, token, tenant FROM public.company WHERE state=true AND id_company = $1`, [id]);
        if (!company.rowCount) { return false; }

        const url = company.rows[0].url
        const token = company.rows[0].token
        const tenant = company.rows[0].tenant
        return { url, token, tenant }

    } catch (error) {
        return false;
    }
}

const selectAllApiCompany = async () => {
    try {
        const company = await pool.query(`SELECT url, token, tenant FROM public.company WHERE state=true`);
        if (!company.rowCount) { return false; }
        return company.rows

    } catch (error) {
        return false;
    }
}

module.exports = { selectApiCompanyById, selectAllApiCompany };