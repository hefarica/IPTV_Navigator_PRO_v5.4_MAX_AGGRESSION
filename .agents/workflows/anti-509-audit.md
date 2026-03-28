---
description: Audit the VPS for any process, cron, or code that could consume IPTV provider connections and cause 509 errors
---

# Anti-509 Audit Workflow

Run this audit BEFORE any deployment and whenever a 509 error is reported.

## 1. Check crontab for provider-hitting jobs
// turbo
```bash
ssh root@178.156.147.234 "crontab -l 2>/dev/null"
```
If ANY entry references provider domains (tivi-ott, dndnscloud, candycloud, nov202gg, or any `/live/` URL), **remove it immediately** with `crontab -e` or `echo '' | crontab -`.

## 2. Scan PHP files for origin-consuming HTTP calls
// turbo
```bash
ssh root@178.156.147.234 "grep -rn 'curl_init\|curl_exec\|file_get_contents.*http\|get_headers\|fsockopen' /var/www/html/*.php 2>/dev/null | grep -v '.bak'"
```
Any match that hits a provider URL (not a local file) is **509-CRITICAL**. Disable with `if(false)` or delete.

## 3. Check for active connections to IPTV providers
// turbo
```bash
ssh root@178.156.147.234 "ss -tpn state established | grep -v '127.0.0\|::1'"
```
Cross-reference peer IPs with known provider IPs (`91.208.115.26` = line.tivi-ott.net). Any match = active consumption.

## 4. Check running processes for stream consumers
// turbo
```bash
ssh root@178.156.147.234 "ps -eo pid,user,args | grep -iE 'ffmpeg|curl|wget|stream|monitor|worker|proxy' | grep -v grep | grep -v kworker"
```
Kill any process consuming a provider stream: `kill -9 <PID>`.

## 5. Check Docker containers
// turbo
```bash
ssh root@178.156.147.234 "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null"
```
For each container, run `docker exec <name> ss -tpn` to check internal connections.

## 6. Check systemd timers
// turbo
```bash
ssh root@178.156.147.234 "systemctl list-timers --all 2>/dev/null | grep -v snap"
```
No timer should reference IPTV providers.

## 7. Verify resolve_quality.php is blind
// turbo
```bash
ssh root@178.156.147.234 "grep -c 'curl_init' /var/www/html/resolve_quality.php && grep -n 'checkStreamHealth' /var/www/html/resolve_quality.php"
```
Expected: `0` curl_init matches. `checkStreamHealth` must show `if (false)`.

## 8. Verify Nginx rewrite is active
// turbo
```bash
ssh root@178.156.147.234 "grep -A2 'resolve_quality' /etc/nginx/sites-available/default"
```
Must show `rewrite ^/api/resolve_quality(.*)$ /resolve_quality.php$1 last;`

## 9. Test endpoint returns clean M3U8
// turbo
```bash
ssh root@178.156.147.234 "curl -s -o /dev/null -w '%{http_code}' 'https://iptv-ape.duckdns.org/api/resolve_quality?ch=test&p=P3' -k"
```
Must return `200`.

## 10. Final verdict
If ALL checks pass: **SYSTEM CLEAN — BLIND RESOLUTION ACTIVE**  
If ANY check fails: **FIX IMMEDIATELY before deploying or reproducing**
