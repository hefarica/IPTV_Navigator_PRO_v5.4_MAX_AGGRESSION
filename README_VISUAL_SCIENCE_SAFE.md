# README — APE Visual Extreme Science-Safe

Measurable, reversible, additive visual-quality layer for the VPS manifest plane. **No production is touched
by integration.** No deploy, no push, no nginx reload happen automatically.

## What it does (honestly)
The VPS helps the player pick the **best compatible** representation (HEVC/4K-first) **without** removing the
AVC fallback, **without** fake HDR/4K/LCEVC, **without** rewriting URLs, and **without** raising freeze risk.
It does **not** create pixels and does **not** post-process frames. Real per-frame AI is on-device only.

## Files
- `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter_visual_science_safe.lua` — variant ordering, AVC preserved, passthrough on error.
- `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bandwidth_reactor_science_safe.lua` — de-escalates on bandwidth drop.
- `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_profile_resolver_science_safe.lua` — header + devstate layers, REUSES the live resolver.
- `IPTV_v5.4_MAX_AGGRESSION/vps/ape-uhdx/channel_profiles.example.json` — example map (not production data).
- `tools/quality/hls_science_lint.py` — HLS science linter (exit 1 on HIGH).
- `tools/quality/benchmark_vmaf_ab.sh` — VMAF/SSIM/PSNR A/B benchmark.
- `tools/quality/sandbox_harness.mjs`, `reactor_harness.mjs` — logic harnesses.
- `tools/quality/ci_science_safe_checks.sh` — one-shot CI gate.

## How to test (local, no production)
```bash
# 1. lint a manifest
python tools/quality/hls_science_lint.py tools/quality/testdata/master_sample.m3u8
# 2. prove the decision logic
node tools/quality/sandbox_harness.mjs
node tools/quality/reactor_harness.mjs
# 3. measure an A/B pair (needs ffmpeg with libvmaf)
bash tools/quality/benchmark_vmaf_ab.sh --before ref.mp4 --after candidate.mp4 --out reports/vmaf_ab
# 4. run the whole gate
bash tools/quality/ci_science_safe_checks.sh
```

## How to measure (evidence, not promises)
Capture a real before/after pair (the variant the player picks without vs with the science-safe ordering),
run the benchmark, and read VMAF/SSIM/PSNR. Only claim a gain the metrics show. No metric → `UNVERIFIED`.
There is **no** "2000%" claim; the tool-validation A/B shows ΔVMAF +73.48 between a poor and a good variant,
which is the scientific way to express "selecting the better variant helps".

## How to activate (production — manual, gated)
1. Review `docs/superpowers/nginx_patch_snippet_science_safe.conf` (hooks are commented out).
2. Validate Lua on the VPS: `resty -e 'require("...")'` / `luac -p ...`.
3. `sudo nginx -t` then activate **only** through `tools/cicd/deploy_vps.sh` (backup + nginx -t + rollback).
4. `deploy_science_safe.sh --activate-reviewed` is intentionally BLOCKED.

## How to rollback
Integration is pure-additive (new files only; live files byte-identical). Rollback = remove the new files or
never wire the hooks. If wired later, the CI/CD path auto-rolls-back on health failure.

## Real limitations
- The VPS cannot upscale/transcode without breaking FREEZELESS (out of scope).
- On-device display is the real ceiling (e.g. an SDR-only panel ignores HDR).
- Local validation is offline; live ngx/ABR behavior is `PENDING_REAL_VPS`.
