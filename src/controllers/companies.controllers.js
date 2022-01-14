const {setFiltersORCompany, setNewValues} = require('../libs/functions')
// const { encrypt, decrypt} = require('../libs/auth')
const pool = require('../db')

const { encryptPasword } = require('../libs/auth')
const { createTenantCompany } = require('./tenant.controllers')

const getCompaniesList = async (req, res, next) => {
    const response = await pool.query('SELECT id_company, company_number, company, tenant FROM company');
    res.status(200).json(response.rows)
}

const getCompaniestByFilters = async (req, res, next) => {
    try {
        const { company, page, itemsPerPage} = req.query;

        filters = setFiltersORCompany(company)
        
        // const response = await pool.query(`SELECT * FROM public.company WHERE company_number LIKE '%${company}%' OR company LIKE '%${company}%' ORDER BY id_company 
        // LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`);

        // const tocount = await pool.query(`SELECT * FROM public.company WHERE company_number LIKE '%${company}%' OR company LIKE '%${company}%'`)

        const response = await pool.query(`SELECT * FROM public.company ${filters} ORDER BY id_company 
        LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`);

        const tocount = await pool.query(`SELECT * FROM public.company ${filters}`)

        res.json({
            page: page,
            count: tocount.rows.length,
            data: response.rows
        });
    } catch (error) {
        res.json({error: error.message})
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
        const { company_number, company, url, token, tenant} = req.body

        // const localtoken = encrypt(tenant)
        const localtoken = await encryptPasword(tenant)
        const now = new Date()

        const response = await pool.query(
            `INSERT INTO company(created, modified, company_number, company, url, token, localtoken, tenant) 
            VALUES ( $1, $2, $3, $4, $5, $6, $7, $8)`,
            [ now, now, company_number, company, url, token, localtoken, tenant]);

        const createdTenant = createTenantCompany(tenant);
        if (!createdTenant) {
            res.json({state: 'error', message: "No tenant created"});
        }

        res.json({
            state: 'success',
            message: "Company Created"
        });

    } catch (error) {
        res.json({error: error.message});
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
        await pool.query('DELETE FROM company where id_company = $1', [ id ]);
        res.json({
            state: 'success',
            message: "Company Deleted"
        })
    } catch (error) {
        res.json({error: error.message});
        next();
    }
};


const generateToken = async(req, res, next) => {
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


module.exports = {
    getCompaniestByFilters, 
    getCompanyId,   
    createCompany,  
    updateCompany,  
    deleteCompany,
    generateToken,
    getCompaniesList,
};