---
name: DSCP Aggression Cascade v2.0
description: DSCP traffic prioritization on ALL escalation levels (not just NUCLEAR). Minimum 3 TCP connections even in NORMAL. Escalates 3→4→6→8 connections with AF31→AF31→AF41→EF DSCP marking.
---

# DSCP Aggression Cascade v2.0

## Purpose

Ensure the ISP router ALWAYS treats IPTV traffic as priority video streaming, not best-effort web browsing. DSCP is active on ALL levels — the only difference is the priority class.

## Escalation Profiles

| Level | Connections | DSCP | DSCP Value | Strategy | Buffer Target | Prefetch |
|:---|:---:|:---|:---:|:---|:---:|:---:|
| 🟢 NORMAL | **3** | AF31 | 26 | STANDARD_FLOW | 30s | 2 segments |
| 🟡 ESCALATING | **4** | AF31 | 26 | DUAL_TCP_PREFETCH | 60s | 4 segments |
| 🟠 BURST | **6** | AF41 | 34 | ACCEPT_RANGES_PARALLEL | 90s | 8 segments |
| 🔴 NUCLEAR | **8** | EF | 46 | CHUNK_SPLITTING_MULTI_CDN | 120s | 16 segments |

## DSCP Explained

| Class | Value | RFC Meaning | Our Usage |
|:---|:---:|:---|:---|
| BE (Best Effort) | 0 | Default internet traffic | **NOT USED** (was NORMAL before) |
| AF31 | 26 | Assured Forwarding, medium priority | NORMAL + ESCALATING |
| AF41 | 34 | Assured Forwarding, high priority | BURST |
| EF | 46 | Expedited Forwarding (voice/video) | NUCLEAR |

## Why 3 Connections Minimum

Before: NORMAL used 1 TCP connection. This meant:
- Single point of failure
- No parallel downloading
- Slow buffer fill on first load

Now: NORMAL uses 3 TCP connections:
- 3x parallel downloads from the start
- If one connection stalls, 2 others continue
- Buffer fills 3x faster on initial channel load
- Combined with DSCP AF31 → ISP prioritizes all 3

## Connection × DSCP × Floor = Total Aggression

```
NORMAL:     3 conn × AF31 × 20 Mbps floor     = 60 Mbps demand
ESCALATING: 4 conn × AF31 × 25 Mbps floor     = 100 Mbps demand
BURST:      6 conn × AF41 × 30 Mbps floor     = 180 Mbps demand
NUCLEAR:    8 conn × EF   × 40 Mbps floor     = 320 Mbps demand
```

## Implementation

File: `neuro_buffer_controller.php`, method `buildAggressionProfile()`

```php
$profiles = [
    self::LEVEL_NORMAL => [
        'connections' => 3,
        'dscp'        => self::DSCP_ESCALATE,  // AF31
    ],
    self::LEVEL_ESCALATE => [
        'connections' => 4,
        'dscp'        => self::DSCP_ESCALATE,  // AF31
    ],
    self::LEVEL_BURST => [
        'connections' => 6,
        'dscp'        => self::DSCP_BURST,     // AF41
    ],
    self::LEVEL_NUCLEAR => [
        'connections' => 8,
        'dscp'        => self::DSCP_NUCLEAR,   // EF
    ],
];
```

## Files

- `neuro_buffer_controller.php`: `buildAggressionProfile()` method
- Shim operations log: `/var/log/iptv-ape/shim_operations.log`
