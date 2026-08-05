const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const axios = require('axios');
const path = require('path');
const pool = require('../db');

require('dotenv').config();

// ─── Winston Logger ────────────────────────────────────────────────────────────

const logFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
);

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'error',
    format: logFormat,
    transports: [
        // Solo errores en archivo dedicado con rotación diaria
        new transports.DailyRotateFile({
            filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '30d',
            zippedArchive: true,
        }),
        // Todos los niveles en combined
        new transports.DailyRotateFile({
            filename: path.join(__dirname, '../../logs/combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '14d',
            zippedArchive: true,
        }),
        // Consola solo en desarrollo
        ...(process.env.NODE_ENV !== 'production'
            ? [new transports.Console({
                format: format.combine(
                    format.colorize(),
                    format.simple()
                )
            })]
            : []
        ),
    ],
});

// ─── Formateadores de mensaje para notificaciones ──────────────────────────────

const TRUNCATE_LIMIT = 800;

const truncate = (str, limit = TRUNCATE_LIMIT) => {
    if (!str) return '';
    const s = typeof str === 'string' ? str : JSON.stringify(str);
    return s.length > limit ? s.substring(0, limit) + '\n...[truncado]' : s;
};

const buildPlainText = (ctx) => {
    const env = process.env.NODE_ENV || 'development';
    const lines = [
        `[ERROR] faqture_back [${env}]`,
        '─'.repeat(40),
        `Tipo:     ${ctx.type || 'Error general'}`,
        ctx.tenant   ? `Tenant:   ${ctx.tenant}`   : null,
        ctx.ruc      ? `RUC:      ${ctx.ruc}`       : null,
        ctx.document ? `Doc:      ${ctx.document}`  : null,
        ctx.endpoint ? `Endpoint: ${ctx.endpoint}`  : null,
        '─'.repeat(40),
        `Error:    ${ctx.message || 'Sin mensaje'}`,
        ctx.stack    ? `Stack:\n${truncate(ctx.stack, 600)}` : null,
        '─'.repeat(40),
        ctx.payload  ? `Payload:\n${truncate(JSON.stringify(ctx.payload, null, 2))}` : null,
        `Hora:     ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
    ];
    return lines.filter(Boolean).join('\n');
};

// ─── Notificadores externos ─────────────────────────────────────────────────────

const notifyTelegram = async (text) => {
    const token   = process.env.TELEGRAM_BOT_TOKEN;
    const chat_id = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chat_id) return;

    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id,
            text: `\`\`\`\n${text}\n\`\`\``,
            parse_mode: 'Markdown',
        }, { timeout: 8000 });
    } catch (err) {
        logger.warn('No se pudo enviar notificacion a Telegram', { error: err.message });
    }
};

const notifyDiscord = async (text) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
        await axios.post(webhookUrl, {
            content: `\`\`\`\n${text}\n\`\`\``,
        }, { timeout: 8000 });
    } catch (err) {
        logger.warn('No se pudo enviar notificacion a Discord', { error: err.message });
    }
};

// ─── Función principal exportada ───────────────────────────────────────────────

/**
 * Registra un error en los archivos de log y envía notificaciones a los canales
 * configurados (Telegram y/o Discord).
 *
 * @param {object} ctx
 * @param {string}  ctx.type      - Descripción corta del tipo de error
 * @param {Error|string} ctx.error - Objeto Error o mensaje de texto
 * @param {string}  [ctx.tenant]  - Nombre del tenant afectado
 * @param {string}  [ctx.ruc]     - RUC de la empresa
 * @param {string}  [ctx.document] - Identificador del documento (ej: F001-00123)
 * @param {string}  [ctx.endpoint] - Ruta HTTP afectada
 * @param {*}       [ctx.payload] - Datos adicionales relevantes (documento, respuesta, etc.)
 */
const notifyError = async (ctx = {}) => {
    const err = ctx.error;
    const message = err instanceof Error ? err.message : String(err || 'Error desconocido');
    const stack   = err instanceof Error ? err.stack : undefined;

    const logCtx = {
        type:     ctx.type     || 'Error general',
        tenant:   ctx.tenant,
        ruc:      ctx.ruc,
        document: ctx.document,
        endpoint: ctx.endpoint,
        payload:  ctx.payload,
        message,
        stack,
    };

    // Siempre registrar en archivo
    logger.error(logCtx.type, logCtx);

    // Guardar en la base de datos (módulo system_logs) para el frontend
    try {
        const query = `
            INSERT INTO public.system_logs (tenant, level, message, meta)
            VALUES ($1, $2, $3, $4)
        `;
        const meta = { type: logCtx.type, ruc: logCtx.ruc, document: logCtx.document, endpoint: logCtx.endpoint, payload: logCtx.payload, stack: logCtx.stack };
        const values = [logCtx.tenant || 'system', 'error', logCtx.message, JSON.stringify(meta)];
        pool.query(query, values).catch(err => console.error('Error insertando en system_logs:', err));
    } catch (e) {
        console.error('Error al intentar guardar log en BD:', e);
    }

    // Enviar notificaciones de forma asíncrona (no bloquear el flujo principal)
    const text = buildPlainText({ ...logCtx, message, stack });
    Promise.allSettled([
        notifyTelegram(text),
        notifyDiscord(text),
    ]).catch(() => {}); // silenciar errores de notificación
};

module.exports = { logger, notifyError };
