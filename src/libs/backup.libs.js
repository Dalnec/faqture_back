require('dotenv').config();

const { execute } = require('@getvim/execute');
const compress = require('gzipme');

const username = process.env.DB_USER;
const database = process.env.DB_NAME;
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;

const backupFile = `${database}.backup`;

const getBackup = async () => {
	let res = '';
	await execute(`PGPASSWORD="${username}" pg_dump -d ${database} -p ${dbPort} -U ${username} -h ${dbHost} -F t -f ${backupFile}`)
		.then(async () => {
			await compress(backupFile);
			console.log("Backup Done");

			res = `${backupFile}.gz`;
		}).catch(err => {
			console.log(err);
			throw err;
		})
	return res;
}

module.exports = { getBackup }