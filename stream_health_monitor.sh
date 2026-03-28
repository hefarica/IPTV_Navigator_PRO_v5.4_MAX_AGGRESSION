#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# STREAM HEALTH MONITOR v1.0 — Runs every minute via cron
# Logs: /var/log/iptv-stream-health.log
# ═══════════════════════════════════════════════════════════════

LOG=/var/log/iptv-stream-health.log
TS=$(date '+%Y-%m-%d %H:%M:%S')
UA='Mozilla/5.0 (Linux; Android 11; AFTKM) AppleWebKit/537.36'

echo "[$TS] === HEALTH CHECK ===" >> $LOG

# 1. Test origin servers
for O in line.tivi-ott.net line.dndnscloud.ru; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://$O" -H "User-Agent: $UA" --connect-timeout 3 --max-time 5 2>/dev/null)
    LAT=$(curl -s -o /dev/null -w '%{time_total}' "http://$O" -H "User-Agent: $UA" --connect-timeout 3 --max-time 5 2>/dev/null)
    echo "[$TS] ORIGIN=$O HTTP=$CODE LAT=${LAT}s" >> $LOG
    [ "$CODE" = "000" ] && echo "[$TS] ALERT: $O UNREACHABLE" >> $LOG
done

# 2. Test sample stream
SC=$(curl -sL -o /dev/null -w '%{http_code}' 'http://line.tivi-ott.net/live/3JHFTC/U56BDP/1198.m3u8' -H "User-Agent: $UA" --connect-timeout 5 --max-time 10 2>/dev/null)
echo "[$TS] STREAM ch=1198 HTTP=$SC" >> $LOG

# 3. PHP-FPM + Nginx health
echo "[$TS] PHP-FPM=$(systemctl is-active php8.3-fpm) NGINX=$(systemctl is-active nginx)" >> $LOG

# 4. Connection resets (last minute in nginx error log)
RESETS=$(find /var/log/nginx/error.log -newermt '1 minute ago' -exec grep -c 'reset by peer' {} \; 2>/dev/null)
TIMEOUTS=$(find /var/log/nginx/error.log -newermt '1 minute ago' -exec grep -c 'timed out' {} \; 2>/dev/null)
echo "[$TS] RESETS_1M=${RESETS:-0} TIMEOUTS_1M=${TIMEOUTS:-0}" >> $LOG

# 5. System resources
MEM=$(free -m | awk '/Mem:/{printf "%.0f", $3/$2*100}')
LOAD=$(cat /proc/loadavg | awk '{print $1,$2,$3}')
echo "[$TS] MEM=${MEM}% LOAD=$LOAD" >> $LOG

# 6. Resolver speed + dedup check
RES_MS=$(curl -sk -o /dev/null -w '%{time_total}' 'https://localhost/resolve_quality.php?ch=1198&p=P2&sid=1198&srv=bGluZS50aXZpLW90dC5uZXR8M0pIRlRDfFU1NkJEUA==&bw_kbps=100000' 2>/dev/null)
VLCN=$(curl -sk 'https://localhost/resolve_quality.php?ch=1198&p=P2&sid=1198&srv=bGluZS50aXZpLW90dC5uZXR8M0pIRlRDfFU1NkJEUA==&bw_kbps=100000' 2>/dev/null | tr ',' '\n' | grep -c '#EXTVLCOPT')
DUPS=$(curl -sk 'https://localhost/resolve_quality.php?ch=1198&p=P2&sid=1198&srv=bGluZS50aXZpLW90dC5uZXR8M0pIRlRDfFU1NkJEUA==&bw_kbps=100000' 2>/dev/null | tr ',' '\n' | grep '#EXTVLCOPT' | sed 's/=.*//' | sort | uniq -d | wc -l)
echo "[$TS] RESOLVER=${RES_MS}s VLCOPT=$VLCN DUPES=$DUPS" >> $LOG

# 7. Rotate (keep 10k lines)
tail -10000 $LOG > ${LOG}.tmp && mv ${LOG}.tmp $LOG 2>/dev/null
