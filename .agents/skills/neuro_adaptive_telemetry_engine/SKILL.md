---
name: Neuro-Adaptive Telemetry Engine v2.0 (Condition-Based Buffer Derivation)
description: Derives real-time buffer health from HTTP request frequency patterns per channel. Replaces hardcoded 72% buffer default with condition-based derivation that feeds the NeuroBufferController escalation cascade.
---

# Neuro-Adaptive Telemetry Engine v2.0

## Purpose

Transform the NeuroBufferController from a static, hardcoded 72% buffer default into a truly adaptive, learning system. By implementing passive telemetry in the resilience shim, derive real-time buffer health metrics from request frequency patterns per channel.

## Architecture

```
Player → HTTP Request → resolve_quality.php → Resilience Shim
                                                    ↓
                                          deriveBufferFromTelemetry()
                                                    ↓
                                    ┌───────────────────────────┐
                                    │  Per-Channel State:       │
                                    │  - timestamps[]           │
                                    │  - total_hits             │
                                    │  - first_seen             │
                                    │  - profile (P0-P5)        │
                                    └───────────────────────────┘
                                                    ↓
                                          buffer_pct (0-100%)
                                                    ↓
                                     NeuroBufferController::calculateAggression()
                                                    ↓
                                     NORMAL / ESCALATING / BURST / NUCLEAR
```

## Core Principle: Condition-Based, NOT Time-Based

Stability is NEVER derived from channel age. It's derived from MEASURED CONDITIONS:

| Signal | Metric | Proxy For |
|:---|:---|:---|
| **Request Gap** | Avg seconds between requests | Buffer fullness + Network speed |
| **Retry Count** | Requests in 60s window | Buffer crisis severity |
| **Gap Trend** | First-half vs second-half gaps | Network improving/degrading |

**Key insight**: If network is fast AND buffer is full → player doesn't retry → large gaps. The gap IS the measurement of buffer_condition × network_speed.

## Signal Derivation

### Gap-Based Signal (Signal A)
```php
avgGap < 2s   → gapSignal = 5%   (MELTDOWN)
avgGap < 5s   → gapSignal = 15%  (BURST)
avgGap < 15s  → gapSignal = 30%  (ESCALATING)
avgGap < 30s  → gapSignal = 55%  (ESCALATING low)
avgGap > 30s  → gapSignal = 85%  (NORMAL — proven stable)
```

### Retry-Based Hard Ceiling (Signal B)
```php
6+ retries → retryCeiling = 5%   (NUCLEAR, no discussion)
5 retries  → retryCeiling = 8%   (NUCLEAR)
4 retries  → retryCeiling = 15%  (BURST)
3 retries  → retryCeiling = 20%  (BURST — was ESCALATING, caused freeze!)
2 retries  → retryCeiling = 50%  (ESCALATING)
1 request  → retryCeiling = 95%  (no ceiling)
```

### Final: min(A, B) + modifiers
```php
conditionPct = min(gapSignal, retryCeiling) + freezeMemory
bufferPct = conditionPct + trendMod + profilePush + freqPenalty
```

## State Persistence

- **File**: `/tmp/neuro_telemetry_state.json`
- **Permissions**: `www-data:www-data 664`
- **Cleanup**: Every 5 minutes, channels idle >5min are purged
- **Window**: 60 seconds rolling window for timestamps

## Monitoring

```bash
tail -f /var/log/iptv-ape/neuro_telemetry.log
```

Log format:
```
[timestamp] ch=ID reqs=N gap=Xs gapSig=N retryCeil=N mem=N cond=N trend=X(+N) prof=PX(+N) FINAL=N%
```

## Files

| File | Location |
|:---|:---|
| `resilience_integration_shim.php` | `/var/www/html/cmaf_engine/` |
| State file | `/tmp/neuro_telemetry_state.json` |
| Telemetry log | `/var/log/iptv-ape/neuro_telemetry.log` |

## Tuning Parameters

| Parameter | Default | Effect |
|:---|:---|:---|
| `TELEMETRY_WINDOW` | 60s | Analysis window for timestamps |
| Gap thresholds | 2/5/15/30s | When to escalate based on gaps |
| Retry ceiling | 3 retries = BURST | Hard override regardless of gap |
| Freeze memory | -10 at 10+ hits | Permanent penalty for troubled channels |
| Profile push | P0/P1=-15, P2=-10 | Higher res = more aggressive |
