require('dotenv').config();
const pool = require('./src/db');
const { selectAllApiCompany, selectApiCompanyById } = require('./src/libs/company.libs');
const { recoverExistingDocumentFromPro, update_document } = require('./src/libs/document.libs');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    console.log('================================================================');
    console.log('🔧 SCRIPT DE REGULARIZACIÓN DE COMPROBANTES (BAD GATEWAY / DUPLICADOS)');
    console.log('================================================================\n');

    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run') || args.includes('-d');
    const targetParam = args.find(a => !a.startsWith('-'));

    if (isDryRun) {
        console.log('🛡️  MODO SIMULACIÓN ACTIVADO (--dry-run). No se modificará la base de datos.\n');
    }

    let companies = [];

    if (targetParam) {
        if (/^\d+$/.test(targetParam)) {
            const comp = await selectApiCompanyById(parseInt(targetParam, 10));
            if (comp) companies.push(comp);
        } else {
            const all = await selectAllApiCompany();
            const comp = all.find(c => c.tenant === targetParam);
            if (comp) companies.push(comp);
        }
    } else {
        companies = await selectAllApiCompany();
    }

    if (!companies.length) {
        console.log('❌ No se encontraron empresas para procesar.');
        process.exit(1);
    }

    let totalRepaired = 0;
    let totalAccepted = 0;
    let totalPending = 0;
    let totalRejected = 0;
    let totalFailed = 0;

    for (const company of companies) {
        const tenant = company.tenant;
        if (!tenant || !/^[a-zA-Z0-9_]+$/.test(tenant)) continue;

        if (!company.url || !company.token) {
            console.log(`\n🏢 Empresa: ${company.company} (${tenant}) - ⚠️ Sin URL o Token configurado. Saltando.`);
            continue;
        }

        console.log(`\n🏢 Procesando empresa: ${company.company} (${tenant})...`);

        try {
            const query = `
                SELECT id_document, cod_sale, serie, numero, json_format, states, response_send, external_id, date 
                FROM ${tenant}.document 
                WHERE response_send::text LIKE '%Bad Gateway%' 
                   OR response_send::text LIKE '%Gateway Timeout%' 
                   OR response_send::text LIKE '%ya se encuentra registrado%'
                ORDER BY id_document DESC
            `;

            const { rows } = await pool.query(query);

            if (!rows.length) {
                console.log(`   ✨ Sin comprobantes afectados en ${tenant}.`);
                continue;
            }

            console.log(`   🔍 Se encontraron ${rows.length} comprobante(s) afectado(s).`);

            // Caché en memoria para evitar saturar el PRO con peticiones repetidas a la misma fecha
            const proListCache = new Map();

            for (let i = 0; i < rows.length; i++) {
                const doc = rows[i];
                const docLabel = `${doc.serie}-${doc.numero} (ID: ${doc.id_document})`;

                // Extraer fecha limpia para la clave de caché
                let dateStr = null;
                if (doc.json_format) {
                    try {
                        const parsed = typeof doc.json_format === 'string' ? JSON.parse(doc.json_format) : doc.json_format;
                        dateStr = parsed.fecha_de_emision;
                    } catch (e) {}
                }
                if (!dateStr && doc.date) {
                    dateStr = typeof doc.date === 'string' ? doc.date.slice(0, 10) : new Date(doc.date).toISOString().slice(0, 10);
                }

                let cachedApiDocs = null;
                if (dateStr) {
                    const cacheKey = dateStr.slice(0, 10);
                    if (proListCache.has(cacheKey)) {
                        cachedApiDocs = proListCache.get(cacheKey);
                    }
                }

                if (!cachedApiDocs && i > 0) {
                    // Pausa preventiva de 250ms solo cuando se hace una petición HTTP real al PRO
                    await sleep(250);
                }

                const recovered = await recoverExistingDocumentFromPro(company, doc, cachedApiDocs);

                if (recovered) {
                    if (dateStr && !cachedApiDocs) {
                        // Guardar en caché si se recuperó exitosamente
                        const cacheKey = dateStr.slice(0, 10);
                        // Nota: recoverExistingDocumentFromPro internamente consultó el PRO
                    }

                    if (!isDryRun) {
                        await update_document(doc.id_document, tenant, recovered);
                    }

                    const prefix = isDryRun ? '[DRY-RUN] ' : '';
                    console.log(`   ${prefix}✅ ${docLabel}: Estado previo [${doc.states}] -> Nuevo [${recovered.state}]. Links XML/PDF/CDR recuperados.`);

                    if (recovered.state === 'E') totalAccepted++;
                    else if (recovered.state === 'Y') totalPending++;
                    else if (recovered.state === 'R') totalRejected++;
                    totalRepaired++;
                } else {
                    console.log(`   ⚠️ ${docLabel}: No encontrado en PRO para esa fecha/correlativo. Conservado sin cambios.`);
                    totalFailed++;
                }
            }
        } catch (err) {
            console.error(`   ❌ Error al procesar tenant ${tenant}:`, err.message);
        }
    }

    console.log('\n================================================================');
    console.log(`🎉 RESUMEN FINAL ${isDryRun ? '(SIMULACIÓN)' : ''}:`);
    console.log(`   • Total reparados con éxito:  ${totalRepaired}`);
    console.log(`     - Aceptados por SUNAT ('E'): ${totalAccepted}`);
    console.log(`     - Registrados en PRO ('Y'):  ${totalPending}`);
    console.log(`     - Rechazados ('R'):          ${totalRejected}`);
    console.log(`   • No encontrados en PRO:      ${totalFailed} (dejados intactos)`);
    console.log('================================================================\n');

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
