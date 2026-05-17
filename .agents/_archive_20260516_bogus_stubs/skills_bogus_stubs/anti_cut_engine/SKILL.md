---
description: APE Anti-Cut Engine v1.0 — 5-layer architecture for cut detection, quality lock, ISP strangulation, JSON commands, and progressive degradation
---

# APE Anti-Cut Engine v1.0

## 5-Layer Architecture

| Layer | Code | Name | Function |
|-------|------|------|----------|
| 1 | CDP | Cut Detection Protocol | Buffer underrun, packet loss, RTT, segment gap monitoring |
| 2 | ACRP | Anti-Cut Response Protocol | Quality lock for 900s, blocks all downswitch |
| 3 | ISSP | ISP Strangulation Protocol | TCP parallel (4-8 conn), prefetch 500, DSCP 63, BBR |
| 4 | JCS | JSON Command System | 5 JSON payloads embedded as M3U comments |
| 5 | PDS | Progressive Degradation Shield | P1-NUCLEAR → P5-MINIMAL profile ladder |

## Files

| File | Location | Size |
|------|----------|------|
| `rq_anti_cut_engine.php` | VPS: `/var/www/html/iptv-ape/` | 31KB |
| `rq_anti_cut_engine.php` | Local: `backend/` | 31KB |

## Key Functions

| Function | Purpose |
|----------|---------|
| `rq_get_anti_cut_profile($profile)` | Returns full config for P1-P5 |
| `rq_anti_cut_isp_strangler($profile, $ch_id, $origin, $session)` | Generates all directives |
| `rq_generate_anti_cut_block($profile, $ch_id, $origin, $session)` | Produces M3U lines |

## Profile Specs

| Param | P1-NUCLEAR | P2-AGGRESSIVE | P3-STANDARD | P4-BASIC | P5-MINIMAL |
|-------|-----------|--------------|-------------|----------|------------|
| Max Bitrate | 300M | 150M | 80M | 40M | 20M |
| Min Bitrate | 80M | 25M | 8M | 4M | 2M |
| HEVC | MAIN-10-HDR | MAIN-10-HDR | MAIN-10 | MAIN-10 | MAIN |
| Color Space | BT2020 | BT2020 | BT2020 | BT709 | BT709 |
| DSCP | 63 | 56 | 46 | 34 | 26 |
| Prefetch | 500 | 300 | 200 | 100 | 50 |
| Buffer Max | 300s | 180s | 120s | 90s | 60s |
| Cooldown | 900s | 900s | 900s | 600s | 300s |
| Quality Lock | NATIVA_MAXIMA | NATIVA_MAXIMA | NATIVA_MAXIMA | HIGH | STANDARD |
| Aggression | 10x | 8x | 6x | 4x | 2x |
| Parallel | 4,6,8 | 4,6,8 | 4,6 | 4 | 2 |

## Cooldown State Machine

```
IDLE → CUT_DETECTED → RECONNECTING → COOLDOWN (900s) → STABLE_15MIN → IDLE
              ↑                                              |
              └──────────────── (any new cut) ──────────────┘
```

During COOLDOWN: **impossible to downgrade quality** (absolute lock)

## JSON Commands Embedded (5 per channel)
1. Anti-Cut State Machine config
2. Quality Lock Matrix per state
3. ISP Strangulation config
4. Recovery Protocol (4 steps)
5. Channel Profile Summary

## Origins that support Flussonic-specific headers
- `line.tivi-ott.net` → X-Bypass-ABR, X-Quality-Lock WORK
- `nov202gg.xyz` → X-Bypass-ABR, X-Quality-Lock WORK
- `ky-tv.cc` → X-Bypass-ABR, X-Quality-Lock WORK

## NEVER
- Never use X-Bypass-ABR with non-Flussonic origins
- Never set cooldown < 300s — too short for recovery
- Never set X-Min-Bitrate > provider's max — will cause no variant selection
