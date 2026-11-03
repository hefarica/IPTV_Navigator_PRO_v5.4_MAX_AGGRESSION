# 28 · App alineada con la lista publicada (t61)

**Fecha:** 2026-10-29 · **Tarea:** t61 · REPO-ONLY: sin deploy, sin publicar lista, sin commit.
**Generador:** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` · 12.058 → **12.113 líneas** (+55) · sha256 **`922a31c889cd3d2d17fd0446385d576731aca44f215ec46cdf534ed8f6c7f7cd`**
**Wrapper:** intacto, == HEAD (`1a7e8ed4…`).

## 1. Qué se alineó

| # | Problema en la App | Arreglo | Verificado |
|---|---|---|---|
| 1 | **45 canales sin `#EXT-X-STREAM-INF`** (p. ej. tvg-id 904505/904507) ⇒ el player los trata 1080p | Si el bloque no tiene variante, se inserta la línea fija **inmediatamente antes de la URI**, conservando el resto | Unit: bloque `#EXTINF`+2 `#EXTVLCOPT`+URI ⇒ STREAM-INF insertado justo antes de la URI, con los 2 EXTVLCOPT y la URI intactos |
| 2 | Tags entre `#EXT-X-STREAM-INF` y la URI (rompe la regla HLS de que la URI sigue a la variante) | **Reorden**: lo que queda entre medias se **mueve** antes del STREAM-INF; no se borra ni se altera | Unit: STREAM-INF idx=7 y la línea siguiente **es** la URI; los 2 tags APE y el `#EXTHTTP` siguen presentes, ahora antes |
| 3 | Marcas 8K/4K-premium **sólo en nativos** (t60) | Ahora **en todos los canales**, una vez cada una | E2E: `8KFAKE=1`, `4K-PREMIUM=1` en el 100% de las corridas, sin duplicados |
| 4 | `/a` sólo con `window.APE_ATTRFROMURL.key` | **Mecanismo de configuración** con 3 fuentes (abajo) | E2E: `/a=1` con cada una de las 3 fuentes; `/a=0` sin ninguna |
| 5 | — | `RESOLUTION=3840x2160` + `CODECS="hvc1.2.4.L153.B0,mp4a.40.2"` se mantienen al 100% | E2E: 4K y HEVC/AAC en todos los STREAM-INF; `7680x4320` sólo con `APE_8K_DECLARE=true` |

**Línea fija insertada** (punto 1):
```
#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=3840x2160,FRAME-RATE=30.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
```

## 2. Configuración de la clave HMAC (punto 4) — 3 fuentes, en este orden

1. `window.APE_ATTRFROMURL.key` (o `.hmacKey`) — lo que ya existía.
2. `window.APE_CONFIG.ape_attrfromurl_key` — para inyectar desde el JSON de configuración de la App.
3. `<meta name="ape-attrfromurl-key" content="…">` — inyección desde el HTML.

La clave **nunca** se escribe en el archivo. **Sin clave en ninguna fuente: no se emite la línea `/a`** — no se firma un HMAC inválido. Ese caso es `NOT_RUN` por definición (no hay clave que usar).

## 3. Medición (fixture, 1 canal, perfil P1)

| Métrica | Sin clave | Con clave |
|---|---|---|
| Líneas | 897 | **898** (+1 = la línea `/a`) |
| `#EXT-X-STREAM-INF` | 1 (con 4K + HEVC/AAC) | 1 |
| Orden STREAM-INF → URI | correcto (idx 896, siguiente = URL) | correcto |
| `8KFAKE` / `4K-PREMIUM` / `4KFALSE-MODE` | 1 / 1 / 1 (sin duplicar) | 1 / 1 / 1 |
| `/a` real | **0** | **1** |
| Legacy `#EXTATTRFROMURL:X-APE` | 54 | 54 |
| URL-1 | intacta | **intacta** |

Sin tocar: `EXTVLCOPT` 122 · `KODIPROP` 86 · `#EXTHTTP` 1 (203 claves) · `#EXTINF` 1 · URLs. `node -c` **exit 0** ×3 · sin BOM (byte 47).

## 4. Cambio de criterio declarado

El punto 3 **sustituye** la regla de t60 (marcas sólo en canales nativos): ahora **todo** canal declara `8KFAKE` + `4K-PREMIUM`, incluidos los 1080p/720p/480p. Se mantiene la mitigación anti-freeze: el 8K va marcado `NEVER_REAL=1` y **no** se declara `RESOLUTION=7680x4320`.

## 5. NOT_RUN

1. **Lista de 10.520 no regenerada ni publicada** (ventana aparte): cifras de 1 canal.
2. **Sin clave configurada ⇒ `/a` no se emite**: es el estado actual del repo (no hay JSON/HTML de config con clave). Generar la lista **con** `/a` exige inyectar la clave por una de las 3 vías.
3. **Sin prueba en dispositivo**: no se midió si los 45 canales ahora declarados 4K HEVC se reproducen o fallan en TiviMate/VLC/OTT.
4. Sin deploy; `_vps_stage/**`, DB y listas intactas; **sin commit**.
