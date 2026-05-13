"""
SHMWriteAdapter — Atomic write to /dev/shm/ape_bitrate_demand.json.
"""

import json
import logging
import os
import tempfile
import time
from typing import Any, Dict

from .base import SpeedInjectionAdapter

logger = logging.getLogger('ape-guardian.adapter.shm')


class SHMWriteAdapter(SpeedInjectionAdapter):
    """Writes demand to shared memory as atomic JSON."""

    def __init__(self, output_path: str = '/dev/shm/ape_bitrate_demand.json'):
        self._path = output_path

    @property
    def name(self) -> str:
        return 'shm_write'

    async def apply(self, demand_mbps: float, state: Dict[str, Any],
                    metrics: Dict[str, Any]) -> bool:
        try:
            payload = {
                'demand_mbps': round(demand_mbps, 2),
                'buffer_state': state.get('buffer_state', 'unknown'),
                'buffer_percent': round(metrics.get('buffer_percent', 0), 1),
                'vps_protection_factor': state.get('vps_protection_factor', 1.0),
                'timestamp': time.time(),
                'source': 'ape-realtime-guardian',
            }

            data = json.dumps(payload, separators=(',', ':'))
            dir_path = os.path.dirname(self._path)

            fd, tmp = tempfile.mkstemp(dir=dir_path, prefix='.demand_', suffix='.tmp')
            try:
                os.write(fd, data.encode())
                os.fsync(fd)
            finally:
                os.close(fd)

            os.replace(tmp, self._path)
            logger.debug(f'SHM write: {demand_mbps:.2f} Mbps → {self._path}')
            return True

        except Exception as e:
            logger.error(f'SHM write failed: {e}')
            return False
