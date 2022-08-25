// import { nanoid } from 'nanoid'
const { nanoid } = require('nanoid')
const pool = require('../db');
const { setNewValues, setFiltersOR, setFiltersDocs } = require('../libs/functions')
const { sendDoc, get_correlative_number } = require('../libs/document.libs');
const { selectApiCompanyById } = require('../libs/company.libs');

const getDocuments = async (req, res, next) => {
    const tenant = req.params.tenant;
    const response = await pool.query(`SELECT * FROM ${tenant}.document ORDER BY id_document`);
    res.status(200).json(response.rows)
}

const getDocumentByFilters1 = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        let { page, itemsPerPage } = req.query;
        let filters = req.query;
        delete filters.page
        delete filters.itemsPerPage
        filters = setFiltersDocs(filters)
        const response = await pool.query(`SELECT * FROM ${tenant}.document ${filters} ORDER BY id_document 
        LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`);

        const tocount = await pool.query(`SELECT * FROM ${tenant}.document ${filters}`)

        res.json({
            page: page,
            count: tocount.rows.length,
            filters: filters,
            data: response.rows
        });
    } catch (error) {
        res.json({ error: error.message })
    }
};

const getDocumentByFilters = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const { page, itemsPerPage } = req.query;
        let filters = req.query;
        delete filters.page
        delete filters.itemsPerPage
        filters = setFiltersDocs(filters)
        const response = await pool.query(`SELECT id_document, TO_CHAR(date::DATE, 'yyyy-mm-dd') AS date, cod_sale, type, serie, numero, 
        customer_number, customer, amount, states, json_format, response_send, response_anulate, id_company, external_id FROM ${tenant}.document ${filters} ORDER BY id_document DESC
        LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`);

        const tocount = await pool.query(`SELECT * FROM ${tenant}.document ${filters}`)

        res.json({
            page: page,
            count: tocount.rows.length,
            data: response.rows
        });
    } catch (error) {
        res.json({ error: error.message })
    }
};

const getDocumentById = async (req, res, next) => {
    const id = parseInt(req.params.id);
    const tenant = req.params.tenant;

    const response = await pool.query(`SELECT * FROM ${tenant}.document WHERE id_document = $1`, [id]);
    res.json(response.rows);
};

const createDocument = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        // const strdocument = JSON.parse(req.body.document)
        const strdocument = JSON.stringify(req.body, null, 4)
        const document = req.body
        // console.log(req.body);
        const { company, company_number } = req.params

        const { id_venta, fecha_de_emision, hora_de_emision, codigo_tipo_documento, serie_documento,
            numero_documento, datos_del_cliente_o_receptor, totales } = document
        const now = new Date()
        const date = `${fecha_de_emision} ${hora_de_emision}`
        const external_id = nanoid()

        const response = await pool.query(
            `INSERT INTO ${tenant}.document(created, modified, date, cod_sale, type, serie, numero, 
                customer_number, customer, amount, states, json_format, id_company, external_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14 ) RETURNING *`,
            [now, now, date, id_venta, codigo_tipo_documento, serie_documento,
                numero_documento, datos_del_cliente_o_receptor.numero_documento,
                datos_del_cliente_o_receptor.apellidos_y_nombres_o_razon_social,
                totales.total_venta, 'N', JSON.stringify(strdocument, null, 4), company, external_id]);

        let result = {}
        const apiCompany = await selectApiCompanyById(company)
        if (apiCompany.autosend) {
            result = await sendDoc(apiCompany, response.rows[0])
        }

        res.status(200).json({
            success: true,
            data: {
                cod_sale: response.rows[0].cod_sale,
                filename: `${company_number}-${response.rows[0].type}-${response.rows[0].serie}-${response.rows[0].numero}`,
                state: result.state ? result.state : 'N',
                external_id: external_id
            }
        })
    } catch (error) {
        res.status(401).json({
            success: false,
            // data: {message: error.message}
            message: error.message
        })
    }
};

const createApiDocument = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const strdocument = JSON.stringify(req.body, null, 4)
        const document = req.body
        const { company, company_number } = req.params

        const { id_venta, fecha_de_emision, hora_de_emision, codigo_tipo_documento, serie_documento,
            numero_documento, datos_del_cliente_o_receptor, totales } = document

        let numero;
        if (numero_documento === '#') {
            numero = await get_correlative_number(serie_documento, tenant)
        } else {
            numero = numero_documento;
        }
        const now = new Date()
        const date = `${fecha_de_emision} ${hora_de_emision}`
        const external_id = nanoid()

        const response = await pool.query(
            `INSERT INTO ${tenant}.document(created, modified, date, cod_sale, type, serie, numero, 
                customer_number, customer, amount, states, json_format, id_company, external_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14 ) RETURNING *`,
            [now, now, date, id_venta, codigo_tipo_documento, serie_documento,
                numero, datos_del_cliente_o_receptor.numero_documento,
                datos_del_cliente_o_receptor.apellidos_y_nombres_o_razon_social,
                totales.total_venta, 'N', JSON.stringify(strdocument, null, 4), company, external_id]);

        let result = {}
        const apiCompany = await selectApiCompanyById(company)
        if (apiCompany.autosend) {
            result = await sendDoc(apiCompany, response.rows[0])
        }

        res.status(200).json({
            success: true,
            data: {
                cod_sale: response.rows[0].cod_sale,
                filename: `${company_number}-${response.rows[0].type}-${response.rows[0].serie}-${response.rows[0].numero}`,
                state: result.state ? result.state : 'N',
                external_id: external_id
            }
        })
    } catch (error) {
        res.status(401).json({
            success: false,
            message: error.message
        })
    }
};

const updateApiDocument = async (req, res, next) => {
    // use to update state to anulate
    try {
        const id = parseInt(req.params.id);
        const tenant = req.params.tenant;
        // let newData = req.body;
        // const newData = setNewValues(req.body)
        let message = '';
        let state = '';
        let code = 200;
        // verify actual state
        const doc = await pool.query(`SELECT * FROM ${tenant}.document WHERE cod_sale=$1`, [id]);
        if (doc.rowCount <= 0) {
            return res.status(401).json({
                success: false,
                message: id + " Document not found!"
            })
        }
        switch (doc.rows[0].states) {
            case 'A':
                message = 'Document Already Annulled!';
                break;
            case 'P':
                message = 'Document To Annulled!';
                break;
            case 'C':
                message = 'Document To Consult Annulled!';
                break;
            case 'S':
                message = 'Document To Send/Annulled!';
                break;
            case 'N':
                state = 'S';
                break;
            case 'E':
                state = 'P';
                break;
            default:
                message = 'Error!';
                code = 405;
                break;
        }
        if (message != '')
            return res.status(code).json({
                success: false,
                data: {
                    cod_sale: doc.rows[0].cod_sale,
                    filename: `${doc.rows[0].type}-${doc.rows[0].serie}-${doc.rows[0].numero}`,
                    state: doc.rows[0].states
                },
                message: message
            })

        const response = await pool.query(
            `UPDATE ${tenant}.document SET states=$1 WHERE cod_sale=$2 RETURNING *`, [state, id]);
        // console.log(response.rows[0]);
        res.status(200).json({
            success: true,
            data: {
                cod_sale: response.rows[0].cod_sale,
                filename: `${response.rows[0].type}-${response.rows[0].serie}-${response.rows[0].numero}`,
                state: state
            }
        })
    } catch (error) {
        res.status(401).json({
            success: false,
            message: error.message
        })
    }
};

const updateDocument = async (req, res, next) => {
    const id = parseInt(req.params.id);
    const tenant = req.params.tenant;
    // let newData = req.body;
    const newData = setNewValues(req.body)
    const response = await pool.query(
        `UPDATE ${tenant}.document SET ${newData} WHERE id_document = $1 RETURNING *`, [id]);
    res.json({
        state: 'success',
        message: "UPDATED"
    })
};

const deleteDocument = async (req, res, next) => {
    const id = parseInt(req.params.id);
    const tenant = req.params.tenant;
    await pool.query(`DELETE FROM ${tenant}.document where id = $1`, [id]);
    res.json({
        state: 'success',
        message: "DELETED"
    })
};

const clearDocuments = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        await pool.query(`DELETE FROM ${tenant}.document`);
        await pool.query(`ALTER SEQUENCE ${tenant}.document_id_document_seq RESTART WITH 1`);
        res.json({
            state: 'success',
            message: "Documents Cleared!"
        })
    } catch (error) {
        res.json({ error: error.message });
        next();
    }
};

const getDocumentCustomers = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        let client = req.query.client;
        let filters = { customer_number: client, customer: client }
        filters = setFiltersOR(filters)
        const response = await pool.query(`SELECT DISTINCT customer_number, customer FROM ${tenant}.document ${filters}
        LIMIT 20`);

        res.json({
            data: response.rows
        });

    } catch (error) {
        res.json({ error: error.message })
    }
};

module.exports = {
    getDocuments,
    createDocument,
    getDocumentById,
    deleteDocument,
    updateDocument,
    getDocumentByFilters,
    getDocumentCustomers,
    getDocumentByFilters1,
    updateApiDocument,
    clearDocuments,
    createApiDocument,
};