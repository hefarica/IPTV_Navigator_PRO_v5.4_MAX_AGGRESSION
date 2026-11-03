# Council S6 — nginx / OpenResty Lua: fases reales, autopista y deriva repo↔desplegado

**Tarea:** `t5` (c5) · **Fase:** Council read-only · **Snapshot:** `git HEAD e38a89b` (`e38a89bb30c02cb41050f34cef43d3711a2b0644`, 2026-10-26 03:08:19 -0500)
**Autor:** `s6-nginx-lua` (S6) · **Fecha:** 2026-10-26 · **Mutaciones:** 0 (ni en repo ni en VPS)
**Estado de ejecución:** `nginx -t` = **NOT_RUN**. No hay nginx local: `Get-Command nginx,openresty,luac,lua` → vacío (Windows); `wsl -e sh -c 'command -v nginx/openresty/luajit/luac'` → `NO_NGINX / NO_OPENRESTY / NO_LUAJIT / NO_LUAC`. Versión real de referencia (leída, **no medida por mí**): **nginx 1.24.0 (Ubuntu) + libnginx-mod-http-lua 0.10.26**, sin OpenResty — `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md:53,76`. `luac -p` (validación de sintaxis Lua) = **NOT_RUN** por la misma causa.

---

## 1. Alcance, método y denominadores

| Conjunto | Ruta | `.lua` | Fuente del número |
|---|---|---|---|
| SSOT declarado del Lua del VPS | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/` | **26** | `(Get-ChildItem -Filter *.lua).Count` = 26 (coincide con `VPS_REALITY_MEASURED:126`) |
| Espejo de despliegue / stage | `_vps_stage/lua/` | **18** | listado de directorio |
| Duplicados sueltos de la raíz | `*.lua` en raíz | **8** | listado de directorio |
| Configs auditadas | `vps/nginx/{*.conf,conf.d,snippets}` | **18 `.conf`** | 1 raíz + 6 `conf.d` + 11 `snippets`; solo **4** llevan directivas Lua activas (`shield-location`, `iptv-intercept`, `prisma-floor-lock`, `ape-visual-v3-2-location`) |

**Método:** lectura de archivos + `Select-String`/regex con `archivo:línea`; recuento de directivas `*_by_lua*` **excluyendo comentarios**; SHA-256 de duplicados; contraste contra `VPS_REALITY_MEASURED_2026-10-25.md` y `CLAUDE.md`. Ningún `nginx -s reload|restart`, ningún `ssh`, ningún secreto impreso. `_vps_stage/nginx/*.conf` se usa **solo como referencia cruzada** (está fuera del alcance literal `vps/nginx/**`); se marca así en cada cita.

---

## 2. Inventario de fases Lua realmente usadas (por archivo)

**Directivas activas en `vps/nginx/**` (sin comentarios): 47 · módulos distintos cableados: 11.**

| Fase nginx | Módulo cableado (SSOT) | `archivo:línea` (representativo) | Locations |
|---|---|---|---|
| `init_worker_by_lua_file` | `reactor_tick.lua` | `conf.d/prisma-floor-lock.conf:32` | 1 |
| `rewrite_by_lua_file` | `decision_engine.lua` | `shield-location.conf:26` | 1 |
| `access_by_lua_file` | `upstream_gate.lua` | `shield-location.conf:27`; `conf.d/iptv-intercept.conf:56,85,109,141,163,189,221,254,273,302,328` | 12 |
| `header_filter_by_lua_file` | `upstream_response.lua` | `shield-location.conf:29`; `iptv-intercept.conf:57,86,…,329` | 12 |
| `body_filter_by_lua_file` | `combined_body_filter.lua` | `shield-location.conf:30`; `iptv-intercept.conf:58,165,275` | 4 |
| `log_by_lua_file` | `bandwidth_reactor.lua` · `ape_device_state_writer.lua` | `shield-location.conf:32`; `iptv-intercept.conf:59,…,330`; `snippets/ape-visual-v3-2-location.conf:18` | 12 + 1 |
| `content_by_lua_file` | `sentinel_telemetry_api` · `bandwidth_reactor_api` · `prisma_telemetry_full` · `quality_realtime` | `prisma-floor-lock.conf:69,74,79,103` | 4 |

**Fases del repo: 7. Fases en producción medida: 3** (`header_filter`→`ape_header.lua`, `body_filter`→`ape_uri_rebase.lua`, `log`→`ape_wake_on_manifest.lua`; `VPS_REALITY_MEASURED:80-85`).
**Módulos SSOT sin ninguna directiva activa (13):** 7 son librerías vía `require` (`ape_codec_cascade`←`combined_body_filter.lua:20,347`; `ape_uhdx_score`←`:15`; `ape_virtual_4k`←`:16`; `ape_profile_resolver`←`:29`; `lab_config`←`decision_engine.lua:22`; `qm_apply_worker`←`reactor_tick.lua:63`; `sentinel_ua_apply`←`upstream_gate.lua:40`) y **6 son huérfanos**: `ape_wake_on_manifest`, `bw_adaptive_floor`, `follow_redirect`, `sentinel_auth_guard`, `shield_follow_302`, `floor_lock_filter` (esta última solo aparece **comentada** en `prisma-floor-lock.conf:48`). `snippets/prisma-qoe-observer.conf` no tiene **ninguna** línea activa: sus 5 directivas son instrucciones de activación comentadas (`:29,:37,:48`).

**Discrepancia de fase declarada vs cableada:** `decision_engine.lua:2` se autodocumenta `access_by_lua_file`, pero el único cableado es `rewrite_by_lua_file` (`shield-location.conf:26`). `reactor_tick.lua:5` declara `init_worker_by_lua_block` y se cablea como `init_worker_by_lua_file` (`prisma-floor-lock.conf:32`) — equivalente en fase, distinto en forma.

---

## 3. Tabla de invariantes autopista (verificados en repo; en prod NO medidos por mí)

| Invariante | Valor real en el repo | Cumple | `archivo:línea` |
|---|---|---|---|
| `proxy_read_timeout` ≥ 60 s | **60 s** en shield y en las 11 locations del intercept | **SÍ** | `shield-location.conf:109`; `iptv-intercept.conf:74,103,121,157,181,201,234,267,294,321,342` |
| `proxy_read_timeout` ≥ 60 s — loopbacks de failover | **30 s** en los 4 server loopback | **NO** | `conf.d/iptv-brazil-backup-loopback.conf:53,81,108,135` (destinos de `server 127.0.0.1:9181-9184 backup` — `iptv-intercept.conf:18,23,28,37`) |
| `proxy_read_timeout` ≥ 60 s — plano API | **5 s / 5 s / 3 s**; no transporta vídeo | **NO** (alcance metadata) | `snippets/prisma-public-api-locations.conf:46,80,106` |
| `keepalive` 0 en upstreams Xtream | `keepalive` **ausente** en los 8 `upstream{}`; retiro 2026-06-08 documentado | **SÍ** | `iptv-intercept.conf:11-38` (notas `:17,22,27,36`); `iptv-brazil-backup-loopback.conf:20-37` |
| `limit_conn` ≥ 2 | `limit_conn xtream_slot 2` | **SÍ** (valor) | `shield-location.conf:41` |
| … pero la zona `xtream_slot` existe en el árbol | `limit_conn_zone … zone=xtream_slot` **NO existe en `vps/nginx/**`**; solo en `vps/vps-live-snapshot-20260428/nginx-conf.d/iptv-limit-conn.conf:14` | **NO** (zona colgante ⇒ `nginx -t` fallaría al cargar este archivo aislado) | `shield-location.conf:41` |
| … y la zona `hard_cap` | `limit_req zone=hard_cap` sin `limit_req_zone hard_cap` en el árbol (solo `prisma_api` y `prisma_stream_per_ip`) | **NO** (2.ª zona colgante) | `shield-location.conf:44` vs `conf.d/prisma-public-api-zone.conf:18`, `conf.d/prisma-stream-zone.conf:12` |
| `proxy_cache_valid 302` = 0 | `proxy_cache_valid 302 301 0` explícito en 5 locations; en las demás locations la directiva no lista 301/302 ⇒ no se cachean | **SÍ** | `shield-location.conf:81`; `iptv-intercept.conf:67,174,284,338` (+ ausencia deliberada en `:94,118,150,198,230,312,337`) |
| `upstream_gate.lua` sin `ngx.exit(503)` | 46 líneas; **0** llamadas reales a `ngx.exit`, 1 mención en comentario; siempre `return` passthrough | **SÍ** | `upstream_gate.lua:25,45,46` (`-- AUTOPISTA`, `return`) |
| `ngx.exit` en el resto del SSOT | 0/26 módulos, **excepto** `follow_redirect.lua:37` `ngx.exit(res.status)` — módulo **no cableado** | **SÍ** (por no estar cableado) | `vps/nginx/lua/follow_redirect.lua:37` |
| Sin `gzip` en vídeo | `gzip on` solo en 6 locations JSON `/omega/*`; `.ts/.m4s/.mp4/.m3u8` sin `gzip` | **SÍ** | `snippets/ape-visual-v3-2-location.conf:91,109,127,145,163,181` |
| `gzip off` en SSE | `gzip off` | **SÍ** | `snippets/prisma-conviva-stream.conf:53`; `snippets/prisma-ara-events.conf:33` |
| `proxy_pass_request_headers off` (anti-fingerprint) | presente en shield; **ausente en las 11 locations del intercept** | **Parcial** | `shield-location.conf:70` (sí) vs `iptv-intercept.conf` (ninguna) |
| Caché de manifiestos | `proxy_cache off` en el plano API; `proxy_cache_valid 200 … 3s..10m` en intercept | **SÍ** (≤ 30 s en playlists) | `iptv-intercept.conf:66,150,230`; `prisma-public-api-locations.conf:48,81,107` |

---

## 4. Deriva repo ↔ producción desplegada (medida, no estimada)

| Hecho | Repo | Producción medida | Brecha |
|---|---|---|---|
| Nº de `.lua` | 26 en SSOT + 18 en `_vps_stage` + 8 en raíz = **52** | **14** (`VPS_REALITY_MEASURED:126,130-132`) | 4 en ambos, 22 solo-repo, 10 solo-VPS |
| Fases Lua | **7** cableadas en `vps/nginx/**` | **3** (`:85`) | `rewrite` y `access` = **0 ocurrencias en prod** |
| `ape_header.lua` (fase `header_filter` de prod) | **8 088 B** · sha256 `23b25b03…` | **2 210 B** · sha256 `a15e1fe3…` (`:80`) | **DIVERGENTE** (3,66×); la copia del repo **no** es la desplegada |
| `ape_uri_rebase.lua` (fase `body_filter` de prod) | **9 930 B** · sha256 `393635c2…` | **6 043 B** · sha256 `1d456a46…` (`:81`) | **DIVERGENTE** (1,64×) |
| `ape_wake_on_manifest.lua` (fase `log` de prod) | 2 284 B · sha256 `d9c6b65d…` | 2 284 B · sha256 `d9c6b65d…` (`:82`) | **IDÉNTICO** (1 de 3 fases) |
| ¿Dónde vive el módulo de `header_filter`/`body_filter` de prod? | `ape_header` y `ape_uri_rebase` **no existen en `vps/nginx/lua/`** (SSOT); solo en `_vps_stage/lua/` | desplegados en `/etc/nginx/lua/` | **el SSOT declarado no contiene 2 de las 3 fases que corren** |
| `lua_package_path` | Solo **comentado** | necesario para los `require` | tree no autosuficiente: `prisma-floor-lock.conf:39` |
| Config de plano desplegada | `_vps_stage/nginx/meta-plane.conf:83,86,89` cablea exactamente las 3 fases | coincide con la medición | **coherente** (referencia cruzada, fuera de alcance) |

**Duplicados de la raíz (clasificación por SHA-256, no por nombre):**

| Archivo raíz | Líneas | sha256(12) | Veredicto |
|---|---|---|---|
| `combined_body_filter.lua` | 224 | `822106BA5D43` | **STALE** (marcado en `STALE_LUA_DUPLICATES_DO_NOT_USE.md:8`) |
| `vps_combined_body_filter.lua` | 224 | `822106BA5D43` | **STALE, byte-idéntico** al anterior (`:9`) |
| `vps_bandwidth_reactor.lua` | 261 | `485B3F29FD87` | **STALE** (`:10`) vs SSOT `283 l / AD187E993003` |
| `vps_upstream_gate.lua` | 46 | `E4E1A5C28125` | **duplicado exacto** del SSOT `upstream_gate.lua` (**no** clasificado en el doc STALE) |
| `vps_follow_redirect.lua` | 38 | `B696A768BB26` | **divergente** del SSOT `follow_redirect.lua` (38 l, `37C42A2686CA`) — mismo tamaño, distinto byte |
| `vps_upstream_response.lua` | 81 | `C25413C897C0` | versión **vieja** del SSOT (134 l, `018E78690CA0`) |
| `follow_302_internal.lua` | 112 | `A0097D10C321` | sin contraparte en SSOT |
| `prefetch_segment.lua` | 140 | `95C1C15CF39B` | sin contraparte; pariente próximo de `_vps_stage/lua/ape_prefetch_next.lua` (143 l) |
| **Cobertura del doc STALE** | — | — | **3 de 8 clasificados (37,5 %)**; 5 duplicados sueltos sin veredicto |

---

## 5. Riesgo de bloqueo de reproducción y headers tóxicos

**5.1 `require` sin proteger en el body filter cableado (riesgo ALTO si se despliega el árbol del repo).**
`combined_body_filter.lua:15,16,20` cargan `ape_uhdx_score`, `ape_virtual_4k` y `ape_codec_cascade` **sin `pcall`** (contraste: `:29` sí usa `pcall` para `ape_profile_resolver`). nginx no tiene `lua_package_path` en el árbol (§4), y **`cjson` no está verificado** (`luac`/`lua-cjson` = NOT_RUN). Un fallo de carga en `body_filter` no se cubre con el `pcall` de `:67` (que envuelve el *handler*, no el *load*): el resultado sería **500 en cada `.m3u8`**. Es exactamente el modo de fallo que `CLAUDE.md` prohíbe («No romper lo existente»).

**5.2 I/O bloqueante en el camino de la petición.** `combined_body_filter.lua:101` ejecuta `io.open("/etc/ape-uhdx/visual_profiles.json","r")` dentro de `body_filter` (I/O de disco **bloqueante** en el worker). Mitigado por caché en `ngx.shared.lab_config` con TTL 60 s (`:93-108`): como máximo 1 lectura bloqueante / 60 s / worker, no por petición. Aun así incumple «autopista = fase no bloqueante»; lo correcto es precargar en `init_worker`. **NO** se ejecutó ninguna medición de latencia (NOT_RUN).

**5.3 Buffering total del cuerpo hasta EOF — no es una regresión del repo.** `combined_body_filter.lua:43-57` suprime cada chunk (`ngx.arg[1] = nil`) y emite el cuerpo completo en EOF (`:494`). **El módulo desplegado hace lo mismo**: `_vps_stage/lua/ape_uri_rebase.lua:149-155` (`-- retenemos hasta tener el cuerpo completo`). Es una característica compartida, no una brecha nueva; sí implica que el TTFB del manifiesto ≈ descarga completa (crítico con la lista vigente de 23 510 canales / 1,53 GiB de `.gz`, `VPS_REALITY_MEASURED:172`). Sin medición ⇒ NOT_RUN.

**5.4 Prefetch por timer: no bloquea, pero añade carga.** `combined_body_filter.lua:471-485` abre `ngx.socket.tcp()` **dentro de `ngx.timer.at(0, …)`** ⇒ fuera del camino de la petición, sin impacto en TTFB. Pero dispara **1 request HTTP interna por manifiesto 200** (dedup 10 s por host+ruta en `circuit_metrics`, `:463-468`) hacia `127.0.0.1:80` con `Host: <host del proveedor>` (`:475-477`). Riesgo: (a) **cuenta contra el cupo del proveedor** (doctrina anti-509); (b) si el plano de vídeo escucha en `:443` y no en `:80`, el destino es otro server block ⇒ prefetch inútil o 404. **NO VERIFICADO** (sin nginx local, VPS intocable).

**5.5 La ruta `shield` no es passthrough — dos puntos que pueden negar reproducción.** `auth_request /_shield_auth` (`shield-location.conf:20`) y `if ($shield_upstream = "") { return 403; }` (`:57`). Si `shield-auth.php` cae o el `map` no resuelve el host, el player recibe 403/5xx. Es **riesgo solo-repo**: en producción `/shield/` responde **404** (`VPS_REALITY_MEASURED:49,151`) y esta `location` no está desplegada.

**5.6 Headers tóxicos reinyectados.**

| Vector | Hallazgo | Severidad | `archivo:línea` |
|---|---|---|---|
| Reenvío de headers del player | Intercept **no** usa `proxy_pass_request_headers off`: `Range`, `If-None-Match`, `If-Modified-Since`, `TE`, `Priority` del player viajan al proveedor | **ALTA** | `iptv-intercept.conf` (11 locations, ninguna con la directiva) |
| `Range` inyectado a propósito | `proxy_set_header Range $slice_range` con `slice 1m` en la location `.ts` — genera 206 por diseño, pero `Range` está en la lista de prohibidos de `CLAUDE.md` | MEDIA | `iptv-intercept.conf:299,308` |
| UA hardcodeado de un device real | `set $sentinel_ua "…AFTKA…Silk/112.3.1…"` incrustado en configuración («no-hardcode») | MEDIA | `shield-location.conf:73` |
| `Referer` de tercero | `proxy_set_header Referer "https://www.netflix.com/"` — suplanta referer de una marca ajena ante el proveedor | **ALTA (doctrina/éticos)** | `shield-location.conf:75` |
| Headers sintéticos al upstream | `decision_engine.lua` inyecta `X-Max-Bitrate`, `X-Min-Bitrate`, `X-Telescope-Action`, `X-Prefetch-Segments`, `X-APE-HDR-Request`, `X-APE-Node-Preference` | MEDIA (superficie de fingerprint) | `decision_engine.lua:147-149,155,164,165` |
| Telemetría al cliente | 9 headers `X-APE-*` en la respuesta (`X-APE-Upstream`, `X-APE-Status`, `X-APE-UHDX-*`, `X-APE-Floor-Lock`) | BAJA (expone topología) | `upstream_response.lua:110-121` |

**5.7 Ruido de log en el camino caliente.** `combined_body_filter.lua`: **9** `ngx.log(ngx.WARN, …)` y **4** con prefijo `[UHDX-DEBUG]` por petición de playlist (`:71,77,88,…`). Con 23 510 canales y polls cada 2-3 s, escribe en `error_log` en cada request. Severidad BAJA, coste de I/O real.

---

## 6. Disensos y veredicto

**D1 — «El repo tiene 5 fases; producción 3» está mal formulado.** El repo cablea **7** fases en `vps/nginx/**` (§2), no 5; producción corre 3. La cifra «5 fases» del manifiesto coincide con producción por accidente, no por diseño.

**D2 — No se puede sostener que el repo sea la fuente de lo desplegado.** De las 3 fases que corren, **2 no existen en el SSOT declarado** (`ape_header`, `ape_uri_rebase`) y sus copias en `_vps_stage/lua/` **divergen en bytes** de lo medido (§4). Solo `ape_wake_on_manifest.lua` coincide (`d9c6b65d…`). Conclusión: **3 arquitecturas** (manifiesto, repo, VPS), no 2.

**D3 — `vps/nginx/**` no es autocontenido y no pasaría `nginx -t` aislado.** Dos zonas colgantes (`xtream_slot`, `hard_cap`) y `lua_package_path` ausente (§3, §4). Cualquier afirmación futura del tipo «el repo valida» exige el `nginx.conf` del host, que **no está versionado**. No lo declaro fallo de producción: es un fallo de **reproducibilidad del repo**.

**D4 — Disiento de tratar `follow_redirect.lua`/`shield_follow_302.lua` como «código listo, sin desplegar».** `follow_redirect.lua` hace `ngx.header[...] = nil` + `ngx.location.capture` + `ngx.say` (`:24,27,36,37`): no es válido en `header_filter` y requiere un `location /_follow_redirect` inexistente. `_vps_stage/nginx/meta-plane.conf:21-26` ya documenta ambas razones. Coincido con esa decisión; el veredicto correcto es **no desplegable sin reescritura**, no «pendiente».

**D5 — El doc STALE está incompleto.** Clasifica 3 de los 8 `.lua` de la raíz (§4). `vps_upstream_gate.lua` es duplicado **exacto** del SSOT y `vps_combined_body_filter.lua` es byte-idéntico a `combined_body_filter.lua` — ambos confirmados por SHA-256. Los otros 5 (`vps_follow_redirect`, `vps_upstream_response`, `follow_302_internal`, `prefetch_segment`) no tienen veredicto. **Recomendación (no ejecutada):** ampliar la tabla de `STALE_LUA_DUPLICATES_DO_NOT_USE.md` a 8 filas con el hash, sin borrar nada (`OMEGA-NO-DELETE`).

**D6 — El `Referer: netflix.com` (`shield-location.conf:75`) es el hallazgo más delicado y no es técnico.** Suplantar el referer de una marca de terceros ante un proveedor es exactamente el tipo de «ocultamiento» que la regla cardinal de `AGENTS.md` prohíbe. No propongo cambio (está **no desplegado**: `/shield/` = 404), pero **no debe desplegarse tal cual**. Requiere decisión del propietario, no del council.

**Veredicto S6: `PASS` con condiciones.** Los invariantes duros de autopista en el camino de vídeo **se cumplen** donde hay vídeo: `proxy_read_timeout` 60 s, `keepalive` ausente, `proxy_cache_valid 302 0`, `upstream_gate` sin `ngx.exit`, sin `gzip` en vídeo (§3). Los incumplimientos están **fuera del camino primario o en código no desplegado**: loopbacks de failover a 30 s (**NO**, corregible), plano API a 3-5 s (alcance metadata), intercept sin `proxy_pass_request_headers off` (**NO**, el más accionable), y el árbol SSOT incompleto (§4). **Nada de esto se ha corregido ni desplegado: 0 escrituras, 0 reloads, 0 ssh.** El estado del VPS sigue siendo el medido el 2026-10-25 y **este informe no lo modifica**.

**Handoff a otras disciplinas:**
- **S7 (VPS/SRE):** los 30 s de los loopbacks (`iptv-brazil-backup-loopback.conf:53,81,108,135`) son el único invariante de autopista que falla en un camino que sí transportaría vídeo; decidir con incidente medido antes de tocar.
- **S10 (security/headers):** `proxy_pass_request_headers off` ausente en 11 locations del intercept + los 6 headers sintéticos de `decision_engine` + `Referer` de tercero.
- **S5 (QoE):** el prefetch por timer (§5.4) contamina las métricas de "bytes servidos": contar sus requests aparte o el QoE server-side se auto-infla.
- **S1/S2 (HLS/CMAF):** `combined_body_filter.lua` reescribe `RESOLUTION=` y añade `VIDEO-RANGE=PQ` sobre la variante top (`:337-357`); el guard LEVER B existe (`:337-341`) pero el generador emite `PQ` incondicional ⇒ validar coherencia lista↔edge.
