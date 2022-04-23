// importing required modules
require('dotenv').config();
// const { exec } = require("child_process");
const { execute } = require('@getvim/execute');
const compress = require('gzipme');
const fs = require('fs');

// getting db connection parameters from environment file
const username = process.env.DB_USER;
const database = process.env.DB_NAME;
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;

// defining backup file name
const date = new Date();
const today = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const backupFile = `faqturedb.backup`;

// writing postgresql backup function
// const getBackup = async () => {
//     await exec(`pg_dump -d ${database} -p ${dbPort} -U ${username} -h ${dbHost} -F t -f ${backupFile}`, async (error, stdout, stderr) => {
//         if (error) {
//             console.log(`error: ${error.message}`);
//             return;
//         }
//         if (stderr) {
//             console.log(`stderr: ${stderr}`);
//             return;
//         }
//         console.log(`stdout: ${stdout}`);
//         await compress(backupFile);
//         fs.unlinkSync(backupFile);
//         console.log(`Backup created successfully`);
//         console.log("Zipped backup created");
//     });
// }

const getBackup = async () => {
    await execute(`pg_dump -d ${database} -p ${dbPort} -U ${username} -h ${dbHost} -F t -f ${backupFile}`).then(async () => {
		console.log("Finito");
	}).catch(err => {
		console.log(err);
	})
}

module.exports = { getBackup }