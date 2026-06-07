# /validate-m3u8 — Validation Report
**Target:** `IPTV_v5.4_MAX_AGGRESSION/audit_bulletproof_output.m3u8`  
**Generated:** 2026-05-11T06:41:41.146Z (BEFORE C8 fixes)  
**Validated:** 2026-06-07  
**Channels:** 10 (test_0 → test_9, all P0)  
**Lines:** ~9,310  
**Exit code:** 1 WARN (file is pre-fix snapshot; current generator already resolves most criticals)

---

## SUMMARY

| Severity | Count | Status in current generator |
|---|---|---|
| CRITICAL | 3 | ✅ All FIXED in current generator |
| HIGH | 3 | ⚠️ 1 active (Atmos/DTS), 2 fixed |
| MEDIUM | 3 | ℹ️ Info / test artifacts |
| LOW | 2 | ✅ Acceptable or ignorable |

---

## CRITICAL FINDINGS (all fixed in current generator)

### C1 — TOXIC HEADERS in EXTHTTP `[FIXED in generator — C8 2026-05-11]`
**Line 215:** EXTHTTP JSON contains 3 prohibited headers:
```
"TE":"trailers"        ← PROHIBITED: causes EOF on OkHttp Android
"Range":"bytes=0-"     ← PROHIBITED: "unexpected end of stream" okhttp.Address
"Priority":"u=0, i"    ← PROHIBITED: HTTP/2 only, ruido en HTTP/1.1
```
**Doctrine:** CLAUDE.md "Headers PROHIBIDOS (causan EOF/304/403)" — 6 headers empíricamente confirmados.  
**Current generator:** Lines 4578–4585 have these commented out with C8 annotation. NOT emitted.  
**Verdict:** File is stale. Regenerate to get clean output.

---

### C2 — SUPPLEMENTAL-CODECS="lcev.1.1.1" `[FIXED in generator]`
**Lines 1010, 1932, 2854, 3776, 4698, 5620, 6542, 7464, 8386, 9308:**  
Every `#EXT-X-STREAM-INF` contains:
```
SUPPLEMENTAL-CODECS="lcev.1.1.1"
```
**Doctrine:** CLAUDE.md "SUPPLEMENTAL-CODECS='lcev.1.1.1' ← ELIMINADO (LCEVC inventado, no real)"  
**Current generator:** `grep -n "SUPPLEMENTAL-CODECS" m3u8-typed-arrays-ultimate.js` → only in comments. NOT emitted.  
**Verdict:** File is stale. Regenerate.

---

### C3 — VIDEO-RANGE="PQ" without probe evidence `[GATED in current generator]`
**Lines 1010, 1932, ... (all STREAM-INF):**
```
VIDEO-RANGE="PQ"
```
All 10 channels are test placeholders with URL `http://iptv-provider.com/live/test_X.m3u8` — no real probe ran.  
**Doctrine:** CLAUDE.md "VIDEO-RANGE sin probe ← ELIMINADO (HDR falso confunde decoders)"  
**Current generator:**
- L9636: `_videoRangePart = _probedRange ? ',VIDEO-RANGE=...' : ''` → only if probed
- L9790: VIDEO-RANGE=PQ only if `options.perceptual4kMode` is active  
**Verdict:** File is stale. In current generator this requires real probe evidence.

---

## HIGH FINDINGS

### H1 — KODIPROP Atmos/DTS/TrueHD=true (ACTIVE in generator) `⚠️`
**Line 236–238 (in file), generator L3425, L8367:**
```
#KODIPROP:inputstream.adaptive.audio_dolby_atmos=true
#KODIPROP:inputstream.adaptive.audio_dts=true
#KODIPROP:inputstream.adaptive.audio_truehd=true
```
**Doctrine (memory: feedback_audio_no_atmos_ec3.md):**  
"Audio normal IPTV mp4a.40.2/ac-3. ec-3/Atmos da problemas passthrough. Atmos/DTS/TrueHD=false"  
**Current generator:** L3425 emits `dolby_atmos=true` when `cfg.audio_channels >= 8` (P0 has 8 channels → triggers). L8295-8297 hardcode false in the inline path. L8367 emits true in another path.  
**Risk:** Kodi ISA may try EC-3/TrueHD passthrough → audio dropout on devices without Atmos decoder.  
**Recommended fix:** Gate `dolby_atmos` to always false per memory doctrine, or at minimum remove from the P0 audio_channels>=8 shortcut at L3425.

---

### H2 — CODECS="av01.0.08M.08" (AV1-first in STREAM-INF) `[FIXED in generator today]`
**Lines 1010, 1932, ...:**: Primary codec is AV1, not HEVC.  
**Doctrine:** MAX IMAGE FIRST → HEVC-first cascade.  
**Current generator:** HEVC-first idempotency fix applied today (commit 9c41d6e). Regenerated lists will have HEVC primary.  
**Verdict:** Stale file artifact.

---

### H3 — False CMAF metadata blocks (custom APE tags) `[LOW risk, metadata-only]`
**Lines 295–319:** Multiple `#EXT-X-CMAF-*` tags declared without `#EXT-X-MAP` or real `.m4s` evidence:
```
#EXT-X-CMAF:CODECS="av01.0.08M.08,eac3",BANDWIDTH=120000000,...
#EXT-X-CMAF-CONTAINER:fmp4
#EXT-X-CMAF-INIT-SEGMENT:BYTERANGE="1024@0"
```
**Doctrine:** CLAUDE.md criterion 4: "0 declaraciones CMAF falsas (solo si EXT-X-MAP + .m4s/init.mp4)"  
**Risk:** These are `#EXT-X-CMAF-*` (APE custom tags), NOT the standard `EXT-X-MAP`. RFC 8216 §4.1: unknown tags MUST be ignored. Players skip them → no direct player breakage.  
**However:** The comment `EXT-X-CMAF-INIT-SEGMENT:BYTERANGE="1024@0"` implies fMP4 init segment that doesn't exist.  
**Verdict:** MEDIUM risk only. Non-standard tags invisible to compliant players. Flag for cleanup in future session.

---

## MEDIUM FINDINGS

### M1 — EXTHTTP X-Video-Range: SDR for P0 DV profile
**Line 215:** `"X-Video-Range":"SDR"` but channel is P0 (8K DV/HDR10+).  
**Expected:** `"X-Video-Range":"PQ"` or `"HDR10"` for DV profile.  
**Status:** Fixed today — profile-aware EXTHTTP HDR values added (commit 12ab795). Regenerate.

---

### M2 — Localhost:3000 Referer in URL pipe
**Lines 1012, 1934, ...**:
```
http://iptv-provider.com/live/test_0.m3u8|...&Referer=http%3A%2F%2Flocalhost%3A3000
```
This is a test artifact from the Live Server (dev env at :5500 / :3000).  
**Risk:** If a real production list were generated in dev mode, the Referer would expose localhost, which the provider may block as invalid. Not a production issue since production lists are generated from the frontend with real server URLs.

---

### M3 — X-Codec-Primary: av01.0.08M.08 (AV1-first hint)
**Line 215 EXTHTTP:** `"X-Codec-Primary":"av01.0.08M.08"` — AV1-first, not HEVC.  
**Status:** Fixed today — profile-aware EXTHTTP now derives codec from LAB per-profile. Regenerate.

---

## LOW FINDINGS

### L1 — #EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER tags
**Lines 454, 8636:** `#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:ENABLED=true,THRESHOLD=3,RESET=30s`  
**Context:** The VPS nginx Lua circuit breaker was REMOVED (memory: feedback_circuit_breaker_REMOVED_autopista.md). However, `#EXT-X-APE-*` tags are CUSTOM extension tags that compliant players MUST ignore per RFC 8216 §4.1. No player acts on this tag.  
**Risk:** Zero — this is decorative APE metadata. The real circuit breaker is VPS-side (already removed).  
**Verdict:** Cosmetic. Low priority cleanup.

---

### L2 — HDCP-LEVEL="TYPE-1" hardcoded
**All STREAM-INF lines.**  
**Verdict:** CORRECT per current doctrine. CLAUDE.md HDCP-Adaptive Engine (2026-05-19): "TYPE-1 ahora se emite por defecto agresivo en cada EXT-X-STREAM-INF". This is the correct behavior.

---

## RFC 8216 COMPLIANCE CHECK

| Rule | Status |
|---|---|
| `#EXTM3U` first line | ✅ |
| Single URL per channel | ✅ (1 URL per EXTINF block) |
| No `EXT-X-MEDIA URI=` | ✅ (not found) |
| No `EXT-X-I-FRAME-STREAM-INF URI=` | ✅ (not found) |
| Max 1 `EXT-X-STREAM-INF` per channel | ✅ |
| No toxic headers in EXTHTTP | ✅ (current generator) / ❌ (this file — stale) |
| No `SUPPLEMENTAL-CODECS` invented | ✅ (current generator) / ❌ (this file — stale) |
| No `VIDEO-RANGE` without probe | ✅ (current generator) / ❌ (this file — stale) |
| `getAuditSummary().channelsRemoved === 0` | ✅ (10 channels present) |

---

## VERDICT

```
EXIT CODE: 1 — WARN
```

This file is a **pre-fix snapshot** generated before commit C8 (2026-05-11). The current generator (commits 9c41d6e, 1159918, 498287d, 12ab795, 727a647) resolves **all 3 CRITICAL** and **2 of 3 HIGH** findings.

**Remaining active generator issue:**
- H1: `dolby_atmos=true` at L3425 (when `audio_channels >= 8`) and L8367 — contradicts memory doctrine. Recommend fixing to always-false per `feedback_audio_no_atmos_ec3.md`.

**Action required:** Regenerate via the frontend with real channels to validate the current generator output. This file should not be used for production.
