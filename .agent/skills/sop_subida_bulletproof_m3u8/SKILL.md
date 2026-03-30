---
name: SOP - Subida Bulletproof M3U8 y Precheck Soft-Fail
description: Protocolo estricto que designúa al FS/NGINX como el único árbitro final sobre la existencia de listas. Tolerancia a XHR/CORS Fails.
---

# 🛡️ SOP Subida Bulletproof M3U8 (v1.1.1 INDUSTRIAL RESILIENCE)

## 🎯 OBJETIVO Y JERARQUÍA DE VERDADES

Evitar que un problema de respuesta asíncrona del navegador (CORS mal configurado en la respuesta, `TypeError: Failed to fetch`, interrupción del proxy, timeout del TCP origin), arrojen un falso negativo destruyendo la experiencia de usuario y bloqueando el pipeline de la VPS en sistemas gigantes (archivos > 100MB).

**La respuesta temporal asíncrona de `XHR / fetch` es SÓLO INFORMATIVA. El estado físico de `/lists/{filename}` en el sistema de archivos de NGINX es LA ÚNICA REALIDAD.**

| Estado | Fuente | Criterio de Verdad |
| --- | --- | --- |
| ✅ **Éxito Definitivo** | `HEAD /lists/{filename}` | Código HTTP **200** o **206** |
| ❌ **Fallo Definitivo** | `HEAD /lists/{filename}` | Código **404** tras agotar Rescue Loop |

## 1. PRECHECK (Soft-Fail Gateway)

El frontend NO debe bloquear nunca una subida solo porque la API de HealthCheck no logre negociar CORS de vuelta al navegador.

* Si `GET /api/health` retorna `TypeError: Failed to fetch`, simplemente registra una bandera `WARN/SOFT-FAIL`.
* Procede asumiendo que el proxy NGINX/PHP sigue con vida detrás de bastidores.

## 2. RECOVERY LOOP Y XHR ERROR

* Ejecuta la subida industrial vía Chunking, FormData o Blob.
* Si el navegador escupe `xhr.onerror` o interrumpe la conexión tras el 100% (o en el paso de post-procesamiento), **PROHIBIDO LANZAR LA ALERTA DE FALLO DIRECTO**.
* **DEBES saltar al Bucle de Comprobación (Rescue Loop):**
  * Dispara sondeadores `HEAD` hacia la URL pública estática `/lists/{filename}.m3u8`.
  * Efectúa un escalonado exponencial: 1s, 2s, 4s, 8s, 16s, 16s.
  * Si NGINX devuelve `200` y confirmas la existencia: emite `RECOVERED SUCCESS_CONFIRMED` en la Interfaz.
  * Si la respuesta persevera en `404` luego de todas las rotaciones: Sólo ahí declara formalmente el desastre `FAIL_CONFIRMED`.

## 3. LÍMITES SRE INFRANQUEABLES

* **Backend PHP**: `upload_max_filesize = 500M`, `post_max_size = 500M`
* **NGINX proxy**: `client_max_body_size 500M`, `fastcgi_read_timeout 3600s`.
* Nunca asumas redundar cabeceras CORS de Origin en Nginx y en PHP si eso arroja "Access-Control-Allow-Origin: *,*". Delega dinámicas a PHP, y estáticas a NGINX `/lists/`.

**Regla Anti-Autoengaño:** "Si `HEAD /lists/...` da 404 finalmente, el archivo NUNCA estuvo allí."
