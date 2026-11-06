#!/usr/bin/env python3
"""ARA wake watchdog.

Reads the real classifier state DB. If a device has no fresh classifier state
for --stale-seconds, appends ONE ara.wake event to the same SSE bus that the
device already consumes. It never calls play/pause, never touches the stream,
nginx, provider credentials, or playlists.

The device handler starts AgentService/CaptureWatchdogService on that event.
Cooldown per device prevents wake storms and replay loops.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

DB_DEFAULT = "/opt/netshield/data/conviva.db"
STATE_DEFAULT = "/var/lib/ara-x/wake-watchdog.state"
LOG_DEFAULT = "/var/log/ara-wake-watchdog.log"


def log(path: str, message: str) -> None:
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {message}"
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass
    print(line)


def load_state(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def latest_state(conn: sqlite3.Connection, limit: int = 5000) -> dict[str, dict]:
    """Last classifier.state row per device from the SSE policy_deltas table."""
    latest: dict[str, dict] = {}
    rows = conn.execute(
        "SELECT target_device_id, created_at, channel_id, payload_json "
        "FROM policy_deltas WHERE delta_type='classifier.state' "
        "AND target_device_id IS NOT NULL AND target_device_id<>'' "
        "ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    for device, created_at, channel_id, payload in rows:
        device = str(device or "")
        if not device or device in latest:
            continue
        try:
            data = json.loads(payload)
        except (TypeError, ValueError):
            data = {}
        if not isinstance(data, dict):
            data = {}
        data["device_id"] = device
        data["channel_id"] = channel_id or ""
        data["_ts"] = int(created_at or 0)
        latest[device] = data
    return latest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_DEFAULT)
    ap.add_argument("--state", default=STATE_DEFAULT)
    ap.add_argument("--log", default=LOG_DEFAULT)
    ap.add_argument("--stale-seconds", type=int, default=60)
    ap.add_argument("--cooldown-seconds", type=int, default=300)
    ap.add_argument("--zap-cooldown-seconds", type=int, default=15)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    db = Path(args.db)
    state_path = Path(args.state)
    if not db.exists():
        log(args.log, f"SKIP db_missing={db}")
        return 0

    state_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = state_path.with_suffix(state_path.suffix + ".lock")
    lock_fh = open(lock_path, "a+")
    fcntl.flock(lock_fh, fcntl.LOCK_EX)

    now = int(time.time())
    state = load_state(state_path)
    conn = sqlite3.connect(str(db), timeout=5)
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        latest = latest_state(conn)
        for device, data in latest.items():
            age = now - int(data.get("_ts", 0))
            prior = state.get(device, {})
            last_wake = int(prior.get("last_wake", 0) or 0)
            last_zap_wake = int(prior.get("last_zap_wake", 0) or 0)
            channel = str(data.get("channel_id") or "")
            prior_channel = str(prior.get("last_channel") or "")
            zap = bool(channel) and bool(prior_channel) and channel != prior_channel
            zap_due = zap and (now - last_zap_wake >= args.zap_cooldown_seconds)
            stale_due = age >= args.stale_seconds and (now - last_wake >= args.cooldown_seconds)
            if not zap_due and not stale_due:
                if age >= args.stale_seconds:
                    log(args.log, f"SKIP cooldown device={device} age_s={age} last_wake_age_s={now - last_wake}")
                state[device] = dict(prior, last_channel=channel)
                continue
            reason = "zap" if zap_due else "stale"
            event = {
                "device_id": device,
                "delta_type": "ara.wake",
                "wake_at": now * 1000,
                "wake_reason": reason,
                "source": "vps_wake_watchdog",
                "channel_id": channel,
                "flags": {"kind": "FLAT"},
            }
            payload = json.dumps(event, separators=(",", ":"), ensure_ascii=False)
            if args.dry_run:
                log(args.log, f"DRY_RUN would_wake device={device} reason={reason} age_s={age} channel={channel or '-'}")
                state[device] = dict(prior, last_channel=channel)
                continue
            conn.execute(
                "INSERT INTO policy_deltas "
                "(created_at, expires_at, target_device_id, channel_id, delta_type, priority, payload_json, applied_count, source) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    now,
                    now + 300,
                    device,
                    channel or None,
                    "ara.wake",
                    100,
                    payload,
                    0,
                    "vps_wake_watchdog",
                ),
            )
            conn.commit()
            updated = dict(prior)
            updated["last_wake"] = now
            updated["last_channel"] = channel
            if reason == "zap":
                updated["last_zap_wake"] = now
            state[device] = updated
            log(args.log, f"WAKE device={device} reason={reason} age_s={age} channel={channel or '-'} cooldown_s={args.cooldown_seconds}")
        if not args.dry_run:
            tmp = state_path.with_suffix(state_path.suffix + ".tmp")
            tmp.write_text(json.dumps(state, ensure_ascii=False, sort_keys=True), encoding="utf-8")
            os.chmod(tmp, 0o600)
            tmp.replace(state_path)
    finally:
        conn.close()
        fcntl.flock(lock_fh, fcntl.LOCK_UN)
        lock_fh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
