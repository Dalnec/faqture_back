# Reglas del Agente para Faqture Backend (`faqture_back`)

Para la guía completa de arquitectura general, consulta [AGENTS.md raíz](file:///d:/Factures/AGENTS.md).

---

## 1. Reglas Críticas del Backend

1. **Cierre de Conexiones SSH / MySQL**:
   - Cada llamada a `create_mysql_connection(url)` en `src/libs/connection.js` DEBE finalizar con `conn.end()` en un bloque `finally`.
   - Omitir esto provoca saturación de sockets SSH y caída del servidor en producción.

2. **Seguridad Multi-Tenancy (PostgreSQL)**:
   - Esquemas dinámicos: `${tenant}.document`.
   - Validar `${tenant}` con `/^[a-zA-Z0-9_]+$/` antes de interpolarlo en strings SQL.
   - Usar SIEMPRE parámetros posicionales (`$1, $2, ...`) para todos los valores.

3. **Manejo de Errores y Notificaciones**:
   - `errorHandler.js` notifica a Telegram y Discord ante errores no controlados.
   - Evitar lanzar excepciones en bucles continuos (ej. crons masivos) para evitar saturación de webhooks.

4. **Tareas Programadas (`TaskManager` en `tasks.controllers.js`)**:
   - Respetar siempre el lock anti-concurrencia `this.executingTasks.has(taskId)`.
   - Liberar el lock en el bloque `finally` con `this.executingTasks.delete(taskId)`.
   - Actualizar el estado de la tarea en `public.tasks` (`E` -> `C` o `F`).
   - Usar la zona horaria `America/Lima` en los cron expressions.

5. **Notificaciones de Rechazados por WhatsApp**:
   - Consultar ÚNICAMENTE las claves `whatsapp_report_phone_2` a `5` en `public.settings`.
   - Respetar la cola con retardo anti-spam de 60 segundos entre mensajes.

6. **Verificación Obligatoria de Código**:
   - Ejecutar `node -c <archivo.js>` sobre cada archivo modificado antes de finalizar.
