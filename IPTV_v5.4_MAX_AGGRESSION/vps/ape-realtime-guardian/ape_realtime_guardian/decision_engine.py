"""
DemandDecisionEngine — Final demand wrapper.

Phase B refactor: delegates the core formula to MovingAverageDeficitEngine.
Keeps two safety nets:
  - x vps_protection_factor (CPU/RAM/load reduces demand to protect VPS)
  - clamp(min_demand_mbps, max_safe_demand_mbps) — hard ceiling

Drops:
  - DeficitCalculator integration (replaced by MA engine)
  - BufferStateAnalyzer factor (was target x buffer_factor — now MA replaces target)
  - PredictiveMarginEngine (slope migrates to MA engine)
"""

import logging
from dataclasses import dataclass

from .moving_average_deficit import MovingAverageResult
from .vps_protection import VPSProtectionResult

logger = logging.getLogger('ape-guardian.decision')


@dataclass
class DemandDecision:
    """Output of one demand calculation cycle."""
    final_demand_mbps: float
    demand_raw_mbps: float       # before vps_factor + clamp
    ma_5s: float
    ma_def: float
    floor_def: float
    slope_mbps_s: float
    zap_active: bool
    zap_grace_remaining: int
    zap_burst_floor_mbps: float
    cascade_multiplier: float
    cascade_floor_mbps: float
    cascade_active: bool
    vps_protection_factor: float
    protected_demand_mbps: float
    was_clamped_high: bool
    was_clamped_low: bool
    clamp_min: float
    clamp_max: float
    vps_stressed: bool


class DemandDecisionEngine:
    """
    Wrapper: takes MA result + VPS protection, produces final demand.

    Pure compute (no state, no I/O). All state lives in caller / sub-engines.
    """

    def __init__(
        self,
        min_demand_mbps: float = 5.0,
        max_safe_demand_mbps: float = 80.0,
    ):
        self._min = min_demand_mbps
        self._max = max_safe_demand_mbps

    def compute(
        self,
        ma_result: MovingAverageResult,
        vps_protection: VPSProtectionResult,
    ) -> DemandDecision:
        """Compute final demand from MA result + VPS protection."""
        raw = ma_result.demand_raw

        # Apply VPS protection factor
        protected = raw * vps_protection.factor

        # Clamp to safe range
        clamped_low = protected < self._min
        clamped_high = protected > self._max
        final = max(self._min, min(self._max, protected))

        if clamped_high:
            logger.warning(f'Demand clamped HIGH: {protected:.1f} → {final:.1f} Mbps')
        if clamped_low:
            logger.debug(f'Demand clamped LOW: {protected:.1f} → {final:.1f} Mbps')

        return DemandDecision(
            final_demand_mbps=final,
            demand_raw_mbps=raw,
            ma_5s=ma_result.ma_5s,
            ma_def=ma_result.ma_def,
            floor_def=ma_result.floor_def,
            slope_mbps_s=ma_result.slope_mbps_s,
            zap_active=ma_result.zap_active,
            zap_grace_remaining=ma_result.zap_grace_remaining,
            zap_burst_floor_mbps=ma_result.zap_burst_floor_mbps,
            cascade_multiplier=ma_result.cascade_multiplier,
            cascade_floor_mbps=ma_result.cascade_floor_mbps,
            cascade_active=ma_result.cascade_active,
            vps_protection_factor=vps_protection.factor,
            protected_demand_mbps=protected,
            was_clamped_high=clamped_high,
            was_clamped_low=clamped_low,
            clamp_min=self._min,
            clamp_max=self._max,
            vps_stressed=vps_protection.is_stressed,
        )
