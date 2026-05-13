# APE Real-Time Bitrate Guardian v1.0

> 1Hz demand controller for IPTV streaming optimization.

## Overview

Asyncio daemon that monitors bitrate, buffer, network health, and VPS resources every second. Computes optimal demand using a 7-factor formula with safety clamps.

## Architecture

```
Probes (psutil + ADB) → Engines (deficit + buffer + predictive + VPS) → Decision → Adapter
```

## Quick Start

```bash
# Install (on VPS)
bash scripts/install.sh

# Start (dry_run=true by default)
systemctl start ape-realtime-guardian

# Check status
systemctl status ape-realtime-guardian
journalctl -u ape-realtime-guardian -f

# View audit trail
tail -f /var/log/ape-realtime-guardian/audit.jsonl

# Prometheus metrics
curl http://localhost:8767/metrics

# Run tests (local)
pip install -r requirements.txt
pytest tests/ -v
```

## Modes

| Mode | Adapter | Effect |
|------|---------|--------|
| `dry_run: true` + `simulated` | Log only | **Day-1 default** |
| `dry_run: false` + `shm_write` | `/dev/shm/ape_bitrate_demand.json` | Phase 2 |
| `dry_run: false` + `quantum_signal` | Merge into `quantum_directives.json` | Phase 3 |
| `dry_run: false` + `nginx_lua` | HTTP POST to Lua | Phase 3+ |

## Rollback

```bash
# L1: Stop
systemctl stop ape-realtime-guardian

# L2: Disable
systemctl disable ape-realtime-guardian

# L3: Full uninstall
bash /opt/ape-realtime-guardian/scripts/uninstall.sh
```

## Config

Edit `/etc/ape-realtime-guardian/config.yaml`. Send `SIGHUP` to reload without restart:

```bash
systemctl reload ape-realtime-guardian
# or
kill -HUP $(pidof python3)
```

## Files

```
/opt/ape-realtime-guardian/          # Application
/etc/ape-realtime-guardian/          # Config
/var/log/ape-realtime-guardian/      # Logs + audit
/var/lib/ape-realtime-guardian/      # Persisted state
/dev/shm/ape_bitrate_demand.json    # Output (when adapter=shm_write)
```
