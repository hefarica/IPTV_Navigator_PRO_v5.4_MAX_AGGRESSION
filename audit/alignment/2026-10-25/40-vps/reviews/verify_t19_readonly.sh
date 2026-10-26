#!/usr/bin/env bash
# t28 — Verificación READ-ONLY de T19 (timeout VPS gated). Cero mutaciones.
# Sólo lectura: stat/sha256sum/grep/nginx -T/nginx -t/systemctl show/curl GET/diff.
set -o pipefail

echo "=== A. CONFIG OBJETIVO ==="
stat -c '%n|%s|%a|%U:%G|%y' /etc/nginx/conf.d/50-ape-meta-plane.conf
sha256sum /etc/nginx/conf.d/50-ape-meta-plane.conf

echo
echo "=== B. DUMP VIVO: proxy_read_timeout (nginx -T) ==="
nginx -T 2>/dev/null | grep -n 'proxy_read_timeout'
echo "-- conteo de 5s restantes:"
nginx -T 2>/dev/null | grep -c 'proxy_read_timeout[[:space:]]*5s' || true

echo
echo "=== C. nginx -t (validación, no escribe config) ==="
nginx -t 2>&1
echo "nginx_t_exit=$?"

echo
echo "=== D. SERVICIO nginx (reload vs restart) ==="
systemctl show nginx -p MainPID -p NRestarts -p ActiveState -p SubState -p ActiveEnterTimestamp
echo "-- /run/nginx.pid:"; cat /run/nginx.pid 2>/dev/null
echo "-- proceso master:"
MPID=$(systemctl show nginx -p MainPID --value)
ps -o pid,lstart,etimes,cmd -p "$MPID" 2>/dev/null

echo
echo "=== E. HEALTH :8088 ==="
curl -s -o /dev/null -w 'http_code=%{http_code}\n' -m 5 http://127.0.0.1:8088/_ape/health
curl -s -m 5 http://127.0.0.1:8088/_ape/health | head -c 500
echo

echo
echo "=== F. SNAPSHOT .bak (fuera de /etc/nginx) ==="
stat -c '%n|%s|%a|%y' /root/nginx-bak 2>/dev/null
stat -c '%n|%s|%a|%y' /root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z 2>/dev/null
sha256sum /root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z 2>/dev/null
case "/root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z" in /etc/nginx/*) echo "FUERA_DE_ETC=FAIL";; *) echo "FUERA_DE_ETC=OK";; esac

echo
echo "=== G. DUMPS PREVIOS ==="
ls -l /root/nginx-before-*.conf /root/nginx-after-*.conf 2>/dev/null
sha256sum /root/nginx-before-20261026T043331Z.conf /root/nginx-after-20261026T043331Z.conf 2>/dev/null

echo
echo "=== H. DIFF dump previo vs dump vivo (hunks) ==="
nginx -T 2>/dev/null | diff -u /root/nginx-before-20261026T043331Z.conf - > /dev/null 2>&1
echo "diff_exit=$?"
echo "-- número de hunks:"
nginx -T 2>/dev/null | diff -u /root/nginx-before-20261026T043331Z.conf - 2>/dev/null | grep -c '^@@' || true
echo "-- líneas cambiadas (sólo +/-):"
nginx -T 2>/dev/null | diff -u /root/nginx-before-20261026T043331Z.conf - 2>/dev/null | grep -E '^[+-][^+-]' | head -20

echo
echo "=== I. ARCHIVOS PROHIBIDOS (hashes) ==="
sha256sum /etc/nginx/conf.d/iptv-limit-conn.conf /etc/nginx/nginx.conf /etc/nginx/snippets/ape-meta-public.conf /etc/cron.d/cache-health-monitor /etc/nginx/lua/ape_uhd.lua /var/www/lists/APE_LISTA_1792869328847.m3u8.gz 2>&1

echo
echo "=== J. TIMERS netshield ==="
systemctl list-timers --all --no-pager 2>/dev/null | grep -i netshield || echo "(ninguno)"

echo
echo "=== K. CRON.D ==="
ls -l /etc/cron.d/ 2>/dev/null | head -10

echo
echo "=== L. LISTA SERVIDA (stat) ==="
stat -c '%n|%s|%y' /var/www/lists/APE_LISTA_1792869328847.m3u8.gz 2>/dev/null

echo
echo "=== M. FIN (solo lectura) ==="
