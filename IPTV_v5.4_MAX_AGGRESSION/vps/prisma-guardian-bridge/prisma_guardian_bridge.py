#!/usr/bin/env python3
"""
PRISMA ↔ Guardian Bridge — v1.0

Sidecar daemon que cierra el gap entre el APE Realtime Bitrate Guardian
y el PRISMA Health PHP API.

PROBLEMA RESUELTO:
  Guardian recolecta {codec, resolution, bitrate_kbps, decoder_type, dropped_frames, buffer_ms}
  vía probe ADB → ExoPlayer → MediaCodecLogger. Pero su SHM adapter solo persiste
  {demand_mbps, buffer_state} a `/dev/shm/ape_bitrate_demand.json`.

  PRISMA Health PHP (prisma-health.php:145) lee `/dev/shm/guardian_player_state.json`
  esperando el schema completo. Como NADIE escribe ese archivo, PRISMA cae a defaults
  (bitrate=0, decoder=unknown) y emite logs con KPIs en cero (saved=0Kbps, layer=0Kbps,
  HW=false, eff=0%).

SOLUCIÓN (este bridge):
  - Lee la última línea del audit.jsonl que Guardian ya escribe (1 línea/segundo).
  - Extrae los campos de probe.adb_player.<best_device>.
  - Escribe atómicamente a `/dev/shm/guardian_player_state.json` en el schema
    que PRISMA espera.

CARACTERÍSTICAS:
  - NO modifica Guardian.
  - NO modifica PRISMA.
  - NO modifica ningún archivo productivo (doctrina iptv-omega-no-delete).
  - Falla cerrado: si no puede leer el audit, no escribe nada (PRISMA seguirá viendo
    su archivo stale con timestamp viejo y degradará graciosamente).
  - Atomic write con tempfile + os.replace (mismo patrón que shm_write.py).
  - Backoff exponencial si el audit log no existe aún.
  - SIGTERM/SIGINT clean shutdown.

USO:
  python3 prisma_guardian_bridge.py \\
    --audit-log /var/log/ape-guardian/audit.jsonl \\
    --output /dev/shm/guardian_player_state.json \\
    --interval 1.0

Designed para systemd. Logs a stdout (journalctl).
"""

import argparse
import json
import logging
import os
import signal
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger('prisma-guardian-bridge')


def setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
        datefmt='%Y-%m-%dT%H:%M:%S',
    )


def read_last_jsonl_line(path: Path, max_bytes: int = 65536) -> Optional[Dict[str, Any]]:
    """
    Read the last complete JSONL line from a file.
    Reads from end backwards to avoid loading the entire file.
    """
    try:
        if not path.exists():
            return None
        size = path.stat().st_size
        if size == 0:
            return None
        with open(path, 'rb') as f:
            seek_to = max(0, size - max_bytes)
            f.seek(seek_to)
            chunk = f.read()
        # Split into lines, drop empty
        lines = [ln for ln in chunk.split(b'\n') if ln.strip()]
        if not lines:
            return None
        last = lines[-1].decode('utf-8', errors='replace')
        return json.loads(last)
    except json.JSONDecodeError:
        # Last line might be partial (still being written). Try second-to-last.
        try:
            with open(path, 'rb') as f:
                f.seek(max(0, path.stat().st_size - max_bytes))
                chunk = f.read()
            lines = [ln for ln in chunk.split(b'\n') if ln.strip()]
            if len(lines) < 2:
                return None
            return json.loads(lines[-2].decode('utf-8', errors='replace'))
        except Exception as e:
            logger.debug(f'Fallback parse failed: {e}')
            return None
    except Exception as e:
        logger.debug(f'Read audit failed: {e}')
        return None


def extract_player_state(audit_entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract the player_state schema from an audit entry.

    Expected audit entry shape (from Guardian):
      {
        '_ts': 1714303200.0,
        '_iso': '2026-04-28T12:00:00',
        'probe.adb_player': {
            'devices': {
                'firetv-cali': {
                    'bitrate_kbps': 7058,
                    'resolution': '4K',
                    'codec': 'avc',
                    'decoder_type': 'HW',
                    'dropped_frames': 0,
                    'buffer_us': 5_000_000,
                    'buffer_ms': 5000,
                    ...
                },
                ...
            },
            'bitrate_kbps': 7058,
            'resolution': '4K',
            ...
        },
        'demand_mbps': 14.5,
        ...
      }

    Returns the schema PRISMA expects (prisma-health.php:154-164):
      {
        'codec': 'avc',
        'resolution': '4K',
        'bitrate_kbps': 7058,
        'decoder_type': 'HW',
        'dropped_frames': 0,
        'buffer_ms': 5000,
        '_source': 'prisma-guardian-bridge',
        '_audit_ts': 1714303200.0,
      }

    Returns None if the entry has no usable probe data.
    """
    if not isinstance(audit_entry, dict):
        return None

    # Try multiple shapes the Guardian might use
    probe = (
        audit_entry.get('probe.adb_player')
        or audit_entry.get('probe', {}).get('adb_player')
        or audit_entry.get('adb_player')
        or {}
    )

    # Aggregated best fields (from _aggregate_best in adb_player.py)
    aggregated = {
        'bitrate_kbps': probe.get('bitrate_kbps'),
        'resolution': probe.get('resolution'),
        'codec': probe.get('codec'),
        'decoder_type': probe.get('decoder_type'),
        'dropped_frames': probe.get('dropped_frames'),
        'buffer_ms': probe.get('buffer_ms'),
    }

    # If not aggregated at top level, walk devices and pick best
    if aggregated['bitrate_kbps'] in (None, 0):
        devices = probe.get('devices', {}) or {}
        best_br = 0
        best = {}
        for name, d in devices.items():
            if not isinstance(d, dict):
                continue
            br = d.get('bitrate_kbps') or 0
            if br > best_br:
                best_br = br
                best = d
        if best:
            aggregated = {
                'bitrate_kbps': best.get('bitrate_kbps'),
                'resolution': best.get('resolution'),
                'codec': best.get('codec'),
                'decoder_type': best.get('decoder_type'),
                'dropped_frames': best.get('dropped_frames'),
                'buffer_ms': best.get('buffer_ms'),
            }

    # Reject if all fields are unusable
    has_data = (
        (aggregated.get('bitrate_kbps') or 0) > 0
        or aggregated.get('codec') not in (None, 'unknown', '')
        or aggregated.get('resolution') not in (None, 'unknown', '')
    )
    if not has_data:
        return None

    return {
        'codec': aggregated.get('codec') or 'unknown',
        'resolution': aggregated.get('resolution') or 'unknown',
        'bitrate_kbps': int(aggregated.get('bitrate_kbps') or 0),
        'decoder_type': aggregated.get('decoder_type') or 'unknown',
        'dropped_frames': int(aggregated.get('dropped_frames') or 0),
        'buffer_ms': float(aggregated.get('buffer_ms') or 0),
        '_source': 'prisma-guardian-bridge',
        '_audit_ts': audit_entry.get('_ts', time.time()),
    }


def atomic_write_json(path: Path, payload: Dict[str, Any]) -> bool:
    """Atomic JSON write: tempfile in same dir + os.replace."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = json.dumps(payload, separators=(',', ':')).encode('utf-8')
        fd, tmp = tempfile.mkstemp(
            dir=str(path.parent), prefix='.player_state_', suffix='.tmp'
        )
        try:
            os.write(fd, data)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(tmp, str(path))
        return True
    except Exception as e:
        logger.error(f'Atomic write failed: {e}')
        return False


class BridgeDaemon:
    """1Hz daemon: read audit → extract → write SHM."""

    def __init__(
        self,
        audit_log: Path,
        output: Path,
        interval: float = 1.0,
        stale_after_s: float = 30.0,
    ):
        self._audit_log = audit_log
        self._output = output
        self._interval = interval
        self._stale_after_s = stale_after_s
        self._running = False
        self._last_written_ts: float = 0
        self._consecutive_misses: int = 0
        self._max_backoff_s: float = 30.0

    def stop(self, *_args) -> None:
        self._running = False
        logger.info('Stop signal received')

    def cycle(self) -> bool:
        """One cycle. Returns True if a write happened."""
        entry = read_last_jsonl_line(self._audit_log)
        if entry is None:
            self._consecutive_misses += 1
            if self._consecutive_misses == 1 or self._consecutive_misses % 30 == 0:
                logger.warning(
                    f'No audit entry available ({self._consecutive_misses} misses) — '
                    f'check {self._audit_log}'
                )
            return False

        # Reset miss counter on first success
        if self._consecutive_misses > 0:
            logger.info(f'Audit log readable again after {self._consecutive_misses} misses')
            self._consecutive_misses = 0

        # Stale check
        ts = entry.get('_ts', 0)
        if ts and (time.time() - ts) > self._stale_after_s:
            logger.debug(f'Audit entry stale (age={time.time() - ts:.1f}s) — skipping')
            return False

        player_state = extract_player_state(entry)
        if player_state is None:
            logger.debug('No usable player state in latest audit entry')
            return False

        if not atomic_write_json(self._output, player_state):
            return False

        # Log on changes / first write / every 60s
        should_log = (
            self._last_written_ts == 0
            or abs(player_state['_audit_ts'] - self._last_written_ts) > 60
        )
        if should_log:
            logger.info(
                f'Player state written: '
                f'res={player_state["resolution"]} '
                f'codec={player_state["codec"]} '
                f'bitrate={player_state["bitrate_kbps"]}Kbps '
                f'decoder={player_state["decoder_type"]} '
                f'drops={player_state["dropped_frames"]}'
            )
        self._last_written_ts = player_state['_audit_ts']
        return True

    def run(self) -> int:
        self._running = True
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)
        logger.info(
            f'Bridge starting: audit={self._audit_log} → output={self._output} '
            f'@ {1.0 / self._interval:.1f}Hz'
        )

        while self._running:
            t0 = time.monotonic()
            try:
                self.cycle()
            except Exception as e:
                logger.error(f'Cycle error: {e}')
            elapsed = time.monotonic() - t0
            sleep_s = max(0.0, self._interval - elapsed)

            # Apply backoff if audit is missing for a long time
            if self._consecutive_misses > 5:
                backoff = min(self._max_backoff_s, self._interval * (2 ** min(self._consecutive_misses - 5, 6)))
                sleep_s = max(sleep_s, backoff)

            if sleep_s > 0 and self._running:
                time.sleep(sleep_s)

        logger.info('Bridge stopped cleanly')
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description='PRISMA ↔ Guardian Bridge: persist Guardian probe data to the SHM file PRISMA reads.'
    )
    parser.add_argument(
        '--audit-log',
        type=Path,
        default=Path('/var/log/ape-guardian/audit.jsonl'),
        help='Path to Guardian audit JSONL (default: /var/log/ape-guardian/audit.jsonl)',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('/dev/shm/guardian_player_state.json'),
        help='Path PRISMA reads (default: /dev/shm/guardian_player_state.json)',
    )
    parser.add_argument(
        '--interval',
        type=float,
        default=1.0,
        help='Cycle interval in seconds (default: 1.0)',
    )
    parser.add_argument(
        '--stale-after',
        type=float,
        default=30.0,
        help='Skip audit entries older than this (seconds, default: 30)',
    )
    parser.add_argument('--verbose', '-v', action='store_true')
    parser.add_argument(
        '--once',
        action='store_true',
        help='Run a single cycle and exit (for testing)',
    )
    args = parser.parse_args()

    setup_logging(args.verbose)

    daemon = BridgeDaemon(
        audit_log=args.audit_log,
        output=args.output,
        interval=args.interval,
        stale_after_s=args.stale_after,
    )

    if args.once:
        ok = daemon.cycle()
        logger.info(f'Single cycle complete: {"wrote" if ok else "skipped"}')
        return 0 if ok else 1

    return daemon.run()


if __name__ == '__main__':
    sys.exit(main())
