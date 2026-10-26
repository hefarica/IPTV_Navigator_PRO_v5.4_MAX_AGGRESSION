#!/usr/bin/env bash
# rollback.sh <stamp> [--yes] — restaura el backup de ese stamp y recarga nginx.
# El backup en $REMOTE_BACKUP_ROOT/<stamp>/ replica el arbol absoluto:
#   /var/backups/ape-deploy/<stamp>/etc/nginx/lua/ape_header.lua
#   /var/backups/ape-deploy/<stamp>/var/www/html/lists/APE_LISTA_PRODUCTION.m3u8
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ST="${1:-}"
YES="${2:-}"

if [ -z "$ST" ]; then
    c_bad "uso: rollback.sh <stamp> [--yes]"
    c_warn "stamps disponibles:"
    rsh "ls -1 $REMOTE_BACKUP_ROOT 2>/dev/null | sed 's/^/   /'"
    exit 2
fi

BK="$REMOTE_BACKUP_ROOT/$ST"

if [ "$YES" != "--yes" ]; then
    c_warn "SIMULACIÓN: nada se restaura. Para ejecutar: $0 $ST --yes"
    rsh "test -d '$BK' && ls -laR '$BK' | head -40 || echo '   (no existe el backup)'"
    exit 0
fi

c_hdr "ROLLBACK · $ST"
if ! rsh "test -d '$BK'"; then
    c_bad "   no existe el backup $BK"
    exit 3
fi

# Lista de rutas relativas dentro del backup (una por línea) y restauración una a una.
LIST="$(rsh "find '$BK' -type f" | sed "s|^$BK/||")"
restored=0
while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    if rsh "install -m 644 -o root -g root '$BK/$rel' '/$rel'"; then
        printf '   RESTAURADO /%s\n' "$rel"
        restored=$((restored + 1))
    else
        c_bad "   FALLO restaurando /$rel"
    fi
done <<< "$LIST"

c_hdr "RECARGA"
if rsh "nginx -t"; then
    if rsh "nginx -s reload"; then
        c_ok "   rollback aplicado ($restored ficheros) y nginx recargado"
    else
        c_bad "   nginx -s reload falló tras el rollback"
        exit 5
    fi
else
    c_bad "   nginx -t falla tras el rollback: intervención manual sobre $BK"
    exit 4
fi
