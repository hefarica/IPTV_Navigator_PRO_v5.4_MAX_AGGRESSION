---
description: How to deploy the APE Resolve Quality v3.0 resolver with Sniper Mode, Anti-Cut Engine, and Elite Enrichment to the IPTV VPS
---
// turbo-all

# Deploy Resolve v3.0 Workflow

> Before starting, read the Skill: `.agent/skills/resolve-architecture/SKILL.md`

## Pre-Deploy Safety Gates

### Gate 1: Module Guard Audit
Verify ALL `require_once` statements have `file_exists()` guards:
```powershell
Select-String -Path "IPTV_v5.4_MAX_AGGRESSION\backend\resolve_quality.php" -Pattern "require_once" -SimpleMatch | ForEach-Object { $_.LineNumber.ToString() + ': ' + $_.Line.Trim() }
```
**Every** `require_once __DIR__` line MUST be inside an `if (file_exists(...))` block.
If ANY bare `require_once` is found → **FIX BEFORE DEPLOYING**.

### Gate 2: External Function Guard Audit
Check that all calls to functions from optional modules have `function_exists()` guards:
```powershell
Select-String -Path "IPTV_v5.4_MAX_AGGRESSION\backend\resolve_quality.php" -Pattern "rq_sniper_integrate|rq_anti_cut_isp_strangler|ApeCredentials" -SimpleMatch | ForEach-Object { $_.LineNumber.ToString() + ': ' + $_.Line.Trim() }
```
Each call MUST be wrapped in `function_exists('name')` or `class_exists('Name')`.

### Gate 3: Anti-509 (MANDATORY — BLOCKS DEPLOY IF FAILED)
```powershell
Select-String -Path "IPTV_v5.4_MAX_AGGRESSION\backend\resolve_quality.php" -Pattern "curl_init|curl_exec|file_get_contents.*http|get_headers|fsockopen" -SimpleMatch
```
**Expected**: NO matches that hit a provider URL. If ANY match → **DO NOT DEPLOY**.

### Gate 4: Null-Safety on $anti_cut and $sniper
```powershell
Select-String -Path "IPTV_v5.4_MAX_AGGRESSION\backend\resolve_quality.php" -Pattern "anti_cut\['" -SimpleMatch | ForEach-Object { $_.LineNumber.ToString() + ': ' + $_.Line.Trim() }
```
Every `$anti_cut['key']` MUST use `?? default`. Every `$sniper['sniper']['key']` MUST use `!empty()` guard.

## Deploy

### Step 1: Backup current resolver
```bash
ssh root@178.156.147.234 "cp /var/www/html/resolve_quality.php /tmp/resolve_quality.php.bak && echo 'BACKUP OK'"
```

### Step 2: Upload
```powershell
scp "IPTV_v5.4_MAX_AGGRESSION\backend\resolve_quality.php" root@178.156.147.234:/var/www/html/resolve_quality.php
```

### Step 3: PHP Syntax Check
```bash
ssh root@178.156.147.234 "php -l /var/www/html/resolve_quality.php"
```
**Expected**: `No syntax errors detected`

### Step 4: Restart PHP-FPM (if previous errors crashed workers)
```bash
ssh root@178.156.147.234 "systemctl restart php8.3-fpm && sleep 2 && systemctl status php8.3-fpm --no-pager | head -5"
```

## Post-Deploy Verification

### Step 5: Health Check
```bash
ssh root@178.156.147.234 "curl -s 'https://iptv-ape.duckdns.org/api/health'"
```
**Expected**: `{"status":"ok"}`

### Step 6: End-to-End Resolve Test
```bash
ssh root@178.156.147.234 "curl -sI 'https://iptv-ape.duckdns.org/api/resolve_quality?ch=1&p=P3&srv=dGVzdC5ob3N0OjgwfHVzZXJ8cGFzcw==' 2>/dev/null | grep -E 'HTTP|X-RQ|X-Resolver'"
```
**Expected**:
- `HTTP/1.1 200 OK`
- `X-Resolver-Version: 3.0.0-AUTONOMOUS`
- `X-RQ-QoS-Profile: P3`

### Step 7: Body Check (mini-M3U8 output)
```bash
ssh root@178.156.147.234 "curl -s 'https://iptv-ape.duckdns.org/api/resolve_quality?ch=1&p=P3&srv=dGVzdC5ob3N0OjgwfHVzZXJ8cGFzcw==' 2>/dev/null | head -5"
```
**Expected**: First line = `#EXTM3U`

### Step 8: Error Log Clean Check
```bash
ssh root@178.156.147.234 "tail -5 /var/log/php8.3-fpm.log 2>/dev/null | grep -c 'Fatal\|thrown in' || echo '0 errors'"
```
**Expected**: `0 errors`

### Step 9: .bak Pollution Check
```bash
ssh root@178.156.147.234 "ls /etc/nginx/sites-enabled/*.bak 2>/dev/null && echo 'DANGER' || echo 'CLEAN'"
```
**Expected**: `CLEAN`

## Rollback
```bash
ssh root@178.156.147.234 "cp /tmp/resolve_quality.php.bak /var/www/html/resolve_quality.php && systemctl restart php8.3-fpm && echo 'ROLLBACK OK'"
```
