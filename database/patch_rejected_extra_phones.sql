-- ----------------------------------------------------------------------------
-- MIGRACION: SOPORTE DE HASTA 4 DESTINATARIOS PARA ALERTAS DE RECHAZADOS (TAREA 8)
-- ----------------------------------------------------------------------------
-- Agrega whatsapp_report_phone_3, whatsapp_report_phone_4, whatsapp_report_phone_5
-- a public.settings de forma segura e idempotente.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'whatsapp_report_phone_3') THEN
        INSERT INTO public.settings (id_settings, key, value, description, category, active)
        VALUES ((SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), 'whatsapp_report_phone_3', '', 'Tercer numero celular destinatario para alertas de comprobantes rechazados', 'whatsapp', true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'whatsapp_report_phone_4') THEN
        INSERT INTO public.settings (id_settings, key, value, description, category, active)
        VALUES ((SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), 'whatsapp_report_phone_4', '', 'Cuarto numero celular destinatario para alertas de comprobantes rechazados', 'whatsapp', true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'whatsapp_report_phone_5') THEN
        INSERT INTO public.settings (id_settings, key, value, description, category, active)
        VALUES ((SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), 'whatsapp_report_phone_5', '', 'Quinto numero celular destinatario para alertas de comprobantes rechazados', 'whatsapp', true);
    END IF;
END $$;
