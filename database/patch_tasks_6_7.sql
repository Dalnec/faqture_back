-- --------------------------------------------------------
-- MIGRACIÓN: CREACIÓN DE TAREAS PROGRAMADAS 6 Y 7
-- --------------------------------------------------------
-- Este script registra las nuevas tareas programadas en la base de datos de producción:
-- - Tarea 6: "Verificar Pagos" (Bloqueo/Notificación automática por falta de pago)
-- - Tarea 7: "Verificar Comprobantes con Error" (Regularización automática 'X', 'M', 'S', 'Z')

INSERT INTO public.tasks (id_task, name, state, on_off, time, created, modified)
VALUES 
  (6, 'Verificar Pagos', 'N', true, '0 0 * * *', NOW(), NOW()),
  (7, 'Verificar Comprobantes con Error', 'N', true, '*/10 * * * * *', NOW(), NOW())
ON CONFLICT (id_task) DO UPDATE 
SET name = EXCLUDED.name,
    on_off = EXCLUDED.on_off,
    time = EXCLUDED.time,
    modified = NOW();

-- Sincronizar la secuencia de la tabla de tareas para evitar colisiones en futuros inserts
SELECT setval('public.tasks_id_task_seq', (SELECT COALESCE(MAX(id_task), 1) FROM public.tasks));

DO $$
BEGIN
   RAISE NOTICE 'Migración completada: Tareas 6 y 7 registradas exitosamente en public.tasks.';
END
$$;
