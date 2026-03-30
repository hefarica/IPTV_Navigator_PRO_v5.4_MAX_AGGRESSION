---
name: Resilience Architecture v6.3 — Complete Pipeline (5 Motors)
description: Documents the complete 5-motor resilience pipeline with latency metrics, escalation cascade, and deployment reference. Covers NeuroBuffer, BW Floor, ModemPriority, AISuperRes, and all supporting subsystems.
---

# Resilience Architecture v6.3 — Complete Pipeline

## The 5-Motor Pipeline

Every channel request passes through 5 motors in series, in ~5ms total:

```
Request → resolve_quality.php
  ↓
  Motor 1: NeuroBufferController (Adaptive Telemetry v3.0)
    → Polymorphic Freeze Detector: dual-signal min()
    → Sprint Start: first request = NUCLEAR
    → Freeze Memory: troubled channels get -10 penalty
    → Output: buffer_pct → NORMAL/ESCALATING/BURST/NUCLEAR
  ↓
  Motor 2: BandwidthFloorEnforcement (Floor × NeuroBuffer)
    → P0=50M, P1=40M, P2=20M, P3=5M, P4=2M, P5=0.5M
    → NUCLEAR: floor × 2.0, BURST: × 1.5, ESCALATING: × 1.25
    → adaptive-logic=highest, adaptive-bw-min enforced
  ↓
  Motor 3: ModemPriorityManager (DSCP on ALL levels)
    → NORMAL: 3 TCP + AF31, ESCALATING: 4 + AF31
    → BURST: 6 + AF41, NUCLEAR: 8 + EF
  ↓
  Motor 4: AISuperResolutionEngine v4.0 (Visual Orchestrator)
    → 20 devices: 9 TVs + 6 players + 5 software
    → Combo detection: player + TV = merged MAX capabilities
    → BW boost for AI processing
    → HW acceleration forcing
    → Always-active HDR/SDR 4000-5000 nits
  ↓
  Motor 5: Shim Logging (3.78ms avg total)
    → JSON structured log per request
    → Telemetry persistence
```

## Latency Profile

| Motor | Time | Notes |
|:---|:---:|:---|
| NeuroBuffer | ~1.5ms | Telemetry + freeze detector |
| BW Floor | ~0.5ms | Floor lookup + multiplier |
| ModemPriority | ~0.5ms | Network detection + DSCP |
| AISuperRes | ~0.8ms | Device detect + combo + headers |
| Logging | ~0.5ms | Non-blocking file_put_contents |
| **Total** | **~3.8ms** | **26x faster than human perception** |

## Files on VPS

```
/var/www/html/
├── resolve_quality.php                              (56KB, profiles P0-P5)
├── cmaf_engine/
│   ├── resilience_integration_shim.php             (32KB, pipeline + telemetry)
│   └── modules/
│       ├── neuro_buffer_controller.php             (18KB, escalation cascade)
│       ├── modem_priority_manager.php              (network + DSCP)
│       └── ai_super_resolution_engine.php          (36KB, v4.0 orchestrator)
```

## Logs

```
/var/log/iptv-ape/
├── neuro_telemetry.log     ← gapSig, retryCeil, mem, FINAL%
├── bw_floor.log            ← floor Mbps, multiplier, enforced
├── shim_operations.log     ← JSON: modules, ms, ai, buf, net
├── ctx_inherit.log         ← context inheritance
└── fallback.log            ← server fallback events
```

## State Files

```
/tmp/
├── neuro_telemetry_state.json    ← channel timestamps, total_hits
└── ape_device_memory.json        ← known devices for combo detection
```
