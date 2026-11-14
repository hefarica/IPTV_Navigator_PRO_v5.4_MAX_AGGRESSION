#!/usr/bin/env bash
# Da a playlist_access.log el tiempo de zapping SIN romper las columnas actuales.
#
# Situacion medida:
#   sites-enabled/default:56   access_log /var/log/nginx/playlist_access.log;
#   -> sin nombre de formato = combined (9 campos, SIN $request_time)
#   nginx.conf:76  log_format iptv '...$request_time'  -> existe pero NO se usa aqui
#
# Estrategia: definir ape_playlist = combined + rt= urt= al FINAL.
# Las columnas 1-9 quedan identicas (mis analizadores siguen funcionando);
# se añaden dos campos 10 y 11.
set -uo pipefail

NGX=/etc/nginx/nginx.conf
SITE=/etc/nginx/sites-enabled/default
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

echo "=== 1. Estado actual ==="
grep -n 'playlist_access' "$SITE" | head -n 3
echo ""

cp -a "$NGX"  "${NGX}.bak_${STAMP}_apeformat"
cp -a "$SITE" "${SITE}.bak_${STAMP}_apeformat"
echo "  backups: *.bak_${STAMP}_apeformat"

echo ""
echo "=== 2. Defino ape_playlist (combined + tiempos) ==="
if grep -q 'log_format ape_playlist' "$NGX"; then
  echo "  ya existe, no se toca"
else
  python3 - "$NGX" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()
linea = ("    log_format ape_playlist '$remote_addr - $remote_user [$time_local] "
         "\"$request\" $status $body_bytes_sent \"$http_referer\" \"$http_user_agent\" "
         "rt=$request_time urt=$upstream_response_time\\n';\n")
# inserta justo despues de la linea de log_format iptv
anchor = None
for ln in s.split('\n'):
    if 'log_format iptv' in ln:
        anchor = ln
        break
if anchor is None:
    print("  NO_ENCONTRADO: log_format iptv"); sys.exit(1)
s2 = s.replace(anchor + '\n', anchor + '\n' + linea, 1)
open(p, 'w', encoding='utf-8').write(s2)
print("  definido ape_playlist")
PY
fi

echo ""
echo "=== 3. Aplico ape_playlist al access_log ==="
python3 - "$SITE" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()
pat = re.compile(r'(access_log\s+/var/log/nginx/playlist_access\.log)(\s*;)')
if 'ape_playlist' in s:
    print("  ya aplicado")
else:
    s2, n = pat.subn(r'\1 ape_playlist\2', s, count=1)
    if n == 0:
        print("  NO_ENCONTRADO: la linea access_log"); sys.exit(1)
    open(p, 'w', encoding='utf-8').write(s2)
    print(f"  aplicado en {n} linea(s)")
PY

echo ""
echo "=== 4. Verificacion ==="
grep -n 'ape_playlist' "$NGX" "$SITE" | cut -c1-180
echo ""
if nginx -t 2>&1 | grep -q 'successful'; then
  echo "  nginx -t: OK"
  systemctl reload nginx && echo "  reload: OK"
else
  echo "  nginx -t: ERROR -- ROLLBACK"
  nginx -t 2>&1 | head -n 6
  cp -a "${NGX}.bak_${STAMP}_apeformat"  "$NGX"
  cp -a "${SITE}.bak_${STAMP}_apeformat" "$SITE"
  echo "  restaurado"
  exit 1
fi

echo ""
echo "=== 5. Espero un zap para ver rt= ==="
for i in 1 2 3 4 5 6; do
  sleep 5
  L=$(tail -n 1 /var/log/nginx/playlist_access.log 2>/dev/null)
  if echo "$L" | grep -q 'rt='; then
    echo "  CONFIRMADO · ultima linea con rt=:"
    echo "  $L" | cut -c1-240
    break
  fi
  [ "$i" = "6" ] && { echo "  sin zap en 30 s · ultima linea:"; echo "  $(echo "$L" | cut -c1-200)"; }
done
