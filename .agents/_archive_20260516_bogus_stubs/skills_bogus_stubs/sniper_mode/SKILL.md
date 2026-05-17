---
description: APE Sniper Mode v1.0 — Active channel detection and resource allocation for maximum quality on the channel being watched
---

# APE Sniper Mode v1.0

## Concept
Of all channels the resolver serves, **ONLY ONE** is being watched at any given time. Sniper Mode detects which one and assigns **100% of resources** (P1-NUCLEAR profile, prefetch x2, buffer x1.5, parallel x2) to it.

## Architecture

```
Player requests ch_id → rq_sniper_classify() →
  STREAMING (< 10s since last request) → P1-NUCLEAR
  RECENT   (< 45s) → P2-AGGRESSIVE (standby)
  IDLE     (> 45s) → Original tier profile
```

## Files

| File | Location | Purpose |
|------|----------|---------|
| `rq_sniper_mode.php` | VPS: `/var/www/html/iptv-ape/` | PHP module (22KB) |
| `rq_sniper_mode.php` | Local: `backend/` | Local copy |

## State Management
- Uses `/tmp/ape_sniper/ch_{id}.state` files (filemtime-based, no DB needed)
- `LOCK_EX` for atomic writes (no race conditions)
- Cleanup runs probabilistically (5% of requests)
- Max 3 simultaneous STREAMING channels (multi-room)

## Key Functions

| Function | Purpose |
|----------|---------|
| `rq_sniper_classify($ch_id, $ip)` | Classify channel: STREAMING/RECENT/IDLE |
| `rq_sniper_integrate($ch_id, $profile, $origin, $session)` | Main wrapper — returns effective profile |
| `rq_sniper_scale_directives($exthttp, $sniper)` | Scale EXTHTTP for active channels |
| `rq_sniper_scale_vlcopt($extvlcopt, $sniper)` | Scale EXTVLCOPT for active channels |
| `rq_sniper_recovery_playlist($url, $ch_id, $session, $attempt)` | Recovery M3U8 on origin failure |
| `rq_sniper_json_command($ch_id, $sniper, $session)` | JSON command for M3U |
| `rq_sniper_http_headers($ch_id, $sniper, $uuid)` | HTTP response headers |

## Multipliers per State

| State | Profile | Prefetch | Buffer | Parallel |
|-------|---------|----------|--------|----------|
| STREAMING | P1-NUCLEAR | x2.0 | x1.5 | x2 |
| RECENT | P2-AGGRESSIVE | x1.5 | x1.2 | x1 |
| IDLE | Tier original | x1.0 | x1.0 | x1 |

## Configuration Constants

```php
APE_SNIPER_STATE_DIR       = '/tmp/ape_sniper'
APE_SNIPER_STREAMING_WINDOW = 10   // seconds
APE_SNIPER_RECENT_WINDOW    = 45   // seconds
APE_SNIPER_STALE_TTL        = 300  // seconds
APE_SNIPER_MAX_ACTIVE_CHANNELS = 3
```

## NEVER
- Never disable Sniper on production — it's the primary quality optimization
- Never set `MAX_ACTIVE_CHANNELS` > 5 — too many STREAMING channels dilute resources
- Never remove the `/tmp/ape_sniper/` directory while resolving — it will be recreated but breaks state
