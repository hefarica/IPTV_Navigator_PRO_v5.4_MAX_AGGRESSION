# APE CRYSTAL v8.0 — Truth-Guarded Integration Plan (20-PhD Architecture)

> **Status:** DEFINITIONS + PLAN. The 12 agent definitions and the council expansion are **DONE**.
> The production VPS (178.156.147.234) was **NOT touched**. Writing the Crystal code files
> (`vps/nginx/lua/*.lua`, `rust/`, `python/`, `deploy-crystal-8k.sh`) and any deploy/`git push`
> is the **GATED Phase 2** at the bottom of this document — it requires explicit owner OK +
> `iptv-vps-touch-nothing` + backups + `nginx -t` + rollback.
>
> **Doctrine reconciliation:** the owner's **Virtual 4K Unlocked** order (fake 4K/HDR/HEVC/LCEVC/CMAF/HDCP
> metadata is PERMITTED) is honored. The **FREEZELESS** invariants the owner ALSO kept (toxic headers,
> Xtream keepalive, 302-cache, single-URL, no-channel-loss, SHIELDED-verbatim, Level↔Resolution) are
> **NOT** waived — this matches the owner's explicit "SIN DAÑAR NADA DEL SISTEMA, NI DEL TV, NI PLAYER".

---

## 1. The 20-PhD + 5-núcleo roster (collision-safe numbering)

The repo council already had **S1–S13** (and S11/S12/S13 are real existing PhDs — Data-Observability,
QA-Broadcast-Validator, Repo-Surgeon). To hit exactly **"20 PHD TOTALES"** without overwriting them,
the 7 elite were numbered **S14–S20**, and the 5 núcleo are standalone agents (the web/protocol arm).

### 5 núcleo agents (`.claude/agents/`) — your PROMPT SUPREMO S11–S15
| File | Role | Maps to your |
|---|---|---|
| `iptv-http-web-stack-architect` | HTML5/HTTP2-3/WS/SSE/CORS/CSP, MSE/EME, embed, typed arrays | S11 HTTP/Web Stack |
| `iptv-php-json-metadata-engineer` | PHP 8.3, JSON Schema, per-channel JSON, JWT, `/omega` APIs | S12 PHP/JSON Metadata |
| `iptv-headers-protocol-specialist` | RFC 9110-9114, QUIC/HTTP3, TLS 1.3, BBR, header injection | S13 Headers/Protocol |
| `iptv-vps-lua-realtime-engineer` | OpenResty/LuaJIT, shm, body/header/log filters, timers | S14 VPS/Lua RT |
| `iptv-polyglot-systems-integrator` | Rust/Python/C++/Go/Node, FFI/WASM/gRPC, VMAF/SSIM | S15 Polyglot |

### 7 elite video/IPTV PhDs → council S14–S20 (`.claude/agents/`) — your PROMPT SUPREMO S16–S22
| Council | File | Role | Maps to your |
|---|---|---|---|
| **S14** | `crystal-hevc-codec-architect` | HEVC Main10/12, golden rule, Level↔Resolution, cascade | S16 HEVC Codec |
| **S15** | `crystal-hdr-color-mastering-scientist` | HDR10/10+/DV/HLG, BT.2020, PQ, MaxCLL/FALL | S17 HDR/Color |
| **S16** | `crystal-lcevc-enhancement-architect` | MPEG-5 Part 2 LCEVC, SUPPLEMENTAL-CODECS, X-LCEVC-* | S18 LCEVC |
| **S17** | `crystal-abr-bandwidth-dynamics` | 6-state reactor, EWMA, breach predict, prefetch hints | S19 ABR/Bandwidth |
| **S18** | `crystal-shielded-security-architect` | SHIELDED filename-only + verbatim URLs, authorized WG/DNS | S20 Shielded/Security |
| **S19** | `crystal-qoe-telemetry-scientist` | Conviva-equiv server-side QoE, HDCP-Adaptive | S21 QoE/Telemetry |
| **S20** | `crystal-array-manifest-surgeon` | Uint8Array M3U8 surgery, per-channel directive injection | S22 Array/Manifest |

Every agent carries the same **8-rule FREEZELESS truth-guard block** (§3) and is dispatchable by the
council in PHASE 1.

---

## 2. The 8 owner-supplied artifacts — CLEAN vs BLOCK-until-fixed

Source: `C:\Users\HFRC\Downloads\`. Knowledge is embedded here; raw files were NOT copied into the repo
(per the approved "definitions + plan" scope).

| Artifact | Verdict | Notes |
|---|---|---|
| `ape_bandwidth_reactor_v3_8k.lua` (289 ln) | ✅ **CLEAN** | `log_by_lua`, `pcall`/passthrough, runs AFTER the response (ZERO request impact). 6-state EWMA reactor + linear-regression trend + breach prediction. Autopista-safe as-is. **Owner: S17.** |
| `visual_supremacy_orchestrator_v8.php` (368 ln) | ✅ **CLEAN** | Per-tier EXTVLCOPT/EXTHTTP/KODIPROP emitter. Already has a `BANNED_DIRECTIVES` filter blocking `minterpolate` / `denoise=3d` / `avcodec-fast=1` / `avcodec-skiploopfilter=1` / `network-caching=30000` (the micro-cut + halo traps). **Owner: S15/S16/S20.** |
| `codec-cascade-8k-extreme.json` (14 tiers) | ⚠️ **CLEAN after codec fix** | Good ladder + `profile_mapping` (P0–P5) + `bitrate_floor_per_tier`. **MUST fix the Level↔Resolution violations** (§4). **Owner: S14.** |
| `ape-crystal-8k-overlay.conf` (120 ln) | 🚫 **BLOCK-until-fixed** | Injects toxic `Range`/`If-Range`, Xtream `keepalive`, `proxy_cache_valid 302` implied via cache — all FREEZELESS violations (§5). **Owner: S6/S8/S10.** |
| `deploy-crystal-8k.sh` (196 ln) | 🚫 **Phase-2 only** | A deploy script → cannot run under "no VPS touch". Re-audit under `iptv-vps-touch-nothing` + `iptv-surgical-commit-and-deploy-verify` before ever executing. |
| `APE_Crystal_UHD_8K_LCEVC_Plan.pdf` (244K) | 📖 reference | Plan/spec narrative — folded into this doc's roadmap. |
| `APE_CRYSTAL_8K_VISUAL_EXTREME_PLAN.pdf` (48K) | 📖 reference | Plan/spec narrative — folded into this doc's roadmap. |
| `visual_supremacy_orchestrator_v8 (1).php` | duplicate | Byte-identical to the non-`(1)` file. Use one. |

---

## 3. The 8 FREEZELESS truth-guards (carried by every agent + the council)

Owner-LOCKED **Virtual 4K Unlocked**: FAKE 4K/HDR/HEVC/LCEVC/CMAF/HDCP metadata is **PERMITTED**.
These invariants stay **ENFORCED** anyway:

1. **0 toxic headers** on the player path: `Range`, `If-Range`, `If-None-Match`, `If-Modified-Since`, `TE`, `Priority`, `Upgrade-Insecure-Requests` (EOF/304/403/freeze).
2. **No Xtream-upstream `keepalive`**; **`proxy_cache_valid 302 = 0`** (never cache redirects).
3. **Single URL per channel** (anti-509); **NO channel loss**.
4. **SHIELDED = filename-rename ONLY**; channel URLs stay **VERBATIM**.
5. **Level↔Resolution** (Cardinal Law 1): a declared LEVEL must carry its RESOLUTION. **Never `L153` (5.1) on 8K.**
6. **GOLDEN RULE**: `hvc1.*` only in `#EXT-X-STREAM-INF CODECS=`; `hev1.*` only in `#KODIPROP`/`#EXTVLCOPT`.
7. **Autopista**: VPS Lua/PHP is `pcall`/passthrough, log-phase or non-blocking. **Never** `ngx.exit` / circuit-breaker / `limit_req` on the playback path.
8. **LEGAL/ETHICAL**: authorized streams/providers ONLY. No DRM bypass, signal theft, illegal ISP/DPI evasion.

> The real visual uplift is materialized by the **device VPP (AI-SR / AI-PQ)**; the VPS **SELECTS/COMMANDS metadata**, it does **NOT** transcode pixels.

---

## 4. Codec cascade fix (HEVC Level↔Resolution) — S14

HEVC `general_level_idc = 30 × level`. The supplied JSON has three wrong level idcs:

| Tier | JSON declares | Resolution/fps | Problem | **Corrected** |
|---|---|---|---|---|
| 0 | `hvc1.2.4.L157.B0` (says "6.1") | 7680×4320@60 | `L157` is not a valid 6.1 idc (6.1 = **L183**) | **`L183`** (6.1) |
| 1 | `hvc1.2.4.L153.B0` (5.1) | 7680×4320@30 | `L153` (5.1) cannot carry 8K | **`L180`** (6.0) |
| 2 | `hvc1.2.4.L153.B0` (5.1) | 3840×2160@120 | 5.1 caps 4K@60, not @120 | **`L156`** (5.2) |

Reference map: `5.1=L153` (4K@60 ceiling) · `5.2=L156` (4K@120) · `6.0=L180` (8K@30) · `6.1=L183` (8K@60) · `6.2=L186`.
Tiers 3–14 are valid. `L153` on 8K is literally the **2026-06-08 freeze**.

---

## 5. Overlay `.conf` fix (FREEZELESS) — S6/S8/S10

`ape-crystal-8k-overlay.conf` must be sanitized **before** any deploy:

| Line(s) | Toxic as-shipped | Required action |
|---|---|---|
| `proxy_set_header Range $http_range;` | **toxic header** → EOF on OkHttp/ExoPlayer | **REMOVE** |
| `proxy_set_header If-Range $http_if_range;` | **toxic header** | **REMOVE** |
| `keepalive_timeout 120s; keepalive_requests 500000;` | Xtream upstream keepalive → 509/stale | **REMOVE** on Xtream upstreams |
| `proxy_cache_valid 200 3s;` on `.m3u8` (no 302 line) | a cached 302 replays a stale token | add `proxy_cache_valid 302 0;` in **BOTH** the location block **and** any named upstream cache zone; verify `nginx -T \| grep proxy_cache_valid` |
| `proxy_cache_valid 206 10m;` on `.ts/.m4s` **(S6 MISS-A)** | caches Partial Content 10 min → token-rotated Xtream segments replay stale/corrupt bytes → freeze | set `proxy_cache_valid 206 0;` (or drop 206 caching for Xtream segments) |
| `proxy_cache_use_stale … updating;` + `proxy_cache_background_update on;` on `.m3u8` **(S6 MISS-B)** | serves a stale manifest (old `EXT-X-MEDIA-SEQUENCE`) while refreshing → player requests evicted segments → 404 → freeze | `proxy_cache_use_stale error timeout` only (drop `updating`); `proxy_cache_background_update off;` on `.m3u8` |
| `proxy_cache_lock_timeout 2s;` on `.m3u8` | queued requests stall ≤2 s under the lock | acceptable once MISS-B fixed; document the 2 s stall budget |
| `http2_push_preload on;` / DSCP / buffers / `aio threads` | benign perf | **KEEP** (these are the genuinely useful parts) |

The reactor's `log_by_lua_file` hook, the bigger buffers, BBR, and the thread pool are all fine to keep.

> **Council audit 2026-06-20 (S6 Nginx):** the two **MISS-A/MISS-B** rows above were added after the 20-PhD audit caught live-manifest/segment stale-cache freeze vectors the first pass missed. Validate the fixed overlay with `nginx -t` **+** `nginx -T | grep -E 'proxy_cache_valid|use_stale|background_update'` before any deploy.

---

## 6. EXTVLCOPT / EXTHTTP / KODIPROP injection mandate (per-channel arrays) — S20 + núcleo

Directives are injected as **arrays of all options**, one URL per channel (anti-509), never stripping the
~945 functional headers. The orchestrator (PHP) computes them per tier; the typed-array generator (JS)
emits them. Canonical safe families:

- `#EXTVLCOPT`: `http-user-agent` (player UA, never a browser UA), `network-caching` (tier-scaled, **never** the banned `30000`), `swscale-mode=lanczos`, `postproc-q`, HDR `zscale` filter.
- `#EXTHTTP` (JSON): `X-APE-Crystal-*`, `X-LCEVC-*`, `X-APE-HDR-*` — **private metadata** the player may read; **never** a toxic header (§3 rule 1).
- `#KODIPROP`: `inputstream.adaptive.manifest_type`, `…stream_selection_type`, `…chooser_resolution_max`, `…hdr_handling`, `…color_depth`; `hev1.*` codec hints live HERE, never in `CODECS=`.

**Metadata injection pipeline** (honest version):
```
Provider stream (whatever it really is — AVC/HEVC, SDR/HDR)
   ↓  VPS nginx — combined_body_filter.lua / orchestrator (metadata only, pcall/passthrough)
   REWRITE/INJECT (owner-permitted virtual): RESOLUTION, CODECS=hvc1.2.4.L153.B0 (or 8K→L180/L183),
   VIDEO-RANGE=PQ, SUPPLEMENTAL-CODECS, HDCP-LEVEL, BANDWIDTH  — single URL kept VERBATIM
   ↓  header_filter — X-LCEVC-* / X-APE-Crystal-Tier (private headers, no toxic header)
   ↓  Player receives "4K/8K HDR HEVC LCEVC" metadata
   ↓  Device VPP (AI-SR / AI-PQ) materializes the real visual uplift
   = UHD Crystal on the panel — WITHOUT the VPS transcoding a single pixel
```

---

## 7. World-class authority set (PHASE W research targets — verify before trusting)

**Repos:** `videolan/vlc` (EXTVLCOPT), `xbmc/xbmc` + `xbmc/inputstream.adaptive` (KODIPROP), `video-dev/hls.js`,
`videojs/video.js`, `FFmpeg/FFmpeg` (VMAF/zscale), `gpac/gpac` (CMAF/DASH validation), `Eyevinn/hls-m3u8`,
`openresty/openresty`, `google/ExoPlayer` → `androidx/media`, V-Nova LCEVC SDK.
**Forums:** Doom9, VideoHelp, r/ffmpeg, r/HLS, Kodi forum, VLC forum, Wowza Community, AWS Media blog.

> **Verify-before-adding** is mandatory: the council has been burned by HALLUCINATED Maven coordinates and
> 404 model URLs (`play-services-media-enhancement`, `com.v-nova.lcevc:lcevc-dil-android`, `mediapipe-models/*.tflite`).
> Require an HTTP-200 before trusting any dependency or model URL.

---

## 8. Proposed Phase-2 file structure (NOT created yet)

```
vps/nginx/lua/
  ├── ape_bandwidth_reactor_v3_8k.lua        (CLEAN — as-is)
  ├── ape_8k_crystal_escalator.lua           (NEW — body_filter, pcall, codec-fixed)
  ├── ape_lecv_enhancement_layer.lua         (NEW — header_filter LCEVC)
  └── ape_prefetch_engine.lua                (NEW — init_worker timer hints)
vps/nginx/conf.d/
  └── ape-crystal-8k-overlay.conf            (FIXED — toxic headers/keepalive/302 removed)
vps/cmaf_engine/modules/
  └── visual_supremacy_orchestrator_v8.php   (CLEAN — as-is)
config/
  └── codec-cascade-8k-extreme.json          (FIXED — L157/L153→L183/L180/L156)
rust/crystal-manifest-parser/                (NEW — .so for Lua FFI / WASM)
python/quality-analyzer/vmaf_ssim_analyzer.py(NEW — offline VMAF/SSIM)
deploy-crystal-8k.sh                         (re-audited, gated)
```

---

## 9. Success checklist (your 15 — with FREEZELESS gates added)

| # | Metric | Target | Gate |
|---|---|---|---|
| 1 | Channels 8K (P0-P1) virtual metadata | 100% | level=L180/L183 (never L153) |
| 2 | Channels 4K (P2-P6) virtual metadata | 100% | 4K@120=L156 |
| 3 | HDR PQ declared | 100% | private/owner-locked; Phase-G rollback wired |
| 4 | HEVC Main10 `CODECS=` | 100% | `hvc1.*` only in STREAM-INF |
| 5 | LCEVC active | ≥80% | no hallucinated DIL dep |
| 6 | EXTVLCOPT injected | 100% | no banned directive |
| 7 | KODIPROP injected | 100% | `hev1.*` only here |
| 8 | EXTHTTP injected | 100% | **0 toxic headers** |
| 9 | SHIELDED active | 100% | filename-only + verbatim URL |
| 10 | QoE telemetry | real-time | async keepalive, non-blocking |
| 11 | ABR 6-states | active | `log_by_lua`, no parallel per-channel conns |
| 12 | WASM parser | <10 ms | offline build, no runtime risk |
| 13 | Zero-copy arrays | 100% | single URL per channel preserved |
| 14 | 95th-percentile visual | achieved | honest metadata + device VPP |
| 15 | Perfect Pixel | verified | VMAF/SSIM offline; `node -c`/`php -l`/`nginx -t` green |

---

## 10. GATED Phase-2 roadmap (requires explicit owner OK per step)

1. **Branch** off `feat/virtual-4k-unlocked` (never push to `main` without OK).
2. Create the FIXED code files (§8) — codec-corrected, header-sanitized, all `pcall`/passthrough.
3. Validate locally: `node -c` (generator), `php -l` (orchestrator), `python -m json.tool` (cascade), `lua5.1 -e 'assert(loadfile(...))'` (Lua), `nginx -t` (with overlay included).
4. Deploy under `iptv-vps-touch-nothing` + `iptv-surgical-commit-and-deploy-verify`: backup → `nginx -t` → `systemctl restart nginx` (NOT reload — `lua_code_cache` law) → E2E 200/302 from the **VPS egress** → rollback ready.
5. Convene `/iptv-freezeless-visual-master-council <focus> --scope full --mode audit` → require PASS before any production change.
