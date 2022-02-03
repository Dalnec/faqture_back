const mysql = require('mysql');
require('dotenv').config()

const create_mysql_connection = (url) => {

    let server = url.replace('https://', '');
    server = server.split(".", 2);
    let conn;
    switch (server[1]) {
        case "tsifactur":
            conn = {
                host: process.env.DB_THOST,
                user: process.env.DB_TUSER,
                password: process.env.DB_TPASS,
                database: "tsifactur_" + server[0],
                port: process.env.DB_TPORT
            }
            break;
        case "faqture":
            conn = {
                host: process.env.DB_FHOST,
                user: process.env.DB_FUSER,
                password: process.env.DB_FPASS,
                database: "faqture_" + server[0],
                rt: process.env.DB_FPORT
            }
            break;    
        default:
            conn = {}
            break;
    }
    
    return mysql.createConnection(conn);
};

const update_doc_api = async (ext_id, url) => {
    const con = create_mysql_connection(url)
    return new Promise(data => {
        con.query(`UPDATE documents SET group_id='02' WHERE external_id = '${ext_id}'`, function (error, result) { // change db->connection for your code
        // con.query(`SELECT id, external_id, group_id, series, number FROM documents WHERE external_id = '${ext_id}'`, function (error, result) { // change db->connection for your code
            if (error) {
                console.log(error);
                throw error;
            }
            try {
                // console.log(result);
                console.log(result.affectedRows + " record(s) updated");
                data(result[0]);
            } catch (error) {
                data({});
                throw error;
            }
        });
    });
}

module.exports = { update_doc_api };