# Visual Extreme — Science-Safe Implementation Plan (2026-06-19)

## Context
The owner asked to integrate "extreme visual enhancement" measurably, reversibly and safely from the
package `APE_VISUAL_EXTREME_SCIENCE_SAFE_2000_20260619.zip`, **without** breaking FREEZELESS, SHIELDED,
URL-verbatim, the live Nginx/Lua, player compatibility, or production. Mandate: **evidence, not promises**;
anything unmeasured is marked `UNVERIFIED`. The "2000%" claim is explicitly **not** made (no A/B benchmark
on representative provider samples exists to support it).

## What is implemented (additive, no production touched)
- **HLS science linter** (`tools/quality/hls_science_lint.py`) — 15+ checks: toxic headers, fake LCEVC,
  hev1-in-STREAM-INF (GOLDEN RULE), level<resolution (Ley Cardinal 1), no-AVC-fallback, wrapped/non-verbatim
  URL (SHIELDED), starved 4K/8K, malformed/unquoted codecs, duplicates, incoherent bandwidth, misplaced
  `#EXT-X-APE-*`, plus the objective per-variant **bits-per-pixel-per-frame** density. Exit 1 on any HIGH.
- **A/B benchmark** (`tools/quality/benchmark_vmaf_ab.sh`) — VMAF + SSIM + PSNR via ffmpeg/libvmaf, with an
  honest `VMAF_UNAVAILABLE` fallback to SSIM/PSNR.
- **Science-Safe Lua (NEW files, live ones untouched)**:
  `vps/nginx/lua/combined_body_filter_visual_science_safe.lua` (variant ordering, **AVC preserved by default**,
  passthrough on error, no fake metadata) and `vps/nginx/lua/bandwidth_reactor_science_safe.lua`
  (de-escalates as throughput drops — the inverse of the previous unsafe reactor).
- **Profile resolver (additive, REUSES the live module)**:
  `vps/nginx/lua/ape_profile_resolver_science_safe.lua` adds header + `?profile=` + **devstate** layers around
  the existing live `ape_profile_resolver.lua` (stream_id map) → default `P2`. OMEGA-NO-DELETE respected.
- **Map template**: `vps/ape-uhdx/channel_profiles.example.json` (example only, no invented production profiles).
- **Harnesses** (no Lua runtime locally → Node ports): `sandbox_harness.mjs` (profile + HLS mutation),
  `reactor_harness.mjs` (reactor monotonicity).

## What is rejected (BLOCK — from the prior council reviews)
AVC purge · 8-segment infinite prefetch (509/self-DoS) · wholesale replacement of the live body filter
(NO-STRIP) · custom codec ladder that misranks AV1-10/Main12 · floor elevation without a per-channel audit ·
VPS transcode · fake 4K/8K/HDR public claims · any URL rewrite.

## Measured evidence (real, reproducible)
- Linter: 7-manifest evidence — clean PASS, and BLOCK on hev1/4K-low-level/toxic-header/fake-LCEVC/wrapped-URL,
  WARN on no-AVC-fallback.
- Benchmark (synthetic A/B, tool validation): poor variant **VMAF 24.11 / PSNR 31.97 / SSIM 0.974** vs good
  variant **VMAF 97.59 / PSNR 50.28 / SSIM 0.9998** → **ΔVMAF +73.48** (60 frames). Proves the measurement
  methodology works and that surfacing the better variant is a large, *measurable* gain.
- Sandbox harness: 11/11 PASS (profile priority incl. corrupt-JSON/non-live safe; AVC preserved; 4K dominant;
  4K Main10 > 1080p Dolby Vision). Reactor harness: 5/5 PASS (monotonic de-escalation).

## UNVERIFIED (honest)
- The system's **real per-channel VMAF gain** — needs before/after captures of the actual provider variants
  (the player would have picked vs the science-safe ordering). The +73.48 above is a synthetic tool validation.
- **Lua runtime/ngx integration** — `LUAC_UNAVAILABLE` locally; authoritative `resty -e` / `luac -p` + live
  ABR behavior is `PENDING_REAL_VPS`.
- **QoE deltas** (rebuffer/startup/error-rate) per player — need on-device capture.

## Why no per-frame AI from the VPS
The VPS can only help the player **select a better compatible representation** (manifest mutation). It does
**not** create pixels and does **not** post-process frames. Real per-frame AI (ESRGAN/RIFE/CAR-CNN) must run
**on-device** (APK/ARA or a player with native filters), or via server-side transcode — which is out of scope
(latency/cost/FREEZELESS risk).

## Tests required before any production activation
`nginx -t` PASS · `resty -e`/`luac -p` on the 3 science-safe Lua · linter PASS on real sample manifests ·
A/B benchmark on real captures · QoE monitor showing no rebuffer/startup regression. Activate ONLY through
`tools/cicd/deploy_vps.sh` (backup + nginx -t + rollback). `deploy_science_safe.sh --activate-reviewed` is
BLOCKED by design.

## Rollback
Pure additive: new files only, live files byte-identical (sha256 recorded in the prefight report). Rollback =
delete the new files / never wire the hooks. If wired later, the CI/CD path auto-rolls-back on failure.
