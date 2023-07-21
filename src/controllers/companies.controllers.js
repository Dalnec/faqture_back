const { setFiltersORCompany, setNewValues } = require('../libs/functions')
// const { encrypt, decrypt} = require('../libs/auth')
const pool = require('../db')

const { encryptPasword } = require('../libs/auth')
const { createTenantCompany } = require('./tenant.controllers')

const getCompaniesList = async (req, res, next) => {
    const response = await pool.query('SELECT id_company, company_number, company, tenant FROM company');
    const list = await Promise.all(
        response.rows.map(async (data) => {
            let counting = await pool.query(`SELECT count(states) FILTER (WHERE states = ANY ('{N, S, M}')) AS new
                                                , count(states) FILTER (WHERE states = 'P') AS void
                                                , count(states) FILTER (WHERE states = 'X') AS error
                                                , count(states) FILTER (WHERE states = 'C') AS void_consult
                                                , count(states) FILTER (WHERE states = 'Z') AS num_void_error
                                        FROM ${data.tenant}.document;`);
            data.num_new = counting.rows[0].new
            data.num_void = counting.rows[0].void
            data.num_error = counting.rows[0].error
            data.num_void_consult = counting.rows[0].void_consult
            data.num_void_error = counting.rows[0].num_void_error
            return data
        }))
    res.status(200).json(list)
}

const getCompaniestByFilters = async (req, res, next) => {
    try {
        const { company, page, itemsPerPage } = req.query;

        filters = setFiltersORCompany(company)

        const response = await pool.query(`SELECT id_company, created::text, company_number, company, tenant, 
            url, token, localtoken, state, autosend, zenda_url, zenda_token, zenda_state, token_series 
            FROM public.company ${filters} ORDER BY id_company 
        LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`);

        const tocount = await pool.query(`SELECT * FROM public.company ${filters}`)

        res.json({
            page: page,
            count: tocount.rows.length,
            data: response.rows
        });
    } catch (error) {
        res.json({ error: error.message })
    }
};

const getCompanyId = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const response = await pool.query('SELECT * FROM public.company WHERE id_company = $1', [id]);
        res.json(response.rows);
    } catch (error) {
        console.log(error);
        res.json({ error });
    }

};

const createCompany = async (req, res, next) => {
    try {
        const { company_number, company, url, token, tenant, autosend, zenda_url, zenda_token, zenda_state, token_series } = req.body

        // const localtoken = encrypt(tenant)
        const localtoken = await encryptPasword(tenant)
        const now = new Date()

        const response = await pool.query(
            `INSERT INTO company(created, modified, company_number, company, url, token, localtoken, 
                tenant, autosend, zenda_url, zenda_token, zenda_state, token_series) 
            VALUES ( $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [now, now, company_number, company, url, token, localtoken, tenant, autosend, zenda_url,
                zenda_token, zenda_state, token_series]);

        const createdTenant = createTenantCompany(tenant);
        if (!createdTenant) {
            res.json({ state: 'error', message: "No tenant created" });
        }

        res.json({
            state: 'success',
            message: "Company Created"
        });

    } catch (error) {
        res.json({ error: error.message });
        next();
    }
};

const updateCompany = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const newData = setNewValues(req.body)

        const response = await pool.query(`UPDATE public.company SET ${newData} WHERE id_company = $1`, [id]);

        res.json({
            state: 'success',
            message: "Company Updated"
        })
    } catch (error) {
        console.log(error);
        res.json({ error });
    }
};

const deleteCompany = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const response = await pool.query('SELECT * FROM public.company WHERE id_company = $1', [id]);
        await pool.query('DELETE FROM company where id_company = $1', [id]);
        await pool.query(`DROP SCHEMA IF EXISTS ${response.rows[0].tenant} CASCADE`);
        res.json({
            state: 'success',
            message: "Company Deleted"
        })
    } catch (error) {
        res.json({ error: error.message });
        next();
    }
};

const clearCompanyDocs = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const response = await pool.query('SELECT * FROM public.company WHERE id_company = $1', [id]);
        await pool.query(`DELETE FROM ${response.rows[0].tenant}.document`);
        await pool.query(`ALTER SEQUENCE ${response.rows[0].tenant}.document_id_document_seq RESTART WITH 1`);
        res.json({
            state: 'success',
            message: "Company Docs Cleared!"
        })
    } catch (error) {
        res.json({ error: error.message });
        next();
    }
};


const generateToken = async (req, res, next) => {
    try {
        const localtoken = await encryptPasword('company')
        res.json({
            localtoken
        })
    } catch (error) {
        console.log(error);
        res.json({ error });
    }
}

const xlsx = require('xlsx');

const leerExcel = async (req, res, next) => {
    const ruta = req.body.ruta;
    const workbook = xlsx.readFile(ruta);
    const workbootSheets = workbook.SheetNames;

    const sheet = workbootSheets[1];
    const dataExcel = xlsx.utils.sheet_to_json(workbook.Sheets[sheet]);

    dataExcel.forEach(async (data) => {
        const localtoken = await encryptPasword(data.tenant)
        const now = new Date()

        const response = await pool.query(
            `INSERT INTO company(created, modified, company_number, company, url, token, localtoken, tenant) 
            VALUES ( $1, $2, $3, $4, $5, $6, $7, $8)`,
            [now, now, data.company_number, data.company, data.url, data.token, localtoken, data.tenant]);

        const createdTenant = await createTenantCompany(data.tenant);

        if (!createdTenant) {
            console.log("No tenant created");
        } else
            console.log("Created", data.tenant);
    });

    res.json({
        state: 'success',
        message: "Companies Created"
    });
    // console.log(dataExcel);
    // res.json({
    //     dataExcel
    // })
}

module.exports = {
    getCompaniestByFilters,
    getCompanyId,
    createCompany,
    updateCompany,
    deleteCompany,
    generateToken,
    getCompaniesList,
    leerExcel,
    clearCompanyDocs,
};