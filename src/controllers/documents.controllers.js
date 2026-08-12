const { customAlphabet } = require('nanoid')
const pool = require('../db');
const { setNewValues, setFiltersOR, setFiltersDocs } = require('../libs/functions')
const { sendDoc, get_correlative_number, select_document_by_serie_number, verifyingExternalIds,
    getAllRejectedDocsAllCompanies, get_docs_month_filter, select_document_by_external_id,
    getDocGuiaTransportista, checkDispatchStatusTicket, sendDispatch, processDispatchStateN,
    processDispatchStateY, processDispatchStateE, update_document_state,
    sendAllDocsAllCompanies } = require('../libs/document.libs');
const { selectApiCompanyById, getCompanyByNumber, getCompanyByTenant } = require('../libs/company.libs');
const { ApiClient } = require('../libs/api.libs');
const { listReportDocuments } = require('../libs/connection');
const { ApiZenda } = require('../libs/apiZenda.libs');
const {
    SUNAT_STATUS_LABELS,
    translateSunatStatus,
    translateSystemStatus,
    getEnvironmentLabel,
    formatDateForSunat,
    formatDateISO,
    validateVoucherOnSunat,
} = require('../libs/sunatValidation.libs');
const { notifyError } = require('../libs/logger');
const nanoid = customAlphabet('1234567890abcdef', 20)

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { promisify } = require('util');
const { pipeline } = require('stream');

const streamPipeline = promisify(pipeline);


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

        const countResult = await pool.query(`SELECT COUNT(id_document) AS total FROM ${tenant}.document ${filters}`)
        const total = parseInt(countResult.rows[0].total, 10);
        res.json({
            page: page,
            count: total,
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
    const tenant = req.params.tenant;
    // Obtener datos de la empresa desde DB usando el tenant (no vienen en los params de la ruta)
    const apiCompany = await getCompanyByTenant(tenant);
    const company = apiCompany?.id_company ?? null;
    const company_number = apiCompany?.company_number ?? null;

    try {
        const strdocument = JSON.stringify(req.body, null, 4)
        const document = req.body
        const { codigo_tipo_documento } = document

        if (!codigo_tipo_documento) {
            return res.status(400).json({ error: "El codigo de documento es requerido" });
        }
        let response;
        let values;

        const { id_venta, fecha_de_emision, hora_de_emision, serie_documento,
            numero_documento } = document

        const now = new Date()
        const date = `${fecha_de_emision} ${hora_de_emision}`
        const external_id = nanoid()
        // SI es estado 'K' no declarar, es una nota de venta
        let states = codigo_tipo_documento === '80' ? 'K' : 'N';

        if (codigo_tipo_documento !== '31') {
            const { datos_del_cliente_o_receptor, totales } = document
            const total_venta = totales ? totales.total_venta : 0
            values = [now, now, date, id_venta, codigo_tipo_documento, serie_documento,
                numero_documento, datos_del_cliente_o_receptor.numero_documento,
                datos_del_cliente_o_receptor.apellidos_y_nombres_o_razon_social,
                total_venta, states, JSON.stringify(strdocument, null, 4), company, external_id]
        } else {
            const { datos_remitente } = document
            values = [now, now, date, id_venta, codigo_tipo_documento, serie_documento,
                numero_documento, datos_remitente.numero_documento,
                datos_remitente.apellidos_y_nombres_o_razon_social,
                0, states, JSON.stringify(strdocument, null, 4), company, external_id]
        }
        response = await pool.query(
            `INSERT INTO ${tenant}.document(created, modified, date, cod_sale, type, serie, numero,
                customer_number, customer, amount, states, json_format, id_company, external_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14 ) RETURNING *`, values
        );

        let result = {}
        if (apiCompany?.autosend) {
            result = await sendDoc(apiCompany, response.rows[0])
        }

        let responsePayload = {
            success: true,
            data: {
                cod_sale: response.rows[0].cod_sale,
                filename: `${company_number}-${response.rows[0].type}-${response.rows[0].serie}-${response.rows[0].numero}`,
                state: result.state ? result.state : 'N',
                external_id: external_id,
                ...((numero_documento === '#') && { numero_documento: numero })
            }
        };

        if (apiCompany?.cron_disable_reason === 'Falta de pago') {
            responsePayload.data.message = 'El comprobante ha sido recepcionado pero aún no ha sido declarado por falta de pago';
        }

        res.status(200).json(responsePayload);
    } catch (error) {
        // Duplicate key: el documento ya existe → retornar el existente con información correcta
        if (error.code === '23505' && error.constraint === 'document_serie_numero_key') {
            const { serie_documento, numero_documento } = req.body;
            console.warn(`[createDocument] Documento duplicado detectado: ${tenant} ${serie_documento}-${numero_documento}`);
            try {
                const existing = await select_document_by_serie_number(tenant, serie_documento, numero_documento);
                if (existing) {
                    let finalState = existing.states;
                    // Si el documento quedó pendiente y la empresa tiene autosend → enviar ahora
                    if (existing.states === 'N' && apiCompany?.autosend) {
                        const sendResult = await sendDoc(apiCompany, existing);
                        if (sendResult?.state) finalState = sendResult.state;
                    }

                    return res.status(200).json({
                        success: true,
                        duplicate: true,
                        data: {
                            cod_sale: existing.cod_sale,
                            filename: `${company_number}-${existing.type}-${existing.serie}-${existing.numero}`,
                            state: finalState ? finalState : 'N',
                            external_id: existing.external_id,
                        }
                    });
                }
            } catch (_) { /* caer al error genérico si falla la búsqueda */ }
        }

        notifyError({
            type: 'Error al crear documento',
            error,
            tenant,
            endpoint: `${req.method} ${req.originalUrl}`,
            payload: req.body,
        });
        res.status(401).json({
            success: false,
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
        notifyError({
            type: 'Error al crear documento (API)',
            error,
            tenant: req.params?.tenant,
            endpoint: `${req.method} ${req.originalUrl}`,
            payload: req.body,
        });
        res.status(401).json({
            success: false,
            message: error.message
        })
    }
};

// LEGACY - to be removed
const updateApiDocument = async (req, res, next) => {
    // use to update state to anulate
    try {
        const id = req.params.id;
        const tenant = req.params.tenant;
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
            case 'R':
                message = 'Document Rejected, Can not be Annulled!';
                code = 200;
                break;
            default:
                message = 'Error!';
                code = 405;
                break;
        }
        if (message != '')
            return res.status(code).json({
                success: doc.rows[0].states == 'R' ? true : false,
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

const nullifyDocument = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const { serie, number } = req.body
        let message = '';
        let state = '';
        let code = 200;
        let doc = await select_document_by_serie_number(tenant, serie, number);
        if (!doc) {
            return res.status(404).json({ success: false, message: "Documento no encontrado", })
        }

        switch (doc.states) {
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
                    cod_sale: doc.cod_sale,
                    filename: `${doc.type}-${doc.serie}-${doc.numero}`,
                    state: doc.states
                },
                message: message
            })

        const response = await update_document_state(doc.id_document, tenant, { id: doc.id_document, state: state });

        res.status(200).json({
            success: true,
            data: {
                cod_sale: response.cod_sale,
                filename: `${response.type}-${response.serie}-${response.numero}`,
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
    await pool.query(`DELETE FROM ${tenant}.document where id_document=$1`, [id]);
    res.status(200).json({
        success: true,
        message: "Deleted!",
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
        const tenant = req.params.tenant;
        const { serie, number } = req.query;

        console.log('=== Inicio getXMLByTenant ===');
        console.log('Tenant:', tenant);
        console.log('Serie:', serie);
        console.log('Number:', number);

        // Validar parámetros requeridos
        if (!serie || !number) {
            return res.status(400).json({
                success: false,
                message: 'Faltan parametros para la consulta'
            });
        }

        // Obtener compañía
        const company = await getCompanyByTenant(tenant);
        console.log('Company encontrada:', company ? 'Sí' : 'No');

        if (!company) {
            return res.status(400).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }

        // Buscar documento
        let doc = await select_document_by_serie_number(tenant, serie, number);
        console.log('Documento encontrado:', doc ? 'Sí' : 'No');

        if (!doc) {
            return res.status(400).json({
                success: false,
                message: 'Documento no encontrado'
            });
        }

        let xml, filename;

        // Procesar documento según tenga o no response_send
        if (!!doc.response_send) {
            console.log('Documento tiene response_send');

            let response_send;
            try {
                response_send = JSON.parse(doc.response_send);
                console.log('response_send parseado:', JSON.stringify(response_send, null, 2));
            } catch (parseError) {
                console.error('Error parseando response_send:', parseError);
                return res.status(500).json({
                    success: false,
                    message: 'Error al procesar respuesta del documento'
                });
            }

            // Validar estructura de response_send
            if (!response_send.data || !response_send.links) {
                console.error('Estructura de response_send inválida');
                console.log('response_send.data:', response_send.data);
                console.log('response_send.links:', response_send.links);

                return res.status(500).json({
                    success: false,
                    message: 'Estructura de respuesta inválida'
                });
            }

            if (!response_send.success) {
                console.log('response_send.success es false, verificando external_ids');

                const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token);
                const rpta = await verifyingExternalIds(company.tenant, api);
                console.log('Resultado de verifyingExternalIds:', rpta);

                // Nota: external_id no está definido en el scope actual
                // Necesitarías obtenerlo del documento o parámetros
                doc = await select_document_by_serie_number(tenant, serie, number);

                if (!doc || !doc.response_send) {
                    return res.status(500).json({
                        success: false,
                        message: 'No se pudo actualizar el documento'
                    });
                }

                response_send = JSON.parse(doc.response_send);
            }

            filename = response_send.data.filename;
            xml = response_send.links.xml;

            console.log('Filename obtenido:', filename);
            console.log('XML URL obtenido:', xml);

        } else {
            console.log('Documento NO tiene response_send, enviando documento');

            const result = await sendDoc(company, doc);
            console.log('Resultado de sendDoc:', JSON.stringify(result, null, 2));

            // Validar resultado de sendDoc
            if (!result) {
                console.error('result es undefined');
                return res.status(500).json({
                    success: false,
                    message: 'Error al enviar documento - respuesta vacía'
                });
            }

            if (!result.data) {
                console.error('Estructura de result.data inválida');
                return res.status(500).json({
                    success: false,
                    message: 'Error al intentar enviar documento - estructura recibidainválida'
                });
            }

            filename = result.data.filename;
            xml = result.links.xml;

            console.log('Filename obtenido de sendDoc:', filename);
            console.log('XML URL obtenido de sendDoc:', xml);
        }

        // Validar que tenemos filename y xml
        if (!filename) {
            console.error('Filename no disponible');
            if (!xml) {
                return res.status(500).json({
                    success: false,
                    message: 'Nombre de archivo no disponible'
                });
            } else {
                filename = `${company.company_number}-${doc.type}-${doc.serie}-${doc.numero}`
            }
        }

        if (!xml) {
            console.error('URL del XML no disponible');
            return res.status(500).json({
                success: false,
                message: 'URL del XML no disponible'
            });
        }

        // Descargar archivo XML
        const localFilePath = path.join(__dirname, `../../uploads/${filename}.xml`);
        console.log('Ruta local del archivo:', localFilePath);
        console.log('Descargando XML desde:', xml);

        let response;
        try {
            response = await axios({
                method: 'get',
                url: xml,
                responseType: 'stream',
                timeout: 30000
            });

            // console.log('Respuesta de axios recibida');
            // console.log('Status:', response?.status);
            // console.log('Headers:', response?.headers);

            if (!response || !response.data) {
                throw new Error('Respuesta inválida del servidor XML');
            }

        } catch (axiosError) {
            console.error('Error en axios al descargar XML:', axiosError.message);
            console.error('Stack:', axiosError.stack);

            return res.status(500).json({
                success: false,
                message: `Error al descargar XML: ${axiosError.message}`
            });
        }

        // Escribir archivo localmente
        const writer = fs.createWriteStream(localFilePath);
        response.data.pipe(writer);

        writer.on('finish', () => {
            console.log('Archivo escrito exitosamente');

            res.download(localFilePath, `${filename}.xml`, function (err) {
                if (err) {
                    console.error('Error al enviar archivo al cliente:', err);
                } else {
                    console.log('Archivo descargado exitosamente por el cliente');
                }

                // Eliminar archivo temporal
                try {
                    fs.unlinkSync(localFilePath);
                    console.log('Archivo temporal eliminado');
                } catch (unlinkError) {
                    console.error('Error al eliminar archivo temporal:', unlinkError);
                }
            });
        });

        writer.on('error', (err) => {
            console.error('Error escribiendo el archivo:', err);
            console.error('Stack:', err.stack);

            return res.status(500).json({
                success: false,
                message: `Error al escribir archivo: ${err.message}`
            });
        });

    } catch (error) {
        console.error('=== Error general en getXMLByTenant ===');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);

        return res.status(500).json({
            success: false,
            message: `Error al procesar solicitud: ${error.message}`
        });
    }
};

const getCDRByTenant = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const { serie, number } = req.query;

        console.log('=== Inicio getCDRByTenant ===');
        console.log('Tenant:', tenant);
        console.log('Serie:', serie);
        console.log('Number:', number);

        // Validar parámetros requeridos
        if (!serie || !number) {
            return res.status(400).json({
                success: false,
                message: 'Faltan parametros para la consulta'
            });
        }

        // Obtener compañía
        const company = await getCompanyByTenant(tenant);
        console.log('Company encontrada:', company ? 'Sí' : 'No');

        if (!company) {
            return res.status(400).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }

        // Buscar documento
        let doc = await select_document_by_serie_number(tenant, serie, number);
        console.log('Documento encontrado:', doc ? 'Sí' : 'No');

        if (!doc) {
            return res.status(400).json({
                success: false,
                message: 'Documento no encontrado'
            });
        }

        let cdr, filename;

        // Procesar documento según tenga o no response_send
        if (!!doc.response_send) {
            console.log('Documento tiene response_send');

            let response_send;
            try {
                response_send = JSON.parse(doc.response_send);
                console.log('response_send parseado:', JSON.stringify(response_send, null, 2));
            } catch (parseError) {
                console.error('Error parseando response_send:', parseError);
                return res.status(500).json({
                    success: false,
                    message: 'Error al procesar respuesta del documento'
                });
            }

            // Validar estructura de response_send
            if (!response_send.data || !response_send.links) {
                console.error('Estructura de response_send inválida');
                console.log('response_send.data:', response_send.data);
                console.log('response_send.links:', response_send.links);

                return res.status(500).json({
                    success: false,
                    message: 'Estructura de respuesta inválida'
                });
            }

            if (!response_send.success) {
                console.log('response_send.success es false, verificando external_ids');

                const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token);
                const rpta = await verifyingExternalIds(company.tenant, api);
                console.log('Resultado de verifyingExternalIds:', rpta);

                doc = await select_document_by_serie_number(tenant, serie, number);

                if (!doc || !doc.response_send) {
                    return res.status(500).json({
                        success: false,
                        message: 'No se pudo actualizar el documento'
                    });
                }

                response_send = JSON.parse(doc.response_send);
            }

            filename = response_send.data.filename;
            cdr = response_send.links.cdr;

            console.log('Filename obtenido:', filename);
            console.log('CDR URL obtenido:', cdr);

        } else {
            console.log('Documento NO tiene response_send, enviando documento');

            const result = await sendDoc(company, doc);
            console.log('Resultado de sendDoc:', JSON.stringify(result, null, 2));

            // Validar resultado de sendDoc
            if (!result) {
                console.error('result es undefined');
                return res.status(500).json({
                    success: false,
                    message: 'Error al enviar documento - respuesta vacía'
                });
            }

            if (!result.data) {
                console.error('Estructura de result.data inválida');
                return res.status(500).json({
                    success: false,
                    message: 'Error al intentar enviar documento - estructura recibidainválida'
                });
            }

            filename = result.data.filename;
            cdr = result.links.cdr;

            console.log('Filename obtenido de sendDoc:', filename);
            console.log('CDR URL obtenido de sendDoc:', cdr);
        }

        // Validar que tenemos filename y cdr
        if (!filename) {
            console.error('Filename no disponible');
            if (!cdr) {
                return res.status(500).json({
                    success: false,
                    message: 'Nombre de archivo no disponible'
                });
            } else {
                filename = `${company.company_number}-${doc.type}-${doc.serie}-${doc.numero}`
            }
        }

        if (!cdr) {
            console.error('URL del CDR no disponible');
            return res.status(500).json({
                success: false,
                message: 'URL del CDR no disponible'
            });
        }

        // Descargar archivo CDR
        const localFilePath = path.join(__dirname, `../../uploads/${filename}.zip`);
        console.log('Ruta local del archivo:', localFilePath);
        console.log('Descargando CDR desde:', cdr);

        let response;
        try {
            response = await axios({
                method: 'get',
                url: cdr,
                responseType: 'stream',
                timeout: 30000
            });

            if (!response || !response.data) {
                throw new Error('Respuesta inválida del servidor CDR');
            }

        } catch (axiosError) {
            console.error('Error en axios al descargar CDR:', axiosError.message);
            console.error('Stack:', axiosError.stack);

            return res.status(500).json({
                success: false,
                message: `Error al descargar CDR: ${axiosError.message}`
            });
        }

        // Escribir archivo localmente
        const writer = fs.createWriteStream(localFilePath);
        response.data.pipe(writer);

        writer.on('finish', () => {
            console.log('Archivo escrito exitosamente');

            res.download(localFilePath, `${filename}.zip`, function (err) {
                if (err) {
                    console.error('Error al enviar archivo al cliente:', err);
                } else {
                    console.log('Archivo descargado exitosamente por el cliente');
                }

                // Eliminar archivo temporal
                try {
                    fs.unlinkSync(localFilePath);
                    console.log('Archivo temporal eliminado');
                } catch (unlinkError) {
                    console.error('Error al eliminar archivo temporal:', unlinkError);
                }
            });
        });

        writer.on('error', (err) => {
            console.error('Error escribiendo el archivo:', err);
            console.error('Stack:', err.stack);

            return res.status(500).json({
                success: false,
                message: `Error al escribir archivo: ${err.message}`
            });
        });

    } catch (error) {
        console.error('=== Error general en getCDRByTenant ===');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);

        return res.status(500).json({
            success: false,
            message: `Error al procesar solicitud: ${error.message}`
        });
    }
};

const getXMLByTenant2 = async (req, res) => {
    const { tenant, external_id } = req.params;

    if (!external_id) {
        return res.status(400).json({ success: false, message: 'External ID no encontrado' });
    }

    try {
        const company = await getCompanyByTenant(tenant);
        if (!company) {
            return res.status(400).json({ success: false, message: 'Cliente no encontrado' });
        }

        let doc = await select_document_by_external_id(external_id, company.tenant);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Documento no encontrado' });
        }

        let xmlUrl, filename;

        if (doc.response_send) {
            const response_send = JSON.parse(doc.response_send);

            if (!response_send.success) {
                const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token);
                await verifyingExternalIds(company.tenant, api);
                doc = await select_document_by_external_id(external_id, company.tenant);
            }

            filename = response_send.data?.filename;
            xmlUrl = response_send.links?.xml;
        } else {
            const result = await sendDoc(company, doc);
            filename = result.response_send?.data?.data?.filename;
            xmlUrl = result.response_send?.data?.links;
        }

        if (!xmlUrl || !filename) {
            return res.status(500).json({ success: false, message: 'No se pudo obtener el archivo XML.' });
        }

        const localFilePath = path.join(__dirname, `../../uploads/${filename}.xml`);

        const response = await axios.get(xmlUrl, { responseType: 'stream' });

        await streamPipeline(response.data, fs.createWriteStream(localFilePath));

        res.download(localFilePath, `${filename}.xml`, (err) => {
            fs.unlink(localFilePath, () => { }); // Limpieza del archivo sin bloquear la respuesta

            if (err) {
                console.error('Error al enviar el archivo:', err);
                if (!res.headersSent) {
                    return res.status(500).json({ success: false, message: 'Error al descargar el archivo.' });
                }
            }
        });

    } catch (error) {
        console.error('Error en getXMLByTenant:', error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
        }
    }
};

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


const reportContaSisCorp = async (req, res, next) => {
    try {
        const filters = req.query;
        const { tenant } = req.params;
        if (!tenant || tenant == 'undefined') {
            return res.status(404).json({
                success: false,
                message: "Cliente no Valido",
            });
        }
        const docs = await get_docs_month_filter(tenant, filters);
        if (!docs) {
            return res.status(200).json({
                success: true,
                message: "No se encontraron Ventas",
            });
        }

        const data = [];
        for (const doc of docs) {
            const json_format = JSON.parse(doc.json_format);
            delete doc.json_format;
            delete doc.response_send;
            delete doc.response_anulate;
            delete doc.external_id;
            delete doc.id_company;
            delete json_format.id_venta;
            delete json_format.informacion_adicional;

            if (doc.type == '07') {
                const affected = await select_document_by_serie_number(
                    tenant,
                    json_format.documento_afectado.serie_documento,
                    json_format.documento_afectado.numero_documento
                );
                if (affected) {
                    json_format.documento_afectado.fecha_documento = JSON.parse(affected.json_format).fecha_de_emision;
                } else {
                    json_format.documento_afectado.fecha_documento = null;
                }
            }

            data.push({
                ...doc,
                ...json_format,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Report CONTASISCORP!!",
            data,
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Error al generar el reporte",
        });
    }
};


const verifyDocumentBySerieNumber = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const { serie, number } = req.body;

        if (!serie || typeof serie !== 'string' || serie.trim() === '') {
            return res.status(400).json({
                success: false,
                message: "El campo 'serie' es requerido y debe ser una cadena de texto válida",
            });
        }
        if (!number || (typeof number !== 'string' && typeof number !== 'number') || String(number).trim() === '') {
            return res.status(400).json({
                success: false,
                message: "El campo 'number' es requerido y debe ser un valor válido",
            });
        }

        let doc = await select_document_by_serie_number(tenant, serie, number);
        if (!doc) {
            return res.status(404).json({
                success: false,
                message: "Documento no encontrado",
            });
        }

        const company = await getCompanyByTenant(tenant);
        if (!company) {
            return res.status(400).json({ success: false, message: 'Cliente no encontrado' });
        }

        let data = {};

        if (!doc.response_send) {
            const result = await sendDoc(company, doc);
            if (!result || !result.success) {
                return res.status(200).json({
                    success: false,
                    message: result?.message || 'Error al enviar el documento',
                    state: result?.state || 'X',
                    data: {
                        cod_sale: doc.cod_sale,
                        state: result?.state || 'X',
                        external_id: doc.external_id,
                    }
                });
            }
            doc = await select_document_by_external_id(doc.external_id, company.tenant);
            if (!doc || !doc.response_send) {
                return res.status(500).json({
                    success: false,
                    message: 'No se pudo obtener la respuesta del documento después del envío',
                });
            }
        }

        let response_send;
        try {
            response_send = JSON.parse(doc.response_send);
        } catch (parseError) {
            notifyError({
                type: 'Error parseando response_send en verifyDocumentBySerieNumber',
                error: parseError,
                tenant: req.params?.tenant,
                document: `${serie}-${number}`,
                endpoint: `${req.method} ${req.originalUrl}`,
                payload: { response_send: doc.response_send },
            });
            return res.status(500).json({
                success: false,
                message: 'Error al procesar la respuesta del documento',
            });
        }

        if (doc.type !== '31') {
            if (!response_send.success) {
                const api = new ApiClient(`${company.url}/api/documents/lists/`, company.token);
                await verifyingExternalIds(company.tenant, api);
                doc = await select_document_by_external_id(doc.external_id, company.tenant);

                if (!doc || !doc.response_send) {
                    return res.status(500).json({
                        success: false,
                        message: 'No se pudo actualizar la respuesta del documento',
                    });
                }

                try {
                    response_send = JSON.parse(doc.response_send);
                } catch (parseError) {
                    return res.status(500).json({
                        success: false,
                        message: 'Error al procesar la respuesta actualizada del documento',
                    });
                }

                if (!response_send.success) {
                    return res.status(200).json({
                        success: false,
                        message: response_send.message || 'La verificación del documento falló',
                        state: response_send.state || 'X',
                        external_id: doc.external_id,
                        data: {
                            cod_sale: doc.cod_sale,
                            state: response_send.state || 'X',
                            external_id: doc.external_id,
                            message: response_send.message || null,
                        }
                    });
                }
            }
            data = response_send;
        } else {
            if (company.external_api?.apisunat) {
                const rpta = await getDocGuiaTransportista(company, doc);
                data = rpta;
            }
        }

        if (response_send?.state === 'X' || response_send?.state === 'R') {
            return res.status(200).json({
                success: false,
                message: response_send.message || (response_send.state === 'R' ? 'Documento rechazado por SUNAT' : 'Error en el procesamiento del documento'),
                state: response_send.state,
                external_id: doc.external_id,
                data: {
                    cod_sale: doc.cod_sale,
                    state: response_send.state,
                    external_id: doc.external_id,
                    message: response_send.message || null,
                }
            });
        }

        res.status(200).json({
            success: true,
            data: {
                cod_sale: doc.cod_sale,
                filename: response_send?.data?.filename || null,
                state: doc.states,
                external_id: doc.external_id,
                response: data,
            }
        });
    } catch (error) {
        notifyError({
            type: 'Error al verificar documento por serie/número',
            error,
            tenant: req.params?.tenant,
            document: `${req.body?.serie}-${req.body?.number}`,
            endpoint: `${req.method} ${req.originalUrl}`,
            payload: req.body,
        });
        res.status(401).json({
            success: false,
            message: error.message
        });
    }
};

const verifyDispatchesStatusTicket = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const { serie, number } = req.body
        let company;
        if (tenant) {
            company = await getCompanyByTenant(tenant)
            if (!company) {
                return res.status(400).json({ success: false, message: 'Cliente no encontrado' })
            }
        } else {
            const id_company = req.body.id_company
            if (!id_company) {
                return res.status(400).json({ success: false, message: 'Cliente no proporcionado' })
            }
            company = await selectApiCompanyById(id_company)
            if (!company) {
                return res.status(400).json({ success: false, message: 'Cliente no encontrado' })
            }
        }

        let doc = await select_document_by_serie_number(tenant, serie, number);
        if (!doc) {
            return res.status(404).json({ success: false, message: "Documento no encontrado", })
        }

        let response;
        switch (doc.states) {
            case 'N':
                response = await processDispatchStateN(company, doc);
                break;
            case 'Y':
                response = await processDispatchStateY(company, doc);
                break;
            case 'E':
                response = await processDispatchStateE(company, doc);
                break;
            case 'W':
                response = JSON.parse(doc.response_send);
                break;
            case 'X':
                response = JSON.parse(doc.response_send);
                break;
            default:
                return res.status(400).json({ success: false, message: "Estado no válido" });
        }
        delete response.doc
        if (!response?.success) {
            return res.status(400).json({ success: false, ...response });
        }
        return res.status(200).json({ success: true, ...response })
    } catch (error) {
        notifyError({
            type: 'Error al verificar estado de guía (dispatch)',
            error,
            tenant: req.params?.tenant,
            document: `${req.body?.serie}-${req.body?.number}`,
            endpoint: `${req.method} ${req.originalUrl}`,
            payload: req.body,
        });
        res.status(401).json({
            success: false,
            message: error.message
        })
    }
};

const verifyDocumentsRangeSunat = async (req, res, next) => {
    try {
        const tenant = req.params.tenant;
        const { serie, numero_inicio, numero_fin, codigo_tipo_documento } = req.body;

        if (!serie || numero_inicio === undefined || numero_fin === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos: serie, numero_inicio, numero_fin',
            });
        }

        const start = Number(numero_inicio);
        const end = Number(numero_fin);
        if (!Number.isInteger(start) || !Number.isInteger(end)) {
            return res.status(400).json({
                success: false,
                message: 'numero_inicio y numero_fin deben ser enteros',
            });
        }

        if (end < start) {
            return res.status(400).json({
                success: false,
                message: 'numero_fin no puede ser menor a numero_inicio',
            });
        }

        const maxRange = 500;
        if (end - start + 1 > maxRange) {
            return res.status(400).json({
                success: false,
                message: `Rango maximo permitido: ${maxRange}`,
            });
        }

        const company = await getCompanyByTenant(tenant);
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado',
            });
        }

        const params = [serie, start, end];
        let query = `SELECT id_document, date, type, serie, numero, customer, amount, states
        FROM ${tenant}.document
        WHERE serie = $1 AND numero >= $2 AND numero <= $3`;

        if (codigo_tipo_documento) {
            params.push(String(codigo_tipo_documento));
            query += ` AND type = $${params.length}`;
        }

        query += ' ORDER BY numero ASC';

        const docsResult = await pool.query(query, params);
        const docs = docsResult.rows || [];

        if (!docs.length) {
            return res.status(200).json({
                success: true,
                timestamp: new Date().toISOString(),
                summary: {
                    total_processed: 0,
                    total_errors: 0,
                    total_accepted: 0,
                },
                results: [],
            });
        }

        const results = [];
        let totalErrors = 0;
        let totalAccepted = 0;

        for (const doc of docs) {
            const normalized = {
                environment: getEnvironmentLabel(),
                document: `${doc.serie}-${String(doc.numero).padStart(4, '0')}`,
                issue_date: formatDateISO(doc.date),
                customer: doc.customer,
                code: doc.type,
                system_status: translateSystemStatus(doc.states),
                sunat_status: SUNAT_STATUS_LABELS.PENDING,
            };

            try {
                if (!doc.type || !doc.date) {
                    throw new Error('Comprobante sin tipo o fecha para validar en SUNAT');
                }

                const fechaEmision = formatDateForSunat(doc.date);
                const sunatResponse = await validateVoucherOnSunat({
                    ruc: company.company_number,
                    codigoComp: doc.type,
                    serie: doc.serie,
                    numero: doc.numero,
                    fechaEmision,
                    monto: doc.amount,
                });

                const estadoCp = sunatResponse?.data?.estadoCp;
                normalized.sunat_status = translateSunatStatus(estadoCp);

                if (normalized.sunat_status === SUNAT_STATUS_LABELS.ACCEPTED) {
                    totalAccepted += 1;
                }

                normalized.sunat_response = {
                    success: !!sunatResponse?.success,
                    message: sunatResponse?.message || null,
                    data: sunatResponse?.data || null,
                };
            } catch (error) {
                totalErrors += 1;
                normalized.sunat_status = SUNAT_STATUS_LABELS.ERROR;
                normalized.error = error.message;
                if (error.details) {
                    normalized.error_details = error.details;
                }
            }

            results.push(normalized);
        }

        return res.status(200).json({
            success: totalErrors === 0,
            timestamp: new Date().toISOString(),
            summary: {
                total_processed: docs.length,
                total_errors: totalErrors,
                total_accepted: totalAccepted,
            },
            results,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
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
    getCDRByTenant,
    verifyDocumentBySerieNumber,
    reportConcar,
    reportContaSisCorp,
    getXMLByTenant2,
    verifyDispatchesStatusTicket,
    nullifyDocument,
    verifyDocumentsRangeSunat,
};