const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

let client;

let init = false
const initSessionWhatsapp = async () => {
    // console.log('No tenemos session guardada');

    client = new Client({
        restartOnAuthFail: true,
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                // '--single-process', // <- this one doesn't works in Windows
                '--disable-gpu'
            ],
        },
        authStrategy: new LocalAuth()
    })

    // client.on('ready', () => {
    //     console.log('Client is ready!');
    //     init = true
    //     // connectionReady();
    // });

    // if (!init){
    //     client.on('qr', qr => {
    //         qrcode.generate(qr, { small: true });
    //     });
    // }

    client.on('authenticated', (session) => {
        console.log('AUTHENTICATED', session);
    });

    client.on('auth_failure', msg => {
        console.error('AUTHENTICATION FAILURE', msg);
    });

    client.on('disconnected', (reason) => {
        console.log('message', 'Whatsapp is disconnected!');
        client.destroy();
        client.initialize();
    });

    client.on('message', async msg => {
        const { from, to, body } = msg;
        console.log(from);
        console.log(to);
        console.log(body);
    });

    client.initialize();
}

const getClient = async () => { 
    initSessionWhatsapp()
    return await client
}
const getClient2 = async () => { 
    return await client
}

module.exports = { initSessionWhatsapp, getClient, getClient2 }