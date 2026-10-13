const assert = require('assert');

// Mockear cualquier módulo que no sea built-in ni relativo local
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (moduleName) {
    if (moduleName.includes('logger')) {
        return { notifyError: () => {}, logger: {} };
    }
    if (moduleName === 'winston') {
        return {
            format: { combine: () => {}, timestamp: () => {}, printf: () => {}, errors: () => {} },
            createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
            transports: { DailyRotateFile: function () {} },
        };
    }
    if (!moduleName.startsWith('.') && !moduleName.startsWith('/') && !['assert', 'events', 'path', 'fs', 'http', 'https', 'url', 'util', 'stream', 'crypto', 'os'].includes(moduleName)) {
        if (moduleName === 'dotenv') return { config: () => {} };
        return {};
    }
    if (moduleName === '../db' || moduleName === './db') {
        return { query: async () => ({ rows: [], rowCount: 0 }) };
    }
    return originalRequire.apply(this, arguments);
};

const { isGatewayFailure, recoverExistingDocumentFromPro } = require('../src/libs/document.libs');

console.log('🧪 Iniciando pruebas exhaustivas de la solución Bad Gateway...\n');

// ----------------------------------------------------
// BLOQUE 1: DETECCIÓN DE GATEWAY FAILURE
// ----------------------------------------------------
console.log('--- BLOQUE 1: isGatewayFailure ---');
const photo1Response = {
    success: true,
    data: { number: 'BX01-437', state_type_id: '01' },
    links: { xml: 'url', pdf: 'url' },
    response: { code: 'HTTP', description: 'Bad Gateway' },
};
assert.strictEqual(isGatewayFailure(photo1Response), true);
assert.strictEqual(isGatewayFailure({ response: { description: '504 gateway timeout' } }), true);
assert.strictEqual(isGatewayFailure({ response: { code: 'HTTP', description: 'curl error 28' } }), true);
assert.strictEqual(isGatewayFailure({ response: { description: 'Connection refused' } }), true);
assert.strictEqual(isGatewayFailure({ success: true, response: { code: '0', description: 'Aceptado' } }), false);
assert.strictEqual(isGatewayFailure(null), false);
assert.strictEqual(isGatewayFailure({}), false);
console.log('✅ Bloque 1 superado (7/7 casos de gateway failure probados).\n');

// ----------------------------------------------------
// BLOQUE 2: RECUPERACIÓN Y MATCHING DE COMPROBANTES EN EL PRO
// ----------------------------------------------------
console.log('--- BLOQUE 2: recoverExistingDocumentFromPro (Matching y Casos Borde) ---');

async function testRecovery() {
    const mockCompany = {
        url: 'https://demo.pro.pe',
        token: 'secret_token',
    };

    const mockProListResponse = {
        data: [
            {
                number: 'BX01-437',
                filename: '20611571829-03-BX01-437',
                external_id: 'uuid-1234',
                state_type_id: '05',
                state_type_description: 'Aceptado',
                download_xml: 'https://pro.pe/xml/437',
                download_pdf: 'https://pro.pe/pdf/437',
                download_cdr: 'https://pro.pe/cdr/437',
                has_cdr: true,
            },
            {
                number: 'F001-00000088',
                filename: '20611571829-01-F001-88',
                external_id: 'uuid-5678',
                state_type_id: '01',
                state_type_description: 'Registrado',
                download_xml: 'https://pro.pe/xml/88',
                download_pdf: 'https://pro.pe/pdf/88',
                download_cdr: null,
            },
        ],
    };

    // Subcaso A: Documento BX01-437 con padding o minúsculas
    const docA = {
        serie: 'bx01',
        numero: 437,
        date: '2026-10-10',
        states: 'E',
    };
    const resA = await recoverExistingDocumentFromPro(mockCompany, docA, mockProListResponse);
    assert.ok(resA, 'Debe encontrar el comprobante BX01-437');
    assert.strictEqual(resA.state, 'E', 'Debe estar en estado E porque tiene state_type_id 05');
    assert.strictEqual(resA.links.xml, 'https://pro.pe/xml/437');
    assert.strictEqual(resA.links.cdr, 'https://pro.pe/cdr/437');
    console.log('✅ Subcaso 2.A: Matching exitoso con minúsculas y links CDR asignados.');

    // Subcaso B: Documento con padding de ceros en PRO (F001-00000088 vs numero 88)
    const docB = {
        serie: 'F001',
        numero: '88',
        date: '2026-10-09 23:59:59', // Fecha con hora
        states: 'E',
    };
    const resB = await recoverExistingDocumentFromPro(mockCompany, docB, mockProListResponse);
    assert.ok(resB, 'Debe encontrar F001-88 incluso con padding de ceros');
    assert.strictEqual(resB.state, 'Y', 'Debe estar en Y porque en el PRO está 01 (Registrado sin CDR)');
    console.log('✅ Subcaso 2.B: Matching con ceros a la izquierda y fecha con hora. Estado Y asignado correctamente.');

    // Subcaso C: Preservar estado 'P' si el documento en Faqture estaba por anularse
    const docC = {
        serie: 'BX01',
        numero: '437',
        date: '2026-10-10',
        states: 'P', // Marcado como por anular
    };
    const resC = await recoverExistingDocumentFromPro(mockCompany, docC, mockProListResponse);
    assert.strictEqual(resC.state, 'P', 'Debe preservar el estado P si en Faqture estaba por anularse');
    console.log('✅ Subcaso 2.C: Preservación de estado P (Por anular) respetada.');

    // Subcaso D: Comprobante no existente en el PRO (no debe romper ni inventar datos)
    const docD = {
        serie: 'B999',
        numero: '9999',
        date: '2026-10-10',
        states: 'X',
    };
    const resD = await recoverExistingDocumentFromPro(mockCompany, docD, mockProListResponse);
    assert.strictEqual(resD, null, 'Comprobante inexistente debe retornar null de forma segura sin tocar la BD');
    console.log('✅ Subcaso 2.D: Comprobante inexistente retorna null de forma segura.');

    // Subcaso E: Fecha inválida o dañada (no debe lanzar excepción)
    const docE = {
        serie: 'BX01',
        numero: '437',
        date: 'FECHA_CORRUPTA',
        states: 'E',
    };
    const resE = await recoverExistingDocumentFromPro(mockCompany, docE, mockProListResponse);
    // Debe manejarse sin crash
    console.log('✅ Subcaso 2.E: Manejo a prueba de fallos ante fechas corruptas.');
}

testRecovery().then(() => {
    console.log('\n🎉 ¡TODAS LAS PRUEBAS EXHAUSTIVAS DE COBERTURA PASARON EXITOSAMENTE!');
}).catch(err => {
    console.error('❌ Error en prueba:', err);
    process.exit(1);
});
