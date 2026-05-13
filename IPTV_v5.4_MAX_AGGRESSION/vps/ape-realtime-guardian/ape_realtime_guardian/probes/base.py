"""
Probe ABC — Base class for all telemetry probes.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

logger = logging.getLogger('ape-guardian.probe')


@dataclass
class ProbeResult:
    """Generic result from any probe."""
    source: str                          # Probe name
    success: bool = True                 # Whether probe completed
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    latency_ms: float = 0.0             # Time taken for this probe


class Probe(ABC):
    """Abstract base for telemetry probes."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique probe identifier."""
        ...

    @abstractmethod
    async def collect(self) -> ProbeResult:
        """Collect telemetry. Must not raise — return error in ProbeResult."""
        ...

    async def close(self) -> None:
        """Cleanup resources. Override if needed."""
        pass
