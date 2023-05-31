const axios = require('axios');

function sendMessage(data) {
    var config = {
        method: 'post',
        url: `https://graph.facebook.com/${process.env.VERSION}/${process.env.PHONE_NUMBER_ID}/messages`,
        headers: {
            'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        data: data
    };

    return axios(config)
}

function getTextMessageInput(recipient, text) {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "preview_url": false,
        "recipient_type": "individual",
        "to": recipient,
        "type": "text",
        "text": {
            "preview_url": false,
            "body": text
        }
    });
}

function getDocumentMessageInput(recipient, text) {
    // const fs = require('fs');
    // const path = require('path');
    // console.log(__dirname);
    // const pdfData = fs.readFileSync(path.join(__dirname, 'file.pdf'));
    // const base64EncodedData = Buffer.from(pdfData).toString('base64');

    return JSON.stringify({
        "messaging_product": "whatsapp",
        "preview_url": false,
        "recipient_type": "individual",
        "to": recipient,
        "type": "document",
        "document": {
            "link": "http://tilsonapi.flizzy.pe/api/v1/sales/20/voucher/",
            "filename": "BX02-1969.pdf"
        }
    });
    // return JSON.stringify({
    //     "attachment": {
    //         "type": "document",
    //         "payload": {
    //             "is_reusable": true,
    //             "name": "file.pdf",
    //             "file_data": base64EncodedData
    //         }
    //     }
    // });
}

function getTemplateTSI(recipient, doc) {
    const { serie, number, date, customer, phone, total, } = doc
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient,
        "type": "template",
        "template": {
            "name": "cpe_tsi",
            "language": {
                "code": "es_MX"
            },
            "components": [
                {
                    "type": "header",
                    "parameters": [
                        {
                            "type": "image",
                            "image": {
                                "link": "https://faqtureapi.tsifactur.com/static/images/tsi.jpeg"
                            }
                        }
                    ]
                },
                {
                    "type": "body",
                    "parameters": [
                        {
                            "type": "text",
                            "text": customer
                        },
                        {
                            "type": "text",
                            "text": `${number}-${customer}`
                        },
                        {
                            "type": "text",
                            "text": phone
                        },
                        {
                            "type": "text",
                            "text": date
                        },
                        {
                            "type": "text",
                            "text": serie
                        },
                        {
                            "type": "text",
                            "text": total
                        },
                    ]
                }
            ]
        }
    });
}

function getTemplatePDF(recipient, link, filename) {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient,
        "type": "template",
        "template": {
            "name": "cpe_pdf",
            "language": {
                "code": "es_MX"
            },
            "components": [
                {
                    "type": "header",
                    "parameters": [
                        {
                            "type": "document",
                            "document": {
                                "filename": `${filename}.pdf`,
                                "link": link
                            }
                        }
                    ]
                },
                {
                    "type": "body",
                    "parameters": [
                        {
                            "type": "text",
                            "text": filename
                        }
                    ]
                }
            ]
        }
    });
}

function getTemplateXML(recipient, link, filename) {
    return JSON.stringify({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient,
        "type": "template",
        "template": {
            "name": "cpe_xml",
            "language": {
                "code": "es_MX"
            },
            "components": [
                {
                    "type": "header",
                    "parameters": [
                        {
                            "type": "document",
                            "document": {
                                "filename": `${filename}.xml`,
                                "link": link
                            }
                        }
                    ]
                },
                {
                    "type": "body",
                    "parameters": [
                        {
                            "type": "text",
                            "text": filename
                        }
                    ]
                }
            ]
        }
    });
}

// function getTemplatedMessageInput(recipient, pdf) {
//     return JSON.stringify({
//         "messaging_product": "whatsapp",
//         "recipient_type": "individual",
//         "to": recipient,
//         "type": "template",
//         "template": {
//             "name": "prueba_tsi",
//             "language": {
//                 "code": "es_MX"
//             },
//             "components": [
//                 {
//                     "type": "header",
//                     "parameters": [
//                         {
//                             "type": "image",
//                             "image": {
//                                 "link": "https://kilariapi.flizzy.pe/media/business/logo.png"
//                             }
//                         }]
//                 }
//             ]
//         }
//     });
// }

module.exports = {
    // getTemplatedMessageInput,
    sendMessage,
    getTextMessageInput,
    getDocumentMessageInput,
    getTemplateTSI,
    getTemplatePDF,
    getTemplateXML,
};