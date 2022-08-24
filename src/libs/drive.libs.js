const { google } = require('googleapis')
const fs = require('fs')

const DRIVE_FOLDER_ID = '144sUdLku04IQPpOgcvEaNTDwYs8y3vQy'

const auth = new google.auth.GoogleAuth({
	keyFile: './credencials-faqture-drive-api.json',
	scopes: ['https://www.googleapis.com/auth/drive']
})

const uploadFile = async (file) => {
	try {
		const { data } = await google.drive({ version: 'v3', auth }).files.create({
			media: {
				mimeType: 'application/x-rar-compressed',
				body: fs.createReadStream(`./${file}`)
			},
			requestBody: {
				name: 'MiguelitoChacha.backup.gz',
				parents: [DRIVE_FOLDER_ID],
			},
			fields: 'id,name',
		});
		console.log(`Uploaded file ${data.name} ${data.id}`);
	} catch (err) {
		// TODO(developer) - Handle error
		throw err;
	}
};


const updateFile = async (file) => {
	try {
		const { data } = await google.drive({ version: 'v3', auth }).files.update({
			fileId: file.id,
			media: {
				mimeType: 'application/x-rar-compressed',
				body: fs.createReadStream('./MiguelitoChacha.backup.gz')
			},
			fields: 'id,name',
		});
		console.log(`Updated file ${data.name} ${data.id}`);
	} catch (err) {
		// TODO(developer) - Handle error
		throw err;
	}
};


async function searchFile(filename) {

	const files = [];
	var message = ''
	try {
		const service = google.drive({ version: 'v3', auth });
		const res = await service.files.list({
			// q: 'mimeType=\'image/jpeg\'',
			fields: 'nextPageToken, files(id, name)',
			spaces: 'drive',
		});
		// Array.prototype.push.apply(files, res.files);
		const found = res.data.files.find((file) => filename == file.name)

		if (found) {
			console.log("File Found");
			await updateFile(found)
		} else {
			console.log("File Not Found");
			await uploadFile(filename);
		}

		return;
	} catch (err) {
		throw err;
	}
}

module.exports = { uploadFile, searchFile, updateFile }