"""
MovingAverageDeficitEngine — Bitrate-floor enforcement via 5s moving average.

Replaces:
  - DeficitCalculator (cumulative deficit accumulator)
  - PredictiveMarginEngine (slope/jitter/TTFB margin)

Formula (normal mode):
    deque.append(actual)
    MA          = mean(deque)
    ma_def      = max(0, MA - actual)
    floor_def   = max(0, effective_floor - actual)
    demand_raw  = max(MA, effective_floor) + ma_def + floor_def

Cascade Burst (when actual drops below prev AND below floor):
    effective_floor = max(actual × 2, floor × cascade_factor)
    Level 1: cascade_factor = 1.3 (first drop)
    Level 2: cascade_factor = 1.6 (continued dropping)
    De-escalation requires 4 consecutive stable samples.

Zap Burst (channel change):
    effective_floor = max(floor, zap_burst_floor)  for 5s grace

Sources:
  - User specification 2026-04-27 "Burst en Cascada Predictivo"
  - Whitepaper APE v15 §3.1
"""

import logging
from collections import deque
from dataclasses import dataclass
from typing import Deque

logger = logging.getLogger('ape-guardian.ma_deficit')

# Constants
MA_WINDOW_SECONDS = 5
ZAP_GRACE_SECONDS = 5

# Cascade Burst multipliers
CASCADE_NONE = 1.0      # normal — floor × 1.0
CASCADE_LEVEL_1 = 1.3   # first drop — floor × 1.3
CASCADE_LEVEL_2 = 1.6   # continued drop — floor × 1.6

# Stability: consecutive samples needed to de-escalate one level
CASCADE_STABLE_SAMPLES = 4


@dataclass
class MovingAverageResult:
    """Per-cycle output of the engine."""
    demand_raw: float           # final demand BEFORE vps_factor + clamp (Mbps)
    ma_5s: float                # 5s moving average of actual_mbps
    ma_def: float               # dip deficit (max(0, MA - actual))
    floor_def: float            # floor undershoot (max(0, effective_floor - actual))
    slope_mbps_s: float         # LSR slope of deque (Mbps/s)
    zap_active: bool            # True during grace period
    zap_grace_remaining: int    # countdown (0 when grace expired)
    zap_burst_floor_mbps: float # burst floor applied during grace (0 if not zapping)
    cascade_multiplier: float   # 1.0 / 1.3 / 1.6 — current cascade level
    cascade_floor_mbps: float   # effective floor after cascade (may include actual×2)
    cascade_active: bool        # True when multiplier > 1.0
    samples_count: int          # current deque length


class MovingAverageDeficitEngine:
    """
    Pure compute engine — state lives entirely inside the instance.

    Public method: compute(actual_mbps, floor_mbps, zap_detected) -> MovingAverageResult

    Threading: NOT thread-safe. Designed for single-loop asyncio usage.
    """

    def __init__(
        self,
        window_size: int = MA_WINDOW_SECONDS,
        zap_grace: int = ZAP_GRACE_SECONDS,
    ):
        self._window = max(2, window_size)
        self._zap_grace_max = max(1, zap_grace)
        self._deque: Deque[float] = deque(maxlen=self._window)
        self._zap_grace_remaining: int = 0

        # Cascade burst state
        self._cascade_multiplier: float = CASCADE_NONE
        self._prev_actual_mbps: float = -1.0  # -1 = no previous sample yet
        self._stable_count: int = 0           # consecutive stable samples for de-escalation

    def compute(
        self,
        actual_mbps: float,
        floor_mbps: float,
        zap_detected: bool,
        zap_burst_floor_mbps: float = 0.0,
    ) -> MovingAverageResult:
        """
        One cycle of the engine.

        Args:
            actual_mbps: current measured bitrate (Mbps).
            floor_mbps: profile-derived floor (Mbps). 14/5/2/1 typical. 0 disables.
            zap_detected: True iff this cycle the ADB probe detected a zap event.
            zap_burst_floor_mbps: aggressive floor for zap grace period.
                                  Typical: SD=20, HD=30, FHD=40, 4K=60.

        Returns:
            MovingAverageResult with demand_raw + telemetry.
        """
        # Zap signal: clear deque, start grace countdown, reset cascade
        if zap_detected:
            self._deque.clear()
            self._zap_grace_remaining = self._zap_grace_max
            self._cascade_multiplier = CASCADE_NONE
            self._prev_actual_mbps = -1.0
            self._stable_count = 0
            logger.info(f'Zap detected — deque cleared, grace={self._zap_grace_max}s, '
                        f'burst_floor={zap_burst_floor_mbps:.0f} Mbps')

        # Grace period: emit burst floor for aggressive buffer fill
        if self._zap_grace_remaining > 0:
            grace_after = self._zap_grace_remaining - 1
            self._zap_grace_remaining = grace_after
            effective_floor = max(floor_mbps, zap_burst_floor_mbps)
            return MovingAverageResult(
                demand_raw=max(0.0, effective_floor),
                ma_5s=0.0,
                ma_def=0.0,
                floor_def=max(0.0, effective_floor - actual_mbps),
                slope_mbps_s=0.0,
                zap_active=True,
                zap_grace_remaining=grace_after,
                zap_burst_floor_mbps=effective_floor,
                cascade_multiplier=CASCADE_NONE,
                cascade_floor_mbps=effective_floor,
                cascade_active=False,
                samples_count=0,
            )

        # ── Cascade Burst Logic ──────────────────────────────────────────
        # Only activates when there's an actual DROP (ultimo < penultimo)
        # AND the value is below floor. Steady-below-floor does NOT trigger.
        if floor_mbps > 0 and self._prev_actual_mbps >= 0:
            if actual_mbps < self._prev_actual_mbps and actual_mbps < floor_mbps:
                # DROPPING: actual fell below previous AND below floor → escalate
                self._stable_count = 0  # reset stability counter
                if self._cascade_multiplier < CASCADE_LEVEL_1:
                    self._cascade_multiplier = CASCADE_LEVEL_1
                elif self._cascade_multiplier < CASCADE_LEVEL_2:
                    self._cascade_multiplier = CASCADE_LEVEL_2
                logger.info(f'Cascade ESCALATE: {self._cascade_multiplier:.1f}x '
                            f'(actual={actual_mbps:.1f} < prev={self._prev_actual_mbps:.1f})')

            elif self._cascade_multiplier > CASCADE_NONE:
                # Cascade is active — check for stabilization/recovery
                if actual_mbps >= floor_mbps:
                    # RECOVERED above floor
                    self._stable_count += 1
                    if self._stable_count >= CASCADE_STABLE_SAMPLES:
                        # Enough stable samples — de-escalate one level
                        if self._cascade_multiplier >= CASCADE_LEVEL_2:
                            self._cascade_multiplier = CASCADE_LEVEL_1
                            logger.info('Cascade: 1.6x → 1.3x (recovered above floor)')
                        else:
                            self._cascade_multiplier = CASCADE_NONE
                            logger.info('Cascade OFF (stable above floor)')
                        self._stable_count = 0
                elif actual_mbps >= self._prev_actual_mbps:
                    # STABILIZING: not dropping but still below floor
                    self._stable_count += 1
                    if self._stable_count >= CASCADE_STABLE_SAMPLES:
                        if self._cascade_multiplier >= CASCADE_LEVEL_2:
                            self._cascade_multiplier = CASCADE_LEVEL_1
                            logger.info('Cascade: 1.6x → 1.3x (stabilizing)')
                        else:
                            self._cascade_multiplier = CASCADE_NONE
                            logger.info('Cascade OFF (stabilized)')
                        self._stable_count = 0
                else:
                    # Still dropping while cascade active — re-escalate
                    self._stable_count = 0
                    if self._cascade_multiplier < CASCADE_LEVEL_2:
                        self._cascade_multiplier = CASCADE_LEVEL_2

        # Track for next cycle
        self._prev_actual_mbps = actual_mbps

        # Compute effective floor:
        # cascade_floor = max(actual × 2, floor × cascade_factor)
        # When cascade is off (1.0x), this simplifies to max(actual×2, floor)
        # but we only apply the actual×2 boost when cascade is ACTIVE
        if self._cascade_multiplier > CASCADE_NONE:
            cascade_floor = max(actual_mbps * 2.0, floor_mbps * self._cascade_multiplier)
        else:
            cascade_floor = floor_mbps  # normal mode — no cascade boost

        # ── Normal MA mode ───────────────────────────────────────────────
        self._deque.append(actual_mbps)
        n = len(self._deque)

        if n == 0:
            ma = 0.0
        else:
            ma = sum(self._deque) / n

        ma_def = max(0.0, ma - actual_mbps)
        floor_def = max(0.0, cascade_floor - actual_mbps)
        demand_raw = max(ma, cascade_floor) + ma_def + floor_def

        slope = self._lsr_slope()

        return MovingAverageResult(
            demand_raw=demand_raw,
            ma_5s=ma,
            ma_def=ma_def,
            floor_def=floor_def,
            slope_mbps_s=slope,
            zap_active=False,
            zap_grace_remaining=0,
            zap_burst_floor_mbps=0.0,
            cascade_multiplier=self._cascade_multiplier,
            cascade_floor_mbps=cascade_floor,
            cascade_active=self._cascade_multiplier > CASCADE_NONE,
            samples_count=n,
        )

    def _lsr_slope(self) -> float:
        """Least-squares slope over deque (Mbps per sample = Mbps/s at 1Hz)."""
        n = len(self._deque)
        if n < 2:
            return 0.0
        sum_x = n * (n - 1) / 2
        sum_x2 = n * (n - 1) * (2 * n - 1) / 6
        sum_y = sum(self._deque)
        sum_xy = sum(i * y for i, y in enumerate(self._deque))
        denom = n * sum_x2 - sum_x * sum_x
        if abs(denom) < 1e-10:
            return 0.0
        return (n * sum_xy - sum_x * sum_y) / denom

    def reset(self) -> None:
        """Clear all state. Used by tests."""
        self._deque.clear()
        self._zap_grace_remaining = 0
        self._cascade_multiplier = CASCADE_NONE
        self._prev_actual_mbps = -1.0
        self._stable_count = 0
