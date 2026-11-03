#!/usr/bin/env bash
# sync-include.sh <stamp> [--apply] — añade UNA línea de include al snippet
# público 443 para que `location = /sync` exista (t35).
#
# No reescribe el snippet vivo: solo añade `include snippets/prisma-ara-sync.conf;`
# de forma idempotente. Backup en $REMOTE_BACKUP_ROOT/<stamp>/ para que
# rollback.sh lo restaure. Si `nginx -t` falla, restaura al instante.
#
# Sin --apply solo muestra el plan.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ST="${1:-}"
MODE="${2:-}"
LIVE="/etc/nginx/snippets/ape-meta-public.conf"
LINE="include snippets/prisma-ara-sync.conf;"

if [ -z "$ST" ]; then
  c_bad "uso: sync-include.sh <stamp> [--apply]"; exit 2
fi
BK="$REMOTE_BACKUP_ROOT/$ST"

if [ "$MODE" != "--apply" ]; then
  c_hdr "SYNC INCLUDE · SIMULACIÓN"
  printf '   destino: %s\n   línea  : %s\n   backup : %s%s\n' "$LIVE" "$LINE" "$BK" "$LIVE"
  exit 0
fi

c_hdr "SYNC INCLUDE · $LIVE"
if rsh "grep -qxF '$LINE' '$LIVE'"; then
  c_ok "   include ya presente (idempotente, sin cambios)"
  exit 0
fi

rsh "mkdir -p '$BK$(dirname "$LIVE")' && cp -a '$LIVE' '$BK$LIVE'" \
  || { c_bad "   no se pudo respaldar $LIVE"; exit 3; }

rsh "printf '\n%s\n' '$LINE' >> '$LIVE'" \
  || { c_bad "   no se pudo añadir el include"; exit 4; }

if ! rsh "nginx -t"; then
  c_bad "   nginx -t falla tras el include → restaurando backup"
  rsh "cp -a '$BK$LIVE' '$LIVE' && nginx -t" || c_bad "   restauración manual necesaria: $BK$LIVE"
  exit 5
fi
c_ok "   include añadido; backup en $BK$LIVE"
exit 0
