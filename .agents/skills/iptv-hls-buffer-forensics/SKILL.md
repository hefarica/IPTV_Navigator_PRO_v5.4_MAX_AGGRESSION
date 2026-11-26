---
name: iptv-hls-buffer-forensics
description: "Diagnose and fix IPTV/HLS rebuffering caused by buffer targets, ExoPlayer load_control, segment duration, or EXT-X-TARGETDURATION mismatch. Use when analyzing per-channel rebuffer ratios, choosing X-Buffer-Target/minBufferMs/maxBufferMs, validating 2/4/6 s segments, or applying manifest and buffer fixes in an isolated copy with regression tests."
---

# IPTV HLS Buffer Forensics

Diagnose rebuffering as a timing and buffer problem, not as a bitrate problem. Preserve image quality: never lower a channel's bitrate to improve a ratio. Never promise an infinite buffer, zero freeze or a fix without per-channel evidence.

For list-wide IPTV audits, 4K/6K metadata and URL preservation, use the existing `ape-iptv-auditoria-4k-premium6k` skill. This skill covers the narrower layer: buffer targets, ExoPlayer LoadControl, segment duration and `EXT-X-TARGETDURATION`.

## Workflow

1. Collect per-channel evidence.
2. Classify the cause.
3. Choose buffer values with a RAM budget.
4. Fix `TARGETDURATION` from the real segment duration.
5. Apply in an isolated copy.
6. Run the contract test and the existing suites.
7. Deliver the incremental patch and declare limits.

## 1. Collect evidence

Do not reason from a global average. A single channel can dominate the aggregate.

| Data | Why it matters |
|---|---|
| Rebuffers and requests per channel | Separates a real channel defect from a global average |
| Requests per channel | Fewer than ~100 requests is an inconclusive sample |
| Segment duration (2, 4 or 6 s) | Determines how many segments fit in the target |
| Declared bitrate | Determines RAM per second of buffer |
| `X-Buffer-Target` | Player target in ms |
| `load_control.minBufferMs` / `maxBufferMs` | ExoPlayer working floor and ceiling |
| `bufferForPlaybackAfterRebufferMs` | Whether the player resumes in a near-empty buffer |
| Gate threshold | Use the repository's value; do not invent one |

A channel with 35 rebuffers in 1,938 requests is a real signal. A channel with 2 in 28 is not enough to tune. State the sample size.

## 2. Classify the cause

| Pattern | Likely cause | First check |
|---|---|---|
| One channel high, others zero | Provider/CDN, variant or segment timing | Throughput, variant, `TARGETDURATION` |
| All channels drift upward | Player buffer or network cache | `load_control`, `X-Buffer-Target` |
| Rebuffers after every stall | Resume threshold too low | `bufferForPlaybackAfterRebufferMs` |
| Rebuffers only on 4/6 s variants | `TARGETDURATION` fixed at 2 | Manifest timing |
| Buffer drains slowly over minutes | Sustained throughput below bitrate | Deficit, not buffer size |
| Zapping slow but playback stable | Initial buffer too high | `bufferForPlaybackMs`, target |

A larger buffer buys time. It does not create throughput. If the provider delivers below real time, raising the target only delays the stall.

## 3. Choose buffer values

Run the calculator instead of guessing:

```bash
python3 "<skill-dir>/scripts/buffer_budget.py" --bitrate-mbps 50 --segment-s 2
```

Policy curve by declared bitrate:

| Bitrate | Target |
|---|---|
| ≤ 25 Mbps | 30 s |
| 25–80 Mbps | 24 s |
| 80–150 Mbps | 20 s |
| > 150 Mbps | 12–15 s |

Derive the rest from the target:

| Field | Value |
|---|---|
| `X-Buffer-Target` | `target_s * 1000` |
| `X-Buffer-Min` | `round(target_s * 0.625) * 1000` |
| `X-Buffer-Max` | `target_s * 2 * 1000` |
| ExoPlayer `minBufferMs` | `round(target_s * 1.25) * 1000` |
| ExoPlayer `maxBufferMs` | `round(target_s * 3.75) * 1000` |
| `bufferForPlaybackAfterRebufferMs` | `3000` |

At 24 s this is exactly 24.000 / 15.000 / 48.000 and 30.000 / 90.000 / 3.000.

**Cross-segment rule:** 24 s is the best single target for 2, 4 and 6 s segments: 12, 6 and 4 segments respectively. Below 12 s the margin collapses. For 6 s segments prefer 30 s. For bitrates above 80 Mbps prefer 20 s to keep RAM bounded.

Do not confuse the layers:

- `X-Buffer-Target` is not the startup buffer.
- `bufferForPlaybackMs` is the startup buffer.
- `minBufferMs` is the working floor, not the startup threshold.
- `maxBufferMs` is a ceiling, not a guarantee.
- `bufferForPlaybackAfterRebufferMs: 1000` is self-defeating: it resumes with almost nothing and re-stalls.

Read `references/buffer-semantics.md` for the field table, RAM table and throughput-deficit math.

## 4. Fix TARGETDURATION

`#EXT-X-TARGETDURATION` is the maximum segment duration, as an integer. It must be greater than or equal to every `#EXTINF`. A fixed 2 with 4 or 6 s segments makes the player reload before the segment exists; the symptom looks like network rebuffering.

Resolve it from the real source, in this order: explicit option → master profile `settings.segment_duration_s` → flat profile field → fallback 2.

```js
function resolveTargetDuration(options = {}) {
    const profiles = options.bulletproof_profiles || {};
    const masterId = options.masterProfile || 'P0';
    const profile = profiles[masterId] || {};
    const settings = profile.settings || {};
    const candidates = [
        options.segment_duration_s,
        options.segment_duration,
        settings.segment_duration_s,
        settings.segment_duration,
        profile.segment_duration_s,
        profile.segment_duration
    ];
    for (const raw of candidates) {
        if (raw === null || raw === undefined || raw === '') continue;
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return Math.max(1, Math.ceil(n));
    }
    return 2;
}
```

Use `${targetDuration}` in the template, export the resolver for tests, and use `Math.ceil` (4.5 → 5). Do not add `TARGETDURATION` to a Master Playlist that correctly omits it; fix the branch that already emits it.

Run the heuristic audit before editing:

```bash
python3 "<skill-dir>/scripts/audit_hls_buffer.py" /path/to/repo
```

It flags literal values, stale values, static headers, resume thresholds below 1 s, targets below 12 s and oversized LoadControl. It is a source scan, not an HLS validator.

Audit every generator file, not only the one you plan to edit: a repo often has a main generator, a wrapper, an error handler and a no-proxy variant. The scanner is file-scoped and skips test files by default; use `--include-tests` when the fixture itself is the target.

Read `references/targetduration-rules.md` for the RFC rule, master/media distinction and common defects.

## 5. Apply in an isolated copy

Never test on production, the deployed VPS, the APK or the user's private list.

```bash
git worktree add --detach /tmp/check HEAD
cd /tmp/check
git apply --check previous.patch
git apply previous.patch
git apply --check buffer.patch
git apply buffer.patch
```

Generate patches without ANSI color:

```bash
git --no-pager diff --no-color --binary -- path/to/generator.js path/to/server.js > buffer.patch
git --no-pager diff --no-color --no-index -- /dev/null path/to/test.js >> buffer.patch || true
git apply --check --reverse buffer.patch
```

Do not commit, push or deploy unless the user explicitly asks. Keep the original clone untouched.

## 6. Run the regression

Use the generic harness with the real generator, JIT and LAB:

```bash
node "<skill-dir>/scripts/check_buffer_contract.js" \
  --generator path/to/m3u8-typed-arrays-ultimate.js \
  --jit path/to/ape-jit/server.js \
  --lab path/to/APE_LAB_CANONICAL_BULLETPROOF.json \
  --segments 2,4,6
```

It verifies 2/4/6 resolution, 4.5 → 5, fallbacks, the emitted tag, the three `load_control` paths and the JIT floor.

Then run the repository's own suites: PHP engine, panel, queue worker, conformance and CMAF with a local fixture. Report exact PASS/FAIL counts. A new unit test passing while the panel or worker fails is not a green result.

Add a negative fixture: a file with `#EXT-X-TARGETDURATION:2` and `segment_duration: 4` must produce `TARGETDURATION_STALE`.

Run syntax checks (`php -l`, `bash -n`, `node --check`), ShellCheck and `git diff --check`.

Read `references/regression-checklist.md` for the full sequence, patch hygiene and evidence list.

## 7. Deliver

Deliver:

- the incremental patch, with SHA-256;
- a short report with the exact values, test counts and limits;
- the new regression test;
- a clear list of what was not applied.

Declare separately: static audit, contract tests, local multimedia fixture, APK/SHIM/VPS deployment, per-channel overrides and production list changes. Do not present a local fixture as provider evidence or a patch as a deployment.

## Resources

- `scripts/buffer_budget.py` — target, LoadControl, RAM and segment math.
- `scripts/audit_hls_buffer.py` — heuristic source audit.
- `scripts/check_buffer_contract.js` — generator/JIT regression harness.
- `references/buffer-semantics.md` — field semantics, RAM table, throughput deficit.
- `references/targetduration-rules.md` — RFC rule, resolver, defects.
- `references/regression-checklist.md` — isolation, patch composition, suites, evidence.
