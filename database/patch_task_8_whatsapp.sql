-- ----------------------------------------------------------------------------
-- MIGRACIÓN: TAREA 8 (REPORTE DE AUDITORÍA WHATSAPP) Y CONFIGURACIÓN ZENDY/WEB
-- ----------------------------------------------------------------------------
-- Este script aplica los cambios de base de datos necesarios para:
-- 1. Soporte de URL web de acceso directo por empresa en public.company (web_url)
-- 2. Registro de la Tarea Programada 8 en public.tasks ("Reporte de Auditoría WhatsApp")
-- 3. Parámetros de configuración en public.settings para el Gateway de WhatsApp (Zendy)

-- 1. AGREGAR COLUMNA WEB_URL A PUBLIC.COMPANY (SI NO EXISTE)
ALTER TABLE public.company 
ADD COLUMN IF NOT EXISTS web_url TEXT DEFAULT NULL;

-- 2. REGISTRAR LA TAREA PROGRAMADA 8 EN PUBLIC.TASKS
INSERT INTO public.tasks (id_task, name, description, state, on_off, time, created, modified, doc_types)
VALUES (
    8,
    'Reporte de Auditoría WhatsApp',
    'Envío periódico de reporte de auditoría y diagnóstico a WhatsApp (Certificados, Rechazados, Pendientes, Guías y Anulaciones)',
    'N',
    false,
    '0 8 * * *',
    NOW(),
    NOW(),
    '[]'::jsonb
)
ON CONFLICT (id_task) DO UPDATE 
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    modified = NOW();

-- Sincronizar la secuencia de la tabla tasks para evitar colisiones
SELECT setval('public.tasks_id_task_seq', (SELECT COALESCE(MAX(id_task), 1) FROM public.tasks));

-- 3. REGISTRAR PARÁMETROS EN PUBLIC.SETTINGS PARA WHATSAPP / ZENDY (IDEMPOTENTE)
DO $$
BEGIN
    -- zendy_token
    IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'zendy_token') THEN
        INSERT INTO public.settings (id_settings, key, value, description, category, active)
        VALUES ((SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), 'zendy_token', 'PELVIXXX', 'Token público de envío en Zendy', 'zendy', true);
    END IF;

    -- zendy_connection_id
    IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'zendy_connection_id') THEN
        INSERT INTO public.settings (id_settings, key, value, description, category, active)
        VALUES ((SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), 'zendy_connection_id', '7262c643-dbb1-44e6-8823-ea12670dd21b', 'ID de la conexión de Faqture en Zendy', 'zendy', true);
    END IF;

    -- whatsapp_report_phone
    IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'whatsapp_report_phone') THEN
        INSERT INTO public.settings (id_settings, key, value, description, category, active)
        VALUES ((SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), 'whatsapp_report_phone', '939934171', 'Número de teléfono celular para recibir reportes de auditoría por WhatsApp', 'notificaciones', true);
    END IF;

    -- zendy_send_url
    IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'zendy_send_url') THEN
        INSERT INTO public.settings (id_settings, key, value, description, category, active)
        VALUES ((SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), 'zendy_send_url', 'https://admin.zendy.tsi.pe/api/public/connections/messages/send', 'Endpoint público de envío de mensajes en Zendy', 'zendy', true);
    END IF;
    
    RAISE NOTICE 'Migración completada exitosamente: Tarea 8, columna web_url y settings de WhatsApp configurados.';
END
$$;
