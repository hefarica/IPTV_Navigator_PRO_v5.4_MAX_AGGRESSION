---
name: Auditoría SRE de Infraestructura VPS (NGINX/PHP)
description: Protocolo operativo estricto para diagnosticar flujos de red subyacentes sin tocar código frontend. Utilización de curl, logs, HEAD y verificación de CORS en crudo.
---

# 🕵️‍♂️ Auditoría SRE de Infraestructura VPS (NGINX/PHP)

## 🎯 OBJETIVO Y METODOLOGÍA

Como Site Reliability Engineer (SRE), tu deber es determinar irrefutablemente si un fallo viene del frontend (SOP o CORS) o del backend (timeout, caídas de NGINX, límites de subida de PHP, o `ERR_CONNECTION_REFUSED`). **Prohibido asumir adivinanzas.** Toda conclusión debe estar fundamentada en registros de logs o pruebas sintéticas locales.

## 🛠️ PASOS DE DIAGNÓSTICO (OBLIGATORIOS)

Cuando enfrentes un error tipo `Failed to fetch`, ejecuta las siguientes vías y reporta tu hallazgo con exactitud:

### 1. Pruebas de Carga Sintéticas (curl desde el propio VPS)

Aísla al cliente y al ISP para descartar problemas locales. Sube un archivo de 1MB, 5MB y 120MB directo a PHP en la VPS usando bash. Si el 120MB revienta, tienes un problema de `client_max_body_size` o timeout en Nginx/PHP. Si funciona, la falla está en el frontend o tránsito intermediario (Cloudflare, etc.).

### 2. Tail y Grep de Logs en Vivo

No asumas. Ve y busca el error concreto en `/var/log/nginx/error.log` y `access.log`.
Rastrea anomalías del tipo:

* `client intended to send too large body` (413 Payload Too Large)
* `upstream timed out` (504 Gateway Timeout)
* `connection reset` / `recv() failed` (499 / 502)

### 3. Examen CORS Crudo (`curl -X OPTIONS`)

Enfrenta al servicio desde SSH simulando el origen del navegador, solicitando `/api/health` o `/api/upload`.
Verifica si el bloqueador de OPTIONS devuelve el estricto `HTTP 204` con los headers ACAO (`Access-Control-Allow-Origin: *`) presentes.
Si falta esto en Nginx para los requests PHP, el browser aniquilará el POST pase lo que pase.

### 4. Auditoría de Bloques de Servidor NGINX (`nginx -T`)

Caza conflictos de bloques duplicados en `listen 443 ssl`. Asegúrate empíricamente que la ruta de API (`location = /api/upload`) está dentro del bloque ganador que atiende el server_name de producción.

## 🛑 ROJA DIRECTA (PRÁCTICAS PROHIBIDAS POR ESTA HABILIDAD)

1. Cero filosofía. Entregas evidencia o comandos (`curl`, `ls -lah`, `nginx -t`).
2. Jamás reiniciar Nginx o PHP sin antes haber probado la ruta sintéticamente, revisado sintaxis y copiado el error específico.
3. No instalar dependencias. Probar lo que ya existe.
4. "Reescribir todo el backend" porque un regex de Location falló. Corregir y pegar Diffs listos.
