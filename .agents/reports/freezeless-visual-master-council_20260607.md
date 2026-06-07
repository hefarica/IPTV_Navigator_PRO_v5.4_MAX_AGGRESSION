# Freezeless Visual Master Council — Verdict Report

- **Date:** 2026-06-07
- **Target:** uncommitted diff → `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (51 ins / 23 del)
- **Mode:** audit · **Scope:** full (13 PhDs dispatched in parallel)
- **Theme of diff:** "Image1-parity / Lost=0" — HDR peak honesty + MEMC FPS honesty

## FINAL COUNCIL VERDICT: 🔴 BLOCK
The intent is excellent and strongly endorsed (freezeless + honesty gains). It must NOT ship until the double-decimal FRAME-RATE bug is fixed — that bug re-introduces the very freeze/variant-drop risk the diff set out to remove, for fractional-fps channels.

## Vote tally
| Verdict | PhDs |
|---|---|
| 🔴 BLOCK | S12 QA/FFmpeg |
| 🟡 WARN | S1 HLS Architect · S4 Color HDR · S9 Player Compat · S11 Observability |
| 🟢 PASS | S2 LL-HLS · S3 Codec · S5 QoE · S6 Nginx · S7 SRE · S8 Network · S10 Security · S13 Repo Surgeon |

## Decisive finding (BLOCK) — verified in code
Two inline STREAM-INF emitters concatenate a literal `.000` onto a value that, after this diff, can be fractional (probe-derived):

- `m3u8-typed-arrays-ultimate.js:9405` → `FRAME-RATE=${_mqFps}.000`
- `m3u8-typed-arrays-ultimate.js:9581` → `FRAME-RATE=${_fps796_csv}.000`

Real broadcast probes return 59.94 / 29.97 / 23.976 → emits `FRAME-RATE=59.94.000` (malformed decimal). Strict parsers (hls.js strict, ExoPlayer HlsMediaSource) reject the STREAM-INF line and silently drop the variant → playback failure / freeze. Pre-diff this was impossible (fps was forced to integer 120).

The third path is already correct and is the fix pattern to copy:
- `ape-fallback-resolver.js:523` → `FRAME-RATE=${Number(truth.frameRate || 30).toFixed(3)}` ✅

### Required fix (1 line each, copies the existing safe pattern)
- L9405: `FRAME-RATE=${Number(_mqFps).toFixed(3)}`
- L9581: `FRAME-RATE=${Number(_fps796_csv).toFixed(3)}`

## Secondary findings (WARN — follow-up, non-blocking)
- **S4 (HDR coherence):** peak/MaxCLL now 1000 but `MASTERING-DISPLAY` still encodes `L(10000,...)` and `CONTRAST 10000000:1`. Some tone-mappers treat the mastering-display L-max as authoritative → unnecessary compression. Align L-max to 1000 (and recompute contrast) OR document the conservative mismatch as intentional.
- **S1 / S9 (misleading comment):** in the `_fps796_csv` path the comment claims "sin probe → 120", but upstream `_fps796 = _probeData?.frameRate || cfg.fps || 60` makes 60 the no-probe value (the 120 fallback is unreachable). P1–P5 no-probe channels emit 60, not 120. Fix the comment; behavior (60) is fine.
- **S1 (path divergence):** three emitters now declare different no-probe FRAME-RATE (120 / 120 / 60). Harmless for single-STREAM-INF-per-channel output, but a maintenance trap. Reconcile.
- **S11 (observability):** no manifest marker distinguishes probe-fps vs default-fps. Add `#EXT-X-APE-FPS-SOURCE:probe|default-120|default-60` (private tag, 0 player cost) so dashboards can see which path fired.

## Pillar deltas (consensus)
- **FREEZE-Δ:** strongly positive for probed integer-fps channels (kills 403 dropped frames/5min vsync mismatch). NEGATIVE for fractional-fps channels until the double-decimal bug is fixed → net BLOCK.
- **VISUAL-Δ:** neutral-to-positive. HDR values are broadcast-honest; HDR `X-APE-*` tags are player-invisible today (RFC §6.3.1). MEMC-via-FRAME-RATE premise is architecturally weak (S9: HW MEMC is display-side, not manifest-driven) — so the "lost 120" carries near-zero real visual cost.

## Gates
- `node -c` ×3 generator trio → Exit 0 ✅ (syntax valid; the bug is semantic, not syntactic)
- OMEGA-NO-DELETE → satisfied (logic replaced by superior, +28 net lines) ✅
- No toxic headers / no HDCP hardcode / no fake codec introduced ✅

## Recommendation
Apply the 2-line `toFixed(3)` fix → re-run `node -c` → council clears to PASS. Address S4/S1/S9/S11 WARNs in a follow-up. Then the diff is a clean freezeless + honesty win.
