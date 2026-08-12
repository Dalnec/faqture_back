-- Parche para agregar columnas de cobranza y suscripción
-- Agregar a la base de datos de producción Faqture

ALTER TABLE public.company
ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT (CURRENT_DATE + INTERVAL '1 month'),
ADD COLUMN IF NOT EXISTS invoice_status VARCHAR(50) DEFAULT 'Pendiente',
ADD COLUMN IF NOT EXISTS cron_disable_reason VARCHAR(255) DEFAULT NULL;

-- Asegurar que las empresas existentes tengan una fecha válida (si son null)
UPDATE public.company 
SET invoice_date = CURRENT_DATE + INTERVAL '1 month', invoice_status = 'Pendiente'
WHERE invoice_date IS NULL;
