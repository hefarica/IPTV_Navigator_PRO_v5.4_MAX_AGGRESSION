---
description: Validate a single .m3u8 / .m3u file against RFC 8216 + EXTHTTP traps + 4-layer rules. Returns CRITICAL/HIGH/MEDIUM/LOW findings.
argument-hint: "<path/to/list.m3u8>"
allowed-tools: Read, Glob, Grep, Bash, TodoWrite, Skill, AskUserQuestion, Agent
---

# /validate-m3u8

**Purpose:** Validate a single .m3u8 / .m3u file against RFC 8216 + EXTHTTP traps + 4-layer rules. Returns CRITICAL/HIGH/MEDIUM/LOW findings.

## Usage
```
/validate-m3u8 <path/to/list.m3u8>
```

## Inputs (positional / flagged)
  path/to/list.m3u8

## Execution flow
1. **Cortex init** — `iptv-cortex-init-mandatory` 5-layer scan (mandatory).
2. **Pre-edit audit** — `iptv-pre-edit-audit` for any file the command would touch.
3. **Validation** — execute syntax / smoke / E2E gates per scope.
4. **Subagent delegation** — if multi-disciplinary, invoke the 13 specialists in parallel via the Agent tool.
5. **Report** — generate `.agents/reports/validate-m3u8_<timestamp>.md` with findings and recommendations.

## Outputs
- Markdown report in `.agents/reports/validate-m3u8_<timestamp>.md`
- JSON twin in `.agents/reports/validate-m3u8_<timestamp>.json` if applicable
- Exit code: 0 PASS, 1 WARN, 2 BLOCK

## Doctrines enforced
- `iptv-omega-no-delete`
- `iptv-vps-touch-nothing` (if scope includes VPS)
- `iptv-no-hardcode-doctrine`
- `iptv-lab-ssot-no-clamp`
- "No mocks · No datos falsos · No hardcode innecesario · No romper lo existente"

## Permission gates (NEVER bypass without explicit user OK)
- VPS modifications require `iptv-vps-touch-nothing` checklist
- Excel modifications require `iptv-excel-safe-mode` checklist
- Git commits require user authorization (no autocommit)
- Destructive ops (rm -rf, git push --force) BLOCKED

## Examples

### Example A — basic invocation
```
/validate-m3u8
```
Runs against the most recently modified target in scope.

### Example B — explicit path
```
/validate-m3u8 <path/to/target>
```

### Example C — with subagent debate
```
/team-agent-debate "Should we enable LL-HLS for sports channels?"
```
Each specialist (S1-S13) contributes; synthesizes a single decision with rationale.
