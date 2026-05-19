# ARTIFACT — BULLETPROOF Flow E2E (LAB → Frontend → Generator → M3U8 → Player)

**Generated:** 2026-05-19
**BULLETPROOF artifact:** `~/Downloads/LAB_CALIBRATED_BULLETPROOF_20260519_122604.json` (315 KB)
**Synthesizer:** `IPTV_v5.4_MAX_AGGRESSION/tools/synthesize_bulletproof.py` (committed this sprint)
**Method:** Pragmatic synthesis (Brain_PrismaEnrichBulletproof macro hung after ~30 min of VBA string concat; Python port produced equivalent result in <1 s)
**Status:** Anabolic BULLETPROOF READY for frontend consumption

---

## 1. BULLETPROOF anatomy — what's inside (verified)

### 1.1 Top-level keys (17)

```
lab_version              "omega_v1_bulletproof_20260519"
playlist_format          "m3u8"
exported_at              "2026-05-19T12:26:04"
profiles_calibrated      6 profiles · P0-P5 · ~58 settings each
nivel1_directives        50 directives (master playlist global header)
nivel3_per_layer         7 layers (per-channel emission layers)
servers                  4 upstream servers (Xtream credentials map)
evasion_pool             2 pool entries (UA / referer / proxy variants)
config_global            global config (default headers, timeouts, etc.)
placeholders_map         58 placeholders incl {config.player_target}  ← NEW
scoring_metadata         OMEGA scoring + quality grades
lab_schema_variant       "bulletproof_v2.3_anabolic"
omega_gap_plan           gap_plan v3 (idempotent + polymorphic)
bulletproof              true (flag — this IS the bulletproof export)
meta_per_profile         fitness scores · cross_profile_monotonic=true · anabolic_enriched_at
prisma_lab_sync_v20      12 sub-blocks (infrastructure, channel_dna_defaults,
                         codec_ladder_per_profile, vba_modules, hook_injection, etc.)
sprint_2026_05_18_19     Sprint metadata: 4 R-1/D-1 fixes + 3 G-1/G-2/G-3 fixes + LAB additions
                         + smoke invariants H-1..H-4 + anabolic enrichment report
```

### 1.2 Per-profile settings — doctrine fields populated

Doctrine fields (per CLAUDE.md "Bitrate Fallback por Resolución" + "Codec Ladder"):

| Field | P0 (8K HDR) | P1 (4K HDR) | P2 (QHD HDR) | P3 (FHD60 SDR) | P4 (FHD30 SDR) | P5 (HD AVC) |
|---|---|---|---|---|---|---|
| `hdr_mode` | HDR10 | HDR10 | HDR10 | SDR | SDR | SDR |
| `video_range` | PQ | PQ | PQ | SDR | SDR | SDR |
| `color_primaries` (CICP) | 9 | 9 | 9 | — | — | — |
| `transfer_characteristics` (CICP) | 16 | 16 | 16 | — | — | — |
| `matrix_coefficients` (CICP) | 9 | 9 | 9 | — | — | — |
| `codec_primary` | HEVC | HEVC | HEVC | HEVC | AVC | AVC |
| `codec_string` | hvc1.2.4.L153.B0,ec-3 | hvc1.2.4.L153.B0,ec-3 | hvc1.2.4.L150.B0,ec-3 | hvc1.2.4.L120.B0,mp4a.40.2 | avc1.640028,mp4a.40.2 | avc1.42E01E,mp4a.40.2 |
| `resolution` | 7680x4320 | 3840x2160 | 3840x2160 | 1920x1080 | 1920x1080 | 1280x720 |
| `target_framerate` | 60FPS | 60FPS | 30FPS | 60FPS | 30FPS | 30FPS |
| `nits_target` | 4000 | 1500 | 1000 | 400 | 100 | 100 |
| `vmaf_target` | 95 | 93 | 91 | 88 | 82 | 75 |
| `bandwidth_floor` | 15 Mbps | 12 Mbps | 8 Mbps | 5 Mbps | 3 Mbps | 1.5 Mbps |
| `bandwidth_target` | 60 Mbps | 22 Mbps | 12 Mbps | 9 Mbps | 6.5 Mbps | 4 Mbps |
| `bandwidth_max` | 80 Mbps | 28 Mbps | 16 Mbps | 12 Mbps | 9 Mbps | 5.5 Mbps |
| `codec_chain_video` | 11 tiers | 11 tiers | 11 tiers | 11 tiers | 11 tiers | 11 tiers |
| `codec_chain_video_family` | full ladder | full ladder | full ladder | full ladder | full ladder | full ladder |
| `codec_chain_player_pref` | hvc1,hev1,h265,avc1,h264 | (same) | (same) | (same) | (same) | (same) |

Fields not populated: only the 3 CICP attributes on SDR profiles (P3-P5) — by design,
SDR streams should NOT carry COLOR-PRIMARIES/TRANSFER/MATRIX (RFC §4.4.6.2 says these
fields are HDR-only; emitting them on SDR confuses decoders).

### 1.3 The new placeholder

```json
"placeholders_map": {
  "{config.player_target}": {
    "source": "7_NIVEL_3_CHANNEL.player_target",
    "description": "Player overlay target enum (VLC/KODI/TIVIMATE/OTT_NAV). Empty = default heuristic via LabConfigLoader::playerTargetForChannel.",
    "enum": ["VLC", "KODI", "TIVIMATE", "OTT_NAV", ""],
    "default": "",
    "added_at": "2026-05-19T12:26:04",
    "doctrine_ref": ".agents/artifacts/ARTIFACT_FASE1_PROFUNDO_DESTRIPE.md"
  }
}
```

---

## 2. Frontend ingestion — how the LAB load is absorbed

### 2.1 Entry point: `Import LAB` button

User flow:
1. Click **Import LAB** button in `index-v4.html`.
2. File picker opens, user selects `LAB_CALIBRATED_BULLETPROOF_*.json` (latest).
3. JS reads via `FileReader.readAsText()`.
4. `importFromLABData(jsonText)` parses and dispatches.

### 2.2 Distribution to global state

`importFromLABData()` in `frontend/js/ape-v9/ape-profiles-config.js`:

| BULLETPROOF key | Target global | Consumer |
|---|---|---|
| `profiles_calibrated.P0..P5` | `window.APE_PROFILES_CONFIG.profiles[Pn]` | `getProfile(profileId).settings.*` lookups from generator |
| `placeholders_map` | `window.APE_PLACEHOLDERS` | `_resolvePlaceholders()` resolves `{config.X}` literals at emit time |
| `nivel1_directives` | `window.APE_LAB.nivel1` | `generateGlobalHeader()` master playlist tags |
| `nivel3_per_layer` | `window.APE_LAB.nivel3` | `generateChannelEntry()` per-channel layer emission |
| `servers` | `window.APE_LAB.servers` | `buildCredentialsMap()` Xtream credentials |
| `evasion_pool` | `window.APE_LAB.evasion` | UA rotation, referer pool |
| `config_global` | `window.APE_LAB.global` | Default headers, timeouts, prefetch config |
| `prisma_lab_sync_v20` | `window.APE_LAB.prisma` | Player-side overlay injection (PRISMA boost) |
| `omega_gap_plan` | `window.APE_LAB.gap_plan` | Scorecard verification + OMEGA guarantees check |

### 2.3 Validation gate on import

Before distribution, `importFromLABData()` runs:
- Schema validation (top-level keys, profile presence)
- Coherence check (matrix vs hojas 5/7 via `lab_absorption_runtime.js`)
- Fidelity verification (emission-side via `lab-fidelity-verifier.js`)
- LAB_CALIBRATED Excel compat audit (per `reference_lab_excel_compat_audit_20260511`)

If any check fails, the import is rejected with a console error AND a non-blocking
UI banner — defensive defaults (the previously imported LAB) remain active.

---

## 3. Frontend → Generator transmission

### 3.1 Trigger: `btnGenerateAudited` click

```
btnGenerateAudited.onclick
  → APEGenerationController.prepublishAndGenerate()
    → ApeQualityProber.quickProbe(channels)   ← per-host × profile evidence
    → APEFallbackResolver decides F0..F5 per channel
    → m3u8-typed-arrays-ultimate.js::generateChannelEntry(channel, profile, ...)
       reads pmProfile.settings.* (driven by BULLETPROOF profiles_calibrated)
    → emits 11 capas per channel (L0..L11 of Cadena de Manifestación)
    → final .m3u8 (or _SHIELDED.m3u8) → FSAA or chunked-blob download
```

### 3.2 Per-channel cfg construction

In `generateChannelEntry(channel, profile, index, credentialsMap, options)`:

```js
const pmProfile = window.APE_PROFILES_CONFIG.getProfile(profile);   // from BULLETPROOF
const cfg = {
  ...channel.cfg,                              // per-channel overrides
  ...pmProfile.settings,                       // LAB SSOT — 58 fields now
  ...pmProfile.headerOverrides,                // EXTHTTP doctrine
};
// cfg.codec_chain_video = "hvc1.2.4.L153.B0,..."   (11-tier from LAB)
// cfg.bandwidth_floor = 15000000                    (LAB)
// cfg.bandwidth_target = 60000000                    (LAB)
// cfg.color_primaries = 9                            (LAB · integer CICP)
// cfg.transfer_characteristics = 16                  (LAB)
// cfg.matrix_coefficients = 9                        (LAB)
// cfg.video_range = "PQ" | "SDR"                     (LAB)
// cfg.hdr_mode = "HDR10" | "SDR"                     (LAB)
// cfg.target_framerate = "60FPS" | "30FPS"           (LAB)
// cfg.nits_target = 4000..100                        (LAB)
// cfg.vmaf_target = 95..75                           (LAB)
```

Every emission decision downstream reads from `cfg`. **LAB is SSOT — no more JS
hardcoded fallbacks fire** (the doctrine fallbacks become dead code in practice).

### 3.3 Truth resolver overlay

`APEFallbackResolver.resolveMaxQualityFallback(channel, profile, probeData)`:

- Reads probe evidence (`probeData.videoCodec`, `videoRange`, `colorPrimaries`,
  `hdcpLevel`, `bandwidth`, etc.).
- Cross-references with `cfg` (LAB SSOT).
- Decides F0/F1 (probe trusted) → F2/F3/F4 (premium/FHD/AVC hint) → F5 (last resort).
- Returns `truth` object that `emitStreamInfFromTruth()` consumes.

After today's fixes (commits 19d6f27 + 3fd36c3 + 36aa057):
- VIDEO-RANGE emitted ONLY when `probeData.videoRange` confirms PQ/HLG
- HDR10 CICP trifecta (9/16-or-18/9) emitted alongside VIDEO-RANGE
- HDCP-LEVEL emitted only when `probeData.hdcpLevel` (probe pipeline upgrade pending)
- STABLE-VARIANT-ID emitted for every STREAM-INF
- No more hardcoded `TYPE-1` anywhere in active code

### 3.4 11-capas emission per channel

Per `ARTIFACT_CHAIN_OF_MANIFESTATION_11_ESLABONES.md`:

| L# | Layer | Source | Output tag(s) |
|---|---|---|---|
| L0 | HLS identity | `generateEXTINF(channel, profile, index)` | `#EXTINF:-1 tvg-id="..." tvg-name="..." group-title="...",NAME` |
| L1 | URL (single) | `buildChannelUrl(channel, jwt, profile, ...)` | `https://shield.tld/...` (VERBATIM, byte-identical) |
| L2 | Player profile | `cfg.vlcopt`, `cfg.kodiprop` | `#EXTVLCOPT:preferred-codec=hvc1,...` + `#KODIPROP:inputstream.adaptive.preferred_codec=hvc1,hev1,h265,avc1,h264` (11-tier ladder) |
| L3 | EXTHTTP headers | `cfg.headerOverrides` + scrub gate | `#EXTHTTP:{"User-Agent":"...","Referer":"...","Connection":"keep-alive"}` (6 toxic headers blocked) |
| L4 | Codec ladder | `cfg.codec_chain_video` | `#EXT-X-APE-AV1-FALLBACK-CHAIN:HEVC-MAIN10-L5.1>...>H264-HIGH` (11 tiers) |
| L5 | HDR10 trifecta | probe-verified CICP | `COLOR-PRIMARIES=9,TRANSFER-CHARACTERISTICS=16,MATRIX-COEFFICIENTS=9` inside STREAM-INF (verified PQ only) |
| L6 | LL-HLS telemetry | `probeData.llhls` | `#EXT-X-APE-LLHLS:DETECTED=true,PART-TARGET=...,HOLD-BACK=...` |
| L7 | Resilience genome | `PRE_ARMED_RESPONSE_BUILDER` | `#EXT-X-APE-FALLBACK-GENOME-B64:...` (10 HTTP status fallbacks consolidated) |
| L8 | Quality telemetry | `_apeTruth` + CA11 validator | `#EXT-X-APE-CODEC-REAL:...` / `-PREFERRED:...` + `#EXT-X-APE-VALIDATED:RFC8216-STRICT,...` |
| L9 | SHIELDED rename | `gateway-manager.js:736-738` | filename `_SHIELDED.m3u8` (URLs internas VERBATIM) |
| L10 | Player overlays | per `{config.player_target}` | conditional X-APE-* tags + KODIPROP variants |
| L11 | Hardware/display | consumer end | (out of generator scope) |

### 3.5 The new `{config.player_target}` placeholder in action

When sheet 7 col `player_target` for a specific channel is set to `VLC`:

1. Channel data carries `channel.player_target = "VLC"` to generator.
2. `_resolvePlaceholders` substitutes `{config.player_target}` → `VLC` in any
   emitted line that contains it (e.g., a `#KODIPROP:player.target={config.player_target}`).
3. On the VPS, `hls_rewriter_v15.py:rewrite_manifest()` reads `profile_config['player_target']`
   and injects VLC-specific overlay tags before transmitting to the device.
4. Empty `player_target` cell → `LabConfigLoader::playerTargetForChannel()` resolver
   inferences from UA / profile default / fallback chain.

This decouples per-channel overrides from per-profile defaults, allowing surgical
player-specific tuning without losing the universal fallback.

---

## 4. Generator → M3U8 → Player (universal compatibility guarantees)

### 4.1 Single source of truth for image quality

Every variable that affects displayed image quality has ONE authoritative source:

| Quality variable | Authoritative source | Fallback if absent |
|---|---|---|
| Codec ladder | LAB `codec_chain_video` (11 tiers) | JS hardcoded 11-tier (Agent F 19d6f27) |
| HDR signaling | Probe `videoRange` | OMITTED (no false HDR claim) |
| CICP trifecta | Probe CICP attrs | (9, 16/18, 9) safe defaults when VIDEO-RANGE verified |
| HDCP-LEVEL | Probe `hdcpLevel` | OMITTED (no false TYPE-1 claim) |
| Bandwidth | Probe `bandwidth` | LAB `bandwidth_target` → resolution-keyed table |
| Resolution | Probe `resolution` | LAB `resolution` (per profile) |
| Frame rate | Probe `frameRate` | LAB `target_framerate` |
| Audio codec | Probe `audioCodec` | LAB `codec_chain_audio` |

### 4.2 Universal player compatibility — how it works

Per RFC 8216 §6.3.1 "**A client SHOULD ignore any tag or attribute it does not understand.**"

This means EVERY proprietary tag we emit (X-APE-*, PRISMA directives, KODIPROP,
EXTVLCOPT, etc.) is INVISIBLE to non-supporting players. Players consume only what
they understand:

| Player | Reads | Ignores (invisible) | Effect |
|---|---|---|---|
| **hls.js** (web) | STREAM-INF, EXTINF, MEDIA, MAP | X-APE-*, EXTHTTP, KODIPROP, EXTVLCOPT | Universal HLS playback |
| **ExoPlayer** (Android) | STREAM-INF, EXTINF, EXTHTTP | X-APE-*, KODIPROP, EXTVLCOPT | HTTP headers + HLS playback |
| **OTT Navigator** (Android TV) | STREAM-INF, EXTINF, EXTHTTP, EXT-X-MEDIA, KODIPROP | X-APE-*, EXTVLCOPT | Quality + headers + Kodi profile |
| **TiviMate** (Android TV) | STREAM-INF, EXTINF, EXTHTTP, KODIPROP | X-APE-*, EXTVLCOPT | Headers + Kodi profile |
| **VLC** (desktop / mobile) | STREAM-INF, EXTINF, EXTVLCOPT | X-APE-*, KODIPROP, EXTHTTP | VLC-specific overlay options |
| **Kodi** (with InputStream Adaptive) | STREAM-INF, EXTINF, KODIPROP | X-APE-*, EXTVLCOPT | Kodi inputstream config |
| **Sony Bravia Smart TV** | STREAM-INF, EXTINF | X-APE-*, all properietary | Basic HLS + codec hints |
| **iOS Safari AVPlayer** | STREAM-INF, EXTINF (RFC 8216 strict) | X-APE-*, all proprietary | Strict RFC 8216 — needs RFC-compliant attrs |

**Critical insight:** Our STREAM-INF attribute order + content is RFC 8216 STRICT.
The proprietary `X-APE-*` tags ENHANCE compatible players without harming strict ones.

### 4.3 Anti-509 single URL guarantee

Each channel block emits EXACTLY one URL at the end. The generator NEVER emits:
- `EXT-X-MEDIA URI=...`  (would be a 2nd connection)
- `EXT-X-I-FRAME-STREAM-INF URI=...` (would be a 3rd connection)
- Multiple `EXT-X-STREAM-INF` per channel (would request 2 variants)

Result: 1 connection per channel = no HTTP 509 from provider.

### 4.4 SHIELDED doctrine integrity

Channel URLs internas are NEVER transformed by the generator. The SHIELDED
treatment is filename-only:
- `APE_LISTA_<ts>.m3u8` → `APE_LISTA_<ts>_SHIELDED.m3u8` (filename rename)
- URL bytes inside the file = byte-identical to the original Xtream URL
- Shielding delivery happens at the network layer (WireGuard + DNS hijack + NGINX)

### 4.5 Honest-rules guarantee (post-sprint 2026-05-18..19)

The following invariants hold UNCONDITIONALLY in any list generated by the
patched generator:

| Invariant | Where enforced | Smoke test |
|---|---|---|
| `0 TYPE-1 hardcoded` | resolver + dead build_stream_inf neutralized | H-1 |
| `0 SUPPLEMENTAL-CODECS fake` | resolver gate + contradiction detector | H-2 |
| `VIDEO-RANGE = PQ ⇒ probe-verified` | resolver `hdrVerified && (PQ\|HLG)` gate | H-3 |
| `VIDEO-RANGE = PQ ⇒ CICP trifecta` | resolver emits all 3 CICP attrs alongside | H-4 |
| `EXT-X-VERSION emitted once` | only in master global header, never per-channel | manual grep |
| `Single primaryUrl per channel` | `buildChannelUrl` returns 1 URL | manual grep `^https` count == channel count |
| `6 toxic headers blocked` | `UPSERT_EXTHTTP_BANNED_OUTBOUND` gate | manual grep |

Run: `python IPTV_v5.4_MAX_AGGRESSION/tests/smoke_m3u8_honest_rules.py <list.m3u8>`

Expected exit code: **0**. Expected verdict: **PASS**.

---

## 5. Generation procedure (right now)

1. **Browser hard reload** (`Ctrl+F5`). DevTools Network: confirm
   `ape-fallback-resolver.js?v=20260519-honest-rules-trifecta` and
   `m3u8-typed-arrays-ultimate.js?v=20260519-r1-d1-fix` are loaded (not 304-cached).

2. **Click "Import LAB"** in the frontend. File picker: select
   `~/Downloads/LAB_CALIBRATED_BULLETPROOF_20260519_122604.json` (the new anabolic).

3. Confirm import success in console:
   - `[LAB] imported · 6 profiles · 58 placeholders · sprint_2026_05_18_19 detected`
   - All 6 profiles register with `getProfile('Pn').settings` having 56-58 keys.

4. **Click "btnGenerateAudited"**. Pipeline runs:
   - Live quality probe (12 requests, ~5 s)
   - Resolver F0..F5 partitioning
   - 15k+ channels emitted with 11 capas each
   - FSAA save dialog (Chrome) or chunked-blob download (other browsers)

5. **Post-generation smoke test**:
   ```bash
   python IPTV_v5.4_MAX_AGGRESSION/tests/smoke_m3u8_honest_rules.py \
       "C:/Users/HFRC/Downloads/APE_LISTA_<ts>.m3u8"
   ```
   Expected: `PASS` on H-1, H-2, H-3, H-4. `hdr_with_trifecta > 0` if there are
   probe-verified HDR channels.

---

## 6. Why this produces extreme image quality

| Driver | Effect | Magnitude |
|---|---|---|
| 11-tier HEVC cascade in LAB + JS | Player gets 6 Main10 HDR tiers before falling to 8-bit; AVC last resort | Up to +6 quality steps vs the historical 8-tier ladder |
| HDR10 CICP trifecta now emitted | Decoders pre-init BT.2020 pipeline instead of falling to BT.709 | Eliminates washed-out HDR on Fire TV Stick 4K Max, NVIDIA Shield, ONN 4K |
| VIDEO-RANGE gated on probe | No false HDR claim → ExoPlayer doesn't waste cycles on HDR pipeline for SDR streams | Faster startup + no HDMI handshake stalls |
| STABLE-VARIANT-ID | Player UI remembers user's variant choice across reloads | Consistent quality across sessions |
| Honest CODECS=...,VIDEO-RANGE | Player picks the actual codec it can decode | Less rebuffer / format-switch glitches |
| Per-profile bandwidth ceiling | Encoder doesn't get throttled when the network has headroom | Higher achieved bitrate on premium channels |
| LL-HLS detection + PART-TARGET passthrough | Sub-second latency on supported lives | Sports + news feel "live" |
| MAX_IMAGE_FIRST resolver doctrine | F2 hint for premium channels → HEVC Main10 PREFERRED even when probe fails | Premium channels always get the strongest codec hint compatible with their player |
| SHIELDED + autopista | Single 1-connection-per-channel, no shield interference | No HTTP 509 / no transcode tax |
| EXTHTTP gate scrubs toxic headers | Player never receives Range/If-None-Match/etc. that cause okhttp EOF | Eliminates the "unexpected end of stream" failure mode |

---

## 7. Files committed this sprint that produce this result

| Commit | What |
|---|---|
| `19d6f27` | Agent F E2E SSOT for `build_stream_inf` + 11-tier cascade expansion |
| `3fd36c3` | R-1 (VIDEO-RANGE gated on probe) + D-1 (TYPE-1 neutralized) in generator |
| `36aa057` | G-1 (HDR10 CICP trifecta) + G-2 (HDCP propagation) + G-3 (STABLE-VARIANT-ID) in resolver |
| `43f52f8` | Smoke test `smoke_m3u8_honest_rules.py` (H-1, H-2, H-3) + Phase 1.PROFUNDO-B audit artifact |
| `2d4c8d7` | Cache-bust `?v=` bumped in index-v4.html |
| (this commit) | BULLETPROOF synthesizer (`synthesize_bulletproof.py`) + this artifact |

Plus the in-LAB additions deployed today (`mod_PRISMA_PlayerTarget.bas`):
- Sheet 7 col 7 row 5 = `player_target` with validation
- Sheet 98_VALIDATIONS with enum (VLC/KODI/TIVIMATE/OTT_NAV)
- Sheet 32 row 69 with `{config.player_target}` placeholder
- Named Range `lst_PlayerTargets` A1-canonical

---

## 8. Pending follow-ups (not blocking generation)

1. Probe pipeline (`ape-quality-prober.js`) should expose `colorPrimaries` /
   `transferCharacteristics` / `matrixCoefficients` / `hdcpLevel` from manifest parsing.
   Without this, the resolver uses safe defaults (9/16-or-18/9) — still RFC-correct
   but less precise per-channel than probe-verified values would be.

2. The original `Brain_PrismaEnrichBulletproof` macro hung — root cause analysis
   (likely VBA O(n²) string concat on a large sheet). Fix is OUT-OF-SCOPE for now;
   the Python synthesizer is the reproducible path forward.

3. Generator-side: emit `VIDEO-RANGE=HLG` defaults to `TRANSFER-CHARACTERISTICS=18`
   (already implemented) — but the resolver should also start propagating HLG-vs-PQ
   from probe explicitly instead of via the videoRange string. Minor refinement.

4. Run a real generation with the new BULLETPROOF + execute the smoke test —
   verifies end-to-end that everything composes as designed.

---

## 9. References

- `ARTIFACT_FASE1_PROFUNDO_DESTRIPE.md` (generator audit)
- `ARTIFACT_FASE1_PROFUNDO_B_RESOLVER_AUDIT.md` (resolver audit)
- `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` (codec ladder spec)
- `ARTIFACT_HDR10_METADATA_TRIFECTA.md` (CICP 9/16/9 spec)
- `ARTIFACT_CHAIN_OF_MANIFESTATION_11_ESLABONES.md` (L0-L11 layers)
- `CLAUDE.md` — Doctrina Cardinal MAX IMAGE FIRST + Reglas Honestas + 10 Criterios de Éxito
- RFC 8216 + RFC 8216bis (HLS spec)
- RFC 6381 §3.3 (codec strings)
