const mysql2 = require('mysql2');
const { Client } = require('ssh2');
const fs = require('fs');
const { notifyError } = require('./logger');

require('dotenv').config()


const create_mysql_connection = (url) => {
    let server = url.replace('https://', '');
    server = server.split(".", 2);
    let tunnelConfig = {
        host: process.env.DB_SSH_HOST,
        port: 7236,
        username: process.env.DB_SSH_USER,
        password: process.env.DB_SSH_PASSWORD
    }
    let dbServer;
    switch (server[1]) {
        case "tsifactur":
            dbServer = {
                host: process.env.DB_THOST,
                user: process.env.DB_TUSER,
                password: process.env.DB_TPASS,
                database: "tsifactur_" + server[0],
                port: parseInt(process.env.DB_TPORT, 10)
            }
            break;
        case "faqture":
            dbServer = {
                host: process.env.DB_FHOST,
                user: process.env.DB_FUSER,
                password: process.env.DB_FPASS,
                database: "faqture_" + server[0],
                port: parseInt(process.env.DB_FPORT, 10)
            }
            break;
        case "pse":
            dbServer = {
                host: process.env.DB_PSE_HOST,
                user: process.env.DB_PSE_USER,
                password: process.env.DB_PSE_PASS,
                database: "tenancy_" + server[0],
                port: parseInt(process.env.DB_PSE_PORT, 10)
            }
            tunnelConfig = {
                host: process.env.DB_PSE_SSH_HOST,
                port: parseInt(process.env.DB_PSE_SSH_PORT, 10) || 22,
                username: process.env.DB_PSE_SSH_USER,
                privateKey: fs.readFileSync(process.env.DB_PSE_SSH_KEY_PATH),
                keepaliveInterval: 30000,
                readyTimeout: 20000
            }
            break;
    default:
        const err = new Error(`URL de base de datos no reconocida: "${url}"`);
        notifyError({ type: 'Error configuración DB', error: err });
        return Promise.reject(err);
    }

    if (!dbServer.host) {
        const err = new Error(`Host de base de datos no configurado para: "${url}"`);
        notifyError({ type: 'Error configuración DB', error: err });
        return Promise.reject(err);
    }

    const forwardConfig = {
        srcHost: '127.0.0.1',
        srcPort: 3306,
        dstHost: dbServer.host,
        dstPort: dbServer.port
    };

    // Se crea una nueva instancia por cada llamada para evitar acumulación de listeners
    const sshClient = new Client();

    const SSHConnection = new Promise((resolve, reject) => {
        sshClient.once('ready', () => {
            sshClient.forwardOut(
                forwardConfig.srcHost,
                forwardConfig.srcPort,
                forwardConfig.dstHost,
                forwardConfig.dstPort,
                (err, stream) => {
                    if (err) {
                        sshClient.end();
                        notifyError({ type: 'Error SSH forwardOut', error: err, payload: { url } });
                        return reject(err);
                    }
                    const updatedDbServer = {
                        ...dbServer,
                        stream
                    };
                    const connection = mysql2.createConnection(updatedDbServer);
                    connection.connect((error) => {
                        if (error) {
                            sshClient.end();
                            const tenantFromUrl = server && server[0] ? server[0] : null;
                            notifyError({ type: 'Error conexión MySQL vía SSH', error, tenant: tenantFromUrl, payload: { url } });
                            return reject(error);
                        }
                        // Cerrar el cliente SSH cuando la conexión MySQL termine.
                        // mysql2 no emite 'end' en la conexión tras conn.end(), así que se
                        // escucha el canal del túnel y se agrega un respaldo tras end()/destroy().
                        // Sin esto cada consulta deja una sesión SSH abierta en el servidor.
                        let tunnelClosed = false;
                        const closeTunnel = () => {
                            if (tunnelClosed) return;
                            tunnelClosed = true;
                            sshClient.end();
                        };
                        stream.once('end', closeTunnel);
                        stream.once('close', closeTunnel);
                        connection.on('error', closeTunnel);
                        const originalEnd = connection.end.bind(connection);
                        connection.end = (...args) => {
                            const result = originalEnd(...args);
                            setTimeout(closeTunnel, 5000).unref();
                            return result;
                        };
                        const originalDestroy = connection.destroy.bind(connection);
                        connection.destroy = (...args) => {
                            const result = originalDestroy(...args);
                            closeTunnel();
                            return result;
                        };
                        resolve(connection);
                    });
                });
        });

        sshClient.on('error', (err) => {
            notifyError({ type: 'Error conexión SSH', error: err, payload: { url } });
            reject(err);
        });

        sshClient.connect(tunnelConfig);
    });
    return SSHConnection;
};

const update_doc_api = async (ext_id = null, url) => {
    let query;
    const conn = await create_mysql_connection(url)
    if (ext_id) {
        query = `UPDATE documents SET group_id='02' WHERE external_id = '${ext_id}'`
    } else {
        query = "UPDATE documents SET group_id='02' WHERE document_type_id ='03' AND group_id <> '02'"
    }
    return new Promise(data => {
        conn.query(query, function (error, result) {
            if (error) {
                console.log(error);
                try { conn.end(); } catch (e) {}
                throw error;
            }
            try {
                console.log(result.affectedRows + " record(s) updated");
                conn.end();
                data(result[0]);
            } catch (error) {
                try { conn.end(); } catch (e) {}
                data({});
                throw error;
            }
        });
    });
}

const checkConnection = async (url = '') => {
    let query = 'SELECT id, external_id, group_id, series, number FROM documents LIMIT 5';
    const conn = await create_mysql_connection(url)

    return new Promise((resolve, reject) => {
        conn.query(query, function (error, result, fields) {
            if (error) {
                console.log(error);
                try { conn.end(); } catch (e) {}
                throw error;
            }
            conn.end();
            resolve(result);
        });
    })
}

const listReportDocuments = async (url, filters) => {

    let query = `SELECT D.id, data_json, document_type_id, series, number, date_of_issue, 
    state_type_id, customer, currency_type_id, payment_condition_id, payment_method_type_id, 
    exchange_rate_sale, total_prepayment, total_charge, total_discount, total_exportation, 
    total_free, total_taxed, total_unaffected, total_exonerated, total_igv, total_igv_free,
    total_base_isc, total_isc, total_base_other_taxes, total_other_taxes, total_plastic_bag_taxes, 
    total_taxes, total_value, subtotal, total, N.document_id, N.affected_document_id,
    (SELECT COncat(DD.series, "-",DD.number) FROM documents AS DD WHERE DD.id = N.affected_document_id) AS affected_document_description
    FROM documents as D
    LEFT OUTER JOIN notes as N ON D.id = N.document_id
    WHERE YEAR(D.date_of_issue)=${filters.year} 
    AND MONTH(D.date_of_issue)=${filters.month}
    GROUP BY D.series, D.number`;

    const conn = await create_mysql_connection(url)

    return new Promise((resolve, reject) => {
        conn.query(query, function (error, result, fields) {
            if (error) {
                console.log(error);
                try { conn.end(); } catch (e) {}
                throw error;
            }
            conn.end();
            resolve(result);
        });
    })
}

const resetTicketSingleShipment = async (url = '') => {
    try {
        if (!url) return { success: false, message: 'URL no provista' };
        const query = "UPDATE documents SET ticket_single_shipment = 0 WHERE ticket_single_shipment = 1 AND document_type_id IN ('03', '07', '08') AND state_type_id = '01'";
        const conn = await create_mysql_connection(url);

        return new Promise((resolve) => {
            conn.query(query, function (error, result) {
                if (error) {
                    console.error('[resetTicketSingleShipment] Error en MySQL query:', error.message);
                    try { conn.end(); } catch (e) {}
                    return resolve({ success: false, message: error.message });
                }
                try {
                    const affected = result?.affectedRows || 0;
                    console.log(`[resetTicketSingleShipment] ${affected} boletas actualizadas con ticket_single_shipment = 0 en ${url}`);
                    conn.end();
                    resolve({ success: true, affectedRows: affected });
                } catch (e) {
                    try { conn.end(); } catch (err) {}
                    resolve({ success: true, affectedRows: 0 });
                }
            });
        });
    } catch (err) {
        console.warn(`[resetTicketSingleShipment] No se pudo conectar a MySQL para ${url}:`, err.message);
        return { success: false, message: err.message };
    }
};

/**
 * SOLO LECTURA. Boletas (y notas de boleta) que el PRO tiene en '01' (Registrado) con la marca "Por regularizar"
 * (regularize_shipping = 1): el PRO las envió individualmente a SUNAT y recibió un error de respuesta
 * (ej. "HTTP - Error Fetching http headers", 0132, 0133). SUNAT a veces SÍ las aceptó; si el PRO las incluye en el
 * resumen diario, SUNAT rechaza todo el lote con 2282. Columnas verificadas en el MySQL real del PRO (nov-2026).
 * La fecha se devuelve como texto 'YYYY-MM-DD' (DATE_FORMAT) para no depender de la zona horaria del servidor.
 * @param {string} url URL del PRO
 * @param {string[]} dates fechas 'YYYY-MM-DD'
 * @returns {Promise<{ success: boolean, message?: string, rows: Array<{document_type_id, series, number, date_of_issue, total}> }>}
 */
const getFlaggedBoletasFromPro = async (url = '', dates = [], limit = 200) => {
    const validDates = [...new Set((Array.isArray(dates) ? dates : []).map(String).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
    const max = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
    if (!url || validDates.length === 0) return { success: false, message: 'Sin URL o sin fechas válidas', rows: [] };

    let conn;
    try {
        conn = await create_mysql_connection(url);
        const rows = await new Promise((resolve, reject) => {
            conn.query(
                `SELECT document_type_id, series, number, DATE_FORMAT(date_of_issue, '%Y-%m-%d') AS date_of_issue, total
                   FROM documents
                  WHERE date_of_issue IN (?)
                    AND state_type_id = '01'
                    AND regularize_shipping = 1
                    AND document_type_id IN ('03', '07', '08')
                    AND series LIKE 'B%'
                  ORDER BY date_of_issue ASC, id ASC
                  LIMIT ?`,
                [validDates, max],
                (error, result) => (error ? reject(error) : resolve(result || []))
            );
        });
        return { success: true, rows };
    } catch (err) {
        console.warn(`[getFlaggedBoletasFromPro] No se pudo consultar el MySQL del PRO ${url}:`, err.message);
        return { success: false, message: err.message, rows: [] };
    } finally {
        if (conn) { try { conn.end(); } catch (e) {} }
    }
};

/**
 * Tarea 5 - Parte 2: marca como ACEPTADO ('05') en el PRO boletas que SUNAT ya tiene aceptadas
 * (reportadas como "ya informadas" en un rechazo 2282) y que el PRO sigue mostrando como '01'/'03'.
 * Mientras sigan en '01', el PRO las vuelve a incluir en cada resumen y SUNAT rechaza toda la fecha.
 *
 * Seguridad: el llamador SOLO debe enviar comprobantes que SUNAT confirmó como ACEPTADOS.
 * Cada UPDATE es parametrizado, afecta como máximo 1 fila (LIMIT 1) y solo si sigue en '01'/'03'.
 * La conexión SSH/MySQL se cierra siempre en finally.
 *
 * @param {string} url   URL del PRO de la empresa
 * @param {Array<{document_type_id: string, series: string, number: number}>} docs
 * @returns {Promise<{success: boolean, message?: string, results: Array<{key: string, affectedRows?: number, error?: string}>}>}
 */
const setBoletasAcceptedInPro = async (url = '', docs = []) => {
    const valid = (Array.isArray(docs) ? docs : []).filter(d =>
        ['03', '07', '08'].includes(String(d?.document_type_id)) &&
        /^[A-Z0-9]{1,4}$/.test(String(d?.series || '')) &&
        Number.isInteger(Number(d?.number)) && Number(d.number) > 0
    );
    if (!url || valid.length === 0) return { success: false, message: 'Sin URL o sin comprobantes válidos', results: [] };

    let conn;
    try {
        conn = await create_mysql_connection(url);
        const results = [];
        for (const d of valid) {
            const key = `${d.series}-${Number(d.number)}`;
            const r = await new Promise((resolve) => {
                conn.query(
                    "UPDATE documents SET state_type_id = '05' WHERE document_type_id = ? AND series = ? AND number = ? AND state_type_id IN ('01', '03') LIMIT 1",
                    [String(d.document_type_id), String(d.series), Number(d.number)],
                    (error, result) => resolve(error ? { key, error: error.message } : { key, affectedRows: result?.affectedRows || 0 })
                );
            });
            results.push(r);
        }
        return { success: true, results };
    } catch (err) {
        console.warn(`[setBoletasAcceptedInPro] No se pudo conectar a MySQL para ${url}:`, err.message);
        return { success: false, message: err.message, results: [] };
    } finally {
        if (conn) { try { conn.end(); } catch (e) {} }
    }
};

module.exports = { update_doc_api, checkConnection, listReportDocuments, resetTicketSingleShipment, setBoletasAcceptedInPro, getFlaggedBoletasFromPro };
