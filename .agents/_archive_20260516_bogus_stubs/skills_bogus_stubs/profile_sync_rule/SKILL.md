---
description: MANDATORY rules for M3U8 list generation - NEVER skip any of these
---

# Skill: M3U8 Generation Master Rules (INVIOLABLE)

> 🚨 **THESE RULES ARE ABSOLUTE. VIOLATING ANY RULE = BROKEN LIST.**

---

## RULE 1 — NO PROFILE IS DEFAULT

There are **6 profiles: P0, P1, P2, P3, P4, P5**. NONE is "the default". The **Channel Classifier** (`determineProfile()`) assigns a profile to **EACH channel individually** based on:

| Channel Name/Resolution | Assigned Profile |
|--------------------------|-----------------|
| Contains "8K" or 7680px | **P0** ULTRA_EXTREME |
| Contains "4K"/"UHD" + "60FPS"/"SPORTS" | **P1** 8K_SUPREME |
| Contains "4K"/"UHD" or 3840px | **P2** 4K_EXTREME |
| Contains "FHD"/"1080" or 1920px | **P3** FHD_ADVANCED |
| Contains "HD"/"720" or 1280px | **P4** HD_STABLE |
| Everything else | **P5** SD_FAILSAFE |

**NEVER say "P2 by default" or "default profile".**

---

## RULE 2 — EACH PROFILE HAS ITS OWN VALUES

Every profile carries **completely different** settings. Example comparison:

| Field | P0 | P2 | P5 |
|-------|-----|-----|-----|
| bitrate | 13.4 Mbps | 13.4 Mbps | 1.5 Mbps |
| T1 | 17.4 | 17.4 | 2.0 |
| T2 | 21.4 | 21.4 | 2.4 |
| buffer | 50000ms | 35000ms | 20000ms |
| playerBuffer | 50000ms | 35000ms | 20000ms |
| network_cache | 60000ms | 45000ms | 30000ms |
| prefetch_segments | 500 | 350 | 200 |
| prefetch_parallel | 250 | 180 | 100 |
| headersCount | 235 | 158 | 41 |

**Source of truth**: `ape-profiles-config.js` → `DEFAULT_PROFILES` → each `settings` object.

---

## RULE 3 — THE PER-CHANNEL FLOW (SACRED PIPELINE)

```
For EACH channel:
  1. determineProfile(channel)           → assigns P0-P5
  2. getProfileConfig(profile)           → Dynamic Bridge reads PM runtime values
  3. build_exthttp(cfg, profile, ...)    → EXTHTTP headers with THIS profile's values
  4. PM-INJECT reads getHeaderValue(profile, header) → 19 categories × 140+ headers
  5. build_qos_performance_tags(cfg, profile)  → QoS/Prefetch tags with THIS profile
  6. build_hdr_peak_nit_tags(cfg, profile)
  7. build_anti_noise_tags(cfg, profile)
  8. build_anti_cut_tags(cfg, profile)
  9. build_ape_block(cfg, profile, ...)
```

**Every builder receives `cfg` and `profile` for THAT specific channel. Never shared.**

---

## RULE 4 — THE DYNAMIC BRIDGE v2.0

`getProfileConfig(profileId)` reads values with this priority:

```
1. APE_PROFILES_CONFIG.getProfile(id)  → Profile Manager UI runtime values (MASTER)
2. APE_PROFILE_BRIDGE (legacy)         → old bridge
3. PROFILES[id] hardcoded              → safe fallback only
```

**NEVER read directly from hardcoded PROFILES. ALWAYS call getProfileConfig().**

---

## RULE 5 — ALL 19 PM CATEGORIES MUST BE IN THE LIST

The Profile Manager has 19 header categories (140+ headers total). **ALL must appear in the M3U8**:

1. 🔐 Identidad (11) — User-Agent, Accept, Sec-CH-UA*, etc.
2. 🔗 Conexión & Seguridad (10) — Connection, Keep-Alive, Sec-Fetch*, DNT, etc.
3. 💾 Cache & Range (5) — Cache-Control, Pragma, Range, If-None-Match, etc.
4. 🌐 Origen & Referer (3) — Origin, Referer, X-Requested-With
5. 🎯 APE Engine Core (5) — X-App-Version, X-Playback-Session-Id, etc.
6. 🎬 Playback Avanzado (7) — Priority, X-Playback-Rate, X-Prefetch-Enabled, etc.
7. 🎥 Codecs & DRM (3) — X-Video-Codecs, X-Audio-Codecs, X-DRM-Support
8. 📡 CDN & Buffer (9) — X-CDN-Provider, X-Failover-Enabled, X-Buffer-*, X-*-Caching
9. 📊 Metadata & Tracking (5) — X-Client-Timestamp, X-Request-Id, etc.
10. ⚡ Extras SUPREMO (3) — Accept-Charset, X-Buffer-Strategy, Accept-CH
11. 📱 OTT Navigator (8) — X-OTT-Navigator-Version, X-Player-Type, X-Hardware-Decode, etc.
12. 🎛️ Control de Streaming (6) — X-Bandwidth-Estimation, X-Retry-*, X-*-Timeout-Ms
13. 🔒 Seguridad & Anti-Block (1) — X-Country-Code
14. 🎨 HDR & Color (17) — X-HDR-Support, X-Color-*, X-HEVC-*, X-Pixel-Format, etc.
15. 📺 Resolución Avanzada (5) — X-Max-Resolution, X-Max-Bitrate, X-Frame-Rates, etc.
16. 🔊 Audio Premium (6) — X-Dolby-Atmos, X-Audio-Channels, X-Spatial-Audio, etc.
17. ⚡ Descarga Paralela (4) — X-Parallel-Segments, X-Prefetch-Segments, etc.
18. 🛡️ Anti-Corte (5) — X-Reconnect-On-Error, X-Max-Reconnect-Attempts, etc.
19. 🧠 Control ABR Avanzado (7) — X-Bandwidth-Preference, X-BW-*, X-Congestion-Detect

**Header source**: `ape-profiles-config.js` → `HEADER_CATEGORIES` (L24-191) and `DEFAULT_HEADER_VALUES` (L571-737).

---

## RULE 6 — COMPUTED METRICS (NEVER HARDCODE)

These metrics must be **calculated from the profile values**, never hardcoded:

| Metric | Formula |
|--------|---------|
| Buffer Total | `C1 + C2 + playerBuffer` |
| Headroom | `(T2 / bitrate) × 100` |
| Risk Score | From headroom thresholds |
| Streaming Health | From risk score |
| Stall Floor | From headroom thresholds |
| RAM Estimate | `(bufferTotal/1000) × bitrate / 8` |
| Jitter Max | `playerBuffer × 0.8` |
| Fill Time | `(segments × segDur) / parallel × ratio` |
| Burst Factor | `bwPeak / bwAvg` |
| Overhead | `playerBuffer - (C1/5)` |

---

## RULE 7 — THREE OUTPUT LAYERS (ALL MANDATORY)

Every channel must have directives in ALL 3 layers:

1. **`#EXT-X-APE-*` per-channel tags** — Sections 1-18 in `build_ape_block` + `build_qos_performance_tags`
2. **`#EXTHTTP` headers** — via `build_exthttp()` + PM-INJECT
3. **Resolver URL `ctx` payload** — compact B64 with profile, resolution, bandwidth, HDR, codec

---

## RULE 8 — VERIFICATION CHECKLIST

After generating ANY M3U8 list, I MUST verify:

- [ ] Console shows `🔗 [BRIDGE v2.0]` per profile (not `📦 [FALLBACK]`)
- [ ] Console shows `📋 [PM-INJECT] N headers from Profile Manager`
- [ ] Different channels have different `ape-profile="P*"` values
- [ ] `#EXT-X-APE-STREAMING-HEALTH` varies per profile
- [ ] `#EXT-X-APE-ISP-BW-MIN-TARGET` matches profile's T1
- [ ] EXTHTTP contains Audio Premium headers (X-Dolby-Atmos, etc.)
- [ ] EXTHTTP contains OTT Navigator headers
- [ ] EXTHTTP contains ABR Control headers

---

## KEY FILES

| File | Purpose |
|------|---------|
| `ape-profiles-config.js` | Profiles P0-P5, 19 categories, 140 headers, defaults |
| `m3u8-typed-arrays-ultimate.js` | Generator: getProfileConfig, build_exthttp, build_ape_block, PM-INJECT |
| `profile-manager-v9.js` | UI component that renders/edits profiles at runtime |
| `ape-module-manager.js` | Module activation (dual-client-runtime, etc.) |
