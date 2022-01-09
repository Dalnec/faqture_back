const setFilters = require('../libs/functions')
const pool = require('../db')

const getDocuments = async (req, res, next) => {
    const response = await pool.query('SELECT * FROM document');
    res.status(200).json(response.rows)
}

const getDocumentByFilters = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        let { filters, page, itemsPerPage} = req.body;
        filters = setFilters(filters)
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
    console.log(id);
    const response = await pool.query('SELECT * FROM document WHERE id_document = $1', [id]);
    res.json(response.rows);
};

const createDocument = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const strdocument = JSON.parse(req.body.document)
        const { 
            id_venta, 
            fecha_de_emision, 
            codigo_tipo_documento, 
            serie_documento, 
            numero_documento, 
            datos_del_cliente_o_receptor, 
            totales} = strdocument
        const now = new Date()
        // console.log(id_venta);
        const response = await pool.query(
            `INSERT INTO ${tenant}.document(created, modified, date, cod_sale, type, serie, numero, customer_number, customer, amount, states, json_format, id_company) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13 )`,
            [ now, now, fecha_de_emision, id_venta, codigo_tipo_documento, serie_documento, 
                numero_documento, datos_del_cliente_o_receptor.numero_documento, 
                datos_del_cliente_o_receptor.apellidos_y_nombres_o_razon_social, 
                totales.total_venta, 'N', JSON.stringify(req.body.document), 1 ]);
        res.json({
            message: 'Document Added successfully',
            body: {
                message: "PROCESADO"
            }
        })
    } catch (error) {
        res.json({error: error.message})
    }
    
};

const updateDocument = async (req, res, next) => {
    const id = parseInt(req.params.id);
    const { name, email } = req.body;

    const response =await pool.query('UPDATE users SET name = $1, email = $2 WHERE id = $3', [
        name,
        email,
        id
    ]);
    res.json('User Updated Successfully');
};

const deleteDocument = async (req, res, next) => {
    const id = parseInt(req.params.id);
    await pool.query('DELETE FROM users where id = $1', [ id ]);
    res.json(`User ${id} deleted Successfully`);
};


module.exports = {
    getDocuments, 
    createDocument, 
    getDocumentById, 
    deleteDocument, 
    updateDocument,
    getDocumentByFilters
};