---
description: Show watchdog status for ape-realtime-guardian + wg-health + sentinel. Local mock or live VPS (requires SSH approval).
argument-hint: "[--live]"
allowed-tools: Read, Glob, Grep, Bash, TodoWrite, Skill, AskUserQuestion, Agent
---

# /watchdog-status

**Purpose:** Show watchdog status for ape-realtime-guardian + wg-health + sentinel. Local mock or live VPS (requires SSH approval).

## Usage
```
/watchdog-status [--live]
```

## Inputs (positional / flagged)
* --live

## Execution flow
1. **Cortex init** — `iptv-cortex-init-mandatory` 5-layer scan (mandatory).
2. **Pre-edit audit** — `iptv-pre-edit-audit` for any file the command would touch.
3. **Validation** — execute syntax / smoke / E2E gates per scope.
4. **Subagent delegation** — if multi-disciplinary, invoke the 13 specialists in parallel via the Agent tool.
5. **Report** — generate `.agents/reports/watchdog-status_<timestamp>.md` with findings and recommendations.

## Outputs
- Markdown report in `.agents/reports/watchdog-status_<timestamp>.md`
- JSON twin in `.agents/reports/watchdog-status_<timestamp>.json` if applicable
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
/watchdog-status
```
Runs against the most recently modified target in scope.

### Example B — explicit path
```
/watchdog-status <path/to/target>
```

### Example C — with subagent debate
```
/team-agent-debate "Should we enable LL-HLS for sports channels?"
```
Each specialist (S1-S13) contributes; synthesizes a single decision with rationale.
