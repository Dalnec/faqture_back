const axios = require('axios');
const pool = require('../db');

const ZENDY_URL = process.env.ZENDY_URL || 'https://admin.zendy.tsi.pe';
const EMITECA_SEND_URL = process.env.EMITECA_ZENDY_URL || `${ZENDY_URL}/api/public/connections/messages/send`;

/**
 * Normaliza número de teléfono (especialmente celulares de Perú a formato 519XXXXXXXX).
 */
function normalizePhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/\D/g, '');
    if (clean.length === 9 && clean.startsWith('9')) {
        clean = '51' + clean;
    }
    return clean;
}

/**
 * Obtiene un valor de configuración de public.settings
 */
async function getSettingValue(key) {
    try {
        const res = await pool.query(
            'SELECT value FROM public.settings WHERE key = $1 AND active = true LIMIT 1',
            [key]
        );
        return res.rows.length > 0 ? res.rows[0].value : null;
    } catch (err) {
        console.error(`[Zendy] Error obteniendo setting ${key}:`, err.message);
        return null;
    }
}

/**
 * Guarda o actualiza un valor de configuración en public.settings
 */
async function setSettingValue(key, value, description = '', category = 'zendy') {
    try {
        const exists = await pool.query('SELECT id_settings FROM public.settings WHERE key = $1 LIMIT 1', [key]);
        if (exists.rows.length > 0) {
            await pool.query(
                'UPDATE public.settings SET value = $1, active = true WHERE key = $2',
                [value, key]
            );
        } else {
            await pool.query(
                'INSERT INTO public.settings (id_settings, key, value, description, category, active) VALUES ((SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), $1, $2, $3, $4, true)',
                [key, value, description, category]
            );
        }
    } catch (err) {
        console.error(`[Zendy] Error guardando setting ${key}:`, err.message);
    }
}

/**
 * Autenticación administrativa en Zendy (obtiene JWT de superadmin si se requiere).
 * Importante: Enviar solo 'username' y 'password', sin 'email'.
 */
async function loginZendyAdmin(username = 'admin', password = process.env.ZENDY_ADMIN_PASSWORD || '123456789') {
    try {
        const response = await axios.post(
            `${ZENDY_URL}/api/auth/login`,
            { username, password },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );
        return response.data?.token || null;
    } catch (err) {
        console.error('[Zendy] Error en login admin:', err.response?.data || err.message);
        return null;
    }
}

/**
 * Envía un mensaje de WhatsApp a través de la API Pública de Zendy.
 */
async function sendZendyMessage(phoneNumber, messageText, options = {}) {
    const token = options.token || (await getSettingValue('zendy_token')) || process.env.ZENDY_TOKEN || 'PELVIXXX';
    const sendUrl = options.url || (await getSettingValue('zendy_send_url')) || EMITECA_SEND_URL;

    const cleanPhone = normalizePhone(phoneNumber);
    if (!cleanPhone) {
        throw new Error('Número de teléfono inválido');
    }

    const payload = {
        token: token,
        phone_number: cleanPhone,
        message: messageText
    };

    try {
        const response = await axios.post(sendUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        return { success: true, data: response.data, status: response.status };
    } catch (err) {
        const errData = err.response?.data || {};
        const errMsg = errData.message || errData.error || err.message;
        throw new Error(`Error enviando por API Pública Zendy: ${errMsg}`);
    }
}

/**
 * Obtiene la lista de canales corporativos disponibles en Zendy
 * y el token actualmente configurado en public.settings.
 */
async function getZendyChannelsList() {
    const currentToken = (await getSettingValue('zendy_token')) || 'PELVIXXX';
    try {
        const adminToken = await loginZendyAdmin();
        if (!adminToken) {
            return {
                currentToken,
                channels: [
                    { id: 'iphone-verde', name: 'Iphone Verde (TSI)', token: 'PELVIXXX', phone: '51998407723', state: 'ready' },
                    { id: 'iphone-gris', name: 'Iphone Gris (TSI)', token: 'TILSON3434', phone: '51938580365', state: 'ready' }
                ]
            };
        }

        const res = await axios.get(`${ZENDY_URL}/api/connections`, {
            headers: { Authorization: `Bearer ${adminToken}` },
            timeout: 10000
        });

        const list = res.data?.data || [];
        const channels = list
            .filter(c => c.token && c.token !== '' && !c.token.startsWith('admin__'))
            .map(c => ({
                id: c.id,
                name: c.name,
                token: c.token,
                phone: c.phone_number,
                state: c.state,
                lastConnected: c.last_connected_at
            }));

        if (channels.length === 0) {
            channels.push(
                { id: 'iphone-verde', name: 'Iphone Verde (TSI)', token: 'PELVIXXX', phone: '51998407723', state: 'ready' },
                { id: 'iphone-gris', name: 'Iphone Gris (TSI)', token: 'TILSON3434', phone: '51938580365', state: 'ready' }
            );
        }

        return { currentToken, channels };
    } catch (err) {
        console.warn('[Zendy] Error obteniendo canales de Zendy:', err.message);
        return {
            currentToken,
            channels: [
                { id: 'iphone-verde', name: 'Iphone Verde (TSI)', token: 'PELVIXXX', phone: '51998407723', state: 'ready' },
                { id: 'iphone-gris', name: 'Iphone Gris (TSI)', token: 'TILSON3434', phone: '51938580365', state: 'ready' }
            ]
        };
    }
}

module.exports = {
    normalizePhone,
    getSettingValue,
    setSettingValue,
    sendZendyMessage,
    loginZendyAdmin,
    getZendyChannelsList
};
