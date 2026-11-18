-- ----------------------------------------------------------------------------
-- DATOS: VOLVER A MOSTRAR RECHAZADOS OCULTADOS POR EL BUG verified=true (13/oct)
-- ----------------------------------------------------------------------------
-- Contexto: desde 1b81502 (#28, 13/oct/2026) update_document / update_returning_document guardaban
-- verified=true al persistir la respuesta de SUNAT. Los rechazados ('R') quedaban ocultos en el
-- módulo de rechazados (filtra verified IS NULL OR verified = false). #34 corrige el código hacia
-- adelante, pero los ya guardados siguen ocultos: este script los vuelve a mostrar (verified=false).
--
-- Limitación: el botón "Revisado" también pone verified=true y actualiza modified, sin dejar registro.
-- Un rechazado revisado manualmente después del 13/oct también reaparecerá; basta con volver a marcarlo.
--
-- USO:
--   1) Ejecutar tal cual (v_apply = false): SOLO informa cuántos se mostrarían por empresa. No cambia nada.
--   2) Revisar el resultado (mensajes NOTICE).
--   3) Cambiar v_apply a true y ejecutar de nuevo para aplicar.
-- Requiere: backend con #34 desplegado (si no, los rechazados nuevos se volverán a ocultar).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    v_apply  boolean     := false;                         -- <<< cambiar a true para aplicar
    v_desde  timestamp   := '2026-10-13 00:00:00';         -- fecha del commit que introdujo el bug
    r        record;
    v_count  integer;
    v_total  integer := 0;
    v_emp    integer := 0;
BEGIN
    FOR r IN
        SELECT c.tenant, c.company
          FROM public.company c
          JOIN information_schema.tables t
            ON t.table_schema = c.tenant AND t.table_name = 'document'
         WHERE c.tenant ~ '^[a-zA-Z0-9_]+$'
         ORDER BY c.company
    LOOP
        IF v_apply THEN
            EXECUTE format(
                'UPDATE %I.document SET verified = false
                  WHERE states = ''R'' AND verified = true AND modified >= $1', r.tenant)
            USING v_desde;
            GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
            EXECUTE format(
                'SELECT count(*) FROM %I.document
                  WHERE states = ''R'' AND verified = true AND modified >= $1', r.tenant)
            INTO v_count USING v_desde;
        END IF;

        IF v_count > 0 THEN
            v_total := v_total + v_count;
            v_emp := v_emp + 1;
            RAISE NOTICE '% (%): % rechazado(s)', r.company, r.tenant, v_count;
        END IF;
    END LOOP;

    RAISE NOTICE '%: % rechazado(s) en % empresa(s).',
        CASE WHEN v_apply THEN 'APLICADO - ahora visibles' ELSE 'VISTA PREVIA (sin cambios) - se mostrarían' END,
        v_total, v_emp;
END $$;
