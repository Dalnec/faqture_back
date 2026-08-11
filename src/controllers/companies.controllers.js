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
        const { page = 1, itemsPerPage = 20, company, company_number, tenant,
            has_new, has_send_error, has_void_error, has_modified, has_void, has_void_consult, has_guia_consult } = req.query;

        // Construcción dinámica del filtro de texto
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

        const statusFilterActive = has_new === 'true' || has_send_error === 'true' || has_void_error === 'true'
            || has_modified === 'true' || has_void === 'true' || has_void_consult === 'true' || has_guia_consult === 'true';
        const limit = Number(itemsPerPage);
        const offset = (Number(page) - 1) * limit;

        // 1. Obtener el total base de empresas (sin filtros de estado)
        const totalResult = await pool.query(`SELECT COUNT(*) AS total FROM company ${whereSQL}`, params);
        const baseTotal = parseInt(totalResult.rows[0].total);

        // 2. Obtener las empresas. Si hay filtro de estado, traemos todas para filtrar en memoria;
        //    de lo contrario paginamos en SQL.
        let response;
        if (statusFilterActive) {
            response = await pool.query(
            `SELECT id_company, invoice_date::text AS invoice_date, invoice_status, cron_disable_reason, company_number, company, tenant, state, cron_enabled, cron_failure_count, source_type
            FROM company
            ${whereSQL}
            ORDER BY company ASC`,
                params
            );
        } else {
            const paginatedParams = [...params, limit, offset];
            response = await pool.query(
                `SELECT id_company, invoice_date::text AS invoice_date, invoice_status, cron_disable_reason, company_number, company, tenant, state, cron_enabled, cron_failure_count, source_type
                FROM company
                ${whereSQL}
                ORDER BY company ASC
                LIMIT $${idx++} OFFSET $${idx++}`,
                paginatedParams
            );
        }

        // 3. Calcular conteos por empresa
        const list = await Promise.all(
            response.rows.map(async (data) => {
                // Validación opcional (solo letras, números y guiones bajos)
                if (!/^[a-zA-Z0-9_]+$/.test(data.tenant)) {
                    throw new Error(`Invalid schema name: ${data.tenant}`);
                }

                const statsQuery = `
                SELECT
                    COUNT(states) FILTER (WHERE states = ANY ('{N,S}')) AS num_new,
                    COUNT(states) FILTER (WHERE states = 'M') AS num_modified,
                    COUNT(states) FILTER (WHERE states = 'P') AS num_void,
                    COUNT(states) FILTER (WHERE states = 'X') AS num_error,
                    COUNT(states) FILTER (WHERE states = 'C') AS num_void_consult,
                    COUNT(states) FILTER (WHERE states = 'Z') AS num_void_error,
                    COUNT(states) FILTER (WHERE states = 'Y') AS num_guia_consult
                FROM ${data.tenant}.document
                `;

                const { rows } = await pool.query(statsQuery);
                return {
                    ...data,
                    ...rows[0]
                };
            })
        );

        // 4. Aplicar filtros de estado en memoria si están activos
        let filteredList = list;
        if (statusFilterActive) {
            filteredList = list.filter((item) => {
                if (has_new === 'true' && Number(item.num_new) > 0) return true;
                if (has_modified === 'true' && Number(item.num_modified) > 0) return true;
                if (has_void === 'true' && Number(item.num_void) > 0) return true;
                if (has_void_consult === 'true' && Number(item.num_void_consult) > 0) return true;
                if (has_guia_consult === 'true' && Number(item.num_guia_consult) > 0) return true;
                if (has_send_error === 'true' && Number(item.num_error) > 0) return true;
                if (has_void_error === 'true' && Number(item.num_void_error) > 0) return true;
                return false;
            });
        }

        const total = statusFilterActive ? filteredList.length : baseTotal;
        const data = statusFilterActive ? filteredList.slice(offset, offset + limit) : filteredList;

        // 5. Retornar datos + total
        res.status(200).json({
            total,
            page: Number(page),
            itemsPerPage: limit,
            data
        });
    } catch (error) {
        console.error('Error in getCompaniesList:', error);
        res.status(500).json({ error: error.message });
    }
};



const getCompaniestByFilters = async (req, res, next) => {
    try {
        const { company, page, itemsPerPage, state, cron_enabled } = req.query;

        let whereParts = [];
        let params = [];
        let idx = 1;

        const textWhere = setFiltersORCompany(company);
        if (textWhere) {
            whereParts.push(textWhere.replace(/^WHERE\s+/, ''));
        }

        if (state !== undefined) {
            whereParts.push(`state = $${idx++}`);
            params.push(state === 'true');
        }

        if (cron_enabled !== undefined) {
            whereParts.push(`cron_enabled = $${idx++}`);
            params.push(cron_enabled === 'true');
        }

        const whereSQL = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

        const response = await pool.query(
            `SELECT id_company, invoice_date::text AS invoice_date, invoice_status, cron_disable_reason, created::text, company_number, company, tenant,
            url, token, localtoken, state, autosend, zenda_url, zenda_token, zenda_state, token_series, external_api,
            cron_enabled, cron_failure_count, source_type
            FROM public.company ${whereSQL} ORDER BY id_company
            LIMIT $${idx++} OFFSET $${idx++}`,
            [...params, itemsPerPage, (page - 1) * itemsPerPage]
        );

        const tocount = await pool.query(`SELECT * FROM public.company ${whereSQL}`, params);

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
            zenda_state, token_series, external_api, source_type } = req.body

        // const localtoken = encrypt(tenant)
        const localtoken = await encryptPasword(tenant)
        const now = new Date()

        const response = await pool.query(
            `INSERT INTO company(created, modified, company_number, company, url, token, localtoken,
                tenant, autosend, zenda_url, zenda_token, zenda_state, token_series, external_api, source_type, invoice_date, invoice_status)
            VALUES ( $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [now, now, company_number, company, url, token, localtoken, tenant, autosend, zenda_url,
                zenda_token, zenda_state, token_series, external_api, source_type, (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0]; })(), 'Pendiente']);

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
        const data = { ...req.body };

        const allowedColumns = ['company_number', 'company', 'url', 'token', 'tenant', 'autosend', 'zenda_url', 'zenda_token', 'zenda_state', 'token_series', 'external_api', 'source_type', 'invoice_date', 'invoice_status', 'cron_enabled', 'cron_failure_count', 'cron_disable_reason', 'state'];
        Object.keys(data).forEach(key => {
            if (!allowedColumns.includes(key)) {
                delete data[key];
            }
        });

        if (data.cron_enabled === true) {
            data.cron_failure_count = 0;
        }

        let shouldReactivate = false;

        if (data.invoice_status === 'Pagado') {
            shouldReactivate = true;
            
            // Auto-renovación: adelantar 1 mes y volver a Pendiente
            if (data.invoice_date) {
                const parts = data.invoice_date.split('-');
                let d = new Date(parts[0], parts[1] - 1, parts[2]);
                d.setMonth(d.getMonth() + 1);
                data.invoice_date = d.toISOString().split('T')[0];
                data.invoice_status = 'Pendiente';
            }
        }

        if (data.invoice_date && data.invoice_status === 'Pendiente') {
            // Fix timezone parsing
            const dateParts = data.invoice_date.split('-');
            const newDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
            const today = new Date();
            today.setHours(0,0,0,0);
            if (newDate >= today) {
                shouldReactivate = true;
            }
        }

        if (shouldReactivate) {
            const currentRes = await pool.query('SELECT cron_disable_reason FROM company WHERE id_company = $1', [id]);
            const currentReason = currentRes.rows[0]?.cron_disable_reason;
            // Reactivate only if blocked due to payment or not blocked
            if (currentReason === 'Falta de pago' || !currentReason) {
                data.cron_disable_reason = null;
                data.autosend = true;
                data.cron_enabled = true;
            }
        }

        const keys = Object.keys(data);
        const values = Object.values(data);

        if (!keys.length) {
            return res.json({
                state: 'success',
                message: "Company Updated"
            });
        }

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
            success: true,
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
