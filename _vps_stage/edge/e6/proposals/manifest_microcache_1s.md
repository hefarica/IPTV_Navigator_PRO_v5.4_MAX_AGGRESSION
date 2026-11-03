# Propuesta E6 · Micro-caché de manifiesto (1 s por host+path+args)

> **Estado: NO-GO como palanca de latencia.** Documento de diseño por si el capitán decide
> implementarla por otra razón (amortiguar ráfagas). **No se ha implementado nada.**
> Base medida: [`docs/edge/PAYLOAD.md`](../../../../docs/edge/PAYLOAD.md) · run [`runs/20261026T204034Z`](../runs/20261026T204034Z/payload.json).
> Autor: `lista-payload` (t6) · 2026-10-26.

---

## 1 · Qué se propone exactamente

Una caché de **1 segundo** del **cuerpo del manifiesto** servido por el gateway `/cdn/`,
con clave **`host + path + args`**, que devuelva el mismo cuerpo a peticiones que llegan
dentro de esa ventana. **No** cachea redirecciones (302/301), ni errores, ni la lista
`/lists/`, ni segmentos (los segmentos no pasan por el VPS: `.ts → 404`).

**Objetivo declarado:** reducir el `X-APE-Upstream-Ms` (690–750 ms medidos) en peticiones
repetidas de la misma clave.

---

## 2 · Base medida (por qué el techo es bajo)

| Hecho medido | Valor | Fuente |
|---|---|---|
| Peticiones externas `/cdn/` en 20,5 h | **223** | log `playlist_access.log` (00:03–20:37Z) |
| Llegan **≤1 s** después de otra con la misma clave | **19 (8,5 %)** | análisis de intervalos por clave |
| Llegan **1–5 s** después | 15 (6,7 %) | ídem |
| Llegan **5–30 s** después | **86 (38,6 %)** | ídem |
| `502` en ese tráfico | **57 (25,6 %)** | ídem — **jamás cacheables** |
| Fetch al proveedor por petición | `X-APE-Upstream-Ms` 690–750 ms | sonda E6 |
| Playlists medidas | `TARGETDURATION` 10–11 s, 3–6 segmentos, **sin query/token** | 6 canales, 4 hosts |
| Cambio del cuerpo | idéntico a 1 s; cambia a los ~3 s (ch5 `MEDIA-SEQUENCE` 120→121) | sonda controlada |
| Respuesta del gateway | `200`, `chunked`, `Cache-Control: no-store`, `X-APE-*` | sonda |

**Aritmética del beneficio:** 8,5 % × ~700 ms ≈ **60 ms de media** sobre el agregado
(con la caché ya caliente y sin fallos). No mueve el objetivo 708→350 ms. El techo
interesante está en 5–30 s (**53,8 %**), que corresponde a la **fase 3** (caché del
destino del 302), no a esta micro-caché.

---

## 3 · ¿Altera la semántica live? (la pregunta que manda)

Con los datos medidos: **no de forma peligrosa**, con tres guardas:

1. **Estaleness acotada por el `TARGETDURATION` del proveedor.** 1 s sobre un TD de 10–11 s
   es ≤10 % del intervalo de sondeo del player. Los segmentos listados siguen siendo válidos
   (ventana de ~30–60 s en el CDN del proveedor).
2. **Sin tokens en el cuerpo rebasado.** Verificado en 6 canales: las URIs son
   `http://<origen>/hls/<hash>/<id>_<seq>.ts`, **sin query**. Si un canal sirviera tokens
   por petición, la entrada cacheada reutilizaría el token de otra petición ⇒ **guard
   obligatorio**: solo cachear si el cuerpo no contiene `?` en las URIs (chequeo barato con
   `string.find(body, "?", 1, true)`).
3. **Nunca cachear no-200.** 25,6 % del tráfico son 502: un 502 cacheado 1 s es un fallo
   propagado a otro cliente. Solo `200` con cuerpo completo.

**Lo que NO cambia:** ni `CODECS=`, ni `VIDEO-RANGE=PQ`, ni el rebase, ni el wake-on-manifest,
ni la regla `.ts→404`, ni `proxy_cache_valid 302` (sigue 0), ni `ngx.exit(503)`.

---

## 4 · Dos diseños posibles

### Opción A — `proxy_cache` de nginx en el location `/cdn/` del 443

```nginx
# NO APLICADO — borrador para discusión
proxy_cache            iptv_cache;                 # ya existe: /dev/shm/nginx_cache 50m/500m
proxy_cache_key        "$scheme$host$uri$is_args$args";
proxy_cache_valid      200 1s;                     # SOLO 200; 302/301 quedan fuera (doctrina)
proxy_cache_lock       on;                         # colapsa la ráfaga: 1 fetch, el resto espera
proxy_cache_use_stale  off;
proxy_ignore_headers   Cache-Control Expires Set-Cookie;  # el gateway manda no-store
proxy_cache_background_update off;
add_header             X-APE-Cache $upstream_cache_status always;
```

**Pros:** cero Lua; `proxy_cache_path` ya existe; `proxy_cache_lock` resuelve el caso
«10 clientes a la vez».

**Contras (por los que NO se recomienda):**
- **Replay de cabeceras del gateway**: el hit devolvería `X-APE-Upstream-Ms` **viejo** (una
  mentira de observabilidad) y `X-APE-Origin/Failover` congelados. Exigiría un
  `header_filter_by_lua` en el 443 para reescribirlas — pero el 443 ya delega todo el
  contenido al 8088 y añadir fases Lua ahí es superficie nueva.
- **Credenciales en la clave**: `$uri` incluye `/live/<USER>/<PASS>/`. nginx guarda la clave
  en la cabecera del fichero de caché (en `/dev/shm`, RAM, pero persistente mientras viva la
  entrada). Mitigable con `proxy_cache_key` hasheado, que nginx no puede hacer sin Lua.
- **`proxy_ignore_headers Cache-Control`** desactiva una protección del upstream para *todas*
  las respuestas de ese location, no solo para el 200 de manifiesto.

### Opción B — micro-caché en `ngx.shared` dentro de `ape_gateway.lua` (recomendada si se hace)

```lua
-- NO APLICADO — boceto. Requiere lua_shared_dict nuevo en 50-ape-meta-plane.conf
-- lua_shared_dict ape_microcache 8m;
local mc = ngx.shared.ape_microcache
local key = ngx.md5(host .. "|" .. path .. "|" .. (qs or ""))
local hit = mc:get(key)
if hit then
  ngx.header["X-APE-Cache"] = "HIT"
  return ngx.print(hit)              -- cuerpo YA rebasado, tal cual
end
-- … fetch normal (subrequest) …
if status == 200 and not body:find("?", 1, true) then
  mc:set(key, body, 1)               -- TTL 1 s, expira solo (sin timers)
  ngx.header["X-APE-Cache"] = "MISS"
end
```

**Pros:** cabeceras **siempre frescas** (observabilidad honesta), sin credenciales en disco,
TTL de 1 s nativo de `ngx.shared` (`exptime`), no interfiere con `proxy_cache` ni con el 302,
y el `hit` no ejecuta el fetch al proveedor (ahorra los ~700 ms).
**Contras:** toca `ape_gateway.lua` (**`_vps_stage/lua/**` está bloqueado por otra sesión** y
el vivo ≠ el del repo: D-32 — el gateway desplegado es 267 líneas / `66a20017…`, no el del
repo). Requiere `luac -p`, backup, ventana §4 y reload.

---

## 5 · Guardas no negociables (si se implementa)

1. **Solo `200`** con cuerpo completo; `502/407/513/4xx` ⇒ nunca se guardan.
2. **Solo cuerpos sin `?`** en las URIs rebasadas (evita reutilizar tokens).
3. **TTL ≤ 1 s**; cualquier TTL mayor es otra fase (3) y otra decisión.
4. **Nunca** cachear 301/302 (`proxy_cache_valid 302` sigue 0).
5. **Nunca** cachear `/lists/` (la lista ya la sirve nginx estático; no pasa por Lua).
6. **Cabecera `X-APE-Cache: HIT|MISS`** siempre, para poder medir el acierto real.
7. **No** crear timers nuevos (`init_worker_by_lua`), ni `ngx.exit(503)`, ni circuit breaker.

---

## 6 · Criterios de aceptación (si el capitán da GO)

Con el arnés E6 y `curl` desde el VPS (mismo vhost, `--resolve 127.0.0.1`):

| # | Prueba | Criterio |
|---|---|---|
| 1 | `nginx -t` (o `luac -p` + `nginx -t` si es Lua) | OK, sin warnings nuevos |
| 2 | `curl` ×2 al mismo manifiesto separados 0,5 s | 2×`200`, `X-APE-Cache` `MISS`→`HIT`, cuerpo idéntico |
| 3 | `curl` ×2 separados 2 s | 2×`MISS` (TTL expiró) |
| 4 | manifiesto con proveedor caído (502) | **no** se cachea: siguiente petición vuelve a intentar |
| 5 | 10 peticiones concurrentes a la misma clave | 1 fetch al proveedor (`X-APE-Upstream-Ms` real en 1, resto `HIT`) |
| 6 | `GET /lists/APE_LISTA_4K.m3u8` (gzip y identity) | **sin cambios** (0 cabeceras nuevas, mismo peso, mismo ETag) |
| 7 | `GET /test.ts` | **404** (intacto) |
| 8 | `/_ape/health` | mismas claves; `error_ratio` no empeora |
| 9 | arnés E6 completo antes/después | `X-APE-Upstream-Ms` p50 con HIT < 10 ms; peso de la lista sin cambios |

---

## 7 · Rollback

- **Opción A:** `cp -a` del `.conf` respaldado → `nginx -t` → `systemctl reload nginx`.
  (El `proxy_cache` de `/dev/shm` se vacía solo al expirar; opcionalmente `rm -rf /dev/shm/nginx_cache/…`.)
- **Opción B:** restaurar `ape_gateway.lua` del backup → `luac -p` → `nginx -t` → `reload`.
  El `lua_shared_dict` nuevo puede quedarse (no se usa) o quitarse en el mismo cambio.

En ambos casos: backup con sufijo `.bak_<UTC>`, hash antes/después y prueba de la matriz de
aceptación §6 **después** del rollback.

---

## 8 · Coordinación obligatoria

- `_vps_stage/lua/**` y `_vps_stage/nginx/**` están **bloqueados por `dsh-lead`** (t46).
  Cualquier implementación de la opción B exige anuncio en `COORDENADAS_SESIONES.md` §2 y
  ventana en §4 (15 min), además de backup + `luac -p` + `nginx -t`.
- La opción A toca `/etc/nginx/sites-enabled/default` (o un snippet nuevo) ⇒ misma ventana.
- Este documento **no** autoriza nada: es material de decisión para el capitán.

---

## 9 · Recomendación final

**No implementar la micro-caché de 1 s ahora.** El techo medido (8,5 %) no justifica ni el
riesgo de tocar el gateway vivo ni la ventana. Si el objetivo es bajar el TTFB del manifiesto
de ~1.100 ms a <350 ms, la única palanca con margen es la **fase 3** (caché del destino del
302 a 30–60 s, techo 53,8 %), y esa fase **debe medir primero el split primer-hop vs CDN**
que E1 dejó pendiente. Si el objetivo es amortiguar ráfagas, la opción B con TTL 1 s es la
forma menos invasiva y ya está especificada aquí.
