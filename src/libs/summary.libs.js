const pool = require('../db');
const { ApiClient } = require('./api.libs');
const { selectAllApiCompany } = require('./company.libs');
const { resetTicketSingleShipment } = require('./connection');
const { notifyError } = require('./logger');

/**
 * Valida formato de fecha ISO YYYY-MM-DD.
 */
const isValidIsoDate = (date) => {
    return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(String(date).trim()));
};

/**
 * Limpia y normaliza la URL base de una empresa (sin barras finales ni espacios).
 */
const normalizeBaseUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    return url.trim().replace(/\/+$/, '');
};

/**
 * Filtra y valida los tipos de comprobantes configurados para una categoría específica.
 * Si docTypes es un array, solo toma la intersección con targetTypes.
 * Si la intersección es vacía, retorna null (significa que el usuario excluyó esta categoría).
 */
const filterTypes = (configuredDocTypes, targetTypes) => {
    if (Array.isArray(configuredDocTypes) && configuredDocTypes.length > 0) {
        const cleanConfigured = configuredDocTypes.map(t => String(t).trim());
        const intersection = targetTypes.filter(t => cleanConfigured.includes(t));
        return intersection.length > 0 ? intersection : null;
    }
    return targetTypes;
};

/**
 * Helper para construir la cláusula SQL 'type IN (...)' de manera segura
 */
const buildSqlInClause = (typesArray) => {
    if (!Array.isArray(typesArray) || typesArray.length === 0) {
        return "type IN ('03')";
    }
    const cleanTypes = typesArray.filter(t => /^[0-9a-zA-Z]+$/.test(t)).map(t => `'${t}'`);
    return `type IN (${cleanTypes.join(', ')})`;
};

/**
 * Determina si un documento es Factura (01) o Nota (07/08) vinculada a Factura.
 * Criterio:
 * 1. type === '01'
 * 2. type in ('07', '08') y serie empieza con 'F' (ej. FC01, FD01)
 *    o json_format.documento_afectado.codigo_tipo_documento === '01'
 */
const isFacturaOrNoteOfFactura = (doc) => {
    if (!doc) return false;
    const type = String(doc.type || '').trim();
    if (type === '01') return true;

    if (type === '07' || type === '08') {
        const serie = String(doc.serie || '').trim().toUpperCase();
        if (serie.startsWith('F')) return true;

        if (doc.json_format) {
            try {
                const parsed = typeof doc.json_format === 'string' ? JSON.parse(doc.json_format) : doc.json_format;
                if (parsed?.documento_afectado?.codigo_tipo_documento === '01') {
                    return true;
                }
            } catch (e) {}
        }
    }
    return false;
};

/**
 * Determina si un documento es Boleta (03) o Nota (07/08) vinculada a Boleta.
 * Criterio:
 * 1. type === '03'
 * 2. type in ('07', '08') y serie empieza con 'B' (ej. BC01, BD01, BX01)
 *    o json_format.documento_afectado.codigo_tipo_documento === '03'
 */
const isBoletaOrNoteOfBoleta = (doc) => {
    if (!doc) return false;
    const type = String(doc.type || '').trim();
    if (type === '03') return true;

    if (type === '07' || type === '08') {
        const serie = String(doc.serie || '').trim().toUpperCase();
        if (serie.startsWith('B')) return true;

        if (doc.json_format) {
            try {
                const parsed = typeof doc.json_format === 'string' ? JSON.parse(doc.json_format) : doc.json_format;
                if (parsed?.documento_afectado?.codigo_tipo_documento === '03') {
                    return true;
                }
            } catch (e) {}
        }
    }
    return false;
};

/**
 * Extrae las fechas únicas (YYYY-MM-DD) de comprobantes pendientes de resumen en un tenant.
 * Respeta estrictamente los tipos de comprobantes configurados por el usuario (docTypes).
 */
const getPendingBoletaDates = async (tenant, effectiveBoletaTypes, maxDaysBack = 45) => {
    try {
        if (!tenant || !effectiveBoletaTypes || effectiveBoletaTypes.length === 0) return [];
        
        const typeClause = buildSqlInClause(effectiveBoletaTypes);
        const query = `
            SELECT DISTINCT TO_CHAR(date::DATE, 'YYYY-MM-DD') AS emission_date
            FROM ${tenant}.document
            WHERE states IN ('N', 'Y', 'S', 'X', 'M')
              AND states NOT IN ('A', 'P', 'C', 'R')
              AND ${typeClause}
              AND date IS NOT NULL
              AND date >= (CURRENT_DATE - INTERVAL '${parseInt(maxDaysBack, 10)} days')
            ORDER BY emission_date ASC
            LIMIT 30;
        `;
        const { rows } = await pool.query(query);
        return rows.map(r => r.emission_date).filter(isValidIsoDate);
    } catch (error) {
        console.error(`[Summary Libs] Error obteniendo fechas de boletas en ${tenant}:`, error.message);
        return [];
    }
};

/**
 * Envía la petición de generación de Resumen Diario al PRO para una fecha dada.
 * Endpoint: POST /api/summaries
 */
const sendDailySummaryForDate = async (company, date) => {
    try {
        const baseUrl = normalizeBaseUrl(company?.url);
        if (!baseUrl || !company?.token || !isValidIsoDate(date)) {
            return { success: false, message: 'Datos incompletos para enviar resumen' };
        }
        
        const api = new ApiClient(`${baseUrl}/api/summaries`, company.token);
        const payload = {
            fecha_de_emision_de_documentos: date,
            codigo_tipo_proceso: '1'
        };

        const response = await api.sendDocument(payload);
        return response;
    } catch (error) {
        console.error(`[Summary Libs] Error enviando resumen para fecha ${date} en ${company.tenant}:`, error.message);
        return { success: false, message: error.message };
    }
};

/**
 * Consulta el estado del ticket del resumen diario en el PRO.
 * Endpoint: POST /api/summaries/status
 */
const consultSummaryTicket = async (company, ticket) => {
    try {
        const baseUrl = normalizeBaseUrl(company?.url);
        if (!baseUrl || !company?.token || !ticket) {
            return { success: false, message: 'Ticket o credenciales incompletas para consulta' };
        }

        const api = new ApiClient(`${baseUrl}/api/summaries/status`, company.token);
        const payload = { ticket: String(ticket).trim() };
        const response = await api.sendDocument(payload);
        return response;
    } catch (error) {
        console.error(`[Summary Libs] Error consultando ticket ${ticket} en ${company.tenant}:`, error.message);
        return { success: false, message: error.message };
    }
};

/**
 * Actualiza en Faqture las boletas y notas de una fecha dada a estado 'E' (Aceptado)
 * cuando el resumen diario ha sido aprobado por SUNAT.
 */
const updateBoletasAcceptedForDate = async (tenant, date, effectiveBoletaTypes, summaryResult = null) => {
    try {
        if (!tenant || !isValidIsoDate(date) || !effectiveBoletaTypes || effectiveBoletaTypes.length === 0) return 0;

        const typeClause = buildSqlInClause(effectiveBoletaTypes);
        const responseSendJson = JSON.stringify({
            success: true,
            state: 'E',
            message: summaryResult?.message || `Resumen diario aprobado en SUNAT para fecha ${date}`,
            summary_ticket: summaryResult?.data?.ticket || null,
            filename: summaryResult?.data?.filename || null,
            state_type_id: '05',
            state_type_description: 'Aceptado',
            regularized_at: new Date().toISOString(),
        });

        const updateQuery = `
            UPDATE ${tenant}.document
            SET states = 'E',
                response_send = COALESCE(NULLIF(response_send, ''), $1)
            WHERE TO_CHAR(date::DATE, 'YYYY-MM-DD') = $2
              AND ${typeClause}
              AND states IN ('N', 'Y', 'S', 'X', 'M')
              AND states NOT IN ('A', 'P', 'C')
            RETURNING id_document;
        `;
        const { rowCount } = await pool.query(updateQuery, [responseSendJson, date]);
        return rowCount || 0;
    } catch (error) {
        console.error(`[Summary Libs] Error actualizando boletas a 'E' para fecha ${date} en ${tenant}:`, error.message);
        return 0;
    }
};

/**
 * Actualiza temporalmente comprobantes a estado 'Y' y guarda el ticket cuando
 * el resumen diario queda en proceso en SUNAT (código 98 o pendiente).
 */
const updateBoletasPendingTicketForDate = async (tenant, date, effectiveBoletaTypes, ticket) => {
    try {
        if (!tenant || !isValidIsoDate(date) || !effectiveBoletaTypes || effectiveBoletaTypes.length === 0 || !ticket) return 0;

        const typeClause = buildSqlInClause(effectiveBoletaTypes);
        const responseSendJson = JSON.stringify({
            success: true,
            state: 'Y',
            message: `Ticket de resumen ${ticket} en proceso en SUNAT para fecha ${date}`,
            summary_ticket: ticket,
            state_type_id: '01',
            state_type_description: 'En proceso',
            sent_at: new Date().toISOString(),
        });

        const updateQuery = `
            UPDATE ${tenant}.document
            SET states = 'Y',
                response_send = $1
            WHERE TO_CHAR(date::DATE, 'YYYY-MM-DD') = $2
              AND ${typeClause}
              AND states IN ('N', 'S', 'X', 'M')
              AND states NOT IN ('A', 'P', 'C', 'E')
            RETURNING id_document;
        `;
        const { rowCount } = await pool.query(updateQuery, [responseSendJson, date]);
        return rowCount || 0;
    } catch (error) {
        console.error(`[Summary Libs] Error actualizando boletas con ticket pendiente para fecha ${date} en ${tenant}:`, error.message);
        return 0;
    }
};

/**
 * Marca como rechazadas ('R') las boletas de una fecha si SUNAT rechazó el resumen diario.
 */
const updateBoletasRejectedForDate = async (tenant, date, effectiveBoletaTypes, errorResult = null) => {
    try {
        if (!tenant || !isValidIsoDate(date) || !effectiveBoletaTypes || effectiveBoletaTypes.length === 0) return 0;

        const typeClause = buildSqlInClause(effectiveBoletaTypes);
        const responseSendJson = JSON.stringify({
            success: false,
            state: 'R',
            message: errorResult?.message || errorResult?.data?.state_type_description || `Resumen diario rechazado por SUNAT para fecha ${date}`,
            state_type_id: '09',
            state_type_description: 'Rechazado',
            rejected_at: new Date().toISOString(),
        });

        const updateQuery = `
            UPDATE ${tenant}.document
            SET states = 'R',
                response_send = $1
            WHERE TO_CHAR(date::DATE, 'YYYY-MM-DD') = $2
              AND ${typeClause}
              AND states IN ('N', 'Y', 'S', 'X', 'M')
              AND states NOT IN ('A', 'P', 'C')
            RETURNING id_document;
        `;
        const { rowCount } = await pool.query(updateQuery, [responseSendJson, date]);
        return rowCount || 0;
    } catch (error) {
        console.error(`[Summary Libs] Error actualizando boletas a 'R' para fecha ${date} en ${tenant}:`, error.message);
        return 0;
    }
};

/**
 * Consulta todos los tickets de resúmenes diarios pendientes (states = 'Y') de una empresa.
 * Si SUNAT ya los aceptó (05) o rechazó (09), actualiza los comprobantes correspondientes a 'E' o 'R'.
 */
const consultPendingSummaryTicketsForCompany = async (company, effectiveBoletaTypes) => {
    try {
        if (!company?.tenant || !company?.url || !company?.token) return 0;
        if (!effectiveBoletaTypes || effectiveBoletaTypes.length === 0) return 0;

        const typeClause = buildSqlInClause(effectiveBoletaTypes);
        const query = `
            SELECT id_document, TO_CHAR(date::DATE, 'YYYY-MM-DD') as emission_date, response_send
            FROM ${company.tenant}.document
            WHERE states = 'Y'
              AND ${typeClause}
              AND response_send IS NOT NULL
            ORDER BY id_document DESC
            LIMIT 100;
        `;
        const { rows } = await pool.query(query);
        if (!rows || rows.length === 0) return 0;

        // Agrupar por ticket único y fecha
        const ticketsMap = new Map();
        for (const row of rows) {
            let resp = row.response_send;
            if (typeof resp === 'string') {
                try { resp = JSON.parse(resp); } catch (e) {}
            }
            const ticket = resp?.summary_ticket || resp?.data?.ticket;
            const emissionDate = row.emission_date;
            if (ticket && emissionDate && !ticketsMap.has(ticket)) {
                ticketsMap.set(ticket, { ticket, date: emissionDate });
            }
        }

        let regularizedTotal = 0;
        for (const { ticket, date } of ticketsMap.values()) {
            const resTicket = await consultSummaryTicket(company, ticket);
            const stateTypeId = resTicket?.data?.state_type_id;

            if (resTicket?.success && stateTypeId === '05') {
                const count = await updateBoletasAcceptedForDate(company.tenant, date, effectiveBoletaTypes, resTicket);
                regularizedTotal += count;
                console.log(`[Summary Libs] ${company.tenant} Ticket pendiente ${ticket} para ${date} ACEPTADO en SUNAT. ${count} comprobantes regularizados a 'E'.`);
            } else if (stateTypeId === '09') {
                const count = await updateBoletasRejectedForDate(company.tenant, date, effectiveBoletaTypes, resTicket);
                console.warn(`[Summary Libs] ${company.tenant} Ticket pendiente ${ticket} para ${date} RECHAZADO por SUNAT. ${count} comprobantes marcados como 'R'.`);
            }
        }

        return regularizedTotal;
    } catch (error) {
        console.error(`[Summary Libs] Error consultando tickets pendientes en ${company.tenant}:`, error.message);
        return 0;
    }
};

/**
 * Reenvía individualmente una Factura o Nota de Factura al PRO vía POST /api/documents/send
 */
const resendDocumentToPro = async (company, externalId) => {
    try {
        const baseUrl = normalizeBaseUrl(company?.url);
        if (!baseUrl || !company?.token || !externalId) return { success: false };

        const api = new ApiClient(`${baseUrl}/api/documents/send`, company.token);
        const payload = { external_id: String(externalId).trim() };
        const response = await api.sendDocument(payload);
        return response;
    } catch (error) {
        console.error(`[Summary Libs] Error reenviando doc ${externalId} a ${company.tenant}:`, error.message);
        return { success: false, message: error.message };
    }
};

/**
 * Procesa todos los resúmenes de boletas por fecha y el reenvío de facturas para una empresa.
 * Respeta fielmente los tipos de comprobantes configurados en options.docTypes.
 */
const processSummariesAndPendingForCompany = async (company, options = {}) => {
    const summaryStats = {
        tenant: company?.tenant,
        datesProcessed: 0,
        summariesSent: 0,
        summariesAccepted: 0,
        boletasRegularized: 0,
        facturasResent: 0,
    };

    try {
        if (!company?.url || !company?.token || !company?.tenant) {
            return summaryStats;
        }

        const docTypes = options?.docTypes || null;
        const effectiveBoletaTypes = filterTypes(docTypes, ['03', '07', '08']);
        const effectiveFacturaTypes = filterTypes(docTypes, ['01', '07', '08']);

        // ─── FASE 1: Consultar Tickets de Resúmenes Pendientes ('Y') ───
        if (effectiveBoletaTypes && effectiveBoletaTypes.length > 0) {
            const regularizedFromTickets = await consultPendingSummaryTicketsForCompany(company, effectiveBoletaTypes);
            summaryStats.boletasRegularized += regularizedFromTickets;
        }

        // ─── FASE 2: Procesar Nuevos Resúmenes Diarios de Boletas por Fecha ───
        if (effectiveBoletaTypes && effectiveBoletaTypes.length > 0) {
            // Ejecutar UPDATE documents SET ticket_single_shipment = 0 de forma preventiva
            // para asegurar que el PRO incluya todas las boletas registradas en el resumen
            try {
                await resetTicketSingleShipment(company.url);
            } catch (e) {
                console.warn(`[Summary Libs] resetTicketSingleShipment advertencia en ${company.tenant}:`, e.message);
            }

            const pendingDates = await getPendingBoletaDates(company.tenant, effectiveBoletaTypes, options?.maxDaysBack || 45);
            
            // Incluir fechas pendientes y asegurar fechas recientes (hoy y ayer) para capturar ventas del día
            const datesToProcess = [...pendingDates];
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            if (!datesToProcess.includes(today)) datesToProcess.push(today);
            if (!datesToProcess.includes(yesterday)) datesToProcess.push(yesterday);

            if (datesToProcess.length > 0) {
                console.log(`[Summary Libs] ${company.tenant} procesando resúmenes (${effectiveBoletaTypes.join(',')}) en ${datesToProcess.length} fechas:`, datesToProcess);

                for (const date of datesToProcess) {
                    summaryStats.datesProcessed++;
                    const resSummary = await sendDailySummaryForDate(company, date);
                    
                    // Caso A: Se generó el resumen con éxito y devolvió Ticket
                    if (resSummary?.success && resSummary?.data?.ticket) {
                        summaryStats.summariesSent++;
                        const ticket = resSummary.data.ticket;
                        console.log(`[Summary Libs] ${company.tenant} Resumen enviado para ${date}. Ticket: ${ticket}`);

                        // Intentar consultar el ticket inmediatamente
                        const resTicket = await consultSummaryTicket(company, ticket);
                        const stateTypeId = resTicket?.data?.state_type_id;

                        if (resTicket?.success && stateTypeId === '05') {
                            // Estado 05: Aceptado
                            summaryStats.summariesAccepted++;
                            const updatedCount = await updateBoletasAcceptedForDate(company.tenant, date, effectiveBoletaTypes, resTicket);
                            summaryStats.boletasRegularized += updatedCount;
                            console.log(`[Summary Libs] ${company.tenant} Resumen ${ticket} ACEPTADO en SUNAT para ${date}. ${updatedCount} comprobantes actualizados a 'E'`);
                        } else if (stateTypeId === '09') {
                            // Estado 09: Rechazado por SUNAT (ej. fuera de plazo)
                            const rejectedCount = await updateBoletasRejectedForDate(company.tenant, date, effectiveBoletaTypes, resTicket);
                            console.warn(`[Summary Libs] ${company.tenant} Resumen ${ticket} RECHAZADO por SUNAT para ${date}. ${rejectedCount} comprobantes marcados como 'R'`);
                        } else {
                            // En proceso (código 98 o pendiente): registrar ticket para consulta posterior
                            await updateBoletasPendingTicketForDate(company.tenant, date, effectiveBoletaTypes, ticket);
                            console.log(`[Summary Libs] ${company.tenant} Ticket ${ticket} en proceso en SUNAT (código ${stateTypeId || 'PENDIENTE'}). Guardado en BD para consulta.`);
                        }
                    } 
                    // Caso B: El PRO responde que ya se encuentra registrado o ya existe resumen
                    else if (resSummary?.message && (
                        String(resSummary.message).toLowerCase().includes('ya se encuentra') ||
                        String(resSummary.message).toLowerCase().includes('ya fue enviado') ||
                        String(resSummary.message).toLowerCase().includes('ya existe')
                    )) {
                        const updatedCount = await updateBoletasAcceptedForDate(company.tenant, date, effectiveBoletaTypes, resSummary);
                        summaryStats.boletasRegularized += updatedCount;
                    }
                    // Caso C: Rechazo directo del PRO o SUNAT (ej. fuera de plazo)
                    else if (resSummary?.message && (
                        String(resSummary.message).toLowerCase().includes('rechaz') ||
                        String(resSummary.message).toLowerCase().includes('plazo') ||
                        String(resSummary.message).toLowerCase().includes('no permitido')
                    )) {
                        const rejectedCount = await updateBoletasRejectedForDate(company.tenant, date, effectiveBoletaTypes, resSummary);
                        console.warn(`[Summary Libs] ${company.tenant} Resumen para ${date} rechazado: ${resSummary.message}. ${rejectedCount} comprobantes marcados como 'R'`);
                    }
                }
            }
        }

        // ─── 2. Reenviar Facturas y Notas de Facturas Pendientes ───
        if (effectiveFacturaTypes && effectiveFacturaTypes.length > 0) {
            const facturaTypeClause = buildSqlInClause(effectiveFacturaTypes);
            const queryFacturas = `
                SELECT id_document, type, serie, numero, external_id, json_format
                FROM ${company.tenant}.document
                WHERE states IN ('N', 'Y', 'S', 'X', 'M')
                  AND states NOT IN ('A', 'P', 'C', 'R')
                  AND ${facturaTypeClause}
                  AND external_id IS NOT NULL
                ORDER BY id_document ASC
                LIMIT 25;
            `;
            const { rows: pendingFacturas } = await pool.query(queryFacturas);
            const facturasToSend = pendingFacturas.filter(isFacturaOrNoteOfFactura);

            if (facturasToSend.length > 0) {
                console.log(`[Summary Libs] ${company.tenant} tiene ${facturasToSend.length} Facturas/Notas (${effectiveFacturaTypes.join(',')}) pendientes de reenvío individual.`);
                for (const doc of facturasToSend) {
                    const resSend = await resendDocumentToPro(company, doc.external_id);
                    if (resSend?.success || resSend?.data?.state_type_id === '05') {
                        summaryStats.facturasResent++;
                        await pool.query(
                            `UPDATE ${company.tenant}.document SET states = 'E' WHERE id_document = $1`,
                            [doc.id_document]
                        );
                    } else if (resSend?.data?.state_type_id === '09') {
                        await pool.query(
                            `UPDATE ${company.tenant}.document SET states = 'R', response_send = $1 WHERE id_document = $2`,
                            [JSON.stringify(resSend), doc.id_document]
                        );
                    }
                }
            }
        }

    } catch (error) {
        console.error(`[Summary Libs] Error procesando resúmenes en empresa ${company.tenant}:`, error.message);
        notifyError({
            type: 'Error en processSummariesAndPendingForCompany',
            error,
            tenant: company.tenant,
        });
    }

    return summaryStats;
};

/**
 * Función principal del Cron 5: Recorre todas las empresas activas y ejecuta
 * la generación de resúmenes de boletas por día y reenvío de facturas.
 */
let isProcessingSummaryCron = false;
const processSummariesAndPendingAllCompanies = async (options = {}) => {
    if (isProcessingSummaryCron) {
        console.log('[CRON Task 5] Previa ejecución de resúmenes en proceso, omitiendo ciclo...');
        return;
    }

    isProcessingSummaryCron = true;
    const globalStats = {
        totalCompanies: 0,
        totalSummariesSent: 0,
        totalBoletasRegularized: 0,
        totalFacturasResent: 0,
    };

    try {
        const companies = await selectAllApiCompany();
        globalStats.totalCompanies = companies.length;

        for (const company of companies) {
            try {
                if (company.state && company.url && company.token) {
                    const stats = await processSummariesAndPendingForCompany(company, options);
                    globalStats.totalSummariesSent += stats.summariesSent;
                    globalStats.totalBoletasRegularized += stats.boletasRegularized;
                    globalStats.totalFacturasResent += stats.facturasResent;
                }
            } catch (compErr) {
                console.error(`[CRON Task 5] Error en empresa ${company.tenant}:`, compErr.message);
            }
        }

        console.log({
            message: '[CRON Task 5] Ciclo de Resúmenes y Reenvío Finalizado',
            ...globalStats,
        });

    } catch (error) {
        console.error('[CRON Task 5] Error global en processSummariesAndPendingAllCompanies:', error);
        notifyError({
            type: 'Error global en processSummariesAndPendingAllCompanies',
            error,
        });
    } finally {
        isProcessingSummaryCron = false;
    }
};

module.exports = {
    isValidIsoDate,
    normalizeBaseUrl,
    filterTypes,
    buildSqlInClause,
    isFacturaOrNoteOfFactura,
    isBoletaOrNoteOfBoleta,
    getPendingBoletaDates,
    sendDailySummaryForDate,
    consultSummaryTicket,
    updateBoletasAcceptedForDate,
    updateBoletasPendingTicketForDate,
    updateBoletasRejectedForDate,
    consultPendingSummaryTicketsForCompany,
    resendDocumentToPro,
    processSummariesAndPendingForCompany,
    processSummariesAndPendingAllCompanies,
};
