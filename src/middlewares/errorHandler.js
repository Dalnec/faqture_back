const { notifyError } = require('../libs/logger');

/**
 * Middleware global de errores Express (4 parámetros).
 * Captura cualquier error propagado con next(err) en los controladores.
 */
const errorHandler = async (err, req, res, next) => {
    const endpoint = `${req.method} ${req.originalUrl}`;
    const tenant   = req.params?.tenant || req.body?.tenant || undefined;

    await notifyError({
        type:     'HTTP 500 - Error no controlado',
        error:    err,
        tenant,
        endpoint,
        payload:  req.body,
    });

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        status:  'error',
        message: err.message || 'Error interno del servidor',
    });
};

module.exports = { errorHandler };
