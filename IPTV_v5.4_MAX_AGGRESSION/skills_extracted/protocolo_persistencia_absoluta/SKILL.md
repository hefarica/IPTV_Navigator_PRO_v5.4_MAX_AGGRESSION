---
name: Protocolo de Persistencia Absoluta (Anti-Amnesia y Anti-Caché)
description: Doctrina inmutable para garantizar que todo parche, línea de código o script alterado se grabe físicamente y venza obligatoriamente los cachés estrictos (Chromium/Nginx/Edge). Cero tolerancia a "el código no se actualizó".
---

# PROTOCOLO DE PERSISTENCIA ABSOLUTA (ANTI-AMNESIA & ANTI-CACHÉ)

**Estado:** INMUTABLE Y OBLIGATORIO PARA TODA INTERVENCIÓN
**Propósito:** Erradicar de raíz el escenario catastrófico donde los parches, scripts o modificaciones no se reflejan en el entorno final por culpa de mecanismos de Caché pasivos, o peor aún, porque no se verificó la escritura final en disco. "El caché fue el problema" se considera un diagnóstico inaceptable luego de una falla; debe prevenirse desde su concepción.

## 1. MANDATO DE INVALACIÓN DE CACHÉ ACTIVA (FRONTEND)

Cualquier archivo de script (`.js`), hoja de estilos (`.css`) o plantilla HTML que sea modificado DURANTE una sesión de mantenimiento o creación de código, debe ser inyectado con un **Cache-Buster Agresivo**.

* **PROHIBIDO:**
    Dejar etiquetas esclavas como: `<script src="js/engine.js?v=1.0"></script>` después de modificarlas.
* **OBLIGATORIO:**
    Actualizar en el mismo instante el archivo invocador (usualmente `index-v4.html` o similar) con un timestamp crudo o versión forzada de la siguiente manera:
    `<script src="js/engine.js?v=FIX_[TIMESTAMP]&t=[NUMERO_ALEATORIO_EXTREMO]"></script>`
* Para scripts que se inyectan dinámicamente y construyen la UI/Lógica desde `localStorage` o `fetch()`, se DEBE usar:
    `fetch(url, { cache: "no-store" })` sin ninguna excepción.

## 2. MANDATO DE CONFIRMACIÓN FÍSICA (BACKEND / FS)

Toda modificación a la "Médula Espinal" vía SSH (ej. Nginx, PHP, Bash) debe culminar con un paso estricto de verificación.

* Luego de inyectar o borrar un comando, el agente deberá usar herramientas como `cat`, `sed`, `grep` O `curl` hacia el endpoint modificado para probar que el servidor arrojó el string corregido.
* Si es Nginx o PHP-FPM, inyectar Headers de purga obligatorios:
    `header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');`
    `header('Pragma: no-cache');`

## 3. CERO EXCUSAS TECNOLÓGICAS

El agente tiene prohibido confiar ciegamente en que una alteración del archivo local servirá para arreglar un bug en el navegador si ese navegador es conocido por su caché agresivo (Chrome/Edge).
La modificación del archivo y la ruptura del enlace temporal de caché en el HTML **son un solo paso indivisible (Operación Atómica)**. No hacer lo segundo automáticamente convierte a lo primero en un fallo de protocolo.

## 4. VALIDACIÓN DE FIRMA Y TAMAÑO

Cuando se descargue, ensamble o genere un payload localmente (ej: ZIP, M3U8, channels_map.json):

1. Verificar tamaño de archivo vía sistema operativo (`Get-ChildItem`, `ls -l`, `stat`).
2. Leer primeros 5 y últimos 5 renglones para demostrar la existencia del EOF y el HEADER correctos antes de reportar un éxito.

Implementar estricta e inexorablemente desde hoy.
