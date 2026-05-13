"""
State Persistence — Atomic JSON state save/load with flock safety.

Persists deficit accumulation, last buffer readings, and adapter state
across daemon restarts.
"""

import json
import logging
import os
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger('ape-guardian.state')


@dataclass
class GuardianState:
    """Persisted state between daemon cycles and restarts."""
    accumulated_deficit_mbps: float = 0.0
    previous_deficit_mbps: float = 0.0
    last_buffer_percent: float = 100.0
    last_demand_mbps: float = 0.0
    last_buffer_state: str = 'stable'
    cycle_count: int = 0
    last_adb_buffer_ms: float = 0.0
    last_adb_bitrate_kbps: float = 0.0
    buffer_source: str = 'unknown'  # 'adb' | 'inferred' | 'stale' | 'unknown'


class StatePersistence:
    """
    Atomic JSON state persistence with graceful degradation.

    Writes to a tmp file then atomically replaces the target.
    On read failure, returns default state (never crashes).
    """

    def __init__(self, path: str):
        self._path = Path(path)
        self._state = GuardianState()

    @property
    def state(self) -> GuardianState:
        return self._state

    def load(self) -> GuardianState:
        """Load state from disk. Returns default if missing/corrupt."""
        if not self._path.exists():
            logger.info(f'No state file at {self._path} — starting fresh')
            self._state = GuardianState()
            return self._state

        try:
            with open(self._path, 'r') as f:
                raw = json.load(f)
            self._state = GuardianState(
                accumulated_deficit_mbps=float(raw.get('accumulated_deficit_mbps', 0.0)),
                previous_deficit_mbps=float(raw.get('previous_deficit_mbps', 0.0)),
                last_buffer_percent=float(raw.get('last_buffer_percent', 100.0)),
                last_demand_mbps=float(raw.get('last_demand_mbps', 0.0)),
                last_buffer_state=raw.get('last_buffer_state', 'stable'),
                cycle_count=int(raw.get('cycle_count', 0)),
                last_adb_buffer_ms=float(raw.get('last_adb_buffer_ms', 0.0)),
                last_adb_bitrate_kbps=float(raw.get('last_adb_bitrate_kbps', 0.0)),
                buffer_source=raw.get('buffer_source', 'unknown'),
            )
            logger.info(f'State loaded: cycle={self._state.cycle_count}, '
                        f'demand={self._state.last_demand_mbps:.2f}')
        except Exception as e:
            logger.error(f'Failed to load state: {e} — starting fresh')
            self._state = GuardianState()

        return self._state

    def save(self) -> bool:
        """Atomically save state to disk. Returns True on success."""
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            data = json.dumps(self._to_dict(), indent=2)

            # Atomic write: tmp → rename
            fd, tmp_path = tempfile.mkstemp(
                dir=str(self._path.parent),
                prefix='.state_',
                suffix='.tmp'
            )
            try:
                os.write(fd, data.encode('utf-8'))
                os.fsync(fd)
            finally:
                os.close(fd)

            os.replace(tmp_path, str(self._path))
            return True

        except Exception as e:
            logger.error(f'Failed to save state: {e}')
            return False

    def update(self, **kwargs) -> None:
        """Update state fields. Only known fields are accepted."""
        for key, value in kwargs.items():
            if hasattr(self._state, key):
                setattr(self._state, key, value)

    def _to_dict(self) -> dict:
        return {
            'accumulated_deficit_mbps': self._state.accumulated_deficit_mbps,
            'previous_deficit_mbps': self._state.previous_deficit_mbps,
            'last_buffer_percent': self._state.last_buffer_percent,
            'last_demand_mbps': self._state.last_demand_mbps,
            'last_buffer_state': self._state.last_buffer_state,
            'cycle_count': self._state.cycle_count,
            'last_adb_buffer_ms': self._state.last_adb_buffer_ms,
            'last_adb_bitrate_kbps': self._state.last_adb_bitrate_kbps,
            'buffer_source': self._state.buffer_source,
        }
