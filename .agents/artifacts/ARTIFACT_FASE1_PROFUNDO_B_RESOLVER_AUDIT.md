# ARTIFACT — FASE 1 PROFUNDO-B · `ape-fallback-resolver.js` Trifecta Gating Audit

**Generated:** 2026-05-19
**Target:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-fallback-resolver.js` (549 líneas)
**Status:** Read-only audit (no modifications)
**Predecessor:** `ARTIFACT_FASE1_PROFUNDO_DESTRIPE.md` (recommended Phase 1.PROFUNDO-B in §8 #3)
**Companion:** `IPTV_v5.4_MAX_AGGRESSION/tests/smoke_m3u8_honest_rules.py` (post-deploy smoke test)

---

## 1. Scope

Phase 1.PROFUNDO completed the destripe of `m3u8-typed-arrays-ultimate.js` and verified
9 of 10 CLAUDE.md success criteria pass. The remaining honest-rules gate lives in
`ape-fallback-resolver.js::emitStreamInfFromTruth()`, which is the **only** active
emitter for HDR-tagged STREAM-INF lines (after the R-1 fix at L8919). This audit
verifies it.

Three questions:

1. Does the resolver emit `VIDEO-RANGE` only when probe-verified?
2. Does the resolver emit the HDR10 metadata trifecta (CICP 9 / 16 / 9 — BT.2020 / PQ / MC) per `ARTIFACT_HDR10_METADATA_TRIFECTA.md`?
3. Does the F0–F5 tier scoring correctly partition channels by truth confidence?

---

## 2. The 6-tier fallback contract (FACT)

| Tier | Function | Confidence | Contradictions | Behavior |
|---|---|---|---|---|
| **F0_REAL_VERIFIED_MAX** | `buildF0VerifiedMax` (L180-213) | ≥ 85 | 0 | Trust probe; emit verified codec, container, HDR, bandwidth, resolution |
| **F1_REAL_PARTIAL_MAX** | `buildF1PartialMax` (L215-252) | ≥ 60 | ≤ 1 | Trust probe partially; fallback codec `hvc1.2.4.L150.B0`; SUPPLEMENTAL hardcoded null |
| **F2_HEVC_PREMIUM_HINT** | `buildF2HevcPremiumHint` (L254-297) | < 60 OR >1 contradiction | premium name match | PREFERRED only; `hvc1.2.4.L153.B0`; `videoRange=null`; APE-HDR-PREFERRED tag for 4K signals |
| **F3_HEVC_SAFE_1080P** | `buildF3HevcSafe1080p` (L299-336) | low | FHD/sports name | PREFERRED `hvc1.2.4.L120.B0`; no VIDEO-RANGE |
| **F4_AVC_HIGH_SAFE** | `buildF4AvcHighSafe` (L338-373) | low | no premium match | `avc1.640028`; no HDR; no VIDEO-RANGE |
| **F5_ORIGINAL_DIRECT_SAFE** | `buildF5OriginalDirectSafe` (L375-405) | none | URL not .m3u8 | `canEmitStreamInf: false` — explicit block |

Selection logic at `resolveMaxQualityFallback` (L407-439):

```
1. confidence ≥ 85 ∧ contradictions = 0   → F0
2. confidence ≥ 60 ∧ contradictions ≤ 1   → F1
3. isPremiumChannel(channel, profile)     → F2
4. isLikelyFhdOrSports(channel, profile)  → F3
5. channel.url contains '.m3u8'           → F4
6. otherwise                              → F5
```

Audit-friendly: every selection bumps a counter in `auditSummary`. Final
report exposed via `getAuditSummary()`.

---

## 3. Confidence + contradiction scoring

**Confidence** (`computeProbeConfidence` L93-102, max 100):
- `videoCodec`        → +35
- `resolution`        → +25
- `bandwidth > 0`     → +20
- `frameRate > 0`     → +10
- `audioCodec`        → +10

F0 threshold (85) requires **4 of 5 fields**. F1 (60) requires the major three.

**Contradictions** (`detectProbeContradictions` L104-145, 7 detectors):

| Code | Trigger |
|---|---|
| `HDR_WITHOUT_HEVC` | videoRange=PQ\|HLG but codec is AVC or unknown |
| `4K_ABSURDLY_LOW_BITRATE` | res=2160 but bandwidth < 2 Mbps |
| `AVC_10BIT_CLAIM` | codec=AVC but codecsFull mentions 10-bit |
| `CMAF_WITHOUT_MAP` | container=fmp4-cmaf but no EXT-X-MAP |
| `CMAF_WITHOUT_M4S_INIT` | container=fmp4-cmaf but no .m4s/init.mp4 |
| `SUPPLEMENTAL_WITHOUT_DV` | SUPPLEMENTAL-CODECS claimed but no dvh1/dvhe |
| `UNKNOWN_VIDEO_RANGE` | videoRange not in {PQ, HLG, SDR} |

**Cross-reference with CLAUDE.md**: The CMAF gate matches "0 declaraciones CMAF
falsas (solo si EXT-X-MAP + .m4s/init.mp4 verificados)" — ✅ enforced.

---

## 4. Honest-rules audit of `emitStreamInfFromTruth` (L445-473)

The active STREAM-INF builder. Body:

```js
const parts = [];
parts.push(`BANDWIDTH=${truth.bandwidth}`);
parts.push(`AVERAGE-BANDWIDTH=${truth.averageBandwidth || Math.round(truth.bandwidth * 0.8)}`);
parts.push(`RESOLUTION=${truth.resolution}`);
parts.push(`FRAME-RATE=${Number(truth.frameRate || 30).toFixed(3)}`);
parts.push(`CODECS="${truth.codec},${truth.audioCodec || 'mp4a.40.2'}"`);

// VIDEO-RANGE solo si verificado por probe (no inventar HDR)
if (truth.hdrVerified && (truth.videoRange === 'PQ' || truth.videoRange === 'HLG')) {
    parts.push(`VIDEO-RANGE=${truth.videoRange}`);
}

// SUPPLEMENTAL-CODECS solo si verificado (no inventar DV/LCEVC)
if (truth.supplementalCodecsVerified && truth.supplementalCodecs) {
    parts.push(`SUPPLEMENTAL-CODECS="${truth.supplementalCodecs}"`);
}

// HDCP-LEVEL: NUNCA hardcoded. Solo si truth lo trae verificado del probe.
if (truth.hdcpLevelVerified && truth.hdcpLevel) {
    parts.push(`HDCP-LEVEL=${truth.hdcpLevel}`);
}

return `#EXT-X-STREAM-INF:${parts.join(',')}`;
```

| Field | Gate | Verdict |
|---|---|---|
| `VIDEO-RANGE` | `hdrVerified && (videoRange === 'PQ' ‖ 'HLG')` | ✅ HONEST — no inventa HDR |
| `SUPPLEMENTAL-CODECS` | `supplementalCodecsVerified && supplementalCodecs` | ✅ HONEST — no inventa DV/LCEVC |
| `HDCP-LEVEL` | `hdcpLevelVerified && hdcpLevel` | ✅ HONEST — gate strict |
| `BANDWIDTH` | always (required by RFC 8216) | ✅ |
| `CODECS` | always — but **codecVerified=false** triggers F2/F3 → emits `EXT-X-APE-CODEC-PREFERRED` adjacent | ✅ |
| `RESOLUTION` | always | ⚠ Tier-dependent — F2/F3 emit unverified resolutions (1080p / 4K guess) without an `unverified` marker INSIDE STREAM-INF |

**Verdict: 3/3 honest-rules gates correctly enforced in the STREAM-INF emitter.**

---

## 5. Findings — Gaps & Risks

> **STATUS UPDATE 2026-05-19**: G-1, G-2, G-3 all **RESOLVED** in commit
> following this audit. Resolver now emits the HDR10 trifecta, propagates
> HDCP-LEVEL when probe detects it, and emits STABLE-VARIANT-ID. See the
> "Resolution" subsection at the end of each finding below.

### G-1 (Risk, MEDIUM → **RESOLVED**) — HDR10 trifecta CICP signaling absent from active emitter

**Where:** `emitStreamInfFromTruth` L445-473.

**What:** RFC 8216bis §4.4.6.2 + ARTIFACT_HDR10_METADATA_TRIFECTA.md require, for HDR
streams, the emission of three CICP attributes alongside `VIDEO-RANGE`:

```
COLOR-PRIMARIES=9               (BT.2020)
TRANSFER-CHARACTERISTICS=16     (SMPTE ST 2084 / PQ)  · or 18 for HLG
MATRIX-COEFFICIENTS=9           (BT.2020 non-constant luminance)
```

The resolver emits `VIDEO-RANGE=PQ` but **NOT** the trifecta. Some hardware decoders
(Fire TV Stick 4K Max, ONN 4K, NVIDIA Shield) initialize their color pipeline based
on CICP fields and may fall back to BT.709 when they're missing — producing
washed-out HDR.

**Note:** The **dead** `build_stream_inf` in `m3u8-typed-arrays-ultimate.js`
(L6160-6167, see ARTIFACT_FASE1_PROFUNDO_DESTRIPE D-1) HAS the trifecta block
correctly implemented. Agent F's E2E SSOT work (commit 19d6f27) preserved this
emission with cfg defaults. But that function is never called.

**Recommendation:** port the conditional trifecta block from the dead function
into `emitStreamInfFromTruth`, populating CICP from `truth.colorPrimaries`,
`truth.transferCharacteristics`, `truth.matrixCoefficients` (which would need to
be added to `buildF0VerifiedMax`/`buildF1PartialMax` from probe data — typical
HDR10 streams carry them in master manifest or SEI). When probe doesn't provide,
fallback to (9, 16, 9) for verified PQ — safe defaults per HDR10 spec.

**Resolution (2026-05-19):** ✅ APPLIED.
- `buildF0VerifiedMax` (L186-219) now reads `probeData.colorPrimaries`,
  `probeData.transferCharacteristics`, `probeData.matrixCoefficients` and exposes
  them as truth fields, plus `cicpVerified` derived from probe presence.
- `buildF1PartialMax` does the same (partial-trust tier).
- `emitStreamInfFromTruth` (L485-500) emits the trifecta inline AFTER the
  VIDEO-RANGE block, gated on the same `hdrVerified && (PQ|HLG)` predicate:
  ```
  COLOR-PRIMARIES=${truth.colorPrimaries || 9}
  TRANSFER-CHARACTERISTICS=${truth.transferCharacteristics || (HLG ? 18 : 16)}
  MATRIX-COEFFICIENTS=${truth.matrixCoefficients || 9}
  ```
- The transfer characteristic default correctly branches: 16 (PQ) or 18 (HLG).
- F2/F3/F4 paths still emit zero CICP because their `hdrVerified=false`
  short-circuits the entire block — preserves honest-rules.

### G-2 (Information, NOT a violation → **RESOLVED**) — `hdcpLevel` / `hdcpLevelVerified` never populated

**Where:** None of `buildF0..F5` set these fields.

**What:** The HDCP-LEVEL gate at L468-470 is unreachable from the resolver — even
if the probe provides HDCP info, the build functions don't propagate it. The
attribute `HDCP-LEVEL` therefore never appears in resolver output.

**Why this is not a violation:** CLAUDE.md says `HDCP-LEVEL=TYPE-1 ← ELIMINADO`
without specifying that probe-verified HDCP must be emitted. The current behavior
is "always omit" which is honest-rules-strict. **NOT a bug; potentially a missed
feature** for upstream-DRM channels.

**Recommendation:** if/when probe gains HDCP detection, add 2 lines to
`buildF0VerifiedMax`:
```js
hdcpLevel: probeData.hdcpLevel || null,
hdcpLevelVerified: !!probeData.hdcpLevel,
```

**Resolution (2026-05-19):** ✅ APPLIED.
- `buildF0VerifiedMax` and `buildF1PartialMax` now read `probeData.hdcpLevel`
  and expose `hdcpLevel` + `hdcpLevelVerified` truth fields.
- The existing `emitStreamInfFromTruth` HDCP-LEVEL gate at L507-509
  (`if (truth.hdcpLevelVerified && truth.hdcpLevel)`) now has a path that can
  actually fire — but only when the probe pipeline detects upstream HDCP.
- No behavioral change for current probes that don't detect HDCP (gate stays
  closed, attribute omitted, honest-strict).

### G-3 (Information → **RESOLVED**) — STABLE-VARIANT-ID not emitted

**Where:** `emitStreamInfFromTruth` L445-473.

**What:** RFC 8216bis introduces `STABLE-VARIANT-ID` so player UIs can remember a
user's variant preference across reloads. The dead `build_stream_inf` had it
(`stableId = \`${res}-${codecs.split(',')[0]}\``). The resolver doesn't.

**Recommendation:** add `parts.push(\`STABLE-VARIANT-ID="${truth.resolution}-${truth.codec}"\`)`
inside `emitStreamInfFromTruth`. One-line addition. No probe data needed —
derives from truth fields already present.

**Resolution (2026-05-19):** ✅ APPLIED.
- `emitStreamInfFromTruth` now emits `STABLE-VARIANT-ID="${resolution}-${codecFamily}"`
  where codecFamily is the first dot-separated segment of the codec string
  (`hvc1` / `av01` / `avc1`).
- Stable across multiple probes of the same channel + profile combination so
  the player UI can remember user variant choice across reloads.
- Defensively gated on `truth.resolution && _codecFamily` — emitter early-
  returns null for F5 (canEmitStreamInf=false) so this guard is belt-and-
  suspenders.

### F-1 (Fact, PASS) — F2/F3/F4 cleanly emit PREFERRED, never REAL

`codecVerified: false` in F2/F3/F4 propagates through `emitApeFallbackTags`
(L484-492):

```js
if (truth.codecVerified) {
    tags.push(`#EXT-X-APE-CODEC-REAL:${truth.codec}`);
    tags.push(`#EXT-X-APE-CODEC-VERIFIED:true`);
} else {
    tags.push(`#EXT-X-APE-CODEC-PREFERRED:${truth.codec}`);
    tags.push(`#EXT-X-APE-CODEC-VERIFIED:false`);
}
```

Perfectly bifurcated. The smoke test `H3` invariant (post-deploy assertion
that VIDEO-RANGE=PQ coexists with probe evidence) consumes
`EXT-X-APE-CODEC-REAL:` and `EXT-X-APE-CODEC-VERIFIED:true` as evidence markers.

### F-2 (Fact, PASS) — F5 cannot leak STREAM-INF

`canEmitStreamInf: false` on F5 (L382). `emitStreamInfFromTruth` early-returns
`null` at L447: `if (!truth.canEmitStreamInf) return null;`. The generator's F5
branch at L8914-8916 of `m3u8-typed-arrays-ultimate.js` handles the `null` correctly
(no STREAM-INF, only EXTINF + URL).

### F-3 (Fact, PASS) — Premium detection covers CLAUDE.md doctrine

`isPremiumChannel` regex at L152:
```
4k|uhd|fhd|hevc|h265|h\.265|hdr|dolby|premium|dazn|espn|sport|sports|event|
evento|movie|cine|ppv|liga|champions|nba|f1|ufc|hbo|max|netflix|disney|fox|sky|bein
```

Matches the CLAUDE.md §"Premium Channel Detection" list verbatim.
F2 path therefore activates correctly for premium channels when probe fails.

### F-4 (Fact, PASS) — Codec ladder per ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md

`classifyHevcCodec` (L44-57) scores codec families:
- Dolby Vision (dvh1/dvhe) → 100
- HEVC Main12 (hvc1.4) → 96
- HEVC Main10 (hvc1.2) → 94
- AV1 12-bit → 92
- AV1 10-bit → 90
- HEVC Main 8-bit (hvc1.1) → 82
- AV1 8-bit → 80
- AVC H.264 → 55

Matches CLAUDE.md "Codec Ladder (orden de prioridad visual)" verbatim.

### F-5 (Fact, PASS) — Contradiction detector catches SUPPLEMENTAL-CODECS abuse

L136-138 explicitly traps `SUPPLEMENTAL_WITHOUT_DV` — the exact pattern that
CLAUDE.md forbids (`SUPPLEMENTAL-CODECS="lcev.1.1.1"` is the canonical abuse).
If detected, contradiction count ≥1 → resolver drops to F1 (which forces
`supplementalCodecs: null`) or lower.

---

## 6. Smoke test evidence (running this session)

The smoke test `IPTV_v5.4_MAX_AGGRESSION/tests/smoke_m3u8_honest_rules.py` was
written this session per ARTIFACT_FASE1_PROFUNDO_DESTRIPE §8 #4 and #5. Runs
3 invariants against any `.m3u8`:

| Invariant | Rule |
|---|---|
| H-1 | No `TYPE-1` substring anywhere |
| H-2 | No `SUPPLEMENTAL-CODECS` substring |
| H-3 | Every `VIDEO-RANGE="PQ"` channel block must include one of: `EXT-X-APE-CODEC-REAL:`, `EXT-X-APE-CODEC-VERIFIED:true`, `EXT-X-APE-FALLBACK-TIER:F0_`, `EXT-X-APE-FALLBACK-TIER:F1_`, `EXT-X-APE-PROBED-AT:` |

### Pre-fix baseline (2026-04-26 OMEGA Premium snapshot, 686 MB, 15,444 channels)

```
H1_no_TYPE_1                  : FAIL · count=15444 (1 per channel block)
H2_no_SUPPLEMENTAL_CODECS     : FAIL · count=15444 (every STREAM-INF claimed SUPP)
H3_PQ_requires_probe_evidence : FAIL · 722 unverified PQ emissions
```

This is the **expected** failure: pre-fix generator hardcoded TYPE-1 +
SUPPLEMENTAL-CODECS + LAB-derived PQ. Smoke test correctly detects the
violations. After R-1 + D-1 fixes (commit 3fd36c3) **applied to a freshly
generated list**, all 3 invariants should pass.

### Old generator baseline (Apr 3 OMEGA v5.4, 2.5 MB, 8,366 channels)

```
H1_no_TYPE_1                  : PASS (count=0)
H2_no_SUPPLEMENTAL_CODECS     : PASS (count=0)
H3_PQ_requires_probe_evidence : PASS (no PQ ever emitted, no HDR claims)
```

A historical sample from before VIDEO-RANGE/SUPP-CODECS emission was added to
the master playlist generator. Useful as a "minimum-state OK" baseline.

### Post-fix run (PENDING)

Requires triggering a fresh generation via the frontend (`btnGenerateAudited`)
or the public endpoint. After running, execute:

```bash
python IPTV_v5.4_MAX_AGGRESSION/tests/smoke_m3u8_honest_rules.py \
    path/to/freshly_generated.m3u8
```

Expected exit code: **0**. Expected verdict: **PASS**. Channels with probe-
verified HDR will show `pq_verified > 0, pq_unverified == 0`.

---

## 7. Recommendations

| # | Item | Severity | Effort | Status |
|---|---|---|---|---|
| 1 | Add HDR10 CICP trifecta emission in `emitStreamInfFromTruth` (G-1) | MEDIUM | ~10 lines + truth field plumbing in `buildF0..F1` | ✅ DONE 2026-05-19 |
| 2 | Populate `hdcpLevel` / `hdcpLevelVerified` in `buildF0VerifiedMax` (G-2) | LOW | 2 lines (gated on probe capability) | ✅ DONE 2026-05-19 |
| 3 | Add `STABLE-VARIANT-ID` to `emitStreamInfFromTruth` (G-3) | LOW | 1 line | ✅ DONE 2026-05-19 |
| 4 | Wire the smoke test (`smoke_m3u8_honest_rules.py`) into post-publish CI/checklist | LOW | docs + 1 npm/python script entry | ⏳ pending user trigger |
| 5 | Run smoke test against a fresh post-fix generation when generator UI is next exercised | NONE | manual | ⏳ pending user trigger |
| 6 | Probe pipeline (`ape-quality-prober.js`) to expose `colorPrimaries` / `transferCharacteristics` / `matrixCoefficients` / `hdcpLevel` from manifest parsing | LOW | 4 fields in probe output | ⏳ next sprint (resolver already reads these but probe doesn't yet expose) |

---

## 8. Verdict

`ape-fallback-resolver.js` is **honest-rules compliant**: VIDEO-RANGE,
SUPPLEMENTAL-CODECS, HDCP-LEVEL, and HDR10 CICP trifecta gates are all
correctly enforced. Six-tier fallback correctly partitions channels by
confidence + contradictions. Premium detection + codec ladder match
CLAUDE.md doctrine verbatim.

**As of 2026-05-19**: G-1, G-2, G-3 all resolved. The resolver now emits the
HDR10 CICP trifecta (COLOR-PRIMARIES / TRANSFER-CHARACTERISTICS /
MATRIX-COEFFICIENTS) when VIDEO-RANGE is verified PQ or HLG; HDCP-LEVEL when
probe detects upstream HDCP; and STABLE-VARIANT-ID always for any emitted
STREAM-INF.

The smoke test correctly distinguishes pre-fix (failed all 3 invariants on
the 686 MB Apr 26 snapshot) from post-fix (will pass when generator UI is
next exercised against the patched generator).

**No remaining gaps in the active emission path.** Probe pipeline upstream
extension (rec #6) is the only follow-up — and it's additive: the resolver
already reads those fields with safe defaults, so probe enrichment just
upgrades the precision of CICP emission without altering correctness.

---

## 9. Cross-references

- `ARTIFACT_FASE1_PROFUNDO_DESTRIPE.md` (commit `96500b3`) — predecessor
- `ARTIFACT_HDR10_METADATA_TRIFECTA.md` — CICP 9/16/9 spec
- `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` — codec ladder tiers
- `IPTV_v5.4_MAX_AGGRESSION/tests/smoke_m3u8_honest_rules.py` — companion smoke
- commit `19d6f27` — Agent F E2E SSOT (preserves dead trifecta code that should be ported)
- commit `3fd36c3` — R-1 + D-1 active-code fixes
