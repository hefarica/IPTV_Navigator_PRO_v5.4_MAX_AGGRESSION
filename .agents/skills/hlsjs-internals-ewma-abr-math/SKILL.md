---
name: hlsjs-internals-ewma-abr-math
description: Use when calibrating ABR parameters (abrEwmaFastLive, abrEwmaSlowLive, abrBandWidthFactor, abrBandWidthUpFactor), debugging "player stuck on low quality despite good bandwidth", reasoning about why level-up is slow, or reading hls.js's bandwidth estimation logic. Covers EWMA math + EwmaBandWidthEstimator dual-track + AbrController findBestLevel.
---

# hls.js Internals — EWMA, BandWidthEstimator & AbrController

Source: https://nochev.github.io/hls.js/docs/html/class/src/utils/ewma.js~EWMA.html · ewma-bandwidth-estimator · abr-controller

## Overview

ABR (Adaptive Bitrate) decisions in hls.js are driven by a **dual-track exponentially-weighted moving average**:

- `fast_` EWMA — short half-life (default 3s live / 3s VoD): responsive to bandwidth changes
- `slow_` EWMA — longer half-life (default 9s live / 9s VoD): stability buffer
- `getEstimate()` returns **min(fast, slow)** — conservative (use the lower of the two)

This dual-track plus `abrBandWidthUpFactor=0.7` (need 43% bandwidth headroom to upgrade) creates **asymmetric switching** — switches DOWN aggressively, switches UP conservatively.

## When to Use

- "Player won't switch up to 4K even though bandwidth is fine" → check fast/slow EWMA balance + abrBandWidthUpFactor
- "Player thrashes between levels" → fast EWMA too short, or slow EWMA not enough damping
- Tuning a new profile's ABR parameters → understand math before editing values
- Debugging emergency level-down (`maxStarvationDelay` triggers)
- Reading `_findBestLevel()` source to understand level selection logic

## EWMA Class — Math Model

```
constructor(halfLife)
  alpha_ = exp(-Math.log(2) / halfLife)  // decay constant
  estimate_ = 0
  totalWeight_ = 0

sample(weight, value)
  adjAlpha = alpha_^weight             // weighted decay
  estimate_ = (1 - adjAlpha) * value + adjAlpha * estimate_
  totalWeight_ = adjAlpha * totalWeight_ + weight

getEstimate()
  zeroFactor = 1 - alpha_^totalWeight_  // bias correction for early samples
  return estimate_ / zeroFactor

getTotalWeight()
  return totalWeight_                  // total seconds of samples accumulated
```

**Half-life semantics:** `halfLife=3` means a sample 3 seconds old has half the weight of a fresh sample.

## EwmaBandWidthEstimator — Reference

### Construction
```javascript
new EwmaBandWidthEstimator(hls, slow=9, fast=3, default=500000)
```

| Param | Default | Purpose |
|---|---|---|
| `slow` (`abrEwmaSlowLive`/`abrEwmaSlowVoD`) | 9s | Long-window EWMA half-life |
| `fast` (`abrEwmaFastLive`/`abrEwmaFastVoD`) | 3s | Short-window EWMA half-life |
| `default` (`abrEwmaDefaultEstimate`) | 500_000 bps | Initial estimate before first sample |
| `minWeight_` | (internal) | Min seconds of samples before `canEstimate()` returns true |
| `minDelayMs_` | (internal) | Min chunk download time to be sampled (filter out tiny chunks) |

### Methods
| Method | Signature | Behavior |
|---|---|---|
| `sample(durationMs, numBytes)` | `(number, number) → void` | Compute `bps = numBytes*8000/durationMs`, weight = `durationMs/1000`. Sample both EWMAs. |
| `getEstimate()` | `() → number` | Returns `Math.min(fast.getEstimate(), slow.getEstimate())` |
| `canEstimate()` | `() → boolean` | True once `slow.getTotalWeight() >= minWeight_` |
| `destroy()` | `() → void` | Cleanup |

## AbrController — Reference

### Key Properties
| Property | Purpose |
|---|---|
| `_bwEstimator` | Instance of `EwmaBandWidthEstimator` |
| `lastLoadedFragLevel` | Index of last fragment's quality level |
| `nextAutoLevel` (rw) | Override for auto-selected level |
| `fragCurrent` | Fragment currently being processed |
| `timer` | Periodic ABR check (fires while a fragment is loading, for abandon-and-downgrade) |

### Event Handlers
- `onFragLoading(data)` — start ABR-abandon timer
- `onFragLoaded(data)` — sample bandwidth into `_bwEstimator`
- `onFragBuffered(data)` — finalize stats
- `onError(data)` — handle network errors (stop timer)

### Core Logic — `_findBestLevel()`

For each level (highest→lowest):
1. Estimate fetch duration: `levelBitrate * fragDuration / (estimate * abrBandWidthFactor)`
2. If fetch duration < `Math.min(maxFetchDuration, fragDuration)` → level passes constraint
3. If level > current AND `estimate * abrBandWidthUpFactor < levelBitrate` → veto (need more headroom)
4. First passing level = best

### Core Logic — `_abandonRulesCheck()`

While a fragment is loading:
1. Compute `expectedLen = bytesLoaded / loadedFraction`
2. Compute `pesimisticTotalDurationMs = expectedLen / loadingSpeed`
3. If projected total > buffered ahead × tolerance → abandon, switch down

## Critical Defaults from `hlsDefaultConfig`

| Key | Default | Effect |
|---|---|---|
| `abrEwmaFastLive` | 3 | Fast EWMA half-life for live |
| `abrEwmaSlowLive` | 9 | Slow EWMA half-life for live |
| `abrEwmaFastVoD` | 3 | Same for VoD |
| `abrEwmaSlowVoD` | 9 | Same for VoD |
| `abrEwmaDefaultEstimate` | 500_000 | Initial estimate (kbps) |
| `abrBandWidthFactor` | 0.95 | Use 95% of estimated BW for selection |
| `abrBandWidthUpFactor` | 0.7 | **Need 1/0.7 = 43% MORE BW than level requires to upgrade** |
| `abrMaxWithRealBitrate` | false | If true, use measured bitrate not declared |
| `maxStarvationDelay` | 4 | Seconds buffer before emergency switch |
| `maxLoadingDelay` | 4 | Max load delay |
| `minAutoBitrate` | 0 | Floor for auto level (bps) |

## Tuning Recipes (Toolkit-Specific)

| Goal | Adjustment |
|---|---|
| Faster recovery from BW drop | `abrEwmaFastLive: 1.5` (2x more responsive) |
| Less thrashing | `abrEwmaSlowLive: 12-15` (more damping) |
| Quicker upgrade to higher quality | `abrBandWidthUpFactor: 0.85` (need only 18% headroom). **WARN:** risk of overcommit + rebuffer |
| Aggressive emergency-down | `maxStarvationDelay: 2` |
| More conservative selection | `abrBandWidthFactor: 0.85` (use only 85% of est BW) |

## Common Bugs

| Symptom | Diagnosis |
|---|---|
| Stuck at lowest level despite good BW | First sample landed at low value; slow EWMA still recovering. Increase `abrEwmaDefaultEstimate` if connection is known fast. |
| Level oscillation 720↔1080 every few seconds | Fast EWMA dominates min(fast,slow); add damping via `abrEwmaFastLive: 5+` |
| Won't upgrade past 720p with 50Mbps real BW | Levels list has only 720p as next-up + `_findBestLevel` veto due to `abrBandWidthUpFactor` headroom. Inspect `levels[]` |
| `_bwEstimator.canEstimate()` returns false forever | Each chunk shorter than `minDelayMs_`; provider chunking too small |

## Cross-references

- **hlsjs-official-calibration** — official defaults catalog with values
- **hlsjs-internals-fragment-lifecycle** — Fragment loaded → AbrController.onFragLoaded → sample()
- **iptv-lab-ssot-no-clamp** — never clamp these values in JS; emit them via LAB CALIBRATED
- **arbx-net-profit-gate** — sister concept (using a math model to gate decisions)
