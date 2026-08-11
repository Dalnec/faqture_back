const { verifyCompanyPayments } = require('./src/libs/company.libs.js');

console.log("Simulando la ejecución del cron (00:01 AM)...");
verifyCompanyPayments()
    .then(() => {
        console.log("✅ Cron nocturno ejecutado exitosamente. Las empresas morosas han sido castigadas.");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Error al ejecutar el cron:", error);
        process.exit(1);
    });
