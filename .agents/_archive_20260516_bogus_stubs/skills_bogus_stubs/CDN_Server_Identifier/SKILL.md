---
name: Skill_CDN_Server_Identifier
description: "Clasifica el Vendor Upstream desde las cabeceras HTTP."
---

# Skill_CDN_Server_Identifier

## 🎯 Objetivo
El Resolver frecuentemente habla con proxys inversos (nginx) o CDNs de entrega de media perimetral. Conocer la topología de la ruta mediante los headers `Server` ayuda a clasificar problemas de enrutamiento 502/504 (identificar al culpable de la caída del stream HLS).

## 📥 Inputs
- **Cabeceras HTTP de Respuesta:** Diccionario devuelto por el servidor upstream IPTV.

## 📤 Outputs
- **Vendor Code:** `Enums` (`CLOUDFLARE`, `XTREAM_CODES_NGINX`, `AKAMAI`, `DIRECT_NGINX`, `UNKNOWN`).

## 🧠 Lógica Interna y Reglas
1. **Detección de Intermediarios:** Revisa cabeceras `Via` y `X-Forwarded-Server` para detectar si el request M3U8 está saltando por múltiples lúpulos.
2. **Deducción de Software:** Revisa `Server` con regex básico. `Server: cloudflare` -> `CLOUDFLARE`. `Server: nginx` sin otras pistas apunta a cluster estándar o Xtream Codes monolítico.

## 💻 Pseudocódigo
```javascript
function CDN_Server_Identifier(responseHeaders) {
    const srv = (responseHeaders['server'] || '').toLowerCase();
    const via = (responseHeaders['via'] || '').toLowerCase();
    
    if (srv.includes('cloudflare')) return "CLOUDFLARE";
    if (srv.includes('akamai')) return "AKAMAI";
    if (srv.includes('nginx')) {
        // En ecosistemas IPTV comunes genéricos
        return "XTREAM_CODES_NGINX_CLUSTER"; 
    }
    
    if (via.length > 0) return "PROXY_CASCADE";
    
    return "UNKNOWN_ORIGIN";
}
```
