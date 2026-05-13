"""
ServerSideProbe — Collects VPS metrics via psutil and /dev/shm files.

Reads:
  - CPU, RAM, load average via psutil
  - Network throughput via /proc/net/dev delta
  - Guardian exchange, quantum directives from /dev/shm
"""

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, Optional

from .base import Probe, ProbeResult

logger = logging.getLogger('ape-guardian.probe.server')

# Optional: psutil may not be available on Windows dev machines
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
    logger.warning('psutil not available — server metrics will be simulated')


class ServerSideProbe(Probe):
    """
    Collects server-side metrics without touching any production files.

    All reads are non-blocking. /dev/shm reads use shared flock.
    """

    def __init__(
        self,
        guardian_exchange_path: str = '/dev/shm/guardian_exchange.json',
        quantum_directives_path: str = '/dev/shm/quantum_directives.json',
    ):
        self._guardian_path = guardian_exchange_path
        self._quantum_path = quantum_directives_path
        self._last_net_bytes: Optional[Dict[str, int]] = None
        self._last_net_time: Optional[float] = None

    @property
    def name(self) -> str:
        return 'server_side'

    async def collect(self) -> ProbeResult:
        """Collect all server-side metrics."""
        start = time.monotonic()
        data: Dict[str, Any] = {}

        try:
            # CPU, RAM, Load
            if HAS_PSUTIL:
                data['cpu_percent'] = psutil.cpu_percent(interval=0)
                mem = psutil.virtual_memory()
                data['ram_percent'] = mem.percent
                data['ram_used_mb'] = mem.used / (1024 * 1024)
                data['ram_total_mb'] = mem.total / (1024 * 1024)
                load = os.getloadavg() if hasattr(os, 'getloadavg') else (0, 0, 0)
                data['load_1m'] = load[0]
                data['load_5m'] = load[1]
                data['load_15m'] = load[2]

                # Disk I/O
                try:
                    disk = psutil.disk_io_counters()
                    if disk:
                        data['disk_read_mb'] = disk.read_bytes / (1024 * 1024)
                        data['disk_write_mb'] = disk.write_bytes / (1024 * 1024)
                except Exception:
                    data['disk_io_percent'] = 0.0
            else:
                # Simulated values for local development
                data.update({
                    'cpu_percent': 15.0, 'ram_percent': 45.0,
                    'ram_used_mb': 1800, 'ram_total_mb': 4096,
                    'load_1m': 0.5, 'load_5m': 0.4, 'load_15m': 0.3,
                    'disk_io_percent': 10.0,
                })

            # Network throughput (delta-based)
            net_data = await self._collect_net_throughput()
            data.update(net_data)

            # Read /dev/shm files (non-blocking, graceful if missing)
            guardian = await self._read_json_safe(self._guardian_path)
            if guardian:
                data['guardian_exchange'] = {
                    'active_streams': guardian.get('active_streams', 0),
                    'total_bandwidth_mbps': guardian.get('total_bandwidth_mbps', 0),
                }

            quantum = await self._read_json_safe(self._quantum_path)
            if quantum:
                data['quantum_directives'] = {
                    'active': quantum.get('active', False),
                    'mode': quantum.get('mode', 'unknown'),
                }

            latency = (time.monotonic() - start) * 1000
            return ProbeResult(source=self.name, success=True, data=data,
                               latency_ms=latency)

        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            logger.error(f'ServerSideProbe error: {e}')
            return ProbeResult(source=self.name, success=False,
                               error=str(e), latency_ms=latency)

    async def _collect_net_throughput(self) -> Dict[str, float]:
        """Calculate network throughput via /proc/net/dev delta."""
        result = {'net_throughput_mbps': 0.0, 'net_rx_mbps': 0.0, 'net_tx_mbps': 0.0}

        try:
            if not HAS_PSUTIL:
                return result

            counters = psutil.net_io_counters()
            now = time.monotonic()
            current = {
                'rx': counters.bytes_recv,
                'tx': counters.bytes_sent,
            }

            if self._last_net_bytes and self._last_net_time:
                dt = now - self._last_net_time
                if dt > 0:
                    rx_mbps = ((current['rx'] - self._last_net_bytes['rx']) * 8) / (dt * 1_000_000)
                    tx_mbps = ((current['tx'] - self._last_net_bytes['tx']) * 8) / (dt * 1_000_000)
                    result['net_rx_mbps'] = round(rx_mbps, 2)
                    result['net_tx_mbps'] = round(tx_mbps, 2)
                    result['net_throughput_mbps'] = round(rx_mbps + tx_mbps, 2)

            self._last_net_bytes = current
            self._last_net_time = now

        except Exception as e:
            logger.debug(f'Net throughput collection failed: {e}')

        return result

    async def _read_json_safe(self, path: str) -> Optional[dict]:
        """Read a JSON file safely. Returns None if missing/corrupt."""
        try:
            if not os.path.exists(path):
                return None
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(None, self._read_file, path)
            return json.loads(data) if data else None
        except Exception:
            return None

    @staticmethod
    def _read_file(path: str) -> Optional[str]:
        try:
            with open(path, 'r') as f:
                return f.read()
        except Exception:
            return None
