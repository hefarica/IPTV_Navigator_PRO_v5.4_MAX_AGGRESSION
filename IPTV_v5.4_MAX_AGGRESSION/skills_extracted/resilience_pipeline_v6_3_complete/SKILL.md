---
name: Resilience Architecture v6.4 — 9-Layer Anti-Cut Shield + 5-Motor Pipeline
description: Complete resilience pipeline with 9-layer anti-cut shield (Predictive Jump + Redundancy Hydra), polymorphic AI orchestrator for 20 devices, bandwidth floor enforcement, and DSCP aggression cascade.
---

# Resilience Architecture v6.4 — Complete Pipeline

## The 5-Motor Pipeline (~5ms total)

```
Request → resolve_quality.php
  ↓
  Motor 1: NeuroBufferController (9-Layer Anti-Cut Shield)
    → Polymorphic Freeze Detector: dual-signal min()
    → 9 caching/resilience layers (see below)
    → Sprint Start: first request = NUCLEAR
    → Freeze Memory: troubled channels get -10 penalty
  ↓
  Motor 2: BandwidthFloorEnforcement
    → P0=50M, P1=40M, P2=20M, P3=5M, P4=2M, P5=0.5M
    → NUCLEAR: floor × 2.0
  ↓
  Motor 3: ModemPriorityManager (DSCP)
    → NORMAL: AF31, BURST: AF41, NUCLEAR: EF
  ↓
  Motor 4: AISuperResolutionEngine v4.0
    → 20 devices, combo detection, HDR/SDR 4000-5000 nits
  ↓
  Motor 5: Shim Logging (~5ms avg total)
```

## 9-Layer Anti-Cut Shield

| # | Capa | Directivas | NORMAL | NUCLEAR |
|:---:|:---|:---|:---:|:---:|
| 1 | Network Cache (RAM) | `network-caching` | 45s | 180s (3 min) |
| 2 | Live Cache (stream) | `live-caching` (solo live) | 30s | 120s |
| 3 | File Cache (prefetch) | `file-caching` (3x para VOD) | 45s | 360s (6 min) |
| 4 | Disc Cache (disco) | `disc-caching` | 60s | 300s (5 min) |
| 5 | Connection Resilience | `http-reconnect`, `http-continuous`, `sout-keep`, `sout-mux-caching`, `http-forward-cookies`, `ipv4-timeout` | 6 activas | 30s timeout |
| 6 | Clock Tolerance | `clock-jitter=0`, `clock-synchro=0`, `cr-average`, `avcodec-hurry-up`, `skip-frames` | Tolerante | Ultra tolerante |
| 7 | Player-Specific | ExoPlayer buffer, Kodi ISA, OTT Navigator, `adaptive-maxwidth=3840` | Todas | Todas |
| 8 | **Predictive Jump** | `X-Live-Edge-Policy: JUMP_ON_UNDERRUN` — salta al live edge en vez de freezear | 3.0s min | 1.5s min |
| 9 | **Redundancy Hydra** | `X-Backup-Stream-Url` + `X-Failover-Policy: SEAMLESS_30MS` | Activa si hay fallback | Exponential backoff |

### Stream Type Awareness
- **Live**: live-caching + Predictive Jump activo
- **VOD/Series**: file-caching 3x + deep prefetch (sin jump)

### Mobile Adjustment
- En 4G/5G: network-cache capped a 15s para arranque rápido
- disc-cache y live-cache se encargan del sostenimiento

## Files on VPS

```
/var/www/html/
├── resolve_quality.php                              (56KB)
├── cmaf_engine/
│   ├── resilience_integration_shim.php             (32KB)
│   └── modules/
│       ├── neuro_buffer_controller.php             (28KB, 9-Layer Shield)
│       ├── modem_priority_manager.php              (DSCP)
│       └── ai_super_resolution_engine.php          (36KB, v4.0)
```

## Logs & State

```
/var/log/iptv-ape/
├── shim_operations.log    ← JSON per request
├── neuro_telemetry.log    ← Buffer decisions
├── bw_floor.log           ← Bandwidth floor
└── fallback.log           ← Server fallback

/tmp/
├── neuro_telemetry_state.json   ← Channel state
└── ape_device_memory.json       ← Device combo
```

## Monitoring

```bash
# Live pipeline
tail -f /var/log/iptv-ape/shim_operations.log

# Device combos
cat /tmp/ape_device_memory.json

# Channel health
cat /tmp/neuro_telemetry_state.json | python3 -m json.tool
```
