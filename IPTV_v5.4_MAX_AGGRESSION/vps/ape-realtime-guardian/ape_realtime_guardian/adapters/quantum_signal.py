"""
QuantumSignalAdapter — Merges demand into quantum_directives.json.
"""

import json
import logging
import os
import tempfile
import time
from typing import Any, Dict

from .base import SpeedInjectionAdapter

logger = logging.getLogger('ape-guardian.adapter.quantum')


class QuantumSignalAdapter(SpeedInjectionAdapter):
    """Pokes quantum_directives.json with demand signal (read+merge+write)."""

    def __init__(self, path: str = '/dev/shm/quantum_directives.json'):
        self._path = path

    @property
    def name(self) -> str:
        return 'quantum_signal'

    async def apply(self, demand_mbps: float, state: Dict[str, Any],
                    metrics: Dict[str, Any]) -> bool:
        try:
            # Read existing directives
            existing = {}
            if os.path.exists(self._path):
                with open(self._path, 'r') as f:
                    existing = json.load(f)

            # Merge our signal (non-destructive)
            existing['ape_realtime_guardian'] = {
                'demand_mbps': round(demand_mbps, 2),
                'buffer_state': state.get('buffer_state', 'unknown'),
                'buffer_percent': round(metrics.get('buffer_percent', 0), 1),
                'updated_at': time.time(),
            }

            # Atomic write
            data = json.dumps(existing, indent=2)
            dir_path = os.path.dirname(self._path)
            fd, tmp = tempfile.mkstemp(dir=dir_path, prefix='.qdir_', suffix='.tmp')
            try:
                os.write(fd, data.encode())
                os.fsync(fd)
            finally:
                os.close(fd)

            os.replace(tmp, self._path)
            logger.debug(f'Quantum signal: {demand_mbps:.2f} Mbps → {self._path}')
            return True

        except Exception as e:
            logger.error(f'Quantum signal failed: {e}')
            return False
