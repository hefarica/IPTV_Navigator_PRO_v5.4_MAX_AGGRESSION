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

        # Disabled mode: floor unknown — preserve state, don't evaluate or reset
        # This happens on 'cached' cycles between ADB probes. We must NOT reset
        # _below_floor_seconds or _current_action, otherwise the 5s grace period
        # can never accumulate across intermittent ADB readings.
        if floor_kbps <= 0:
            return ActionResult(self._current_action, 'floor_unknown', slope_pct_per_min)

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
        else:
            # Dead zone (floor <= actual < recover_mbps): don't accumulate either
            pass

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
