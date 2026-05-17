# ARTIFACT — PLAYER COMPATIBILITY MATRIX

**Generated:** 2026-05-17
**Authority:** `player-compatibility-matrix` skill (S9) + `android-tv-ott-tivimate-tuning` (S9)
**Players covered:** 7

---

## 1. Player support matrix

| Capability | OTT Navigator | TiviMate | hls.js | Shaka | VLC | Apple AVPlayer | ExoPlayer (raw) |
|---|---|---|---|---|---|---|---|
| **HTTP backend** | OkHttp (Android) | OkHttp (Android) | fetch / XHR (browser) | fetch / XHR | libcurl | Foundation | OkHttp |
| **M3U / M3U Plus** | ✅ | ✅ | ❌ (HLS only) | ❌ | ✅ | ❌ | ✅ |
| **HLS Master playlist** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **HLS Media TS** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **HLS fMP4 (CMAF)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **LL-HLS (EXT-X-PART)** | ⚠ partial | ⚠ partial | ✅ | ✅ | ❌ | ✅ | ⚠ |
| **EXT-X-PRELOAD-HINT** | ⚠ | ⚠ | ✅ | ✅ | ❌ | ✅ | ⚠ |
| **HEVC Main10** | ✅ (Fire TV 4K+) | ✅ (Fire TV 4K+) | ⚠ MSE-dependent | ⚠ MSE | ✅ | ✅ | ✅ (HW dependent) |
| **AV1 10-bit** | ⚠ Fire TV 4K Max | ⚠ Fire TV 4K Max | ✅ Chromium 90+ | ✅ | ✅ | ✅ (M1+) | ⚠ HW |
| **HDR10** | ✅ HW | ✅ HW | ⚠ device | ⚠ | ✅ | ✅ | ⚠ |
| **Dolby Vision** | ✅ if licensed | ✅ if licensed | ❌ | ❌ | ⚠ | ✅ | ⚠ HW |
| **Atmos passthrough** | ✅ | ✅ | ❌ | ❌ | ⚠ | ✅ | ⚠ |
| **EXTHTTP headers** | ✅ (OkHttp respects) | ✅ | ⚠ ignored | ❌ | ⚠ | ❌ | ⚠ |
| **EXTVLCOPT** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **KODIPROP** | ❌ | ⚠ partial | ❌ | ❌ | ❌ | ❌ | ❌ |

Legenda: ✅ supported · ⚠ partial / conditional · ❌ not supported

---

## 2. Header behavior per player

### OTT Navigator / TiviMate (OkHttp Android)
- **Strict on 4-layer headers**: `Connection`, `Keep-Alive`, `Sec-Fetch-*` MUST be single-value
- **EOF traps**: `If-None-Match: *`, `Range: bytes=0-`, `If-Modified-Since` invalid → EOF
- **Trust**: respect EXTHTTP JSON block per channel
- **Source**: memorias `feedback_okhttp_single_value_headers`, `feedback_exthttp_traps`

### hls.js (browser)
- **Ignores**: EXTHTTP, EXTVLCOPT, KODIPROP, all directives propietarias `#EXT-X-APE-*` (RFC 8216 §6.3.1: "SHOULD ignore unrecognized")
- **Trusts**: ABR via EWMA bandwidth math (`ewma-abr-math`)
- **Sensitive**: CORS — needs `Access-Control-Allow-Origin` from upstream
- **Source**: memoria `feedback_parsers_invisible_to_players`

### Shaka Player (browser)
- Similar to hls.js but more strict
- Supports MPEG-DASH + HLS unified
- More aggressive ABR

### VLC (libcurl)
- Honors `#EXTVLCOPT` directives
- More permissive on malformed headers
- `network-caching` tunable per channel via EXTVLCOPT

### Apple AVPlayer (Foundation)
- Strict on RFC 8216
- Rejects orphan STREAM-INF
- HLS native — best LL-HLS support
- Doesn't honor EXTHTTP (uses iOS networking stack)

### ExoPlayer (raw, on Android TV)
- Honors most EXTHTTP via OkHttp backend
- LoadControl tunable via ADB (per `reference_ape_prisma_v13_adb_payload_injector`)
- BufferForPlaybackMs / MinBufferMs critical for fast start

---

## 3. Profile recommendations per player

| Player | Best codec | Profile | HDR | Special config |
|---|---|---|---|---|
| OTT Navigator (Fire TV 4K) | HEVC Main10 hvc1.2.4.L153.B0 | P3-P5 | HDR10 if real | EXTHTTP single-value Connection |
| OTT Navigator (Fire TV Stick 1080p) | AVC High avc1.640028 | P1-P2 | SDR | reduce bitrate floor |
| TiviMate (Onn 4K) | HEVC Main10 | P3 | HDR10 if real | private_dns_mode=hostname/dns.google (do NOT change) |
| hls.js (browser desktop) | AVC High avc1.640028 + fallback | P0-P3 | SDR | CORS configured |
| Shaka (browser desktop) | AVC + AV1 fallback | P0-P3 | SDR | CORS |
| VLC (desktop) | HEVC + EXTVLCOPT network-caching | P3-P5 | HDR if HW | `#EXTVLCOPT:network-caching=3000` |
| Apple AVPlayer (iOS/macOS) | HEVC Main10 hvc1.2.* | P3-P5 | HDR10/DV | LL-HLS preferred |
| ExoPlayer (Android raw) | HEVC + KODIPROP tunables | P3 | HW-dependent | ADB LoadControl |

---

## 4. Compatibility score formula

```python
def compat_score(channel, player):
    score = 100

    # Codec support
    if not player.supports(channel.codec): score -= 30

    # HDR authenticity
    if channel.declares_hdr and not channel.probed_hdr: score -= 25  # fake HDR
    if not player.supports_hdr(channel.hdr_type): score -= 10

    # Headers compatibility
    for header in channel.exthttp:
        if header in TOXIC_HEADERS[player]: score -= 15
        if header in SINGLE_VALUE_REQUIRED[player] and is_multi_value(header):
            score -= 20

    # Tag compatibility
    for tag in channel.tags:
        if tag in INCOMPATIBLE_TAGS[player]: score -= 10

    # Bitrate sanity
    if channel.declared_resolution == 2160 and channel.real_bitrate < 8_000_000:
        score -= 15  # fake-4K

    return max(0, score)
```

---

## 5. Decision table for fallback resolver (F0-F5)

| Player target | Probe confidence | Best F-tier |
|---|---|---|
| OTT Nav Fire TV 4K + probe OK | high | F0 REAL_VERIFIED_MAX (HEVC Main10) |
| OTT Nav + probe partial | medium | F1 REAL_PARTIAL_MAX |
| OTT Nav + premium hint | low | F2 HEVC_PREMIUM_HINT |
| TiviMate Fire TV Stick + probe fail | low | F3 HEVC_SAFE_1080P |
| hls.js + no evidence | low | F4 AVC_HIGH_SAFE (avc1.640028) |
| Player unknown | none | F5 ORIGINAL_DIRECT_SAFE (just EXTINF + URL) |

---

## 6. Known issues per player (current as of 2026-05-17)

| Player | Issue | Workaround |
|---|---|---|
| OTT Navigator | E-AC3 corrupt on Sky Sports 4K stream 1312008 | 5.1 + passthrough + mp4a.40.2 fallback (per `reference_audio_safety_sky_sports_4k_specific`) |
| TiviMate | Doesn't honor 4-layer Connection header | Force single-value for OkHttp headers |
| hls.js | Ignores EXTHTTP entirely | Use server-side headers instead |
| VLC | Network-caching too low for live | `#EXTVLCOPT:network-caching=3000` |
| ExoPlayer (Android raw) | LoadControl defaults too conservative | ADB tunables (300MB buffer ultraboost per APE PRISMA v1.3) |

---

## 7. Smoke test channels per player

Always test these 3 minimum after any header/codec/tag change:

| Channel type | Why | Pass criteria |
|---|---|---|
| Premium 4K HDR | HDR authenticity + bitrate sanity | < 2s startup, no freeze 5min, observed bitrate >= profile floor |
| Sports live (high-motion) | FPS / GOP / motion handling | no judder, no FPS drop event |
| Regular IPTV (Xtream typical) | Anti-509 + baseline | single URL, < 2s startup |

---

## 8. HEVC 11-Tier × Player support (cascada definitiva)

Per `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md`, los 11 codec strings se enfrentan a los 7 players así:

| Player | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OTT Nav Fire TV 4K Max | ✅HW | ✅HW | ⚠120Hz | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW |
| OTT Nav Fire TV Stick 1080p | ⚠SW | ⚠SW | ❌ | ⚠SW | ✅HW | ✅HW | ⚠SW | ⚠SW | ✅HW | ✅HW | ✅HW |
| TiviMate Onn 4K | ✅HW | ✅HW | ⚠120Hz | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW |
| TiviMate Fire TV Stick | ⚠SW | ⚠SW | ❌ | ⚠SW | ✅HW | ✅HW | ⚠SW | ⚠SW | ✅HW | ✅HW | ✅HW |
| hls.js Chrome 90+ | ⚠MSE | ⚠MSE | ❌ | ⚠MSE | ✅MSE | ✅MSE | ⚠MSE | ⚠MSE | ✅MSE | ✅MSE | ✅MSE |
| hls.js Firefox | ❌ | ❌ | ❌ | ❌ | ⚠ | ⚠ | ❌ | ❌ | ⚠ | ⚠ | ✅MSE |
| Shaka Chrome | ⚠MSE | ⚠MSE | ❌ | ⚠MSE | ✅MSE | ✅MSE | ⚠MSE | ⚠MSE | ✅MSE | ✅MSE | ✅MSE |
| VLC desktop | ✅SW | ✅SW | ⚠ | ✅SW | ✅SW | ✅SW | ✅SW | ✅SW | ✅SW | ✅SW | ✅SW |
| AVPlayer iOS 14+ | ✅HW | ✅HW | ⚠ | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW |
| ExoPlayer raw | ✅HW | ✅HW | ⚠HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW | ✅HW |

Legenda: ✅HW (hardware) · ✅SW (software) · ✅MSE (browser MSE) · ⚠ partial · ❌ unsupported

### Universal coverage strategy

- **Emit minimum 3 tiers per channel** en Master playlist: 1 top (T1-T3), 1 mid (T4-T6 o T7-T9), 1 universal (T11)
- Player elige el mejor variant que **decodifica + cabe en bandwidth** per RFC 8216 §4.4.4.2
- Per `ARTIFACT_TAG_PARSING_GUARANTEE.md`: cualquier tier NO soportado se ignora silenciosamente — cero rechazo de manifest

### Adjustments to Section 3 profile recommendations

| Player | Best tier (revised) | Min tier to include |
|---|---|---|
| OTT Nav Fire TV 4K Max | T1 (hvc1.2.4.L153.B0) | T11 (avc1.640028) — siempre |
| OTT Nav Fire TV Stick 1080p | T5 (hvc1.2.4.L120.B0) | T11 |
| TiviMate Onn 4K | T1 | T11 |
| TiviMate Fire TV Stick | T5 | T11 |
| hls.js Chrome / Shaka | T5 (1080p Main10) | T11 |
| hls.js Firefox | T11 | T11 |
| VLC desktop | T1 | T11 |
| AVPlayer iOS 14+ | T1 | T11 |
| ExoPlayer raw | T1 | T11 |

---

**Fin Player Compatibility Matrix (con 11-tier cascade definitiva).**
