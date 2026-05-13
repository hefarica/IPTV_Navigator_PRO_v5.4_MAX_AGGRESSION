"""
SpeedInjectionAdapter ABC — Base for all demand output backends.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict


class SpeedInjectionAdapter(ABC):
    """Abstract base for speed injection adapters."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Adapter identifier."""
        ...

    @abstractmethod
    async def apply(self, demand_mbps: float, state: Dict[str, Any],
                    metrics: Dict[str, Any]) -> bool:
        """
        Apply the computed demand.

        Returns True on success. Must not raise.
        """
        ...

    async def close(self) -> None:
        """Cleanup. Override if needed."""
        pass
