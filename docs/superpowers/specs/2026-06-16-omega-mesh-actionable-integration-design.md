# OMEGA Mesh Actionable Integration — Design (SPEC #1)

> Brainstormed + approved 2026-06-16. Sub-project 1 of 2 (the other = SPEC #2 ARA daemon).
> Audit basis: 4/7 engines orphaned, NeuroBuffer partial-decorative, visual_profiles.json
> not synced by CI/CD. This spec makes the LIVE mesh emit **actionable** visual directives.

**Goal:** The live feed-forward mesh (`ape_mesh_presets`) emits **actionable** per-channel visual
directives every SSE tick — EXTVLCOPT/KODIPROP that VLC/Kodi actually apply + `device_settings`
the ADB daemon actually applies — driven by the `visual_profiles.json` P0–P6 policy at **maximum
aggression** with **QoE-guarded de-escalation** (FREEZELESS). Wires the orphaned AISuperRes +
ModemPriority + NeuroBuffer.buildVlcOpts, and flows `visual_profiles.json` to the VPS via CI/CD.

**Architecture:** Extend the existing live mesh (`vps/prisma/lib/ape_mesh.php`, called by the F2/F3
endpoints) — NOT revive the dead `resilience_integration_shim.php`. The shim's chaining pattern is
**absorbed** into `ape_mesh_presets` (the live fan-out). A new profile selector reads the
`visual_profiles.json` SSOT to pick the per-channel P-level; engines are modulated by that profile.
All output stays player-blind-safe (truth-guards intact); only EXTVLCOPT/KODIPROP + the daemon
allowlist `device_settings` are "actionable".

**Tech stack:** PHP 7/8 (mesh + engines), JSON (visual_profiles SSOT), the existing CI/CD
(`tools/cicd/vps_deploy_map.json` + `deploy_vps.ps1/.sh`), the live SSE (`ape-feedforward-stream.php`).

---

## Why this plane (the honest model)

The real client plays via **Xray-directo** → bypasses the VPS. Only two things reach that player:
**(A)** EXTVLCOPT/KODIPROP carried *in the list* (VLC/Kodi apply them), and **(B)** `device_settings`
the on-device ADB daemon applies (allowlist: `match_content_frame_rate`, `hdr_conversion_mode`,
`minimal_post_processing_allowed`, `display_color_mode`). The VPS-side PHP enrichment
(`resolve_quality_unified` / Lua body filter) the bypassed client never sees. **SPEC #1 delivers
plane A + the device-reachable part of plane B (device_settings)**; the on-device executor that
*applies* the rest is SPEC #2 (the ARA). This spec keeps everything reachable **today** via CI/CD.

## Components (each one focused, testable)

### 1. Profile selector — `ape_mesh_profile_for($chId, $streamInfo, $health)` (new, in `ape_mesh.php`)
- Reads `/etc/ape-uhdx/visual_profiles.json` once, caches in a static (5 s TTL like `ape_qoe_state_by_channel`). Path constant mirrors `resolve_quality_unified.php` (`/etc/ape-uhdx/visual_profiles.json`).
- **Default = maximum aggression**: pick the highest experimental profile the stream allows
  (`P4_CRYSTAL_UHD_EXTREME` / `P6_CHINA_BOX_8K_ULTRA_AGGRESSIVE` family), per the JSON's own
  `china_box_propagation` scaling.
- **QoE de-escalation (FREEZELESS)**: lower the P-level when `$health['riskScore']` is high — reuse
  the existing `ape_risk_from_qoe` thresholds. risk>30 → step down one tier; risk>60 → step down to
  a safe tier (P1/P2). This is the same de-escalation philosophy as Phase G, applied to visual intensity.
- Returns `['level'=>'P4', 'profile'=>{…}, 'intensity'=>0.x]`. On any read/parse failure → returns a
  safe default profile (never throws — autopista).

### 2. Mesh fan-out extension — `ape_mesh_presets()` (modify, `ape_mesh.php:11-48`)
Keep the existing `$call(...)` for NeuroBuffer/LCEVC/HDR10Plus. Add, gated by the selected profile:
- **NeuroBuffer.buildVlcOpts** (today only `buildApeTags` is called → decorative). Call
  `buildVlcOpts($profile, $type, $net, $fallback)` and collect its `#EXTVLCOPT`/`#KODIPROP`
  (network-caching/http-reconnect/live-caching/adaptive — **freezeless-positive**).
- **AISuperRes.injectClientSideLogic($height, &$exthttp, &$vlcopt, $ua)** — collect **only `$vlcopt`**
  (the real `#EXTVLCOPT` sharpen/contrast/saturation/swscale). **Discard / quarantine `$exthttp`**
  (its `X-HDR-*`/`X-AI-*` are player-blind metadata, kept out of STREAM-INF and out of the
  9 toxic EXTHTTP set). This is the per-tier upscaling sharpen the user wants.
- **ModemPriority.analyze()→buildApeTags()** — included but **honest**: network-priority hints only,
  `tc qdisc` gated to root, no claim of image improvement. (May be flagged optional in the plan.)
- Per-source-resolution max-upscale target threaded through LCEVC + AISuperRes (480p→1080p,
  720p/1080p→2160p, 4K→max sharpen), honestly executed by the device VPP / mpv (not the VPS).
- Dedup (`array_unique`) preserved. Engine-missing → `$call` already try/catches → graceful.

### 3. device_settings max-image — `ape_mesh_device_settings($streamInfo)` (modify, `ape_mesh.php:56-66`)
Add to the existing array (frame-rate + hdr_conversion):
- `'global minimal_post_processing_allowed 0'` — full hardware VPP (AI upscaler + denoiser + MEMC)
  active = the real-time, "ms before display" anti-pixelation path. In the daemon allowlist.
- (Display-lock sin-root part of `onn_4k_lock_resolution.sh` — `wm size/density` policy — documented
  here but **applied by the SPEC #2 executor**; the device_setting levers are what SPEC #1 emits.)

### 4. CI/CD sync — `tools/cicd/vps_deploy_map.json` (modify)
Add targets so the SSOT + engines actually reach the VPS at the right version:
- `visual_profiles.json`: repo `IPTV_v5.4_MAX_AGGRESSION/vps/ape-uhdx/visual_profiles.json` →
  `/etc/ape-uhdx/visual_profiles.json` (the path both readers use; today NOT synced).
- `ai_super_resolution_engine.php`, `modem_priority_manager.php`, `neuro_buffer_controller.php` →
  `/var/www/html/cmaf_engine/modules/` (today assumed pre-deployed by retired installers).
- `resilience_integration_shim.php` is **NOT** added (retired; logic absorbed into the mesh).

## Data flow (per SSE tick, unchanged loop, richer output)
```
SSE tick (iv=1) → ape_qoe_state_by_channel → riskScore (ape_risk_from_qoe)
  → ape_mesh_profile_for(chId, si, health)  [visual_profiles.json → P-level, max default, QoE de-escalate]
  → ape_mesh_presets(chId, si, health, ct)   [NeuroBuffer.buildVlcOpts + AISuperRes EXTVLCOPT + LCEVC + HDR10Plus, profile-modulated]
  → ape_mesh_device_settings(si)             [frame-rate + hdr_conversion=1 + minimal_post_processing=0]
  → payload: presets[] (actionable EXTVLCOPT/KODIPROP) + device_settings[]
Phase G unchanged (VST>8000ms → PQ→SDR blacklist).
```

## Error handling / invariants (FREEZELESS + truth-guards)
- **Autopista**: every helper is try/catch or fail-safe-default; a missing engine, an unreadable
  JSON, or a malformed profile NEVER breaks the SSE or the stream. Log-phase only.
- **No fake HDR player-facing**: AISuperRes `$exthttp` quarantined; STREAM-INF untouched by this spec.
- **No toxic EXTHTTP**: assert none of `Range / If-None-Match / If-Modified-Since / TE / Priority /
  Upgrade-Insecure-Requests` is emitted; `Connection`/`Keep-Alive` single-value only.
- **GOLDEN RULE / Ley Cardinal 1**: this spec emits NO codec strings into STREAM-INF; `hev1.*` (if any
  from KODIPROP) stays in KODIPROP/EXTVLCOPT. No level<resolution.
- **OMEGA-NO-DELETE / additive**: extend `ape_mesh_presets`; never rewrite it. `resilience_shim` file
  stays on disk (retired, not deleted).

## Testing
- `php -l` on every edited PHP file (ape_mesh.php + the 3 engines if patched).
- **E2E LIVE**: `curl` the SSE via `--resolve iptv-ape.duckdns.org:443:127.0.0.1`, seed
  `/dev/shm/ape_devstate_127.0.0.1.json`, hit `/omega/open`; assert the emitted `presets[]` now
  contain **actionable** `#EXTVLCOPT` (sharpen/swscale/network-caching) and `device_settings[]`
  contains `minimal_post_processing_allowed 0`.
- Inject synthetic high-risk QoE → assert the profile **de-escalates** (lower P-level, less intensity).
- **CI/CD**: deploy via `deploy_vps` with pre-flight df + backup + `php -l`/`nginx -t` + health +
  **auto-rollback**; verify `visual_profiles.json` lands in `/etc/ape-uhdx/` and the engines in
  `/var/www/html/cmaf_engine/modules/`. NEVER ad-hoc scp/ssh. Git push needs explicit user OK.
- (No generator JS touched in SPEC #1 → no `node -c` needed; if a later step touches the generator,
  `node -c` ×3.)

## Out of scope (→ SPEC #2 ARA)
The on-device executor that *applies* device_settings + the display-lock + the mpv/Kodi shaders;
the LAN-host brain; the `.sh` adapters (shader URL fix + resolution-lock root-split). SPEC #1 only
makes the VPS mesh **emit** the actionable config + flows the SSOT.
