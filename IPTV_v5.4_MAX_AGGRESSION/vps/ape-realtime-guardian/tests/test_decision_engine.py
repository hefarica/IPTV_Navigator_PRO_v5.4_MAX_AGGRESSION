"""Tests for refactored DemandDecisionEngine — wrapper over MA + VPS protection."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ape_realtime_guardian.decision_engine import DemandDecisionEngine, DemandDecision
from ape_realtime_guardian.moving_average_deficit import MovingAverageResult
from ape_realtime_guardian.vps_protection import VPSProtectionResult


def _ma(demand_raw=20.0, **kwargs):
    return MovingAverageResult(
        demand_raw=demand_raw,
        ma_5s=kwargs.get('ma_5s', 18.0),
        ma_def=kwargs.get('ma_def', 0.0),
        floor_def=kwargs.get('floor_def', 2.0),
        slope_mbps_s=kwargs.get('slope_mbps_s', 0.0),
        zap_active=kwargs.get('zap_active', False),
        zap_grace_remaining=kwargs.get('zap_grace_remaining', 0),
        zap_burst_floor_mbps=kwargs.get('zap_burst_floor_mbps', 0.0),
        cascade_multiplier=kwargs.get('cascade_multiplier', 1.0),
        cascade_floor_mbps=kwargs.get('cascade_floor_mbps', 14.0),
        cascade_active=kwargs.get('cascade_active', False),
        samples_count=kwargs.get('samples_count', 5),
    )


def _vps(factor=1.0, stressed=False):
    return VPSProtectionResult(
        factor=factor,
        is_stressed=stressed,
        worst_resource='none',
        worst_utilization=0.0,
        details='test',
    )


class TestDemandDecisionEngine:

    def test_passthrough_no_protection_no_clamp(self):
        engine = DemandDecisionEngine(min_demand_mbps=5.0, max_safe_demand_mbps=80.0)
        result = engine.compute(_ma(demand_raw=20.0), _vps(factor=1.0))
        assert result.final_demand_mbps == 20.0
        assert result.was_clamped_high is False
        assert result.was_clamped_low is False

    def test_vps_protection_reduces_demand(self):
        engine = DemandDecisionEngine()
        result = engine.compute(_ma(demand_raw=40.0), _vps(factor=0.5, stressed=True))
        assert result.protected_demand_mbps == 20.0
        assert result.final_demand_mbps == 20.0
        assert result.vps_stressed is True

    def test_clamp_high_at_max_safe(self):
        engine = DemandDecisionEngine(max_safe_demand_mbps=80.0)
        result = engine.compute(_ma(demand_raw=200.0), _vps(factor=1.0))
        assert result.final_demand_mbps == 80.0
        assert result.was_clamped_high is True

    def test_clamp_low_at_min(self):
        engine = DemandDecisionEngine(min_demand_mbps=5.0)
        result = engine.compute(_ma(demand_raw=2.0), _vps(factor=1.0))
        assert result.final_demand_mbps == 5.0
        assert result.was_clamped_low is True

    def test_propagates_telemetry(self):
        engine = DemandDecisionEngine()
        ma = _ma(demand_raw=15.0, ma_5s=12.0, ma_def=3.0, floor_def=2.0, slope_mbps_s=-0.5)
        result = engine.compute(ma, _vps(factor=1.0))
        assert result.ma_5s == 12.0
        assert result.ma_def == 3.0
        assert result.floor_def == 2.0
        assert result.slope_mbps_s == -0.5
