---
name: IPTV Resolve Architecture & Toolkit Anatomy
description: Complete reference for the IPTV Navigator PRO resolve pipeline, data contracts, classification cascade, and mandatory coding rules for safe development.
---

# IPTV Resolve Architecture — Master Reference

## 1. Toolkit Anatomy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    IPTV Navigator PRO v5.4                          │
│                    MAX AGGRESSION Toolkit                           │
├────────────────────────┬────────────────────────────────────────────┤
│      FRONTEND          │              BACKEND (VPS)                │
│   (Local Generator)    │     iptv-ape.duckdns.org                  │
│                        │     178.156.147.234                       │
├────────────────────────┼────────────────────────────────────────────┤
│                        │                                            │
│  ape-channel-          │  resolve_quality.php  ← Resolve 3.0       │
│  classifier.js (v3.0)  │  ├── rq_sniper_mode.php (optional)       │
│       ↓                │  ├── rq_anti_cut_engine.php (optional)    │
│  m3u8-typed-arrays-    │  ├── rq_dynamic_channel_map.php (optional)│
│  ultimate.js           │  ├── ape_credentials.php (optional)       │
│  ├── ChannelClassifier │  ├── ape_stream_validator_proxy.php (opt) │
│  ├── GroupTitleBuilder  │  ├── ape_anti_noise_engine.php (optional) │
│  ├── generateEXTINF()  │  └── ape_hdr_peak_nit_engine.php (opt)   │
│  ├── build_exthttp()   │                                            │
│  ├── generateEXTVLCOPT │  resolve.php ← Gold Standard v16.1       │
│  └── CTX Payload v25   │                                            │
│       ↓                │  nginx: /api/resolve_quality              │
│  enrichment-           │         → /resolve_quality.php            │
│  constructor.js        │                                            │
│  ├── inferResolution() │  Other endpoints:                         │
│  ├── inferCodec()      │  /api/health → health.php                 │
│  ├── inferFps()        │  /api/jwt-config → jwt-config.php         │
│  ├── inferTransport()  │                                            │
│  └── inferExtraFlags() │                                            │
│       ↓                │                                            │
│  group-title-          │                                            │
│  builder.js            │                                            │
│  └── extract(ch, axis) │                                            │
└────────────────────────┴────────────────────────────────────────────┘
```

## 2. Data Flow — Complete Cascade

```
APEChannelClassifier v3.0 (SINGLE SOURCE OF TRUTH)
  │
  │ classify(channel) → {region, language, category, country, quality, confidence}
  ↓
ChannelClassifier (Bridge/Adapter inside m3u8-typed-arrays-ultimate.js)
  │
  │ Maps v3.0 output → GroupTitleBuilder contract
  ↓
channel._classification = {
  region:   { group: "AMÉRICA LATINA", code: "CO" },
  language: { group: "Español",        code: "es" },
  category: { group: "DEPORTES",       code: "sports" },
  country:  { group: "Colombia",       code: "CO" },
  quality:  { group: "FHD" },
  confidence: 0.85,
  sportSubcategory: "futbol",
  crossCategory: { detected: true, score: 80, action: "reclassify" }
}
  │
  ├──→ GroupTitleBuilder.extract(ch, 'region') → group-title string
  │
  ├──→ generateEXTINF() → EXTINF tags in .M3U8 list
  │    ape-profile, ape-region, ape-lang, ape-country,
  │    ape-content-type, ape-classify-confidence,
  │    ape-fps, ape-transport, ape-codec-family
  │
  ├──→ cfg._classification = channel._classification  ← CRITICAL BRIDGE
  │    └──→ build_exthttp() → X-APE-CL-* headers in EXTHTTP
  │
  ├──→ CTX v25 Payload (44 campos, base64 URL-safe — UNIFIED INTELLIGENCE)
  │    ├── Técnico:       p, rs, bw, br, bf, nc, hd, cs, cp, v
  │    ├── Clasificación: rg, lg, ct, cn, cf
  │    ├── Enrichment:    fp, tr, at, cu, ll, bt, sc, cf2
  │    ├── HDR Detail:    mx (MaxCLL), mf (MaxFALL), dv (Dolby Vision)
  │    ├── Buffer Real:   bx (Buffer-Max), b2 (Buffer-Target)
  │    ├── Device:        dt (Type), sr (Screen), hw (HW-Decode)
  │    ├── CDN/Bitrate:   ib (Initial-BR), bp (BW-Pref), cd (CDN), sf (Failover)
  │    ├── Audio:         ab (Audio-BR), ac (Audio-Codecs)
  │    ├── Player:        pt (Player-Type), nt (Network), rc (Retry), ct2 (Timeout)
  │    └── Codec/Resilience: vc (Video-Codecs), dr (DRM), nc2 (VLC-Cache), cj (Jitter)
  │         │
  │         ↓ (travels in URL: &ctx=eyJw...)
  │
  │    resolve_quality.php (VPS)
  │    ├── Decodes CTX → $ctxData array
  │    ├── Reads QoS headers → $qosHeaders array
  │    ├── Builds $qosRef (55+ fields) ← UNIFIED REFERENCE (v25)
  │    │   ├── Technical: profile, resolution, bitrate_kbps, buffer_ms...
  │    │   ├── Classification: region, language, category, country, classify_confidence
  │    │   └── Enrichment: fps, transport, dolby_atmos, catchup, low_latency...
  │    │
  │    ├── Emits Response Headers:
  │    │   ├── X-RQ-QoS-*     (technical)
  │    │   ├── X-RQ-CL-*      (classification)
  │    │   └── X-RQ-Enrich-*  (enrichment)
  │    │
  │    └── Emits mini-M3U8 body:
  │        ├── #EXTINF with codec/video-track
  │        ├── #EXTHTTP JSON with ~130 headers
  │        │   ├── X-APE-CL-Region, Language, Category, Country, Confidence
  │        │   └── X-APE-Enrich-FPS, Transport, DolbyAtmos, Catchup...
  │        ├── #EXTVLCOPT (63+ lines)
  │        ├── #KODIPROP (if Kodi UA)
  │        └── http://origin/live/user/pass/streamId.m3u8
  │
  └──→ Player (VLC/TiviMate/Kodi/OTT Navigator)
       └── Full per-channel observability
```

## 3. Resolver URL Contract

The frontend builds resolver URLs as:

```
https://iptv-ape.duckdns.org/resolve_quality.php
  ?ch={channelId}
  &p={profile}
  &mode=adaptive
  &list={listVersion}
  &bw={maxBandwidth}
  &buf={bufferMs}
  &origin={hostNoProtocol}
  &sid={numericStreamId}
  &srv={base64(host|user|pass)}
  &ctx={base64url(JSON ctxPayload)}
```

### CTX v25 Payload Fields (44 campos — Unified Intelligence)

**Original v24 (22 campos):**

| Key | Type | Description | PHP reads as |
|-----|------|-------------|-------------|
| `p` | string | Profile P0-P5 | `$ctxData['p']` |
| `rs` | string | Resolution 1920x1080 | `$ctxData['rs']` |
| `bw` | int | Max bandwidth bps | `$ctxData['bw']` |
| `br` | int | Bitrate kbps | `$ctxData['br']` |
| `bf` | int | Buffer ms | `$ctxData['bf']` |
| `nc` | int | Net cache ms | `$ctxData['nc']` |
| `hd` | 0/1 | HDR flag | `$ctxData['hd']` |
| `cs` | string | Color space | `$ctxData['cs']` |
| `cp` | string | Primary codec | `$ctxData['cp']` |
| `v` | string | CTX version (now '25') | `$ctxData['v']` |
| `rg` | string | Region | `$ctxData['rg']` |
| `lg` | string | Language code | `$ctxData['lg']` |
| `ct` | string | Category | `$ctxData['ct']` |
| `cn` | string | Country | `$ctxData['cn']` |
| `cf` | int | Classify confidence 0-100 | `$ctxData['cf']` |
| `fp` | int | FPS | `$ctxData['fp']` |
| `tr` | string | Transport HLS/DASH/TS | `$ctxData['tr']` |
| `at` | 0/1 | Dolby Atmos | `$ctxData['at']` |
| `cu` | 0/1 | Catchup | `$ctxData['cu']` |
| `ll` | 0/1 | Low-Latency | `$ctxData['ll']` |
| `bt` | string | Bitrate tier FHD/HD/SD | `$ctxData['bt']` |
| `sc` | string | Sport subcategory | `$ctxData['sc']` |
| `cf2` | string | Codec family HEVC/AVC | `$ctxData['cf2']` |

**New in v25 (22 campos — closing cross-lane gaps):**

| Key | Type | Description | Closes gap from |
|-----|------|-------------|----------------|
| `mx` | int | HDR MaxCLL nits | EXTHTTP → Resolver |
| `mf` | int | HDR MaxFALL nits | EXTHTTP → Resolver |
| `dv` | int | Dolby Vision profile (5,7,8) | EXTHTTP → Resolver |
| `bx` | int | Buffer-Max real ms | EXTHTTP → Resolver |
| `b2` | int | Buffer-Target real ms | EXTHTTP → Resolver |
| `dt` | string | Device-Type (TV/MOB/DSK) | EXTHTTP → Resolver |
| `sr` | string | Screen-Resolution | EXTHTTP → Resolver |
| `hw` | 0/1 | Hardware-Decode | EXTHTTP → Resolver |
| `ib` | int | Initial-Bitrate bps | EXTHTTP → Resolver |
| `bp` | string | Bandwidth-Preference (UL) | EXTHTTP → Resolver |
| `cd` | string | CDN-Provider | EXTHTTP → Resolver |
| `sf` | 0/1 | Seamless-Failover | EXTHTTP → Resolver |
| `ab` | int | Audio-Bitrate kbps | EXTHTTP → Resolver |
| `ac` | string | Audio-Codecs | EXTHTTP → Resolver |
| `pt` | string | Player-Type (VLC/Kodi) | EXTHTTP → Resolver |
| `nt` | string | Network-Type (wifi/eth) | EXTHTTP → Resolver |
| `rc` | int | Retry-Count | EXTHTTP → Resolver |
| `ct2` | int | Connection-Timeout ms | EXTHTTP → Resolver |
| `vc` | string | Video-Codecs supported | EXTHTTP → Resolver |
| `dr` | string | DRM-Support | EXTHTTP → Resolver |
| `nc2` | int | VLCOPT network-caching real | VLCOPT → Resolver |
| `cj` | int | VLCOPT clock-jitter real | VLCOPT → Resolver |

## 4. Key File Locations

### Frontend (Local — generates M3U8 lists)
| File | Purpose |
|------|---------|
| `frontend/js/ape-channel-classifier.js` | Netflix-grade classifier v3.0 — SINGLE SOURCE OF TRUTH |
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | M3U8 generator (5300+ lines) |
| `frontend/js/group-title-builder.js` | Consumes `_classification` → group-title strings |
| `frontend/js/enrichment-constructor.js` | Infers resolution, codec, FPS, transport, flags |

### Backend (VPS — resolves channels at playback time)
| File | Purpose | Optional? |
|------|---------|:---------:|
| `resolve_quality.php` | **Resolve 3.0** — main resolver | ❌ Required |
| `resolve.php` | Gold Standard v16.1 — legacy resolver | ❌ Required |
| `rq_sniper_mode.php` | Active channel detection | ✅ Optional |
| `rq_anti_cut_engine.php` | Anti-cut directives per profile | ✅ Optional |
| `rq_dynamic_channel_map.php` | Dynamic channel mapping | ✅ Optional |
| `ape_credentials.php` | Credential SSOT resolution | ✅ Optional |
| `ape_stream_validator_proxy.php` | Stream validation | ✅ Optional |
| `ape_anti_noise_engine.php` | Noise cleaning | ✅ Optional |
| `ape_hdr_peak_nit_engine.php` | HDR tone mapping | ✅ Optional |

## 5. Critical Architecture Rules

### RULE 1: All `require_once` MUST have `file_exists()` guard
```php
// ❌ NEVER DO THIS — causes Fatal Error 500 if file missing
require_once __DIR__ . "/module.php";

// ✅ ALWAYS DO THIS
if (file_exists(__DIR__ . "/module.php")) {
    require_once __DIR__ . "/module.php";
}
```

### RULE 2: All external function calls MUST have `function_exists()` guard
```php
// ❌ NEVER — Fatal Error if module not loaded
$result = rq_sniper_integrate($ch, 'P1', $host, $sid);

// ✅ ALWAYS — graceful fallback
$result = function_exists('rq_sniper_integrate')
    ? rq_sniper_integrate($ch, 'P1', $host, $sid)
    : ['effective_profile' => $_GET['p'] ?? 'P3'];
```

### RULE 3: All external class usage MUST have `class_exists()` guard
```php
// ❌ NEVER
$creds = ApeCredentials::resolve($host, $user, $pass);

// ✅ ALWAYS
if (class_exists('ApeCredentials')) {
    $creds = ApeCredentials::resolve($host, $user, $pass);
}
```

### RULE 4: All array access from optional modules MUST use `?? default`
```php
// ❌ NEVER — Undefined array key if $anti_cut is null/empty
$p = $anti_cut['profile_data'];
$exthttp = $anti_cut['exthttp'];

// ✅ ALWAYS
$p = $anti_cut['profile_data'] ?? [];
$exthttp = $anti_cut['exthttp'] ?? [];
```

### RULE 5: cfg._classification BRIDGE is mandatory before build_exthttp
```js
// The classification lives in channel._classification
// but build_exthttp reads cfg._classification
// Without this bridge, X-APE-CL-* headers are NEVER emitted

// ✅ ALWAYS before build_exthttp():
cfg._classification = channel._classification;
lines.push(build_exthttp(cfg, profile, index, sessionId, reqId));
```

### RULE 6: CTX key names MUST match what PHP reads
```
Frontend key → PHP key (MUST BE IDENTICAL)
'rs' → $ctxData['rs']   // NOT 'r' — PHP expects 'rs'
'rg' → $ctxData['rg']
'lg' → $ctxData['lg']
```

### RULE 7: Version hint MUST be incremented when CTX schema changes
```js
v: '25'  // Increment when adding/removing CTX fields
         // PHP can use this to handle backward compatibility
```

### RULE 8: Anti-509 — ZERO origin-touching HTTP calls in resolve
```php
// ❌ ABSOLUTELY NEVER in resolve_quality.php
curl_init('http://provider-origin.com/...');
file_get_contents('http://provider-origin.com/...');

// The resolver ONLY emits metadata. It NEVER fetches from the IPTV provider.
// Violation = 509 Too Many Connections = provider bans your credentials
```

## 6. Deploy Checklist

See workflow: `/deploy-vps`

Key steps:
1. Anti-509 gate (MANDATORY)
2. `scp` to VPS
3. `php -l` syntax check
4. `systemctl restart php8.3-fpm` if workers crashed
5. Health check: `curl /api/health`
6. End-to-end test: `curl /api/resolve_quality?ch=1&p=P3&srv=...`
7. Verify HTTP 200 (not 500/502)

## 7. Incident History

| Date | Issue | Root Cause | Fix |
|------|-------|-----------|-----|
| 2026-03-29 | 500 on all channels | `require_once rq_sniper_mode.php` without `file_exists()` | Added guard |
| 2026-03-29 | 500 continue | `rq_sniper_integrate()` called without `function_exists()` | Added fallback |
| 2026-03-29 | 500 cascade | `$anti_cut['profile_data']` on null | `?? []` |
| 2026-03-29 | 502 Bad Gateway | PHP-FPM workers all crashed from repeated 500s | `systemctl restart php8.3-fpm` |
| 2026-03-29 | Warning flood | `$p['video_track']` undefined key | `?? ''` |
| 2026-03-29 | EXTHTTP blind | `cfg._classification` never set (classification in `channel._classification`) | Bridge line added |
| 2026-03-29 | CTX key mismatch | Frontend sent `r`, PHP expected `rs` | Changed key to `rs` |
| 2026-03-30 | Cross-lane gaps | 22 data points existed in EXTHTTP but not in CTX — resolver blind to HDR, device, buffer, audio | CTX v25: 22 new fields |
| 2026-03-30 | X-Country-Code hardcoded | EXTHTTP sent `US` for all channels, ignoring classification | Uses `channel._classification.country` |
