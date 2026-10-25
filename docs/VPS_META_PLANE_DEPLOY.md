# Despliegue del META-PLANE (metadata-only) en el VPS

> Ejecutado **2026-10-24 15:32 UTC**. Host: `178.156.147.234` (`iptv-ape.duckdns.org`).
> Backup previo: `/root/ape-meta-plane-backup-20261024T153200Z/`.
> Bundle de trabajo: `/root/ape-meta-plane-20261024/` (local: `_vps_stage/`).

## 1. Qué se desplegó

| Artefacto | Destino | Tamaño |
|---|---|---|
| `ape_uri_rebase.lua` | `/etc/nginx/lua/ape_uri_rebase.lua` | ~6 KB |
| vhost metadata-only | `/etc/nginx/conf.d/50-ape-meta-plane.conf` | ~2 KB |
| fixture de self-test | `/etc/nginx/ape-selftest/playlist.m3u8` | 203 B |

Escucha en **:8088** (no toca el vhost público del 443). Las peticiones al 443 no cambian.

## 2. Contrato que implementa

- El VPS sirve **solo texto de playlist**: `GET /meta/<host-proveedor>/<ruta>.m3u8`.
- Cada URI relativa (variantes, segmentos) y cada `URI="..."`
  (`#EXT-X-KEY`, `#EXT-X-MAP`, `#EXT-X-PART`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-MEDIA`,
  `#EXT-X-I-FRAME-STREAM-INF`) se reescribe a **absoluta del proveedor** → el player nunca
  pide segmentos al VPS.
- **Candado**: `location ~* \.(ts|m4s|mp4|m4a|aac|vtt|key)` → `404`. Si una URI se escapara,
  falla ruidoso en vez de convertirse en CDN de video.
- Timeouts cortos (connect 3 s, read 5 s): fallar rápido y que el player reintente.

## 3. Dos trampas de nginx descubiertas empíricamente (documentadas para el futuro)

1. **`body_filter_by_lua*` NO se ejecuta sobre respuestas servidas por el handler estático.**
   Verificado: un stub que ponía `ngx.arg[1] = "#STUB"` no alteraba la salida de un `alias`.
   Por eso el self-test usa `proxy_pass` (la ruta real de producción) y no un fichero estático.
2. **El "global write guard" de OpenResty BLOQUEA escribir globales.** El patrón
   `function body_filter() ... end` (típico de OpenResty "de manual") **no funciona** en
   `libnginx-mod-http-lua 0.10.26`: el write a `_G` se descarta y el filtro nunca corre.
   En `*_by_lua_file` de fase body_filter **el archivo es el handler** y se ejecuta por chunk.
   El módulo actual está escrito así (todo `local`, estado en `ngx.ctx`).
3. Detalle de arranque: `load_module` de `/etc/nginx/modules-enabled/*.conf` usa rutas
   **relativas al prefijo compilado** (`/usr/share/nginx`), así que un `nginx -t -c custom.conf -p /tmp/x`
   falla con `dlopen() modules/… failed` si se usa `-p`. Para tests: sin `-p`.
4. Los workers corren como `www-data`: los ficheros de test bajo `/root` dan
   `Permission denied` (13). Hay que servir desde `/tmp` o `/etc/nginx` con 644.

## 4. Evidencia de validación

Instancia aislada (`nginx -c /tmp/ape-test/nginx.conf`, puerto 8088, producción intacta):

```
[3] nginx -t -> syntax is ok / test is successful
[1] /__selftest.m3u8    status=200  mode=rebase-only
[2..4] ✓ http://provider.test/live/user/pass/1.m3u8
       ✓ http://provider.test/live/user/pass/1.ts
       ✓ URI="http://provider.test/key.bin"
[5]    ✓ /x.ts 404   ✓ /x.m4s 404   ✓ /x.mp4 404   ✓ /foo.aac 404
RESULTADO: OK — contrato metadata-only verificado   (RC=0)
```

Producción (tras `install.sh`, con `nginx -t` de la config real pasando antes del reload):

```
nginx -T | grep -c meta-plane   -> 1
ss -tlnp | grep 8088            -> nginx escuchando en 0.0.0.0:8088
smoke http://127.0.0.1:8088     -> RESULTADO: OK
```

Regresión del vhost público 443 (sin cambios respecto de la línea base):

| Endpoint | Antes | Después |
|---|---|---|
| `/prisma/api/channel-hdcp-bulk.php` | 200 | **200** |
| `/prisma/api/channel-pq-bulk.php` | 200 | **200** |
| `/api/netshield-sentinel.php` | 503 (`no snapshot yet`) | **503** (igual) |

**Estado externo:** `:8088` responde `000` desde internet → **el firewall lo bloquea**. Es lo esperado:
está desplegado y validado, pero **no expuesto**. Exponerlo requiere regla de firewall + TLS + decidir
si se publica como subruta del 443 (recomendado: `/meta/` en el vhost existente, para no abrir puerto nuevo).

## 5. Uso

```bash
# playlist de un proveedor, con URIs rebasadas a absolutas
curl -si "http://127.0.0.1:8088/meta/line.tivi-ott.net/live/USER/PASS/1.m3u8"
# -> X-APE-Meta-Mode: rebase-only
# -> body con http://line.tivi-ott.net/live/... absolutas
```

## 6. Rollback (un comando)

```bash
bash /root/ape-meta-plane-20261024/scripts/rollback.sh
```
Quita el vhost, el módulo y el fixture; valida con `nginx -t` y recarga. Idempotente.

## 7. Límites honestos de este despliegue

- **No upscalea nada.** Este plano es de metadata. En esta máquina (3 vCPU, 3.8 GB, `NO_GPU`)
  el transcode 4K realtime es físicamente imposible; ver `docs/VPS_UPSCALE_4K_DESIGN.md`.
- **No sustituye al intercept actual** (que además no está desplegado: no hay listener en :80 y
  `nginx -T` no tiene ni una directiva Lua antes de este despliegue).
- El plano de metadata **no debe** convertirse en el camino del video: el candado 404 existe
  precisamente para impedirlo.
- Falta el paso de exposición (firewall + TLS) y la integración con el generador para que emita
  URLs `/meta/...` en las listas.
