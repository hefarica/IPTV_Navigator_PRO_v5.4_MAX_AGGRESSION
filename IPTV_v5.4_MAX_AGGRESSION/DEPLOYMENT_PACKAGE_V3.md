# APE Resolve Quality v3.0 — Deployment Package

## Overview
Complete deployment map of the APE Resolve Quality v3.0 system with Sniper Mode, Anti-Cut Engine, and Elite Enrichment.

---

## LOCAL FILES (Git Repository)

### Backend Modules (`IPTV_v5.4_MAX_AGGRESSION/backend/`)

| File | Size | Purpose |
|------|------|---------|
| `resolve_quality.php` | 145KB | Core resolver with integrated enrichment function |
| `rq_sniper_mode.php` | 22KB | Sniper Mode: active channel detection |
| `rq_anti_cut_engine.php` | 31KB | Anti-Cut Engine: 5-layer architecture |

### Frontend (`IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/`)

| File | Change Made |
|------|-------------|
| `headers-matrix-v9.js` | `X-Screen-Resolution` → `3840x2160` (was 1920x1080) |

### Skills (`IPTV_v5.4_MAX_AGGRESSION/skills_extracted/`)

| Skill | Purpose |
|-------|---------|
| `self_audit_first/SKILL.md` | Audit OUR code before blaming external systems |
| `sniper_mode/SKILL.md` | Sniper Mode documentation and rules |
| `anti_cut_engine/SKILL.md` | Anti-Cut Engine 5-layer architecture |
| `elite_enrichment/SKILL.md` | 14 ULTIMATE headers for max bitrate |

### Workflows (`.agents/workflows/`)

| Workflow | Purpose |
|----------|---------|
| `deploy-resolve-v3.md` | Step-by-step VPS deployment for v3.0 |

---

## VPS FILES (178.156.147.234)

### Deployed to `/var/www/html/iptv-ape/`

| File | Size | Owner | Perms |
|------|------|-------|-------|
| `resolve_quality.php` | 145KB | www-data | 644 |
| `rq_sniper_mode.php` | 22KB | www-data | 644 |
| `rq_anti_cut_engine.php` | 31KB | www-data | 644 |

### Runtime State Directory

| Path | Purpose | Perms |
|------|---------|-------|
| `/tmp/ape_sniper/` | Sniper state files (`ch_{id}.state`) | 777 |

### Backups on VPS

| Backup | When Created |
|--------|-------------|
| `resolve_quality.php.bak_elite` | Before Elite Enrichment |
| `resolve_quality.php.bak_integrated` | Before Sniper+Anti-Cut integration |

---

## VPS CONTAINER/SERVER REQUIREMENTS

### PHP Runtime
- **PHP 8.3-fpm** (required for `str_starts_with()`, named arguments)
- Modules: `json`, `openssl` (for `random_bytes`)
- Service: `systemctl restart php8.3-fpm` after deployment

### Nginx Configuration
- Reverse proxy to PHP-FPM for `/iptv-ape/` path
- SSL enabled (HTTPS required for Shield TV Pro UA to work with CDNs)
- `X-Accel-Buffering: no` for streaming responses

### Filesystem
- `/tmp/ape_sniper/` writable by www-data (Sniper state)
- `/var/www/html/iptv-ape/logs/` writable by www-data (pipeline trace)

### Network
- Port 443 open (HTTPS)
- TCP BBR congestion control enabled: `net.ipv4.tcp_congestion_control=bbr`
- DNS: `iptv-ape.duckdns.org` → 178.156.147.234

### Dependencies
- **ZERO** external dependencies (no Redis, no Memcached, no DB)
- **ZERO** cron jobs required
- **ZERO** background daemons

---

## SYSTEM ARCHITECTURE

```
Player (OTT Navigator / VLC / TiviMate / Kodi)
  │
  ├─→ Request: resolve_quality.php?ch=X&srv=TOKEN
  │
  ├─→ Nginx (178.156.147.234:443)
  │     └─→ PHP-FPM 8.3
  │           ├─→ resolve_quality.php (main resolver)
  │           │     ├─→ require rq_sniper_mode.php
  │           │     │     └─→ /tmp/ape_sniper/ch_X.state (filemtime check)
  │           │     ├─→ require rq_anti_cut_engine.php
  │           │     │     └─→ rq_get_anti_cut_profile(P1) → all directives
  │           │     └─→ rq_enrich_channel_output()
  │           │           ├─→ Sniper: detect STREAMING/RECENT/IDLE
  │           │           ├─→ Anti-Cut: generate 5-layer directives
  │           │           ├─→ Elite: Shield UA, MAIN-10-HDR, BT2020
  │           │           └─→ Output: 113 lines, ~10KB M3U per channel
  │           │
  │           └─→ HTTP Response Headers (ACRP + CORS + Anti-Cache)
  │
  └─→ Response: Enriched M3U with EXTHTTP + EXTVLCOPT + JSON + HLS EXT-X
        └─→ Player negotiates with CDN (Flussonic) using our headers
              └─→ CDN serves highest available variant (4K HDR if available)
```

---

## WHAT EACH SYSTEM DOES

### Elite Enrichment (always active)
- Forces 300Mbps max bitrate, 80Mbps minimum floor
- Shield TV Pro UA → CDN premium device profiling
- MAIN-10-HDR + BT2020 → forces HDR variant selection
- X-Bypass-ABR + X-Quality-Lock → Flussonic serves max quality

### Sniper Mode (active channel detection)
- Detects which channel is being watched RIGHT NOW
- Assigns P1-NUCLEAR to streaming channel (prefetch x2, buffer x1.5)
- Demotes idle channels to standard profile
- Supports up to 3 simultaneous streaming channels

### Anti-Cut Engine (5-layer protection)
- **CDP**: Monitors buffer, packet loss, RTT, segment gaps
- **ACRP**: Locks quality for 900s after any cut (no downswitch)
- **ISSP**: TCP parallel downloads, prefetch 500 segments, DSCP 63
- **JCS**: 5 JSON command payloads for custom player control
- **PDS**: Progressive degradation P1→P5 based on channel tier
