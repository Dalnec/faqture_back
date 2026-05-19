const pool = require('../db')

const CRON_AUTH_FAILURE_THRESHOLD = parseInt(process.env.CRON_AUTH_FAILURE_THRESHOLD) || 3;

const selectApiCompanyById = async (id) => {
    try {
        if (!id) { return false; }

        const company = await pool.query(
            `SELECT url, token, tenant, autosend, token_series, external_api,
                    company_number, company, state, address, cron_enabled, cron_failure_count
             FROM public.company WHERE state=true AND id_company = $1`,
            [id]
        );
        if (!company.rowCount) { return false; }
        return { ...company.rows[0] }

    } catch (error) {
        return false;
    }
}

const selectApiCompanyByTenant = async (tenant) => {
    try {
        if (!tenant) { return false; }

        const company = await pool.query(
            `SELECT url, token, tenant, autosend FROM public.company WHERE state=true AND tenant = $1`,
            [tenant]
        );
        if (!company.rowCount) { return false; }

        return company.rows[0]

    } catch (error) {
        return false;
    }
}

/**
 * Retorna solo empresas activas (state=true) Y habilitadas para el cron (cron_enabled=true).
 * Empresas con cron_enabled=false siguen recepcionando documentos normalmente
 * pero son excluidas de los envíos masivos por tareas programadas.
 */
const selectAllApiCompany = async () => {
    try {
        const company = await pool.query(
            `SELECT id_company, company_number, company, url, token, tenant,
                    autosend, localtoken, state, cron_enabled, cron_failure_count
             FROM public.company
             WHERE state=true AND cron_enabled=true
             ORDER BY company ASC`
        );
        if (!company.rowCount) { return []; }
        return company.rows

    } catch (error) {
        return [];
    }
}

const getCompanyByNumber = async (ruc) => {
    try {
        const company = await pool.query('SELECT * FROM public.company WHERE company_number = $1', [ruc]);
        if (!company.rowCount) { return false; }
        return company.rows[0]
    } catch (error) {
        return false;
    }

};

const getCompanyByTenant = async (tenant) => {
    try {
        const company = await pool.query('SELECT * FROM public.company WHERE tenant = $1', [tenant]);
        if (!company.rowCount) { return false; }
        return company.rows[0]
    } catch (error) {
        return false;
    }

};

/**
 * Incrementa el contador de fallos de autenticación del cron para una empresa.
 * Si alcanza el umbral (CRON_AUTH_FAILURE_THRESHOLD), desactiva cron_enabled automáticamente.
 * Retorna { disabled: true } si se desactivó la empresa, { disabled: false } si solo se incrementó.
 */
const incrementCronAuthFailure = async (id_company, tenant) => {
    try {
        const result = await pool.query(
            `UPDATE public.company
             SET cron_failure_count = cron_failure_count + 1,
                 modified = NOW()
             WHERE id_company = $1
             RETURNING cron_failure_count`,
            [id_company]
        );
        const newCount = result.rows[0]?.cron_failure_count ?? 0;

        if (newCount >= CRON_AUTH_FAILURE_THRESHOLD) {
            await pool.query(
                `UPDATE public.company
                 SET cron_enabled = false, modified = NOW()
                 WHERE id_company = $1`,
                [id_company]
            );
            return { disabled: true, count: newCount };
        }
        return { disabled: false, count: newCount };
    } catch (error) {
        return { disabled: false, count: 0 };
    }
};

/**
 * Resetea el contador de fallos de autenticación al éxito.
 * Se debe llamar cuando una empresa envía documentos exitosamente.
 */
const resetCronAuthFailure = async (id_company) => {
    try {
        await pool.query(
            `UPDATE public.company
             SET cron_failure_count = 0, modified = NOW()
             WHERE id_company = $1 AND cron_failure_count > 0`,
            [id_company]
        );
    } catch (error) {
        // no crítico, no interrumpir el flujo
    }
};

module.exports = {
    selectApiCompanyById,
    selectAllApiCompany,
    getCompanyByNumber,
    selectApiCompanyByTenant,
    getCompanyByTenant,
    incrementCronAuthFailure,
    resetCronAuthFailure,
    CRON_AUTH_FAILURE_THRESHOLD,
};