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
        # actual_mbps = 14.0 (exactly at floor) → still violation (dead zone, no recovery)
        r = engine.evaluate(actual_mbps=14.0, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        assert r.action == RecommendedAction.FLOOR_VIOLATION
        # actual_mbps = 15.5 (clearly above 10% hysteresis of 14.0) → after sustained recovery → OK
        for _ in range(4):  # sustained 4s above hysteresis (covers boundary)
            r = engine.evaluate(actual_mbps=15.5, floor_kbps=14000, slope_mbps_per_s=0.0, dt_s=1.0)
        assert r.action == RecommendedAction.OK

    def test_floor_zero_disables_violation_check(self):
        """floor_kbps=0 (resolution unknown) → preserves current action, never triggers new FLOOR_VIOLATION."""
        engine = RecommendedActionEngine()
        for _ in range(10):
            r = engine.evaluate(actual_mbps=0.5, floor_kbps=0, slope_mbps_per_s=0.0, dt_s=1.0)
        # Initial action is OK, and floor_unknown preserves it
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
