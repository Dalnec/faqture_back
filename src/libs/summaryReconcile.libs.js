/**
 * summaryReconcile.libs.js
 *
 * Conciliación de resúmenes diarios de boletas (Tarea 5) entre Faqture, el PRO y SUNAT.
 *
 * Contexto del problema que resuelve (detectado en producción, noviembre 2026):
 *  1. El PRO responde a POST /api/summaries/status SIN `data.state_type_id`. La Tarea 5 exigía
 *     `data.state_type_id === '05'`, por lo que nunca detectaba un resumen aceptado y las boletas
 *     quedaban en 'Y' (Por Consultar) aunque SUNAT las tuviera aceptadas.
 *  2. Cuando un resumen incluye una boleta que SUNAT ya tiene (enviada individualmente con error HTTP
 *     en el PRO), SUNAT rechaza TODO el lote con 2282 ("Existe documento ya informado anteriormente").
 *     Al no leer el rechazo, la Tarea 5 reenviaba el mismo resumen cada 8 horas y la fecha nunca se declaraba.
 *  3. Si se hubiera leído, el flujo anterior marcaba 'R' a TODAS las boletas de la fecha (o 'E' a todas
 *     si era aceptado), aunque el resultado del resumen no corresponda a cada boleta.
 *
 * Reglas de seguridad de este módulo:
 *  - Solo pasa a 'E' boletas que el PRO tiene en '05' o que SUNAT confirma ACEPTADAS (consulta de validez).
 *  - Nunca marca 'R' por el rechazo de un resumen (es un rechazo del lote, no de cada boleta).
 *  - Toda respuesta que no se reconozca con claridad se trata como pendiente: no se cambia ningún estado.
 */
const pool = require('../db');
const { ApiClient } = require('./api.libs');
const { notifyError } = require('./logger');
const { parseJsonField } = require('./json.libs');
const { validateVoucherOnSunat, formatDateForSunat } = require('./sunatValidation.libs');
const { setBoletasAcceptedInPro } = require('./connection');

/**
 * Interruptor de la Parte 2 (regularizar en el PRO las boletas que bloquean un resumen con 2282).
 * Se configura desde el front: Configuración > Reportes WhatsApp (public.settings, key 'task5_pro_regularize'):
 *  - 'report' (por defecto): NO escribe en el PRO; solo informa en la alerta qué regularizaría.
 *  - 'on': regulariza en el PRO las boletas que SUNAT confirma ACEPTADAS y la tarea reenvía el resumen.
 *  - 'off': desactivado (ni siquiera consulta SUNAT para esto).
 * Si el ajuste no existe se crea con 'report'. Ante cualquier error se usa 'report' (modo seguro).
 */
const PRO_REGULARIZE_SETTING = 'task5_pro_regularize';
let proRegularizeSettingEnsured = false;
const getProRegularizeMode = async () => {
    try {
        if (!proRegularizeSettingEnsured) {
            await pool.query(
                `INSERT INTO public.settings (id_settings, key, value, description, category, active)
                 SELECT (SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), $1::varchar, 'report',
                        'Tarea 5: regularizar en el PRO boletas que bloquean resúmenes (2282). Valores: report | on | off', 'whatsapp', true
                  WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = $1::varchar)`,
                [PRO_REGULARIZE_SETTING]
            );
            proRegularizeSettingEnsured = true;
        }
        const { rows } = await pool.query(
            `SELECT value FROM public.settings WHERE key = $1 AND active = true LIMIT 1`,
            [PRO_REGULARIZE_SETTING]
        );
        const v = String(rows?.[0]?.value || 'report').trim().toLowerCase();
        return ['on', 'off', 'report'].includes(v) ? v : 'report';
    } catch (error) {
        console.warn('[Summary Reconcile] No se pudo leer el modo de regularización; se usa "report":', error.message);
        return 'report';
    }
};

/** Fecha 'YYYY-MM-DD' -> 'DD/MM/YYYY' */
const toDmy = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');

/** Último día de plazo SUNAT para el resumen de boletas: 7 días calendario desde el día siguiente a la emisión. */
const summaryDeadline = (iso) => {
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    return toDmy(new Date(d.getTime() + 7 * 86400000).toISOString());
};

// Helpers compartidos de summary.libs.js. Se cargan en tiempo de llamada (no al inicio) porque
// summary.libs.js también requiere este módulo: así se evita la dependencia circular durante la carga.
const summaryLibs = () => require('./summary.libs');
const familyClause = (types) => summaryLibs().buildBoletaFamilyClause(types);
const isValidIsoDate = (date) => summaryLibs().isValidIsoDate(date);
const normalizeBaseUrl = (url) => summaryLibs().normalizeBaseUrl(url);

/**
 * Valida el nombre de esquema (tenant) antes de interpolarlo en SQL (multi-tenancy).
 */
const isValidTenant = (tenant) => Boolean(tenant && /^[a-zA-Z0-9_]+$/.test(String(tenant)));

/**
 * Clave normalizada serie-número (sin ceros a la izquierda) para comparar Faqture vs PRO/SUNAT.
 * Ej: ('be01', '000123') -> 'BE01-123'
 */
const docKey = (serie, numero) => {
    const s = String(serie || '').trim().toUpperCase();
    const n = parseInt(String(numero || '').trim(), 10);
    if (!s || Number.isNaN(n)) return null;
    return `${s}-${n}`;
};

/**
 * Interpreta la respuesta del PRO a POST /api/summaries/status (consulta de ticket de resumen).
 *
 * Formatos reales observados:
 *  - Aceptado (API): { success: true, data: { filename, external_id }, response: { code: '0', is_accepted: true,
 *                      description: 'El Resumen Diario numero ..., ha sido aceptado' } }
 *  - Rechazado (panel PRO): { success: false, message: '2282 - Existe documento ya informado anteriormente - Detalle:
 *                      ... Comprobante: [[03-BE06-42834], [03-BE01-285714]]' }
 *  - Error SUNAT: { success: false, message: 'Code: 133; Description: - El sistema no puede responder ...' }
 *
 * @returns {{ status: 'accepted'|'rejected'|'pending'|'error', code: string|null, message: string, informedDocs: string[] }}
 *          informedDocs: claves 'SERIE-NUM' que SUNAT reporta como ya informadas (error 2282).
 */
const classifySummaryStatus = (res) => {
    const texts = [res?.message, res?.response?.description, res?.data?.state_type_description, res?.error]
        .filter(t => typeof t === 'string' && t.trim() !== '');
    const message = texts.join(' | ');

    let code = null;
    if (res?.response?.code !== undefined && res?.response?.code !== null && String(res.response.code).trim() !== '') {
        code = String(res.response.code).trim();
    } else {
        const m = message.match(/Code:\s*(\d{1,4})/i) || message.match(/^\s*(\d{1,4})\s*-\s/) || message.match(/\b(\d{4})\s*-\s/);
        if (m) code = m[1];
    }
    const codeNum = code !== null ? parseInt(code, 10) : NaN;

    const informedDocs = [];
    const listMatch = message.match(/\[\[(.*?)\]\]/);
    if (listMatch) {
        for (const raw of listMatch[1].split(/\]\s*,\s*\[/)) {
            const parts = raw.replace(/[\[\]\s]/g, '').split('-'); // ej: 03-BE06-42834
            if (parts.length >= 3) {
                const key = docKey(parts[1], parts[2]);
                if (key) informedDocs.push(key);
            }
        }
    }

    const result = (status) => ({ status, code, message, informedDocs });

    // Aceptado: solo con evidencia explícita.
    const explicitlyNotAccepted = res?.response?.is_accepted === false;
    if (!explicitlyNotAccepted && res?.success === true && (
        res?.response?.is_accepted === true ||
        code === '0' ||
        res?.data?.state_type_id === '05' ||
        /ha sido aceptad/i.test(message)
    )) {
        return result('accepted');
    }

    // Rechazado: estado 09 o códigos de rechazo SUNAT (2000-3999) o 99 (proceso con errores).
    if (res?.data?.state_type_id === '09' || (codeNum >= 2000 && codeNum <= 3999) || codeNum === 99) {
        return result('rejected');
    }

    // En proceso
    if (codeNum === 98 || /en proceso/i.test(message)) {
        return result('pending');
    }

    // Errores de red / SUNAT temporales (0100-0199, sin respuesta, etc.)
    if (res?.error || (codeNum >= 100 && codeNum <= 199) || !res) {
        return result('error');
    }

    return result('pending');
};

/**
 * Obtiene del PRO el listado de comprobantes de una fecha y lo indexa por clave 'SERIE-NUM'.
 * Devuelve null si el PRO no respondió con un listado válido (en ese caso NO se debe concluir nada).
 */
const getProDocsByDate = async (company, date) => {
    const baseUrl = normalizeBaseUrl(company?.url);
    if (!baseUrl || !company?.token || !isValidIsoDate(date)) return null;
    try {
        const api = new ApiClient(`${baseUrl}/api/documents/lists/`, company.token);
        const res = await api.getListDocumentByDate(`${baseUrl}/api/documents/lists/${date}/${date}`);
        if (!Array.isArray(res?.data)) return null;
        const map = new Map();
        for (const el of res.data) {
            const parts = String(el?.number || '').trim().split('-');
            if (parts.length !== 2) continue;
            const key = docKey(parts[0], parts[1]);
            if (key) map.set(key, el);
        }
        return map;
    } catch (error) {
        console.error(`[Summary Reconcile] Error listando documentos del PRO para ${date} en ${company?.tenant}:`, error.message);
        return null;
    }
};

/**
 * Comprobantes en 'Y' (familia boleta) de una fecha en Faqture.
 */
const selectYBoletasForDate = async (tenant, date, effectiveBoletaTypes) => {
    if (!isValidTenant(tenant) || !isValidIsoDate(date) || !effectiveBoletaTypes || effectiveBoletaTypes.length === 0) return [];
    const { rows } = await pool.query(
        `SELECT id_document, type, serie, numero, date, amount, response_send
           FROM ${tenant}.document
          WHERE TO_CHAR(date::DATE, 'YYYY-MM-DD') = $1
            AND ${familyClause(effectiveBoletaTypes)}
            AND states = 'Y'
          ORDER BY id_document ASC`,
        [date]
    );
    return rows || [];
};

/**
 * Fusiona campos en response_send de un documento (en JS, para tolerar filas legadas con jsonb string)
 * y opcionalmente cambia su estado. Solo actúa si el documento sigue en 'Y'.
 */
const mergeResponseSend = async (tenant, row, extra, newState = null) => {
    if (!isValidTenant(tenant)) return false;
    const current = parseJsonField(row.response_send, {});
    const base = (current && typeof current === 'object' && !Array.isArray(current)) ? current : { previous: current };
    const merged = { ...base, ...extra };
    const sql = newState
        ? `UPDATE ${tenant}.document SET states = $1, response_send = $2::jsonb, modified = NOW() WHERE id_document = $3 AND states = 'Y'`
        : `UPDATE ${tenant}.document SET response_send = $1::jsonb, modified = NOW() WHERE id_document = $2 AND states = 'Y'`;
    const params = newState ? [newState, JSON.stringify(merged), row.id_document] : [JSON.stringify(merged), row.id_document];
    const { rowCount } = await pool.query(sql, params);
    return rowCount > 0;
};

/**
 * Concilia con el PRO las boletas en 'Y' de una fecha: pasa a 'E' SOLO las que el PRO tiene en estado '05' (Aceptado).
 * El PRO marca '05' únicamente cuando SUNAT aceptó el comprobante (individualmente o por resumen).
 * Las demás quedan en 'Y'. Si el PRO no responde, no se cambia nada.
 */
const reconcileDateWithPro = async (company, date, effectiveBoletaTypes, context = {}) => {
    try {
        const yRows = await selectYBoletasForDate(company.tenant, date, effectiveBoletaTypes);
        if (yRows.length === 0) return { regularized: 0, remaining: 0 };

        const proDocs = await getProDocsByDate(company, date);
        if (!proDocs) return { regularized: 0, remaining: yRows.length, proUnavailable: true };

        let regularized = 0;
        for (const row of yRows) {
            const key = docKey(row.serie, row.numero);
            const el = key ? proDocs.get(key) : null;
            if (!el || String(el.state_type_id) !== '05') continue;
            const ok = await mergeResponseSend(company.tenant, row, {
                success: true,
                state: 'E',
                state_type_id: '05',
                state_type_description: 'Aceptado',
                message: `Regularizado: el PRO muestra el comprobante ACEPTADO (${context.reason || 'conciliación de resumen diario'})`,
                summary_ticket: context.ticket || parseJsonField(row.response_send, {})?.summary_ticket || null,
                external_id_pro: el.external_id || null,
                regularized_at: new Date().toISOString(),
            }, 'E');
            if (ok) regularized++;
        }
        return { regularized, remaining: yRows.length - regularized };
    } catch (error) {
        console.error(`[Summary Reconcile] Error conciliando ${date} con el PRO en ${company?.tenant}:`, error.message);
        return { regularized: 0, remaining: null, error: error.message };
    }
};

/** Máximo de boletas por fecha que se consultan en SUNAT al buscar bloqueantes de un 2282 (acota la duración de la tarea). */
const MAX_BLOCKER_CANDIDATES = 50;

/**
 * SUNAT informa en el 2282 SOLO UNA boleta "ya informada" por rechazo, aunque haya varias en la misma situación
 * (verificado en producción: fecha con 18 boletas "Por regularizar" y el 2282 nombra solo una). Resolverlas una por una
 * cuesta un ciclo de 8 h por boleta y la fecha puede vencer.
 * Esta función arma la lista de SOSPECHOSAS: las que nombra SUNAT + las boletas de la fecha que el PRO tiene en
 * '01'/'03' con marca "Por regularizar" (envío individual con error) o en '03' (Enviado sin CDR).
 * Son solo candidatas a CONSULTAR en SUNAT: nada se modifica sin que SUNAT confirme que están ACEPTADAS.
 */
const collectBlockerCandidates = (proDocs, informedDocs) => {
    const keys = new Set(Array.isArray(informedDocs) ? informedDocs : []);
    if (!proDocs) return [...keys];
    for (const [key, el] of proDocs) {
        if (keys.size >= MAX_BLOCKER_CANDIDATES) break;
        if (!key.startsWith('B')) continue;
        if (!['03', '07', '08'].includes(String(el?.document_type_id))) continue;
        const st = String(el?.state_type_id);
        if (!['01', '03'].includes(st)) continue;
        const flagged = el?.regularize_shipping === true || (typeof el?.message_regularize_shipping === 'string' && el.message_regularize_shipping.trim() !== '');
        if (!flagged && st !== '03') continue;
        keys.add(key);
    }
    return [...keys];
};

/**
 * Consulta de validez en SUNAT de un comprobante. Devuelve true solo si SUNAT responde ACEPTADO (estadoCp 1/3).
 * `cache` (Map por clave SERIE-NUM) evita consultar dos veces el mismo comprobante en un mismo rechazo.
 * Lanza error si SUNAT no responde (quien llama no debe cambiar nada en ese caso).
 */
const isAcceptedOnSunat = async (company, date, doc, cache = null) => {
    const key = docKey(doc.serie, doc.numero);
    if (cache && key && cache.has(key)) {
        const c = cache.get(key);
        if (c.error) throw new Error(c.error);
        return c;
    }
    try {
        const sunat = await validateVoucherOnSunat({
            ruc: company.company_number,
            codigoComp: String(doc.type).trim(),
            serie: String(doc.serie).trim(),
            numero: String(doc.numero).trim(),
            fechaEmision: formatDateForSunat(date),
            monto: Number(Number(doc.amount || 0).toFixed(2)),
        });
        const estadoCp = String(sunat?.data?.estadoCp ?? '');
        const res = { accepted: estadoCp === '1' || estadoCp === '3', estadoCp };
        if (cache && key) cache.set(key, res);
        return res;
    } catch (error) {
        if (cache && key) cache.set(key, { error: error.message });
        throw error;
    }
};

/**
 * Para un rechazo 2282 ("documento ya informado"), confirma en SUNAT (consulta de validez) cada comprobante
 * reportado como ya informado que esté en 'Y' en Faqture. Solo si SUNAT responde ACEPTADO (estadoCp 1/3) se pasa a 'E'.
 * Si la consulta SUNAT no está disponible, no se cambia nada.
 */
const confirmInformedDocsOnSunat = async (company, date, effectiveBoletaTypes, informedDocs, sunatCache = null) => {
    let confirmed = 0;
    if (!Array.isArray(informedDocs) || informedDocs.length === 0 || !company?.company_number) return confirmed;
    const yRows = await selectYBoletasForDate(company.tenant, date, effectiveBoletaTypes);
    const wanted = new Set(informedDocs);
    for (const row of yRows) {
        const key = docKey(row.serie, row.numero);
        if (!key || !wanted.has(key)) continue;
        try {
            const { accepted } = await isAcceptedOnSunat(company, date, row, sunatCache);
            if (accepted) {
                const ok = await mergeResponseSend(company.tenant, row, {
                    success: true,
                    state: 'E',
                    state_type_id: '05',
                    state_type_description: 'Aceptado',
                    message: 'Regularizado: SUNAT confirma el comprobante ACEPTADO (reportado como ya informado en un resumen rechazado 2282)',
                    regularized_at: new Date().toISOString(),
                }, 'E');
                if (ok) confirmed++;
            }
        } catch (error) {
            console.warn(`[Summary Reconcile] ${company.tenant} no se pudo confirmar ${key} en SUNAT: ${error.message}`);
        }
    }
    return confirmed;
};

/**
 * Parte 2: regulariza en el PRO las boletas que bloquean el resumen de una fecha (rechazo 2282).
 * Para cada boleta "ya informada" que el PRO sigue mostrando en '01'/'03':
 *   1. Se busca en Faqture (tipo, monto) para poder consultarla en SUNAT.
 *   2. Se consulta su validez en SUNAT. SOLO si SUNAT responde ACEPTADO (estadoCp 1/3) es candidata.
 *   3. Modo 'on': se marca '05' en el PRO (una por una, LIMIT 1) y se verifica releyendo el PRO.
 *      Modo 'report': no se escribe nada; se informa qué se haría.
 * @returns {{ mode: string, regularized: string[], wouldRegularize: string[], skipped: Array<{doc: string, reason: string}> }}
 */
const regularizeBlockersInPro = async (company, date, informedDocs, sunatCache = null, namedDocs = null) => {
    // namedDocs: las que SUNAT nombró en el 2282. Las demás son candidatas extra: si SUNAT no las tiene ACEPTADAS
    // es lo esperado (van en el resumen), así que no se listan como "no regularizadas" en la alerta.
    const named = namedDocs ? new Set(namedDocs) : null;
    const isExtra = (k) => named !== null && !named.has(k);
    const mode = await getProRegularizeMode();
    const out = { mode, regularized: [], wouldRegularize: [], skipped: [] };
    if (mode === 'off' || !Array.isArray(informedDocs) || informedDocs.length === 0) return out;
    if (!isValidTenant(company?.tenant) || !isValidIsoDate(date) || !company?.company_number) return out;

    try {
        const proDocs = await getProDocsByDate(company, date);
        if (!proDocs) {
            informedDocs.forEach(k => out.skipped.push({ doc: k, reason: 'PRO no disponible' }));
            return out;
        }

        // Comprobantes de la fecha en Faqture (cualquier estado) para obtener tipo y monto
        const { rows } = await pool.query(
            `SELECT type, serie, numero, amount
               FROM ${company.tenant}.document
              WHERE TO_CHAR(date::DATE, 'YYYY-MM-DD') = $1
                AND UPPER(TRIM(serie)) LIKE 'B%'`,
            [date]
        );
        const faqtureByKey = new Map();
        for (const r of rows || []) {
            const key = docKey(r.serie, r.numero);
            if (key && !faqtureByKey.has(key)) faqtureByKey.set(key, r);
        }

        const candidates = [];
        for (const key of informedDocs) {
            const el = proDocs.get(key);
            if (!el) { out.skipped.push({ doc: key, reason: 'no aparece en el PRO para esa fecha' }); continue; }
            if (!['01', '03'].includes(String(el.state_type_id))) { out.skipped.push({ doc: key, reason: `ya está en estado ${el.state_type_id} en el PRO` }); continue; }
            const fq = faqtureByKey.get(key);
            if (!fq) { out.skipped.push({ doc: key, reason: 'no se encontró en Faqture para validar en SUNAT' }); continue; }
            try {
                const { accepted, estadoCp } = await isAcceptedOnSunat(company, date, fq, sunatCache);
                if (accepted) {
                    const [series, number] = key.split('-');
                    candidates.push({ key, document_type_id: String(fq.type).trim(), series, number: Number(number) });
                } else if (!isExtra(key)) {
                    out.skipped.push({ doc: key, reason: `SUNAT no la muestra ACEPTADA (estadoCp ${estadoCp || '?'})` });
                }
            } catch (error) {
                out.skipped.push({ doc: key, reason: `no se pudo consultar SUNAT: ${error.message}` });
            }
        }

        if (candidates.length === 0) return out;

        if (mode === 'report') {
            out.wouldRegularize = candidates.map(c => c.key);
            console.log(`[Summary Reconcile] ${company.tenant} ${date} [modo report] se regularizarían en el PRO (05): ${out.wouldRegularize.join(', ')}`);
            return out;
        }

        // mode === 'on'
        const res = await setBoletasAcceptedInPro(company.url, candidates);
        if (!res.success) {
            candidates.forEach(c => out.skipped.push({ doc: c.key, reason: `no se pudo escribir en el PRO: ${res.message}` }));
            return out;
        }
        // Verificación: releer el PRO y confirmar que cada una quedó en '05'
        const after = await getProDocsByDate(company, date);
        for (const c of candidates) {
            const st = after?.get(c.key)?.state_type_id;
            if (String(st) === '05') out.regularized.push(c.key);
            else {
                const r = (res.results || []).find(x => x.key === c.key);
                out.skipped.push({ doc: c.key, reason: `tras el UPDATE el PRO muestra ${st || '?'}${r?.error ? ' (' + r.error + ')' : ''}` });
            }
        }
        console.log(`[Summary Reconcile] ${company.tenant} ${date} regularizadas en el PRO (05, confirmadas en SUNAT): ${out.regularized.join(', ') || 'ninguna'}`);
        return out;
    } catch (error) {
        console.error(`[Summary Reconcile] Error regularizando bloqueantes en el PRO (${date}) en ${company?.tenant}:`, error.message);
        return out;
    }
};

/**
 * Registra un rechazo de resumen en las boletas 'Y' de la fecha (sin cambiar su estado) y notifica una sola vez por ticket.
 * NUNCA marca 'R': un resumen rechazado es un rechazo del LOTE, no de cada boleta (ej. 2282 por una sola boleta ya informada).
 * Marcar 'R' impediría reintentarlas (regla del proyecto) y enviaría alertas falsas.
 */
const recordSummaryRejection = async (company, date, effectiveBoletaTypes, ticket, cls, proReg = null) => {
    try {
        const yRows = await selectYBoletasForDate(company.tenant, date, effectiveBoletaTypes);
        if (yRows.length === 0) return 0;

        const rejectionMessage = String(cls.message || '').slice(0, 500);
        // Con ticket: una alerta por ticket. Sin ticket (rechazo directo del PRO, ej. fuera de plazo): una alerta
        // por mismo código + mensaje, para no repetir el aviso en cada reintento de 24 h.
        const alreadyRecorded = yRows.some(r => {
            const prev = parseJsonField(r.response_send, {})?.summary_rejection;
            if (!prev) return false;
            if (ticket) return prev.ticket === ticket;
            return !prev.ticket && prev.code === cls.code && prev.message === rejectionMessage;
        });

        const rejection = {
            ticket: ticket || null,
            code: cls.code,
            message: rejectionMessage,
            informed_docs: cls.informedDocs || [],
            at: new Date().toISOString(),
        };
        let updated = 0;
        for (const row of yRows) {
            if (await mergeResponseSend(company.tenant, row, { summary_rejection: rejection })) updated++;
        }

        if (!alreadyRecorded) {
            let accion;
            if (cls.code !== '2282') {
                accion = 'Revisar el motivo del rechazo; las boletas siguen pendientes (Y) y la tarea reintentará en 24 h.';
            } else if (proReg && proReg.mode === 'on' && proReg.regularized.length > 0 && proReg.skipped.length === 0) {
                accion = `Regularizadas automáticamente en el PRO: ${proReg.regularized.join(', ')}. La tarea reenvía el resumen de la fecha en este mismo ciclo.`;
            } else if (proReg && proReg.mode === 'on' && proReg.regularized.length > 0) {
                accion = `Regularizadas automáticamente en el PRO: ${proReg.regularized.join(', ')}. Revisar las no regularizadas (abajo); la tarea las volverá a revisar en el próximo ciclo.`;
            } else if (proReg && proReg.mode === 'report' && proReg.wouldRegularize.length > 0) {
                accion = `[Modo report] Regularizar en el PRO (Reportes > Validar documentos > Regularizar): ${proReg.wouldRegularize.join(', ')} (SUNAT las confirma ACEPTADAS). Luego la tarea reenviará el resumen.`;
            } else {
                accion = 'Regularizar en el PRO (Reportes > Validar documentos > Regularizar) los comprobantes ya informados; luego la tarea reenviará el resumen.';
            }
            notifyError({
                type: cls.code === '2282'
                    ? 'Resumen diario bloqueado (2282): comprobante(s) ya informado(s) impiden declarar la fecha'
                    : 'Resumen diario no declarado: SUNAT no aceptó el resumen',
                // Se pasa como texto (no Error) para no adjuntar un stack trace: no es un error del código.
                error: `Respuesta SUNAT: ${rejection.message || 'Rechazo ' + cls.code}`,
                tenant: company.tenant,
                ruc: company.company_number,
                payload: {
                    fecha: date,
                    ticket,
                    codigo: cls.code,
                    respuesta_sunat: rejection.message,
                    ya_informados: cls.informedDocs,
                    boletas_pendientes: yRows.length,
                    regularizacion_pro: proReg ? {
                        modo: proReg.mode,
                        regularizadas: proReg.regularized,
                        se_regularizarian: proReg.wouldRegularize,
                        omitidas: proReg.skipped,
                    } : undefined,
                    accion,
                },
            });

            // Aviso PROPIO por WhatsApp ("Resumen diario bloqueado"), distinto de la alerta de comprobante rechazado:
            // las boletas NO están rechazadas, siguen pendientes por declarar. Se envía a los mismos celulares
            // configurados para rechazados (phone_2..5), por la misma cola anti-spam (60s), sin registrarse como rechazado.
            // Se carga en tiempo de llamada para no crear dependencias circulares al inicio.
            try {
                const { enqueueTextAlert } = require('./rejected_notifier.libs');
                const autoFixed = proReg && proReg.mode === 'on' && proReg.regularized.length > 0 && proReg.skipped.length === 0;
                const blockers = (cls.informedDocs || []).join(', ');
                const lines = [
                    autoFixed
                        ? `🔓 AVISO: RESUMEN DIARIO DESBLOQUEADO AUTOMÁTICAMENTE`
                        : (cls.code === '2282' ? `🔒 AVISO: RESUMEN DIARIO BLOQUEADO` : `🔒 AVISO: RESUMEN DIARIO NO DECLARADO`),
                    `(No es un comprobante rechazado: las boletas siguen pendientes por declarar)`,
                    ``,
                    `🏢 Empresa: ${company.company || company.tenant}  (RUC: ${company.company_number || 'N/A'})`,
                    `📅 Boletas del: ${toDmy(date)}   ⏳ Plazo SUNAT: hasta ${summaryDeadline(date)}`,
                    `📄 Boletas pendientes por declarar: ${yRows.length}`,
                    blockers ? `🔑 Bloqueado por (ya informadas en SUNAT): ${blockers}` : null,
                    ``,
                    `📨 Respuesta SUNAT al resumen:`,
                    String(rejection.message || `Código ${cls.code}`).slice(0, 600),
                    ``,
                    `🔧 ${accion}`,
                ].filter(l => l !== null);
                if (proReg && proReg.skipped && proReg.skipped.length > 0) {
                    lines.push('', '⛔ No regularizadas automáticamente:');
                    proReg.skipped.slice(0, 10).forEach(s => lines.push(`• ${s.doc}: ${s.reason}`));
                }
                enqueueTextAlert({ key: `summary-blocked-${company.tenant}-${date}-${ticket || cls.code}`, text: lines.join('\n') });
            } catch (waErr) {
                console.warn('[Summary Reconcile] No se pudo encolar la alerta de WhatsApp:', waErr.message);
            }
        }
        return updated;
    } catch (error) {
        console.error(`[Summary Reconcile] Error registrando rechazo de resumen ${date} en ${company?.tenant}:`, error.message);
        return 0;
    }
};

/**
 * Decide si NO se debe reenviar un resumen para la fecha (evita el ciclo de rechazos idénticos cada 8 horas).
 *  - Si hay un ticket de esa fecha aún en proceso (consultado en esta misma corrida), se espera.
 *  - Si el último rechazo fue 2282 y alguno de los comprobantes ya informados sigue en '01'/'03' en el PRO,
 *    el PRO lo volvería a incluir y SUNAT rechazaría otra vez: se omite hasta que se regularice.
 *  - Si el último rechazo fue por otro motivo, se espera 24 horas antes de reintentar.
 */
const shouldSkipResend = async (company, date, effectiveBoletaTypes, pendingTicketDates) => {
    if (pendingTicketDates && pendingTicketDates.has(date)) {
        return { skip: true, reason: 'ticket de resumen aún en proceso en SUNAT' };
    }
    const yRows = await selectYBoletasForDate(company.tenant, date, effectiveBoletaTypes);
    let last = null;
    for (const r of yRows) {
        const rej = parseJsonField(r.response_send, {})?.summary_rejection;
        if (rej && (!last || String(rej.at) > String(last.at))) last = rej;
    }
    if (!last) return { skip: false };

    if (last.code === '2282' && Array.isArray(last.informed_docs) && last.informed_docs.length > 0) {
        const proDocs = await getProDocsByDate(company, date);
        if (!proDocs) return { skip: true, reason: 'PRO no disponible para comprobar bloqueantes 2282' };
        let stillBlocking = last.informed_docs.filter(k => {
            const el = proDocs.get(k);
            return el && ['01', '03'].includes(String(el.state_type_id));
        });
        // Parte 2 (modo 'on'): reintentar la regularización si quedó pendiente (ej. el túnel al PRO falló antes).
        if (stillBlocking.length > 0 && (await getProRegularizeMode()) === 'on') {
            const retry = await regularizeBlockersInPro(company, date, stillBlocking);
            stillBlocking = stillBlocking.filter(k => !retry.regularized.includes(k));
        }
        if (stillBlocking.length > 0) {
            return { skip: true, reason: `bloqueada por comprobantes ya informados sin regularizar en el PRO: ${stillBlocking.join(', ')}` };
        }
        return { skip: false };
    }

    const ageMs = Date.now() - new Date(last.at).getTime();
    if (!Number.isNaN(ageMs) && ageMs < 24 * 60 * 60 * 1000) {
        return { skip: true, reason: `último resumen rechazado (código ${last.code || '?'}) hace menos de 24 h` };
    }
    return { skip: false };
};

/**
 * Procesa el resultado (ya clasificado) de la consulta de un ticket de resumen.
 * @returns {{ regularized: number }}
 */
const applySummaryStatus = async (company, date, effectiveBoletaTypes, ticket, cls) => {
    if (cls.status === 'accepted') {
        const r = await reconcileDateWithPro(company, date, effectiveBoletaTypes, { ticket, reason: `resumen ${ticket} aceptado` });
        console.log(`[Summary Reconcile] ${company.tenant} ticket ${ticket} (${date}) ACEPTADO. ${r.regularized} boletas regularizadas a 'E' según el PRO; ${r.remaining ?? '?'} siguen en 'Y'.`);
        return { regularized: r.regularized };
    }
    if (cls.status === 'rejected') {
        let confirmed = 0;
        let proReg = null;
        let recordCls = cls;
        if (cls.code === '2282') {
            // SUNAT nombra solo una boleta por rechazo: se revisan también las demás sospechosas de la fecha
            // (en el PRO "Por regularizar"), para resolver la fecha en un solo ciclo y no una boleta cada 8 h.
            const proDocs = await getProDocsByDate(company, date);
            const candidates = collectBlockerCandidates(proDocs, cls.informedDocs);
            const sunatCache = new Map();
            confirmed = await confirmInformedDocsOnSunat(company, date, effectiveBoletaTypes, candidates, sunatCache);
            // Parte 2: sacar del resumen las boletas que SUNAT ya tiene (marcarlas '05' en el PRO), según el modo configurado.
            proReg = await regularizeBlockersInPro(company, date, candidates, sunatCache, cls.informedDocs);
            // Bloqueantes = las que nombró SUNAT + las que SUNAT confirmó ACEPTADAS. Se guardan para no reenviar el
            // resumen hasta que TODAS estén regularizadas en el PRO (si no, el PRO las incluiría y vendría otro 2282).
            const acceptedExtras = candidates.filter(k => sunatCache.get(k)?.accepted === true);
            const blockers = [...new Set([...(cls.informedDocs || []), ...acceptedExtras])];
            recordCls = { ...cls, informedDocs: blockers };
            if (candidates.length > (cls.informedDocs || []).length) {
                console.log(`[Summary Reconcile] ${company.tenant} ${date}: 2282 nombra ${(cls.informedDocs || []).join(', ')}; revisadas ${candidates.length} sospechosas, ${blockers.length} bloqueantes confirmadas.`);
            }
        }
        await recordSummaryRejection(company, date, effectiveBoletaTypes, ticket, recordCls, proReg);
        console.warn(`[Summary Reconcile] ${company.tenant} ticket ${ticket} (${date}) RECHAZADO (código ${cls.code}). ${confirmed} ya informadas confirmadas en SUNAT y pasadas a 'E'. El resto sigue en 'Y' (no se marca 'R').`);
        return { regularized: confirmed };
    }
    console.log(`[Summary Reconcile] ${company.tenant} ticket ${ticket} (${date}) sin resultado definitivo (${cls.status}${cls.code ? ', código ' + cls.code : ''}): ${String(cls.message).slice(0, 160)}`);
    return { regularized: 0 };
};

module.exports = {
    isValidTenant,
    docKey,
    classifySummaryStatus,
    getProDocsByDate,
    selectYBoletasForDate,
    reconcileDateWithPro,
    collectBlockerCandidates,
    confirmInformedDocsOnSunat,
    regularizeBlockersInPro,
    getProRegularizeMode,
    recordSummaryRejection,
    shouldSkipResend,
    applySummaryStatus,
};
