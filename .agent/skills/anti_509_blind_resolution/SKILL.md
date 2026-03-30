---
name: ANTI_509_GUARDIAN — Zero-Probe Single-Consumer Enforcement
description: Immutable operational skill preventing 509 Bandwidth Limit by enforcing blind resolution and single-consumer origin delivery across all IPTV infrastructure.
---

# ANTI_509_GUARDIAN SKILL v1.0

## Purpose
Prevent error 509 Bandwidth Limit Exceeded by ensuring the VPS never touches, probes, or pre-consumes any IPTV provider origin server. Enforce that exactly 1 consumer (the player) accesses the origin per reproduction.

## Scope
- All PHP backend code (especially `resolve_quality.php`)
- All Nginx configuration
- All crontab entries
- All Docker containers
- All Python/Node/Bash scripts on VPS
- All systemd timers and services
- All background workers

---

## RULE: ZERO_PROBE_SINGLE_CONSUMER

### What Constitutes COMPLIANCE
| Condition | Required |
|---|---|
| `resolve_quality.php` has 0 `curl_init` calls | ✅ |
| `resolve_quality.php` has `BLIND_RESOLUTION_MODE = true` | ✅ |
| `checkStreamHealth()` is disabled with `if(false)` | ✅ |
| Crontab has 0 entries hitting provider domains | ✅ |
| 0 active VPS connections to provider IPs | ✅ |
| 0 Docker containers connecting to providers | ✅ |
| 0 ffmpeg/curl/wget processes hitting provider URLs | ✅ |

### What Constitutes VIOLATION
- Any `curl_init`, `file_get_contents("http://provider...")`, `fsockopen`, `get_headers` in active (non-commented, non-if(false)) PHP code targeting providers
- Any crontab entry that cURLs or probes a provider URL
- Any background process with established TCP to provider IP
- Any Docker container with outbound connection to provider
- `BLIND_RESOLUTION_MODE` not set to `true`
- `checkStreamHealth()` callable without `if(false)` guard

### Consequences
| Severity | Action |
|---|---|
| CRITICAL | Kill process, disable cron, alert, forensic snapshot |
| HIGH | Alert, log, block next deploy |
| MODERATE | Warning in report |

---

## Triggers
- **Pre-deploy**: Guard runs in `--detect` mode. Non-zero exit = deploy blocked.
- **Post-deploy**: Guard runs in `--enforce` mode. Violations auto-remediated.
- **On 509 report**: Guard runs in `--lockdown` mode. Full quarantine.
- **Periodic**: Optional cron every 5 minutes in `--detect` mode (NO provider probing).

---

## Actions

### ALLOWED
- Blind URL construction (string manipulation only)
- Local file reads (`file_get_contents('/local/path')`)
- Return M3U8 with `header('Content-Type: application/x-mpegURL')`
- DNS resolution of provider hostnames (for IP correlation only)
- Reading `ss -tpn` output (passive network observation)

### PROHIBITED — PERMANENTLY BANNED
```
curl_init($providerUrl)
curl_exec($ch)
file_get_contents("http://provider...")
get_headers("http://provider...")
fsockopen("provider", 80, ...)
fopen("http://provider...", "r")
exec("ffmpeg -i http://provider...")
exec("curl http://provider...")
stream_context_create() + fopen(http)
```

### PROHIBITED — INFRASTRUCTURE
```
* * * * * curl http://provider/live/...
* * * * * /path/to/stream_health_monitor.sh
docker run ... ffmpeg -i http://provider/...
```

---

## Guard Tool: `anti_509_guard.py`

| Mode | Behavior |
|---|---|
| `--detect` | Scan and report. Exit code 0=clean, 1=violations |
| `--enforce` | Kill violating processes, clear crontab, alert |
| `--lockdown` | Full quarantine: stop containers, block scripts, whitelist-only |

### 6-Phase Scan
1. Extract provider domains/IPs from M3U lists
2. Scan host TCP connections against provider IPs
3. Scan running processes for stream consumption patterns
4. Audit crontab for provider-probing entries
5. Audit `resolve_quality.php` for banned HTTP patterns
6. Scan Docker containers for provider connections

### Output
- JSON forensic snapshots in `/var/log/iptv-ape/forensic_snapshots/`
- Latest report at `/var/log/iptv-ape/anti_509_report.json`
- Human-readable log at `/var/log/iptv-ape/anti_509_guard.log`

---

## CI/CD Integration

### Pre-Deploy Gate (in `/deploy-vps` workflow)
```bash
# Run guard in detect mode BEFORE deploying
python3 /var/www/html/anti_509_guard.py --detect
# If exit code != 0 → BLOCK DEPLOY
```

### Post-Deploy Verification
```bash
# Run guard in enforce mode AFTER deploying
python3 /var/www/html/anti_509_guard.py --enforce
```

---

## Immutable Checklist (Pre-Release)
- [ ] `grep -c 'curl_init' resolve_quality.php` = 0
- [ ] `grep 'BLIND_RESOLUTION_MODE' resolve_quality.php` = `true`
- [ ] `checkStreamHealth` guarded by `if(false)`
- [ ] `crontab -l` = empty or safe entries only
- [ ] `python3 anti_509_guard.py --detect` exits 0
- [ ] `ss -tpn` shows 0 connections to provider IPs
- [ ] No ffmpeg/curl/wget to provider in `ps aux`

---

## Incident History

| Date | Cause | Duration | Resolution |
|---|---|---|---|
| Mar 2026 | `stream_health_monitor.sh` cron hitting origin 5-8x/min | Weeks | Crontab cleared |
| Mar 2026 | `checkStreamHealth()` active cURL probe | Since deploy | `if(false)` guard |
| Mar 2026 | `/api/resolve_quality` routing to Python (404→fallback) | Since deploy | Nginx rewrite |

---

## Connection Budget

```
TOTAL ALLOWED PER ACCOUNT:  1 connection
RESERVED FOR:               End-user player ONLY
VPS BUDGET:                 0 (ZERO)
CRON BUDGET:                0 (ZERO)
WORKER BUDGET:              0 (ZERO — unless explicitly authorized single-consumer worker)
MONITOR BUDGET:             0 (ZERO)
```
