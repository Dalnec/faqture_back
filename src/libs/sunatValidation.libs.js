const axios = require('axios');

const TOKEN_CACHE = {
    token: null,
    expiresAt: 0,
};

const STATUS_MAP = {
    '0': 'NOT_FOUND',
    '1': 'ACCEPTED',
    '2': 'ANNULLED',
    '3': 'AUTHORIZED',
    '4': 'REJECTED',
};

const SUNAT_STATUS_LABELS = {
    NOT_FOUND: 'No encontrado',
    ACCEPTED: 'Aceptado',
    ANNULLED: 'Anulado',
    AUTHORIZED: 'Autorizado',
    REJECTED: 'Rechazado',
    PENDING: 'Pendiente',
    UNKNOWN: 'Desconocido',
    ERROR: 'Error',
    NOT_CONFIGURED: 'Sin configurar',
};

const SYSTEM_STATUS_LABELS = {
    N: 'Nuevo',
    E: 'Enviado',
    A: 'Anulado',
    X: 'Error de envio',
    Y: 'Enviado a PRO',
    P: 'Por anular',
    Z: 'Sin anular',
    R: 'Rechazado',
    C: 'Pendiente de consulta de anulacion',
    S: 'Por enviar/anular',
    W: 'Consultado en SUNAT',
    K: 'No declarable',
    NOT_FOUND: 'No encontrado',
};

const getSunatConfig = () => {
    const authUrl = process.env.SUNAT_AUTH_URL || 'https://api-seguridad.sunat.gob.pe/v1/clientesextranet';
    const validationUrl = process.env.SUNAT_VALIDATION_URL || 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes';
    const clientId = process.env.SUNAT_CLIENT_ID;
    const clientSecret = process.env.SUNAT_CLIENT_SECRET;
    const scope = process.env.SUNAT_SCOPE || 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes';

    return {
        authUrl,
        validationUrl,
        clientId,
        clientSecret,
        scope,
    };
};

const translateSunatStatus = (code) => {
    const normalizedCode = String(code ?? '');
    const key = STATUS_MAP[normalizedCode] || 'UNKNOWN';
    return SUNAT_STATUS_LABELS[key] || SUNAT_STATUS_LABELS.UNKNOWN;
};

const translateSystemStatus = (state) => {
    return SYSTEM_STATUS_LABELS[state] || SUNAT_STATUS_LABELS.UNKNOWN;
};

const getEnvironmentLabel = () => {
    const raw = (process.env.SUNAT_ENVIRONMENT || 'production').toLowerCase();
    return raw === 'sandbox' ? 'Pruebas' : 'Produccion';
};

const formatDateForSunat = (inputDate) => {
    const date = new Date(inputDate);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Fecha invalida para validacion SUNAT');
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());

    return `${day}/${month}/${year}`;
};

const formatDateISO = (inputDate) => {
    const date = new Date(inputDate);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString().slice(0, 10);
};

const getSunatToken = async () => {
    const config = getSunatConfig();

    if (!config.clientId || !config.clientSecret) {
        const error = new Error('Faltan SUNAT_CLIENT_ID o SUNAT_CLIENT_SECRET en variables de entorno');
        error.code = 'SUNAT_NOT_CONFIGURED';
        throw error;
    }

    const now = Date.now();
    if (TOKEN_CACHE.token && TOKEN_CACHE.expiresAt > now) {
        return TOKEN_CACHE.token;
    }

    const tokenUrl = `${config.authUrl}/${config.clientId}/oauth2/token/`;
    const payload = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: config.scope,
        client_id: config.clientId,
        client_secret: config.clientSecret,
    });

    try {
        const response = await axios.post(tokenUrl, payload.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            timeout: 30000,
        });

        const token = response?.data?.access_token;
        const expiresIn = Number(response?.data?.expires_in || 3600);

        if (!token) {
            throw new Error('SUNAT no retorno access_token');
        }

        TOKEN_CACHE.token = token;
        TOKEN_CACHE.expiresAt = now + Math.floor(expiresIn * 0.9 * 1000);

        return token;
    } catch (error) {
        const message = error?.response?.data?.error_description || error?.response?.data?.error || error.message;
        throw new Error(`No se pudo obtener token SUNAT: ${message}`);
    }
};

const validateVoucherOnSunat = async ({ ruc, codigoComp, serie, numero, fechaEmision, monto }) => {
    const config = getSunatConfig();
    const token = await getSunatToken();

    const url = `${config.validationUrl}/${ruc}/validarcomprobante`;
    const payload = {
        numRuc: String(ruc),
        codComp: String(codigoComp),
        numeroSerie: String(serie),
        numero: Number(numero),
        fechaEmision,
        monto: Number(monto),
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            timeout: 30000,
        });

        return response.data;
    } catch (error) {
        const details = error?.response?.data || {};
        const message = details?.message || details?.error || error.message;
        const wrapped = new Error(`Error validando comprobante en SUNAT: ${message}`);
        wrapped.details = details;
        throw wrapped;
    }
};

module.exports = {
    SUNAT_STATUS_LABELS,
    translateSunatStatus,
    translateSystemStatus,
    getEnvironmentLabel,
    formatDateForSunat,
    formatDateISO,
    validateVoucherOnSunat,
};
