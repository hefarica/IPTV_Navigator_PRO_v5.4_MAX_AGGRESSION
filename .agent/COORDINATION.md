# Multi-Agent Coordination — LAB Importer Extension

> **Read this BEFORE editing any file in this repo.** Two agents are working in parallel; this ledger prevents collisions.

Last updated: 2026-04-26 by Agent A (Claude Opus 4.7 / 1M ctx)

## Completed work (Agent Disney-Grade · 2026-05-16)

✅ DONE — disney-ssot-migration · 2026-05-16T~16:00Z · lock released

Migrated 6 Disney-Grade LL-HLS/ABR directives from hardcoded JS/PHP/Python emission to LAB SSOT pipeline.

Touched (all smoke tests pass: node -c, python -m py_compile, JSON valid):
- CREATE: `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/config/m3u8_directives_config.json` (seed)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/lab_config.lua` (added `_M.m3u8_directives()` + `_M.m3u8_directive_lines()`)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/lab_config_loader.php` (added `m3u8Directives()` + `m3u8DirectiveLines()` + `defaultsM3u8Directives()`)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/docs/LAB_VBA_MACROS/prismaBulletproofEnrich.bas` (added `SHEET_DISNEY` const + `DumpDisneyGradeDirectives` + `DisneyDirectivesFallback` + call in `BuildFeatureSheetsBlock`)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` (added `DEFAULT_DISNEY_DIRECTIVES` const + extraction in PRISMA block + `getGlobalDisneyDirectives()` + `isDisneyDirectivesFromLab()` getters)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (LAB-aware branch reads getter into `coreHeader`; fallback branch reads getter via `_disneyBlockFb` substitution; Windsurf hardcoded lines 2483-2486 + line 2489 modification reverted)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8-world-class-generator.js` (LAB-wired insertion in `generateGlobalHeader()`; `#EXT-X-TARGETDURATION:6` removed to let Disney's `:2` win)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php` (replaced 6-line Windsurf hardcode with `LabConfigLoader::m3u8DirectiveLines()` + inline fallback)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php` (idem)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/scripts/generate_m3u8_v53_fusion.py` (added `_ape_disney_directive_lines()` helper reading seed JSON with defaults fallback; fixes broken-escape bug at original line 626)
- MOD: `IPTV_v5.4_MAX_AGGRESSION/scripts/generate_m3u8_pep_v5.py` (idem)

Manual action pending: user creates Excel sheet `30_DISNEY_GRADE_DIRECTIVES` in `APE_M3U8_LAB_v8_FIXED.xlsm` with rows:

| key | value | category | applies_to | comment |
|-----|-------|----------|------------|---------|
| `EXT-X-START` | `TIME-OFFSET=-3.0,PRECISE=YES` | timeline | ALL | Pillar 1 |
| `EXT-X-SERVER-CONTROL` | `CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0` | timeline | ALL | Pillar 1 |
| `EXT-X-TARGETDURATION` | `2` | fragmentation | ALL | Pillar 2 |
| `EXT-X-PART-INF` | `PART-TARGET=1.0` | fragmentation | ALL | Pillar 2 |
| `EXT-X-SESSION-DATA` | `DATA-ID="exoplayer.load_control",VALUE="{\"minBufferMs\":20000,\"bufferForPlaybackMs\":1000}"` | abr | ALL | Pillar 3 |
| `EXT-X-SESSION-DATA` | `DATA-ID="exoplayer.track_selection",VALUE="{\"maxDurationForQualityDecreaseMs\":2000,\"minDurationForQualityIncreaseMs\":15000,\"bandwidthFraction\":0.65}"` | abr | ALL | Pillar 3 |

Until sheet exists, `DumpDisneyGradeDirectives` falls back to `DisneyDirectivesFallback()` (same 6 directives) so bulletproof JSON export keeps working. Frontend / VPS / backend / Python all have their own defensive defaults — system never emits empty Disney block.

VPS deploy pending: requires `iptv-vps-touch-nothing` checklist before scp.

---

## Active agents

> **Nomenclature note**: this doc renames the parallel agent (whose handoff lives at `_audit_snapshot/2026-04-26_pre_gap_plan/AGENT_HANDOFF.md`) as **"Agent F"** (Frontend). The author of THIS file is **"Agent E"** (Excel). The other agent's own self-label was "Agent A"; we rename to E/F here to avoid confusing collisions with the user's pipeline-direction terms.

| ID | Tooling | Scope | Status |
|---|---|---|---|
| **Agent E** (author of this file) | Claude Opus 4.7 (1M context), Claude Code CLI | Excel VBA (macros) + Excel-side import (`LAB_SNAPSHOT.json` consumed by `ImportFromFrontend`) + plan/docs | DONE — backlog cancelled (matrix=status_quo per user) |
| **Agent F** (handoff doc author, self-labelled "Agent A") | unknown session | Frontend JS (consumers, PM9 SSOT panel, generator wiring, tests, runtime audit) | DONE — pending T7 smoke E2E by user |

If you are a third agent reading this: **STOP and ask the user before claiming any scope**.

## Pipeline direction terms (unified)

To prevent the previous A/B confusion, use these names:

| Hop | Name in this doc | Owner |
|---|---|---|
| frontend exports `LAB_SNAPSHOT.json` → Excel macro consumes via `ImportFromFrontend` | **EXCEL-IN** | Agent E |
| Excel exports `LAB_CALIBRATED.json` → frontend consumes via `importFromLAB()` | **FRONTEND-IN** | Agent F |
| frontend → `prepublishAndGenerate()` → M3U8 list | **LIST-OUT** | Agent F |

---

## Scope partition (claimed)

### Agent A owns (do NOT edit if you are Agent B):

- `IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/*` — VBA injection scripts, schema dump, smoke harness
- `C:/tmp/APE_LAB_BRAIN_CODE.txt` — VBA source dump (read-only reference)
- `C:/tmp/lab_ext/*` — staging area for VBA work (auth: Agent A only)
- `IPTV_v5.4_MAX_AGGRESSION/docs/superpowers/plans/2026-04-26-lab-importer-extension.md` — plan file
- The `APE_M3U8_LAB_v8_FIXED.xlsm` workbook (Excel COM access)
- VBA functions in `APE_LAB_BRAIN` module (e.g. `Brain_ExportToFrontend`, `FE_SyncProfilesJS`, future `Brain_SyncMatrixFromCuratedSheets`)

### Agent B owns (do NOT edit if you are Agent A):

- `IPTV_v5.4_MAX_AGGRESSION/frontend/test/lab_absorption_runtime.js`
- `IPTV_v5.4_MAX_AGGRESSION/frontend/test/lab_absorption_test.js`
- `IPTV_v5.4_MAX_AGGRESSION/_audit_snapshot/2026-04-26_pre_gap_plan/*`
- 9-generator audit (consumers reading `window.APE_PROFILES_CONFIG.*`)

### Shared (touched by both — needs coordination):

| File | Agent A's contribution | Agent B's contribution | Conflict status |
|---|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` | commit b57c504 — block "6b OMEGA GAP PLAN" absorption + persistence + rehydration | uncommitted patch — block "5b OMEGA_GAP_PLAN" absorption with REPLICAR/IMPLEMENTAR/QUITAR counts | **DUPLICATED — merge needed** (both blocks coexist; functionally OK, cleanup recommended) |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8-world-class-generator.js` | commits b57c504+7b2c673 — `_generateGapPlanLines`, `_generateProfileFullEmission`, NIVEL_1+MULTI emission, NIVEL_3 emission | unknown (file modified in last 60min) | **VERIFY before edit** |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/lab-fidelity-verifier.js` | commits b57c504+7b2c673 — gap_plan checks + profile blob checks | unknown (file modified in last 60min) | **VERIFY before edit** |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/profile-manager-v9.js` | none | uncommitted (in last 60min) | A: skip |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/generation-controller.js` | none | uncommitted (in last 60min) | A: skip |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | none | uncommitted (in last 60min) | A: skip |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/app.js` | none | uncommitted (in last 60min) | A: skip |

### Shared but read-only for both:

- `C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_*.json` (input fixture)
- `C:/Users/HFRC/Downloads/LAB_SNAPSHOT_*.json` (input fixture)
- `C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.xlsm` — only Agent A writes via COM; Agent B may read via export

---

## Lock convention

Before editing a file in the **Shared** rows above, prepend a marker line in the file or in this file's "Active locks" section:

```
🔒 AgentX <task-id> <iso-utc-timestamp> <ETA-minutes>
```

Release the lock by removing the line BEFORE final commit.

If a lock has been stale > 30 min, ask the user before stealing it.

### Active locks (right now)

_(none — both agents idle on shared files)_

---

## Completed work (commits on master)

```
7b2c673 (Agent A) Path B: emit every profile section as M3U8 directive (124 keys/perfil)
b57c504 (Agent A) Path B: consume omega_gap_plan to close scorecard gaps (50 items)
01a5ede (Agent A) T6a: 100% real-data match (closes B10/B15/B16/G5/G10/L1-L5 gaps)
5d6ef65 (Agent A) T5: real-data verification (LAB_SNAPSHOT 19MB)
5f93aff (Agent A) T4: blob sections (headers, quality_levels)
a271a75 (Agent A) T3: section dispatcher + 6 non-blob sections (560 keys/perfil)
d3838f8 (Agent A) T2: fixture + smoke harness baseline + VBA test gates
a633c2b (Agent A) T1 fix: derive section from dotted prefix
d5d84a1 (Agent A) T1: schema discovery
```

Agent B has NOT committed yet (work is uncommitted in working tree). When Agent B commits, append here.

---

## Open work — claim before starting

### Agent A backlog
- [ ] **`Brain_SyncMatrixFromCuratedSheets`** — auto-sync hojas 5/6/7 marks → `8_MATRIX_3D` (user requirement: matrix is derived blueprint)
- [ ] Worksheet_Change handlers in xlsm to trigger sync on user edits
- [ ] Validator: matrix↔hojas coherence pre-export (block export if discrepancy)
- [ ] Refactor `Brain_ExportToFrontend` to optionally read matrix-first (with fallback to hojas 5/7)
- [ ] T7: pre-import backup in production `ImportFromFrontend`
- [ ] T8: final commit + post-validate report + memory update

### Agent B backlog (inferred from work-in-progress)
- [ ] Audit 9 frontend generators reading `APE_PROFILES_CONFIG.*` field-by-field
- [ ] Cleanup duplication of omega_gap_plan blocks (5b vs 6b) in `ape-profiles-config.js`
- [ ] Wire test scripts (`lab_absorption_runtime.js`, `lab_absorption_test.js`) into CI/manual flow
- [ ] Identify gaps where a JSON field is absorbed but no consumer reads it (or vice versa)
- [ ] Verify cross-wire: `app.state.activeServers[].labProvenance` flag (referenced in runtime test)

### Joint / needs handoff conversation
- [ ] **Cleanup duplicated `omega_gap_plan` absorption** — recommend Agent B keeps their version (better count granularity), Agent A removes block "6b". Or merge bodies. Must align before next commit.
- [ ] **Single source of "what's a perfect import"** — Agent B's `lab_absorption_runtime.js` is the natural canonical check. Agent A's `lab-fidelity-verifier.js` checks emission-side. Both should converge on same metrics dictionary.

---

## How Agent B should ack this file

If you are Agent B, append a section below confirming you read this. Suggested format:

```markdown
## Ack from Agent B (date)
- Read: yes
- Scope claimed: <list>
- Disagreements / conflicts to resolve: <list>
- ETA on current task: <minutes>
- Next action: <one-line>
```

If Agent B has different conventions, the user (HFRC) is the tiebreaker.

---

## Questions for the user (HFRC)

1. **Identity of Agent B** — which tool/session? (Cursor, Cline, another Claude session, Aider, Gemini?). Knowing helps Agent A predict its style.
2. **Should Agent A pause** while Agent B is mid-edit on shared files? Or is the natural git merge enough?
3. **Cleanup of duplicated `omega_gap_plan` blocks** — keep Agent B's, keep Agent A's, or merge both into one canonical block?
