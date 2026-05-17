---
name: "VPS CORS & 451 Evasion Proxy (The Nginx Fix)"
description: "Arquitectura definitiva para bypassear bloqueos HTTP 451 (Unavailable For Legal Reasons) causados por filtrado estricto de User-Agent en Xtream UI, resolviendo simultáneamente problemas de cabeceras CORS duplicadas en proxies Nginx."
type: "infrastructure/proxy"
status: "IMPLEMENTED_AND_VERIFIED"
---

# 🛡️ SKILL: VPS CORS & 451 Evasion Proxy (The Nginx Fix)

## 🚨 El Problema: Bloqueo 451 y Limitaciones del Navegador (Chrome)
Servidores IPTV estrictos (ej. `nov202gg.xyz`) implementan firewalls que bloquean ciegamente solicitudes web que no provengan de un dispositivo reconocido, retornando el error HTTP **451 (Unavailable For Legal Reasons)**.

**¿Por qué el Toolkit local se bloquea?**
El Toolkit se ejecuta en un navegador web (`http://127.0.0.1:5500`). Por políticas de seguridad fundamentales (W3C), navegadores como Google Chrome prohíben rotundamente la modificación de la cabecera `User-Agent` dentro de las peticiones JavaScript (Fetch/XHR). Cualquier intento de falsearlo (e.g. fingir ser un Fire TV Stick 4K) será sobrescrito u omitido por el motor del navegador antes de ser enviado al internet real.

---

## 🏗️ La Solución Arquitectónica: Proxy VPS (`ape-backend-connector-v15.js`)
Puesto que el cliente web está "castrado", la arquitectura delega la obtención de los canales a un backend externo (tu VPS: `iptv-ape.duckdns.org`):
1. El Local Toolkit (`127.0.0.1:5500`) hace la solicitud de canales directamente al endpoint API del VPS.
2. El VPS toma las credenciales, enmascara el `User-Agent` (`Mozilla/5.0 (Linux; Android 12; AFTKA Build/PS7633)...`), y emite la petición al servidor IPTV (`nov202gg.xyz`).
3. El servidor IPTV ve un Fire TV Stick 4K auténtico y retorna el M3U u objetos JSON de Xtream (Status 200).
4. El VPS le reenvía esa respuesta limpia al Toolkit local.

---

## 🐛 El Bug Crítico: CORS Duplicado (`Access-Control-Allow-Origin`)
Durante la implementación del Proxy, la conexión del frontend al VPS fallaba con el siguiente error de consola:
> `The 'Access-Control-Allow-Origin' header contains multiple values 'http://127.0.0.1:5500, *', but only one is allowed.`

**Causa Raíz:**
El backend de aplicación en el VPS (NodeJS / Python Werkzeug en puerto 5001 o 8080) generaba su propia cabecera CORS autorizando a `http://127.0.0.1:5500`. Simultáneamente, el reverse proxy Nginx del VPS agregaba globalmente una regla con `add_header Access-Control-Allow-Origin "*" always;`. Al juntarse ambas en la respuesta saliente, Chrome detecta un arreglo de URLs inválido e interrumpe la carga (`net::ERR_FAILED`).

## 🛠️ La Corrección de Nginx (The Fix)
La solución técnica requiere forzar a Nginx a "ocultar" las cabeceras CORS que suben desde el backend de aplicación (upstream) justo antes de redirigir el tráfico vía `proxy_pass`. Así, solo la regla de Nginx en la capa superior prevalece en la respuesta al navegador Chrome.

**Fragmento de configuración corregido (`/etc/nginx/sites-enabled/default`):**

```nginx
location /api/ {
    # 1. Definir el CORS maestro de Nginx
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Upload-Id, X-Chunk-Index, X-Total-Chunks, X-Chunk-SHA256, X-Chunk-MD5, X-Secret-Key" always;
    add_header Access-Control-Expose-Headers "Content-Length, Content-Range" always;
    add_header Access-Control-Max-Age 86400 always;

    # 2. Preflight OPTIONS
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Upload-Id, X-Chunk-Index, X-Total-Chunks, X-Chunk-SHA256, X-Chunk-MD5, X-Secret-Key" always;
        add_header Access-Control-Max-Age 86400 always;
        add_header Content-Type text/plain;
        add_header Content-Length 0;
        return 204;
    }

    # 3. 🚨 EL FIX: Ocultar los headers CORS que suben del backend de aplicación
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Access-Control-Allow-Headers;
    proxy_hide_header Access-Control-Expose-Headers;

    # 4. Proxy pass interno
    proxy_pass http://127.0.0.1:5001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_request_buffering off;
    proxy_buffering off;
}
```

## 🏆 Resultado y Beneficios
- Permite la gestión y extracción de canales de proveedores hiper-estrictos (Firewalls 451, Xtream Mods) directamente desde un dashboard Frontend Web.
- Estabiliza la comunicación integral de `XMLHttpRequest` y `Fetch API` hacia un VPS centralizado, eliminando fallos en la capa de seguridad de navegadores (Chrome, Edge, Safari).
- Las API internas pueden mantener su lógica CORS por defecto sin entrar en conflicto con la topología pública del puerto 443 en Nginx.
