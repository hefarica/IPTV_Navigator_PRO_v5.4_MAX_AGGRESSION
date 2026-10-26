# VPS_LUA_MODULES — Inventario medido de `/etc/nginx/lua/`: hashes, mtime, función, orden de fases e invariantes

**Método:** `ssh hetzner-iptv 'cd /etc/nginx/lua && sha256sum *.lua'` + `stat -c "%n|%s|%y"` + lectura de cabeceras + `grep -n` de `pcall` / `ngx.exit`.
**Naturaleza:** lectura de archivos. Cero escrituras, cero recargas. Ver `VPS_READONLY_ATTESTATION.md`.
**Motor Lua:** `nginx/1.24.0 (Ubuntu)` + `ngx_http_lua_module.so` (443 320 B, mtime `2024-01-19`), versión de módulo declarada por el propio código: **libnginx-mod-http-lua 0.10.26**. **No hay `luajit` CLI ni OpenResty** — el intérprete real es el de nginx (`ape_luatest.lua` lo dice explícitamente: «ejecutados por el LuaJIT real de nginx (no hay luajit CLI en el VPS)»).

**`lua_package_path`** (definido UNA sola vez, `nginx.conf:25`):
`"/etc/nginx/lua/?.lua;/usr/local/share/lua/5.1/?.lua;/usr/share/lua/5.1/?.lua;;"`

---

## 1. Inventario completo (14 módulos)

mtime uniforme del directorio y de **todos** los archivos: **`2026-10-24 17:59:36 UTC`** (despliegue en lote; el directorio `/etc/nginx/lua/` mtime `2026-10-24 17:59:36.897964691`). Diferencia máxima entre archivos: 13 ms → **una sola operación de despliegue**.

| # | Módulo | Bytes | sha256 | mtime (UTC, 2026-10-24) |
|---|---|---|---|---|
| 1 | `ape_gateway.lua` | 11 651 | `66a2001730d7e2b566d9baa0b9ce697bd413544395a82e5d8f8b8bb6c869fdf5` | `17:59:36.886964592` |
| 2 | `ape_header.lua` | 2 210 | `a15e1fe3748ff95c5074777c8ea6d46b000c9c446b486e4631f6a8e7e0406968` | `17:59:36.894964664` |
| 3 | `ape_lab_api.lua` | 1 124 | `c457267953e0d69685146bb2ee999c62ac080647035b378bb2a29f5ff58fac71` | `17:59:36.890964628` |
| 4 | `ape_lab_bridge.lua` | 7 723 | `d0cae6166fd41f104d08b937a3f5fa6b640c86f26f78e7ed9a76041eaba92c61` | `17:59:36.889964619` |
| 5 | `ape_lab_upload.lua` | 4 723 | `b5c4d5f16d3e6bbf36c0a46e08cfed7bf6ce92b646bb5e441ff5f5945fb5f4af` | `17:59:36.891964637` |
| 6 | `ape_luatest.lua` | 10 711 | `98a29c444f1bca0f59d4b15a7426eaf8e64e7745d12caaba54266019c37eb37d` | `17:59:36.892964646` |
| 7 | `ape_obs.lua` | 4 030 | `f477741bcfa600bb44801d44b83a62777848d4b11e5305a7327bee09d1fdc6d0` | `17:59:36.887964601` |
| 8 | `ape_profile_resolver.lua` | 4 191 | `432610e6a4844d9528922a9570636fe42b13e6afa8c47eb0fe3b6bdec6a04508` | `17:59:36.897964691` |
| 9 | `ape_rebase_lib.lua` | 4 646 | `88140fc80ece09caeb705a2fdb681485607c12f56cb4274d72132e58d7e515fc` | `17:59:36.885964584` |
| 10 | `ape_uhd.lua` | 5 320 | `f1f5eb674744858ae7c5e84c73262e37545b0c84e557c6466cad20ae7b1f3b5e` | `17:59:36.888964610` |
| 11 | `ape_uri_rebase.lua` | 6 043 | `1d456a463f9bcd656fe566bf31b2ae0b6a852f5f46f90d7fba7f69234d8dbaf3` | `17:59:36.884964574` |
| 12 | `ape_wake_on_manifest.lua` | 2 284 | `d9c6b65d7626cd3630e76e185bca1ec932b4db324bbbd8337ae445630796db19` | `17:59:36.895964673` |
| 13 | `bw_adaptive_floor.lua` | 9 075 | `b1a22492bef2ee4874e4f1b6179ccb5898095352b8965f2e4c3837883f77cedc` | `17:59:36.896964682` |
| 14 | `sentinel_auth_guard.lua` | 7 207 | `dd1d328bbe4e0c28cbc454d2e50abf714ff0a82d327132cb3b5b5e5865cbcdbf` | `17:59:36.893964655` |

**Total:** 14 archivos · 87 736 B · un único `mtime` de lote.

---

## 2. Función declarada de cada módulo (leída de su cabecera, no inferida)

| Módulo | Fase / rol | Función declarada por el propio archivo |
|---|---|---|
| `ape_gateway.lua` | `content_by_lua_file` | **APE GATEWAY v4** — handler del plano de metadata en `/cdn/<host>[:puerto]/<ruta>.m3u8[?alt=h2,h3]`. **Sigue hasta 3 redirecciones 302** con `ngx.location.capture` (sin `lua-resty-http`): verificado en producción que Xtream responde 302 a un CDN con token por petición (`line.tivi-ott.net → 185.89.249.7/live/play/<token>/<id>`); sin seguir el 302 el gateway servía **playlist vacía**. Rebasa las URIs al **origen final (CDN)**, no al proveedor. Anti-SSRF: sólo IP literal pública o host de allowlist; bloquea `10/8, 172.16/12, 192.168/16, 127/8, 169.254/16`. |
| `ape_header.lua` | `header_filter_by_lua_file` | **Composición única de cabeceras** (nginx admite *una* directiva `*_by_lua` por fase y location). Hace dos cosas: (1) **quita `Content-Length`** porque el `body_filter` reescribe el cuerpo y cambia el tamaño — «bug real medido: `Content-Length: 203` con cuerpo reescrito más largo» ⇒ nginx truncaba la respuesta; (2) ejecuta `sentinel_auth_guard` vía **`dofile`** para no duplicar sus 173 líneas (fuente única de verdad). |
| `ape_lab_api.lua` | `content_by_lua_file` | **APE LAB API** — expone el puente LAB en `/_ape/lab` (loopback). Serializa con `cjson.safe`. |
| `ape_lab_bridge.lua` | librería (`require`) | **APE LAB BRIDGE v2 — Excel → LAB (DNA) → VPS.** Prioridad SSOT: (1) `/var/www/html/prisma/config/lab_master_22.6.0.json` (DNA exportada del Excel `LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json`) manda; (2) `floor_lock_config.json` + `profile_boost_multipliers` + `telescope_thresholds` como fallback. Cache 60 s en `lab_config`. **Reporta `drift` cuando el export viejo difiere de la DNA.** ← *este módulo es el punto de contacto VPS↔JSON LAB, relevante para la cadena SSOT.* |
| `ape_lab_upload.lua` | `content_by_lua_file` | **POST `/ape/lab-upload`** — recibe el `LAB_CALIBRATED_*.json`, lo valida y lo escribe **atómicamente** en `/var/www/html/prisma/config/lab_master_22.6.0.json`, invalidando la cache del puente. Seguridad: sólo POST (405 en otro método) + cabecera `X-APE-Token` == contenido de `/etc/nginx/ape-lab-upload.token`. |
| `ape_luatest.lua` | `content_by_lua_file` | **Banco de pruebas de integración** ejecutado por el LuaJIT real de nginx. Cubre los dos módulos «cableados pero inertes»: `bw_adaptive_floor` y `ape_profile_resolver`. Devuelve `{pass, fail, total, results[]}`. |
| `ape_obs.lua` | `content_by_lua_file` | **Observabilidad** del plano: `/_ape/qoe` (contadores reales del shared dict) y `/_ape/health` (estado 24/7). **Honestidad declarada en el propio archivo:** «son del PLANO DE METADATA (peticiones de playlist, latencia de upstream, failovers). **NO son rebuffer del player**, que sólo puede medir el reproductor o el observador de segmentos (**no desplegado aquí porque este VPS no sirve video**)». `get_keys` con tope y bajo `pcall` para no bloquear. |
| `ape_profile_resolver.lua` | librería pura | **Resuelve el perfil P0–P5 server-side por identidad del canal** (`stream_id` de `/live/USER/PASS/<STREAMID>.m3u8`) para players que **no reenvían** `X-APE-Profile` (OkHttp/ExoPlayer: OTT Navigator/TiviMate/Smarters). Default **P2 (BYPASS, seguro)**; `by_streamid` escala sólo canales con evidencia QoE de bitrate sostenido. Nota de verdad verificada (2026-06-17) incluida: «los 6 perfiles fuerzan virtual_4k+PQ+codec POR IGUAL; la ÚNICA diferencia REAL es `floor_lock`». |
| `ape_rebase_lib.lua` | librería **pura (sin `ngx`)** | Fuente única de: rebase de URIs (variantes, segmentos, `URI="..."` de tags), inyección de `#EXT-X-SERVER-CONTROL` **sólo** para fuentes que ya traen `#EXT-X-PART`/`#EXT-X-PRELOAD-HINT` (LL-HLS real), y detección de tipo de playlist. `MAX_BODY = 4 MiB`. Ejercitable desde `/_ape/luatest`. |
| `ape_uhd.lua` | librería | **«4K prevalece / upscale declarado»** (decisión del propietario 2026-10-24). Reescribe `RESOLUTION=` de la variante TOP a `3840x2160`/`7680x4320` y opcionalmente añade `VIDEO-RANGE=PQ`. **NO toca `CODECS`** — guardia anti-freeze explícita: «declarar `hvc1.*` sobre bytes AVC 1080p es el FREEZE del 2026-06-08 (FZ-01)». **Cumple el refuerzo LEVER B** (no fake-4K-sobre-AVC). |
| `ape_uri_rebase.lua` | `body_filter_by_lua_file` | **Metadata-only edge.** Convierte toda URI relativa de la playlist en absoluta hacia el **origen del proveedor** para que el player **nunca** pida segmentos al VPS. Existe porque `vps/cmaf_worker.php` usa `-c:v copy` y **`combined_body_filter.lua` no rebasa URIs** → sin este filtro el player resolvería segmentos contra el VPS y el video pasaría por él. Documenta la semántica empírica de `body_filter_by_lua_file` en nginx 1.24 + lua 0.10.26 (el archivo **no** define una función llamada por chunk). |
| `ape_wake_on_manifest.lua` | `log_by_lua_file` | **Wake-on-Manifest AUTOPISTA-SAFE.** Cuando el player pide el `.m3u8(.gz)`, encola una señal de wake. Corre en **log phase (después de enviar la respuesta)** → cero impacto en TTFB. «**Nunca `ngx.exit`, nunca bloquea, nunca falla la request (todo bajo `pcall`). NO toca el cuerpo ni la URL.**» Cola en `/dev/shm/ape_wake_queue` (medido: 192 B, mtime `2026-10-24 17:59`). |
| `bw_adaptive_floor.lua` | librería **pura (sin `ngx`, sin shared dict)** | **Adaptive Floor** — convierte el `floor` estático de `combined_body_filter` (`cfg.floor_bps`) en un floor **adaptativo al ancho de banda medido** (`bw_state`/`bw_computed_request_bps`/`bw_ewma_bps`). Cierra el lazo roto documentado en `docs/LUA_ENGINES_IMAGE_MIRROR_AUDIT.md §Gaps#1`. Truth-guards horneados: **MAX IMAGE FIRST** (la variante de mayor score SIEMPRE se mantiene) y **NO CHANNEL LOSS** (nunca devuelve 0 variantes). |
| `sentinel_auth_guard.lua` | invocado desde `ape_header.lua` (`dofile`) | **Sentinel v1.0 — Auth Guard + UA Rotation + Provider Fingerprint.** Detecta 401/403 del upstream, incrementa contador de error del proveedor, rota UA, expone `X-APE-Sentinel`. **PASSTHROUGH**: «NEVER blocks, NEVER returns errors to the player», «✅ NEVER calls `ngx.exit()`». |

---

## 3. Orden de fases realmente cableado

| Fase nginx | Directiva en config | Archivo | ¿Existe la fase? |
|---|---|---|---|
| `rewrite_by_lua*` | — | — | **NO** (0 ocurrencias en `/etc/nginx`) |
| `access_by_lua*` | — | — | **NO** (0 ocurrencias) |
| `header_filter_by_lua_file` | sí | `ape_header.lua` (+`dofile sentinel_auth_guard.lua`) | SÍ |
| `body_filter_by_lua_file` | sí | `ape_uri_rebase.lua` | SÍ |
| `log_by_lua_file` | sí | `ape_wake_on_manifest.lua` | SÍ |
| `content_by_lua_file` | sí | `ape_obs.lua`, `ape_gateway.lua`, `ape_lab_api.lua`, `ape_lab_upload.lua`, `ape_luatest.lua` | SÍ |

**Orden efectivo por petición** (nginx lo garantiza por contrato de fases, no por config):

```
petición → [contenido: ape_gateway/ape_obs/ape_lab_*]
         → upstream responde
         → header_filter:  ape_header.lua  (quita Content-Length; dofile sentinel_auth_guard → cuenta 401/403/5xx, X-APE-Sentinel)
         → body_filter:    ape_uri_rebase.lua  (URIs relativas → absolutas del proveedor; puede usar ape_rebase_lib, ape_uhd, bw_adaptive_floor, ape_profile_resolver)
         → respuesta enviada al cliente
         → log:            ape_wake_on_manifest.lua  (encola wake; post-respuesta, cero TTFB)
```

**Librerías por `require` (no son handlers, no ocupan fase):** `ape_rebase_lib`, `ape_uhd`, `bw_adaptive_floor`, `ape_profile_resolver`, `ape_lab_bridge`.

**Hallazgo:** la doctrina describe **5 fases**. Medido: **3 fases** con handler Lua + `content`. Las fases `rewrite` y `access` **no existen**. Consecuencia: no hay `upstream_gate` (cooldown de proveedor) ni `decision_engine` (TELESCOPE) en el camino de la petición.

---

## 4. Invariantes de seguridad — verificación línea por línea

| Invariante doctrinal (`ape-crystal-edge` §7) | Cómo se verificó | Resultado |
|---|---|---|
| **NUNCA `ngx.exit()` en `body_filter` / `header_filter`** | `grep -n "ngx\.exit" /etc/nginx/lua/*.lua` → **3 coincidencias, todas en comentarios**: `ape_header.lua:11` («nunca bloquea, nunca ngx.exit»), `ape_wake_on_manifest.lua:5` («Nunca ngx.exit»), `sentinel_auth_guard.lua:13` («✅ NEVER calls ngx.exit()»). Filtrado de comentarios: `grep -n "ngx\.exit" *.lua \| grep -vE ":[0-9]+:\s*--"` → **0 resultados, `rc=1`** | **PASS** — 0 llamadas reales a `ngx.exit` en los 14 módulos. Las únicas menciones son la documentación de la propia prohibición. |
| **`pcall`-safety: si el `pcall` falla, servir body/headers originales (PASSTHROUGH)** | `grep -c pcall` por archivo | `ape_luatest` 5 · `sentinel_auth_guard` 6 · `ape_lab_bridge` 3 · `ape_header` 2 · `ape_obs` 2 · `ape_profile_resolver` 2 · `ape_wake_on_manifest` 2 · `ape_gateway` 1 · `ape_lab_upload` 1 · `bw_adaptive_floor` 1. **Sin `pcall`:** `ape_lab_api`, `ape_rebase_lib`, `ape_uhd`, `ape_uri_rebase` → **PASS con matiz**: los 4 sin `pcall` son de bajo riesgo (2 son librerías puras sin `ngx`; `ape_lab_api` y `ape_uri_rebase` son handlers que no envuelven su cuerpo). No hay evidencia de que un fallo de esos 4 deje la respuesta truncada, pero **no están blindados** — riesgo teórico, no medido. |
| **Nunca `ngx.exit(503)` bloqueando reproducción |** | 0 `ngx.exit` ⇒ **PASS** |
| **Autopista: el VPS nunca frena** | `limit_conn` ausente (§4.1 de `VPS_NGINX_DUMP_ANALYSIS.md`), `proxy_cache off`, sin circuit breaker activo | **PASS** |
| **GOLDEN RULE `hvc1`/`hev1` + Ley Cardinal 1** | `ape_uhd.lua` declara explícitamente que **NO toca `CODECS`** | **PASS** — el único módulo que reescribe `RESOLUTION` no toca codec |
| **`combined_body_filter.lua` no rebasa URIs** → por eso existe `ape_uri_rebase` | El propio `ape_uri_rebase.lua` lo documenta | Consistente. **Pero `combined_body_filter.lua` NO existe en el VPS** → ver §5 |

`X-APE-Sentinel` se expone como cabecera de observabilidad passthrough — no es `ngx.exit`, no bloquea.

---

## 5. Módulos doctrinales AUSENTES (0 de 11 presentes)

La doctrina `ape-crystal-edge` / manifiesto OMEGA declara un pipeline de 11 módulos. `find /etc/nginx -type f` con patrón `*crystal*|*upstream_gate*|*decision_engine*|*segment_guardian*|*fortify*|*ts_crystal*|*shield*` → **cero resultados**:

| Módulo doctrinal | Fase doctrinal | Estado medido |
|---|---|---|
| `ape_crystal_rewrite.lua` | `rewrite_by_lua` | **AUSENTE** |
| `decision_engine.lua` (TELESCOPE v2.1) | `rewrite_by_lua` | **AUSENTE** |
| `ape_ts_crystal_hook.lua` (v3.0) | `rewrite_by_lua` | **AUSENTE** |
| `upstream_gate.lua` | `access_by_lua` | **AUSENTE** |
| `ape_shield_header_filter.lua` | `header_filter_by_lua` | **AUSENTE** |
| `ape_shield_body_filter.lua` | `body_filter_by_lua` | **AUSENTE** |
| `combined_body_filter.lua` | `body_filter_by_lua` | **AUSENTE** (referido por comentarios de `ape_uhd`/`ape_uri_rebase`/`bw_adaptive_floor` y por `circuit_metrics`) |
| `ape_segment_guardian.lua` | `log_by_lua` | **AUSENTE** |
| `ape_crystal_fortify.lua` | librería | **AUSENTE** |
| `ape_lcevc_enhancement_layer.lua` | librería | **AUSENTE** |
| `ape_8k_crystal_escalator.lua` | librería | **AUSENTE** |

Más: `bandwidth_reactor.lua` (mencionado como consumidor de `circuit_metrics`) → **AUSENTE**.

**Conclusión de capa:** el VPS corre una **generación distinta** y más simple que la documentada: un **edge metadata-only** (`/meta/`, `/cdn/`, `/_ape/*`) que rebasa URIs y no transporta video. La generación «Crystal Engine v2.0» (Rust :8084 + 5 fases + anti-403 4 capas + Null Packet + prefetch) **no está desplegada**. Ver `VPS_DRIFT_VS_REPO.md`.

---

## 6. Evidencia de que los módulos vivos funcionan (no sólo existen)

`curl -s http://127.0.0.1:8088/_ape/health` → **HTTP 200**:

```json
{"ok":true,"plane":"meta/v3","ts":1792987153,
 "qoe":{"last_ms":789,"bytes":635,"req":1,"last_ts":1792979255,"rebase_ok":1,"last_host":"line.tivi-ott.net"},
 "checks":{"last_latency_ms":789,"nginx":true,"shared_dicts":true,"upstreams_down":0,
           "requests":1,"error_ratio":0,"last_host":"line.tivi-ott.net"}}
```

Interpretación medida: `rebase_ok:1` ⇒ `ape_uri_rebase.lua` **rebasó correctamente** al menos una playlist; `last_host: line.tivi-ott.net` ⇒ el plano habló con un proveedor real; `shared_dicts:true` ⇒ los 5 `lua_shared_dict` están operativos; `error_ratio:0`; `upstreams_down:0`. **Los módulos no son código muerto.**

---
*Fin de VPS_LUA_MODULES.md — 14 módulos hasheados, 11 doctrinales ausentes, 0 `ngx.exit` reales. Cero mutaciones.*
