const { setFiltersORCompany, setNewValues } = require('../libs/functions')
// const { encrypt, decrypt} = require('../libs/auth')
const pool = require('../db')

const { encryptPasword } = require('../libs/auth')
const { createTenantCompany } = require('./tenant.controllers')

// const getCompaniesList = async (req, res, next) => {
//     const response = await pool.query('SELECT id_company, company_number, company, tenant FROM company');
//     const list = await Promise.all(
//         response.rows.map(async (data) => {
//             let counting = await pool.query(`SELECT count(states) FILTER (WHERE states = ANY ('{N, S, M}')) AS new
//                                                 , count(states) FILTER (WHERE states = 'P') AS void
//                                                 , count(states) FILTER (WHERE states = 'X') AS error
//                                                 , count(states) FILTER (WHERE states = 'C') AS void_consult
//                                                 , count(states) FILTER (WHERE states = 'Z') AS num_void_error
//                                         FROM ${data.tenant}.document;`);
//             data.num_new = counting.rows[0].new
//             data.num_void = counting.rows[0].void
//             data.num_error = counting.rows[0].error
//             data.num_void_consult = counting.rows[0].void_consult
//             data.num_void_error = counting.rows[0].num_void_error
//             return data
//         }))
//     res.status(200).json(list)
// }
const getCompaniesList = async (req, res, next) => {
    try {
        const { page = 1, itemsPerPage = 20, company, company_number, tenant } = req.query;

        // Construcción dinámica del filtro
        let whereClauses = [];
        let params = [];
        let idx = 1; // contador para los parámetros $1, $2, etc

        if (company) {
            whereClauses.push(`company ILIKE $${idx++}`);
            params.push(`%${company}%`);
        }
        if (company_number) {
            whereClauses.push(`company_number ILIKE $${idx++}`);
            params.push(`%${company_number}%`);
        }
        if (tenant) {
            whereClauses.push(`tenant ILIKE $${idx++}`);
            params.push(`%${tenant}%`);
        }

        const whereSQL = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" OR ") : "";
        // 1. Obtener el total de empresas
        const totalResult = await pool.query(`SELECT COUNT(*) AS total FROM company ${whereSQL}`, params);
        const total = parseInt(totalResult.rows[0].total);

        // 2. Obtener las empresas paginadas
        params.push(itemsPerPage, (page - 1) * itemsPerPage); // agregar limites
        const response = await pool.query(
            `SELECT id_company, company_number, company, tenant, state 
            FROM company
            ${whereSQL}
            ORDER BY company ASC
            LIMIT $${idx++} OFFSET $${idx++}`,
            params
        );

        // Ejecutar todas las consultas en paralelo
        const list = await Promise.all(
            response.rows.map(async (data) => {
                // Validación opcional (solo letras, números y guiones bajos)
                if (!/^[a-zA-Z0-9_]+$/.test(data.tenant)) {
                    throw new Error(`Invalid schema name: ${data.tenant}`);
                }

                const statsQuery = `
                SELECT 
                    COUNT(states) FILTER (WHERE states = ANY ('{N,S,M}')) AS num_new,
                    COUNT(states) FILTER (WHERE states = 'P') AS num_void,
                    COUNT(states) FILTER (WHERE states = 'X') AS num_error,
                    COUNT(states) FILTER (WHERE states = 'C') AS num_void_consult,
                    COUNT(states) FILTER (WHERE states = 'Z') AS num_void_error
                FROM ${data.tenant}.document
                `;

                const { rows } = await pool.query(statsQuery);
                return {
                    ...data,
                    ...rows[0]
                };
            })
        );

        // res.status(200).json(list);
        // 4. Retornar datos + total
        res.status(200).json({
            total,
            page: Number(page),
            itemsPerPage: Number(itemsPerPage),
            data: list
        });
    } catch (error) {
        console.error('Error in getCompaniesList:', error);
        res.status(500).json({ error: error.message });
    }
};



const getCompaniestByFilters = async (req, res, next) => {
    try {
        const { company, page, itemsPerPage } = req.query;

        filters = setFiltersORCompany(company)

        const response = await pool.query(`SELECT id_company, created::text, company_number, company, tenant, 
            url, token, localtoken, state, autosend, zenda_url, zenda_token, zenda_state, token_series, external_api 
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
        const { company_number, company, url, token, tenant, autosend, zenda_url, zenda_token,
            zenda_state, token_series, external_api } = req.body

        // const localtoken = encrypt(tenant)
        const localtoken = await encryptPasword(tenant)
        const now = new Date()

        const response = await pool.query(
            `INSERT INTO company(created, modified, company_number, company, url, token, localtoken, 
                tenant, autosend, zenda_url, zenda_token, zenda_state, token_series, external_api) 
            VALUES ( $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [now, now, company_number, company, url, token, localtoken, tenant, autosend, zenda_url,
                zenda_token, zenda_state, token_series, external_api]);

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
    }
};

const updateCompany = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const keys = Object.keys(req.body);
        const values = Object.values(req.body);
        // Construir la parte del SET dinámicamente
        const setClause = keys.map((key, index) => `${key} = $${index + 1}`).join(", ");
        // Agregar id al final de los valores
        values.push(id);
        // Construir la consulta
        const query = `UPDATE public.company SET ${setClause} WHERE id_company = $${values.length}`;
        // Ejecutar la consulta con los parámetros correctos
        const response = await pool.query(query, values);

        // const newData = setNewValues(req.body)
        // const response = await pool.query(`UPDATE public.company SET ${newData} WHERE id_company = $1`, [id]);

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

const disableAutoSendCompanies = async (req, res, next) => {
    try {
        const { autosend } = req.body
        const { rows } = await pool.query('SELECT * FROM public.company');
        for (let company of rows) {
            // console.log(company.company_number, company.autosend);
            await pool.query(`UPDATE public.company SET autosend = $1 WHERE id_company = $2`, [autosend || false, company.id_company]);
        }
        res.json({
            state: 'success',
            message: "Envio Automatico Companies Disabled!"
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
    disableAutoSendCompanies,
};