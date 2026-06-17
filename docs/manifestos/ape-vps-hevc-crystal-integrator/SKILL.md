---
name: ape-vps-hevc-crystal-integrator
description: Integrate, audit, validate, and package APE VPS HEVC-UHD Crystal-first systems with IPTV/HLS polymorphic playlists, player-daemon contracts, QoE fallback, installer-anchor metadata, ADB bootstrap, wake-on-playback, logs, checksums, and final ZIP deliverables. Use when asked to build, revise, verify, or package an APE/Prisma IPTV/VPS/player/daemon integration.
---

# APE VPS HEVC-UHD Crystal Integrator

Use this skill to convert fragmented APE/Prisma IPTV/VPS/player/daemon requirements into a **validated, honest, reusable package**. Preserve the objective: **HEVC/HVC1/HEV1 maximum viable UHD Crystal quality with QoE-safe fallback and bidirectional player ⇄ daemon communication**.

## Core workflow

Follow this sequence unless the user explicitly narrows the task.

1. **Classify the request and attachments.** Identify whether the ask concerns playlist analysis, HEVC-first selection, visual metadata, QoE fallback, daemon/player communication, installer-anchor, ADB bootstrap, wake-on-playback, packaging, or validation.
2. **State truth guards before implementation.** Never claim that an M3U8 executes code, that ADB can be enabled remotely, that the VPS improves pixels directly, or that a player hosts a daemon. Treat `#EXT-X-APE-INSTALLER` and `#EXT-X-APE-WAKE` as metadata/pointers only.
3. **Map required modules.** Confirm source files exist before editing deploy scripts or reports. If modules are missing, report exact missing paths and create stubs only if the user requested implementation.
4. **Update integration artifacts.** Align deploy script, contract JSON, prompt/operational instructions, Nginx/Lua/PHP/worker/bootstrap/frontend files, and package manifest.
5. **Validate locally.** Run syntax and presence checks for Bash, PHP, JavaScript, JSON, service files, ZIP integrity, and static HEVC anchor rules. Document VPS-only validations separately.
6. **Package deliverables.** Produce a final ZIP, per-file SHA256 manifest, ZIP SHA256, validation log, critical-file log, and final Markdown report.
7. **Deliver concise instructions.** Explain what changed, what passed, what remains VPS-dependent, and the non-negotiable technical limits.

## OMEGA workspace binding (READ FIRST in IPTV Navigator PRO v5.4)

This skill is **médula espinal** doctrine: it is injected into `/iptv-freezeless-visual-master-council`
PHASE 0 and read by every PhD as a MANIFESTO alongside `iptv-omega-working-flow-manifesto`. PhDs MAY
improve it as code **only if they preserve the EXACT proven-working flow** LAB→JSON→lista→VPS→ADB→player.

**Step 0 — Confirm LAB SSOT.** All codec/profile/resolution/bitrate values trace to the calibrated JSON
exported from `APE_M3U8_LAB_v8_FIXED.xlsm` (`LAB_CALIBRATED_BULLETPROOF_*.json`, proven backup
`…22.6.0-MEMC-TOTAL-8K120_BACKUP_20260607.json`). **Never** hard-code a codec string or resolution in a
deploy/contract file without tracing it to the LAB. Cross-ref `iptv-omega-working-flow-manifesto`.

**Standards backing** for every truth-guard (primary URLs: RFC 8216, ISO 14496-15, ITU-T H.265 Annex A,
CMAF, RFC 8216bis VIDEO-RANGE, ADB model, nginx log-phase): `references/web_authority.md`.
**Proof the 13 PhDs reviewed this skill** (verdict WARN · 0 BLOCK · preserves flow): `COUNCIL_REVIEW.md`.

## Decision rules

| Situation | Required action |
|---|---|
| User asks for “install from playlist” | Implement an installer URL anchor, not player-side execution. |
| User asks for “wake when playback starts” | Use VPS manifest GET observation or beacon to enqueue wake; keep Nginx non-blocking. |
| User asks for ADB install | Require host-side ADB authorization; bootstrap must detect and instruct, not force-enable. |
| User asks for visual enhancement | Keep VPS as policy/metadata/QoE selector; do not promise pixel processing unless a real device/player engine exists. |
| User asks for final ZIP | Include source tree, deploy script, prompt, report, logs, checksums, and critical-file verification. |
| Validation tool unavailable | Perform static validation and document the limitation without marking it as a functional pass. |
| HEVC codec requested at a resolution | Verify the level can carry RESOLUTION+fps (Cardinal Law 1) BEFORE emitting; reject if `level < required` (`L153`≠8K@120 — the 2026-06-08 freeze). |
| "Sync the codec cascade JS↔Lua" | **BLOCK.** The CORONA divergence (JS=L153 4K@60 vs Lua=L156 4K@120) is intentional MEMC-TOTAL-8K120 doctrine; any change flows LAB→JSON→lista, never a direct JS↔Lua patch. |
| Modify channel stream URLs | **BLOCK.** SHIELDED = filename suffix only; channel URLs are VERBATIM provider URLs (Law 5). |
| Wake beacon / installer endpoint | Restrict `Access-Control-Allow-Origin` to the frontend domain (no wildcard) + `limit_req`; sanitize `arg_ape_wake`; never interpolate an unescaped var into a sqlite3 query. |

## Required source paths to check

Use this list as a default baseline. Adapt only when the project uses different names.

```text
improved/vps/prisma/players/lib/m3u8_variant_analyzer.sh
improved/vps/prisma/players/lib/playback_profile_decider.sh
improved/vps/prisma/players/lib/visual_metadata_payload.sh
improved/vps/prisma/players/lib/visual_payload_decider.sh
improved/vps/prisma/players/lib/visual_payload_apply.sh
improved/vps/prisma/players/lib/qoe_feedback_loop.sh
improved/vps/prisma/players/ape-universal-player-orchestrator.sh
improved/vps/prisma/players/contracts/player_daemon_bidirectional_contract.json
improved/vps/prisma/players/engines/rust-visual-engine/src/lib.rs
improved/vps/prisma/players/engines/rust-visual-engine/src/main.rs
improved/vps/ape-uhdx/visual_profiles.json
improved/vps/ape_hls_generators.php
improved/vps/prisma/lib/conviva_persistence.php
improved/vps/prisma/lib/conviva-qoe-engine.js
improved/vps/prisma/api/qoe-flush.php
improved/vps/nginx/lua/qoe_server_side_observer.lua
improved/vps/nginx/lua/ape_wake_on_manifest.lua
improved/vps/prisma/api/ape-wake.php
improved/vps/prisma/adb/ape-wake-worker.sh
improved/vps/prisma/adb/ape-wake-worker.service
improved/vps/prisma/install/ape-daemon-bootstrap.sh
improved/vps/nginx/snippets/prisma-ape-installer-location.conf
improved/vps/sentinel/profiles/generic_player.sh
improved/frontend/js/ape-v9/ape-installer-anchor.js
improved/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

> **Path mapping (live repo).** `improved/` is the Manus packaging convention. In this workspace the tree
> root is **`IPTV_v5.4_MAX_AGGRESSION/`** — run the validator with `APE_TREE_ROOT=IPTV_v5.4_MAX_AGGRESSION`
> (it also auto-detects). **Do NOT create stubs under `improved/` when the real files exist** (`iptv-omega-no-delete`).
> Corrections: `vps/prisma/players/contracts/` does **not** exist yet (create only if a contract is required);
> `conviva-qoe-engine.js` lives at `frontend/js/conviva-qoe-engine.js` (frontend, not `vps/prisma/lib/`);
> `visual_metadata_payload.sh` and `visual_payload_apply.sh` DO exist under `vps/prisma/players/lib/`.
> VPS Lua consumers (`combined_body_filter.lua`, `ape_codec_cascade.lua`, `ape_virtual_4k.lua`) are
> **audit-only** — never bundle live Lua into a deploy ZIP (`iptv-vps-touch-nothing`).

## Use bundled resources

Read `references/truth_guards.md` when the task involves installer URL, M3U8 anchors, ADB, wake-on-playback, or visual-processing claims.
Read `references/web_authority.md` for the standards-grounded citation behind every truth-guard. Read `COUNCIL_REVIEW.md` for the 13-PhD verdict (WARN · 0 BLOCK · preserves flow) when a reviewer questions whether this skill is safe doctrine.

Use `templates/final_report.md` when preparing the final report. Use `templates/player_daemon_contract.json` when creating or refreshing the bidirectional contract.

Use `templates/prompt_1_percent_uniqueness.md` when the user asks for an implementation prompt, “1% uniqueness”, deterministic handoff instructions, or a near-perfect reproducible implementation plan. This prompt must preserve the truth guards and minimize creative deviation.

Run `scripts/validate_ape_package.sh <workdir>` before packaging when a package tree is available. The script creates logs inside `<workdir>` and catches the most common regressions.

## Packaging pattern

Create a `deliverables/` directory and generate these artifacts with names adapted to the current task:

```text
APE_VPS_HEVC_UHD_CRYSTAL_<SCOPE>_FINAL_<DATE>.zip
APE_VPS_HEVC_UHD_CRYSTAL_<SCOPE>_FINAL_<DATE>.sha256
APE_VPS_HEVC_UHD_CRYSTAL_<SCOPE>_FINAL_<DATE>_files.sha256
VALIDATION_<SCOPE>.log
ZIP_CRITICAL_FILES_<SCOPE>.log
INFORME_FINAL_<SCOPE>.md
```

The ZIP must contain the `improved/` tree when present, the deploy script, the operational prompt, the final report, validation logs, file manifest, and checksum files. Test the ZIP with `unzip -t` and verify critical files with `unzip -l` before delivery.

## Final response pattern

In the final answer, attach the ZIP first, then the final report, then checksum and validation logs. Mention only concise usage guidance and the key truth guard: **playlist anchors are metadata; ADB/bootstrap execution requires an authorized host**.
