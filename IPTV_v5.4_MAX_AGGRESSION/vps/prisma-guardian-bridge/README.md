# PRISMA ↔ Guardian Bridge v1.0

Closes the integration gap between the **APE Realtime Bitrate Guardian** (Python daemon, collects ExoPlayer telemetry via ADB) and the **PRISMA Health PHP API** (reads SHM, surfaces metrics to the frontend widget).

## The problem (validated against `prisma-log-2026-04-28T12-16-10.json`)

The PRISMA log shows 200 polling cycles where `bitrate=0`, `HW=false`, `saved=0Kbps`, `eff=0%`, `layer=0Kbps`. Reason:

1. Guardian's [`probes/adb_player.py`](../ape-realtime-guardian/ape_realtime_guardian/probes/adb_player.py) collects rich data: `codec`, `resolution`, `bitrate_kbps`, `decoder_type` (HW/SW), `dropped_frames`, `buffer_ms`.
2. Guardian's [`adapters/shm_write.py`](../ape-realtime-guardian/ape_realtime_guardian/adapters/shm_write.py) only persists `{demand_mbps, buffer_state}` to `/dev/shm/ape_bitrate_demand.json`.
3. PRISMA's [`api/prisma-health.php`](../prisma/api/prisma-health.php) (line 145) reads `/dev/shm/guardian_player_state.json` — a path **nobody writes** — so it falls back to defaults → `bitrate_kbps=0` → all per-lane KPIs computed against 0 → log shows zeros.

## The fix (this bridge)

A standalone Python daemon that:

1. Tails Guardian's `audit.jsonl` (which already contains the full probe state).
2. Extracts the player_state subset the PHP expects.
3. Writes atomically (`tempfile + os.replace`) to `/dev/shm/guardian_player_state.json` at 1 Hz.

PRISMA then reads real data and emits real KPIs — no PHP, Guardian, or frontend code is modified.

## Architecture

```
Fire TV ExoPlayer (logcat)
        │
        │ ADB + WireGuard
        ▼
Guardian Probe (adb_player.py)
        │
        ├─→ shm_write.py → /dev/shm/ape_bitrate_demand.json   (unchanged)
        │
        └─→ audit_logger.py → /var/log/ape-guardian/audit.jsonl  (unchanged)
                                          │
                                          │  read by THIS BRIDGE
                                          ▼
                          prisma_guardian_bridge.py
                                          │
                                          ▼
                          /dev/shm/guardian_player_state.json  ← NEW (PRISMA reads here)
                                          │
                                          ▼
                              prisma-health.php (unchanged)
                                          │
                                          ▼
                              prisma-control-widget.js (unchanged)
                                          │
                                          ▼
                              Real KPIs in widget log ✓
```

## Constraints respected

- ✅ **iptv-omega-no-delete** — only NEW files; no existing file modified.
- ✅ **iptv-vps-touch-nothing** — pre/post SHA-256 verification of 3 frozen files (PHP + main.py + shm_write.py) embedded in `install.sh`. Aborts with exit code 2 if drift detected.
- ✅ **iptv-autopista-doctrine** — no rate limiting, no circuit breaker, no upstream change. Bridge writes to local `/dev/shm` only.
- ✅ **iptv-pre-edit-audit** — no edits, only adds.
- ✅ **Failure-closed** — if audit log missing or stale, bridge writes nothing. PRISMA degrades gracefully back to defaults exactly as today.
- ✅ **Resource-bounded** — systemd `CPUQuota=5%` `MemoryMax=64M`.

## Deploy

From your dev machine:

```bash
# Sync to VPS
rsync -avz --delete \
  IPTV_v5.4_MAX_AGGRESSION/vps/prisma-guardian-bridge/ \
  root@iptv-ape.duckdns.org:/tmp/prisma-guardian-bridge/

# On VPS
ssh root@iptv-ape.duckdns.org
cd /tmp/prisma-guardian-bridge
chmod +x install.sh uninstall.sh
sudo ./install.sh
```

Optional: pass a custom audit log path:
```bash
sudo ./install.sh /custom/path/to/audit.jsonl
```

## Verify

```bash
# 1. Bridge is running
systemctl status prisma-guardian-bridge

# 2. SHM file exists with real data (NOT zeros)
cat /dev/shm/guardian_player_state.json | jq
# Expected: {"codec":"avc","resolution":"4K","bitrate_kbps":7058,"decoder_type":"HW",...}

# 3. PRISMA endpoint surfaces it
curl -s https://iptv-ape.duckdns.org/prisma/api/prisma-health.php | jq '.player_telemetry'
# Expected: source = "guardian_player_state.json"
#           stream.bitrate_kbps > 0
#           stream.decoder = "HW"

# 4. PRISMA per-lane metrics now non-zero
curl -s https://iptv-ape.duckdns.org/prisma/api/prisma-health.php | jq '.lane_metrics.cmaf'
# Expected: bandwidth_saved_kbps > 0 (was 0 before bridge)
#           hw_decoder_direct = true (was false)

# 5. Live bridge logs
journalctl -u prisma-guardian-bridge -f
```

## Rollback

Single command:

```bash
sudo /opt/prisma-guardian-bridge/uninstall.sh
```

Removes systemd unit, install dir, and SHM file. PRISMA returns to pre-bridge defaults. **No production file was ever modified, so no other rollback is needed.**

## Smoke test in dev (no VPS)

```bash
# Create fake audit data
mkdir -p /tmp/ape-test
cat > /tmp/ape-test/audit.jsonl <<'EOF'
{"_ts":1714303200,"_iso":"2026-04-28T12:00:00","probe.adb_player":{"devices":{"firetv":{"bitrate_kbps":7058,"resolution":"4K","codec":"avc","decoder_type":"HW","dropped_frames":0,"buffer_ms":5000}},"bitrate_kbps":7058,"resolution":"4K","codec":"avc","decoder_type":"HW","dropped_frames":0,"buffer_ms":5000},"demand_mbps":14.5}
EOF

# Run bridge once
python3 prisma_guardian_bridge.py \
  --audit-log /tmp/ape-test/audit.jsonl \
  --output /tmp/ape-test/player_state.json \
  --once -v

# Verify output
cat /tmp/ape-test/player_state.json | jq
# Should print the full schema with all 6 fields populated
```

## Edge cases handled

| Case | Behavior |
|---|---|
| Audit log missing | Backoff exponential, log warn every 30 cycles |
| Audit log permission denied | Log error, retry next cycle |
| Last line is a partial write | Falls back to second-to-last line (handles flush race) |
| Audit entry older than 30s | Skipped (PRISMA sees stale `_audit_ts`) |
| Audit entry has no probe data | Skipped silently, no-op |
| Multiple ADB devices | Picks the one with highest bitrate (matches Guardian's `_aggregate_best`) |
| Disk space exhausted on `/dev/shm` | `os.replace` fails, error logged, no partial write |

## Future considerations (NOT in v1.0)

- Inotify-based watcher to write only on audit changes (saves CPU when idle).
- Direct integration in `Guardian.main.py` adapter pipeline once the user authorizes editing `main.py`.
- Bridge for `prisma_player_telemetry.json` (the second SHM path PHP also reads).

## Related skills

- `iptv-omega-no-delete` — no existing file touched.
- `iptv-vps-touch-nothing` — SHA-256 manifest pre/post verification.
- `iptv-cortex-init-mandatory` — full architecture mapped (3 Explore agents) before this fix was written.
