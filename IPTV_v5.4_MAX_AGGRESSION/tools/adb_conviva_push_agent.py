#!/usr/bin/env python3
"""
ADB Conviva Push Agent — Fire TV / ONN 4K → /prisma/api/conviva-event

Reads ExoPlayer / Conviva-relevant lines from `adb logcat`, builds Conviva
event JSON per the schema in vps/prisma/lib/conviva_event_schema.json, and
POSTs to the LIVE VPS endpoint deployed in commit 8cef80a.

Runs as a daemon (systemd unit at the bottom of this file as a comment).
Tolerates ADB disconnects via `adb wait-for-device` + restart loop.

Usage:
  ./adb_conviva_push_agent.py [--device <id>] [--endpoint <url>] [--session <id>]
                              [--device-id <name>] [--player <name>] [--verbose]

  --device      ADB device id from `adb devices`. Defaults to first device
                returned by `adb devices`. Useful when multiple Fire TVs are
                paired.
  --endpoint    Override endpoint URL. Default: https://iptv-ape.duckdns.org/prisma/api/conviva-event
  --session     Conviva session_id to emit (alphanumeric/_/- 8..64 chars).
                Default: agent-<hostname>-<unix-ts> (generated on start).
  --device-id   Identifier for the device in events. Default: hostname-uppercase.
  --player      Player enum for events. Default: 'ExoPlayer'.
                Valid: OTT_Navigator | TiviMate | IPTV_Smarters | VLC | Kodi |
                       ExoPlayer | AVPlayer | hls_js | Shaka | unknown
  --verbose     Print every parsed event to stdout (in addition to POST).
  --dry-run     Parse + format events but do NOT POST. Diagnostic only.

Doctrine compliance:
  · Telemetry-only (no shield interference, no playback path interference).
  · POST timeout 5s; silent fail-safe on network error (logs only, no abort).
  · No re-emit on retry — Conviva server is idempotent per (session_id, ts).
  · Rate limit aware: prisma_api zone is 10r/s burst=10; agent paces to 1/sec
    nominal (player events typically slower).
"""
import argparse
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Optional


DEFAULT_ENDPOINT = 'https://iptv-ape.duckdns.org/prisma/api/conviva-event'

# ─── Logcat patterns ────────────────────────────────────────────────────────
# Each regex captures fields needed to build a Conviva event payload.
# Patterns are tested against ExoPlayer 2.x output + Conviva SDK lines.
# Add more as you observe real Fire TV logcat output.
PATTERNS = [
    {
        'name': 'first_frame',
        'event_type': 'first_frame',
        # ExoPlayer onRenderedFirstFrame: '... onRenderedFirstFrame [0:elapsed=1234ms]'
        'rx': re.compile(r'onRenderedFirstFrame.*?elapsed=(\d+)ms', re.IGNORECASE),
        'fields': lambda m: {'startup_time_ms': int(m.group(1))},
    },
    {
        'name': 'rebuffer_start',
        'event_type': 'rebuffer_start',
        # 'state changed: BUFFERING' (ExoPlayer state transition to STATE_BUFFERING=2)
        'rx': re.compile(r'state changed.*?BUFFERING|playbackState.*?STATE_BUFFERING', re.IGNORECASE),
        'fields': lambda m: {},
    },
    {
        'name': 'rebuffer_end',
        'event_type': 'rebuffer_end',
        # 'state changed: READY' after BUFFERING
        'rx': re.compile(r'state changed.*?READY|playbackState.*?STATE_READY', re.IGNORECASE),
        'fields': lambda m: {},
    },
    {
        'name': 'bitrate_change',
        'event_type': 'bitrate_change',
        # ExoPlayer track switch: 'bitrate=NNNN' on video format change
        'rx': re.compile(r'video.*?format.*?bitrate=(\d+)', re.IGNORECASE),
        'fields': lambda m: {'bitrate_bps': int(m.group(1))},
    },
    {
        'name': 'frame_drop',
        'event_type': 'frame_drop',
        # ExoPlayer onDroppedFrames: 'dropped N frames in elapsed Mms'
        'rx': re.compile(r'dropped\s+(\d+)\s+frames?\s+in\s+(\d+)\s*ms', re.IGNORECASE),
        'fields': lambda m: {
            'dropped_frames': int(m.group(1)),
            'window_ms': int(m.group(2)),
            'frame_drop_rate': round(int(m.group(1)) * 1000.0 / max(1, int(m.group(2))), 2),
        },
    },
    {
        'name': 'error',
        'event_type': 'error',
        # ExoPlayer error: 'ExoPlaybackException' or 'PlayerError'
        'rx': re.compile(r'(ExoPlaybackException|PlayerError|MediaCodec.*?Exception)', re.IGNORECASE),
        'fields': lambda m: {'error_class': m.group(1)},
    },
    {
        'name': 'codec_query_ottnav',
        'event_type': 'quality_change',
        # OTT Navigator / Fire TV MTK decoder: 'MediaCodecQuerier: CodecQuery(...
        #   attributes={CODECS=hev1.2.4.L150.90, WIDTH=3840, HEIGHT=2160, BITRATE=25000000...})
        #   ... CodecQueryResult(isSupported=true...)'. Captura codec/resolucion/bitrate REALES
        # del stream que el player resolvio para reproducir (telemetria de calidad real, URL-2).
        'rx': re.compile(r'MediaCodecQuerier.*?CODECS=([A-Za-z0-9.]+).*?WIDTH=(\d+).*?HEIGHT=(\d+).*?BITRATE=(\d+).*?isSupported=true', re.IGNORECASE),
        'fields': lambda m: {
            'codec':       m.group(1),
            'resolution':  f'{m.group(2)}x{m.group(3)}',
            'bitrate_bps': int(m.group(4)),
        },
    },
]


def resolve_adb() -> str:
    """Locate the adb executable cross-platform (Windows/Linux/Mac). Order:
    env ADB_PATH -> 'adb' on PATH -> known Windows/Linux locations -> 'adb' (last resort)."""
    from shutil import which
    cand = os.environ.get('ADB_PATH')
    if cand and os.path.isfile(cand):
        return cand
    w = which('adb')
    if w:
        return w
    for c in (r'C:\Android\platform-tools\adb.exe',
              'C:/Android/platform-tools/adb.exe',
              '/c/Android/platform-tools/adb.exe',
              '/usr/bin/adb', '/usr/local/bin/adb'):
        if os.path.isfile(c):
            return c
    return 'adb'

# Conviva schema constants
VALID_PLAYERS = {'OTT_Navigator', 'TiviMate', 'IPTV_Smarters', 'VLC', 'Kodi',
                 'ExoPlayer', 'AVPlayer', 'hls_js', 'Shaka', 'unknown'}


def now_ms() -> int:
    return int(time.time() * 1000)


def safe_session_id(raw: str) -> str:
    """Conviva schema: 8..64 chars, [a-zA-Z0-9_-]."""
    clean = re.sub(r'[^a-zA-Z0-9_-]', '_', raw)[:64]
    return clean if len(clean) >= 8 else clean + ('0' * (8 - len(clean)))


def build_event(session_id: str, device_id: str, player: str,
                channel_id: str, channel_name: str,
                event_type: str, data: dict) -> dict:
    return {
        'version':      '1.0',
        'session_id':   session_id,
        'device_id':    device_id,
        'player':       player,
        'channel': {
            'id':   channel_id,
            'name': channel_name,
        },
        'event_type':   event_type,
        'timestamp_ms': now_ms(),
        'data':         data,
    }


def post_event(endpoint: str, event: dict, verbose: bool = False,
               dry_run: bool = False) -> Optional[dict]:
    """POST event to /prisma/api/conviva-event. Returns response dict or None."""
    body = json.dumps(event).encode('utf-8')
    if verbose:
        print(f'  POST → {event["event_type"]} session={event["session_id"]} ts={event["timestamp_ms"]}',
              file=sys.stderr)
    if dry_run:
        return {'ok': True, 'dry_run': True}
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={'Content-Type': 'application/json',
                 'User-Agent': 'ADB-Conviva-Push-Agent/1.0'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f'[ERROR] HTTP {e.code} {e.reason}: {e.read().decode("utf-8", errors="replace")[:200]}',
              file=sys.stderr)
    except (urllib.error.URLError, socket.timeout) as e:
        print(f'[ERROR] network: {e}', file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f'[ERROR] post_event: {e}', file=sys.stderr)
    return None


def detect_channel_from_line(line: str) -> tuple[str, str]:
    """Best-effort channel extraction from logcat lines. Many players emit
    'Channel: NAME' or 'tvg-name=NAME' style strings. If nothing matches,
    fall back to ('unknown', 'unknown'). Override via env CONVIVA_CHANNEL_ID /
    _CHANNEL_NAME if you want pinned values."""
    cid = os.environ.get('CONVIVA_CHANNEL_ID', '').strip()
    cname = os.environ.get('CONVIVA_CHANNEL_NAME', '').strip()
    if cid and cname:
        return cid, cname
    m = re.search(r'channel[_-]?id[=:"]\s*([^",\s]+)', line, re.IGNORECASE)
    if m:
        cid = cid or m.group(1)
    m = re.search(r'channel[_-]?name[=:"]\s*([^",]+)', line, re.IGNORECASE)
    if m:
        cname = cname or m.group(1).strip()
    return cid or 'unknown', cname or 'unknown'


def adb_logcat_lines(device: Optional[str] = None):
    """Yield logcat lines indefinitely. Restarts adb on disconnect.

    Filters: -s ExoPlayer ConvivaAndroidSDK MediaCodec PlaybackState
    (tune as needed for your player). Use `-T 1` to start at the present.
    """
    cmd = [resolve_adb()]
    if device:
        cmd += ['-s', device]
    cmd += ['logcat', '-T', '1',
            'ExoPlayer:V', 'ExoPlayerImpl:V',
            'ConvivaAndroidSDK:V', 'MediaCodec:V',
            'PlaybackState:V', '*:E']
    while True:
        print(f'[INFO] starting adb logcat (device={device or "default"})', file=sys.stderr)
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                bufsize=1, universal_newlines=True)
        try:
            for line in proc.stdout:  # type: ignore[union-attr]
                yield line.rstrip()
            stderr = proc.stderr.read() if proc.stderr else ''  # type: ignore[union-attr]
            print(f'[WARN] adb logcat exited (rc={proc.poll()}): {stderr[:200]}', file=sys.stderr)
        except KeyboardInterrupt:
            proc.terminate()
            return
        except Exception as e:  # noqa: BLE001
            print(f'[ERROR] adb logcat: {e}', file=sys.stderr)
            proc.terminate()
        # Brief backoff before adb reconnect
        time.sleep(2)


def main():
    parser = argparse.ArgumentParser(description='ADB Conviva Push Agent')
    parser.add_argument('--device', default=os.environ.get('ADB_DEVICE_ID'))
    parser.add_argument('--endpoint', default=os.environ.get('CONVIVA_ENDPOINT', DEFAULT_ENDPOINT))
    parser.add_argument('--session', default=None)
    parser.add_argument('--device-id', default=os.environ.get('CONVIVA_DEVICE_ID',
                        socket.gethostname().upper()))
    parser.add_argument('--player', default=os.environ.get('CONVIVA_PLAYER', 'ExoPlayer'))
    parser.add_argument('--verbose', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if args.player not in VALID_PLAYERS:
        print(f'[ERROR] --player must be one of {sorted(VALID_PLAYERS)}', file=sys.stderr)
        sys.exit(2)

    session_id = safe_session_id(args.session or f'agent-{socket.gethostname()}-{int(time.time())}')
    print(f'[INFO] ADB Conviva Push Agent starting', file=sys.stderr)
    print(f'[INFO]   endpoint  = {args.endpoint}', file=sys.stderr)
    print(f'[INFO]   device    = {args.device or "<first ADB device>"}', file=sys.stderr)
    print(f'[INFO]   device_id = {args.device_id}', file=sys.stderr)
    print(f'[INFO]   player    = {args.player}', file=sys.stderr)
    print(f'[INFO]   session   = {session_id}', file=sys.stderr)
    print(f'[INFO]   dry_run   = {args.dry_run}', file=sys.stderr)

    # Rate limiter: 1 event per 100ms minimum (well under prisma_api 10r/s)
    last_post_ts = 0.0
    last_event_signature = None     # de-dup repeated identical events
    last_event_ts = 0

    for line in adb_logcat_lines(args.device):
        for p in PATTERNS:
            m = p['rx'].search(line)
            if not m:
                continue
            try:
                data = p['fields'](m)
            except Exception:  # noqa: BLE001
                data = {}
            cid, cname = detect_channel_from_line(line)
            evt = build_event(session_id, args.device_id, args.player,
                              cid, cname, p['event_type'], data)
            # De-dup: same (event_type, data) within 1s = skip
            sig = (p['event_type'], json.dumps(data, sort_keys=True))
            now = time.time()
            if sig == last_event_signature and (now - last_event_ts) < 1.0:
                continue
            # Rate limit
            elapsed = now - last_post_ts
            if elapsed < 0.1:
                time.sleep(0.1 - elapsed)
            last_post_ts = time.time()
            last_event_signature = sig
            last_event_ts = now
            resp = post_event(args.endpoint, evt, verbose=args.verbose, dry_run=args.dry_run)
            if args.verbose and resp:
                print(f'  ← {resp}', file=sys.stderr)
            break  # one match per line is enough


if __name__ == '__main__':
    main()


# ─── systemd unit (drop into /etc/systemd/system/adb-conviva-push.service) ──
# [Unit]
# Description=ADB Conviva Push Agent — Fire TV telemetry → /prisma/api/conviva-event
# After=network-online.target
# Wants=network-online.target
#
# [Service]
# Type=simple
# # Run as a user that has ADB connection; needs `adb` in PATH and the Fire TV
# # paired (`adb connect <fire-tv-ip>:5555`).
# User=hfrc
# Environment=PATH=/usr/local/bin:/usr/bin:/bin
# Environment=ADB_DEVICE_ID=
# Environment=CONVIVA_ENDPOINT=https://iptv-ape.duckdns.org/prisma/api/conviva-event
# Environment=CONVIVA_PLAYER=ExoPlayer
# ExecStart=/usr/bin/python3 /opt/adb-conviva-push/adb_conviva_push_agent.py --verbose
# Restart=on-failure
# RestartSec=10
# StandardOutput=journal
# StandardError=journal
#
# [Install]
# WantedBy=multi-user.target
#
# Install procedure:
#   sudo mkdir -p /opt/adb-conviva-push
#   sudo cp adb_conviva_push_agent.py /opt/adb-conviva-push/
#   sudo cp adb-conviva-push.service /etc/systemd/system/
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now adb-conviva-push.service
#   sudo journalctl -u adb-conviva-push -f
#
# Pre-flight checklist:
#   1. ADB installed on host: `apt install android-tools-adb`
#   2. Fire TV: Settings → My Fire TV → Developer Options → ADB debugging ON
#      + Apps from Unknown Sources ON
#   3. From host: `adb connect <fire-tv-ip>:5555` (one-time, until reboot)
#   4. `adb devices` should list the Fire TV
#   5. Dry run first: ./adb_conviva_push_agent.py --dry-run --verbose
#   6. Verify endpoint reachable: `curl -sS -X POST -H 'Content-Type: application/json' \
#      -d '{}' https://iptv-ape.duckdns.org/prisma/api/conviva-event` → 400 invalid_json
#      (means endpoint is alive; agent's real events get 200 with qoe_score + decision).
