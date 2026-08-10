---
name: faqture-cli
description: Herramienta oficial CLI para analizar logs, detectar patrones de error de SUNAT y gestionar anulaciones del sistema Faqture.
---

# Faqture CLI - Manual para IAs

## Introducción
Faqture CLI (`fq`) es una herramienta de terminal instalada en el servidor backend del proyecto Faqture. Su propósito es ayudar a las IAs (como tú) a diagnosticar rápidamente problemas del sistema sin tener que leer manualmente cientos de filas en PostgreSQL o descifrar logs no estructurados.

## Ubicación y Ejecución
- **Ruta de Ejecución:** El CLI debe ejecutarse dentro del directorio del backend: `C:\Factures\faqture_back\faqture_cli`.
- **Comando base:** `npx fq` o `node ./dist/index.js` (si `fq` no está en el PATH de tu entorno).

## Comandos Principales (Sintaxis V2)

### 1. Módulo Logs (`fq logs`)
**Descripción:** Analiza y gestiona los errores del sistema (`system_logs`).
- `fq logs`: Muestra los últimos 100 errores en consola.
- `fq logs -t <ruc>`: Filtra los errores para ver solo los de una empresa específica.
- `fq logs --report`: Agrupa los errores y genera un reporte Markdown (ej. `logs-report-global-2026-08-07.md`).
- `fq logs --all` o `-a`: Obtiene absolutamente todos los logs sin el límite predeterminado de 100. Puede combinarse con `--report`.
- `fq logs -t <ruc> --report`: Genera el reporte Markdown pero filtrado por empresa.
- `fq logs --clean`: Borra permanentemente los logs con más de 30 días de antigüedad.

### 2. Módulo Documents (`fq documents`)
**Descripción:** Consulta comprobantes y maneja anulaciones en la tabla `document` de cada empresa.
- `fq documents`: Muestra los últimos comprobantes en el sistema.
- `fq documents -t <ruc>`: Muestra los últimos comprobantes de una empresa específica.
- `fq documents -t <ruc> -s X`: Muestra comprobantes de esa empresa en estado `X` (Rechazados, etc.).
- `fq documents -s P`: Busca en TODAS las empresas los comprobantes en estado `P` (Pendientes de baja). Útil para ver anulaciones atascadas.
- `fq documents -s X --report`: Genera un reporte Markdown con los comprobantes encontrados, útil para archivar resultados o analizarlos a fondo.

### 3. Módulo Customers (`fq customers`)
**Descripción:** Consulta información de las empresas/tenants en el esquema `public.company`.
- `fq customers`: Lista todas las empresas registradas y su estado (Activo/Inactivo).
- `fq customers -t <ruc>`: Muestra los detalles (credenciales, nombre, etc.) de una empresa específica.

### 4. Módulo System (`fq status`)
**Descripción:** Verifica si hay conexión a PostgreSQL.
- `fq status`: Hace ping a la BD y devuelve la hora del servidor.

## Flujo Recomendado para Resolver Errores
1. Si el usuario reporta que "hay errores en las ventas de una empresa":
2. Ejecuta `fq logs -t <ruc> --report`.
3. Lee el archivo Markdown generado en `reports/`.
4. Sigue las instrucciones del bloque `💡 Análisis Automático CLI`. Si te indica corregir código, hazlo. Si es un problema del RUC, verifica con `fq customers -t <ruc>`.
5. Si un documento está atascado, búscalo con `fq documents -t <ruc> -s X` o similar.
