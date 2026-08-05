-- --------------------------------------------------------
-- MIGRACIÓN: CREACIÓN DE TABLA SYSTEM LOGS
-- --------------------------------------------------------
-- Este archivo debe ejecutarse UNA SOLA VEZ en la base de datos de producción
-- para habilitar el registro de logs del sistema de Facture.

CREATE TABLE IF NOT EXISTS public.system_logs (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tenant VARCHAR(150),
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    meta JSONB
);

-- Índices para optimizar las búsquedas en el visor de logs del frontend
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant ON public.system_logs(tenant);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);

-- Opcional: Mensaje de confirmación en consola (si se corre por psql)
DO $$
BEGIN
   RAISE NOTICE 'Migración completada: La tabla public.system_logs ha sido creada exitosamente.';
END
$$;
