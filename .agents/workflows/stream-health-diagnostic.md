---
description: How to diagnose and fix IPTV stream cuts, buffering, and quality issues
---

# Stream Cut Diagnostic Workflow

## 1. Check the live health log on VPS
// turbo
```bash
ssh root@178.156.147.234 "tail -50 /var/log/iptv-stream-health.log"
```
Look for: `ALERT`, `UNREACHABLE`, `RESETS > 0`, `TIMEOUTS > 0`, `DUPES > 0`, `MEM > 90%`

## 2. Check for EXTVLCOPT duplicates (must be ZERO)
// turbo
```bash
ssh root@178.156.147.234 "curl -sk 'https://localhost/resolve_quality.php?ch=1198&p=P2&sid=1198&srv=bGluZS50aXZpLW90dC5uZXR8M0pIRlRDfFU1NkJEUA==&bw_kbps=100000' 2>/dev/null | tr ',' '\n' | grep '#EXTVLCOPT' | sed 's/=.*//' | sort | uniq -c | sort -rn | head -5"
```
ALL counts must be `1`. If any > 1, duplicates exist → fix in resolve_quality.php + resolve.php

## 3. Test upstream origin server connectivity
// turbo
```bash
ssh root@178.156.147.234 "for O in line.tivi-ott.net line.dndnscloud.ru; do echo \"Testing $O...\"; curl -sL -o /dev/null -w 'HTTP %{http_code} Speed %{speed_download} Time %{time_total}\n' \"http://$O/live/3JHFTC/U56BDP/1198.m3u8\" -H 'User-Agent: Mozilla/5.0 (Linux; Android 11; AFTKM)' --connect-timeout 5 --max-time 15; done"
```
If HTTP 000 or timeout → upstream provider issue, not our code

## 4. Check Nginx connection resets (indicates upstream drops)
// turbo
```bash
ssh root@178.156.147.234 "grep -c 'reset by peer' /var/log/nginx/error.log; echo '---RECENT---'; tail -5 /var/log/nginx/error.log"
```

## 5. Check PHP-FPM memory/process limits
// turbo
```bash
ssh root@178.156.147.234 "grep -E 'pm\.|memory' /etc/php/8.3/fpm/pool.d/www.conf | grep -v '^;'; echo '---STATUS---'; systemctl status php8.3-fpm | head -5"
```

## 6. TRIPLE FILE SYNC (resolve.php + resolve_quality.php + ai_engine)
After any fix, ALWAYS deploy all 3 files:
```bash
scp backend/resolve_quality.php root@178.156.147.234:/var/www/html/resolve_quality.php
scp backend/resolve.php root@178.156.147.234:/var/www/html/resolve.php
scp backend/cmaf_engine/modules/ai_super_resolution_engine.php root@178.156.147.234:/var/www/html/cmaf_engine/modules/ai_super_resolution_engine.php
```

## 7. Verify syntax after deploy
// turbo
```bash
ssh root@178.156.147.234 "php -l /var/www/html/resolve_quality.php; php -l /var/www/html/resolve.php; php -l /var/www/html/cmaf_engine/modules/ai_super_resolution_engine.php"
```

## Root Causes of Stream Cuts (ordered by likelihood)
1. **Upstream provider drops** → Connection reset by peer (NOT our code)
2. **EXTVLCOPT duplicates** → VLC uses last value, causes unpredictable buffer → FIXED with dedup
3. **ISP throttling** → Use VPN or X-Network-Priority headers
4. **Buffer too aggressive** → Too much pre-buffer causes initial lag then cuts during catch-up
5. **PHP-FPM memory exhaustion** → Increase pm.max_children or memory_limit
