---
name: Skill Cortex Pilar 5 HTTP Interceptor
description: Interceptor JavaScript nativo que sobreescribe window.fetch y XMLHttpRequest para detectar baneos, forzar rotación de User-Agents y Cache-busting automático.
---
# Skill: Córtex Pilar 5 (HTTP Interceptor & UA Rotation)

**Clasificación:** Frontend Hardening / Evasión de Baneos  
**Nivel:** God-Tier  

## 1. Propósito
Garantizar la **supervivencia del frontend** ante restricciones de red, caídas de CDN, rate limits o bloqueos geográficos del proveedor de IPTV. Esto se logra interviniendo silenciosamente el motor HTTP en el navegador/reproductor web.

## 2. Funcionamiento del Córtex
El Córtex Pilar 5 no necesita integrarse manualmente en cada llamada de red. Se instala como un **Interceptor Global** en la parte superior del contexto global (IIFE principal) y secuestra las APIs nativas del navegador:
1. `window.fetch`
2. `window.XMLHttpRequest`

### 2.1 Evasión de Status Codes Destructivos
El Córtex monitorea cada respuesta de red. Si detecta uno de los siguientes códigos HTTP:
- `400 Bad Request`
- `401 Unauthorized`
- `403 Forbidden`
- `405 Method Not Allowed`
- `429 Too Many Requests`
... o un evento `offline`, automáticamente asume que la red ha sido baneada o bloqueada por una directiva "anti-bot" (CDN WAF / ISP Throttle).

### 2.2 Acción Táctica Inmediata (<60ms)
Al detectar el ban:
1. **Salto de Base UA:** Obliga al sistema generador a incrementar `_uaRotationIndex` de manera asimétrica para asegurar que la próxima conexión parezca provenir de un hardware/navegador completamente diferente (Hardware Spoofing).
2. **Generación de Temp-Ban Hash (`m3u8_busted`):** Calcula un token pseudo-aleatorio o hash numérico. Este hash es expuesto al generador para forzar un `cache-busting` inmediato sobre cualquier Proxy HTTP o Backend SSOT. La CDN creerá que es un recurso completamente nuevo.

## 3. Ejemplo de Implementación (XMLHttpRequest)
```javascript
const oldOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
    this.addEventListener('load', function() {
        if ([400, 401, 403, 405, 429].includes(this.status) || this.status >= 500) {
            window._uaRotationIndex = (window._uaRotationIndex + 17) % 120;
            window._cortexTempBanHash = Date.now().toString(36) + Math.random().toString(36).substring(2);
        }
    });
    this.addEventListener('error', function() {
        window._uaRotationIndex = (window._uaRotationIndex + 7) % 120;
        window._cortexTempBanHash = 'offline_' + Date.now().toString(36);
    });
    oldOpen.call(this, method, url, async, user, pass);
};
```

## 4. Auditoría
Nunca desactivar el Pilar 5. En escenarios de pruebas exhaustivas donde se requiera deshabilitarlo, verificar que no rompa el hilo de reproducción, ya que es el salvavidas absoluto contra bloqueos de ISP en tiempo de zapping o generación.
