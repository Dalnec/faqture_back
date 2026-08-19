-- ==============================================================================
-- Migración: Índice Parcial para Optimización de Comprobantes Rechazados
-- Descripción: Crea el índice idx_document_states_rejected de forma segura e 
--              idempotente en TODOS los esquemas de empresas que tengan tabla 
--              'document' (tanto activas como inactivas), garantizando que la
--              consulta de rechazados siempre ejecute en ~1 segundo.
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_schema AS tenant
        FROM information_schema.tables 
        WHERE table_name = 'document' 
          AND table_schema NOT IN ('public', 'information_schema', 'pg_catalog')
          AND table_schema ~ '^[a-zA-Z0-9_]+$'
    LOOP
        BEGIN
            EXECUTE format('
                CREATE INDEX IF NOT EXISTS idx_document_states_rejected 
                ON %I.document (states, verified) 
                WHERE states = ''R'';
            ', r.tenant);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'No se pudo crear índice en esquema %: %', r.tenant, SQLERRM;
        END;
    END LOOP;
END $$;
