---
name: Anti-407 Stealth Fingerprint (Zero Proxy Leakage)
description: Doctrina arquitectónica inmutable que erradica el error HTTP 407 (Proxy Authentication Required) de raíz. En lugar de "manejar" el 407 reactivamente (como hace el 95% de los especialistas), esta habilidad PREVIENE que se genere, eliminando quirúrgicamente toda huella de proxy del pipeline de generación M3U8 y los headers HTTP embebidos.
---

# 🛡️ ANTI-407 STEALTH FINGERPRINT (Zero Proxy Leakage)

## 1. El Problema Real

El error `Received HTTP_PROXY_AUTH (407) code while not using proxy` ocurre porque ExoPlayer (motor interno de OTT Navigator) **confunde el VPS reverse proxy (DDNS/Nginx) con un proxy corporativo bloqueado**.

Cuando el reproductor detecta headers de respuesta tipo `Proxy-Authenticate` o tiene sockets TCP reutilizados con tokens de proxy expirados, asume que hay un proxy intermedio y dispara el error 407 — aunque el usuario **no tenga ningún proxy configurado** en su TV.

---

## 2. Vectores de Contaminación Identificados

| # | Vector Tóxico | Archivo | Estado |
|---|---|---|---|
| 1 | `tcp_multiplex_proxy: true` en `#EXTHTTP` | `m3u8-typed-arrays-ultimate.js` | ✅ **PURGADO** |
| 2 | `Proxy-Authorization` / `Proxy-Connection` headers | `proxy-auth-module.js` | ✅ **MÓDULO DESHABILITADO** |
| 3 | `Connection: keep-alive` en `#EXTHTTP` | `m3u8-typed-arrays-ultimate.js` | ✅ **REEMPLAZADO por `close`** |
| 4 | User-Agent antiguo / ExoPlayerLib | `#EXTHTTP`, rotación | ✅ **UA actualizado a 1.7.4.1** |
| 5 | Ausencia de directiva `http-proxy=` vacía | Resolvers PHP | ✅ **INYECTADO** |

---

## 3. Técnica: Phantom Proxy Bypass (3 Capas)

### Capa 1: EXTVLCOPT — Anulación de Proxy del Sistema Operativo

```php
$vlcopt[] = "#EXTVLCOPT:http-proxy=";          // Valor vacío: anula proxies del SO
$vlcopt[] = "#EXTVLCOPT:no-proxy-server=true";
$vlcopt[] = "#EXTVLCOPT:network-proxy-bypass=1";
```

**Efecto:** Le quita a ExoPlayer/VLC la capacidad matemática de tropezar con configuraciones de VPN, DNS o proxy del dispositivo Android/FireTV.

### Capa 2: EXTHTTP — Headers Anti-Proxy Pre-Flight

```json
{
  "Connection": "close",
  "X-No-Proxy": "true",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site",
  "DNT": "1"
}
```

**Efecto:** `Connection: close` evita que sockets antiguos arrastren tokens de proxy expirados. `Sec-Fetch-*` señala tráfico legítimo de dispositivo (los proxies NUNCA envían estos).

### Capa 3: Nginx — Intercepción del 407 (Enmascaramiento)

Si el proveedor IPTV original responde con 407, el VPS **NUNCA** debe reenviar ese código al televisor. Debe capturar el error, renegociar internamente, o devolver `502 Bad Gateway` / `302 Redirect` a un fallback.

```nginx
# En el proxy pass del VPS:
proxy_intercept_errors on;
error_page 407 = @proxy_auth_fallback;

location @proxy_auth_fallback {
    return 302 $fallback_stream_url;
}
```

---

## 4. Headers PROHIBIDOS (Blacklist Permanente)

Nunca deben aparecer en la salida M3U8 ni en headers HTTP:

| Header Prohibido | Razón |
|---|---|
| `Proxy-Authorization` | Dispara negociación 407 activa |
| `Proxy-Connection` | Header de proxy no-estándar que delata intermediarios |
| `X-Forwarded-For` | Señal inequívoca de proxy/CDN |
| `X-Real-IP` | Delata proxy inverso |
| `Via` | Header RFC 7230 que identifica proxies |
| `X-Proxy-*` | Cualquier header con prefijo X-Proxy |
| `tcp_multiplex_proxy: true` | Flag APE que CDNs interpretan como señal de proxy |

---

## 5. User-Agents Tóxicos (Blacklist)

Estos UAs disparan detección automática de proxy/bot en CDNs IPTV:

- `ExoPlayerLib/2.18.7`
- `Lavf/*`
- `okhttp/4.*`
- `Dalvik/*`
- `stagefright/*`

**User-Agent aprobado:** `OTT Navigator/1.7.4.1`

---

## 6. Archivos Modificados

| Archivo | Cambio |
|---|---|
| `m3u8-typed-arrays-ultimate.js` | `Connection: close`, `X-No-Proxy: true`, purgado `tcp_multiplex_proxy` |
| `resolve.php` | `http-proxy=`, `no-proxy-server`, `network-proxy-bypass`, `Connection: close` en EXTHTTP |
| `resolve_quality.php` | Ídem resolve.php |
| `ape-module-manager.js` | `proxy-auth` module `disabled: true` |

---

## 7. Checklist de Validación

- [ ] CINE+ FAMILY UHD reproduce sin error 407
- [ ] Sky Sports reproduce sin error 407
- [ ] Zero menciones a `Proxy-Authorization` en la salida del VPS
- [ ] `#EXTVLCOPT:http-proxy=` presente en cada canal resuelto
- [ ] `Connection: close` en cada `#EXTHTTP` JSON
