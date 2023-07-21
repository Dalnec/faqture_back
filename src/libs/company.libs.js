const pool = require('../db')

const selectApiCompanyById = async (id) => {
    try {
        if (!id) { return false; }

        const company = await pool.query(`SELECT url, token, tenant, autosend, token_series FROM public.company WHERE state=true AND id_company = $1`, [id]);
        if (!company.rowCount) { return false; }
        return { ...company.rows[0] }

    } catch (error) {
        return false;
    }
}
const selectApiCompanyByTenant = async (tenant) => {
    try {
        if (!tenant) { return false; }

        const company = await pool.query(`SELECT url, token, tenant, autosend FROM public.company WHERE state=true AND tenant = $1`, [tenant]);
        if (!company.rowCount) { return false; }

        return company.rows[0]

    } catch (error) {
        return false;
    }
}

const selectAllApiCompany = async () => {
    try {
        const company = await pool.query(`SELECT id_company, company_number, company, url, token, tenant, autosend, localtoken FROM public.company WHERE state=true ORDER BY company`);
        if (!company.rowCount) { return false; }
        return company.rows

    } catch (error) {
        return false;
    }
}

const getCompanyByNumber = async (ruc) => {
    try {
        const company = await pool.query('SELECT * FROM public.company WHERE company_number = $1', [ruc]);
        if (!company.rowCount) { return false; }
        return company.rows[0]
    } catch (error) {
        return false;
    }

};

module.exports = { selectApiCompanyById, selectAllApiCompany, getCompanyByNumber, selectApiCompanyByTenant };