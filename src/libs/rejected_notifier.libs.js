const pool = require('../db');
const { sendZendyMessage } = require('./zendy.lib');
const { sendMessage, getTextMessageInput } = require('./whatsapp.lib');
const { formatPeruDate } = require('./report.libs');

/**
 * Traduce el código de tipo de comprobante a nombre legible.
 */
function getDocumentTypeName(type) {
    switch (type) {
        case '01': return 'Factura';
        case '03': return 'Boleta';
        case '07': return 'Nota de Crédito';
        case '08': return 'Nota de Débito';
        case '09': return 'Guía Remitente';
        case '31': return 'Guía Transportista';
        case '80': return 'Nota de Venta';
        default: return `Comprobante (${type || 'Desc.'})`;
    }
}

/**
 * Obtiene el número de teléfono exclusivo para recibir alertas de comprobantes rechazados.
 * REGLA ESTRICTA: Consulta ÚNICAMENTE 'whatsapp_report_phone_2'.
 * NUNCA hace fallback a 'whatsapp_report_phone' ni a RECIPIENT_WAID para no mezclar reportes.
 */
async function getRejectedAlertRecipientPhone() {
    try {
        const res = await pool.query(
            "SELECT value FROM public.settings WHERE key = 'whatsapp_report_phone_2' AND active = true ORDER BY id_settings DESC"
        );
        const p2 = res.rows.find((r) => r.value && r.value.trim() !== '');
        if (p2) return p2.value.trim();
    } catch (e) {
        console.warn('[getRejectedAlertRecipientPhone] Error consultando settings:', e.message);
    }

    return null;
}

/**
 * Extrae el código y descripción del error/rechazo de SUNAT de forma limpia y legible.
 */
function extractRejectionReason(responseSend) {
    if (!responseSend) return 'Sin detalle de respuesta de SUNAT.';
    try {
        const data = typeof responseSend === 'string' ? JSON.parse(responseSend) : responseSend;
        if (data?.response?.description) {
            const code = data.response.code ? `Error ${data.response.code}: ` : '';
            return `${code}${data.response.description}`;
        }
        if (data?.message) {
            return String(data.message);
        }
        if (data?.error?.message) {
            return String(data.error.message);
        }
        if (typeof data === 'object') {
            return JSON.stringify(data).slice(0, 300);
        }
        return String(data).slice(0, 300);
    } catch (e) {
        return String(responseSend).slice(0, 300);
    }
}

/**
 * Formatea el texto de la alerta individual de comprobante rechazado para WhatsApp.
 */
function formatRejectedVoucherAlert({ tenant, company, company_number, doc }) {
    const typeName = getDocumentTypeName(doc.type);
    const voucherNum = `${doc.serie || ''}-${String(doc.numero || '').padStart(8, '0')}`;
    const dateStr = formatPeruDate(doc.date);
    const amountStr = Number(doc.amount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const clientStr = [doc.customer_number, doc.customer].filter(Boolean).join(' - ') || 'No especificado';
    const reason = extractRejectionReason(doc.response_send);

    return (
        `ALERTA: COMPROBANTE RECHAZADO SUNAT\n\n` +
        `Empresa: ${company || tenant} (RUC: ${company_number || 'N/A'})\n` +
        `Comprobante: ${typeName} ${voucherNum}\n` +
        `Fecha de emisión: ${dateStr}\n` +
        `Cliente: ${clientStr}\n` +
        `Total: S/ ${amountStr}\n\n` +
        `Motivo de rechazo SUNAT:\n${reason}`
    );
}

/**
 * Consulta de alta eficiencia (Regla 13) para obtener comprobantes rechazados ('states = R')
 * de los últimos 3 días que aún NO hayan sido notificados (ausentes en public.whatsapp_notified_rejected).
 */
async function getUnnotifiedRejectedDocuments({ concurrency = 25 } = {}) {
    const companiesRes = await pool.query(
        "SELECT id_company, tenant, company, company_number FROM public.company WHERE state = true ORDER BY company ASC"
    );
    const companies = companiesRes.rows.filter((c) => c.tenant && /^[a-zA-Z0-9_]+$/.test(c.tenant));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 3);

    const pendingNotifications = [];

    for (let i = 0; i < companies.length; i += concurrency) {
        const batch = companies.slice(i, i + concurrency);
        await Promise.all(
            batch.map(async (c) => {
                const t = c.tenant;
                try {
                    // 1. Verificación instantánea por índice primario (<0.5ms)
                    const lastDocRes = await pool.query(
                        `SELECT date FROM ${t}.document ORDER BY id_document DESC LIMIT 1`
                    );
                    if (lastDocRes.rows.length === 0) return;
                    const docDate = lastDocRes.rows[0].date ? new Date(lastDocRes.rows[0].date) : null;
                    if (!docDate || docDate < cutoffDate) return;

                    // 2. Extraer rechazados no notificados en la ventana reciente
                    const query = `
                        SELECT d.id_document, d.date, d.type, d.serie, d.numero, 
                               d.customer_number, d.customer, d.amount, d.response_send,
                               d.states
                        FROM ${t}.document d
                        LEFT JOIN public.whatsapp_notified_rejected w 
                               ON w.tenant = $1 AND w.id_document = d.id_document
                        WHERE d.states = 'R'
                          AND d.date >= CURRENT_DATE - INTERVAL '3 days'
                          AND w.id_document IS NULL
                        ORDER BY d.id_document ASC
                    `;
                    const rejRes = await pool.query(query, [t]);
                    for (const doc of rejRes.rows) {
                        pendingNotifications.push({
                            tenant: t,
                            company: c.company || t,
                            company_number: c.company_number,
                            doc
                        });
                    }
                } catch (e) {
                    // Ignorar esquemas sin tabla document
                }
            })
        );
    }

    return pendingNotifications;
}

// ============================================================================
// COLA DE DESPACHO SECUENCIAL CON ESPACIADO DE 1 MINUTO (ANTI-SPAM / PROTECCIÓN)
// ============================================================================
class RejectedNotificationQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.intervalMs = 60000; // 1 minuto obligatorio entre envíos
    }

    /**
     * Agrega un comprobante a la cola de despacho si no ha sido notificado previamente.
     */
    async enqueue({ tenant, id_document, doc = null, company = null, company_number = null }) {
        if (!tenant || !id_document) return;
        if (!/^[a-zA-Z0-9_]+$/.test(tenant)) return;

        // 1. Verificar idempotencia en BD antes de encolar
        try {
            const check = await pool.query(
                'SELECT 1 FROM public.whatsapp_notified_rejected WHERE tenant = $1 AND id_document = $2',
                [tenant, id_document]
            );
            if (check.rows.length > 0) {
                return; // Ya fue notificado previamente
            }
        } catch (e) {
            console.error('[RejectedQueue] Error comprobando registro en BD:', e.message);
        }

        // 2. Evitar duplicados en memoria
        const alreadyInQueue = this.queue.some(
            (item) => item.tenant === tenant && item.id_document === id_document
        );
        if (alreadyInQueue) return;

        this.queue.push({ tenant, id_document, doc, company, company_number });
        console.log(`[RejectedQueue] Encolado comprobante rechazado para ${tenant} (ID: ${id_document}). Total en cola: ${this.queue.length}`);

        // Iniciar procesamiento en background si no está corriendo
        if (!this.isProcessing) {
            this.processQueue().catch((err) => {
                console.error('[RejectedQueue] Error procesando cola de rechazados:', err);
            });
        }
    }

    /**
     * Procesa la cola secuencialmente con pausas de 1 minuto entre mensajes.
     */
    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            try {
                await this.dispatchItem(item);
            } catch (err) {
                console.error(`[RejectedQueue] Error despachando ${item.tenant} (ID: ${item.id_document}):`, err.message);
            }
        }

        this.isProcessing = false;
    }

    /**
     * Despacha un comprobante a los números configurados con la pausa requerida.
     */
    async dispatchItem(item) {
        const phone = await getRejectedAlertRecipientPhone();
        if (!phone) {
            console.warn('[RejectedQueue] No hay número configurado para alertas de comprobantes rechazados.');
            return;
        }

        // Si no vienen los datos completos del documento, consultarlos de la BD
        let docData = item.doc;
        let companyName = item.company;
        let companyRuc = item.company_number;

        if (!docData) {
            try {
                const docRes = await pool.query(`
                    SELECT id_document, date, type, serie, numero, customer_number, customer, amount, response_send, states
                    FROM ${item.tenant}.document
                    WHERE id_document = $1
                `, [item.id_document]);
                if (docRes.rows.length === 0) return;
                docData = docRes.rows[0];
            } catch (e) {
                return;
            }
        }

        if (!companyName || !companyRuc) {
            try {
                const compRes = await pool.query(
                    'SELECT company, company_number FROM public.company WHERE tenant = $1 LIMIT 1',
                    [item.tenant]
                );
                if (compRes.rows.length > 0) {
                    companyName = compRes.rows[0].company || item.tenant;
                    companyRuc = compRes.rows[0].company_number;
                }
            } catch (e) {}
        }

        const messageText = formatRejectedVoucherAlert({
            tenant: item.tenant,
            company: companyName,
            company_number: companyRuc,
            doc: docData
        });

        let sentSuccessfully = false;
        try {
            await sendZendyMessage(phone, messageText);
            sentSuccessfully = true;
            console.log(`[RejectedNotifier] Alerta enviada exclusivamente al celular de rechazados (${phone}) para [${companyName}] ${docData.serie}-${docData.numero}`);
        } catch (sendErr) {
            console.warn(`[RejectedNotifier] Error vía Zendy a ${phone}:`, sendErr.message);
            try {
                const payload = getTextMessageInput(phone, messageText);
                await sendMessage(payload);
                sentSuccessfully = true;
                console.log(`[RejectedNotifier] Alerta enviada vía WhatsApp oficial a ${phone} para [${companyName}] ${docData.serie}-${docData.numero}`);
            } catch (fallbackErr) {
                console.error(`[RejectedNotifier] Fallback falló a ${phone}:`, fallbackErr.message);
            }
        }

        // Si falló el envío en ambos proveedores (ej. corte de internet), NO marcar como notificado
        // para permitir que el barredor periódico (Tarea 8) lo reintente cuando vuelva la conexión
        if (!sentSuccessfully) {
            console.error(`[RejectedNotifier] No se pudo entregar la alerta para ${item.tenant} (${docData.serie}-${docData.numero}). Se reintentará en el próximo ciclo.`);
            return;
        }

        // Marcar en public.whatsapp_notified_rejected para garantizar idempotencia
        try {
            const cleanNumero = Number.isInteger(Number(docData.numero)) ? Number(docData.numero) : null;
            await pool.query(
                `INSERT INTO public.whatsapp_notified_rejected (tenant, id_document, type, serie, numero, phones)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (tenant, id_document) DO UPDATE SET notified_at = NOW(), phones = EXCLUDED.phones`,
                [
                    item.tenant,
                    docData.id_document,
                    docData.type || null,
                    docData.serie || null,
                    cleanNumero,
                    phone
                ]
            );
        } catch (dbErr) {
            console.error('[RejectedNotifier] Error registrando en BD:', dbErr.message);
        }

        // Si quedan más comprobantes rechazados en la cola (ej. 20 seguidas),
        // esperar 60 segundos (1 minuto) antes de que el bucle procese el siguiente
        if (this.queue.length > 0) {
            console.log(`[RejectedNotifier] Quedan ${this.queue.length} comprobantes en cola. Pausa de 60s antes de enviar el siguiente...`);
            await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
        }
    }
}

// Instancia singleton de la cola de notificaciones
const rejectedQueue = new RejectedNotificationQueue();

/**
 * Notificación en tiempo real cuando un comprobante cambia a estado 'R'.
 * Se ejecuta en segundo plano sin retrasar la respuesta HTTP del cliente.
 */
function enqueueRejectedDocument({ tenant, id_document, doc = null, company = null, company_number = null }) {
    rejectedQueue.enqueue({ tenant, id_document, doc, company, company_number }).catch((err) => {
        console.error('[enqueueRejectedDocument] Error:', err.message);
    });
}

/**
 * Barredor periódico (para Tarea 8):
 * Revisa comprobantes rechazados recientes que no se hayan notificado y los encola.
 */
async function notifyPendingRejectedDocuments({ waitMs = 60000 } = {}) {
    rejectedQueue.intervalMs = waitMs;
    const pending = await getUnnotifiedRejectedDocuments();
    if (!pending || pending.length === 0) {
        return { count: 0, sent: 0 };
    }

    console.log(`[Barredor Tarea 8] Encolando ${pending.length} comprobantes rechazados pendientes de notificación...`);
    for (const item of pending) {
        await rejectedQueue.enqueue({
            tenant: item.tenant,
            id_document: item.doc.id_document,
            doc: item.doc,
            company: item.company,
            company_number: item.company_number
        });
    }

    return { count: pending.length, queued: true };
}

module.exports = {
    getDocumentTypeName,
    getRejectedAlertRecipientPhone,
    extractRejectionReason,
    formatRejectedVoucherAlert,
    getUnnotifiedRejectedDocuments,
    enqueueRejectedDocument,
    notifyPendingRejectedDocuments,
    rejectedQueue
};
