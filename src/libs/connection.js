const mysql = require('mysql');
const mysql2 = require('mysql2');
const { Client } = require('ssh2');
const sshClient = new Client();

require('dotenv').config()


const create_mysql_connection = (url) => {
    // console.log(url);
    let server = url.replace('https://', '');
    server = server.split(".", 2);
    // let conn;
    let dbServer;
    switch (server[1]) {
        case "tsifactur":
            dbServer = {
                host: process.env.DB_THOST,
                user: process.env.DB_TUSER,
                password: process.env.DB_TPASS,
                database: "tsifactur_" + server[0],
                port: process.env.DB_TPORT
            }
            break;
        case "faqture":
            dbServer = {
                host: process.env.DB_FHOST,
                user: process.env.DB_FUSER,
                password: process.env.DB_FPASS,
                database: "faqture_" + server[0],
                port: process.env.DB_FPORT
            }
            break;
        default:
            dbServer = {}
            break;
    }
    const tunnelConfig = {
        host: process.env.DB_SSH_HOST,
        port: 22,
        username: process.env.DB_SSH_USER,
        password: process.env.DB_SSH_PASSWORD
    }
    const forwardConfig = {
        srcHost: '127.0.0.1',
        srcPort: 3306,
        dstHost: dbServer.host,
        dstPort: dbServer.port
    };

    const SSHConnection = new Promise((resolve, reject) => {
        sshClient.on('ready', () => {
            sshClient.forwardOut(//'127.0.0.1', 3306, '127.0.0.1', 3306,
                forwardConfig.srcHost,
                forwardConfig.srcPort,
                forwardConfig.dstHost,
                forwardConfig.dstPort,
                (err, stream) => {
                    if (err) reject(err);
                    const updatedDbServer = {
                        ...dbServer,
                        stream
                    };
                    const connection = mysql2.createConnection(updatedDbServer);
                    connection.connect((error) => {
                        if (error) {
                            reject(error);
                        }
                        resolve(connection);
                    });
                });
        }).connect(tunnelConfig);
    });
    return SSHConnection;
};

const update_doc_api = async (ext_id, url) => {
    let query;
    const conn = await create_mysql_connection(url)
    if (ext_id) {
        query = `UPDATE documents SET group_id='02' WHERE external_id = '${ext_id}'`
    } else {
        query = "UPDATE documents SET group_id='02' WHERE document_type_id ='03' AND group_id <> '02'"        
    }
    return new Promise(data => {
        conn.query(query, function (error, result) {
            // con.query(`SELECT id, external_id, group_id, series, number FROM documents WHERE external_id = '${ext_id}'`, function (error, result) { // change db->connection for your code
            if (error) {
                console.log(error);
                throw error;
            }
            try {
                console.log(result.affectedRows + " record(s) updated");
                data(result[0]);
            } catch (error) {
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
                throw error;
            }
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
                throw error;
            }
            resolve(result);
        });
    })
}

module.exports = { update_doc_api, checkConnection, listReportDocuments };