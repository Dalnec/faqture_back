-- Migración: Agregar columnas description y doc_types a la tabla public.tasks
-- Permite describir y configurar qué tipos de comprobantes procesa cada tarea programada

ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS doc_types JSONB DEFAULT '["01", "03", "07", "08"]'::jsonb;

-- Asignar descripciones y tipos por defecto
UPDATE public.tasks SET description = 'Envío automático de comprobantes nuevos o modificados a SUNAT / PRO' WHERE id_task = 1 AND description IS NULL;
UPDATE public.tasks SET description = 'Comunicación de baja y anulación de comprobantes pendientes en SUNAT' WHERE id_task = 2 AND description IS NULL;
UPDATE public.tasks SET description = 'Consulta de estado de tickets de resúmenes diarios y anulaciones' WHERE id_task = 3 AND description IS NULL;
UPDATE public.tasks SET description = 'Respaldo automático de la base de datos a Google Drive y almacenamiento local' WHERE id_task = 4 AND description IS NULL;
UPDATE public.tasks SET description = 'Verificación y regularización de documentos emitidos' WHERE id_task = 5 AND description IS NULL;
UPDATE public.tasks SET description = 'Verificación de estado de pago de suscripciones de empresas' WHERE id_task = 6 AND description IS NULL;
UPDATE public.tasks SET description = 'Verificación y regularización automática de comprobantes con error (X, M, S, Z)' WHERE id_task = 7 AND description IS NULL;

UPDATE public.tasks 
SET doc_types = '["01", "03", "07", "08"]'::jsonb 
WHERE doc_types IS NULL;
