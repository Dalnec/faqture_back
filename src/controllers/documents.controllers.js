const { customAlphabet } = require('nanoid')
const pool = require('../db');
const { setNewValues, setFiltersOR, setFiltersDocs } = require('../libs/functions')
const { sendDoc, get_correlative_number, select_document_by_serie_number, verifyingExternalIds, getAllRejectedDocsAllCompanies, get_docs_month_filter, select_document_by_external_id } = require('../libs/document.libs');
const { selectApiCompanyById, getCompanyByNumber, getCompanyByTenant } = require('../libs/company.libs');
const axios = require('axios');
const { ApiClient } = require('../libs/api.libs');
const { listReportDocuments } = require('../libs/connection');
const fs = require('fs');
const path = require('path');
const { ApiZenda } = require('../libs/apiZenda.libs');
const nanoid = customAlphabet('1234567890abcdef', 20)

const getDocuments = async (req, res, next) => {
    const tenant = req.params.tenant;
    const response = await pool.query(`SELECT * FROM ${tenant}.document ORDER BY id_document`);
    res.status(200).json(response.rows)
}

const getDocumentByFiltersReport = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        let filters = req.query;
        delete filters.page
        delete filters.itemsPerPage
        filters = setFiltersDocs(filters)
        const response = await pool.query(`SELECT id_document, TO_CHAR(date::DATE, 'yyyy-mm-dd') AS date, cod_sale, type, serie, numero, 
        customer_number, customer, amount, states, json_format, response_send, response_anulate, id_company, external_id FROM ${tenant}.document ${filters} ORDER BY id_document DESC`);

        res.json({
            count: response.rowCount,
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
        let strdocument = JSON.stringify(req.body, null, 4)
        const document = req.body
        const { company, company_number } = req.params

        const { id_venta, fecha_de_emision, hora_de_emision, codigo_tipo_documento, serie_documento,
            numero_documento, datos_del_cliente_o_receptor, totales } = document

        let numero;
        if (numero_documento === '#') {
            numero = await get_correlative_number(serie_documento, tenant)
            req.body.numero_documento = numero
            strdocument = JSON.stringify(req.body, null, 4)
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
                external_id: external_id,
                ...((numero_documento === '#') && { numero_documento: numero })
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
        // const id = parseInt(req.params.id);
        const id = req.params.id;
        const tenant = req.params.tenant;
        // let newData = req.body;
        // const newData = setNewValues(req.body)
        let message = '';
        let state = '';
        let code = 200;
        // verify actual state
        const doc = await pool.query(`SELECT * FROM ${tenant}.document WHERE cod_sale=$1 OR external_id=$1`, [id]);
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
            `UPDATE ${tenant}.document SET states=$1 WHERE cod_sale=$2 or external_id=$2 RETURNING *`, [state, id]);

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
    // res.json({
    //     state: 'success',
    //     message: "UPDATED"
    // })
    res.status(200).json({
        success: true,
        message: "Update!",
        response: response.rows[0],
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

const getXML = async (req, res, next) => {
    try {
        const { ruc, serie, numero, tipo } = req.body;
        if (!ruc || !serie || !numero) {
            return res.status(400).json({ success: false, message: 'Faltan datos' })
        }
        const company = await getCompanyByNumber(ruc)
        if (!company) {
            return res.status(400).json({ success: false, message: 'RUC no encontrado' })
        }
        let doc = await select_document_by_serie_number(company.tenant, serie, numero)
        if (!doc) {
            return res.status(400).json({ success: false, message: 'Documento no encontrado' })
        }
        let xml
        if (!!doc.response_send) {
            if (!JSON.parse(doc.response_send).success) {
                const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token)
                const rpta = await verifyingExternalIds(company.tenant, api)
                doc = await select_document_by_serie_number(company.tenant, serie, numero)
            }
            xml = JSON.parse(doc.response_send).links.xml
        } else {
            const result = await sendDoc(company, doc)
            xml = result.response_send.data.links
        }

        const str_xml = await axios.get(xml
        ).then(response => {
            return response.data
        }
        ).catch(function (error) {
            console.log(error);
        });

        res.status(200).send(str_xml);
    } catch (error) {
        console.log(error);
    }
}
const getXMLByTenant = async (req, res, next) => {
    try {
        const { tenant, external_id } = req.params;
        if (!external_id) {
            return res.status(400).json({ success: false, message: 'External ID no encontrado' })
        }
        const company = await getCompanyByTenant(tenant)
        if (!company) {
            return res.status(400).json({ success: false, message: 'Cliente no encontrado' })
        }
        let doc = await select_document_by_external_id(external_id, company.tenant)
        if (!doc) {
            return res.status(400).json({ success: false, message: 'Documento no encontrado' })
        }
        let xml, filename
        if (!!doc.response_send) {
            let response_send = JSON.parse(doc.response_send)
            if (!response_send.success) {
                const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token)
                const rpta = await verifyingExternalIds(company.tenant, api)
                doc = await select_document_by_external_id(external_id, company.tenant)
            }
            filename = response_send.data.filename
            xml = response_send.links.xml
        } else {
            const result = await sendDoc(company, doc)
            filename = result.response_send.data.data.filename
            xml = result.response_send.data.links
        }

        const localFilePath = path.join(__dirname, `../../uploads/${filename}.xml`);
        const response = await axios({
            method: 'get',
            url: xml,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(localFilePath);
        response.data.pipe(writer);

        writer.on('finish', () => {
            res.download(localFilePath, function (err) {
                if (err) {
                    console.log('Error downloading the file:', err);
                } else {
                    console.log('File downloaded successfully');
                    fs.unlinkSync(localFilePath);
                }
            });
        });

        writer.on('error', (err) => {
            console.error('Error writing the file:', err);
            return res.status(500).json({
                message: "Could not download file. Error: " + error,
            });
        });
    } catch (error) {
        return res.status(500).json({
            message: "Could not download file. Error: " + error,
        });
    }
}

const externalIdFormatNotaCredito = async (req, res, next) => {
    try {
        const { serie_documento, numero_documento, codigo_tipo_documento } = req.body.documento_afectado;
        const id = req.params.id;
        const tenant = req.params.tenant;

        const docRef = await select_document_by_serie_number(tenant, serie_documento, numero_documento);
        if (!docRef) {
            res.status(400).json({ success: false, message: error.message })
        }
        // const newData = setNewValues(req.body)
        req.body.documento_afectado = {
            external_id: JSON.parse(docRef.response_send).data.external_id,
            codigo_tipo_documento: codigo_tipo_documento
        }
        const strdocument = JSON.stringify(req.body, null, 4)
        const response = await pool.query(
            `UPDATE ${tenant}.document SET json_format=$1 WHERE id_document = $2 RETURNING *`, [JSON.stringify(strdocument, null, 4), id]);

        res.status(200).json({
            success: true,
            message: "Format Changed"
        })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }

};

const updateJsonFormat = async (req, res, next) => {
    try {
        const { docs, fecha_de_emision, hora_de_emision, fecha_de_vencimiento } = req.body;
        let { states } = req.body;
        const { tenant } = req.params;
        const placeholders = docs.map((_, i) => `$${i + 1}`).join(',');
        const documents = await pool.query(`SELECT id_document, json_format, states FROM ${tenant}.document WHERE id_document IN (${placeholders})`, docs);
        let formato
        for await (let row of documents.rows) {
            formato = {}
            formato = JSON.parse(row.json_format)
            formato = {
                ...formato,
                fecha_de_emision: fecha_de_emision || formato.fecha_de_emision,
                hora_de_emision: hora_de_emision || formato.hora_de_emision,
                fecha_de_vencimiento: fecha_de_vencimiento || formato.fecha_de_vencimiento
            }
            formato = JSON.stringify(formato, null, 4)
            states = states || row.states
            const response = await pool.query(`UPDATE ${tenant}.document SET json_format = $1, states = $2 WHERE id_document = $3 RETURNING * `, [JSON.stringify(formato, null, 4), states, row.id_document]);
            // console.log(response);
        }
        res.status(200).json({
            success: true,
            message: "Format Changed"
        })

    } catch (error) {
        console.log(error);
    }
}

const getRejected = async (req, res, next) => {
    try {
        const results = await getAllRejectedDocsAllCompanies()
        res.status(200).json({
            success: true,
            message: "Rejected Documents!",
            results,
        })

    } catch (error) {
        console.log(error);
    }
}

const reportDocuments = async (req, res, next) => {
    /* Get Data from Pro5 */
    try {
        const { url } = req.company
        const filters = req.query;
        const docs = await listReportDocuments(url, filters)
        res.status(200).json({
            success: true,
            message: "Report!!",
            data: docs
        })

    } catch (error) {
        console.log(error);
    }
}

const reportConcar = async (req, res, next) => {
    /* Get Data from Pro5 */
    try {
        const { type, tenant } = req.params;
        const filters = req.query;
        const { zenda_url, zenda_token } = await getCompanyByTenant(tenant)
        const url = `${zenda_url}api/${type}-concar`;
        const api = new ApiZenda(url, zenda_token, filters);
        const docs = await api.getData();
        res.status(200).json({
            success: true,
            message: "Report!!",
            data: docs
        })

    } catch (error) {
        console.log(error);
    }
}

const reports = async (req, res, next) => {
    try {
        const filters = req.query;
        const { tenant } = req.params;
        if (!tenant || tenant == 'undefined') {
            return res.status(404).json({
                success: false,
                message: "Cliente no Valido",
            })
        }
        const docs = await get_docs_month_filter(tenant, filters)
        if (!docs) {
            return res.status(200).json({
                success: true,
                message: "No se encontraron Ventas",
            })
        }
        let data = []
        docs.forEach((doc => {
            const { items, ...head } = JSON.parse(doc.json_format)
            head.states = doc.states
            items.forEach((d) => {
                data.push({ ...head, ...d })
            })
        }))
        return res.status(200).json({
            success: true,
            message: "Report!!",
            data
        })

    } catch (error) {
        console.log(error);
    }
}

const verifyDocumentBySerieNumber = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const { serie, number } = req.body
        const response = await select_document_by_serie_number(tenant, serie, number);
        if (!response) {
            return res.status(404).json({
                success: false,
                message: "No se encontraron Documentos",
            })
        }

        res.status(200).json({
            success: true,
            data: {
                cod_sale: response.cod_sale,
                filename: JSON.parse(response.response_send).data.filename,
                state: response.states,
                external_id: response.external_id,
            }
        })
    } catch (error) {
        res.status(401).json({
            success: false,
            message: error.message
        })
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
    getDocumentByFiltersReport,
    updateApiDocument,
    clearDocuments,
    createApiDocument,
    externalIdFormatNotaCredito,
    getXML,
    reportDocuments,
    getRejected,
    reports,
    updateJsonFormat,
    getXMLByTenant,
    verifyDocumentBySerieNumber,
    reportConcar,
};