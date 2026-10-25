# Mapa de módulos Lua — ecosistema VPS/APE

> Generado automáticamente desde disco el **2026-10-24T15:22:18Z** (solo lectura).
> Fuente: `IPTV_v5.4_MAX_AGGRESSION/vps/` + borradores `.lua` en la raíz del repo.
> JSON completo: `_storage_dump/lua_map.json`.

## Totales

| Métrica | Valor |
|---|---:|
| Módulos Lua (todos) | **49** |
| **Árbol vivo (`vps/nginx/lua`, `vps/ape-uhdx`, …)** | **28** |
| Snapshots históricos (`vps-live-snapshot-*`, `baseline-live`, `production_mirror`, `buffer-governor`) | 13 |
| Borradores `.lua` en la raíz | 8 |
| Líneas totales | **8660** |
| Líneas en el árbol vivo | 4131 |
| **Cableados en algún `.conf` (árbol vivo)** | **15 de 28** |
| Archivos `.conf` escaneados | 36 |

> "Cableado" = el nombre del archivo aparece referenciado en al menos un `.conf` del árbol.
> Un módulo **no cableado** es código muerto hasta que se registre en nginx.

## Módulos canónicos (árbol `vps/`)

| Módulo | LOC | Cableado | Señales | Shared dicts | Propósito |
|---|---:|:--:|---|---|---|
| `nginx/lua/combined_body_filter.lua` | 495 | ✅ | body_filter_by_lua, timer, sock:, ngx.shared | circuit_metrics, lab_config | ═══════════════════════════════════════════════════════════════════════ APE LAB UHDX — Combined Body Filter: Floor-Lock + Prefetch v2.0 Phase: body_filter_by_lua_file PIPELINE ORDER: 0. Bypass inmediato para evitar acumu |
| `nginx/lua/ape_codec_cascade.lua` | 375 | ❌ | ngx.shared | lab_config | APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120 ═══════════════════════════════════════════════════════════════════════════ APE CODEC CASCADE (edge resolver) v2.0 — SSOT alineada con frontend ═══════════════ |
| `nginx/lua/bandwidth_reactor.lua` | 284 | ✅ | log_by_lua, ngx.shared | circuit_metrics | APE PRISMA v2.0 — Bandwidth Reactor + TELESCOPE L1 Engine (Lua) RUNS: log_by_lua_file (after each response, ZERO impact on request) SPEED: < 1ms per execution (shared dict operations are sub-microsecond) PHILOSOPHY: CBR  |
| `nginx/lua/floor_lock_filter.lua` | 266 | ✅ | body_filter_by_lua, ngx.shared | circuit_metrics | APE PRISMA v2.0 — FLOOR-LOCK HLS Variant Filter (Lua) RUNS: body_filter_by_lua_file (on HLS master playlist responses ONLY) PURPOSE: Remove #EXT-X-STREAM-INF variants with BANDWIDTH below profile floor. This ensures the  |
| `nginx/lua/lab_config.lua` | 253 | ✅ | ngx.shared | lab_config | APE LAB-SYNC v2.0 — lab_config.lua Equivalente Lua de LabConfigLoader.php. Lee los 6 JSONs de /var/www/html/prisma/config/ con cache via shared_dict (TTL 300s) y fallbacks defensivos. Pensado para uso en bandwidth_reacto |
| `nginx/lua/quality_realtime.lua` | 230 | ✅ | content_by_lua, ngx.shared | lab_config | ═══════════════════════════════════════════════════════════════════════ APE Quality Realtime v2.0 — Per-Channel Codec Tier + ADB Commands Phase: content_by_lua_file 2026-06-08 — v2.0: Sincronizado con toolkit completo EN |
| `nginx/lua/qoe_flush_worker.lua` | 208 | ✅ | init_worker_by_lua, timer, sock:, ngx.shared | qoe_metrics | APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120 ═══════════════════════════════════════════════════════════════════════════ QoE Flush Worker v1.0 — periodic shared-dict → PHP/SQLite flush (60s timer) ═══════ |
| `nginx/lua/prisma_telemetry_full.lua` | 201 | ✅ | content_by_lua, ngx.shared | circuit_metrics | APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120 APE TELESCOPE v2.1 — Full Telemetry Aggregator (Lua) RUNS: content_by_lua_file at /prisma/api/telemetry-full RETURNS: Unified JSON with 3 layers (hardware, net |
| `nginx/lua/decision_engine.lua` | 185 | ✅ | access_by_lua, ngx.shared | circuit_metrics | APE TELESCOPE v2.1 — Predictive Decision Engine (Lua) RUNS: access_by_lua_file (BEFORE proxy_pass, adjusts headers per-request) SPEED: < 0.5ms per execution (reads shared dict, sets headers, returns) PURPOSE: Read L1 rin |
| `nginx/lua/qoe_server_side_observer.lua` | 181 | ✅ | log_by_lua, timer, ngx.shared | qoe_metrics | APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120 ═══════════════════════════════════════════════════════════════════════════ QoE Server-Side Observer v1.0 — Conviva-equivalent telemetry for native players ═══ |
| `nginx/lua/sentinel_auth_guard.lua` | 174 | ❌ | header_filter_by_lua, ngx.shared | circuit_metrics | APE SENTINEL v1.0 — Auth Guard + UA Rotation + Provider Fingerprint (Lua) RUNS: header_filter_by_lua_file (after upstream responds, before body sent) PURPOSE: Detect 401/403 from upstream, rotate UA, signal retry or fall |
| `nginx/lua/bw_adaptive_floor.lua` | 151 | ❌ | ngx.shared | circuit_metrics | ═══════════════════════════════════════════════════════════════════════ APE LAB UHDX — SANDBOX — Adaptive Floor (lazo bitrate-reactor → manifest) PURE module. Sin ngx, sin shared dict, determinista, unit-testable. Cierra |
| `nginx/lua/sentinel_telemetry_api.lua` | 141 | ✅ | content_by_lua, ngx.shared | circuit_metrics | APE SENTINEL v1.0 — Telemetry API (Lua) Endpoint: /prisma/api/sentinel-status Returns real-time sentinel state as JSON (<1ms response) PASSTHROUGH: content_by_lua_file, no blocking, no interference |
| `nginx/lua/upstream_response.lua` | 135 | ✅ | header_filter_by_lua, ngx.shared | circuit_metrics | ════════════════════════════════════════════════════════════════════════════ NET SHIELD — AUTOPISTA MODE: Upstream response telemetry (NEVER blocks) ─────────────────────────────────────────────────────────────────────── |
| `nginx/lua/sandbox/test_bw_adaptive.lua` | 118 | ❌ | — | — | ═══════════════════════════════════════════════════════════════════════ SANDBOX TEST — bw_adaptive_floor (lazo bitrate-reactor → manifest) Ejecutar AISLADO (jamás en nginx), desde vps/nginx/lua: lua sandbox/test_bw_adapt |
| `nginx/lua/ape_profile_resolver.lua` | 85 | ❌ | ngx.shared | lab_config | ═══════════════════════════════════════════════════════════════════════ APE LAB UHDX — Profile Resolver (Sol 1: profile ARBITRARIO por identidad de canal) PURE-ish module (solo io.open + ngx.shared cache, nil-safe). Dete |
| `nginx/lua/qm_apply_worker.lua` | 78 | ❌ | timer, sock: | — | ═══════════════════════════════════════════════════════════════════════════ qm_apply_worker.lua — Background worker to poll and apply pending manifests ════════════════════════════════════════════════════════════════════ |
| `nginx/lua/sentinel_ua_apply.lua` | 77 | ❌ | access_by_lua, ngx.shared | circuit_metrics | APE SENTINEL v1.0 — UA Apply (access_by_lua companion) RUNS: Called from upstream_gate.lua via require("sentinel_ua_apply") PURPOSE: Read the rotated UA from shared dict and apply it to the current request. The companion |
| `nginx/lua/ape_virtual_4k.lua` | 71 | ❌ | — | — | APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120 |
| `nginx/lua/reactor_tick.lua` | 67 | ✅ | access_by_lua, log_by_lua, init_worker_by_lua, timer, ngx.shared | circuit_metrics | ═══════════════════════════════════════════════════════════════════════ APE PRISMA — Reactor Tick (1 Hz cadence enforcement) USER DOCTRINE 2026-05-11: "MIDA ESA VELOCIDAD CADA SEGUNDO Y SEA CONSTANTE" Phase: init_worker_ |
| `nginx/lua/shield_follow_302.lua` | 63 | ❌ | — | — | shield_follow_302.lua For providers that return 302 to rotating CDN IPs Follows up to 3 redirects and returns the final content |
| `nginx/lua/bandwidth_reactor_api.lua` | 50 | ✅ | ngx.shared | circuit_metrics | APE PRISMA v1.3.2 — Bandwidth Reactor Telemetry (Lua) Endpoint: /prisma/api/bandwidth-reactor Returns real-time reactor state as JSON (<1ms response) |
| `nginx/lua/sandbox/test_profile_resolver.lua` | 49 | ❌ | — | — | ═══════════════════════════════════════════════════════════════════════ SANDBOX TEST — ape_profile_resolver (Sol 1: profile arbitrario server-side) Ejecutar AISLADO desde vps/nginx/lua: lua sandbox/test_profile_resolver. |
| `nginx/lua/ape_uhdx_score.lua` | 48 | ❌ | — | — | APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120 |
| `nginx/lua/upstream_gate.lua` | 47 | ✅ | access_by_lua, ngx.shared | circuit_metrics | ════════════════════════════════════════════════════════════════════════════ NET SHIELD — AUTOPISTA MODE: Pass-through gate (telemetry only, NEVER blocks) ───────────────────────────────────────────────────────────────── |
| `nginx/lua/ape_wake_on_manifest.lua` | 42 | ❌ | log_by_lua | — | ══════════════════════════════════════════════════════════════════════════ APE — Wake-on-Manifest (log_by_lua, AUTOPISTA-SAFE) Cuando el player pide el .m3u8(.gz) AL VPS, encola una señal de "wake" para que el worker des |
| `nginx/lua/follow_redirect.lua` | 39 | ❌ | ngx.location.capture | — | follow_redirect.lua Intercepts 302 from upstream and follows it, returning content to player This fixes CDN IP rotation issues where segments only work from the host that served the manifest |
| `nginx/lua/ape_device_state_writer.lua` | 18 | ✅ | log_by_lua | — | ape_device_state_writer.lua — log_by_lua en /omega/open. Captura device->canal desde el $remote_addr REAL (nginx lo ve; el Python :45732 solo ve 127.0.0.1). Autopista: fase log, jamas bloquea, jamas toca el 302. |

## Borradores sueltos en la raíz del repo (no canónicos)

| Archivo | LOC | Propósito |
|---|---:|---|
| `vps_bandwidth_reactor.lua` | 262 | APE PRISMA v2.0 — Bandwidth Reactor + TELESCOPE L1 Engine (Lua) RUNS: log_by_lua_file (after each response, ZERO impact on request) SPEED: < 1ms per execution (shared dict operations are sub-microsecond) PHILOSOPHY: CBR  |
| `combined_body_filter.lua` | 225 | ═══════════════════════════════════════════════════════════════════════ NET SHIELD — Combined Body Filter: Floor-Lock + Prefetch v1.0 Phase: body_filter_by_lua_file PIPELINE ORDER: 1. Accumulate all response body chunks  |
| `vps_combined_body_filter.lua` | 225 | ═══════════════════════════════════════════════════════════════════════ NET SHIELD — Combined Body Filter: Floor-Lock + Prefetch v1.0 Phase: body_filter_by_lua_file PIPELINE ORDER: 1. Accumulate all response body chunks  |
| `prefetch_segment.lua` | 141 | ═══════════════════════════════════════════════════════════════════════════ NET SHIELD — Speculative Prefetch Engine v1.0 Phase: body_filter_by_lua_file (runs while NGINX streams manifest to client) PURPOSE: When NGINX p |
| `follow_302_internal.lua` | 113 | ═══════════════════════════════════════════════════════════════════════ NET SHIELD — Internal 302 Follow Engine v1.0 Phase: access_by_lua_file (replaces proxy_pass for m3u8 requests) PURPOSE: Instead of returning 302 to  |
| `vps_upstream_response.lua` | 82 | ════════════════════════════════════════════════════════════════════════════ NET SHIELD — AUTOPISTA MODE: Upstream response telemetry (NEVER blocks) ─────────────────────────────────────────────────────────────────────── |
| `vps_upstream_gate.lua` | 47 | ════════════════════════════════════════════════════════════════════════════ NET SHIELD — AUTOPISTA MODE: Pass-through gate (telemetry only, NEVER blocks) ───────────────────────────────────────────────────────────────── |
| `vps_follow_redirect.lua` | 39 | follow_redirect.lua Intercepts 302 from upstream and follows it, returning content to player This fixes CDN IP rotation issues where segments only work from the host that served the manifest |

## Lectura rápida

- Los módulos con `body_filter_by_lua` son los que **reescriben playlists** (metadata).
- Los que usan `sock:` o prefetch mueven **tráfico de segmentos** (plano de video).
- Los `content_by_lua` son el **plano de control** (APIs que el frontend consulta).
- Un `❌` en cableado significa que el módulo existe pero nginx nunca lo ejecuta.
