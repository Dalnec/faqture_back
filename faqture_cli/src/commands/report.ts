import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

// Importamos la lógica central desde report.libs
const { 
  getAuditReportData, 
  formatWhatsAppReport, 
  sendWhatsAppAuditReport, 
  getWhatsAppRecipientPhone 
} = require('../../../src/libs/report.libs');

export const reportCommand = new Command('report')
  .description('Genera el reporte de auditoría y diagnóstico del sistema (Certificados, Rechazados, Pendientes, Guías, etc.)')
  .option('-t, --tenant <tenant>', 'Filtrar por una empresa específica (RUC o nombre)')
  .option('-w, --whatsapp [phone]', 'Enviar el reporte por WhatsApp (al teléfono indicado o al configurado en BD/.env)')
  .option('-m, --markdown', 'Exportar el reporte completo a un archivo Markdown')
  .option('-a, --all', 'Mostrar todas las empresas en consola, no solo las que tienen alertas')
  .option('-j, --json', 'Devuelve la salida en formato JSON puro (para pipes o scripts)')
  .action(async (options) => {
    try {
      console.log('Analizando estado de empresas y comprobantes...');
      const startTime = Date.now();
      
      const auditData = await getAuditReportData({
        tenant: options.tenant || null
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      // 1. Salida JSON pura
      if (options.json) {
        console.log(JSON.stringify(auditData, null, 2));
        process.exit(0);
      }

      // 2. Resumen ejecutivo en consola
      console.log(`\n========================================================`);
      console.log(`REPORTE DE AUDITORÍA Y DIAGNÓSTICO - FAQTURE`);
      console.log(`Fecha/Hora: ${auditData.timestamp} | Duración: ${elapsed}s`);
      console.log(`========================================================\n`);

      console.log('RESUMEN EJECUTIVO:');
      console.table({
        'Empresas Analizadas': auditData.totals.totalCompanies,
        'Empresas con Incidencias': auditData.totals.companiesWithIssues,
        'Comprobantes Rechazados (R)': auditData.totals.totalRejected,
        'Por Declarar Fechas Anteriores': auditData.totals.totalPendingPast,
        'Guías Pendientes de Declarar': auditData.totals.totalGuiasPending,
        'Pendientes de Anular (P/C)': auditData.totals.totalPendingAnular,
        'Empresas con Error Certificado/CDR': auditData.totals.companiesWithCertError
      });

      const companiesToShow = options.all ? auditData.all : auditData.alerts;

      if (companiesToShow.length === 0) {
        console.log('\nExcelente. No se encontraron anomalías en las empresas evaluadas.');
      } else {
        console.log(`\nDetalle de Empresas ${options.all ? 'Registradas' : 'con Alertas'} (${companiesToShow.length}):\n`);
        
        const tableData = companiesToShow.map((c: any) => ({
          'Empresa': c.company ? c.company.substring(0, 28) : c.tenant,
          'RUC/Tenant': c.company_number || c.tenant,
          'Cert/CDR': c.hasCertError ? 'ERROR' : 'OK',
          'Rechazados': c.rejected,
          'Por Declarar': c.pendingPast,
          'Guías Pend.': c.pendingGuias,
          'Pend. Anular': c.pendingAnular,
          'Último CPE': c.lastDoc ? `${c.lastDoc.type}-${c.lastDoc.serie}-${c.lastDoc.numero}` : 'N/A',
          'Fecha Emisión': c.lastDoc ? c.lastDoc.dateFormatted : 'N/A',
          'Hora Recepción': c.lastDoc ? c.lastDoc.createdFormatted : 'N/A'
        }));

        console.table(tableData);
      }

      // 3. Exportar a Markdown si se solicitó
      if (options.markdown) {
        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) {
          fs.mkdirSync(reportsDir, { recursive: true });
        }
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `audit-report-${options.tenant || 'global'}-${dateStr}.md`;
        const filepath = path.join(reportsDir, filename);

        let md = `# Reporte de Auditoría y Diagnóstico - Faqture\n\n`;
        md += `* **Fecha de generación:** ${auditData.timestamp}\n`;
        md += `* **Filtro:** ${options.tenant || 'Todas las empresas'}\n\n`;

        md += `## Resumen General\n\n`;
        md += `| Métrica | Valor |\n`;
        md += `| :--- | :---: |\n`;
        md += `| Total Empresas Analizadas | ${auditData.totals.totalCompanies} |\n`;
        md += `| Empresas con Incidencias | ${auditData.totals.companiesWithIssues} |\n`;
        md += `| Comprobantes Rechazados | ${auditData.totals.totalRejected} |\n`;
        md += `| Comprobantes por Declarar de Fechas Anteriores | ${auditData.totals.totalPendingPast} |\n`;
        md += `| Guías Pendientes de Declarar | ${auditData.totals.totalGuiasPending} |\n`;
        md += `| Comprobantes Pendientes de Anular | ${auditData.totals.totalPendingAnular} |\n`;
        md += `| Empresas con Error de Certificado / CDR | ${auditData.totals.companiesWithCertError} |\n\n`;

        md += `## Detalle de Empresas con Incidencias\n\n`;
        md += `| Empresa | RUC/Tenant | Cert/CDR | Rechazados | Por Declarar | Guías | Pend. Anular | Último Comprobante | Emisión | Recepción |\n`;
        md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :---: |\n`;

        companiesToShow.forEach((c: any) => {
          const lastCpe = c.lastDoc ? `${c.lastDoc.type}-${c.lastDoc.serie}-${c.lastDoc.numero}` : 'N/A';
          const emision = c.lastDoc ? c.lastDoc.dateFormatted : 'N/A';
          const recepcion = c.lastDoc ? c.lastDoc.createdFormatted : 'N/A';
          md += `| ${c.company} | ${c.company_number || c.tenant} | ${c.hasCertError ? 'ERROR' : 'OK'} | ${c.rejected} | ${c.pendingPast} | ${c.pendingGuias} | ${c.pendingAnular} | ${lastCpe} | ${emision} | ${recepcion} |\n`;
        });

        fs.writeFileSync(filepath, md, 'utf-8');
        console.log(`\nReporte Markdown guardado exitosamente en: ${filepath}`);
      }

      // 4. Enviar a WhatsApp si se solicitó la opción
      if (options.whatsapp) {
        const targetPhone = typeof options.whatsapp === 'string' ? options.whatsapp : null;
        console.log(`\nEnviando reporte a WhatsApp...`);
        const sendResult = await sendWhatsAppAuditReport({
          phone: targetPhone,
          tenant: options.tenant || null
        });
        console.log(`Reporte enviado con éxito a ${sendResult.phone} (${sendResult.partsSent} mensaje(s))`);
      }

      process.exit(0);
    } catch (error: any) {
      console.error('\nError al generar reporte de auditoría:', error.message);
      process.exit(1);
    }
  });
