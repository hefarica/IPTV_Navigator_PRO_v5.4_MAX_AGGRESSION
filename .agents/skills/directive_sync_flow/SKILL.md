---
description: MANDATORY end-to-end synchronization flow for M3U8 generation and resolver enforcement — NEVER skip
---

# Skill: Full Synchronization Flow (INVIOLABLE)

> 🚨 **This is the master reference for the entire IPTV directive pipeline.**
> All values must flow from ONE source through ALL layers without contradiction.

---

## THE FLOW — Source of Truth Chain

```
Profile Manager UI (ape-profiles-config.js)
     │ P0-P5 profiles × 19 categories × 140+ headers
     ▼
Dynamic Bridge v2.0 (getProfileConfig)
     │ Reads PM runtime → maps to generator cfg
     ▼
Channel Classifier (determineProfile)
     │ Assigns P0-P5 per channel by name/resolution
     ▼
Per-Channel Generator (generateChannelEntry)
     │ cfg = getProfileConfig(classifiedProfile)
     │
     ├──► EXTVLCOPT (105 directives) ← uses cfg values
     ├──► KODIPROP (stream_headers JSON) ← uses cfg values  
     ├──► EXTHTTP (140+ PM headers + QoS) ← uses cfg + PM-INJECT
     ├──► EXT-X-APE-* tags (Sections 1-18) ← computed from cfg
     └──► ctx B64 payload in resolver URL ← compact cfg snapshot
              │
              ▼
         RESOLVER (resolve_quality.php on VPS)
              │ Decodes ctx → reads X-APE-* headers
              │ CTX OVERLAY → overrides anti-cut profile with REAL values
              │
              ├──► EXTHTTP output ← anti-cut + qosRef + ctxData synced
              ├──► KODIPROP output ← uses $p (overlaid with ctx)
              ├──► EXTVLCOPT output ← anti-cut + sniper scale
              └──► Response headers ← X-RQ-QoS-* reference values
```

---

## RULE 1 — ONE SOURCE, ALL LAYERS IDENTICAL

The same value must appear in ALL applicable layers. Example for buffer:

| Source | EXTVLCOPT | KODIPROP | EXTHTTP | ctx | Resolver |
|--------|-----------|----------|---------|-----|----------|
| P2 buffer=35000 | `network-caching=35000` | `stream_buffer_size=35000` | `X-Buffer-Target:35000` | `bf:35000` | `$p['buffer_ms']=35000` |
| P2 resolution=3840x2160 | `adaptive-maxheight=2160` | `max_resolution=3840x2160` | `X-Max-Resolution:3840x2160` | `rs:3840x2160` | `$p['max_resolution']=3840x2160` |
| P2 codec=HEVC | `preferred-codec=hevc` | `X-HW-Decode-Force=...` | `X-Video-Codecs:hevc` | `cp:HEVC` | `$p['codec_primary']=HEVC` |

**If I change a value in ONE layer, I MUST change it in ALL layers.**

---

## RULE 2 — GENERATOR LAYERS (m3u8-typed-arrays-ultimate.js)

### A. EXTVLCOPT — `generateEXTVLCOPT(profile)` L1609
- 105 unique directives, 16 sections
- Uses `cfg = getProfileConfig(profile)` for dynamic values
- Key synced fields: `network-caching`, `live-caching`, `file-caching`, `adaptive-maxheight`, `adaptive-maxwidth`, `preferred-resolution`, `sharpen-sigma`

### B. KODIPROP — `build_kodiprop(cfg, profile, index)` L1738
- JSON stream_headers with profile values
- Key synced fields: `X-Buffer-Min`, `X-APE-Profile`, `X-ISP-*`, `X-Adaptive-Max-Resolution`, `X-HW-Decode-Force`

### C. EXTHTTP — `build_exthttp(cfg, profile, index, sessionId, reqId)` L2784
- 140+ headers from PM-INJECT + hardcoded engine headers
- PM-INJECT reads ALL 19 categories dynamically
- Key synced fields: ALL PM headers + QoS/ISP/Health metrics

### D. EXT-X-APE-* Tags — `build_ape_block` + `build_qos_performance_tags`
- Sections 1-18 per channel
- Computed from cfg values (not hardcoded)

### E. ctx B64 Payload — in resolver URL
- Compact: `{rs, br, bf, nc, hd, cs, cp, v}`
- Carries snapshot of profile values for resolver

---

## RULE 3 — RESOLVER LAYERS (resolve_quality.php)

### A. ctx Decoder — MODO 2 block
- Decodes URL-safe B64 → JSON
- Extracts: resolution, bitrate, buffer, net_cache, HDR, color_space, codec

### B. X-APE-* Header Reader — 12 QoS headers from inbound request
- BW targets, health, risk, headroom, stall, buffer total, jitter, prefetch, RAM, overhead

### C. CTX Overlay — `rq_enrich_channel_output()`
- Overlays ctx values on anti-cut profile `$p`
- `$p['max_resolution']`, `$p['max_bitrate']`, `$p['buffer_ms']`, etc. = REAL list values

### D. 3-Layer Output Sync
- **EXTHTTP**: anti-cut headers + qosRef + ctxData injected
- **KODIPROP**: uses `$p` (already overlaid with ctx)
- **EXTVLCOPT**: anti-cut directives + sniper scaling
- **Enforcement**: `X-RQ-Enforcement:NUCLEAR`, `X-RQ-Directive-Sync:VLCOPT+KODIPROP+EXTHTTP`

### E. Session Registry — max 10 concurrent
- File: `sessions/active_sessions.json`
- Each session: IP + channelId + full QoS reference
- Auto-eviction >5 min, FIFO if >10
- Query: `?action=sessions`

---

## RULE 4 — WHAT I MUST NEVER DO

1. ❌ Hardcode a value in ONE layer without updating ALL others
2. ❌ Say any profile is "default" — Classifier assigns per channel
3. ❌ Read from hardcoded PROFILES directly — always `getProfileConfig()`
4. ❌ Skip PM-INJECT in EXTHTTP — all 19 categories must be present
5. ❌ Let the resolver use its own values ignoring the ctx payload
6. ❌ Return 301/302 redirects — always 200/206
7. ❌ Leave KODIPROP without syncing with EXTHTTP values

---

## RULE 5 — VERIFICATION AFTER ANY CHANGE

After modifying ANY layer:

- [ ] EXTVLCOPT `network-caching` = cfg.net_cache
- [ ] KODIPROP `X-Buffer-Min` = same net_cache value
- [ ] EXTHTTP `X-Network-Caching` = same net_cache value
- [ ] ctx payload `nc` = same net_cache value
- [ ] Resolver `$p['network_cache']` = decoded ctx `nc`
- [ ] Response header `X-RQ-QoS-Buffer-Ms` = decoded ctx `bf`
- [ ] Console shows `🔗 [BRIDGE v2.0]` (not FALLBACK)
- [ ] Console shows `📋 [PM-INJECT] N headers` (19 categories)
- [ ] VPS returns 200 (never 301/302)
- [ ] `?action=sessions` shows active sessions with QoS data

---

## KEY FILES

| File | Location | Role |
|------|----------|------|
| `ape-profiles-config.js` | frontend/js/ape-v9/ | Source of truth: P0-P5, 19 categories, 140 headers |
| `m3u8-typed-arrays-ultimate.js` | frontend/js/ape-v9/ | Generator: all 5 output layers |
| `profile-manager-v9.js` | frontend/js/ape-v9/ | UI editor for profiles |
| `resolve_quality.php` | backend/ (+ VPS) | Resolver: ctx decoder, session registry, 3-layer re-emit |
| `rq_sniper_mode.php` | backend/ | Sniper scaling for active channels |
| `rq_anti_cut_engine.php` | backend/ | Anti-cut profile data + directives |
