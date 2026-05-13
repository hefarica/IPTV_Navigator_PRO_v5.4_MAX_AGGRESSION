"""
SimulatedAdapter — Log-only adapter for dry-run mode (day-1 default).

Writes nothing to the system. Only logs the decision.
"""

import logging
from typing import Any, Dict

from .base import SpeedInjectionAdapter

logger = logging.getLogger('ape-guardian.adapter.simulated')


class SimulatedAdapter(SpeedInjectionAdapter):
    """Day-1 default: observe only, no system writes."""

    @property
    def name(self) -> str:
        return 'simulated'

    async def apply(self, demand_mbps: float, state: Dict[str, Any],
                    metrics: Dict[str, Any]) -> bool:
        logger.info(f'[SIMULATED] demand={demand_mbps:.2f} Mbps | '
                    f'buffer_state={state.get("buffer_state", "?")} | '
                    f'buffer_pct={metrics.get("buffer_percent", "?"):.1f}%')
        return True
