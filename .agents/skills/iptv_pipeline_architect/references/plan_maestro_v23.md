# Plan Maestro v23 — Referencia de Codigo Exacto

Version: 23.0.0-OMEGA-CRYSTAL-UNIVERSAL

## PASO 1 — URL limpia (B5 + A7)

Eliminar bloque de inyeccion ape_sid (lineas ~6599-6603):

```javascript
// ELIMINAR:
if (primaryUrl) {
    let sep = primaryUrl.includes('?') ? '&' : '?';
    if (!primaryUrl.includes('ape_sid=')) {
        primaryUrl += `${sep}ape_sid=${_sid796}&ape_nonce=${_nonce796}`;
    }
}
```

Reemplazar getTierUrl:

```javascript
const getTierUrl = (url) => {
    if (!url) return '';
    return url
        .replace(/[?&]ape_sid=[^&]*/g, '')
        .replace(/[?&]ape_nonce=[^&]*/g, '')
        .replace(/[?&]profile=[^&]*/g, '')
        .replace(/&&+/g, '&')
        .replace(/\?&/g, '?')
        .replace(/[?&]$/, '');
};
```

## PASO 2 — Semaforo FrontCDN (A10)

```javascript
async function preResolveFrontCDNRedirects(channels, credentialsMap) {
    if (window.__APE_FRONTCDN_RESOLVING__) {
        return window.__APE_FRONTCDN_RESOLVE_PROMISE__;
    }
    window.__APE_FRONTCDN_RESOLVING__ = true;
    window.__APE_FRONTCDN_RESOLVE_PROMISE__ = (async () => {
        try {
            // ... logica existente ...
        } finally {
            window.__APE_FRONTCDN_RESOLVING__ = false;
        }
    })();
    return window.__APE_FRONTCDN_RESOLVE_PROMISE__;
}
```

## PASO 3 — Pipeline EXTHTTP unificado (D1 + D3)

Eliminar `build_exthttp()` de `generateChannelEntry()`.
Nuevo L2 unificado:

```javascript
// SUB-CAPA A: Headers funcionales (<3KB)
const _httpFunctional = {
    "User-Agent": _ua796,
    "Accept": "application/vnd.apple.mpegurl,*/*;q=0.9",
    "Accept-Encoding": "identity",
    "Connection": "keep-alive",
    "Referer": channelReferer,
    "Origin": channelOrigin,
    "Cache-Control": "no-cache",
    "Range": "bytes=0-",
    "Sec-Fetch-Dest": "video",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "Authorization": `Bearer ${_jwtToken}`,
    "Cookie": _buildApeCookie(cfg, profile, _sid796, classification),
};

// SUB-CAPA E: Overflow en base64
const _httpOverflow = _buildOverflowHeaders(cfg, profile, index);
for (const key of Object.keys(_httpFunctional)) {
    delete _httpOverflow[key];
}

lines.push(`#EXTHTTP:${JSON.stringify(_httpFunctional)}`);

if (Object.keys(_httpOverflow).length > 0) {
    const overflowB64 = btoa(unescape(encodeURIComponent(JSON.stringify(_httpOverflow))));
    lines.push(`#EXT-X-APE-OVERFLOW-HEADERS:${overflowB64}`);
}
```

## PASO 4 — JWT real (D2)

```javascript
function generateJWT68Fields(channel, profile, index) {
    const cfg = getProfileConfig(profile);
    const now = Math.floor(Date.now() / 1000);
    const jti = generateRandomString(16);
    const payload = {
        iss: 'APE_v23.0', iat: now, exp: now + 86400, jti,
        chn: channel.name || '', chn_id: String(channel.stream_id || ''),
        p: profile, res: cfg.resolution, fps: cfg.fps, br: cfg.bitrate,
        codec: cfg.codec_primary, hdr: (cfg.hdr_support || []).join(','),
        buf: cfg.buffer_ms || 60000, v: VERSION, arch: 'OMEGA_CRYSTAL_V5',
    };
    const header = btoa(JSON.stringify({alg:'none',typ:'JWT'})).replace(/=+$/,'');
    const body = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/,'');
    return { token: `${header}.${body}.`, payload, sessionId: jti };
}
```

## PASO 5 — Extension dinamica (B6)

```javascript
function resolveStreamExtension(creds, channel) {
    if (isFrontCDNHost(creds.baseUrl, creds)) return 'ts';
    if (creds._serverType === 'stalker') return 'ts';
    if (creds.streamFormat) return creds.streamFormat;
    if (channel.container_extension) return channel.container_extension;
    return creds.preferM3U8 !== false ? 'm3u8' : 'ts';
}
```

## PASO 6 — Conectar buildUniversalUrl (D4)

```javascript
let primaryUrl = '';
const _usaCreds = (() => {
    const sid = channel.serverId || channel._source || '';
    return credentialsMap[sid] || credentialsMap['__current__'] || {};
})();
const _fp = detectServerFingerprint(_usaCreds.baseUrl || '', _usaCreds);
primaryUrl = buildUniversalUrl(channel, _usaCreds, _fp, profile);
if (!primaryUrl) {
    primaryUrl = (typeof buildChannelUrl === 'function')
        ? buildChannelUrl(channel, jwt, profile, index, credentialsMap)
        : (channel.url || channel.src || '');
}
primaryUrl = getTierUrl(primaryUrl);
```

## PASO 7 — Limpieza (D5 + D6)

Eliminar `__getOmegaGodTierDirectives()` (codigo muerto).
Unificar: `const VERSION = '23.0.0-OMEGA-CRYSTAL-UNIVERSAL';`

## PASO 8 — ESSENTIAL_KEYS

```javascript
const ESSENTIAL_KEYS = new Set([
    'User-Agent', 'Accept', 'Accept-Encoding', 'Accept-Language',
    'Connection', 'Keep-Alive', 'Referer', 'Origin', 'Cookie',
    'X-Forwarded-For', 'X-Real-IP', 'Cache-Control', 'Range',
    'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site',
    'Sec-CH-UA', 'Sec-CH-UA-Platform', 'Authorization',
    'X-Playback-Session-Id', 'X-Request-Id', 'X-USA-Idempotency-Key',
    'X-QoS-Mode', 'X-Priority',
]);
```

## Orden de Dependencias

```
Paso 1 → Paso 6 → Paso 5
Paso 2 (independiente)
Paso 3 → Paso 4 → Paso 8
Paso 7 (independiente, ultimo)
```
