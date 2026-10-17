/**
 * Helpers de deserialización para columnas jsonb de `${tenant}.document`
 * (json_format, response_send, response_anulate).
 *
 * Contexto: antes del PR #28 `response_send` se guardaba doblemente serializado
 * (JSON.stringify(JSON.stringify(data))), por lo que jsonb almacenaba un *string*
 * y `pg` devolvía un string. Desde el PR #28 se guarda una sola vez, jsonb almacena
 * un *objeto* y `pg` devuelve un objeto nativo. Conviven ambos formatos en BD, y
 * `JSON.parse(objeto)` lanza `SyntaxError: "[object Object]" is not valid JSON`.
 */

/**
 * Deserializa aceptando objeto nativo, string JSON o string doblemente serializado.
 * LANZA SyntaxError si recibe un string que no es JSON válido (para preservar los
 * flujos que ya manejan el error en un try/catch).
 */
const parseJsonStrict = (value) => {
    let out = value;
    if (typeof out === 'string') {
        out = JSON.parse(out);
        // Legado: doble serialización (jsonb con string escalar)
        if (typeof out === 'string') {
            try { out = JSON.parse(out); } catch (_) { /* texto plano: se devuelve tal cual */ }
        }
    }
    return out;
};

/**
 * Variante tolerante: nunca lanza. Devuelve `fallback` si el valor es vacío,
 * nulo o no es JSON válido.
 */
const parseJsonField = (value, fallback = null) => {
    if (value === null || value === undefined || value === '') return fallback;
    try {
        const out = parseJsonStrict(value);
        return (out === null || out === undefined) ? fallback : out;
    } catch (_) {
        return fallback;
    }
};

module.exports = { parseJsonStrict, parseJsonField };
