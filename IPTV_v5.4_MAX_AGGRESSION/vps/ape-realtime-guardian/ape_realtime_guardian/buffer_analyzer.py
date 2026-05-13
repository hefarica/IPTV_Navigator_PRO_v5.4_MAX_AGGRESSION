"""
BufferStateAnalyzer — Classifies buffer health into 6 operational modes.

Piecewise function mapping buffer_percent to a state + factor multiplier.
Each state has a different urgency level that feeds into the demand formula.
"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger('ape-guardian.buffer')


class BufferState(str, Enum):
    """Buffer health states ordered by urgency."""
    STABLE = 'stable'           # >= 80% → No boost needed
    PREVENTIVE = 'preventive'   # >= 65% → Gentle boost (1.1×)
    RECOVERY = 'recovery'       # >= 50% → Moderate boost (1.3×)
    AGGRESSIVE = 'aggressive'   # >= 30% → Strong boost (1.6×)
    CRITICAL = 'critical'       # >= 10% → Maximum boost (2.0×)
    PROTECTION = 'protection'   # < 10%  → Emergency: clamp to safe minimum


# Multiplier applied to target bitrate based on buffer state
BUFFER_FACTORS = {
    BufferState.STABLE: 1.0,
    BufferState.PREVENTIVE: 1.1,
    BufferState.RECOVERY: 1.3,
    BufferState.AGGRESSIVE: 1.6,
    BufferState.CRITICAL: 2.0,
    BufferState.PROTECTION: 0.5,  # Protection reduces demand to save VPS
}


@dataclass
class BufferAnalysis:
    """Result of buffer state analysis."""
    state: BufferState
    factor: float
    buffer_percent: float
    description: str


class BufferStateAnalyzer:
    """
    Classifies buffer level into operational states.

    Thresholds are configurable via BufferThresholds dataclass.
    """

    def __init__(
        self,
        stable_min: float = 80.0,
        preventive_min: float = 65.0,
        recovery_min: float = 50.0,
        aggressive_min: float = 30.0,
        critical_min: float = 10.0,
    ):
        self._stable = stable_min
        self._preventive = preventive_min
        self._recovery = recovery_min
        self._aggressive = aggressive_min
        self._critical = critical_min

    def analyze(self, buffer_percent: float) -> BufferAnalysis:
        """
        Classify buffer level into a state with associated factor.

        Args:
            buffer_percent: Current buffer level (0.0 to 100.0+)

        Returns:
            BufferAnalysis with state, factor, and description.
        """
        buffer_percent = max(0.0, min(100.0, buffer_percent))

        if buffer_percent >= self._stable:
            state = BufferState.STABLE
            desc = f'Buffer healthy ({buffer_percent:.1f}%) — no boost needed'
        elif buffer_percent >= self._preventive:
            state = BufferState.PREVENTIVE
            desc = f'Buffer dipping ({buffer_percent:.1f}%) — gentle 10% boost'
        elif buffer_percent >= self._recovery:
            state = BufferState.RECOVERY
            desc = f'Buffer low ({buffer_percent:.1f}%) — 30% recovery boost'
        elif buffer_percent >= self._aggressive:
            state = BufferState.AGGRESSIVE
            desc = f'Buffer critical ({buffer_percent:.1f}%) — 60% aggressive boost'
        elif buffer_percent >= self._critical:
            state = BufferState.CRITICAL
            desc = f'Buffer emergency ({buffer_percent:.1f}%) — 100% maximum boost'
        else:
            state = BufferState.PROTECTION
            desc = f'Buffer collapsed ({buffer_percent:.1f}%) — PROTECTION mode, reducing demand'

        return BufferAnalysis(
            state=state,
            factor=BUFFER_FACTORS[state],
            buffer_percent=buffer_percent,
            description=desc,
        )
