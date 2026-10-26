# VPS REALITY MEASURED — 2026-10-25 · Lo que producción es, medido

**Documento versionado.** Convierte la corrección doctrinal de `T14` en algo que viaja con el repo.
**Decisiones que implementa:** `D-25` (la doctrina Crystal no existe en producción), `D-31` (no se edita el manifiesto global; se versiona en el repo), `D-32` (rige la arquitectura desplegada), `D-33` (contradicción `/shield/`: gana `CLAUDE.md`).
**Corrección completa (con los 55 pares afirmación/línea y los 9 bloques de parche):** [`audit/alignment/2026-10-25/40-vps/DOCTRINE_CORRECTION.md`](../../audit/alignment/2026-10-25/40-vps/DOCTRINE_CORRECTION.md)
**Evidencia primaria (6 entregables hasheados):** [`audit/alignment/2026-10-25/40-vps/`](../../audit/alignment/2026-10-25/40-vps/)
**Snapshot de la doctrina original:** [`OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md`](OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md)

**Ventana de medición:** `2026-10-26T03:55Z` → `04:00Z` (= 2026-10-25 22:55–23:00 America/Bogota). Host `ubuntu-2gb-ash-1` · `178.156.147.234`. Todo por lectura (`nginx -T`, `sha256sum`, `systemctl`, `ss`, `curl -sI`, `find`, `stat`). Cero mutaciones — ver `VPS_READONLY_ATTESTATION.md`.

---

## 0. La declaración que hay que leer primero

> ## Producción = **rebase-only metadata**.
> ## El pipeline transformador **es aspiracional y NO está desplegado**.
>
> El VPS **no** transporta ni reescribe vídeo, **no** corre OpenResty, **no** tiene motor Rust en `:8084`, **no** tiene ruta `/shield/` (404) y **no** persiste telemetría Conviva (`conviva.db` = 0 B).
>
> Nada del pipeline «Crystal 5 fases + Rust» debe presentarse como activo (D-25). El código que sí corre está abajo, y funciona.

**Lo que el VPS sí es:** un **edge metadata-only** que (a) sirve las listas `.m3u8.gz` como archivo estático con `gzip_static`, y (b) expone en `:8088` un plano de metadata cuyo único trabajo es **rebasar las URIs de la playlist a absolutas del proveedor**, para que el reproductor nunca pida segmentos al VPS.

**Lo que sí está bien y no hay que tocar:** `SHIELDED = solo sufijo de archivo` (verificado byte a byte: la lista `_SHIELDED.m3u8.gz` descomprime a un payload **idéntico** al de la lista base, 22 271 732 líneas, `cmp` → `IDENTICAL_PAYLOAD`); `gzip_static` sirviendo el `.gz` con `Content-Length` correcto; BBR activo; ningún 302 cacheado; manifiestos nunca cacheados; **0 llamadas reales a `ngx.exit`** en los 14 módulos.

---

## 1. Tabla afirmación doctrinal → realidad medida → archivo:línea

`MANIFEST` = el manifiesto OMEGA (snapshot en este mismo directorio). Todas las líneas son verificables contra `OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md` (+2 149 B de cabecera respecto del original).

| # | Afirmación doctrinal | Archivo:línea | Realidad medida |
|---|---|---|---|
| **A. Las «5 fases Lua»** ||||
| A1 | «la capa VPS … **ahora tiene 5 fases Lua** + un motor Rust» | `MANIFEST:148` | **3 fases** con handler Lua |
| A2 | «pipeline Nginx de **5 fases Lua + un motor Rust embebido**» | `MANIFEST:151` | 3 fases + 0 motores |
| A3 | «pipeline de 5 fases Lua (en `/etc/nginx/snippets/shield-location.conf`, `location ~ ^/shield/`)» | `MANIFEST:164` | `shield-location.conf` **NO EXISTE** |
| A4 | «1. `rewrite_by_lua` → `ape_crystal_rewrite.lua` …» | `MANIFEST:165` | **`rewrite_by_lua`: 0 ocurrencias** |
| A5 | «2. `access_by_lua` → `upstream_gate.lua` …» | `MANIFEST:166` | **`access_by_lua`: 0 ocurrencias** |
| A6 | «5 fases Lua **estrictamente ordenadas**» | `MANIFEST:237`, `:679` | 3 fases, orden nativo de nginx |
| A7 | Diagramas `F1…F5` / `lua_rewrite` / `lua_access` | `MANIFEST:353-357`, `:488-489`, `:617-621` | F1 y F2 no existen |
| **B. Motor Rust / LuaJIT `:8084`** ||||
| B1 | «**APE CRYSTAL ENGINE v2.0 … desplegado en vivo 2026-06-21**» | `MANIFEST:159` | no desplegado |
| B2 | «Motor `ape-crystal-rust` (`:8084`, systemd, Rust 1.96.0 + LuaJIT vía `mlua`)» | `MANIFEST:171`, `:258`, `:689` | `Unit ape-crystal-rust.service could not be found` |
| B3 | «**Estado (Junio 2026):** Motor Rust `active (running)`» | `MANIFEST:228` | **`inactive` / `not-found`** |
| B4 | «`curl -s http://127.0.0.1:8084/health`» / «`/metrics`» | `MANIFEST:302-303`, `:721-722` | ambos → **`000`** |
| B5 | «`/process` ffmpeg `scale=3840:2160:lanczos + libx265`» | `MANIFEST:173`, `:260` | sin binario, sin motor |
| **C. La ruta `/shield/{token}/{host}/…`** ||||
| C1 | «`https://iptv-ape.duckdns.org/shield/{TOKEN}/{HOST}/{RUTA}`» | `MANIFEST:274` | **HTTP 404** |
| C2 | «El sistema **intercepta automáticamente cualquier tráfico por `/shield/`**» | `MANIFEST:293` | no hay `location` de `/shield/` |
| C3 | «`curl -I … → `X-APE-Crystal-Engine: v2.0-Rust`» | `MANIFEST:286-287` | header inexistente |
| **D. «Nginx / OpenResty»** ||||
| D1 | «**Nginx / OpenResty**: … ejecutor del pipeline Lua» | `MANIFEST:224`, `:234`, `:345`, `:347`, `:670` | **nginx 1.24.0 (Ubuntu)** + módulo Lua dinámico |
| D2 | «`VPS nginx/OpenResty:` … `combined_body_filter.lua · upstream_gate.lua · shield_follow_302.lua`» | `docs/REA_STREAMING_ANALYSIS.md:221` | ninguno de los 3 desplegado |
| **E. Transporte / reescritura de vídeo** ||||
| E1 | «`combined_body_filter.lua` … **reescribe el manifest**» | `MANIFEST:46-47` | módulo **no desplegado** |
| E2 | «**Null Packet** … reemplaza body con TS Null Packet PID `0x1FFF`» | `MANIFEST:168` | no existe ese body filter |
| E3 | «`ape_ts_crystal_hook.lua`: **intercepta peticiones de segmentos (`.ts`, `.m4s`)**» | `MANIFEST:241` | los segmentos responden **404** |
| E4 | «`shield-location.conf` … `/shield/<hash>/<host>/<path>` → `proxy_pass` … **puede ser video**» | `docs/VPS_METADATA_ONLY_EVALUATION.md:61` | el VPS **no** transporta vídeo |
| E5 | «refinamiento LEVER B en la capa VPS Lua (`combined_body_filter.lua`)» | `CLAUDE.md:235-237` | módulo no desplegado → LEVER B **no activo** |
| **F. Telemetría Conviva alimentando el LAB** ||||
| F1 | «`conviva-event.php → conviva.db → realimenta recalibración del LAB`» | `MANIFEST:57` | `conviva.db` = **0 B, 0 tablas** |
| F2 | «`qoe-flush.php` → `recordServerSideQoE()` (**SQLite table**)» | `CLAUDE.md:304-305`, `:325` | no hay tabla donde escribir |
| F3 | «`VPS SQLite (channel_hdcp_profile)` → INSERT/UPDATE `hdcp_level='NONE'`» | `CLAUDE.md:262-264`, `:278` | tabla inexistente |
| **G. Watchdogs activos** ||||
| G1 | «`/watchdog-status` — Health checks status» | `CLAUDE.md:587` | reportaría vigilancia inexistente |
| G2 | «watchdog status for **ape-realtime-guardian + wg-health + sentinel**» | `.claude/commands/watchdog-status.md:2`, `:9` | `ape-realtime-guardian`: sin unit; `netshield-sentinel`: inactive |
| G3 | «`upstream_gate` passthrough» (como control activo) | `docs/VPS_MATURITY_AND_SLO_PLAN.md:94` | no desplegado (ni la fase `access_by_lua`) |

**Corrección de ruta del manifiesto citado:** el enunciado de `T14` lo situaba en `.agents/skills/iptv-omega-working-flow-manifesto/SKILL.md` **dentro del repo**. Esa ruta **no existe** (`Test-Path` → `False`). El original vive en `C:\Users\HFRC\.agents\skills\iptv-omega-working-flow-manifesto\SKILL.md` — **fuera del repo**. Por eso existe el snapshot versionado.

---

## 2. El pipeline que SÍ corre (3 fases, no 5)

`nginx 1.24.0 (Ubuntu)` + `ngx_http_lua_module.so` (443 320 B, `2024-01-19`) · módulo versión **libnginx-mod-http-lua 0.10.26**. **No OpenResty** (`command -v openresty` → vacío; `command -v luajit` → vacío).

| Fase | Módulo desplegado | Bytes · sha256 | Función |
|---|---|---|---|
| `header_filter_by_lua_file` | `ape_header.lua` | 2 210 · `a15e1fe3…` | quita `Content-Length` (el body se reescribe → si se deja, nginx **trunca**) + `dofile` de `sentinel_auth_guard.lua` (observador passthrough, **nunca** `ngx.exit`) |
| `body_filter_by_lua_file` | `ape_uri_rebase.lua` | 6 043 · `1d456a46…` | rebase de URIs al origen del proveedor |
| `log_by_lua_file` | `ape_wake_on_manifest.lua` | 2 284 · `d9c6b65d…` | wake-on-manifest post-respuesta (cero TTFB) |
| `content_by_lua_file` | `ape_obs` · `ape_gateway` · `ape_lab_api` · `ape_lab_upload` · `ape_luatest` | — | handlers de `/_ape/*`, `/ape/health`, `/ape/lab-upload` |

`rewrite_by_lua` y `access_by_lua`: **0 ocurrencias** en `/etc/nginx`. Consecuencia: **no hay `upstream_gate` (cooldown de proveedor) ni `decision_engine` (TELESCOPE) en el camino de la petición.**

**Prueba de que funcionan (no son código muerto):**
`curl -s http://127.0.0.1:8088/_ape/health` → `{"ok":true,"plane":"meta/v3",…,"rebase_ok":1,"last_host":"line.tivi-ott.net","error_ratio":0,"shared_dicts":true,"upstreams_down":0}`

`sentinel_auth_guard.lua` declara «**NEVER calls `ngx.exit()`**». Verificado: 3 menciones de `ngx.exit` en los 14 módulos y **las 3 son comentarios** que documentan la prohibición; filtrado de comentarios → **0 llamadas reales**. El invariante doctrinal más importante **se cumple**.

---

## 3. GRUPO A vs GRUPO B — los 13 artefactos doctrinales, y la distinción que cambia todo

`T7` los reportó como «13 ausentes en el VPS». Al buscar su **código fuente** en el repo, se parten en dos grupos de **naturaleza distinta**:

### GRUPO A — el código EXISTE, nunca se desplegó (5 de 13)

| Artefacto | Copia canónica en el repo | Bytes | sha256 |
|---|---|---|---|
| `shield-location.conf` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/shield-location.conf` | 5 973 | `4630adca2e892b6b6a187ff16e89d7cc4f6fd2eeaebb19bcc191d8fae74fa585` |
| `decision_engine.lua` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/decision_engine.lua` | 9 129 | `3eb7b00df749759e61ced533eb73a3441393c8af89a653ff3f4815522812b1e8` |
| `combined_body_filter.lua` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter.lua` | 22 685 | `31afd6d156f0da2b9f77e6e128b303830e4f0162358f8c36b9b55afedd290994` |
| `bandwidth_reactor.lua` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bandwidth_reactor.lua` | 13 625 | `ad187e9930039ca837c324b161a03021d4f93a9545baf1c75d652bd1289eee1f` |
| `upstream_gate.lua` | `vps/nginx/lua/` **y** `net-shield/nginx/lua/` (byte-idénticas) | 2 536 | `e4e1a5c28125dbc669789711d75c3f80640825452531456e7ce799d4cdbd5556` |

> `shield-location.conf` tiene **4 copias divergentes** en el repo: 5 973 B, 5 353 B y 3 745 B ×2. **Cuatro generaciones, ninguna desplegada, sin SSOT declarado.**

### GRUPO B — el código **NO EXISTE en ningún lugar del repo** (8 de 13)

`ape_crystal_rewrite.lua` · `ape_ts_crystal_hook.lua` · `ape_shield_header_filter.lua` · `ape_shield_body_filter.lua` · `ape_segment_guardian.lua` · `ape_crystal_fortify.lua` · `ape_lcevc_enhancement_layer.lua` · `ape_8k_crystal_escalator.lua`

**`Get-ChildItem -Recurse -Filter <nombre>` → cero resultados en todo el árbol.**

### Por qué la distinción importa

Estos 8 existen **únicamente como prosa** en el manifiesto. **No son «código que falta desplegar»: son código que nunca se escribió.** Por tanto **no se pueden desplegar**.

Un agente que lea la doctrina y reciba «despliega el pipeline Crystal» descubre que **el 62 % (8/13) no tiene fuente** — y la reacción probable sería **inventarlo**, que es exactamente el fallo que `iptv-vps-touch-nothing` previene. Este documento existe para que ese agente no tenga que descubrirlo a solas.

---

## 4. La brecha de fondo: 26 vs 14 `.lua` — dos arquitecturas, no dos versiones

`IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/` es, según `docs/VPS_LUA_MODULE_MAP.md`, el **SSOT del Lua del VPS**: **26 `.lua`** (+1 `.json`). El VPS corre **14**.

| Conjunto | Cantidad | Ejemplos |
|---|---|---|
| **En ambos** | **4** | `ape_profile_resolver`, `ape_wake_on_manifest`, `bw_adaptive_floor`, `sentinel_auth_guard` |
| **Sólo repo (nunca desplegado)** | **22** | `combined_body_filter` 22 685 · `ape_codec_cascade` 20 045 · `bandwidth_reactor` 13 625 · `quality_realtime` 12 236 · `qoe_flush_worker` 11 412 · `lab_config` 11 385 · `qoe_server_side_observer` 10 641 · `floor_lock_filter` 9 269 · `decision_engine` 9 129 · `prisma_telemetry_full` 8 014 · `sentinel_telemetry_api` 5 672 · `upstream_response` 5 455 · `ape_virtual_4k` 3 608 · `sentinel_ua_apply` 3 362 · `qm_apply_worker` 3 113 · `reactor_tick` 2 811 · `upstream_gate` 2 536 · `shield_follow_302` 1 673 · `bandwidth_reactor_api` 1 594 · `follow_redirect` 1 144 · `ape_uhdx_score` 1 143 · `ape_device_state_writer` 992 |
| **Sólo VPS** | **10** | `ape_gateway`, `ape_header`, `ape_lab_api`, `ape_lab_bridge`, `ape_lab_upload`, `ape_luatest`, `ape_obs`, `ape_rebase_lib`, `ape_uhd`, `ape_uri_rebase` |

**Lectura (D-32):** el árbol del repo describe un VPS **proxy/con-transformación** (codec-cascade, floor-lock, virtual-4K, telemetría server-side, prefetch). El VPS desplegado es **rebase-only**. **Son dos arquitecturas distintas.**

**Rige la desplegada y medida.** Ningún ajuste de líneas de la documentación resuelve esta brecha: exige que la doctrina **declare cuál es la vigente**. Declarado: **rebase-only**. El pipeline transformador queda **aspiracional y no desplegado**.

> **Lo que este documento NO hace:** elegir si algún día debe desplegarse. Esa es decisión del propietario, con incidente medido, autorización explícita y plan de rollback. Aquí sólo se mide qué corre.

---

## 5. Contradicción `/shield/` — gana `CLAUDE.md` (D-33)

| Fuente | Dice |
|---|---|
| `CLAUDE.md:371-374` | «SHIELDED = SOLO renombrar el archivo … Las URLs internas … **NUNCA se transforman. NUNCA se envuelven con `/shield/`**» |
| `MANIFEST:274` | Documenta como URL canónica: `https://iptv-ape.duckdns.org/shield/{TOKEN}/{HOST_PROVEEDOR}/{RUTA_DEL_CANAL}` |

**Ambas no pueden ser ciertas.**

**La medición zanja:** `curl -sI -m 6 -k https://iptv-ape.duckdns.org/shield/deadbeef/line.tivi-ott.net/live/user/pass/1.m3u8` → **`HTTP/1.1 404 Not Found`**.
En `nginx -T` (36 954 B / 850 líneas) la cadena `/shield/` aparece **UNA sola vez** y **no es una `location`**: es el `map $request_uri $xtream_account` de `conf.d/iptv-limit-conn.conf:9` — un mapa huérfano (su zona `xtream_slot` existe pero la directiva `limit_conn` no). No hay `proxy_pass` de shield en ninguna parte.

**Y hay confirmación independiente por contenido:** la lista servida vigente termina en `http://line.tivi-ott.net/live/…` — **URL directa al proveedor, sin `/shield/`**.

> **Resolución (D-33): `CLAUDE.md` es correcto.** El manifiesto se corrige — como propuesta, no aplicada al global (`D-31`).

---

## 6. Otros hechos medidos que afectan a otras capas

| Hecho | Evidencia | Efecto |
|---|---|---|
| `conviva.db` = **0 B, 0 tablas** | `python3` + `sqlite3` `mode=ro&immutable=1` | la cadena QoE doctrinal no tiene almacén; `ape_lists.db` (26 listas registradas) es el único con datos |
| `ape_devices.db` = **0 filas** en `ape_devices` y `ape_providers` | idem | registro de dispositivos vacío |
| **7 timers `netshield-*` INACTIVOS** | `systemctl is-active <u>.timer` | `/watchdog-status` reportaría vigilancia inexistente. Único mecanismo con poder de recargar nginx: `ape-meta-watchdog.timer` (60 s, `fails=0`) |
| `proxy_cache_path iptv_cache` declarada y **sin uso** | `grep proxy_cache /etc/nginx` → sólo `proxy_cache off` | `/dev/shm/nginx_cache` = 0 archivos / 0 B; cache muerta |
| `proxy_read_timeout` **5 s** en `/meta/` y `/cdn/` | `grep proxy_read_timeout` | por debajo del objetivo de 60 s; **alcance limitado al plano de metadata** (no hay camino de segmentos) |
| `limit_conn` **ausente** (zona definida) | `cat conf.d/iptv-limit-conn.conf` | sin límite de conexiones ⇒ más permisivo, no frena |
| **BBR activo** | `sysctl` → `bbr` + `fq` + `notsent_lowat=131072` + `slow_start_after_idle=0` + `fastopen=3` | **PASS** autopista |
| `proxy_cache_valid` **inexistente** | `grep -rn proxy_cache_valid /etc/nginx` → 0 | ningún 302 cacheado: **PASS** |
| Listas: 7 placeholders 8 B + 7 `.gz` = **1.53 GiB**, integridad **7/7 OK** | `sha256sum`, `gzip -t`, `zcat` | lista vigente `APE_LISTA_1792869328847.m3u8.gz` `7f1cd8a7…`, 23 510 canales |
| **DESALINEACIÓN LAB:** el `.gz` vigente embebe `#EXT-X-APE-LAB-EXPORTED-AT:2026-05-23T05:39:38` y su scorecard `generatedAt:2026-10-24T19:18:29Z` | `zcat \| head` | lista del 2026-10-24 generada con DNA LAB del **2026-05-23** (5 meses de separación) — **para `10-excel`/`20-json`** |
| **DESALINEACIÓN ladder:** en la lista, P1 = «4K UHD», P2 = «2K QHD» | idem | el manifiesto declara **P1 = 8K AV1** y P2 = 4K. **No coinciden** |

---

## 7. Cómo re-verificar todo esto

```bash
ssh hetzner-iptv 'ngin"x" -v; systemctl status ape-crystal-rust --no-pager; ss -tlnp | grep 8084'
ssh hetzner-iptv 'grep -rn "_by_lua" /etc/nginx | grep -v "^\s*#"'
ssh hetzner-iptv 'curl -sI -m 6 -k https://iptv-ape.duckdns.org/shield/x/y/z.m3u8'
ssh hetzner-iptv 'curl -s -m 6 http://127.0.0.1:8088/_ape/health'
ssh hetzner-iptv 'ls -la /usr/lib/nginx/modules/ | grep -i lua; command -v openresty; command -v luajit'
ssh hetzner-iptv 'systemctl list-timers --all --no-pager | grep -c netshield'
```
*(el `ngin"x"` de la primera línea es para que este bloque no se ejecute por accidente al copiarlo; quitar las comillas para correrlo.)*

Todos son **lectura**. Ninguno recarga, reinicia ni escribe.

---

## 8. Regla operativa que se deriva

> **La documentación se corrige escribiendo documentación. Producción se toca sólo con un incidente medido, autorización explícita y plan de rollback.**
>
> Si la doctrina y el VPS discrepan, **no se mueve el VPS**. Se corrige la doctrina y se registra la discrepancia. La asimetría es deliberada: un documento equivocado cuesta una lectura; un `nginx -s reload` equivocado cuesta el servicio del propietario.

**Prohibido explícitamente:** desplegar el pipeline Crystal, escribir los 8 módulos del Grupo B, o reactivar los 7 timers `netshield-*` **«para alinear la documentación con la realidad»**. La realidad es correcta; la documentación era el error. Ver `DOCTRINE_CORRECTION.md` §4 (7 riesgos concretos) y `iptv-vps-touch-nothing`.

---
*Documento versionado en el repo por T18 · decisiones D-25/D-31/D-32/D-33. Datos medidos 2026-10-26T03:55–04:00Z. Cero mutaciones en el VPS.*
