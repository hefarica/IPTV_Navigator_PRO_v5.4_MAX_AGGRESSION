---
name: Polymorphic Freeze Detector v3.0
description: Dual-signal freeze prevention algorithm. Uses min() of gap-based and retry-based signals to ensure the MOST AGGRESSIVE response always wins. Includes freeze memory for channels with trouble history.
---

# Polymorphic Freeze Detector v3.0

## Problem Solved

Real Madrid TV FHD (ch=587511) froze because:
- 3 retries with 13s average gap
- Gap-based signal: 55% → ESCALATING (x2)
- But 3 retries should have triggered BURST (x4)
- The gap was "comfortable" but the retry count proved the buffer was failing

## Solution: Dual-Signal min()

```
SEÑAL A (gap-based)     SEÑAL B (retry count)
      ↓                       ↓
  gapSignal              retryCeiling
      ↓                       ↓
┌──────────────────────────────┐
│   conditionPct = min(A, B)   │  ← MOST AGGRESSIVE wins
└──────────────────────────────┘
              ↓
  + freezeMemoryPenalty    ← Known troubled channel
  + trendMod               ← Network degrading: -20
  + profilePush            ← 4K/8K: -10/-15
  + freqPenalty            ← 4+ retries: -5 each
              ↓
       FINAL buffer_pct
```

## Properties

### Idempotent
Same inputs ALWAYS produce same output. It's a pure function of:
- `ch['timestamps']` (request history)
- `ch['total_hits']` (lifetime count)
- `ch['profile']` (P0-P5)

No randomness, no external state, no mutation beyond adding the current timestamp.

### Polymorphic
Adapts its thresholds based on the channel's freeze history:
- **New channel** (< 5 total hits): Standard thresholds
- **Moderate history** (5-10 hits): -5% penalty
- **Known trouble** (10+ hits): -10% permanent penalty

This means a channel that froze once will be treated MORE aggressively on future zaps, even if the current gap looks fine.

## The Fix for Real Madrid TV

| Scenario | v2.0 (old) | v3.0 (new) |
|:---|:---|:---|
| 3 retries, 13s gap | 55% → ESCALATING | min(30%, 20%) = 20% → **BURST** |
| 3 retries, 3s gap | 15% → BURST | min(15%, 20%) = 15% → **BURST** |
| 1 retry, 2s gap | 5% → NUCLEAR | min(5%, 95%) = 5% → **NUCLEAR** |
| 5 retries, 20s gap | 55% → ESCALATING | min(55%, 8%) = 8% → **NUCLEAR** |

## Behavior Summary

```
Network drops → more retries → NUCLEAR
Stays NUCLEAR until network PROVES stability
Proof = gap > 30s AND < 2 retries in window
Known troubled channel? Even stricter requirements
```

## Files

- `resilience_integration_shim.php`: Lines 441-530 (deriveBufferFromTelemetry)
- Log: `/var/log/iptv-ape/neuro_telemetry.log`
