# Guardian Predictive Floor Action — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `RecommendedAction` state machine to the Guardian that emits `OK` / `INCREASE_BUFFER` / `FLOOR_VIOLATION` / `CRITICAL` per cycle, surfaced in the audit JSONL, so external systems (or future enforcement adapters) can react before "se caen las megas fijas".

**Architecture:** Pure additive state machine. New module `recommended_action.py` consumes existing `slope_mbps_per_s` (from `PredictiveMarginEngine`) + `bitrate_floor_violation` + `bitrate_deficit_kbps` (from `CollectedMetrics`) + cycle timing. Hysteresis (10% recovery margin) prevents oscillation. **Zero changes to demand formula** — it only writes 3 new fields to audit log: `rec_action`, `rec_action_reason`, `slope_pct_per_min`. Phases B (LIVE/VOD) and C (active enforcement) are separate plans.

**Tech Stack:** Python 3.12 + asyncio + pytest. Same as existing Guardian.

---

## Spec coverage map (PDFs → tasks)

| PDF source | Concept | Task |
|---|---|---|
| Whitepaper APE v15 §3.1 | `bitrate_slope > 15%/min negativa` → `INCREASE_BUFFER` | Task 2 (state machine), Task 3 (slope_pct_per_min calc) |
| Whitepaper APE v15 §3.1 | `history_depth=50` para predicción | Task 2 (separate window from demand engine) |
| Estrategias §3.0 | Hysteresis (umbral activar ≠ umbral revertir) | Task 2 (RECOVER_MARGIN_PCT=10) |
| Métricas §1 (QoE) | `bitrate_floor_violation` sostenido 5s+ | Task 2 (FLOOR_VIOLATION_GRACE_S=5) |
| Whitepaper APE v15 §3.2 | Critical threshold para failover | Task 2 (`CRITICAL` cuando slope ≤ -30%/min OR floor+slope concurrent) |
| Métricas §3 | Audit JSONL granular | Task 4 (new audit fields) |

---

## File Structure

```
IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/
├── ape_realtime_guardian/
│   ├── recommended_action.py          (NEW — enum + state machine)
│   ├── main.py                         (MODIFY ~L186-260 — wire engine + audit)
│   └── metrics_collector.py            (REFERENCE — read fields, no edit)
├── tests/
│   └── test_recommended_action.py     (NEW — 11 tests)
└── docs/plans/
    └── 2026-04-26-guardian-predictive-floor-action.md  (THIS FILE)
```

**Pre-existing fields used (verified in repo):**
- `PredictiveMargin.slope_mbps_per_s` — `predictive_engine.py:109`
- `CollectedMetrics.actual_bitrate_mbps` — `metrics_collector.py:29`
- `CollectedMetrics.bitrate_floor_kbps` / `.bitrate_floor_violation` — patched on VPS via `adb_player.py` aggregator + `metrics_collector.py` extraction (Task 0 confirms repo parity)

**Fields not modified:**
- `DemandDecision` and `decision_engine.compute()` — untouched
- All existing audit fields — untouched
- Adapter `apply()` — untouched

---

## Task 0 — Verify repo parity with VPS-deployed patches

Earlier session patched the VPS directly (`adb_player.py` aggregator + `metrics_collector.py` resolution fields). This task confirms the local repo has the same code; if not, pull from VPS first.

**Files:**
- Read-only check: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/metrics_collector.py`
- Read-only check: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/probes/adb_player.py`

- [ ] **Step 1: Check if `bitrate_floor_kbps` exists in local `metrics_collector.py`**

```bash
grep -n 'bitrate_floor_kbps\|bitrate_floor_violation' IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/metrics_collector.py
```

Expected: lines that reference these fields. If 0 hits → repo is OLDER than VPS, run Step 2.

- [ ] **Step 2 (only if Step 1 had 0 hits): Pull patched files from VPS**

```bash
scp root@178.156.147.234:/opt/ape-realtime-guardian/ape_realtime_guardian/metrics_collector.py IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/metrics_collector.py
scp root@178.156.147.234:/opt/ape-realtime-guardian/ape_realtime_guardian/probes/adb_player.py IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/probes/adb_player.py
scp root@178.156.147.234:/opt/ape-realtime-guardian/ape_realtime_guardian/main.py IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/main.py
```

- [ ] **Step 3: Run existing tests to confirm baseline green**

```bash
cd IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian && python -m pytest tests/ -v
```

Expected: 49+ tests pass. If failures → DO NOT proceed; investigate first.

- [ ] **Step 4: Commit any sync changes**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/
git commit -m "guardian: sync local repo with VPS-deployed resolution-aware patches"
```

If no diff (Step 1 had hits, no pull needed), skip the commit.

---

## Task 1 — Write failing tests for `RecommendedAction` state machine

**Files:**
- Create: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/tests/test_recommended_action.py`

- [ ] **Step 1: Create the test file with 11 tests**

```python
"""Tests for RecommendedActionEngine — predictive floor enforcement state machine."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ape_realtime_guardian.recommended_action import (
    RecommendedAction,
    RecommendedActionEngine,
)


class TestRecommendedActionEngine:
    """TDD tests for the floor-enforcement state machine."""

    def test_initial_state_is_ok(self):
        engine = RecommendedActionEngine()
        result = engine.evaluate(actual_mbps=20.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        assert result.action == RecommendedAction.OK
        assert result.slope_pct_per_min == 0.0

    def test_floor_violation_below_grace_period_stays_ok(self):
        """3 cycles of 1s under floor (< 5s grace) → still OK."""
        engine = RecommendedActionEngine()
        for _ in range(3):
            r = engine.evaluate(actual_mbps=10.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        assert r.action == RecommendedAction.OK

    def test_floor_violation_after_grace_triggers_floor_violation(self):
        """6 cycles of 1s under floor (> 5s grace) → FLOOR_VIOLATION."""
        engine = RecommendedActionEngine()
        for _ in range(6):
            r = engine.evaluate(actual_mbps=10.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        assert r.action == RecommendedAction.FLOOR_VIOLATION
        assert r.reason == 'floor_violation_5s'

    def test_negative_slope_15pct_per_min_triggers_increase_buffer(self):
        """Slope of -15%/min on 25 Mbps stream = -0.0625 Mbps/s, sustained 3s."""
        engine = RecommendedActionEngine()
        # mean=25 Mbps, slope_mbps_per_s = -25 * 0.15 / 60 = -0.0625
        for _ in range(3):
            r = engine.evaluate(actual_mbps=25.0, floor_kbps=14000, slope_mbps_per_s=-0.0625, dt_s=1.0)
        assert r.action == RecommendedAction.INCREASE_BUFFER
        assert r.slope_pct_per_min < -14.0  # ~-15%/min

    def test_critical_when_slope_30pct_per_min(self):
        """Slope of -30%/min triggers CRITICAL immediately (no grace)."""
        engine = RecommendedActionEngine()
        # slope = -25 * 0.30 / 60 = -0.125 Mbps/s
        r = engine.evaluate(actual_mbps=25.0, floor_kbps=14000, slope_mbps_per_s=-0.125, dt_s=1.0)
        assert r.action == RecommendedAction.CRITICAL
        assert r.reason == 'slope_critical'

    def test_critical_when_floor_violation_plus_negative_slope(self):
        """Concurrent floor violation + negative slope (sustained) → CRITICAL."""
        engine = RecommendedActionEngine()
        for _ in range(6):
            r = engine.evaluate(actual_mbps=10.0, floor_kbps=14000, slope_mbps_per_s=-0.0625, dt_s=1.0)
        assert r.action == RecommendedAction.CRITICAL

    def test_hysteresis_recovery_requires_10pct_above_floor(self):
        """After FLOOR_VIOLATION, recovery to floor*1.0 still violation; floor*1.10 = OK."""
        engine = RecommendedActionEngine()
        # Trigger violation
        for _ in range(6):
            engine.evaluate(actual_mbps=10.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        # actual_mbps = 14.0 (exactly at floor) → still violation
        r = engine.evaluate(actual_mbps=14.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        assert r.action == RecommendedAction.FLOOR_VIOLATION
        # actual_mbps = 15.4 (10% above floor) → OK
        for _ in range(3):  # sustained 3s above hysteresis
            r = engine.evaluate(actual_mbps=15.4, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        assert r.action == RecommendedAction.OK

    def test_floor_zero_disables_violation_check(self):
        """floor_kbps=0 (resolution unknown) → never trigger FLOOR_VIOLATION."""
        engine = RecommendedActionEngine()
        for _ in range(10):
            r = engine.evaluate(actual_mbps=0.5, floor_kbps=0, slope_mbps_per_s=0.0, dt_s=1.0)
        assert r.action == RecommendedAction.OK

    def test_slope_pct_per_min_handles_zero_actual(self):
        """actual_mbps=0 → slope_pct_per_min returns 0.0 without ZeroDivisionError."""
        engine = RecommendedActionEngine()
        r = engine.evaluate(actual_mbps=0.0, floor_kbps=14000, slope_mbps_per_s=-0.5, dt_s=1.0)
        assert r.slope_pct_per_min == 0.0
        assert r.action != RecommendedAction.CRITICAL  # cannot conclude trend with no signal

    def test_grace_period_resets_after_recovery(self):
        """After OK recovery, new violation must wait full grace again."""
        engine = RecommendedActionEngine()
        for _ in range(6):
            engine.evaluate(actual_mbps=10.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        # Recover
        for _ in range(3):
            engine.evaluate(actual_mbps=20.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        # New violation; only 3 cycles in (< 5s grace) → still OK, not FLOOR_VIOLATION
        for _ in range(3):
            r = engine.evaluate(actual_mbps=10.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        assert r.action == RecommendedAction.OK

    def test_action_string_serialization(self):
        """RecommendedAction.value must be JSON-serializable string."""
        engine = RecommendedActionEngine()
        r = engine.evaluate(actual_mbps=20.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        assert isinstance(r.action.value, str)
        assert r.action.value == 'OK'
```

- [ ] **Step 2: Run tests to verify they all FAIL (module not yet created)**

```bash
cd IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian && python -m pytest tests/test_recommended_action.py -v
```

Expected: 11 errors with `ModuleNotFoundError: No module named 'ape_realtime_guardian.recommended_action'`.

- [ ] **Step 3: Commit failing tests**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/tests/test_recommended_action.py
git commit -m "guardian: add failing tests for RecommendedActionEngine (TDD red)"
```

---

## Task 2 — Implement `RecommendedActionEngine`

**Files:**
- Create: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/recommended_action.py`

- [ ] **Step 1: Create the module**

```python
"""
RecommendedActionEngine — Predictive floor-enforcement state machine.

Consumes:
  - actual_mbps: current bitrate from ADB probe
  - floor_kbps: resolution-derived floor (14000 for 4K, 5000 FHD, etc.)
  - slope_mbps_per_s: from PredictiveMarginEngine (positive=improving)
  - dt_s: cycle delta time

Emits:
  - RecommendedAction enum: OK / INCREASE_BUFFER / FLOOR_VIOLATION / CRITICAL
  - reason: short string for audit log
  - slope_pct_per_min: signed percent change per minute (informational)

Design constraints:
  - Pure (state lives only inside engine; no I/O)
  - Hysteresis: trigger floor violation at floor; recover only at floor * 1.10
  - Grace period: floor under threshold for FLOOR_VIOLATION_GRACE_S before triggering
  - Slope thresholds derived from APE v15 Whitepaper §3.1

Sources:
  - Whitepaper APE v15 §3.1 (15%/min slope trigger, 30%/min critical)
  - Estrategias Integradas §3 (hysteresis 10% margin)
  - Métricas APE §3 (sustained-state grace period)
"""

import logging
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger('ape-guardian.recommended_action')

# Constants from PDFs
SLOPE_TRIGGER_PCT_PER_MIN = -15.0       # APE v15 §3.1
SLOPE_CRITICAL_PCT_PER_MIN = -30.0      # 2× trigger = critical
FLOOR_VIOLATION_GRACE_S = 5.0           # sustained 5s before action
SLOPE_GRACE_S = 3.0                     # sustained 3s of negative slope
HYSTERESIS_RECOVER_MULT = 1.10          # Estrategias §3 — 10% margin
RECOVERY_GRACE_S = 3.0                  # sustained recovery before exit


class RecommendedAction(Enum):
    """State machine outputs."""
    OK = 'OK'
    INCREASE_BUFFER = 'INCREASE_BUFFER'   # Pre-emptive: slope predicts degradation
    FLOOR_VIOLATION = 'FLOOR_VIOLATION'   # Sustained below floor
    CRITICAL = 'CRITICAL'                 # Hard fail: both conditions or steep slope


@dataclass
class ActionResult:
    """Per-cycle output."""
    action: RecommendedAction
    reason: str
    slope_pct_per_min: float


class RecommendedActionEngine:
    """
    Hysteresis state machine over actual vs floor + slope trend.

    State persisted across calls:
      - _below_floor_seconds: accumulated time under floor
      - _negative_slope_seconds: accumulated time with slope < trigger
      - _recovery_seconds: accumulated time in recovery zone (used to exit)
      - _current_action: last emitted action (for hysteresis)
    """

    def __init__(self):
        self._below_floor_seconds: float = 0.0
        self._negative_slope_seconds: float = 0.0
        self._recovery_seconds: float = 0.0
        self._current_action: RecommendedAction = RecommendedAction.OK

    def evaluate(
        self,
        actual_mbps: float,
        floor_kbps: int,
        slope_mbps_per_s: float,
        dt_s: float,
    ) -> ActionResult:
        """Compute action for one cycle.

        Args:
            actual_mbps: actual bitrate measured by ADB probe (Mbps)
            floor_kbps: resolution floor (14000=4K, 5000=FHD, 0=unknown)
            slope_mbps_per_s: from PredictiveMarginEngine (negative=degrading)
            dt_s: time since last call (seconds, ~1.0 at 1Hz)
        """
        # Compute signed percent-per-minute slope (informational, also used for thresholds)
        slope_pct_per_min = self._compute_slope_pct_per_min(actual_mbps, slope_mbps_per_s)

        # Disabled mode: floor unknown
        if floor_kbps <= 0:
            self._below_floor_seconds = 0.0
            self._negative_slope_seconds = 0.0
            self._recovery_seconds = 0.0
            self._current_action = RecommendedAction.OK
            return ActionResult(RecommendedAction.OK, 'floor_unknown', slope_pct_per_min)

        floor_mbps = floor_kbps / 1000.0
        recover_mbps = floor_mbps * HYSTERESIS_RECOVER_MULT

        # Track below-floor time
        if actual_mbps < floor_mbps:
            self._below_floor_seconds += dt_s
            self._recovery_seconds = 0.0
        elif actual_mbps >= recover_mbps:
            self._recovery_seconds += dt_s
            if self._recovery_seconds >= RECOVERY_GRACE_S:
                self._below_floor_seconds = 0.0  # Reset grace once fully recovered
        # In dead zone (floor <= actual < recover_mbps): hold both counters

        # Track sustained-slope time
        if slope_pct_per_min <= SLOPE_TRIGGER_PCT_PER_MIN:
            self._negative_slope_seconds += dt_s
        else:
            self._negative_slope_seconds = 0.0

        # Decide action (priority: CRITICAL > FLOOR_VIOLATION > INCREASE_BUFFER > OK)
        floor_violated = self._below_floor_seconds >= FLOOR_VIOLATION_GRACE_S
        slope_sustained = self._negative_slope_seconds >= SLOPE_GRACE_S
        slope_critical = slope_pct_per_min <= SLOPE_CRITICAL_PCT_PER_MIN

        if slope_critical:
            self._current_action = RecommendedAction.CRITICAL
            return ActionResult(RecommendedAction.CRITICAL, 'slope_critical', slope_pct_per_min)

        if floor_violated and slope_sustained:
            self._current_action = RecommendedAction.CRITICAL
            return ActionResult(RecommendedAction.CRITICAL, 'floor_plus_slope', slope_pct_per_min)

        if floor_violated:
            self._current_action = RecommendedAction.FLOOR_VIOLATION
            return ActionResult(RecommendedAction.FLOOR_VIOLATION, 'floor_violation_5s', slope_pct_per_min)

        if slope_sustained:
            self._current_action = RecommendedAction.INCREASE_BUFFER
            return ActionResult(RecommendedAction.INCREASE_BUFFER, 'slope_negative_3s', slope_pct_per_min)

        # Hysteresis: only return to OK after sustained recovery
        if self._current_action != RecommendedAction.OK:
            if self._recovery_seconds >= RECOVERY_GRACE_S:
                self._current_action = RecommendedAction.OK
                return ActionResult(RecommendedAction.OK, 'recovered', slope_pct_per_min)
            # Otherwise hold prior action
            return ActionResult(self._current_action, 'hysteresis_hold', slope_pct_per_min)

        return ActionResult(RecommendedAction.OK, 'nominal', slope_pct_per_min)

    @staticmethod
    def _compute_slope_pct_per_min(actual_mbps: float, slope_mbps_per_s: float) -> float:
        """Convert Mbps/s to signed %/min relative to current actual.

        Returns 0.0 when actual_mbps is too low to derive meaningful percentage.
        """
        if actual_mbps < 0.5:  # Below 0.5 Mbps = no signal
            return 0.0
        return (slope_mbps_per_s * 60.0 / actual_mbps) * 100.0
```

- [ ] **Step 2: Run tests — expect all 11 PASS**

```bash
cd IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian && python -m pytest tests/test_recommended_action.py -v
```

Expected: `11 passed`.

- [ ] **Step 3: Run ALL tests to ensure no regression**

```bash
cd IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian && python -m pytest tests/ -v
```

Expected: 60 passed (49 baseline + 11 new).

- [ ] **Step 4: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/recommended_action.py
git commit -m "guardian: add RecommendedActionEngine state machine (TDD green, 11 tests)"
```

---

## Task 3 — Wire `RecommendedActionEngine` into main daemon loop

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/main.py`

- [ ] **Step 1: Add import (around line 31)**

In `main.py`, find the existing block:

```python
from .decision_engine import DemandDecisionEngine
```

Add immediately after:

```python
from .recommended_action import RecommendedAction, RecommendedActionEngine
```

- [ ] **Step 2: Instantiate engine after `decision_engine` (around line 96)**

Find:

```python
        decision_engine = DemandDecisionEngine(
            min_demand_mbps=cfg.service.min_demand_mbps,
            max_safe_demand_mbps=cfg.service.max_safe_demand_mbps,
        )
```

Add immediately after:

```python
        # Phase A: Predictive floor-enforcement state machine (PDFs 1+2+3)
        rec_action_engine = RecommendedActionEngine()
```

- [ ] **Step 3: Compute action per cycle, after the existing `decision = ...` block (around line 193)**

Find:

```python
                    # 7. Compute demand
                    decision = decision_engine.compute(
                        target_mbps=cfg.service.target_bitrate_mbps,
                        deficit=deficit,
                        buffer=buffer,
                        prediction=prediction,
                        vps_protection=vps_protection,
                    )
```

Add immediately after:

```python
                    # 7b. Predictive floor-enforcement action (Phase A)
                    rec_result = rec_action_engine.evaluate(
                        actual_mbps=metrics.actual_bitrate_mbps,
                        floor_kbps=getattr(metrics, 'bitrate_floor_kbps', 0),
                        slope_mbps_per_s=prediction.slope_mbps_per_s,
                        dt_s=cfg.service.interval_seconds,
                    )
```

- [ ] **Step 4: Run pytest to confirm no regression from main.py edit (it's not directly tested but pytest collects all)**

```bash
cd IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian && python -m pytest tests/ -v
```

Expected: 60 passed. If `ImportError` or syntax error, fix and re-run.

- [ ] **Step 5: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/main.py
git commit -m "guardian: wire RecommendedActionEngine into 1Hz main loop"
```

---

## Task 4 — Surface `rec_action` in audit JSONL

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/main.py` (~L221-244 audit_entry dict)

- [ ] **Step 1: Add 3 fields to `audit_entry`**

Find the existing `audit_entry = {...}` block and locate the line:

```python
                        'probe_ms': round(metrics.total_latency_ms, 1),
```

Replace the closing `}` immediately after this line with:

```python
                        'probe_ms': round(metrics.total_latency_ms, 1),
                        # Phase A — predictive floor enforcement
                        'rec_action': rec_result.action.value,
                        'rec_reason': rec_result.reason,
                        'slope_pct_per_min': round(rec_result.slope_pct_per_min, 2),
                    }
```

(Note: keep the existing `res`, `codec`, `hw`, `floor_kbps`, `floor_viol`, `floor_deficit` fields if they were already added per Task 0 sync.)

- [ ] **Step 2: Validate with `--once` locally**

```bash
cd IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian && python -m ape_realtime_guardian.main --config config/config.yaml.example --once 2>&1 | grep -E 'demand=|rec_action|cycle'
```

Expected: 1 cycle runs; check `audit.jsonl` written:

```bash
tail -1 /tmp/ape-realtime-guardian/audit.jsonl 2>/dev/null || tail -1 ./audit.jsonl
```

Expected: JSON with `"rec_action": "OK"`, `"rec_reason": "nominal"` (or `floor_unknown` if no ADB device), and `"slope_pct_per_min": 0.0`.

- [ ] **Step 3: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/main.py
git commit -m "guardian: surface rec_action + rec_reason + slope_pct_per_min in audit JSONL"
```

---

## Task 5 — Deploy to VPS

**Files (deployed):**
- `/opt/ape-realtime-guardian/ape_realtime_guardian/recommended_action.py` (NEW)
- `/opt/ape-realtime-guardian/ape_realtime_guardian/main.py` (UPDATED)

- [ ] **Step 1: Pre-flight VPS health check**

```bash
ssh root@178.156.147.234 'echo "=== NGINX ===" && nginx -t 2>&1 | tail -2 && echo "=== GUARDIAN ===" && systemctl is-active ape-realtime-guardian && echo "=== ADB ===" && cat /dev/shm/adb_persistence_state.json | head -20'
```

Expected: nginx OK, guardian `active`, ADB Fire Stick `device`.

- [ ] **Step 2: SCP both files**

```bash
scp IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/recommended_action.py root@178.156.147.234:/opt/ape-realtime-guardian/ape_realtime_guardian/recommended_action.py
scp IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/main.py root@178.156.147.234:/opt/ape-realtime-guardian/ape_realtime_guardian/main.py
```

- [ ] **Step 3: Clear pycache and restart**

```bash
ssh root@178.156.147.234 "find /opt/ape-realtime-guardian -name '__pycache__' -exec rm -rf {} + 2>/dev/null; find /opt/ape-realtime-guardian -name '*.pyc' -delete 2>/dev/null; systemctl restart ape-realtime-guardian && sleep 8 && systemctl is-active ape-realtime-guardian"
```

Expected: `active`. If `failed`, check `journalctl -u ape-realtime-guardian -n 30 --no-pager` and abort.

- [ ] **Step 4: Verify Prometheus + audit emission**

```bash
ssh root@178.156.147.234 "tail -3 /var/log/ape-realtime-guardian/audit.jsonl"
```

Expected: each line contains `"rec_action": "..."`, `"rec_reason": "..."`, `"slope_pct_per_min": ...`.

If a line is missing these fields → check `journalctl -u ape-realtime-guardian -n 50 --no-pager | grep -i error` and rollback (Step 6).

- [ ] **Step 5: Commit deploy artifacts**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/
git commit -m "guardian: deploy Phase A predictive floor-action to VPS"
```

- [ ] **Step 6 (only if Step 4 fails): Rollback**

```bash
ssh root@178.156.147.234 "rm /opt/ape-realtime-guardian/ape_realtime_guardian/recommended_action.py; cd /opt/ape-realtime-guardian && git diff HEAD ape_realtime_guardian/main.py 2>/dev/null || true"
```

Restore previous `main.py` (the version on VPS before Task 5):

```bash
git -C IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian show HEAD~1:ape_realtime_guardian/main.py | ssh root@178.156.147.234 "cat > /opt/ape-realtime-guardian/ape_realtime_guardian/main.py"
ssh root@178.156.147.234 "systemctl restart ape-realtime-guardian"
```

Confirm `active` then triage in next session.

---

## Task 6 — Live verification with reproducción real

**Files:** none modified — observation only.

- [ ] **Step 1: Open audit log live tail**

```bash
ssh root@178.156.147.234 "tail -f /var/log/ape-realtime-guardian/audit.jsonl"
```

Leave running. Move to Step 2 in another terminal.

- [ ] **Step 2: Reproduce Sky Sports 4K in OTT Navigator on Fire Stick Cali**

User action: open OTT Navigator and select `|UK| Sky Sports Main Events 4K` channel. Wait for video to render.

- [ ] **Step 3: Capture 60s sample, verify expected actions**

Wait 60 seconds with the channel playing. In a third terminal:

```bash
ssh root@178.156.147.234 "tail -60 /var/log/ape-realtime-guardian/audit.jsonl | python3 -c 'import sys, json; lines=[json.loads(l) for l in sys.stdin]; [print(f\"{l[\"cycle\"]}: actual={l[\"actual_mbps\"]:.1f} floor={l.get(\"floor_kbps\",0)/1000:.0f} slope={l[\"slope_pct_per_min\"]:+.1f}%/min action={l[\"rec_action\"]} reason={l[\"rec_reason\"]}\") for l in lines if \"rec_action\" in l]'"
```

Expected behavior for Sky Sports 4K (provider transmits 3-7 Mbps, floor=14 Mbps):
- Cycles 1-5: `actual=6.x`, `action=OK` (in grace period)
- Cycles 6+: `action=FLOOR_VIOLATION`, `reason=floor_violation_5s`
- If slope steeply negative (e.g. user changes channel mid-test): possibly `action=CRITICAL`, `reason=slope_critical`

- [ ] **Step 4: Confirm hysteresis on recovery (channel change to high-bitrate)**

Switch to a channel with stable bitrate close to/above floor (any FHD channel ≥ 6 Mbps where floor = 5 Mbps). After 3+ seconds:

```bash
ssh root@178.156.147.234 "tail -10 /var/log/ape-realtime-guardian/audit.jsonl | python3 -c 'import sys, json; [print(json.loads(l).get(\"rec_action\",\"-\")+\" \"+json.loads(l).get(\"rec_reason\",\"-\")) for l in sys.stdin]'"
```

Expected: action transitions `FLOOR_VIOLATION → hysteresis_hold → OK (recovered)` after ≥3s sustained above `floor*1.10`.

- [ ] **Step 5 (optional): Update VPS-side memory entry**

If everything works, append to `reference_ape_realtime_guardian_v1_DEPLOYED.md`:

```bash
echo "
## Phase A — Predictive Floor Action (deployed $(date -u +%Y-%m-%d))
- New module: recommended_action.py (RecommendedActionEngine state machine)
- Audit fields added: rec_action, rec_reason, slope_pct_per_min
- Constants: SLOPE_TRIGGER=-15%/min, SLOPE_CRITICAL=-30%/min, FLOOR_GRACE=5s, RECOVER_MULT=1.10
" >> ~/.claude/projects/c--Users-HFRC-Desktop-IPTV-Navigator-PRO-v5-4-MAX-AGGRESSION/memory/reference_ape_realtime_guardian_v1_DEPLOYED.md
```

---

## Verification (full cycle)

After all tasks complete:

| Check | Command | Expected |
|---|---|---|
| Tests green | `pytest tests/ -v` (local) | 60+ passed |
| Daemon active | `ssh root@VPS systemctl is-active ape-realtime-guardian` | `active` |
| Audit has rec_action | `ssh root@VPS "tail -1 /var/log/ape-realtime-guardian/audit.jsonl"` | JSON contains `rec_action` field |
| State machine transitions | Watch tail during channel switch | `OK → FLOOR_VIOLATION → OK` cycle |
| No regression in demand | `tail -3 audit.jsonl` | `demand_mbps`, `target_mbps`, `buffer_state` unchanged in calculation logic |
| Memory < 25 MB | `systemctl show ape-realtime-guardian -p MemoryCurrent` | <25 MB (was ~18 before) |
| Cycle time < 100ms | check `cycle_ms` in audit | <100ms p95 |

---

## Rollback (if any task fails post-deploy)

| Severity | Command | Time |
|---|---|---|
| Restart only | `ssh root@VPS systemctl restart ape-realtime-guardian` | <5s |
| Revert main.py | Task 5 Step 6 above | ~10s |
| Full disable | `ssh root@VPS systemctl stop ape-realtime-guardian && systemctl disable ape-realtime-guardian` | <2s |

The Guardian remains in `dry_run=false, adapter=shm_write` mode — even if Phase A misbehaves, the `shm_write` adapter only writes to `/dev/shm/ape_bitrate_demand.json` which **no other system reads**. Worst case: stale demand JSON, never affects playback.

---

## Out of scope (separate plans)

- **Phase B**: LIVE/VOD detection from manifest `#EXT-X-ENDLIST`, content-aware buffer profiles
- **Phase C**: Active enforcement — manifest rewrite via PHP/Lua endpoint OR TC qdisc shaping
- **TTFB / Packet Loss / Jitter probes**: would extend `server_side.py` probe; separate plan
- **100ms inner-loop telemetry** (PDF2 dual-level Nivel 1): refactor of main loop, separate plan
- **Alerting integration** (Slack/email on `CRITICAL`): separate plan
