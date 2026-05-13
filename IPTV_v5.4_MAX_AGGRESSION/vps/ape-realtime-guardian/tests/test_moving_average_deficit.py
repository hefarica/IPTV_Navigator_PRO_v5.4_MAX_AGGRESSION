"""Tests for MovingAverageDeficitEngine — 5s window, floor-aware, zap-grace, cascade burst."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ape_realtime_guardian.moving_average_deficit import (
    MovingAverageDeficitEngine,
    MovingAverageResult,
)


class TestMovingAverageDeficitEngine:
    """TDD tests for MA-based demand formula with zap-aware grace period."""

    def test_initial_state_no_samples(self):
        """Engine starts empty — first call with actual=0 uses floor + floor_def."""
        engine = MovingAverageDeficitEngine()
        r = engine.compute(actual_mbps=0.0, floor_mbps=14.0, zap_detected=False)
        # demand = max(MA=0, floor=14) + ma_def=0 + floor_def=14 = 28
        assert r.demand_raw == 28.0
        assert r.ma_5s == 0.0
        assert r.ma_def == 0.0
        assert r.floor_def == 14.0  # 14 - 0
        assert r.slope_mbps_s == 0.0

    def test_steady_above_floor_returns_ma(self):
        """5 cycles at 18 Mbps, floor=14 -> MA=18, no deficit, demand=18."""
        engine = MovingAverageDeficitEngine()
        r = None
        for _ in range(5):
            r = engine.compute(actual_mbps=18.0, floor_mbps=14.0, zap_detected=False)
        assert r.ma_5s == 18.0
        assert r.ma_def == 0.0
        assert r.floor_def == 0.0
        assert r.demand_raw == 18.0

    def test_steady_below_floor_returns_floor_plus_def(self):
        """5 cycles at 9 Mbps, floor=14 -> MA=9, floor_def=5, demand=floor+5=19.
        No cascade because bitrate is STEADY (not dropping)."""
        engine = MovingAverageDeficitEngine()
        r = None
        for _ in range(5):
            r = engine.compute(actual_mbps=9.0, floor_mbps=14.0, zap_detected=False)
        assert r.ma_5s == 9.0
        assert r.ma_def == 0.0
        assert r.floor_def == 5.0
        assert r.demand_raw == 19.0  # max(9, 14) + 0 + 5
        assert r.cascade_active is False  # steady — no cascade

    def test_dip_below_ma_compensates(self):
        """deque=[9,9,9,9,6], MA=8.4, dip detected. Cascade triggers on cycle 5
        because 6 < 9 AND 6 < 14. effective_floor = max(6*2, 14*1.3) = max(12, 18.2) = 18.2"""
        engine = MovingAverageDeficitEngine()
        for v in [9.0, 9.0, 9.0, 9.0]:
            engine.compute(actual_mbps=v, floor_mbps=14.0, zap_detected=False)
        r = engine.compute(actual_mbps=6.0, floor_mbps=14.0, zap_detected=False)
        assert abs(r.ma_5s - 8.4) < 0.01
        assert abs(r.ma_def - 2.4) < 0.01
        # cascade_floor = max(6*2=12, 14*1.3=18.2) = 18.2
        assert r.cascade_active is True
        assert r.cascade_multiplier == 1.3
        assert abs(r.cascade_floor_mbps - 18.2) < 0.01
        assert abs(r.floor_def - 12.2) < 0.01  # 18.2 - 6

    def test_recovery_to_floor_returns_floor_exactly(self):
        """Ramp to 14 Mbps exactly: MA=12, actual=14 -> no deficit, demand=14."""
        engine = MovingAverageDeficitEngine()
        for v in [10.0, 11.0, 12.0, 13.0]:
            engine.compute(actual_mbps=v, floor_mbps=14.0, zap_detected=False)
        r = engine.compute(actual_mbps=14.0, floor_mbps=14.0, zap_detected=False)
        assert abs(r.ma_5s - 12.0) < 0.01
        assert r.ma_def == 0.0      # actual >= MA
        assert r.floor_def == 0.0   # actual >= floor
        assert r.demand_raw == 14.0  # max(12, 14)

    def test_zap_detected_triggers_grace_returns_floor(self):
        """zap_detected=True -> engine clears deque, returns floor for 5 cycles."""
        engine = MovingAverageDeficitEngine()
        for _ in range(5):
            engine.compute(actual_mbps=20.0, floor_mbps=14.0, zap_detected=False)
        r = engine.compute(actual_mbps=2.0, floor_mbps=5.0, zap_detected=True)
        assert r.demand_raw == 5.0
        assert r.zap_active is True
        assert r.zap_grace_remaining == 4

    def test_zap_grace_decrements_each_cycle(self):
        """After zap, 5 cycles return floor; cycle 6 resumes normal MA logic."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=10.0, floor_mbps=5.0, zap_detected=True)
        for expected_remaining in [3, 2, 1, 0]:
            r = engine.compute(actual_mbps=8.0, floor_mbps=5.0, zap_detected=False)
            assert r.demand_raw == 5.0
            assert r.zap_grace_remaining == expected_remaining
        r = engine.compute(actual_mbps=8.0, floor_mbps=5.0, zap_detected=False)
        assert r.zap_active is False
        assert r.ma_5s == 8.0
        assert r.demand_raw == 8.0

    def test_zap_clears_deque(self):
        """Zap drops all old samples — no contamination from previous channel."""
        engine = MovingAverageDeficitEngine()
        for _ in range(5):
            engine.compute(actual_mbps=20.0, floor_mbps=14.0, zap_detected=False)
        engine.compute(actual_mbps=2.5, floor_mbps=2.0, zap_detected=True)
        for _ in range(5):
            engine.compute(actual_mbps=2.5, floor_mbps=2.0, zap_detected=False)
        r = engine.compute(actual_mbps=2.5, floor_mbps=2.0, zap_detected=False)
        assert r.ma_5s == 2.5
        assert r.demand_raw == 2.5

    def test_collapse_to_zero_aggressive_compensation(self):
        """deque=[9,9,9,5,0], drop detected on 5 and 0.
        Cascade triggers: actual=0 < prev=5 AND 0 < 14 -> L2 (continued drop).
        cascade_floor = max(0*2=0, 14*1.6=22.4) = 22.4"""
        engine = MovingAverageDeficitEngine()
        for v in [9.0, 9.0, 9.0, 5.0]:
            engine.compute(actual_mbps=v, floor_mbps=14.0, zap_detected=False)
        r = engine.compute(actual_mbps=0.0, floor_mbps=14.0, zap_detected=False)
        assert abs(r.ma_5s - 6.4) < 0.01
        assert abs(r.ma_def - 6.4) < 0.01
        # cascade_floor = max(0, 14*1.6) = 22.4
        assert r.cascade_multiplier == 1.6
        assert abs(r.cascade_floor_mbps - 22.4) < 0.01
        assert abs(r.floor_def - 22.4) < 0.01  # 22.4 - 0

    def test_floor_zero_no_floor_def(self):
        """floor_kbps=0 (resolution unknown) -> floor_def disabled."""
        engine = MovingAverageDeficitEngine()
        for _ in range(5):
            r = engine.compute(actual_mbps=2.0, floor_mbps=0.0, zap_detected=False)
        assert r.floor_def == 0.0
        assert r.demand_raw == 2.0

    def test_lsr_slope_increasing(self):
        """Linear ramp 16->18 over 5 samples -> slope = +0.5 Mbps/s."""
        engine = MovingAverageDeficitEngine()
        for v in [16.0, 16.5, 17.0, 17.5, 18.0]:
            r = engine.compute(actual_mbps=v, floor_mbps=14.0, zap_detected=False)
        assert r.slope_mbps_s > 0.4
        assert r.slope_mbps_s < 0.6

    def test_lsr_slope_decreasing(self):
        """Linear drop 18->14 over 5 samples -> slope ~ -1.0 Mbps/s."""
        engine = MovingAverageDeficitEngine()
        for v in [18.0, 17.0, 16.0, 15.0, 14.0]:
            r = engine.compute(actual_mbps=v, floor_mbps=14.0, zap_detected=False)
        assert r.slope_mbps_s < -0.9
        assert r.slope_mbps_s > -1.1

    def test_lsr_slope_flat_returns_zero(self):
        """5 identical samples -> slope = 0."""
        engine = MovingAverageDeficitEngine()
        for _ in range(5):
            r = engine.compute(actual_mbps=12.0, floor_mbps=14.0, zap_detected=False)
        assert abs(r.slope_mbps_s) < 0.01

    def test_demand_raw_never_negative(self):
        """Pathological negative inputs -> demand_raw remains floor at minimum."""
        engine = MovingAverageDeficitEngine()
        r = engine.compute(actual_mbps=-5.0, floor_mbps=14.0, zap_detected=False)
        assert r.demand_raw >= 14.0

    def test_zap_burst_floor_overrides_normal_floor(self):
        """During zap grace, burst_floor=60 overrides floor=14 -> demand=60."""
        engine = MovingAverageDeficitEngine()
        for _ in range(5):
            engine.compute(actual_mbps=18.0, floor_mbps=14.0, zap_detected=False)
        r = engine.compute(
            actual_mbps=2.0, floor_mbps=14.0,
            zap_detected=True, zap_burst_floor_mbps=60.0,
        )
        assert r.demand_raw == 60.0
        assert r.zap_active is True
        assert r.zap_burst_floor_mbps == 60.0
        assert r.floor_def == 58.0

    def test_zap_burst_floor_does_not_apply_post_grace(self):
        """After grace expires, burst floor is ignored — normal MA logic resumes."""
        engine = MovingAverageDeficitEngine(zap_grace=2)
        engine.compute(actual_mbps=10.0, floor_mbps=14.0,
                       zap_detected=True, zap_burst_floor_mbps=60.0)
        engine.compute(actual_mbps=10.0, floor_mbps=14.0,
                       zap_detected=False, zap_burst_floor_mbps=60.0)
        r = engine.compute(actual_mbps=10.0, floor_mbps=14.0,
                           zap_detected=False, zap_burst_floor_mbps=60.0)
        assert r.zap_active is False
        assert r.zap_burst_floor_mbps == 0.0
        assert r.demand_raw == 18.0  # max(10, 14) + 0 + 4

    def test_zap_burst_floor_hd_30(self):
        """HD channel burst: burst_floor=30 > floor=5 -> demand=30 during grace."""
        engine = MovingAverageDeficitEngine()
        r = engine.compute(
            actual_mbps=3.0, floor_mbps=5.0,
            zap_detected=True, zap_burst_floor_mbps=30.0,
        )
        assert r.demand_raw == 30.0
        assert r.zap_burst_floor_mbps == 30.0

    # ── Cascade Burst Tests ──────────────────────────────────────────

    def test_cascade_l1_on_first_drop_below_floor(self):
        """When actual drops below prev AND below floor -> cascade L1 (1.3x).
        effective_floor = max(12*2=24, 14*1.3=18.2) = 24."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=13.0, floor_mbps=14.0, zap_detected=False)
        r = engine.compute(actual_mbps=12.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.3
        assert r.cascade_active is True
        # effective_floor = max(12*2, 14*1.3) = max(24, 18.2) = 24
        assert abs(r.cascade_floor_mbps - 24.0) < 0.01

    def test_cascade_l2_on_continued_drop(self):
        """Continued dropping escalates to L2 (1.6x).
        effective_floor = max(10*2=20, 14*1.6=22.4) = 22.4."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=13.0, floor_mbps=14.0, zap_detected=False)
        engine.compute(actual_mbps=12.0, floor_mbps=14.0, zap_detected=False)  # L1
        r = engine.compute(actual_mbps=10.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.6
        assert abs(r.cascade_floor_mbps - 22.4) < 0.01

    def test_cascade_no_deescalate_before_4_stable(self):
        """Cascade stays at L2 until 4 consecutive stable samples."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=13.0, floor_mbps=14.0, zap_detected=False)
        engine.compute(actual_mbps=12.0, floor_mbps=14.0, zap_detected=False)  # L1
        engine.compute(actual_mbps=10.0, floor_mbps=14.0, zap_detected=False)  # L2
        # 3 stable cycles (below 4 needed)
        for _ in range(3):
            r = engine.compute(actual_mbps=11.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.6  # still L2, need 4 samples

    def test_cascade_deescalate_after_4_stable(self):
        """After 4 consecutive stable samples, L2 -> L1."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=13.0, floor_mbps=14.0, zap_detected=False)
        engine.compute(actual_mbps=12.0, floor_mbps=14.0, zap_detected=False)  # L1
        engine.compute(actual_mbps=10.0, floor_mbps=14.0, zap_detected=False)  # L2
        # 4 stable cycles
        for _ in range(4):
            r = engine.compute(actual_mbps=11.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.3  # de-escalated to L1

    def test_cascade_off_when_recovered_above_floor(self):
        """When actual >= floor for 4+ samples -> cascade resets to 1.0x."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=13.0, floor_mbps=14.0, zap_detected=False)
        engine.compute(actual_mbps=12.0, floor_mbps=14.0, zap_detected=False)  # L1
        # Recover above floor for 4 samples
        for _ in range(4):
            r = engine.compute(actual_mbps=15.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.0
        assert r.cascade_active is False

    def test_cascade_no_activate_above_floor(self):
        """Drops that stay above floor do NOT activate cascade."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=20.0, floor_mbps=14.0, zap_detected=False)
        r = engine.compute(actual_mbps=18.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.0
        assert r.cascade_active is False

    def test_cascade_resets_on_zap(self):
        """Zap clears cascade state."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=13.0, floor_mbps=14.0, zap_detected=False)
        engine.compute(actual_mbps=10.0, floor_mbps=14.0, zap_detected=False)  # L1
        r = engine.compute(actual_mbps=5.0, floor_mbps=14.0,
                           zap_detected=True, zap_burst_floor_mbps=60.0)
        assert r.cascade_active is False

    def test_cascade_actual_x2_wins_over_factor(self):
        """When actual×2 > floor×cascade_factor, use actual×2.
        actual=12, floor=10: max(24, 10*1.3=13) = 24."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=13.0, floor_mbps=10.0, zap_detected=False)
        r = engine.compute(actual_mbps=8.0, floor_mbps=10.0, zap_detected=False)
        assert r.cascade_active is True
        # max(8*2=16, 10*1.3=13) = 16
        assert abs(r.cascade_floor_mbps - 16.0) < 0.01

    def test_cascade_full_sequence(self):
        """Full cascade: normal -> L1 -> L2 -> stabilize(4 samples) -> L1 -> recover."""
        engine = MovingAverageDeficitEngine()
        # Normal
        r = engine.compute(actual_mbps=15.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.0
        # Start dropping below floor
        r = engine.compute(actual_mbps=13.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.3  # L1
        # Keep dropping
        r = engine.compute(actual_mbps=11.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.6  # L2
        # Stabilize: need 4 consecutive stable samples
        for i in range(4):
            r = engine.compute(actual_mbps=12.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.3  # de-escalated to L1
        # Recover above floor: need 4 more
        for i in range(4):
            r = engine.compute(actual_mbps=14.5, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.0  # back to normal

    def test_cascade_stability_resets_on_new_drop(self):
        """If a new drop occurs during stabilization, counter resets."""
        engine = MovingAverageDeficitEngine()
        engine.compute(actual_mbps=13.0, floor_mbps=14.0, zap_detected=False)
        engine.compute(actual_mbps=12.0, floor_mbps=14.0, zap_detected=False)  # L1
        # 3 stable samples (not enough to de-escalate)
        for _ in range(3):
            engine.compute(actual_mbps=12.5, floor_mbps=14.0, zap_detected=False)
        # New drop! Resets counter and escalates
        r = engine.compute(actual_mbps=11.0, floor_mbps=14.0, zap_detected=False)
        assert r.cascade_multiplier == 1.6  # escalated to L2
