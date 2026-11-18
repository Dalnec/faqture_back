-- ----------------------------------------------------------------------------
-- MIGRACION: INTERRUPTOR DE REGULARIZACION AUTOMATICA EN EL PRO (TAREA 5)
-- ----------------------------------------------------------------------------
-- Agrega 'task5_pro_regularize' a public.settings de forma segura e idempotente.
-- Se gestiona desde el front: Configuracion > Reportes WhatsApp > "Resumenes diarios de boletas (Tarea 5)".
-- Valores:
--   report (por defecto) : no escribe en el PRO; la alerta de WhatsApp indica que boletas regularizar.
--   on                   : regulariza en el PRO (estado 05) las boletas que SUNAT confirma ACEPTADAS y reenvia el resumen.
--   off                  : desactivado.
-- Nota: si este patch no se ejecuta, la Tarea 5 crea el ajuste automaticamente con 'report' en su primer ciclo.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'task5_pro_regularize') THEN
        INSERT INTO public.settings (id_settings, key, value, description, category, active)
        VALUES ((SELECT COALESCE(MAX(id_settings), 0) + 1 FROM public.settings), 'task5_pro_regularize', 'report',
                'Tarea 5: regularizar en el PRO boletas que bloquean resumenes (2282). Valores: report | on | off', 'whatsapp', true);
    END IF;
END $$;
