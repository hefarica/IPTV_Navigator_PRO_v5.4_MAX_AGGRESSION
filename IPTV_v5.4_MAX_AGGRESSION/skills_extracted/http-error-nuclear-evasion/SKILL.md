---
name: http-error-nuclear-evasion
description: >
  Sistema de evasión nuclear para TODOS los códigos de error HTTP (3xx, 4xx, 5xx) en streaming IPTV.
  Integra 12 técnicas de bypass verificadas: credential probing, CONNECT tunneling, DPI evasion,
  TLS fingerprint spoofing, IP/UA rotation, header injection, exponential backoff con jitter,
  DNS-over-HTTPS, proxy chain bypass, NTLM/Digest auth probing, transparent proxy detection,
  y M3U8 header injection. Reemplaza y extiende evasion-407-supremo.js con cobertura completa
  para 403, 407, 429, 451, 500, 502, 503, 504, 301/302/307/308. Usar para: diagnosticar y
  evadir errores HTTP en streams IPTV, configurar headers de bypass en M3U8, implementar
  estrategias de reconexión inteligente, y crear genomas de evasión multi-capa.
---

# HTTP Error Nuclear Evasion — Skill Completo

## Arquitectura del Problema

Los errores HTTP en IPTV provienen de **4 fuentes distintas**, cada una requiere estrategias diferentes:

| Fuente | Errores Típicos | Causa Real |
|--------|-----------------|------------|
| **ISP Transparent Proxy** | 407, 403 | El ISP intercepta tráfico y exige auth |
| **Xtream Codes Panel** | 403, 429, 503 | Rate limiting, suscripción, o servidor caído |
| **CDN/Origin Server** | 301, 302, 403, 451, 504 | Geo-blocking, redirect, o timeout |
| **Player/Client** | 407, 502, 504 | Configuración de proxy local incorrecta |

---

## Tabla Maestra de Errores y Bypass

### 3xx — Redirects

| Código | Nombre | Causa IPTV | Bypass |
|--------|--------|------------|--------|
| 301 | Moved Permanently | URL del stream cambió | Seguir redirect + actualizar `channels_map.json` |
| 302 | Found | Token expirado, redirect temporal | Regenerar token, seguir redirect automático |
| 307 | Temporary Redirect | Load balancer redirige | Seguir redirect manteniendo método POST/GET |
| 308 | Permanent Redirect | Migración de CDN | Actualizar URL base en channels_map |

**EXTHTTP Headers para 3xx:**
```json
{
  "X-APE-Follow-Redirects": "true",
  "X-APE-Max-Redirects": "10",
  "X-APE-Redirect-Auth-Preserve": "true"
}
```

---

### 4xx — Client Errors (EL CAMPO DE BATALLA PRINCIPAL)

#### 401 Unauthorized
| Causa | Técnica de Bypass |
|-------|-------------------|
| Credenciales IPTV expiradas | Renovar username/password en `originsRegistry` |
| Token JWT expirado | Regenerar con `generateJWT68Fields()` |
| Xtream Codes auth fail | Verificar `username:password` en URL del stream |

**Headers de combate:**
```json
{
  "Authorization": "Bearer <token>",
  "X-APE-Auth-Retry": "3",
  "X-APE-Auth-Method": "basic,bearer,digest"
}
```

#### 403 Forbidden — LA BESTIA MÁS COMÚN

**12 técnicas de bypass (de HackTricks + InfoSecWriteups):**

| # | Técnica | Header/Acción | Efectividad |
|---|---------|---------------|-------------|
| 1 | UA Rotation | `User-Agent: Chrome/131.0.0.0` (rotado) | ⭐⭐⭐⭐ |
| 2 | Referer Spoofing | `Referer: https://www.google.com/` | ⭐⭐⭐ |
| 3 | X-Forwarded-For | `X-Forwarded-For: <CDN_IP>` | ⭐⭐⭐⭐ |
| 4 | X-Original-URL | `X-Original-URL: /stream.m3u8` | ⭐⭐⭐ |
| 5 | X-Rewrite-URL | `X-Rewrite-URL: /stream.m3u8` | ⭐⭐⭐ |
| 6 | X-Custom-IP-Auth | `X-Custom-IP-Authorization: <IP>` | ⭐⭐ |
| 7 | Host Header | `Host: allowed-domain.com` | ⭐⭐⭐ |
| 8 | URL Encoding | `/stream.m3u8` → `/%73tream.m3u8` | ⭐⭐ |
| 9 | Method Switch | `GET` → `POST` o `HEAD` | ⭐⭐ |
| 10 | Null Byte | `/stream%00.m3u8` | ⭐⭐ |
| 11 | Path Traversal | `/../stream.m3u8` | ⭐⭐ |
| 12 | Accept Header | `Accept: */*` (genérico) | ⭐⭐⭐ |

**M3U8 Implementation:**
```
#EXT-X-APE-FALLBACK-ID:403_NUCLEAR_EVASION
#EXT-X-APE-FALLBACK-UA:<rotated_ua>
#EXT-X-APE-FALLBACK-REFERER:https://www.google.com/
#EXT-X-APE-FALLBACK-XFF:<cdn_ip>
#EXT-X-APE-FALLBACK-X-ORIGINAL-URL:/live/<stream_id>.m3u8
#EXT-X-APE-FALLBACK-HOST:<origin_domain>
```

#### 407 Proxy Authentication Required — EL ENEMIGO PERSISTENTE

**Root Causes en IPTV:**
1. **ISP Transparent Proxy** (Telmex, Claro, Movistar): Intercepta tráfico HTTP y pide auth NTLM/Basic
2. **Corporate Proxy**: Red corporativa con Squid/BlueCoat que exige credenciales
3. **Carrier-Grade NAT Proxy**: El CGNAT del ISP tiene proxy que filtra
4. **Middleware IPTV**: Panel Xtream Codes con proxy reverse

**8 técnicas de bypass (de más a menos agresiva):**

| # | Técnica | Implementación | Cuándo Funciona |
|---|---------|----------------|-----------------|
| 1 | **Empty Basic Auth** | `Proxy-Authorization: Basic Og==` | Proxies mal configurados que aceptan auth vacía |
| 2 | **NTLM Challenge** | `Proxy-Authorization: NTLM TlRMTVNTUAABAAAAB4IIogAAAAAAAAAAAAAAAAAAAAAGAbEdAAAADw==` | Proxies Windows/ISP con NTLM habilitado |
| 3 | **Digest Auth Probe** | `Proxy-Authorization: Digest username=""` | Proxies que aceptan digest sin realm |
| 4 | **Negotiate/Kerberos** | `Proxy-Authorization: Negotiate YIIBhg...` | Entornos corporativos con AD |
| 5 | **CONNECT Tunnel** | TCP tunnel directo al puerto 443 | Bypass total del proxy transparente |
| 6 | **DNS-over-HTTPS** | `https://1.1.1.1/dns-query?name=stream.host` | Evitar DNS hijacking del ISP |
| 7 | **Proxy-Connection** | `Proxy-Connection: keep-alive` + `Connection: close` | Confundir proxy sobre estado de conexión |
| 8 | **Via Header Spoof** | `Via: 1.1 proxy.local` | Hacer creer al proxy que ya fue autenticado |

**NTLM Type 1 Message (Base64 real para probe):**
```
TlRMTVNTUAABAAAAB4IIogAAAAAAAAAAAAAAAAAAAAAGAbEdAAAADw==
```
Esto envía un mensaje NTLM Type 1 (Negotiate) con flags NTLMSSP_NEGOTIATE + UNICODE + OEM. Muchos proxies ISP mal configurados responden con Type 2 challenge, revelando información del proxy (dominio, hostname).

**M3U8 Implementation completa:**
```
#EXT-X-APE-FALLBACK-ID:407_MULTI_PROBE
#EXT-X-APE-FALLBACK-PROXY-AUTH-1:Basic Og==
#EXT-X-APE-FALLBACK-PROXY-AUTH-2:NTLM TlRMTVNTUAABAAAAB4IIogAAAAAAAAAAAAAAAAAAAAAGAbEdAAAADw==
#EXT-X-APE-FALLBACK-PROXY-AUTH-3:Digest username=""
#EXT-X-APE-FALLBACK-PROXY-AUTH-4:Bearer anonymous
#EXT-X-APE-FALLBACK-PROXY-CONNECTION:keep-alive
#EXT-X-APE-FALLBACK-VIA:1.1 proxy.local
#EXT-X-APE-FALLBACK-TUNNEL:CONNECT
```

#### 429 Too Many Requests

**Técnicas de bypass (de HackTricks):**

| # | Técnica | Header | Efectividad |
|---|---------|--------|-------------|
| 1 | IP Rotation | `X-Forwarded-For: <random_cdn_ip>` | ⭐⭐⭐⭐⭐ |
| 2 | Exponential Backoff | Delay 1s→2s→4s→8s con jitter ±500ms | ⭐⭐⭐⭐ |
| 3 | Null Byte Injection | `%00` en parámetros de URL | ⭐⭐ |
| 4 | Multi-Header IP | X-Remote-IP + X-Client-IP + X-Remote-Addr | ⭐⭐⭐ |
| 5 | HTTP/2 Multiplexing | Enviar requests en paralelo sobre 1 conexión | ⭐⭐⭐ |
| 6 | Session Rotation | Cambiar `X-Playback-Session-Id` por request | ⭐⭐⭐⭐ |

**M3U8 Implementation:**
```
#EXT-X-APE-FALLBACK-ID:429_ANTI_RATELIMIT
#EXT-X-APE-FALLBACK-XFF:<rotated_ip>
#EXT-X-APE-FALLBACK-X-REMOTE-IP:<rotated_ip_2>
#EXT-X-APE-FALLBACK-X-CLIENT-IP:<rotated_ip_3>
#EXT-X-APE-FALLBACK-SESSION:SES_<random_32>
#EXT-X-APE-FALLBACK-BACKOFF:EXPONENTIAL_JITTER
#EXT-X-APE-FALLBACK-BACKOFF-BASE:1000
#EXT-X-APE-FALLBACK-BACKOFF-MAX:32000
#EXT-X-APE-FALLBACK-BACKOFF-JITTER:500
```

#### 451 Unavailable For Legal Reasons (Geo-Block)

**Técnicas de bypass:**

| # | Técnica | Implementación |
|---|---------|----------------|
| 1 | X-Forwarded-For con IP del país target | `X-Forwarded-For: 8.8.8.8` (US) |
| 2 | X-Real-IP spoof | `X-Real-IP: 151.101.1.1` (Fastly US) |
| 3 | CF-Connecting-IP | `CF-Connecting-IP: <US_IP>` (Cloudflare) |
| 4 | True-Client-IP | `True-Client-IP: <US_IP>` (Akamai) |
| 5 | DNS-over-HTTPS | Resolver desde DNS de US/EU |

---

### 5xx — Server Errors

#### 500 Internal Server Error
- **Causa IPTV**: Xtream Codes panel sobrecargado, bug en middleware
- **Bypass**: Reintentar con genoma completamente mutado (UA, IP, headers)
- **Backoff**: 2s → 5s → 10s

#### 502 Bad Gateway
- **Causa IPTV**: Nginx/proxy del panel caído o overloaded
- **Bypass**: Headers limpios (`Connection: close`, `Accept: */*`), cambiar CDN IP
- **Degrade**: Intentar TS directo en vez de HLS

#### 503 Service Unavailable
- **Causa IPTV**: Servidor temporalmente overloaded
- **Bypass**: Protocol degradation (HLS→TS directo), `Connection: close`, retry con backoff

#### 504 Gateway Timeout
- **Causa IPTV**: Origin no responde a tiempo
- **Bypass**: Incrementar timeout headers, cambiar CDN IP, retry con jitter

---

## Técnicas Avanzadas de Evasión

### 1. TLS Fingerprint Evasion (JA3/JA4)

Los ISPs usan fingerprinting TLS para identificar clientes IPTV:

| Player | JA3 Hash Típico | Detectable |
|--------|-----------------|------------|
| VLC | `d3a99c...` (GnuTLS) | ⭐⭐⭐⭐ Muy detectable |
| ExoPlayer | Similar a Chrome Android | ⭐ Difícil de detectar |
| Kodi | `abc123...` (OpenSSL) | ⭐⭐⭐ Moderado |
| OTT Nav | Similar a ExoPlayer | ⭐ Difícil de detectar |

**Contramedidas:**
- Usar ExoPlayer/OTT Navigator (fingerprint Chrome-like) en vez de VLC
- Si se usa VLC: configurar `--http-user-agent` para coincidir con UA de Chrome
- Mantener coherencia: JA3 de Chrome + UA de Chrome (nunca mezclar)

### 2. DPI (Deep Packet Inspection) Evasion

| Técnica | Implementación | Efectividad |
|---------|----------------|-------------|
| HTTPS Everywhere | Usar streams `https://` exclusivamente | ⭐⭐⭐⭐⭐ |
| DNS-over-HTTPS | Resolver por `https://1.1.1.1/dns-query` | ⭐⭐⭐⭐ |
| Encrypted ClientHello | ECH en navegadores modernos | ⭐⭐⭐⭐⭐ |
| VPN + Obfuscation | WireGuard con obfuscated servers | ⭐⭐⭐⭐⭐ |
| Shadowsocks/V2Ray | Tunnel SOCKS5 con obfuscation | ⭐⭐⭐⭐ |

### 3. CONNECT Tunnel Bypass

Para bypass total de proxy transparente ISP:
```
CONNECT stream.server.com:443 HTTP/1.1
Host: stream.server.com:443
Proxy-Authorization: Basic Og==
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0
```
Una vez establecido el túnel CONNECT, todo el tráfico posterior es opaco para el proxy.

### 4. Transparent Proxy Detection

Para determinar si hay un transparent proxy ISP interceptando:
```javascript
// Detectar transparent proxy
async function detectTransparentProxy() {
    const checks = [
        { url: 'https://httpbin.org/headers', field: 'Via' },
        { url: 'https://httpbin.org/headers', field: 'X-Forwarded-For' },
        { url: 'https://httpbin.org/ip', field: 'origin' }
    ];
    for (const check of checks) {
        try {
            const resp = await fetch(check.url);
            const data = await resp.json();
            if (data.headers?.[check.field]) {
                console.log(`🚨 Transparent Proxy detectado: ${check.field} = ${data.headers[check.field]}`);
                return true;
            }
        } catch(e) {}
    }
    return false;
}
```

---

## Player-Specific Configuration

### OTT Navigator
- **Settings → Provider → Custom Headers**: `User-Agent`, `Referer`
- **v1.7.4.1+**: Soporta UA separado para API vs stream requests
- **Proxy**: Settings → Network → HTTP Proxy (soporta SOCKS5)

### VLC
```
#EXTVLCOPT:http-user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0
#EXTVLCOPT:http-referrer=https://www.google.com/
#EXTVLCOPT:http-proxy=socks5://127.0.0.1:1080
#EXTVLCOPT:no-http-forward-cookies
```

### Kodi
```
#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Chrome/131.0.0.0&Referer=https://www.google.com/
#KODIPROP:inputstream=inputstream.adaptive
#KODIPROP:inputstream.adaptive.manifest_type=hls
```

### TiviMate
- Settings → Playlist → User Agent: Configurar UA personalizado
- Settings → Network → Use VPN: Habilitar para bypass ISP

---

## Flujo de Escalamiento Completo

```
Error detectado
│
├── 3xx? → Seguir redirect automáticamente
│
├── 401? → Renovar credenciales → Reintentar
│
├── 403? → UA Rotation → Referer Spoof → XFF → X-Original-URL → Method Switch → VPN
│
├── 407? → Basic Og== → NTLM Probe → Digest Probe → CONNECT Tunnel → VPN
│
├── 429? → Backoff Exponencial → IP Rotation → Session Rotation → HTTP/2 Multiplex
│
├── 451? → XFF con IP target → CF-Connecting-IP → DNS-over-HTTPS → VPN
│
├── 500? → Retry con genoma mutado (3 intentos)
│
├── 502? → Headers limpios → TS directo → Retry
│
├── 503? → Protocol degradation → Connection:close → Retry con backoff
│
└── 504? → Timeout escalamiento → CDN IP rotation → Retry
```

---

## Integración con Fusión Fantasma v22.1

Los módulos existentes ya implementan parte de este skill:

| Módulo | Cobertura |
|--------|-----------|
| `IPTV_SUPPORT_CORTEX_V3` | Árbol de decisión 403/407/429/451/500/502/503/504 |
| `PRE_ARMED_RESPONSE_BUILDER` | Fallbacks pre-armados para 403/407/429/451/503 |
| `APEAtomicStealthEngine` | Genomas mutados con feedback de error codes |
| `evasion-407-supremo.js` | 51 metadatos + 8 técnicas (solo 407) |
| **Este skill** | Extiende cobertura a TODOS los errores + técnicas avanzadas |

---

## Archivos de Referencia

- `scripts/transparent_proxy_detector.js` — Detector de proxy transparente ISP
- `scripts/ntlm_probe.js` — Sondeo NTLM Type 1/2/3 contra proxies ISP
- `scripts/backoff_engine.js` — Motor de exponential backoff con jitter
- `references/ja3_fingerprints.md` — Base de datos JA3/JA4 por player
- `references/isp_proxy_database.md` — ISPs conocidos con transparent proxy (Telmex, Claro, etc.)
- `references/hacktricks_403_bypass.md` — Técnicas HackTricks compiladas
