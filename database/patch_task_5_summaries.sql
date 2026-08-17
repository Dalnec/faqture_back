-- Migración: Actualizar Tarea 5 para Resúmenes Diarios de Boletas y Reenvío de Facturas
UPDATE public.tasks 
SET name = 'Generar Resúmenes de Boletas',
    description = 'Generación y envío automático de resúmenes diarios de boletas y reenvío de facturas pendientes a SUNAT / PRO',
    time = '0 */2 * * *',
    doc_types = '["03", "07", "08"]'::jsonb,
    modified = NOW()
WHERE id_task = 5;
