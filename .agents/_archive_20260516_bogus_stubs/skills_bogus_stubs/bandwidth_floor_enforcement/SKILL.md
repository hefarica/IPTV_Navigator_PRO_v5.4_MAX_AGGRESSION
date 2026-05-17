---
name: Bandwidth Floor Enforcement Engine v1.0
description: Guarantees minimum bandwidth per profile (P0-P5). Never lets player adaptive logic drop below the floor. Integrates with NeuroBuffer — in crisis, amplifies the floor to DEMAND more bandwidth from ISP.
---

# Bandwidth Floor Enforcement Engine v1.0

## Purpose

Each channel profile requires a minimum bandwidth to maintain quality. The Bandwidth Floor Enforcement Engine ensures the player's adaptive logic NEVER drops below this minimum. If the ISP/network can't provide it naturally, the engine "strangles" the connection to DEMAND what it needs via DSCP, parallel TCP, and adaptive-logic overrides.

## Profile Floors (from resolve_quality.php)

| Profile | Resolution | min_bw (bps) | Floor (Mbps) | Bitrate (kbps) |
|:---|:---|:---:|:---:|:---:|
| P0 | 4K ULTRA | 50,000,000 | **50 Mbps** | 13,400 |
| P1 | 8K SUPREME | 40,000,000 | **40 Mbps** | 42,900 |
| P2 | 4K EXTREME | 20,000,000 | **20 Mbps** | 13,400 |
| P3 | FHD | 5,000,000 | **5 Mbps** | 3,700 |
| P4 | HD | 2,000,000 | **2 Mbps** | 2,800 |
| P5 | SD | 500,000 | **0.5 Mbps** | 1,500 |

## NeuroBuffer Integration: Floor Amplification

When NeuroBuffer detects network stress, the floor is AMPLIFIED:

| Buffer Level | Multiplier | P2 Example | P0 Example |
|:---|:---:|:---|:---|
| NORMAL | x1.0 | 20 Mbps | 50 Mbps |
| ESCALATING | x1.25 | 25 Mbps | 62.5 Mbps |
| BURST | x1.5 | 30 Mbps | 75 Mbps |
| NUCLEAR | x2.0 | **40 Mbps** | **100 Mbps** |

**The floor NEVER goes DOWN — only UP during crisis.**

## Headers Injected

### HTTP Headers (X-headers)
```
X-Bandwidth-Floor: 40000000
X-Bandwidth-Floor-Label: 4K_EXTREME_20M
X-Bandwidth-Floor-Mult: 2
X-Bitrate-Floor-Kbps: 26800
X-Quality-Lock: NATIVA_MAXIMA
X-Degradation-Allowed: false
X-Min-Bandwidth-Guarantee: 40000000
```

### EXTVLCOPT (Player directives)
```
#EXTVLCOPT:adaptive-logic=highest
#EXTVLCOPT:adaptive-maxwidth=3840
#EXTVLCOPT:adaptive-maxheight=2160
#EXTVLCOPT:adaptive-bw-min=40000000
#EXTVLCOPT:adaptive-bw-max=120000000
```

### APE Tags
```
#EXT-X-APE-BW-FLOOR:40000000
#EXT-X-APE-BW-FLOOR-LABEL:4K_EXTREME_20M
#EXT-X-APE-BITRATE-LOCK:26800K
#EXT-X-APE-QUALITY-DEGRADATION:FORBIDDEN
```

## Philosophy

> "If the ISP doesn't provide the bandwidth, the system strangles the connection to DEMAND what it needs — without negotiation."

The combination of:
1. **Bandwidth Floor** (minimum Mbps enforced)
2. **DSCP marking** (AF31/AF41/EF — traffic prioritization)
3. **Parallel TCP connections** (3/4/6/8 per escalation level)
4. **adaptive-logic=highest** (player forced to request max quality)

Means the ISP router sees high-priority video traffic from multiple parallel connections, all demanding the maximum bitrate. The network has no choice but to allocate bandwidth.

## Monitoring

```bash
tail -f /var/log/iptv-ape/bw_floor.log
```

Log format:
```
[timestamp] ch=ID profile=PX floor=NMbps mult=Nx enforced=NMbps bitrate=NK buffer_level=LEVEL
```

## Files

- `resilience_integration_shim.php`: `applyBandwidthFloor()` method
- Log: `/var/log/iptv-ape/bw_floor.log`
