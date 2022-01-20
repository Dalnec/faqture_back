const {setFilters, setFiltersOR, setFiltersDocs} = require('../libs/functions')
const pool = require('../db')

const getDocuments = async (req, res, next) => {
    const tenant = req.params.tenant;
    const response = await pool.query(`SELECT * FROM ${tenant}.document`);
    res.status(200).json(response.rows)
}

const getDocumentByFilters1 = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        let { page, itemsPerPage} = req.query;
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
        res.json({error: error.message})
    }
};

const getDocumentByFilters = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const  { page, itemsPerPage } = req.query;
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
            data: response.rows
        });
    } catch (error) {
        res.json({error: error.message})
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
        const strdocument = JSON.parse(req.body.document)
        const {company, company_number} = req.params
        
        const { id_venta, fecha_de_emision, hora_de_emision, codigo_tipo_documento, serie_documento, 
            numero_documento, datos_del_cliente_o_receptor, totales} = strdocument
        const now = new Date()
        const date = `${fecha_de_emision} ${hora_de_emision}`

        const response = await pool.query(
            `INSERT INTO ${tenant}.document(created, modified, date, cod_sale, type, serie, numero, 
                customer_number, customer, amount, states, json_format, id_company) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13 ) RETURNING *`,
            [ now, now, date, id_venta, codigo_tipo_documento, serie_documento, 
                numero_documento, datos_del_cliente_o_receptor.numero_documento, 
                datos_del_cliente_o_receptor.apellidos_y_nombres_o_razon_social, 
                totales.total_venta, 'N', req.body.document, company ]);
        
        // console.log(response.rows[0]);

        res.status(200).json({
            success: true,
            data: {
                cod_sale: response.rows[0].cod_sale,
                filename: `${company_number}-${response.rows[0].type}-${response.rows[0].serie}-${response.rows[0].numero}`,
                state: 'N'
            }    
        })
    } catch (error) {
        res.status(401).json({
            success: false,
            data: {
                error
            }
        })
    }    
};

const updateDocument = async (req, res, next) => {
    const id = parseInt(req.params.id);
    const tenant = req.params.tenant;
    const newData = req.body;

    const response =await pool.query(
        `UPDATE ${tenant}.document SET $1 WHERE id = $2`, [newData ,id]);
    res.json({
        state: 'success',
        message: "UPDATED"
    })
};

const deleteDocument = async (req, res, next) => {
    const id = parseInt(req.params.id);
    const tenant = req.params.tenant;
    await pool.query(`DELETE FROM ${tenant}.document where id = $1`, [ id ]);
    res.json({
        state: 'success',
        message: "DELETED"
    })
};


const getDocumentCustomers = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        let client = req.query.client;
        let filters = { customer_number: client, customer: client}
        filters = setFiltersOR(filters)
        const response = await pool.query(`SELECT DISTINCT customer_number, customer FROM ${tenant}.document ${filters}
        LIMIT 20`);

        res.json({
            data: response.rows
        });
        
    } catch (error) {
        res.json({error: error.message})
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
};