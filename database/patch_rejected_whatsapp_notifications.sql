-- ----------------------------------------------------------------------------
-- MIGRACIÓN: NOTIFICACIÓN DE COMPROBANTES RECHAZADOS POR WHATSAPP (TAREA 8)
-- ----------------------------------------------------------------------------
-- 1. Tabla centralizada para registrar comprobantes rechazados ya notificados
--    (garantiza idempotencia estricta: un solo envío por comprobante rechazado)
-- 2. Setting para el segundo número de WhatsApp (whatsapp_report_phone_2)

CREATE TABLE IF NOT EXISTS public.whatsapp_notified_rejected (
    id SERIAL PRIMARY KEY,
    tenant VARCHAR(100) NOT NULL,
    id_document INTEGER NOT NULL,
    type VARCHAR(10),
    serie VARCHAR(50),
    numero BIGINT,
    phones TEXT,
    notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_notified_rejected UNIQUE (tenant, id_document)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notified_rejected_lookup 
ON public.whatsapp_notified_rejected (tenant, id_document);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'whatsapp_report_phone_2') THEN
        INSERT INTO public.settings (id_settings, key, value, description, category, active)
        VALUES (
            (SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings),
            'whatsapp_report_phone_2',
            '',
            'Segundo número celular destinatario para alertas de comprobantes rechazados',
            'whatsapp',
            true
        );
    END IF;
END
$$;
