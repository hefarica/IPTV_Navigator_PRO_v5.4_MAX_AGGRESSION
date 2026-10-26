# DOCTRINE_CORRECTION — Corrección documental de la doctrina VPS contra la realidad medida

**Tarea:** t14 · Corrección documental (propuesta, **NO aplicada**)
**Ejecutor:** vps-edge
**Base empírica:** exclusivamente los entregables de **t7** en `audit/alignment/2026-10-25/40-vps/` (`VPS_INVENTORY.md`, `VPS_NGINX_DUMP_ANALYSIS.md`, `VPS_LUA_MODULES.md`, `VPS_LISTS_INVENTORY.md`, `VPS_DRIFT_VS_REPO.md`, `VPS_READONLY_ATTESTATION.md`).
**Comandos nuevos contra el VPS en esta tarea: NINGUNO.** No se abrió sesión SSH. Toda la columna «realidad medida» cita comando + salida ya capturados en t7 (ver §5).
**Archivos doctrinales editados: NINGUNO.** Este documento es una propuesta; el parche de §2 está listo para aplicar y **no se aplicó**.

---

## 0. Nota de ruta (corrige el enunciado de la tarea)

El enunciado pide buscar en `.agents/skills/iptv-omega-working-flow-manifesto/SKILL.md`. **Esa ruta no existe en el repo.**

| Comprobación | Resultado |
|---|---|
| `Test-Path ".agents/skills/iptv-omega-working-flow-manifesto"` | **False** — `.agents/skills/` existe (308 subdirectorios) pero **no contiene** el manifiesto OMEGA |
| `Get-ChildItem $HOME\.agents\skills\iptv-omega-working-flow-manifesto` | **Existe**, `SKILL.md` = **48 262 B** |

**Ubicación real del manifiesto:** `C:\Users\HFRC\.agents\skills\iptv-omega-working-flow-manifesto\SKILL.md`
(con `references/01-pipeline-flow.md` 6 720 B, `02-codec-ladder.md` 4 876 B, `03-vps-shielded-impact-audit.md` 4 917 B, `04-freeze-postmortem-20260608.md` 3 454 B).

**Consecuencia documental por sí sola:** el manifiesto que gobierna la doctrina del repo **vive fuera del repo y no está versionado en él**. No es auditable por `git log`, no viaja con el proyecto y no puede ser revisado por otro agente que clone el repositorio. Esto es un hallazgo de gobernanza, no de runtime. Todas las citas de este documento referencian la ruta real.

---

## 1. Tabla: afirmación doctrinal → realidad medida → archivo:línea

Convención de rutas: `MANIFEST` = `C:\Users\HFRC\.agents\skills\iptv-omega-working-flow-manifesto\SKILL.md`.

### 1.1 Las «5 fases Lua»

| # | Afirmación doctrinal (texto) | Archivo:línea | Realidad medida |
|---|---|---|---|
| 1.1.1 | «la capa VPS (paso 5) **ahora tiene 5 fases Lua** + un motor Rust» | `MANIFEST:148` | **3 fases con handler Lua** |
| 1.1.2 | «pipeline Nginx de **5 fases Lua + un motor Rust embebido**» | `MANIFEST:151` | 3 fases + 0 motores |
| 1.1.3 | «Arquitectura — **pipeline Nginx de 5 fases Lua** (en `/etc/nginx/snippets/shield-location.conf`, `location ~ ^/shield/`)» | `MANIFEST:164` | `shield-location.conf` **NO EXISTE** |
| 1.1.4 | «1. `rewrite_by_lua` → `ape_crystal_rewrite.lua` = `decision_engine.lua` … + `ape_ts_crystal_hook.lua`» | `MANIFEST:165` | **`rewrite_by_lua`: 0 ocurrencias** en `/etc/nginx` |
| 1.1.5 | «2. `access_by_lua` → `upstream_gate.lua` (cooldown gate…)» | `MANIFEST:166` | **`access_by_lua`: 0 ocurrencias** |
| 1.1.6 | «3. `header_filter_by_lua` → `ape_shield_header_filter.lua`» | `MANIFEST:167` | Existe la **fase**, con otro módulo: `ape_header.lua` |
| 1.1.7 | «4. `body_filter_by_lua` → `ape_shield_body_filter.lua`» | `MANIFEST:168` | Existe la **fase**, con otro módulo: `ape_uri_rebase.lua` |
| 1.1.8 | «5. `log_by_lua` → `ape_segment_guardian.lua`» | `MANIFEST:169` | Existe la **fase**, con otro módulo: `ape_wake_on_manifest.lua` |
| 1.1.9 | «5 fases Lua **estrictamente ordenadas**» | `MANIFEST:237` | 3 fases, orden nginx nativo |
| 1.1.10 | «a través de **5 fases estrictas**» | `MANIFEST:679` | 3 fases |
| 1.1.11 | «El enrutamiento ocurre en Nginx (`/etc/nginx/snippets/shield-location.conf`)» | `MANIFEST:679` | archivo inexistente |
| 1.1.12 | Diagrama Mermaid `F1…F5` con `rewrite/access/header_filter/body_filter/log` | `MANIFEST:353-357` | F1 y F2 no existen |
| 1.1.13 | Diagrama D2 `lua_rewrite` / `lua_access` | `MANIFEST:488-489` | no existen |
| 1.1.14 | Pipeline consolidado 1→5 con `ape_shield_log.lua` | `MANIFEST:617-621` | no existe |

**Realidad medida (t7).** Fases con directiva `*_by_lua` realmente presentes en `/etc/nginx`:

| Fase | ¿Existe? | Módulo cableado |
|---|---|---|
| `rewrite_by_lua*` | **NO** | — |
| `access_by_lua*` | **NO** | — |
| `header_filter_by_lua_file` | **SÍ** | `/etc/nginx/lua/ape_header.lua` (2 210 B · `a15e1fe3…`) |
| `body_filter_by_lua_file` | **SÍ** | `/etc/nginx/lua/ape_uri_rebase.lua` (6 043 B · `1d456a46…`) |
| `log_by_lua_file` | **SÍ** | `/etc/nginx/lua/ape_wake_on_manifest.lua` (2 284 B · `d9c6b65d…`) |
| `content_by_lua_file` | **SÍ** | `ape_obs`, `ape_gateway`, `ape_lab_api`, `ape_lab_upload`, `ape_luatest` |

Fuente: `VPS_LUA_MODULES.md` §3 (tabla) y §3 nota; `VPS_NGINX_DUMP_ANALYSIS.md` §5.

---

### 1.2 Motor Rust / LuaJIT en `:8084`

| # | Afirmación doctrinal | Archivo:línea | Realidad medida |
|---|---|---|---|
| 1.2.1 | «**APE CRYSTAL ENGINE v2.0 — Rust+LuaJIT Quantum Pipeline (desplegado en vivo 2026-06-21, VPS 178.156.147.234)**» | `MANIFEST:159` | no desplegado; unit inexistente |
| 1.2.2 | «Motor `ape-crystal-rust` (`:8084`, systemd, Rust 1.96.0 + LuaJIT embebido vía `mlua`)» | `MANIFEST:171` | `Unit ape-crystal-rust.service could not be found` |
| 1.2.3 | «`/process` (FFmpeg): `.ts`/`.m4s` → tokio async → ffmpeg scale=3840:2160:lanczos…» | `MANIFEST:173` | puerto cerrado, sin binario |
| 1.2.4 | «Servicio nativo en `:8084` que procesa manifiestos vía LuaJIT en <6µs» | `MANIFEST:225` | `curl :8084` → **`000`** |
| 1.2.5 | «**Estado (Junio 2026):** Motor Rust `active (running)` · Nginx `active (running)` con caché 45s» | `MANIFEST:228` | **`inactive` / `not-found`**; `/dev/shm/nginx_cache` = 0 B |
| 1.2.6 | «Servicio `ape-crystal-rust` en `:8084` como demonio systemd» | `MANIFEST:258` | unit ausente |
| 1.2.7 | «`sudo systemctl status nginx ape-crystal-rust`» (SOP) | `MANIFEST:301` | el segundo unit no existe |
| 1.2.8 | «`curl -s http://127.0.0.1:8084/health`» / «`/metrics`» | `MANIFEST:302-303` | ambos → `000` |
| 1.2.9 | «`ss -tlnp \| grep -E '80\|443\|8084'`» | `MANIFEST:304` | 8084 **no aparece** |
| 1.2.10 | «Reiniciar motor Rust: `sudo systemctl restart ape-crystal-rust`» | `MANIFEST:309`, `:321` | fallaría: unit inexistente |
| 1.2.11 | «`tail -50 /var/log/nginx/shield_error.log \| grep "127.0.0.1:8084"`» | `MANIFEST:312` | log de un location inexistente |
| 1.2.12 | «El demonio `ape-crystal-rust` (puerto `:8084`) integra LuaJIT … vía `mlua`» | `MANIFEST:689` | no existe |
| 1.2.13 | «`systemctl status nginx ape-crystal-rust` · `curl :8084/metrics`» | `MANIFEST:721-722` | idem |
| 1.2.14 | Diagramas: nodo `RUST["APE Crystal Engine v2.0 :8084"]` con `/health` `/manifest` `/process` `/luapool` | `MANIFEST:364-367`, `:498-506` | nodo inexistente en producción |

**Realidad medida (t7).** `systemctl status ape-crystal-rust` → `Unit ape-crystal-rust.service could not be found` · `is-enabled` → `not-found` · `is-active` → `inactive` · `ss -tlnp | grep 8084` → **vacío** · `curl -m 4 -w %{http_code}` a `/health` y `/metrics` → **`000` / `000`** · `find / -maxdepth 4 -name "ape-crystal*" -type f` → **sólo** `/var/backups/ape-crystal-patches/ape-crystal-upscaler-location.conf.bak_220418` (un `.conf` de backup, no un binario).
Fuente: `VPS_INVENTORY.md` §4 y §7; `VPS_DRIFT_VS_REPO.md` §5 (6 filas, 6 FAIL).

---

### 1.3 La ruta `/shield/{token}/{host}/…`

| # | Afirmación doctrinal | Archivo:línea | Realidad medida |
|---|---|---|---|
| 1.3.1 | «`https://iptv-ape.duckdns.org/shield/{TOKEN}/{HOST_PROVEEDOR}/{RUTA_DEL_CANAL}`» | `MANIFEST:274` | **HTTP 404** |
| 1.3.2 | «Verificación: `curl -I "https://iptv-ape.duckdns.org/shield/..."` → buscar `X-APE-Crystal-Engine: v2.0-Rust`» | `MANIFEST:286-287` | el header nunca aparece: no hay motor |
| 1.3.3 | «El sistema **intercepta automáticamente cualquier tráfico por `/shield/`**» | `MANIFEST:293` | no hay `location` de `/shield/` |
| 1.3.4 | «`location ~ ^/shield/`» dentro de `shield-location.conf` | `MANIFEST:164` | archivo y location inexistentes |
| 1.3.5 | Diagrama: `SHIELD["shield-location.conf\n/shield/{token}/{host}/{path}"]` | `MANIFEST:349`, `:485` | idem |
| 1.3.6 | Diagrama: `player.tivimate -> vps.nginx.shield: "HTTPS /shield/{token}/{host}/..."` | `MANIFEST:395`, `:554` | ese camino devuelve 404 |
| 1.3.7 | «`head -100 /var/log/nginx/shield_access.log \| grep "profile="`» (SOP diagnóstico) | `MANIFEST:314` | log inexistente |

**Realidad medida (t7).** `curl -sI -m 6 -k https://iptv-ape.duckdns.org/shield/deadbeef/line.tivi-ott.net/live/user/pass/1.m3u8` → `HTTP/1.1 404 Not Found`.
En `nginx -T` (36 954 B / 850 líneas) la cadena `/shield/` aparece **UNA sola vez**, y **no es una `location`**: es el `map $request_uri $xtream_account` de `conf.d/iptv-limit-conn.conf:9`.
Fuente: `VPS_INVENTORY.md` §7 (H-02); `VPS_NGINX_DUMP_ANALYSIS.md` §1.1 y §6.1.

> **Contradicción interna de la doctrina.** `CLAUDE.md:371-374` ordena: «SHIELDED = SOLO renombrar el archivo … Las URLs internas … **NUNCA se envuelven con `/shield/`**». El manifiesto (`MANIFEST:274`) documenta como estructura canónica de URL precisamente `…/shield/{TOKEN}/…`. **Ambas no pueden ser ciertas a la vez.** La medición zanja el empate a favor de `CLAUDE.md`: las listas servidas usan URLs **directas al proveedor**, y `/shield/` da 404. Ver §1.5.

---

### 1.4 «Nginx / OpenResty»

| # | Afirmación doctrinal | Archivo:línea | Realidad medida |
|---|---|---|---|
| 1.4.1 | «**Nginx / OpenResty**: Proxy inverso, autenticador y ejecutor del pipeline Lua» | `MANIFEST:224` | **nginx 1.24.0 (Ubuntu)**, no OpenResty |
| 1.4.2 | «combina la altísima concurrencia de **Nginx/OpenResty**» | `MANIFEST:234` | idem |
| 1.4.3 | «Ubuntu 24.04 LTS — **OpenResty / Nginx**» (diagrama) | `MANIFEST:345`, `:347`, `:477-478` | idem |
| 1.4.4 | «utilizando **Nginx/OpenResty** como proxy inverso» | `MANIFEST:670` | idem |
| 1.4.5 | «`VPS nginx/OpenResty:` … `combined_body_filter.lua · upstream_gate.lua · shield_follow_302.lua`» | `docs/REA_STREAMING_ANALYSIS.md:221` | ninguno de los 3 está desplegado |
| 1.4.6 | «Nginx/OpenResty Engineer» como especialista S6 | `CLAUDE.md:575` | rol válido; el runtime no es OpenResty |
| 1.4.7 | «`shield_follow_302` → requiere **lua-resty-http, AUSENTE en el VPS**» | `conf.d/50-ape-meta-plane.conf:16-18` (comentario **real en el VPS**) | **el propio VPS ya documenta la ausencia** |

**Realidad medida (t7).** `nginx -v` → `nginx/1.24.0 (Ubuntu)` · `nginx -V` → `--prefix=/usr/share/nginx --conf-path=/etc/nginx/nginx.conf … -fPIC --with-compat --with-debug --with-pcre-jit …` (sin `--add-module=lua`, que se carga dinámicamente).
`/etc/nginx/modules-enabled/50-mod-http-lua.conf` → `load_module modules/ngx_http_lua_module.so;` · `/usr/lib/nginx/modules/ngx_http_lua_module.so` = **443 320 B**, mtime `2024-01-19` · versión de módulo declarada en el código desplegado: **libnginx-mod-http-lua 0.10.26** (nginx 1.24 + lua 0.10.26, `ape_uri_rebase.lua` cabecera).
`command -v openresty` → **vacío** · `command -v luajit` → **vacío** · sólo `/usr/bin/lua`.
Fuente: `VPS_INVENTORY.md` §2 y §2 nota; `VPS_LUA_MODULES.md` encabezado.

**Por qué importa operativamente (no es semántica):** sin OpenResty **no hay `lua-resty-http`**, y sin `luajit` CLI no se puede validar sintaxis Lua localmente en el host. Cualquier SOP que invoque `resty`, `luarocks` o `luajit -bl` **falla en esta caja**. El propio `50-ape-meta-plane.conf` ya lo asume y por eso NO cablea `shield_follow_302`.

---

### 1.5 Transporte / reescritura de video

| # | Afirmación doctrinal | Archivo:línea | Realidad medida |
|---|---|---|---|
| 1.5.1 | «`combined_body_filter.lua` (body_filter_by_lua) **LEE X-APE-*** + usa `ape_codec_cascade.lua` + `ape_virtual_4k.lua` → **reescribe el manifest**» | `MANIFEST:46-47` | `combined_body_filter.lua` **no desplegado** |
| 1.5.2 | «**Null Packet**: si marcado 403 → reemplaza body con TS Null Packet PID `0x1FFF`, 188 bytes → el player salta sin freeze» | `MANIFEST:168` | no existe ese body filter |
| 1.5.3 | «`/process` … ffmpeg `scale=3840:2160:lanczos + unsharp + zscale BT.2020/PQ + libx265 10-bit`» (upscaling de vídeo en el VPS) | `MANIFEST:173`, `:260` | sin motor; y ver nota de física abajo |
| 1.5.4 | «`ape_ts_crystal_hook.lua` (v3.0): **intercepta peticiones de segmentos (`.ts`, `.m4s`)** → motor Rust» | `MANIFEST:241` | los segmentos responden **404** |
| 1.5.5 | Diagrama: `F1 -->\|".ts → /process\n.m3u8 → /manifest"\| RUST` | `MANIFEST:409`, `:576` | ese flujo no existe |
| 1.5.6 | «`shield-location.conf` \| `/shield/<hash>/<host>/<path>` → `proxy_pass` dinámico + cache 20 s \| **puede ser video**» | `docs/VPS_METADATA_ONLY_EVALUATION.md:61` | el VPS **no** transporta vídeo |
| 1.5.7 | «el propietario refinó la doctrina PQ-incondicional **en la capa del VPS Lua** (`combined_body_filter.lua`)» | `CLAUDE.md:235-237` | módulo no desplegado → el refinamiento LEVER B **no está activo en producción** |
| 1.5.8 | «Rebase absoluto de URIs en `combined_body_filter.lua` + `location \.(ts\|m4s)$ { return 404; }`» | `docs/VPS_UPSCALE_4K_DESIGN.md:176` | el `return 404` **sí** está; el rebase lo hace **otro** módulo (`ape_uri_rebase.lua`) |

**Realidad medida (t7).** En los **dos** server públicos de `nginx -T`:
`location ~* \.(ts|m4s|mp4)$ { return 404; }` (`sites-enabled/default`) y
`location ~* \.(ts|m4s|mp4|m4a|aac|vtt|key)$ { return 404; }` (`snippets/ape-meta-public.conf:44`).
El módulo que **sí** reescribe manifiestos es `ape_uri_rebase.lua` (6 043 B, `1d456a46…`), y su función **no es reescribir calidad**: convierte URIs relativas en absolutas hacia el proveedor «para que el reproductor NUNCA pida segmentos al VPS».
Evidencia de que funciona: `/_ape/health` → `{"ok":true,"plane":"meta/v3", …, "rebase_ok":1, "last_host":"line.tivi-ott.net", "error_ratio":0}`.
Fuente: `VPS_NGINX_DUMP_ANALYSIS.md` §2.2/§2.3/§6; `VPS_LUA_MODULES.md` §2.

> **Matiz de física que la doctrina ya reconoce en parte.** `MANIFEST:208-213` admite: «Video 4K HEVC: 1080p→4K = **8-9 s/segmento** … > timeout 8s → **passthrough** … El upscaling 4K de píxeles **casi no ocurre** en esta caja». La corrección no es que la física esté mal, es que **el `/process` que esa frase describe tampoco existe**: no hay motor que pueda hacer passthrough, porque no hay motor.

---

### 1.6 Telemetría Conviva alimentando el LAB

| # | Afirmación doctrinal | Archivo:línea | Realidad medida |
|---|---|---|---|
| 1.6.1 | «**QoE** … `conviva-event.php → conviva.db → realimenta recalibración del LAB`» | `MANIFEST:57` | `conviva.db` = **0 B, 0 tablas** |
| 1.6.2 | «`qoe-flush.php` → `ConvivaPersistence::recordServerSideQoE()` (**SQLite table**) + `recordHdcpIncident()`» | `CLAUDE.md:304-305` | no hay tabla donde escribir |
| 1.6.3 | «`vps/prisma/lib/conviva_persistence.php` (tabla `channel_hdcp_profile` + 4 métodos)» | `CLAUDE.md:278` | tabla inexistente (DB vacía) |
| 1.6.4 | «`vps/prisma/lib/conviva_persistence.php` (tabla `server_side_qoe_metrics` + 2 métodos)» | `CLAUDE.md:325` | tabla inexistente |
| 1.6.5 | «`VPS SQLite (channel_hdcp_profile)` → INSERT/UPDATE `hdcp_level='NONE'` … → el bulk fetch refleja NONE» | `CLAUDE.md:262-264` | sin tabla no hay adaptación HDCP |
| 1.6.6 | «SQLite (`conviva.db`)» como almacén del stack | `docs/superpowers/plans/2026-06-16-omega-visual-loop-100pct.md:9` | archivo de 0 B |
| 1.6.7 | «`lua_shared_dict ape_qoe 1m; # telemetría del plano (contadores reales, los publica /_ape/qoe)`» | `conf.d/50-ape-meta-plane.conf:68` (VPS real) | **esto sí funciona**, pero es telemetría **del plano de metadata**, no QoE de player |

**Realidad medida (t7).** Lectura read-only (`python3`, `file:…?mode=ro&immutable=1`):

| DB | Tamaño | Tablas |
|---|---|---|
| `/var/www/html/prisma/db/conviva.db` | **0 B** (mtime `2026-06-16T03:47:30Z`) | **0** |
| `/var/www/html/prisma/db/ape_lists.db` | 53 248 B | `registered_lists`=**26**, `list_channel_headers`=**4**, `list_profile_headers`=**0** |
| `/var/www/html/prisma/db/ape_devices.db` | 24 576 B | `ape_devices`=**0**, `ape_providers`=**0** |

`sqlite3` CLI **no está instalado** en el VPS (por eso se leyó con python3 en modo inmutable).
Fuente: `VPS_DRIFT_VS_REPO.md` §6; `VPS_INVENTORY.md` §5.

> **Honestidad requerida:** el módulo `ape_obs.lua` **declara** la limitación correctamente: «Honestidad de las métricas: son del PLANO DE METADATA … **NO son rebuffer del player**, que sólo puede medir el reproductor o el observador de segmentos (**no desplegado aquí porque este VPS no sirve video**)». Es decir: **el código en producción es más honesto que la doctrina que lo describe.**

---

### 1.7 Watchdogs activos

| # | Afirmación doctrinal | Archivo:línea | Realidad medida |
|---|---|---|---|
| 1.7.1 | «`/watchdog-status` — **Health checks status**» | `CLAUDE.md:587` | reportaría vigilancia inexistente |
| 1.7.2 | «Show watchdog status for **ape-realtime-guardian + wg-health + sentinel**» | `.claude/commands/watchdog-status.md:2`, `:9` | `ape-realtime-guardian`: **sin unit systemd**; `netshield-sentinel.timer`: **inactive** |
| 1.7.3 | «`linux-vps-sre-engineer.md` (S7, 30 skills) — systemd / **watchdog**» | `CLAUDE.md:576` | rol válido; el inventario no coincide |
| 1.7.4 | «`upstream_gate` **passthrough**» (contado como vigilancia/seguridad) | `docs/VPS_MATURITY_AND_SLO_PLAN.md:94` | `upstream_gate.lua` **no desplegado** (ni la fase `access_by_lua`) |
| 1.7.5 | «Operación (SOP): `reload` no `restart`…» (asume servicio Rust vigilado) | `MANIFEST:193` | no hay servicio que vigilar |
| 1.7.6 | «el relay de watchdog» / ciclo 365 días con watchdogs systemd | `AGENTS.md` (tabla S7) | ver realidad abajo |

**Realidad medida (t7).** `systemctl is-active <u>.timer` para los 15 units en `/etc/systemd/system/*.timer`:

**ACTIVOS (8):** `cache-hygiene` (5 min) · `iptv-quality-monitor` (**2 s**) · `ape-meta-watchdog` (**60 s**, `fails=0`) · `ape-net-tuning` (oneshot cumplido) · `wg-health-fast` · `surfshark-failover` · `iptv-tcp-autosync` · `unbound-prewarm`.

**INACTIVOS (7) — todo el linaje `netshield-*`:** `netshield-autopilot` · `netshield-backup` · `netshield-health` · `net-shield-metrics` · `netshield-sentinel` · `net-shield-throughput` · `netshield-wg-health`.

Los 15 archivos `.timer` **siguen presentes** en `/etc/systemd/system/`, pero 7 no corren. El **único** mecanismo con poder de recargar/reiniciar nginx es `/usr/local/bin/ape-meta-watchdog.sh` (consulta `http://127.0.0.1:8088/_ape/health` cada 60 s; a los 3 fallos hace `nginx -t` → `reload`, o `restart` si falla la validación).
Fuente: `VPS_INVENTORY.md` §9 (tabla de timers + §«Watchdog que sí vigila»); `VPS_DRIFT_VS_REPO.md` §7.

---

### 1.8 Afirmaciones autopista verificadas (no corregidas, pero con matices)

Estas **no** requieren corrección de texto: requieren **matiz de alcance**, porque la doctrina las enuncia sin decir a qué plano aplican.

| Afirmación | Archivo:línea | Medido | Veredicto |
|---|---|---|---|
| «`proxy_read_timeout` >= 60s» | `CLAUDE.md:387` · `docs/PROMPT_MAESTRO_INGENIERIA_EXTREMA.md:45` | **5 s** en `/meta/` y `/cdn/`; 20 s en `/cdn/` del 443; 300 s/86 400 s en `coa-navigator` | **desviación real**, pero en el **plano de metadata**, no en camino de segmentos (no hay camino de segmentos) |
| «`limit_conn xtream_slot` >= 2» | `CLAUDE.md:386` | zona definida (`xtream_slot:10m`) y **directiva `limit_conn` AUSENTE** | sin límite ⇒ **más** permisivo, no frena (no viola la regla cardinal) |
| «`upstream_gate.lua` = PASSTHROUGH» | `CLAUDE.md:385` | no desplegado | invariante **vacío** (no incumplido: inaplicable) |
| «`tcp_congestion_control` = bbr» | `CLAUDE.md:388` | `bbr` + `fq` + `tcp_notsent_lowat=131072` + `tcp_slow_start_after_idle=0` + `tcp_fastopen=3` | **PASS** |
| «`proxy_cache_valid 302 301` = 0» | `CLAUDE.md:389` | **0 directivas `proxy_cache_valid`** + `proxy_cache off` | **PASS** (doble) |

Fuente: `VPS_NGINX_DUMP_ANALYSIS.md` §4; `VPS_INVENTORY.md` §6.

---

## 2. Texto de reemplazo propuesto — **PROPUESTA, NO APLICADA**

> Estos bloques están listos para aplicar. **No se aplicó ninguno.** Cada bloque indica el rango exacto a sustituir y el archivo destino.

### BLOQUE-A — Reemplazo de `MANIFEST:148-156`

**Sustituir** (desde `## Extensión del flujo probado — la capa VPS (paso 5) ahora tiene 5 fases Lua + un motor Rust` hasta el final del párrafo que empieza «Importa para ESTE manifiesto…»):

```markdown
## La capa VPS (paso 5) — verdad medida (2026-10-26, auditoría t7)

El flujo OMEGA `LAB→JSON→lista→VPS→ADB→player` sigue intacto. Lo que **no** es cierto es la
descripción del paso 5 que circuló como doctrina. La medición directa del VPS de producción
(`178.156.147.234`, `ubuntu-2gb-ash-1`) sobre `nginx -T` (36 954 B / 850 líneas), hashes de
todos los módulos y `systemctl`/`ss`/`curl` da este cuadro:

**Lo que el VPS ES:** un **edge metadata-only**. Sirve listas estáticas desde `/var/www/lists`
(vía `/lists/`) y expone en `:8088` un plano de metadata (`/meta/<host><path>`, `/cdn/<host><path>`,
`/_ape/*`) cuyo único trabajo es **rebasar URIs** de la playlist a absolutas del proveedor para
que el reproductor **nunca** pida segmentos al VPS. No transporta ni reescribe vídeo:
`location ~* \.(ts|m4s|mp4)$ { return 404; }` en ambos server públicos.

**Pipeline real: 3 fases** (no 5), sobre `nginx 1.24.0 (Ubuntu)` + `ngx_http_lua_module` 0.10.26:

| Fase | Módulo desplegado | Función |
|---|---|---|
| `header_filter_by_lua_file` | `ape_header.lua` | quita `Content-Length` (el body se reescribe) + `dofile` de `sentinel_auth_guard.lua` (observador passthrough, **nunca** `ngx.exit`) |
| `body_filter_by_lua_file` | `ape_uri_rebase.lua` | rebase de URIs al origen del proveedor |
| `log_by_lua_file` | `ape_wake_on_manifest.lua` | wake-on-manifest post-respuesta (cero TTFB) |

Las fases `rewrite_by_lua` y `access_by_lua` **no existen** en la configuración (0 ocurrencias).
No hay `upstream_gate` ni `decision_engine` en el camino de la petición.

**Lo que el VPS NO ES:** no corre OpenResty (es nginx de Ubuntu con el módulo Lua dinámico: sin
`lua-resty-http`, sin `luajit` CLI). No hay motor Rust `ape-crystal-rust` en `:8084` (service
inexistente, puerto cerrado, `/health` y `/metrics` = `000`). No hay `shield-location.conf` ni
ruta `/shield/` (responde **404**). No hay telemetría Conviva persistida (`conviva.db` = 0 B).

**Cómo leer el resto de este manifiesto:** las secciones marcadas `CRYSTAL-ENGINE-V2-*` son
**diseño histórico / intención**, no estado desplegado. Se conservan por trazabilidad; no se
deben usar como fuente de verdad operativa. La fuente de verdad del VPS es
`audit/alignment/2026-10-25/40-vps/VPS_*.md`.

**Lo que sí se cumple y hay que proteger:** `SHIELDED = solo sufijo de archivo` (verificado byte a
byte: la lista `_SHIELDED.m3u8.gz` descomprime a un payload **idéntico** al de la lista base, y su
última URL es directa al proveedor); `gzip_static` sirviendo el `.gz`; BBR activo; ningún 302
cacheado; manifiestos nunca cacheados.
```

### BLOQUE-B — Reemplazo del bloque `<!-- CRYSTAL-ENGINE-V2-KNOWLEDGE --> … <!-- /CRYSTAL-ENGINE-V2-KNOWLEDGE -->` (`MANIFEST:158-194`)

**Sustituir el bloque completo por:**

```markdown
<!-- CRYSTAL-ENGINE-V2-KNOWLEDGE: HISTÓRICO — NO DESPLEGADO -->
> **⛔ ESTADO: NO DESPLEGADO. Medido 2026-10-26 (auditoría t7).**
>
> El siguiente diseño **no corresponde al VPS de producción**. Se conserva como **registro de
> intención** porque explica por qué existieron ciertos artefactos, pero **ninguna** de sus
> afirmaciones de estado es válida hoy:
>
> | Afirmación del diseño | Medición |
> |---|---|
> | Pipeline de 5 fases en `/etc/nginx/snippets/shield-location.conf` | archivo **inexistente**; 3 fases |
> | Motor `ape-crystal-rust` `:8084` systemd | `Unit could not be found`; `:8084` cerrado |
> | «desplegado en vivo 2026-06-21» | no hay rastro de despliegue activo |
> | «Motor Rust `active (running)`» | `inactive` / `not-found` |
> | `/process` upscaling FFmpeg 4K | sin binario, sin FFmpeg invocado por nginx |
> | `/shield/{token}/{host}/…` | **404** |
> | anti-403 de 4 capas + Null Packet + prefetch | 0 de los módulos que las implementan presentes |
>
> **Si alguien necesita re-verificar:** `audit/alignment/2026-10-25/40-vps/VPS_DRIFT_VS_REPO.md` §4-§5
> y `VPS_INVENTORY.md` §4. Para re-medir: `ssh hetzner-iptv 'systemctl status ape-crystal-rust; ss -tlnp | grep 8084'`.
>
> **NO desplegar este diseño para «alinear la documentación con la realidad».** La realidad es
> correcta; la documentación era el error. Ver `DOCTRINE_CORRECTION.md` §4.
```

### BLOQUE-C — Reemplazo de la cabecera de `<!-- CRYSTAL-ENGINE-V2-FULL-DOCS -->` (`MANIFEST:196-…`)

**Anteponer** al bloque (sin borrar los 4 documentos, que son registro histórico):

```markdown
> **⛔ ADVERTENCIA DE VIGENCIA — añadida 2026-10-26 (t7).**
> Los 4 documentos siguientes (README / ARQUITECTURA / MANUAL / SOP) describen el **APE Crystal
> Engine v2.0** como sistema en producción. **Medición del 2026-10-26: no está desplegado** —
> unit inexistente, `:8084` cerrado, `shield-location.conf` ausente, `/shield/` = 404, 8 de sus
> 11 módulos **no tienen ni siquiera código fuente en el repo**.
> **No usar el MANUAL §1 (estructura de URLs `/shield/…`) ni el SOP §1-§5 como procedimiento
> operativo**: sus comandos fallan (`systemctl status ape-crystal-rust`, `curl :8084/health`,
> `tail /var/log/nginx/shield_error.log`). Se conservan como registro de diseño.
```

### BLOQUE-D — Diagramas (`MANIFEST:335-600`, bloques `CRYSTAL-ENGINE-V2-DIAGRAMS`)

**Anteponer** al bloque:

```markdown
> **⛔ DIAGRAMAS DE DISEÑO, NO DEL ESTADO DESPLEGADO (revisado 2026-10-26, t7).**
> Los nodos `SHIELD["shield-location.conf …"]`, `PIPELINE (F1…F5)` y `RUST["APE Crystal Engine
> v2.0 :8084"]` **no existen en producción**. El grafo real es: cliente → nginx `:443`
> (`/lists/*.m3u8.gz` estático con `gzip_static`) y nginx `:8088` (`/meta/`, `/cdn/`, `/_ape/*`)
> con 3 fases Lua. Los nodos `LUAMODS` (`ape_crystal_fortify`, `ape_lcevc_enhancement_layer`,
> `ape_8k_crystal_escalator`) tampoco existen: los módulos reales son los 14 listados en
> `VPS_LUA_MODULES.md` §1.
```

### BLOQUE-E — `<!-- APE-CRYSTAL-EDGE-SKILL -->` (`MANIFEST:605-643`) y `-FULL100` (`MANIFEST:645-…`)

**Anteponer** a ambos:

```markdown
> **⛔ SKILL DE UN SISTEMA NO DESPLEGADO (revisado 2026-10-26, t7).**
> Las 5 fases, el motor `:8084` y los perfiles `?profile=PX` descritos aquí **no están operativos
> en el VPS de producción**. En particular, la «válvula de escape» `?profile=P5` **no tiene efecto**:
> no hay `location` que lea `profile=` (el `proxy_cache` está `off`, no hay reescritura de codec, y
> los segmentos responden 404). Su valor doctrinal (los invariantes de §7: nunca `ngx.exit` en
> body/header filter, `pcall` → passthrough, no tocar `proxy_next_upstream` desde Lua) **sí se
> conserva**, y de hecho **se cumple** en el código desplegado (verificado: 0 llamadas reales a
> `ngx.exit`).
```

### BLOQUE-F — `CLAUDE.md:381-391` (bloque `VPS NET SHIELD AUTOPISTA`)

**Sustituir** el bloque por una versión con alcance explícito:

```markdown
## VPS NET SHIELD AUTOPISTA (INMUTABLE)

El VPS (178.156.147.234) es un **edge metadata-only**: sirve listas y rebasa URIs; **no transporta
vídeo** (`location ~* \.(ts|m4s|mp4)$ { return 404; }`). Regla cardinal: **NUNCA frenar, bloquear,
limitar ni interferir con la reproducción**.

**Invariantes verificados (2026-10-26, t7):**
- `tcp_congestion_control` = `bbr` (+ `fq`, `tcp_notsent_lowat=131072`, `tcp_slow_start_after_idle=0`) — **PASS**
- `proxy_cache_valid 302 301` = 0 — **PASS** (no existe la directiva; `proxy_cache off`)
- Manifiestos nunca cacheados (`~*\.m3u8$ → proxy_no_cache 1`) — **PASS**
- `limit_conn xtream_slot` — zona `xtream_slot:10m` **definida**, directiva `limit_conn` **ausente** ⇒ sin límite (más permisivo, no frena)

**Invariantes con alcance limitado al plano de metadata (NO al camino de segmentos, que no existe):**
- `proxy_read_timeout` **5 s** en `/meta/` y `/cdn/` — por debajo del objetivo de 60 s. Aceptable
  **hoy** porque ese plano sólo pide playlists y el provider no sostiene conexiones largas; revisar
  si se añade cualquier proxy de segmentos.
- `upstream_gate.lua` = PASSTHROUGH — invariante **inaplicable**: el módulo no está desplegado y la
  fase `access_by_lua` no existe.

Ver SOP completo en `.agent/workflows/net-shield-autopista-sop.md`.
Verdad medida del VPS: `audit/alignment/2026-10-25/40-vps/VPS_INVENTORY.md`.
```

### BLOQUE-G — `CLAUDE.md:368-377` (`SHIELDED Architecture`)

**Añadir** al final del bloque (no sustituir — el texto actual es **correcto** y la medición lo confirma):

```markdown
**Verificado empíricamente (2026-10-26, t7):** la lista `APE_LISTA_1792869328847_SHIELDED.m3u8.gz`
(297 134 097 B) y su base `APE_LISTA_1792869328847.m3u8.gz` (297 134 088 B) descomprimen a un
payload **byte a byte idéntico** (`cmp` → `IDENTICAL_PAYLOAD`; 22 271 732 líneas ambas). La última
URL del archivo es `http://line.tivi-ott.net/live/…` — **directa al proveedor, sin `/shield/`**.
La ruta `/shield/{token}/{host}/…` documentada en el manifiesto OMEGA **responde 404** en producción:
no contradice esta regla, la refuerza.
```

### BLOQUE-H — `CLAUDE.md:376-379` inserción de puntero a la verdad medida

**Insertar** tras la sección AUTOPISTA:

```markdown
> **Fuente de verdad del VPS (2026-10-26, auditoría t7):** `audit/alignment/2026-10-25/40-vps/`
> — `VPS_INVENTORY.md`, `VPS_NGINX_DUMP_ANALYSIS.md`, `VPS_LUA_MODULES.md`,
> `VPS_LISTS_INVENTORY.md`, `VPS_DRIFT_VS_REPO.md`, `VPS_READONLY_ATTESTATION.md`.
> Ante cualquier discrepancia entre este archivo y esos entregables, **mandan los entregables**
> (están hasheados y fechados).
```

### BLOQUE-I — `.claude/commands/watchdog-status.md:2` y `:9`

**Sustituir** la línea de descripción por:

```markdown
description: Show watchdog status. Live VPS (requires SSH approval): 8 timers activos (cache-hygiene, iptv-quality-monitor, ape-meta-watchdog, ape-net-tuning, wg-health-fast, surfshark-failover, iptv-tcp-autosync, unbound-prewarm) + 7 netshield-* INACTIVOS. No existe ape-realtime-guardian como unit systemd. Baseline medido: audit/alignment/2026-10-25/40-vps/VPS_INVENTORY.md §9.
```

---

## 3. Artefactos: doctrinales ausentes en el VPS y commiteados nunca desplegados

### 3.1 Los 13 artefactos doctrinales — **y una distinción que cambia el diagnóstico**

t7 los reportó como «13 ausentes en el VPS». Al buscar su **código fuente en el repo**, se parten en dos grupos de naturaleza distinta:

#### Grupo A — el código EXISTE en el repo, nunca se desplegó (5 de 13)

| Artefacto | Copia canónica en el repo | Bytes | sha256 | Estado git |
|---|---|---|---|---|
| `shield-location.conf` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/shield-location.conf` | 5 973 | `4630adca2e892b6b6a187ff16e89d7cc4f6fd2eeaebb19bcc191d8fae74fa585` | tracked |
| `decision_engine.lua` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/decision_engine.lua` | 9 129 | `3eb7b00df749759e61ced533eb73a3441393c8af89a653ff3f4815522812b1e8` | tracked |
| `combined_body_filter.lua` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter.lua` | 22 685 | `31afd6d156f0da2b9f77e6e128b303830e4f0162358f8c36b9b55afedd290994` | tracked |
| `bandwidth_reactor.lua` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bandwidth_reactor.lua` | 13 625 | `ad187e9930039ca837c324b161a03021d4f93a9545baf1c75d652bd1289eee1f` | tracked |
| `upstream_gate.lua` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/upstream_gate.lua` · también `net-shield/nginx/lua/upstream_gate.lua` | 2 536 | `e4e1a5c28125dbc669789711d75c3f80640825452531456e7ce799d4cdbd5556` | tracked |

> **`shield-location.conf` tiene 4 copias divergentes en el repo:** 5 973 B (`vps/nginx/`), 5 353 B (`net-shield/nginx/`), y **3 745 B ×2** en snapshots de 2026-04-26. Cuatro generaciones del mismo archivo, ninguna desplegada. Cuál es el SSOT **no está declarado**.

#### Grupo B — el código **NO EXISTE en ningún lugar del repo** (8 de 13)

`Get-ChildItem -Recurse -Filter <nombre>` → **cero resultados** en todo el árbol:

| # | Artefacto declarado en la doctrina | ¿Existe fuente en el repo? |
|---|---|---|
| 1 | `ape_crystal_rewrite.lua` | **NO** |
| 2 | `ape_ts_crystal_hook.lua` | **NO** |
| 3 | `ape_shield_header_filter.lua` | **NO** |
| 4 | `ape_shield_body_filter.lua` | **NO** |
| 5 | `ape_segment_guardian.lua` | **NO** |
| 6 | `ape_crystal_fortify.lua` | **NO** |
| 7 | `ape_lcevc_enhancement_layer.lua` | **NO** |
| 8 | `ape_8k_crystal_escalator.lua` | **NO** |

**Consecuencia crítica (y es la razón de ser de este documento):** estos 8 módulos **existen únicamente como prosa** en el manifiesto y en el skill `ape-crystal-edge`. No son código que «falte desplegar»: son **código que nunca se escribió**. Por tanto **no se pueden desplegar**. Un agente que lea la doctrina y reciba la orden «despliega el pipeline Crystal» se encontraría con que el 62 % del pipeline (8/13) no tiene fuente — y la reacción probable sería **inventarlo**, que es exactamente el fallo que `iptv-vps-touch-nothing` previene.

### 3.2 Artefactos en **HEAD** nunca desplegados (DR-04) — con hash

Estos **sí** son código real, **commiteado**, y **no está en el VPS**:

| Artefacto | Ubicación en repo | En VPS | Bytes | sha256 |
|---|---|---|---|---|
| `ape_caps.lua` | `_vps_stage/lua/ape_caps.lua` (**HEAD**) | **AUSENTE** | 128 983 | `40404c70eb52b5c9030eeab3305cfce5125d05437f052b0baafdea38367c0043` |
| `ape_session.lua` | `_vps_stage/lua/ape_session.lua` (**HEAD**) | **AUSENTE** | 89 549 | `cbef5132a3a2f8e5521f271309fed03f9c369ac2c8496f2761317a76f6410965` |
| `media-fanout.conf` | `_vps_stage/nginx/media-fanout.conf` (**HEAD**) | **NO** en `/etc/nginx`; sólo `/tmp/media-fanout.conf`, `/tmp/mf_verify/`, `/tmp/mf_v1/src/nginx/` | 21 313 | `b1000903d3f1e5939fe0c4c0658809f7975e820eaf6c6a1fa8e4d1030c4112b9` |
| `autopista-trap.conf` | `vps_configs/autopista-trap.conf` | **NO** en `/etc/nginx`; sólo backups históricos (`/root/ape_orchestration_backup_20260612_062848/`, `/root/ape_backups_407_deep_20260612T162829Z/`, `/var/backups/ape-dnsonly-1781933419/`) | 6 958 | `1d0b483f295c340ee437dd7f2e08db5b61aeeaedccafea09b4af7d8bf2f83130` |
| `fix_trap.py` | `vps_configs/fix_trap.py` | AUSENTE | 388 | `1205addc01b46ff068e600e9b06e65a1e70ef89f3824cd2a2ef8c1da624d35abe` |
| `hooks_balance.sh` | `vps_configs/hooks_balance.sh` | AUSENTE | 2 641 | `2c6b672948511450061341ac1ad47a75b0b34b72a49d88b8023af578ed3c2039` |
| `inject_all_reactor.py` | `vps_configs/inject_all_reactor.py` | AUSENTE | 1 995 | `d3d9245858fa6903c42a644340d38272ded506e744c0a62345470e78db85c3eb` |
| `inject_reactor_log.py` | `vps_configs/inject_reactor_log.py` | AUSENTE | 1 266 | `2431283ac3e2443fedfec2e90fb9d94e3dd0cca095eae225fd54ab187930ab76` |
| `inject_reactor.py` | `vps_configs/inject_reactor.py` | AUSENTE | 935 | `3cd83d742d62746b0a52702764bd55625e7d36bcbae1e293d809939e6272e7f7` |
| `lua_inventory.sh` | `vps_configs/lua_inventory.sh` | AUSENTE | 1 649 | `e6d0b0a555b6bf401738d2fff25cc2b5f4a323dd48a2b3e571a4a35bb50d05f` |

> **`lua_inventory.sh` (1 649 B) no está desplegado** — y es, precisamente, el script que habría producido el inventario que hubo que reconstruir a mano en t7. Se cita el hecho; no se propone desplegarlo.

### 3.3 Artefactos WIP **no commiteados** (no son HEAD) — separados a propósito

`git status` los marca `??`; **no están en HEAD**, así que **no son «commiteados nunca desplegados»** sino trabajo en curso de otra sesión:

| Artefacto | Bytes | sha256 | VPS |
|---|---|---|---|
| `_vps_stage/nginx/cache-first-edge.conf` | 9 873 | `d857bb16ffba2dbf46a941f78f608182240ac558f434117ed19515beabaa75a6` | AUSENTE |
| `_vps_stage/nginx/ape-edge-watchdog.sh` | 4 231 | `83ea7c5052e988e1ed103ce9d2f9767bb48eb18573c020e4279522d1e5336dda` | AUSENTE |
| `_vps_stage/nginx/logrotate-ape-edge.conf` | 1 552 | `2b0b6ec66725bbcde7eb1f4d15ddf84405ffb23817401e50c88ca2cc4543ec2e` | AUSENTE |
| `_vps_stage/ops/ape-nginx-restart-audit.sh` | 1 439 | `0db5508f70403935511af1ad14644d41b433c894b718327aa2b6f33466544673` | AUSENTE |
| `_vps_stage/lua/ape_edge_health.lua` | 2 879 | `86ebcb659f73b5b5112be54c523a46a1388f8428ec48157add03f0856fd4e71b` | AUSENTE |
| `_vps_stage/lua/ape_prefetch_next.lua` | 5 338 | `662b753bffe7f28436658e8dd2065ee66521af66d1973a1b9d11faa159a5b5bc` | AUSENTE |

### 3.4 El árbol Lua canónico del repo frente al VPS — la brecha de fondo

`IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/` es, según `docs/VPS_LUA_MODULE_MAP.md`, el **SSOT del Lua del VPS**. Contiene **26 archivos `.lua` + 1 `.json`**. El VPS tiene **14**.

| Conjunto | Cantidad |
|---|---|
| En el árbol canónico del repo | **26** `.lua` |
| En el VPS | **14** `.lua` |
| **En ambos** | **4** — `ape_profile_resolver`, `ape_wake_on_manifest`, `bw_adaptive_floor`, `sentinel_auth_guard` |
| **Sólo en el repo (nunca desplegado)** | **22** — incluye `ape_codec_cascade` (20 045 B), `combined_body_filter` (22 685 B), `decision_engine` (9 129 B), `bandwidth_reactor` (13 625 B), `floor_lock_filter` (9 269 B), `ape_virtual_4k` (3 608 B), `qoe_server_side_observer` (10 641 B), `qoe_flush_worker` (11 412 B), `shield_follow_302` (1 673 B), `upstream_gate` (2 536 B), `prisma_telemetry_full` (8 014 B), `quality_realtime` (12 236 B), `lab_config` (11 385 B), `sentinel_telemetry_api` (5 672 B), `sentinel_ua_apply` (3 362 B), `upstream_response` (5 455 B), `reactor_tick` (2 811 B), `follow_redirect` (1 144 B), `ape_uhdx_score` (1 143 B), `ape_device_state_writer` (992 B), `bandwidth_reactor_api` (1 594 B), `qm_apply_worker` (3 113 B) |
| **Sólo en el VPS** | **10** — `ape_gateway`, `ape_header`, `ape_lab_api`, `ape_lab_bridge`, `ape_lab_upload`, `ape_luatest`, `ape_obs`, `ape_rebase_lib`, `ape_uhd`, `ape_uri_rebase` |

**Lectura honesta:** el árbol canónico del repo describe un **VPS proxy/con-transformación** (22 módulos: coasters de codec, floor-lock, virtual-4K, telemetría server-side, prefetch). El VPS desplegado es un **VPS rebase-only** (10 módulos propios, ninguno de transformación de calidad). Son **dos arquitecturas distintas**, no dos versiones de la misma. **Esa es la corrección que la doctrina necesita**, y ningún ajuste de líneas la resuelve: exige que la doctrina **declare cuál de las dos es la vigente**.

> **No afirmo cuál debe ser.** Elegir arquitectura es del propietario. Lo que este documento afirma, medido, es: **lo que corre es el rebase-only, y la doctrina describe el proxy/con-transformación.**

---

## 4. NO HACER — por qué **no** se despliega el pipeline para «alinear»

### 4.1 La regla

`iptv-vps-touch-nothing` (skill obligatoria, cargada en t7) exige, para tocar producción, **siete** condiciones simultáneas, entre ellas:

> 3. Tener un plan de rollback escrito probado en staging o dry-run
> 4. Que el usuario haya dicho «Aplica» / «Hazlo» / «SIGUE»
> 6. Snapshot tomado
> 7. Confirmar que el target **NO** está en `vps_deploy_map.json` "no_touch" **y** que el cambio **NO** está ya vivo en el VPS — si no, es espejo documental (commit only, **NO** deploy, **NO** reload)

Y la tabla de racionalizaciones que la propia skill marca como **STOP**:

> «Por si acaso, agrega `proxy_next_upstream`» → «"Por si acaso" is the phrase that precedes prod breaks. Demand a concrete incident before adding directives.»

**«Desplegar el pipeline Crystal para que la documentación cuadre con la realidad» es la forma más pura de "por si acaso" que existe: no hay incidente, no hay síntoma, no hay usuario que lo haya pedido.** El único problema es que un documento describe mal un sistema sano.

### 4.2 Lo que se rompería, concretamente

El VPS funciona **hoy**. `/_ape/health` → `200` con `rebase_ok:1`, `error_ratio:0`, `shared_dicts:true`. Las listas se sirven con `gzip_static` y `Content-Length` correcto. Desplegar el pipeline tendría estos efectos medibles:

| Cambio propuesto («alinear») | Efecto real esperado |
|---|---|
| Añadir `location ~ ^/shield/` + `rewrite_by_lua` + `access_by_lua` | **1 sola directiva `*_by_lua` por fase y location** (nginx). Para meter `rewrite`/`access` hay que **reordenar** las 3 fases existentes en los locations de `/meta/` y `/cdn/`. `ape_header.lua` ya documenta que ganó ese pulido con dolor («nginx admite UNA sola directiva `*_by_lua` por fase», y el `Content-Length` truncaba respuestas). **Riesgo de reintroducir el truncado de playlist.** |
| Desplegar `combined_body_filter.lua` (22 685 B) como `body_filter` | **Colisión directa** con `ape_uri_rebase.lua`, que ocupa esa fase. Sólo uno puede correr. Cambiar el que corre **cambia el comportamiento de TODAS las playlists servidas** sin prueba de canal real. |
| Cablear `shield_follow_302` | El propio `50-ape-meta-plane.conf:16-18` dice que requiere `lua-resty-http` **AUSENTE** en el VPS. Cablearlo **rompe la petición** (documentado en el archivo que ya existe). |
| Activar `proxy_cache` (`iptv_cache`) para «usar» la cache de 500 MB | Con cache activa vuelve a ser cierto «cache vacía + tráfico» → **se reactiva el bucle de reinicios de nginx cada 20 min** que motivó desactivar `cache-health-monitor` (t7 §9.1). Y **el cron está desactivado**, así que nadie lo vigilaría. |
| Escribir los 8 módulos del Grupo B «para que existan» | Inventar 8 módulos sin fuente, sin tests y sin autorización = exactamente el fallo que `iptv-vps-touch-nothing` cataloga («El "fix" reactiva algo previamente eliminado»). Además violaría `iptv-omega-no-delete` por la vía inversa: crear arquitectura paralela a la vigente. |
| Reactivar los 7 timers `netshield-*` | Son 7 unidades cuyo contenido **no se ha auditado**. `netshield-sentinel`, `net-shield-throughput` y `netshield-autopilot` suenan a reactores de protección; la doctrina autopista exige **passthrough**, y un reactor mal reactivado puede llamar `ngx.exit` o limitar. **Riesgo de frenar la reproducción**, la única violación cardinal. |
| Reactivar `/etc/cron.d/cache-health-monitor` | Reinicia nginx cada ~20 min mientras `proxy_cache off` (causa raíz medida en t7). Es **mutación ajena**: la decisión es de quien la desactivó. |

### 4.3 Regla operativa que se propone adoptar

> **La documentación se corrige escribiendo documentación. Producción se toca sólo con un incidente medido, autorización explícita y plan de rollback.**
>
> Si la doctrina y el VPS discrepan, **no se mueve el VPS**: se corrige la doctrina (este documento) y se registra la discrepancia. La asimetría es deliberada: un documento equivocado cuesta una lectura; un `nginx -s reload` equivocado cuesta el servicio del propietario.

### 4.4 Precondiciones si alguna vez el propietario decide desplegar

No es una recomendación de despliegue; es la lista de lo que faltaría **antes** de poder evaluarlo honestamente:

1. **Decisión de arquitectura** (rebase-only vs proxy-con-transformación) — hoy no está tomada ni declarada.
2. **Escribir los 8 módulos del Grupo B** o **borrar sus referencias** de la doctrina. No hay tercera opción.
3. **Resolver las 4 copias** de `shield-location.conf` y declarar el SSOT.
4. **Autorización explícita** del propietario («Aplica»/«Hazlo»), no «planeamos».
5. **Snapshot + rollback escrito**; `proxy_cache_path` y `lua` nuevo exigen **restart**, no reload.
6. **Prueba de canal real** (zap 3-5 canales 30 s), no `curl` al `.m3u8`: `iptv-vps-touch-nothing` §10 documenta que «smoke test 200 OK en `.m3u8` NO detecta segment/302/header breakage».
7. **Ventana de observación 15-60 min** con `tail -f` + journal + `/ape/health`.

---

## 5. Verificación — trazabilidad de cada «realidad medida» a t7

**Comandos nuevos al VPS en esta tarea: NINGUNO.** No se abrió SSH. Todo lo citado proviene de t7.

### 5.1 Mapa afirmación → comando → fuente t7

| Afirmación de este documento | Comando (ejecutado en t7) | Fuente t7 |
|---|---|---|
| 3 fases, no 5 | `grep -rn "_by_lua" /etc/nginx/{sites-enabled,conf.d,snippets}` | `VPS_LUA_MODULES.md` §3 · `VPS_NGINX_DUMP_ANALYSIS.md` §5 |
| Cero `rewrite_by_lua` / `access_by_lua` | `grep -rn "rewrite_by_lua\|access_by_lua" /etc/nginx` → 0 | `VPS_NGINX_DUMP_ANALYSIS.md` §5 |
| `ape-crystal-rust` inexistente | `systemctl status ape-crystal-rust --no-pager` → *Unit could not be found*; `is-enabled` → `not-found` | `VPS_INVENTORY.md` §4 (H-01) · `VPS_DRIFT_VS_REPO.md` §5 |
| `:8084` cerrado | `ss -tlnp \| grep 8084` → vacío | `VPS_INVENTORY.md` §4 |
| `/health` y `/metrics` = 000 | `curl -s -m 4 -o /dev/null -w "%{http_code}" http://127.0.0.1:8084/{health,metrics}` | `VPS_INVENTORY.md` §4 |
| Sin binario Rust | `find / -maxdepth 4 -name "ape-crystal*" -type f` → sólo un `.conf.bak` | `VPS_DRIFT_VS_REPO.md` §5 |
| `shield-location.conf` inexistente | `find /etc/nginx -type f \( -name "*shield*" -o -name "*crystal*" … \)` → 0 | `VPS_NGINX_DUMP_ANALYSIS.md` §1.1 |
| `/shield/` = 404 | `curl -sI -m 6 -k https://iptv-ape.duckdns.org/shield/deadbeef/…` | `VPS_INVENTORY.md` §7 · `VPS_READONLY_ATTESTATION.md` §3.6 |
| nginx 1.24.0, no OpenResty | `nginx -v` · `nginx -V 2>&1` · `command -v openresty` → vacío | `VPS_INVENTORY.md` §2 |
| Módulo Lua 0.10.26, `.so` 443 320 B | `ls -la /usr/lib/nginx/modules/ \| grep -i lua` · `cat modules-enabled/50-mod-http-lua.conf` | `VPS_LUA_MODULES.md` encabezado |
| Vídeo no transportado | `nginx -T` → `location ~* \.(ts\|m4s\|mp4)$ { return 404; }` (×2 servers) + `snippets/ape-meta-public.conf:44` | `VPS_NGINX_DUMP_ANALYSIS.md` §2.2/§2.3/§6 |
| Rebase funciona | `curl -s http://127.0.0.1:8088/_ape/health` → `rebase_ok:1`, `error_ratio:0` | `VPS_LUA_MODULES.md` §6 · `VPS_INVENTORY.md` §7 |
| `conviva.db` 0 B / 0 tablas | `stat -c "%n\|%s" /var/www/html/prisma/db/conviva.db` + `python3` `sqlite3` `mode=ro&immutable=1` | `VPS_DRIFT_VS_REPO.md` §6 · `VPS_INVENTORY.md` §5 |
| 7 timers netshield inactivos | `systemctl is-active <u>.timer` ×15 | `VPS_INVENTORY.md` §9 · `VPS_DRIFT_VS_REPO.md` §7 |
| BBR activo | `sysctl net.ipv4.tcp_congestion_control net.core.default_qdisc` → `bbr` / `fq` | `VPS_NGINX_DUMP_ANALYSIS.md` §4 |
| `limit_conn` ausente, zona presente | `cat /etc/nginx/conf.d/iptv-limit-conn.conf` | `VPS_NGINX_DUMP_ANALYSIS.md` §4 |
| `proxy_read_timeout` 5 s | `grep -rn "proxy_read_timeout" /etc/nginx` | `VPS_NGINX_DUMP_ANALYSIS.md` §4 |
| `proxy_cache` off / cache vacía | `grep -rn "proxy_cache" /etc/nginx` + `find /dev/shm/nginx_cache -type f \| wc -l` → 0 | `VPS_NGINX_DUMP_ANALYSIS.md` §4 · `VPS_INVENTORY.md` §8 |
| SHIELDED byte-idéntico | `zcat …> /tmp/_p.txt; zcat …> /tmp/_s.txt; cmp` → `IDENTICAL_PAYLOAD` | `VPS_LISTS_INVENTORY.md` §5.2 |
| 0 `ngx.exit` reales | `grep -n "ngx\.exit" /etc/nginx/lua/*.lua \| grep -vE ":[0-9]+:\s*--"` → `rc=1` | `VPS_LUA_MODULES.md` §4 |

### 5.2 Verificaciones **locales** ejecutadas en esta tarea (t14), todas de lectura

Ninguna tocó el VPS. Se declaran por transparencia:

| Comando | Propósito | Naturaleza |
|---|---|---|
| `grep`/`Get-ChildItem` sobre `MANIFEST`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `docs/`, `.claude/commands/` | localizar afirmaciones doctrinales con archivo:línea | lectura |
| `Test-Path ".agents/skills/iptv-omega-working-flow-manifesto"` · `Get-ChildItem $HOME\.agents\skills\…` | resolver la ruta real del manifiesto | lectura |
| `Get-ChildItem -Recurse -Filter <nombre>` ×13 | determinar si los 13 artefactos tienen fuente en el repo | lectura |
| `Get-FileHash -Algorithm SHA256` ×5 | hashear las copias canónicas del repo (§3.1) | lectura |
| `git ls-files --error-unmatch` ×5 | determinar tracked/untracked | lectura |
| `Get-ChildItem IPTV_v5.4_MAX_AGGRESSION\vps\nginx\lua` | inventariar el árbol Lua canónico (26 `.lua` + 1 `.json`) | lectura |

### 5.3 Límites honestos de esta corrección

- **No re-medí el VPS.** Si el host cambió entre t7 (`2026-10-26T03:55–04:00Z`) y este documento, la columna «realidad medida» sería stale. Para refrescar: los comandos de §5.1 son todos read-only.
- **No afirmo que la doctrina esté "mal" en su intención.** El diseño Crystal Engine pudo ser real en otra caja u otro momento; el backup `/var/backups/ape-crystal-patches/` sugiere que algo existió. Lo que afirmo es que **no describe el VPS medido**.
- **No elegí arquitectura.** §3.4 muestra dos arquitecturas; decir cuál debe regir es del propietario.
- **No verifiqué los 22 módulos repo-only uno por uno.** Su ausencia en el VPS está medida; su calidad, corrección o intención **no** la juzgo aquí.
- **Los hashes de §3.1 y §3.2 son del working tree/HEAD locales**, calculados en esta tarea; los de la columna VPS son de t7. Ambos se citan por separado para que nadie los confunda.

---
*Fin de DOCTRINE_CORRECTION.md — 7 familias de afirmaciones corregidas con archivo:línea, 9 bloques de reemplazo propuestos (NO aplicados), 13 artefactos doctrinales clasificados en 5 desplegables + 8 inexistentes, 10 artefactos HEAD nunca desplegados con hash, sección NO HACER con 7 riesgos concretos. Cero ediciones doctrinales, cero comandos al VPS.*
