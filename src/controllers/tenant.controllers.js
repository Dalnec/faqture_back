const pool = require('../db')

const getTenant = async (req, res, next) => {
    try {
        const strdocument = JSON.parse(req.body.document)
        let { filters, page, itemsPerPage } = req.body;

        filters = setFilters(filters)
        const response = await pool.query(`SELECT * FROM document WHERE ${filters} ORDER BY id_document 
        LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`);

        const tocount = await pool.query(`SELECT * FROM document WHERE ${filters}`)

        res.json({
            page: page,
            count: tocount.rows.length,
            data: response.rows
        });
    } catch (error) {
        // res.json({error: error.message})
        next();
    }
};


const createTenant = async (req, res, next) => {
    try {
        const { schema } = req.body;
        await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION faqture`);
        await pool.query(
            `CREATE TABLE ${schema}.document(
                id_document SERIAL,
                created timestamp NOT NULL,
                modified timestamp NOT NULL,
                date timestamp NOT NULL,
                cod_sale VARCHAR(100) NOT NULL,
                type VARCHAR(2),
                serie VARCHAR(5),
                numero bigint NOT NULL,
                customer_number character varying(20) NOT NULL,
                customer character varying(255) NOT NULL,
                amount numeric(10,2) NOT NULL,
                states VARCHAR(1),
                json_format jsonb,
                response_send jsonb,
                response_anulate jsonb,
                id_company bigint,
                external_id VARCHAR(50),
                verified BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (id_document),
                UNIQUE (serie, numero)
            );`
        );

        res.json({
            message: 'Success',
            body: {
                message: "Tenant CREATED"
            }
        })
    } catch (error) {
        res.json({ error: error.message })
        next();
    }

};

//MIGRANDO DESDE EXCEL
const createTenantCompany = async (schema) => {
    try {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION faqture`);
        await pool.query(
            `CREATE TABLE ${schema}.document(
                id_document SERIAL,
                created timestamp NOT NULL,
                modified timestamp NOT NULL,
                date timestamp NOT NULL,
                cod_sale VARCHAR(100) NOT NULL,
                type VARCHAR(2),
                serie VARCHAR(5),
                numero bigint NOT NULL,
                customer_number character varying(20) NOT NULL,
                customer character varying(255) NOT NULL,
                amount numeric(10,2) NOT NULL,
                states VARCHAR(1),
                json_format jsonb,
                response_send jsonb,
                response_anulate jsonb,
                id_company bigint,
                external_id VARCHAR(50),
                verified BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (id_document),
                UNIQUE (serie, numero)
            );`
        );

        return true

    } catch (error) {
        console.log(error.message);
        return false
    }

};

const deleteTenant = async (req, res, next) => {
    const { schema } = req.params;
    console.log(schema);
    // const { schema } = req.body;
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    res.json({ message: `Schema ${schema} deleted Successfully` });
};


module.exports = {
    getTenant,
    createTenant,
    deleteTenant,
    createTenantCompany,
};