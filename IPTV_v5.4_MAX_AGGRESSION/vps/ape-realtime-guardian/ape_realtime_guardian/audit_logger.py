"""
AuditLogger — Structured JSONL append per second.

Each line is a complete JSON object with all decision metrics.
Rotated daily via logrotate (external).
"""

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger('ape-guardian.audit')


class AuditLogger:
    """Appends one JSONL line per decision cycle."""

    def __init__(self, log_dir: str, filename: str = 'audit.jsonl'):
        self._dir = Path(log_dir)
        self._filename = filename
        self._file = None
        self._path = self._dir / self._filename

    def open(self) -> None:
        """Open the audit log file for appending."""
        self._dir.mkdir(parents=True, exist_ok=True)
        self._file = open(self._path, 'a', encoding='utf-8')
        logger.info(f'Audit log opened: {self._path}')

    def log(self, entry: Dict[str, Any]) -> None:
        """Append a single audit entry as JSONL."""
        if not self._file:
            return

        entry['_ts'] = time.time()
        entry['_iso'] = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())

        try:
            line = json.dumps(entry, separators=(',', ':'), default=str)
            self._file.write(line + '\n')
            self._file.flush()
        except Exception as e:
            logger.error(f'Audit write failed: {e}')

    def close(self) -> None:
        """Close the audit log file."""
        if self._file:
            try:
                self._file.flush()
                self._file.close()
            except Exception:
                pass
            self._file = None
