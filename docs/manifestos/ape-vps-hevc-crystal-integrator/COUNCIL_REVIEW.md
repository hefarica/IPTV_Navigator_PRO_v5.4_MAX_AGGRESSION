# PhD Council Review — `ape-vps-hevc-crystal-integrator` Skill

**Mandate:** FREEZELESS + VISUAL MASTER. **Scope:** review the skill artifacts at `C:/tmp/ape_skill_inspect/` (SKILL.md, references/truth_guards.md, templates/player_daemon_contract.json, scripts/validate_ape_package.sh) before enshrinement into `/iptv-freezeless-visual-master-council` doctrine.

## Per-discipline verdicts (S1–S13)

| # | Specialist | Verdict | preserves_flow | One-line |
|---|---|---|---|---|
| S1 | IPTV/HLS Architect | WARN | **false** | Doctrinally sound but Level↔Resolution law absent, hvc1/hev1 conflated, LAB SSOT invisible, validate script checks wrong files + wrong `improved/` paths. |
| S2 | LL-HLS/CMAF Engineer | WARN | true | Preserves flow; missing GOLDEN RULE split, Level law, fake-CMAF, fake-HDR, log_by_lua nuance; `improved/` prefix renders validator useless. |
| S3 | Video Codec Engineer | WARN | true | hvc1/hev1 conflated (would break KODIPROP path if taken literally); contract has no level↔resolution guard; `improved/` prefix breaks required-file gate. |
| S4 | Color Scientist HDR | WARN | true | Silent on every HDR lie: VIDEO-RANGE without probe, MaxCLL/MaxFALL inversion, SUPPLEMENTAL-CODECS `lcev`, hev1 in CODECS=. |
| S5 | QoE/QoS Researcher | WARN | true | Missing the entire QoE server-side observer chain (Step 8), wrong path for conviva-qoe-engine.js, no operative thresholds, no L153/8K@120 check. |
| S6 | nginx/OpenResty/Lua Engineer | WARN | true | Validator hard-fails on real repo (wrong prefix + false-positive hev1 regex); truth_guards missing hvc1/hev1 placement + level law; contract omits blocking-I/O caveat. |
| S7 | Linux VPS/SRE Engineer | WARN | true | Sound and chain-preserving, but Level↔Resolution law absent from truth_guards (exact 2026-06-08 mechanism); 7 concrete gaps. |
| S8 | Network/TCP/QUIC Engineer | WARN | true | Honest and flow-safe but blind to cardinal TCP invariants (BBR/initcwnd-400/rto_min-40ms); path mismatch makes validator a no-op; HEVC check misses L153+8K. |
| S9 | Player-Compatibility Engineer | WARN | true | hev1 false-positive in validator, absent codec-level/resolution guard, missing LAB-SSOT in contract, `improved/` mismatch bypasses node-check gate. |
| S10 | Security/Auth/Headers Engineer | WARN | true | Core guards sound; 8 gaps: no toxic-header list, CORS wildcard on wake beacon, SQLite injection in wake-worker, hvc1/hev1 conflation, no SHIELDED/NO-STRIP, wrong prefix, no HDCP guard, no level law. |
| S11 | Data Observability Engineer | WARN | true | Doctrinally sound; validator dead against real repo (wrong prefix) + false-fails legitimate hev1; no wake-event dedup observability. |
| S12 | QA Broadcast Validator | WARN | true | Flow-safe; three truth-guard gaps (Level law, hvc1/hev1 placement, CORONA divergence undocumented) + two script defects (prefix, narrow HEVC grep). |
| S13 | Repo Surgeon | WARN | true | Preserves flow; missing level-resolution anchor + NO-STRIP doctrine; universal `improved/` mismatch; HEVC-first wording dangerously unqualified. |

**Tally:** 13 WARN, 0 BLOCK. `preserves_flow = false` only at S1 — and S1 itself classifies it WARN (not BLOCK) because the skill does not actively mutate any working-flow artifact; the gaps are additive omissions, not contradictions. **No PhD found a flow-break or player-breaking lie that the skill as-written commits.**

## Convergent findings (cross-validated by ≥6 PhDs)

1. **`improved/` path-prefix mismatch (S1,S2,S3,S5,S6,S7,S8,S9,S11,S12,S13 — 11/13).** Verified: real repo root is `IPTV_v5.4_MAX_AGGRESSION/`; `validate_ape_package.sh` hardcodes `improved/` in `required[]`, `optional_attachment5[]`, and every `find`/`grep`. Against the real tree the script either fails all required-file checks (exit 1) or passes vacuously. Highest-severity structural defect.
2. **Level↔Resolution law absent (S1,S2,S3,S5,S6,S7,S8,S9,S10,S12,S13 — 11/13).** Neither truth_guards.md, the contract, nor the validator encodes that `level_idc` must carry `RESOLUTION`+fps. This is the exact 2026-06-08 freeze vector (`hvc1.2.4.L153.B0` on 8K@120).
3. **hvc1/hev1 GOLDEN RULE conflated (S1,S2,S3,S4,S6,S9,S10,S11,S12 — 9/13).** truth_guards.md line 14 ("fake hev1") and `qoe_fallback_policy.primary` ("HVC1/HEV1") treat them as peers. Correct doctrine: `hvc1.*` → STREAM-INF CODECS= only; `hev1.*` → KODIPROP/EXTVLCOPT only. Never cross.
4. **Validator HEVC grep too narrow / false-positive (S1,S2,S3,S6,S9,S11,S12,S13 — 8/13).** Line 88 scans only `ape-installer-anchor.js` (never a STREAM-INF emitter) and would false-fail legitimate dual-codec `hev1` entries from the cascade SSOT. Must scope to actual CODECS= attributes in the generator files and demote legitimate-hev1 to WARN.

## Consolidated improvements adopted

See the `consolidated_improvements` list. All adopted items are **additive** (new rows, configurable variables, new reference files, widened checks) and **preserve the exact working flow** — none deletes a header, transforms a URL, clamps a LAB value, or touches the LAB→JSON→lista→VPS→ADB→player chain. The path-prefix fix is parameterized (env var with the existing default) so both the Manus packaging tree and the live repo validate without editing.

> **Caveat.** Local static checks do not prove systemd, Nginx, PHP-FPM, Lua runtime, ADB authorization, or Android device behavior on the production VPS.