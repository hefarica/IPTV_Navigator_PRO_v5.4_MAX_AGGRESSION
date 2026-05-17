# Arbol de Decision del Motor USA v2.0 — vNext

## Deteccion de Tipo de Servidor (detectServerFingerprint)

```
creds._forceTS === true?
  SI → FRONTCDN (302, .ts)

creds._frontCDNHost definido?
  SI → FRONTCDN (302, .ts)

Dominio en FRONTCDN_FORCE_TS_HOSTS? (ky-tv.cc, kemotv.cc, frontcdn.*)
  SI → FRONTCDN (302, .ts)

URL contiene /portal.php, /stalker_portal, get.php, /c/?
  SI → STALKER (200, .ts)

URL empieza con https://?
  SI → XTREAM_HTTPS (200, .m3u8)

DEFAULT → XTREAM_HTTP (200, .m3u8)
```

## Construccion de URL (buildUniversalUrl)

| Tipo | URL | Extension | Notas |
|---|---|---|---|
| XTREAM_HTTP | `http://HOST/live/U/P/ID.m3u8` | .m3u8 | URL limpia |
| XTREAM_HTTPS | `https://HOST/live/U/P/ID.m3u8` | .m3u8 | Protocolo sagrado |
| FRONTCDN | Token cache o _frontCDNHost | .ts | Cache > CDNHost > directo |
| STALKER | Portal con MAC en query | .ts | Fallback a Xtream sin MAC |
| VOD | `BASE/movie/U/P/ID.mp4` | .mp4 | container_extension del canal |

## Directivas Polimorficas por Tipo

### XTREAM_HTTP

```
#EXTVLCOPT:network-caching=8000
#EXTVLCOPT:http-reconnect=true
#EXTVLCOPT:network-reconnect-delay=50
#KODIPROP:inputstream.adaptive.manifest_update_parameter=full
X-Forwarded-Proto: http
Sec-Fetch-Site: same-origin
```

### XTREAM_HTTPS

```
#EXTVLCOPT:network-caching=4000
#EXTVLCOPT:http-reconnect=true
#EXTVLCOPT:network-reconnect-delay=100
#KODIPROP:inputstream.adaptive.ssl_verify_peer=false
#KODIPROP:inputstream.adaptive.ssl_verify_host=false
X-Forwarded-Proto: https
Upgrade-Insecure-Requests: 1
Sec-Fetch-Site: cross-site
```

### FRONTCDN (302)

```
#EXTVLCOPT:http-forward=true
#EXTVLCOPT:http-reconnect=true
#EXTVLCOPT:live-caching=60000
#EXTVLCOPT:network-caching=60000
#EXTVLCOPT:network-reconnect-delay=200
#KODIPROP:inputstream.adaptive.manifest_update_parameter=full
#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive
X-Cache-Control: no-store
X-Redirect-Follow: true
```

### STALKER

```
#EXTVLCOPT:network-caching=12000
#EXTVLCOPT:http-reconnect=true
X-Stalker-Auth: token
Sec-Fetch-Site: same-origin
```

## Headers Universales (todos los tipos)

```
X-USA-Version: 2.0
X-USA-Proto: http|https
X-USA-Host: hostname
X-USA-Port: 80|443|...
X-USA-Idempotency-Key: [hash 8 hex]
```

## Cache de Idempotencia

Clave: `${baseUrl}|${_forceTS}|${_frontCDNHost}|${_forceHTTPS}`
Storage: `globalThis.__APE_USA_SERVER_CACHE__` (Map)
Mismo servidor = mismo fingerprint siempre.

## Precedencia de Overrides

```javascript
const merged = Object.assign({}, overrides.exthttp, baseHeaders);
// baseHeaders GANA sobre overrides
// EXTVLCOPT y KODIPROP del USA se AGREGAN, no reemplazan
```
