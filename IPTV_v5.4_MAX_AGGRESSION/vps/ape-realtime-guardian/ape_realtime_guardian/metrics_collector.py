"""
MetricsCollector — Runs all probes in parallel and composes results.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .probes.base import Probe, ProbeResult

logger = logging.getLogger('ape-guardian.collector')


@dataclass
class CollectedMetrics:
    """Composite result from all probes."""
    timestamp: float = 0.0
    # Server-side
    cpu_percent: float = 0.0
    ram_percent: float = 0.0
    net_throughput_mbps: float = 0.0
    load_1m: float = 0.0
    disk_io_percent: float = 0.0
    # Player-side (from ADB)
    buffer_percent: float = 100.0
    buffer_ms: float = 60000.0
    actual_bitrate_mbps: float = 0.0
    dropped_frames: int = 0
    audio_underruns: int = 0
    buffer_source: str = 'unknown'
    # Resolution-aware fields (from ADB probe)
    resolution: str = 'unknown'
    codec: str = 'unknown'
    decoder_type: str = 'unknown'
    bitrate_floor_kbps: int = 0
    bitrate_floor_violation: bool = False
    bitrate_deficit_kbps: int = 0
    # Zap detection (Phase B — MA engine input)
    zap_detected: bool = False
    zap_reason: str = ''
    # Probe health
    probe_results: Dict[str, ProbeResult] = field(default_factory=dict)
    total_latency_ms: float = 0.0


class MetricsCollector:
    """
    Runs probes concurrently and composes a unified metrics snapshot.
    """

    def __init__(self, probes: List[Probe]):
        self._probes = probes

    async def collect(self) -> CollectedMetrics:
        """Run all probes in parallel and compose results."""
        start = time.monotonic()

        # Run all probes concurrently
        tasks = [probe.collect() for probe in self._probes]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        metrics = CollectedMetrics(timestamp=time.time())

        for i, result in enumerate(results):
            probe = self._probes[i]

            if isinstance(result, Exception):
                logger.error(f'Probe {probe.name} crashed: {result}')
                metrics.probe_results[probe.name] = ProbeResult(
                    source=probe.name, success=False, error=str(result)
                )
                continue

            metrics.probe_results[probe.name] = result

            if not result.success:
                continue

            # Compose server-side metrics
            if probe.name == 'server_side':
                d = result.data
                metrics.cpu_percent = d.get('cpu_percent', 0.0)
                metrics.ram_percent = d.get('ram_percent', 0.0)
                metrics.net_throughput_mbps = d.get('net_throughput_mbps', 0.0)
                metrics.load_1m = d.get('load_1m', 0.0)
                metrics.disk_io_percent = d.get('disk_io_percent', 0.0)

            # Compose player metrics
            elif probe.name == 'adb_player':
                d = result.data
                metrics.buffer_percent = d.get('buffer_percent', 100.0)
                metrics.buffer_ms = d.get('buffer_ms', 60000.0)
                metrics.actual_bitrate_mbps = d.get('bitrate_kbps', 0) / 1000.0
                metrics.dropped_frames = d.get('dropped_frames', 0)
                metrics.audio_underruns = d.get('audio_underruns', 0)
                metrics.buffer_source = d.get('buffer_source', 'unknown')
                # Resolution-aware telemetry
                metrics.resolution = d.get('resolution', 'unknown')
                metrics.codec = d.get('codec', 'unknown')
                metrics.decoder_type = d.get('decoder_type', 'unknown')
                metrics.bitrate_floor_kbps = d.get('bitrate_floor_kbps', 0)
                metrics.bitrate_floor_violation = d.get('bitrate_floor_violation', False)
                metrics.bitrate_deficit_kbps = d.get('bitrate_deficit_kbps', 0)
                # Zap detection
                metrics.zap_detected = bool(d.get('zap_detected', False))
                metrics.zap_reason = str(d.get('zap_reason', ''))

        metrics.total_latency_ms = (time.monotonic() - start) * 1000
        return metrics

    async def close(self) -> None:
        """Cleanup all probes."""
        for probe in self._probes:
            try:
                await probe.close()
            except Exception as e:
                logger.error(f'Error closing probe {probe.name}: {e}')
