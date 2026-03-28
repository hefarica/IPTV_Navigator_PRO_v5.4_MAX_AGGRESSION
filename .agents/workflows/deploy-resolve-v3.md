---
description: How to deploy the APE Resolve Quality v3.0 resolver with Sniper Mode, Anti-Cut Engine, and Elite Enrichment to the IPTV VPS
---
// turbo-all

# Deploy APE Resolve Quality v3.0

## Prerequisites
- SSH access to VPS: `root@178.156.147.234`
- Local files in: `IPTV_v5.4_MAX_AGGRESSION\backend\`
- PHP 8.3-fpm running on VPS

## Step 1: Upload Core Resolver
```bash
scp "IPTV_v5.4_MAX_AGGRESSION\backend\resolve_quality.php" root@178.156.147.234:/var/www/html/iptv-ape/resolve_quality.php
```

## Step 2: Upload Sniper Mode Module
```bash
scp "IPTV_v5.4_MAX_AGGRESSION\backend\rq_sniper_mode.php" root@178.156.147.234:/var/www/html/iptv-ape/rq_sniper_mode.php
```

## Step 3: Upload Anti-Cut Engine Module
```bash
scp "IPTV_v5.4_MAX_AGGRESSION\backend\rq_anti_cut_engine.php" root@178.156.147.234:/var/www/html/iptv-ape/rq_anti_cut_engine.php
```

## Step 4: Set Permissions and Create State Directory
```bash
ssh root@178.156.147.234 "chmod 644 /var/www/html/iptv-ape/resolve_quality.php /var/www/html/iptv-ape/rq_sniper_mode.php /var/www/html/iptv-ape/rq_anti_cut_engine.php && chown -R www-data:www-data /var/www/html/iptv-ape/ && mkdir -p /tmp/ape_sniper && chmod 777 /tmp/ape_sniper"
```

## Step 5: PHP Syntax Check (ALL 3 files)
```bash
ssh root@178.156.147.234 "php -l /var/www/html/iptv-ape/resolve_quality.php && php -l /var/www/html/iptv-ape/rq_sniper_mode.php && php -l /var/www/html/iptv-ape/rq_anti_cut_engine.php"
```
Expected: `No syntax errors detected` for all 3.

## Step 6: Restart PHP-FPM
```bash
ssh root@178.156.147.234 "systemctl restart php8.3-fpm"
```

## Step 7: Verify Live Output
```bash
ssh root@178.156.147.234 "curl -sk 'https://localhost/iptv-ape/resolve_quality.php?ch=12&srv=bGluZS50aXZpLW90dC5uZXR8M0pIRlRDfFU1NkJEUA==' -H 'User-Agent: OTT Navigator/1.6.7.3' | wc -l"
```
Expected: 100+ lines (was 62 before Anti-Cut, ~113 with full deployment)

## Step 8: Verify Sniper Mode
```bash
ssh root@178.156.147.234 "ls -la /tmp/ape_sniper/"
```
Expected: `ch_12.state` file created

## Step 9: Verify HTTP Response Headers
```bash
ssh root@178.156.147.234 "curl -sk -D- -o /dev/null 'https://localhost/iptv-ape/resolve_quality.php?ch=12&srv=bGluZS50aXZpLW90dC5uZXR8M0pIRlRDfFU1NkJEUA==' -H 'User-Agent: OTT Navigator/1.6.7.3' | grep 'X-APE'"
```
Expected headers:
- `X-APE-Cut-Status: monitoring`
- `X-APE-Engine: APE-ANTI-CUT-v1.0`
- `X-APE-Profile: P1-NUCLEAR`
- `X-APE-SNIPER-Mode: ACTIVE`
- `X-APE-SNIPER-Status: STREAMING`

## Rollback
```bash
ssh root@178.156.147.234 "cp /var/www/html/iptv-ape/resolve_quality.php.bak_integrated /var/www/html/iptv-ape/resolve_quality.php && systemctl restart php8.3-fpm"
```
