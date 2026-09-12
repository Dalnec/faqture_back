const pool = require('../db');
const { sendMessage, getTextMessageInput } = require('./whatsapp.lib');
const { sendZendyMessage } = require('./zendy.lib');

/**
 * Obtiene el número de teléfono configurado para recibir reportes de WhatsApp.
 * Prioridad: 1) public.settings ('whatsapp_report_phone'), 2) process.env.RECIPIENT_WAID
 */
async function getWhatsAppRecipientPhone() {
    try {
        const res = await pool.query(
            "SELECT value FROM public.settings WHERE key = 'whatsapp_report_phone' AND active = true LIMIT 1"
        );
        if (res.rows.length > 0 && res.rows[0].value && res.rows[0].value.trim() !== '') {
            return res.rows[0].value.trim();
        }
    } catch (e) {
        console.warn('[getWhatsAppRecipientPhone] Error consultando settings:', e.message);
    }
    return process.env.RECIPIENT_WAID || null;
}

/**
 * Formatea una fecha a cadena legible en zona horaria de Perú (America/Lima).
 */
function formatPeruDate(dateValue) {
    if (!dateValue) return 'N/A';
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return String(dateValue);
        return d.toLocaleString('es-PE', {
            timeZone: 'America/Lima',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        })
        .replace('a. m.', 'AM')
        .replace('p. m.', 'PM')
        .replace('a.m.', 'AM')
        .replace('p.m.', 'PM');
    } catch (e) {
        return String(dateValue);
    }
}

/**
 * Consulta y extrae las 6 métricas de diagnóstico sobre las empresas activas:
 * 1. Cantidad de comprobantes rechazados (states = 'R')
 * 2. Comprobantes por declarar de fechas anteriores (date < CURRENT_DATE AND states IN ('N','Y','X','M','S'))
 * 3. Guías por declarar (type IN ('09','31') AND states NOT IN ('E','A'))
 * 4. Comprobantes pendientes de anular (states IN ('P','C'))
 * 5. Errores de Certificado / CDR en respuestas SUNAT (error 2325, 1038, 1039, etc.)
 * 6. Último comprobante recibido (tipo, serie, número, fecha emisión y recepción)
 */
async function getAuditReportData({ tenant = null, concurrency = 20 } = {}) {
    let companyQuery = `
        SELECT id_company, tenant, company, company_number, invoice_date, invoice_status
        FROM public.company 
        WHERE state = true
    `;
    const params = [];
    if (tenant) {
        companyQuery += ` AND tenant = $1`;
        params.push(tenant);
    }
    companyQuery += ` ORDER BY company ASC`;

    const companiesRes = await pool.query(companyQuery, params);
    const companies = companiesRes.rows;

    const results = [];
    const totals = {
        totalCompanies: companies.length,
        companiesWithSalvables: 0,
        companiesWithIssues: 0,
        totalRejectedSalvables: 0,
        totalPendingSalvables: 0,
        totalGuiasSalvables: 0,
        totalAnularSalvables: 0,
        companiesWithCertError: 0,
        totalExpired: 0,
        totalExpiredRejected: 0,
        totalExpiredPending: 0,
        totalRejected: 0,
        totalPendingPast: 0,
        totalGuiasPending: 0,
        totalPendingAnular: 0
    };

    // Procesamiento por lotes paralelos para máxima velocidad sin saturar el pool de PostgreSQL
    for (let i = 0; i < companies.length; i += concurrency) {
        const batch = companies.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(async (c) => {
                const t = c.tenant;
                try {
                    const [lastDocRes, countsRes] = await Promise.all([
                        pool.query(`
                            SELECT id_document, type, serie, numero, date, created, states 
                            FROM ${t}.document 
                            ORDER BY id_document DESC LIMIT 1
                        `),
                        pool.query(`
                            SELECT 
                                -- Salvables (dentro del plazo legal SUNAT de 3 dias y sin verificar)
                                count(*) FILTER (WHERE states = 'R' AND date >= CURRENT_DATE - INTERVAL '3 days' AND (verified IS NULL OR verified = false)) as rej_salv,
                                count(*) FILTER (WHERE date < CURRENT_DATE AND date >= CURRENT_DATE - INTERVAL '3 days' AND states IN ('N', 'Y', 'X', 'M', 'S') AND (verified IS NULL OR verified = false)) as pend_salv,
                                count(*) FILTER (WHERE type IN ('09', '31') AND states NOT IN ('E', 'A') AND date >= CURRENT_DATE - INTERVAL '3 days') as guias_salv,
                                count(*) FILTER (WHERE states IN ('P', 'C') AND date >= CURRENT_DATE - INTERVAL '7 days') as anular_salv,
                                -- Fuera de tiempo / Historicos no salvables por fecha vencida
                                count(*) FILTER (WHERE states = 'R' AND date < CURRENT_DATE - INTERVAL '3 days') as rej_expired,
                                count(*) FILTER (WHERE date < CURRENT_DATE - INTERVAL '3 days' AND states IN ('N', 'Y', 'X', 'M', 'S')) as pend_expired,
                                -- Totales brutos
                                count(*) FILTER (WHERE states = 'R') as rejected,
                                count(*) FILTER (WHERE date < CURRENT_DATE AND states IN ('N', 'Y', 'X', 'M', 'S')) as pending_past,
                                count(*) FILTER (WHERE type IN ('09', '31') AND states NOT IN ('E', 'A')) as pending_guias,
                                count(*) FILTER (WHERE states IN ('P', 'C')) as pending_anular
                            FROM ${t}.document
                        `)
                    ]);

                    const rowCounts = countsRes.rows[0] || {};
                    const rejSalv = parseInt(rowCounts.rej_salv || 0, 10);
                    const pendSalv = parseInt(rowCounts.pend_salv || 0, 10);
                    const guiasSalv = parseInt(rowCounts.guias_salv || 0, 10);
                    const anularSalv = parseInt(rowCounts.anular_salv || 0, 10);
                    const rejExpired = parseInt(rowCounts.rej_expired || 0, 10);
                    const pendExpired = parseInt(rowCounts.pend_expired || 0, 10);
                    const expiredTotal = rejExpired + pendExpired;

                    const rejected = parseInt(rowCounts.rejected || 0, 10);
                    const pendingPast = parseInt(rowCounts.pending_past || 0, 10);
                    const pendingGuias = parseInt(rowCounts.pending_guias || 0, 10);
                    const pendingAnular = parseInt(rowCounts.pending_anular || 0, 10);

                    const lastDoc = lastDocRes.rows[0] || null;

                    // Verificar errores de certificado solo en comprobantes recientes (<= 3 dias) o si el ultimo documento emitido fue rechazado
                    let certErrorDetail = null;
                    if (rejSalv > 0 || (lastDoc && lastDoc.states === 'R')) {
                        const certCheck = await pool.query(`
                            SELECT response_send->'response'->>'code' as code,
                                   response_send->'response'->>'description' as description
                            FROM ${t}.document 
                            WHERE states = 'R' 
                              AND (
                                date >= CURRENT_DATE - INTERVAL '3 days'
                                ${lastDoc ? `OR id_document = ${lastDoc.id_document}` : ''}
                              )
                              AND (
                                response_send::text ILIKE '%certificado%'
                                OR response_send::text ILIKE '%2325%'
                                OR response_send::text ILIKE '%1038%'
                                OR response_send::text ILIKE '%1039%'
                              )
                            ORDER BY id_document DESC LIMIT 1
                        `);
                        if (certCheck.rows.length > 0) {
                            const desc = certCheck.rows[0].description;
                            const code = certCheck.rows[0].code;
                            if (desc || code) {
                                certErrorDetail = desc || `Error código ${code} (Certificado SUNAT)`;
                            }
                        }
                    }
                    // Solo se consideran como incidencias activas las salvables o problemas de certificado
                    const hasIssues = rejSalv > 0 || pendSalv > 0 || guiasSalv > 0 || anularSalv > 0 || !!certErrorDetail;

                    return {
                        tenant: t,
                        company: c.company || t,
                        company_number: c.company_number,
                        rejSalv,
                        pendSalv,
                        guiasSalv,
                        anularSalv,
                        rejExpired,
                        pendExpired,
                        expiredTotal,
                        rejected,
                        pendingPast,
                        pendingGuias,
                        pendingAnular,
                        hasCertError: !!certErrorDetail,
                        certErrorDetail,
                        lastDoc: lastDoc ? {
                            type: lastDoc.type,
                            serie: lastDoc.serie,
                            numero: lastDoc.numero,
                            dateFormatted: formatPeruDate(lastDoc.date),
                            createdFormatted: formatPeruDate(lastDoc.created),
                            states: lastDoc.states
                        } : null,
                        hasIssues
                    };
                } catch (err) {
                    // Esquema no existe o no tiene tabla document
                    return null;
                }
            })
        );

        for (const item of batchResults) {
            if (item) {
                results.push(item);
                if (item.hasIssues) {
                    totals.companiesWithSalvables++;
                    totals.companiesWithIssues++;
                }
                totals.totalRejectedSalvables += item.rejSalv;
                totals.totalPendingSalvables += item.pendSalv;
                totals.totalGuiasSalvables += item.guiasSalv;
                totals.totalAnularSalvables += item.anularSalv;
                if (item.hasCertError) totals.companiesWithCertError++;

                totals.totalExpired += item.expiredTotal;
                totals.totalExpiredRejected += item.rejExpired;
                totals.totalExpiredPending += item.pendExpired;

                totals.totalRejected += item.rejected;
                totals.totalPendingPast += item.pendingPast;
                totals.totalGuiasPending += item.pendingGuias;
                totals.totalPendingAnular += item.pendingAnular;
            }
        }
    }

    // Filtrar únicamente empresas con comprobantes salvables en riesgo o error de certificado
    const alerts = results.filter((r) => r.hasIssues);
    // Ordenar alertas por mayor impacto (primero con errores de cert, luego mayor cantidad de salvables)
    alerts.sort((a, b) => {
        if (a.hasCertError && !b.hasCertError) return -1;
        if (!a.hasCertError && b.hasCertError) return 1;
        const sumA = a.rejSalv + a.pendSalv + a.guiasSalv + a.anularSalv;
        const sumB = b.rejSalv + b.pendSalv + b.guiasSalv + b.anularSalv;
        return sumB - sumA;
    });

    return {
        timestamp: formatPeruDate(new Date()),
        totals,
        alerts,
        all: results
    };
}

/**
 * Traduce el tipo de comprobante a nombre legible
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
 * Formatea los datos de auditoría en mensajes de texto para WhatsApp.
 * Divide inteligentemente el contenido para nunca superar los 4000 caracteres por mensaje.
 */
function formatWhatsAppReport(auditData) {
    const { timestamp, totals, alerts } = auditData;
    const messages = [];

    // =======================================================
    // MENSAJE 1: RESUMEN GENERAL CONSOLIDADO DEL SISTEMA
    // =======================================================
    let summary = `*REPORTE DE AUDITORIA Y CONTROL - FAQTURE*\n`;
    summary += `Generado: ${timestamp} (Hora Peru)\n\n`;

    summary += `*ACCIONES URGENTES (PLAZO SUNAT <= 3 DIAS):*\n`;
    summary += `- Empresas con comprobantes salvables: *${totals.companiesWithSalvables}*\n`;
    summary += `- Comprobantes rechazados salvables: *${totals.totalRejectedSalvables}*\n`;
    summary += `- Por declarar en riesgo (<= 3 dias): *${totals.totalPendingSalvables}*\n`;
    summary += `- Guias pendientes en plazo: *${totals.totalGuiasSalvables}*\n`;
    summary += `- Bajas/anulaciones pendientes (<= 7 dias): *${totals.totalAnularSalvables}*\n`;
    summary += `- Empresas con alerta de certificado / CDR: *${totals.companiesWithCertError}*\n\n`;

    summary += `*CONTROL HISTORICO:*\n`;
    summary += `- Comprobantes fuera de tiempo: *${totals.totalExpired}* (${totals.totalExpiredRejected} rechazados / ${totals.totalExpiredPending} por declarar)\n`;
    summary += `- Total empresas evaluadas: ${totals.totalCompanies}\n`;

    if (alerts.length === 0) {
        summary += `\n*Estado:* Conforme. No se registran comprobantes en riesgo ni incidencias dentro del plazo legal de SUNAT.`;
        return [summary];
    }

    summary += `\n*Estado:* ATENCION REQUERIDA. Se identificaron ${alerts.length} empresas con comprobantes salvables en riesgo. A continuacion se remite el detalle urgente individual:`;
    messages.push(summary);

    // =======================================================
    // MENSAJES 2 EN ADELANTE: DETALLE POR EMPRESA (SOLO SALVABLES)
    // =======================================================
    let detailPart = 1;
    let currentMessage = `*DETALLE DE ACCIONES URGENTES (Parte ${detailPart})*\n----------------------------------------\n`;

    for (const a of alerts) {
        let block = `\n*${a.company.substring(0, 38).trim()}*\n`;
        block += `   RUC/Tenant: \`${a.company_number || a.tenant}\`\n`;

        if (a.hasCertError) {
            block += `   [CERTIFICADO / CDR]: ${a.certErrorDetail || 'Error en certificado digital'}\n`;
        }
        if (a.rejSalv > 0) {
            block += `   - Rechazados salvables (<= 3 dias): *${a.rejSalv}*\n`;
        }
        if (a.pendSalv > 0) {
            block += `   - Por declarar en riesgo (<= 3 dias): *${a.pendSalv}*\n`;
        }
        if (a.guiasSalv > 0) {
            block += `   - Guias pendientes: *${a.guiasSalv}*\n`;
        }
        if (a.anularSalv > 0) {
            block += `   - Bajas pendientes (<= 7 dias): *${a.anularSalv}*\n`;
        }
        if (a.expiredTotal > 0) {
            block += `   - Fuera de tiempo (historico): ${a.expiredTotal}\n`;
        }

        // Ultimo comprobante recibido
        if (a.lastDoc) {
            const docName = getDocumentTypeName(a.lastDoc.type);
            block += `   [Ultimo comprobante recibido]:\n`;
            block += `      * ${docName} \`${a.lastDoc.serie}-${a.lastDoc.numero}\` (Estado: ${a.lastDoc.states})\n`;
            block += `      * Emision: ${a.lastDoc.dateFormatted}\n`;
            block += `      * Recibido: ${a.lastDoc.createdFormatted}\n`;
        } else {
            block += `   [Ultimo comprobante recibido]: Sin comprobantes registrados\n`;
        }

        // Si agregar este bloque supera 3800 caracteres, enviamos el mensaje actual y abrimos otro
        if ((currentMessage + block).length > 3800) {
            messages.push(currentMessage);
            detailPart++;
            currentMessage = `*DETALLE DE ACCIONES URGENTES (Parte ${detailPart})*\n----------------------------------------\n` + block;
        } else {
            currentMessage += block;
        }
    }

    if (currentMessage.trim().length > 0) {
        messages.push(currentMessage);
    }

    return messages;
}

/**
 * Ejecuta la auditoría y envía el reporte estructurado por WhatsApp.
 */
async function sendWhatsAppAuditReport({ phone = null, tenant = null } = {}) {
    const targetPhone = phone || (await getWhatsAppRecipientPhone());
    if (!targetPhone) {
        throw new Error('No hay un número de WhatsApp configurado para recibir el reporte.');
    }

    // Obtener datos
    const auditData = await getAuditReportData({ tenant });
    const messageParts = formatWhatsAppReport(auditData);

    const responses = [];
    for (let i = 0; i < messageParts.length; i++) {
        let sentOk = false;
        // 1. Intentar envío prioritario vía Zendy Gateway
        try {
            const zRes = await sendZendyMessage(targetPhone, messageParts[i]);
            responses.push(zRes?.data || { status: 'sent', provider: 'zendy' });
            sentOk = true;
        } catch (zErr) {
            console.warn(`[sendWhatsAppAuditReport] Zendy error parte ${i + 1}:`, zErr.message);
            // Si el error es de conexión no lista, intentar fallback legacy o propagar
            try {
                const payload = getTextMessageInput(targetPhone, messageParts[i]);
                const res = await sendMessage(payload);
                responses.push(res?.data || { status: 'sent', provider: 'meta' });
                sentOk = true;
            } catch (mErr) {
                // Propagar el error descriptivo de Zendy si ambos fallan
                throw new Error(zErr.message || mErr.message);
            }
        }

        // Breve pausa para no saturar si son múltiples partes
        if (messageParts.length > 1 && i < messageParts.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 800));
        }
    }

    return {
        success: true,
        phone: targetPhone,
        partsSent: messageParts.length,
        totals: auditData.totals,
        alertsCount: auditData.alerts.length,
        timestamp: auditData.timestamp
    };
}

module.exports = {
    getAuditReportData,
    formatWhatsAppReport,
    sendWhatsAppAuditReport,
    getWhatsAppRecipientPhone,
    formatPeruDate
};
