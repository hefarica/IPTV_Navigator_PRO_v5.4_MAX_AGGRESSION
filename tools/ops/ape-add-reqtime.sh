#!/usr/bin/env bash
# Añade $request_time y $upstream_response_time al log de pulse, para poder
# medir el tiempo de zapping. Aditivo y reversible.
#
# Por qué: playlist_access.log tiene 23 campos y el ultimo es el UA. Sin
# $request_time no se puede responder "cuanto tarda un zap". Se añade al final
# para no romper los parsers que leen las columnas 1-23.
set -uo pipefail

CONF=/etc/nginx/conf.d/00-log-formats.conf
[ -f "$CONF" ] || CONF=$(grep -rl 'log_format iptv' /etc/nginx/ 2>/dev/null | head -n 1)
[ -n "$CONF" ] || { echo "NO_ENCONTRADO: no hay log_format iptv"; exit 1; }

echo "=== fichero de formato: $CONF ==="
echo ""
echo "=== ANTES ==="
grep -n 'log_format' "$CONF" | head -n 10 | cut -c1-200
echo ""

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
cp -a "$CONF" "${CONF}.bak_${STAMP}_reqtime"
echo "  backup: ${CONF}.bak_${STAMP}_reqtime"

# Añade rt= al final del log_format que se llame iptv o playlist.
# No toca los campos existentes: solo agrega dos mas al final.
python3 - "$CONF" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()

# Busca el log_format que alimenta playlist_access.log
m = re.search(r'(log_format\s+(\w+)\s+)(\'[^\']*\'|"[^"]*")', s)
if not m:
    print("  NO_ENCONTRADO: ningun log_format"); sys.exit(1)

name = m.group(2)
body = m.group(3)
if '$request_time' in body:
    print(f"  {name}: YA tiene $request_time, no se toca")
    sys.exit(0)

quote = body[0]
inner = body[1:-1]
nuevo = inner + ' rt=$request_time urt=$upstream_response_time'
s2 = s[:m.start(3)] + quote + nuevo + quote + s[m.end(3):]
open(p, 'w', encoding='utf-8').write(s2)
print(f"  {name}: añadido rt=$request_time urt=$upstream_response_time")
PY

echo ""
echo "=== DESPUES ==="
grep -n 'log_format' "$CONF" | head -n 10 | cut -c1-240

echo ""
echo "=== nginx -t ==="
if nginx -t 2>&1 | grep -q 'successful'; then
  echo "  sintaxis: OK"
  systemctl reload nginx && echo "  reload: OK"
else
  echo "  sintaxis: ERROR -- ROLLBACK"
  nginx -t 2>&1 | head -n 5
  cp -a "${CONF}.bak_${STAMP}_reqtime" "$CONF"
  echo "  restaurado el backup"
  exit 1
fi

echo ""
echo "=== Verificacion: el proximo hit debe traer rt= ==="
echo "  (haz un zap ahora; en 10 s se comprueba)"
sleep 10
tail -n 3 /var/log/nginx/playlist_access.log 2>/dev/null | awk '{print "  " $0}' | cut -c1-260
