#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# t89 · INVENTARIO READ-ONLY DEL VPS
# ----------------------------------------------------------------------------
# NO ESCRIBE NADA EN EL VPS. Solo lee y emite por stdout.
# Se ejecuta por stdin (`ssh <host> 'bash -s' < inventory.sh`) para no dejar ni
# un fichero temporal en el servidor. La captura se guarda en el repo.
#
# Uso local:
#   ssh root@178.156.147.234 'bash -s' < _vps_stage/deploy/inventory.sh \
#     > _vps_stage/deploy/snapshots/inventory_$(date +%Y%m%dT%H%M%S).txt
#
# Reglas:
#   · Cero mutaciones: ni >, ni tee, ni mkdir, ni systemctl restart, ni nginx -s.
#   · Sin credenciales: no se leen ni se imprimen ficheros con secretos.
#   · Todo lo que pueda fallar va con `|| true` para que el inventario sea
#     completo aunque falte una pieza.
# ════════════════════════════════════════════════════════════════════════════
set -u
export LC_ALL=C

sec() { printf '\n\n===== %s =====\n' "$1"; }
run() { printf '\n--- $ %s\n' "$*"; eval "$@" 2>&1 || true; }

sec "0 · IDENTIDAD Y RELOJ"
run 'date -u +%Y-%m-%dT%H:%M:%SZ'
run 'hostname; uname -a; cat /etc/os-release | head -3'
run 'nproc; uptime'

sec "1 · NGINX (version, modulos, configuracion EFECTIVA completa)"
run 'nginx -v'
run 'nginx -V'
run 'nginx -T'

sec "2 · SYSTEMD (units activas del stack y timers)"
run "systemctl list-units --type=service --state=running --no-pager --no-legend | head -60"
run "systemctl list-units --type=timer --state=active --no-pager --no-legend"
run "systemctl list-unit-files --no-pager --no-legend | grep -Ei 'netshield|ape|iptv|nginx|php|mysql|redis|wireguard|wg-' || echo '(sin coincidencias)'"
run "systemctl cat nginx 2>/dev/null | head -40"

sec "3 · CRON / TIMERS (solo lectura)"
run 'crontab -l 2>/dev/null || echo "(root sin crontab)"'
run "ls -la /etc/cron.d/ 2>/dev/null || echo '(sin /etc/cron.d)'"
run "for f in /etc/cron.d/*; do [ -f \"\$f\" ] && { echo \"--- \$f\"; sed -n '1,40p' \"\$f\"; }; done || true"
run "systemctl list-timers --all --no-pager --no-legend | head -30"

sec "4 · PHP / FPM (versiones y modulos)"
run 'php -v 2>&1 | head -3'
run 'php -m 2>&1 | tr "\n" " "'
run 'php-fpm -v 2>&1 | head -3'
run "ls -la /etc/php/ 2>/dev/null; ls -la /etc/php/*/fpm/ 2>/dev/null | head -40"
run "systemctl status php*-fpm --no-pager -n 0 2>/dev/null | head -20"
run "grep -RhE '^\s*(listen|pm\.|user|group|php_admin_value\[open_basedir\])' /etc/php/*/fpm/pool.d/ 2>/dev/null | head -40"

sec "5 · LUA / LUAJIT"
run 'luajit -v 2>&1 | head -2'
run 'lua -v 2>&1 | head -2'
run 'luac -v 2>&1 | head -2'
run "nginx -V 2>&1 | tr ' ' '\n' | grep -i lua || echo '(modulo lua no listado en -V)'"

sec "6 · ARBOL SERVIDO /var/www (rutas, tamano, hash, mtime)"
run "ls -la /var/www 2>/dev/null"
run "find /var/www -maxdepth 3 -type d 2>/dev/null | head -60"
run "find /var/www -type f -name '*.m3u8' -printf '%TY-%Tm-%TdT%TH:%TM:%TS %10s %p\n' 2>/dev/null | sort | head -60"
run "find /var/www -type f -name '*.php' -printf '%TY-%Tm-%TdT%TH:%TM:%TS %10s %p\n' 2>/dev/null | sort | head -60"

sec "7 · /var/www/lists — HASHES SHA-256 + MTIME (base de rollback)"
run "ls -la /var/www/lists 2>/dev/null || echo '(no existe /var/www/lists)'"
run "find /var/www/lists -maxdepth 2 -type f 2>/dev/null | sort | while read -r f; do printf '%s  %s  %s\n' \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$(stat -c '%y %s' \"\$f\")\" \"\$f\"; done"

sec "8 · RESOLVER DESPLEGADO + EDGE (rutas, hash, cabecera)"
run "find /var/www -type f \( -name 'resolve_quality*' -o -name '*resolver*' -o -name 'ape_gateway.lua' -o -name 'combined_body_filter.lua' -o -name 'ape_header.lua' -o -name 'ape_uri_rebase.lua' \) 2>/dev/null | sort | while read -r f; do printf '%s  %s  %s\n' \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$(stat -c '%y %s' \"\$f\")\" \"\$f\"; done"
run "ls -la /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null"
run "find /etc/nginx -type f \( -name '*.conf' -o -name '*.lua' \) -printf '%TY-%Tm-%TdT%TH:%TM:%TS %10s %p\n' 2>/dev/null | sort | head -80"
run "find /etc/nginx -type f \( -name '*.conf' -o -name '*.lua' \) 2>/dev/null | sort | while read -r f; do printf '%s  %s\n' \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$f\"; done"

sec "9 · PUERTOS EN ESCUCHA Y CONEXIONES"
run 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null'
run "ss -tlnp 2>/dev/null | awk 'NR>1{print \$4}' | sort -u | head -40"

sec "10 · TLS (rutas + metadatos de certificado, sin claves privadas)"
run "nginx -T 2>/dev/null | grep -E 'ssl_certificate' | sed 's/^ *//' | head -20"
run "for c in \$(nginx -T 2>/dev/null | grep -E '^ *ssl_certificate ' | sed 's/^ *ssl_certificate *//;s/;.*//' | sort -u); do echo \"--- \$c\"; openssl x509 -in \"\$c\" -noout -subject -issuer -dates -serial -fingerprint -sha256 2>&1 | sed 's/^/    /'; done"
run "ls -la /etc/letsencrypt/live/ 2>/dev/null || echo '(sin letsencrypt)'"
run "systemctl list-timers --all --no-pager --no-legend 2>/dev/null | grep -i certbot || echo '(sin timer certbot)'"

sec "11 · DISCO / MEMORIA / CPU"
run 'df -h'
run 'df -i | head -12'
run 'free -m'
run 'cat /proc/loadavg'

sec "12 · PROCESOS (instantanea, solo lectura)"
run "ps -eo pid,ppid,user,rss,pcpu,etime,comm --sort=-rss | head -30"
run "ps -eo pid,user,args --sort=-rss 2>/dev/null | grep -Ei 'nginx|php-fpm|luajit|wireguard|wg-|ape|netshield' | grep -v grep | head -30"

sec "13 · SNAPSHOT CON HASHES (base de rollback)"
run "find /etc/nginx /var/www -type f 2>/dev/null | sort | while read -r f; do printf '%s  %s\n' \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$f\"; done"

sec "14 · FIN"
printf '\nCOBERTURA: si alguna seccion dice (sin coincidencias) o (no existe), es observacion real, no error de lectura.\n'
printf 'ESTE SCRIPT NO HA ESCRITO NADA EN EL SERVIDOR.\n'
