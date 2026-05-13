"""
VPSProtectionEngine — Reduces demand when VPS resources are stressed.

Monitors CPU, RAM, network throughput, load average, and disk I/O.
Returns a protection factor (0.0 to 1.0) that reduces the final demand:
  - 1.0 = VPS healthy, no reduction
  - 0.5 = VPS moderately stressed, reduce demand by 50%
  - 0.0 = VPS critically overloaded, demand should be minimum
"""

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger('ape-guardian.vps-protection')


@dataclass
class VPSMetrics:
    """Current VPS resource measurements."""
    cpu_percent: float = 0.0
    ram_percent: float = 0.0
    net_throughput_mbps: float = 0.0
    load_1m: float = 0.0
    disk_io_percent: float = 0.0


@dataclass
class VPSProtectionResult:
    """Result of VPS protection analysis."""
    factor: float              # 0.0–1.0 multiplier on demand
    is_stressed: bool          # True if any limit exceeded
    worst_resource: str        # Name of most stressed resource
    worst_utilization: float   # Utilization % of worst resource
    details: str               # Human-readable description


class VPSProtectionEngine:
    """
    Computes a protection factor based on VPS resource utilization.

    Each resource is checked against its limit. The protection factor
    is the MINIMUM across all resources (worst case wins).

    For each resource:
        utilization_ratio = current / limit
        if ratio >= 1.0: factor = 0.2 (emergency floor)
        elif ratio >= 0.9: factor = 0.5
        elif ratio >= 0.8: factor = 0.7
        else: factor = 1.0 (healthy)
    """

    def __init__(
        self,
        max_cpu_percent: float = 75.0,
        max_ram_percent: float = 90.0,
        max_net_mbps: float = 800.0,    # Hetzner CPX21 = 1Gbps; proxy pushes 100-300+ Mbps normally
        max_load_1m: float = 2.5,
        max_disk_io_percent: float = 80.0,
    ):
        self._limits = {
            'cpu': max_cpu_percent,
            'ram': max_ram_percent,
            'net': max_net_mbps,
            'load': max_load_1m,
            'disk_io': max_disk_io_percent,
        }

    def evaluate(self, metrics: VPSMetrics) -> VPSProtectionResult:
        """
        Evaluate VPS health and return protection factor.

        Args:
            metrics: Current VPS resource measurements.

        Returns:
            VPSProtectionResult with factor and diagnostics.
        """
        readings = {
            'cpu': metrics.cpu_percent,
            'ram': metrics.ram_percent,
            'net': metrics.net_throughput_mbps,
            'load': metrics.load_1m,
            'disk_io': metrics.disk_io_percent,
        }

        factors = {}
        for resource, current in readings.items():
            limit = self._limits[resource]
            if limit <= 0:
                factors[resource] = 1.0
                continue

            ratio = current / limit
            if ratio >= 1.0:
                factors[resource] = 0.2  # Emergency floor
            elif ratio >= 0.9:
                factors[resource] = 0.5
            elif ratio >= 0.8:
                factors[resource] = 0.7
            else:
                factors[resource] = 1.0

        # Worst resource determines overall factor
        worst_resource = min(factors, key=factors.get)
        overall_factor = factors[worst_resource]
        is_stressed = overall_factor < 1.0

        worst_util = (readings[worst_resource] / max(0.01, self._limits[worst_resource])) * 100

        if is_stressed:
            desc = (f'VPS stressed: {worst_resource} at '
                    f'{readings[worst_resource]:.1f}/{self._limits[worst_resource]:.1f} '
                    f'({worst_util:.0f}%) — reducing demand to {overall_factor:.0%}')
        else:
            desc = 'VPS healthy — no demand reduction'

        return VPSProtectionResult(
            factor=overall_factor,
            is_stressed=is_stressed,
            worst_resource=worst_resource,
            worst_utilization=worst_util,
            details=desc,
        )
