# Pre-Flight Report — Visual Extreme Science-Safe (2026-06-19)

## Verdict: **PASS (additive, reversible) — production activation PENDING_REAL_VPS**
No production touched. No deploy. No push. No nginx reload. AVC fallback preserved. URLs untouched.
No "2000%" claim. Live Lua files byte-identical.

## Package inventory (`APE_VISUAL_EXTREME_SCIENCE_SAFE_2000_20260619.zip`, 16,147 bytes)
13/13 expected files present → **NOT PACKAGE_INCOMPLETE**. ZIP integrity `unzip -t` OK.
Static validation: `python -m py_compile hls_science_lint.py` PASS · `bash -n` PASS on both scripts.

## Package audit (vs the prior unsafe package)
| Concern | Prior package | This Science-Safe package |
|---|---|---|
| AVC variants | could purge | **preserved by default** (verified in harness) |
| Bandwidth reactor | raised bitrate as EWMA dropped | **de-escalates** as EWMA drops (verified) |
| Prefetch | fixed 8 from body filter | adaptive/limited/opt-in |
| Live Lua | direct replace | `deploy_science_safe.sh --activate-reviewed` **BLOCKED**; install-only adds new files |
| Quality claim | "extreme" unmeasured | VMAF/SSIM/PSNR harness + linter |
No toxic headers, no fake LCEVC, no fake-4K/8K public claims, no URL rewrite found in the package.

## Diff vs live repo (conceptual — additive only)
- Live `vps/nginx/lua/combined_body_filter.lua` (sha256 `31afd6d1…`) — **UNCHANGED**.
- Live `vps/nginx/lua/bandwidth_reactor.lua` (sha256 `ad187e99…`) — **UNCHANGED**.
- Live `vps/nginx/lua/ape_profile_resolver.lua` — **UNCHANGED**; the new science-safe resolver **REUSES** it
  (`pcall(require,'ape_profile_resolver')`) and only adds header + devstate layers (OMEGA-NO-DELETE).
- Live nginx hooks — **UNCHANGED** (the snippet is review-only, hooks commented out).

## Files added (NEW)
```
IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter_visual_science_safe.lua
IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bandwidth_reactor_science_safe.lua
IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_profile_resolver_science_safe.lua
IPTV_v5.4_MAX_AGGRESSION/vps/ape-uhdx/channel_profiles.example.json
tools/quality/hls_science_lint.py            (extended: 5 -> 15+ checks)
tools/quality/benchmark_vmaf_ab.sh           (--before/--after/--out + positional)
tools/quality/sandbox_harness.mjs            (profile + HLS mutation; Node)
tools/quality/reactor_harness.mjs            (reactor monotonicity; Node)
tools/quality/testdata/*.m3u8                (1 clean + 6 adversarial fixtures)
tools/quality/ci_science_safe_checks.sh      (CI gate)
docs/superpowers/plans/2026-06-19-visual-extreme-science-safe-implementation.md
docs/superpowers/reports/visual-extreme-science-safe-prefight-report.md
docs/superpowers/diagrams/visual-science-safe-loop.mmd
docs/superpowers/nginx_patch_snippet_science_safe.conf  (review-only)
README_VISUAL_SCIENCE_SAFE.md
```
Files modified: **none** (the live tree is untouched; only new files added).
Files rejected: the prior package's AVC-purge / 8-seg prefetch / full-replacement / custom-ladder / floor
elevation (see plan).

## Tests executed + results
- `unzip -t` package → OK. `py_compile` linter → OK. `bash -n` both scripts → OK.
- Linter on 7 manifests → clean=PASS; hev1/4K-low-level/toxic/LCEVC/wrapped-URL=BLOCK(exit1); no-AVC=WARN.
- A/B benchmark (synthetic): ΔVMAF **+73.48** (poor 24.11 → good 97.59), PSNR 31.97→50.28, SSIM 0.974→0.9998.
- `sandbox_harness.mjs` → **11/11 PASS**. `reactor_harness.mjs` → **5/5 PASS**.
- Lua structural smoke check → BALANCED (LUAC_UNAVAILABLE; authoritative on VPS).

## Risks / remaining
- ngx/OpenResty runtime behavior of the new Lua = `PENDING_REAL_VPS` (no local resty).
- Map-format reconciliation: live resolver reads `ape_profile_map.json` (`by_streamid`); the brief's
  `channel_profiles.json` (`streams`) is provided as a template — generator should emit it, or an adapter
  bridges the two. WARN, not BLOCK.
- Real per-channel quality delta = needs provider A/B captures (`UNVERIFIED`).

## State
PASS for local additive integration. Production activation requires `nginx -t` + CI/CD deploy with rollback
and is **not** performed here.
