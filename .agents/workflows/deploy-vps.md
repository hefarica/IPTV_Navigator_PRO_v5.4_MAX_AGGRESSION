---
description: How to safely deploy PHP files to the IPTV APE VPS (iptv-ape.duckdns.org)
---
// turbo-all

# VPS Deployment Workflow

## Pre-Deploy Checklist
1. **PHP Syntax Check** locally before uploading:
```powershell
# Windows: validate PHP syntax (if PHP is available)
php -l "IPTV_v5.4_MAX_AGGRESSION\backend\resolve_quality.php"
```

2. **URL Parity Check** — verify that ALL frontend URL paths match VPS endpoints:
```powershell
# Extract all resolver paths from frontend JS
Select-String -Path "IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js" -Pattern "resolveScript|resolve_quality|/api/" | ForEach-Object { $_.Line.Trim() }
```
Verify each path has a corresponding rewrite in `/etc/nginx/snippets/api-rewrite.conf` or a direct PHP file.

3. **ctx= Size Check** — ensure ctx payload stays compact:
```powershell
# Count fields in ctxPayload
Select-String -Path "IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js" -Pattern "ctxPayload" -Context 0,20 | Select-Object -First 1
```
MAX 12 flat fields. NO nested objects.

## Deploy
4. **Upload PHP to VPS** (SCP):
```powershell
scp "IPTV_v5.4_MAX_AGGRESSION\backend\resolve_quality.php" root@178.156.147.234:/var/www/html/resolve_quality.php
```

5. **Backup Nginx SAFELY** (NEVER in sites-enabled):
```bash
ssh root@178.156.147.234 "cp /etc/nginx/snippets/api-rewrite.conf /tmp/api-rewrite.conf.bak"
```

6. **Verify Nginx state** (if config changed):
```bash
ssh root@178.156.147.234 "nginx -t 2>&1 | tail -2 && systemctl reload nginx && echo OK"
```

## Post-Deploy Verification (MANDATORY)
7. **PHP syntax on VPS**:
```bash
ssh root@178.156.147.234 "php -l /var/www/html/resolve_quality.php"
```

8. **End-to-End resolve test**:
```bash
ssh root@178.156.147.234 "curl -sL 'https://iptv-ape.duckdns.org/api/resolve_quality?ch=1&p=P3&srv=dGVzdC5ob3N0OjgwfHVzZXJ8cGFzcw==' 2>/dev/null | head -3"
```
**Expected**: `#EXTM3U` on first line. If you see 404, HTML, or raw PHP → STOP and fix.

9. **Health endpoint**:
```bash
ssh root@178.156.147.234 "curl -sL 'https://iptv-ape.duckdns.org/api/health'"
```
**Expected**: `{"status":"ok"}`

10. **Check for .bak pollution**:
```bash
ssh root@178.156.147.234 "ls /etc/nginx/sites-enabled/*.bak 2>/dev/null && echo 'DANGER: .bak files found!' || echo 'CLEAN'"
```
**Expected**: `CLEAN`

## Rollback
If anything fails:
```bash
# Restore PHP
ssh root@178.156.147.234 "cp /tmp/resolve_quality.php.bak /var/www/html/resolve_quality.php"
# Restore Nginx snippet
ssh root@178.156.147.234 "cp /tmp/api-rewrite.conf.bak /etc/nginx/snippets/api-rewrite.conf && nginx -t && systemctl reload nginx"
```
