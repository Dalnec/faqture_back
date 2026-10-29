const pool = require('../db');
const { parseJsonField } = require('./json.libs');

const RESTORABLE_STATES = ['P', 'C', 'Z'];

/**
 * Al registrarse su Nota de Crédito en el PRO, el comprobante original se marca como ANULADO (A) y en su `response_anulate`
 * queda `anulado_por_nc: true` junto con la NC (`nc_serie`, `nc_numero`) y su estado previo (`previous_state`).
 *
 * Si esa NC termina RECHAZADA (R) por SUNAT, el comprobante original sigue siendo válido: sin NC vigente no debe quedar anulado.
 * Esta función lo devuelve a su estado anterior (P, C o Z) para que vuelva a aparecer en el generador de NC.
 *
 * Nunca lanza: devuelve la cantidad de comprobantes restaurados (0 ante cualquier error).
 */
const revertOriginalsOfRejectedCreditNotes = async (tenant) => {
    try {
        if (!tenant || !/^[a-zA-Z0-9_]+$/.test(tenant)) return 0;

        const { rows } = await pool.query(
            `SELECT id_document, response_anulate
             FROM ${tenant}.document
             WHERE states = 'A'
               AND type IN ('01', '03')
               AND response_anulate IS NOT NULL
               AND response_anulate::text ~ '"anulado_por_nc"\\s*:\\s*true'`
        );

        let reverted = 0;
        for (const row of rows) {
            const info = parseJsonField(row.response_anulate, {});
            if (!info?.anulado_por_nc || !info.nc_serie || !info.nc_numero) continue;

            const nc = await pool.query(
                `SELECT states FROM ${tenant}.document WHERE type = '07' AND serie = $1 AND numero = $2 LIMIT 1`,
                [String(info.nc_serie), parseInt(info.nc_numero, 10)]
            );
            if (nc.rows[0]?.states !== 'R') continue;

            const previousState = RESTORABLE_STATES.includes(info.previous_state) ? info.previous_state : 'P';
            const payload = {
                ...info,
                success: false,
                anulado_por_nc: false,
                nc_pending: false,
                nc_state: 'R',
                reverted_at: new Date().toISOString(),
                message: `La Nota de Crédito ${info.nc_number || `${info.nc_serie}-${info.nc_numero}`} fue RECHAZADA por SUNAT; el comprobante vuelve a ${previousState}.`
            };
            const upd = await pool.query(
                `UPDATE ${tenant}.document SET states = $1, response_anulate = $2::jsonb, modified = NOW() WHERE id_document = $3 AND states = 'A'`,
                [previousState, JSON.stringify(payload), row.id_document]
            );
            reverted += upd.rowCount;
        }
        return reverted;
    } catch (error) {
        console.error('[creditNotes.libs] Error revirtiendo comprobantes de NC rechazadas:', error.message);
        return 0;
    }
};

module.exports = { revertOriginalsOfRejectedCreditNotes };
