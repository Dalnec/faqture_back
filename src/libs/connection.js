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
                privateKey: fs.readFileSync(process.env.DB_PSE_SSH_KEY_PATH)
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
                            notifyError({ type: 'Error conexión MySQL vía SSH', error, payload: { url } });
                            return reject(error);
                        }
                        // Cerrar el cliente SSH cuando la conexión MySQL se destruya
                        connection.on('end', () => sshClient.end());
                        connection.on('error', () => sshClient.end());
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

module.exports = { update_doc_api, checkConnection, listReportDocuments, resetTicketSingleShipment };
