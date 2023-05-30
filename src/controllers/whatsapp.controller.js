const { sendMessage, getTextMessageInput, getDocumentMessageInput, getTemplateTSI, getTemplatePDF, getTemplateXML } = require("../libs/whatsapp.lib");
const { allTimeZone } = require("../libs/countries")

const sendMessages = async (req, res, next) => {
    const { countryCode, phoneNumber, message } = req.body
    let text = getTextMessageInput(`${countryCode}${phoneNumber}`, message);
    let document = getDocumentMessageInput(`${countryCode}${phoneNumber}`, message);
    let template = getTemplatedMessageInput(`${countryCode}${phoneNumber}`, message);

    sendMessage(template)
        .then(function (response) {
            // res.sendStatus(200);
            // return
        })
        .then(function (response) {
            sendMessage(text)
                .then(function (response) {
                    // res.sendStatus(200);
                    // return
                })
                .then(function (response) {
                    sendMessage(document)
                        .then(function (response) {
                            res.sendStatus(200);
                            return
                        })
                        .catch(function (error) {
                            res.sendStatus(500);
                            return;
                        });
                })
                .catch(function (error) {
                    res.sendStatus(500);
                    return;
                });
        })
        .catch(function (error) {
            res.json(JSON.parse(error.config.data));
            res.sendStatus(500);
            return;
        });
}

const sendFiles = async (req, res, next) => {
    const { countryCode, phoneNumber, pdf, links, filename } = req.body
    const templateTSI = getTemplateTSI(`${countryCode}${phoneNumber}`, req.body);
    const templatePDF = getTemplatePDF(`${countryCode}${phoneNumber}`, links.pdf, filename);
    const templateXML = getTemplateXML(`${countryCode}${phoneNumber}`, links.xml, filename);

    sendMessage(templateTSI)
        .then(function (response) {
            sendMessage(templatePDF)
                .then(function (response) {
                    sendMessage(templateXML)
                        .then(function (response) {
                            res.sendStatus(200);
                            return
                        })
                        .catch(function (error) {
                            res.status(500).json(error.response.data.error)
                            return;
                        });
                })
                .catch(function (error) {
                    res.status(500).json(error.response.data.error)
                    return;
                });
        })
        .catch(function (error) {
            res.status(500).json(error.response.data.error)
            return;
        });
}

const getCountries = async (req, res, next) => {
    const data = allTimeZone.filter((valor) => valor.Name.includes(req.query.country))
    return res.status(200).send({
        success: true,
        data
    })
}

module.exports = { sendMessages, sendFiles, getCountries }