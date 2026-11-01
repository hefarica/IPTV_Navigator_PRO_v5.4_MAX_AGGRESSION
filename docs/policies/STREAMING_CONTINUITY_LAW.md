# LEY DE CONTINUIDAD Y PERSISTENCIA DE STREAMING

**Estado:** OBLIGATORIA  
**Ámbito:** listas, JIT, VPS, nginx, ARA y players  
**Vigencia:** desde 2026-11-01

## Artículo 1 — Manifiestos siempre frescos

Todo manifiesto HLS `.m3u8` y DASH `.mpd` debe responder con:

```text
Cache-Control: no-cache, no-store, must-revalidate, private, max-age=0
Pragma: no-cache
Expires: 0
```

Un manifiesto cacheado no puede gobernar una sesión en vivo.

## Artículo 2 — Segmentos únicos por sesión

Cada inicio de FFmpeg debe producir nombres nuevos:

```text
init-<session>-<representation>.m4s
chunk-<session>-<representation>-<number>.m4s
```

Prohibido reutilizar `init-0.m4s` o `chunk-0-1.m4s` entre sesiones.

## Artículo 3 — 206 exacto

Cada respuesta Range debe incluir:

```text
HTTP 206
Accept-Ranges: bytes
Content-Range: bytes START-END/TOTAL
Content-Length: END-START+1
Content-Type: video/iso.segment
```

Un 206 con `Content-Length` total o con `Content-Range` mal formado es una violación.

## Artículo 4 — Sin caché de segmentos

Los segmentos deben llevar:

```text
Cache-Control: no-cache, no-store, must-revalidate, private, max-age=0
Pragma: no-cache
Expires: 0
Vary: *
ETag: dinámico
X-Cache-Control: no-transform
Surrogate-Control: no-store
```

No se permite `immutable` mientras los nombres de segmento puedan reutilizarse.

## Artículo 5 — Conexión y CORS

```text
Connection: keep-alive
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, ETag
OPTIONS → 204
```

## Artículo 6 — Clasificación de listas

Toda lista debe declarar su transporte:

```text
JIT_CONTROLLED   → URLs /jit/live/... ; cumple Artículos 1–5
VPS_CDN          → URLs /cdn/... ; segmentos del proveedor
DIRECT_PROVIDER  → URLs del proveedor ; no controlado por el VPS
```

Las listas `VPS_CDN` y `DIRECT_PROVIDER` no pueden prometer control de segmentos ni nombres únicos. Deben declararlo.

## Artículo 7 — Fallback obligatorio

Toda salida controlada debe tener:

```text
HDR → SDR 1080 → SDR 720
```

Si un decoder falla, ARA cambia de variante; nunca declara un códec que el device no inicializa.

## Artículo 8 — Prohibición de etiquetas falsas

Prohibido emitir:

```text
4KFALSE
8KFAKE
DV PROFILE inventado
LCEVC inventado sin layer real
AI-SR/AI-FI sin engine real
bitrate declarado sin medición
```

## Artículo 9 — Gate de CI

Ningún cambio de streaming se considera entregado si no pasa:

```bash
node tools/certify_http_200_206_302.js
node tools/verify_streaming_headers.js
node tools/check_streaming_continuity.js
```

El workflow `.github/workflows/streaming-continuity.yml` es obligatorio.

## Artículo 10 — Despliegue y rollback

Todo despliegue de JIT/nginx pasa por:

```text
.github/workflows/deploy-streaming.yml
```

Requiere `confirm=APPLY` y aprobación del Environment `production`.  
Debe existir backup de nginx y de `/opt/ape-jit/server.js`.

## Artículo 11 — Verdad operativa

El VPS no puede convertir una fuente 4K de 3 Mbps en 4K de 25 Mbps sin recodificar.  
La ley exige **declarar el bitrate real** y separar:

```text
profile target
measured source bitrate
```

No se permite usar un target de perfil como si fuera ancho de banda medido.
