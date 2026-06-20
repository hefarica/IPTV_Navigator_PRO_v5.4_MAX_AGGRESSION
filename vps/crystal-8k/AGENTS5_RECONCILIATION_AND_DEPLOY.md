# 5 Agentes Expertos UHD Crystal 2026 — Truth-Guarded Reconciliation + Deploy Map

Source: `5_Agentes_Expertos_IPTV_UHD_Crystal_2026.pdf` (29 pp). Implemented under the
20-PhD council truth-guards + the **owner override 2026-06-20** (`DIRECTIVA TRANSCODE VPS
PERMITIDO`, CLAUDE.md). Production VPS **NOT touched** — this is staged local + gated.

## The 5 agents → verdict + applied fixes

| PDF Agent | Verdict | Fix applied in this implementation |
|---|---|---|
| **A1** HTTP Headers & Metadata | ✅ inline | `ape_http_headers_agent.lua` + `ape_metadata_injector.lua` + `exthttp_metadata_parser.php`. **Dropped DSCP `AF41`** (banned → 407/micro-cuts) and **upstream `Connection: keep-alive`** (Xtream keepalive forbidden). Fixed the broken `%.(ts\|m4s)$` Lua pattern. Toxic headers blocked in PHP. |
| **A2** Protocol Interceptor | ✅ inline | `ape_protocol_interceptor.lua`. GOLDEN RULE: `hvc1.*` in manifest, `hev1.*` only in EXTVLCOPT/KODIPROP hints. |
| **A3** Pixel Processor (FFmpeg transcode) | 🔓 PERMITTED — **async service, NOT inline** | `transcode/ape_pixel_processor.py` (systemd supervisor). The PDF's `ffmpeg-in-body_filter` is non-functional (freezes the worker) → rebuilt as opt-in async. `minterpolate` OFF by default. |
| **A4** Manifest Rewriter | ⚠️→✅ inline (fixed) | `ape_manifest_rewriter.lua` + `cmaf_media_rewriter.php`. **`hev1`→`hvc1`** in STREAM-INF (GOLDEN RULE), **`L93`→`L153`** for 4K (Cardinal Law 1), fixed broken `CODECS=` pattern + PHP `URI=` regex, single-URL-per-variant. |
| **A5** LCEVC + HDR signaling | ✅ inline | `ape_lcevc_color_agent.lua`. Inert tag injection (HDR/LCEVC), fixed trailing-comma Lua. |
| **A5** HDR FFmpeg color transcode | 🔓 PERMITTED — **async service** | `transcode/ape_hdr_color_science.py` (real BT.2446 SDR→HDR, DV RPU, mastering metadata), consumed by the supervisor. |

## Deploy map (file → VPS target)

| File | Target | Reload |
|---|---|---|
| `agents/ape_http_headers_agent.lua` | `/etc/nginx/lua/` | `systemctl restart nginx` (lua_code_cache law — NOT reload) |
| `agents/ape_metadata_injector.lua` | `/etc/nginx/lua/` | restart nginx |
| `agents/ape_protocol_interceptor.lua` | `/etc/nginx/lua/` | restart nginx |
| `agents/ape_manifest_rewriter.lua` | `/etc/nginx/lua/` | restart nginx |
| `agents/ape_lcevc_color_agent.lua` | `/etc/nginx/lua/` | restart nginx |
| `agents/exthttp_metadata_parser.php` | `/var/www/html/` | restart php-fpm |
| `agents/cmaf_media_rewriter.php` | `/var/www/html/` | restart php-fpm |
| `transcode/ape_pixel_processor.py` | `/opt/ape-api-server/crystal/` | restart `ape-crystal-transcode` |
| `transcode/ape_hdr_color_science.py` | `/opt/ape-api-server/crystal/` | restart service |
| `transcode/crystal_transcode_control.json` | `/etc/ape/` | service re-reads each tick |
| `transcode/ape-crystal-transcode.service` | `/etc/systemd/system/` | `daemon-reload` |
| `transcode/nginx_transcode_serve.conf` | `include` in stream `server{}` | `nginx -t` then reload |

> The PDF's deploy table says "**reload** nginx" for Lua. That is the documented
> `lua_code_cache` bug — a `*_by_lua_file` edit needs **`systemctl restart nginx`**.
> Corrected here.

## Validation status (honest)

| Artifact | Local validation | Result |
|---|---|---|
| `ape_hdr_color_science.py` | `python -m py_compile` + runtime self-test | ✅ PASS (correct BT.2446 chain, DV 8.4, mastering meta) |
| `ape_pixel_processor.py` | `python -m py_compile` | ✅ PASS |
| `crystal_transcode_control.json` | `python -m json.tool` | ✅ PASS |
| 5 `*.lua` agents | structural (balanced, GOLDEN RULE/L153/no-AF41 verified by content) | ⚠️ needs `lua5.1 -e 'assert(loadfile(...))'` **on the VPS** (lua not installed locally) |
| 2 `*.php` | structural (`<?php`, balanced braces) | ⚠️ needs `php -l` **on the VPS** (php not installed locally) |
| `nginx_transcode_serve.conf` + overlay | — | ⚠️ needs `nginx -t` **on the VPS** (nginx not installed locally) |

## Gate (nothing deployed)

Deploy is GATED: explicit owner OK + `iptv-vps-touch-nothing` + backups + on-VPS
`lua5.1 loadfile` / `php -l` / `nginx -t` + GPU check (`ffmpeg -hwaccels`, `nvidia-smi`)
before enabling any transcode channel. FREEZELESS fallback + opt-in-only keep the box safe.

Related: codec-cascade `L157/L153→L183/L180/L156` fix and the overlay `Range/If-Range/
keepalive/302/206/use_stale` fixes are documented in
`docs/crystal-8k-extreme/TRUTH_GUARDED_INTEGRATION_PLAN.md` (§4/§5) — pending materialization
in the same gated phase.
