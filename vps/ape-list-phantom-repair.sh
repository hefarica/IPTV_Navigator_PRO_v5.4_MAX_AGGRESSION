#!/usr/bin/env bash
# APE — convierte los placeholders de 8 B de /lists/*.m3u8 en symlinks a la
# copia pulsada, en cuanto esa copia existe. REGLA 84 (ahorro de disco) se
# mantiene: el symlink ocupa 0 bytes. Lo que se arregla es que un lector LOCAL
# (cat, grep, reconcile del JIT, auditoria) veia 8 bytes donde hay cientos de MB.
# Idempotente: si ya es symlink o el fichero es real, no lo toca.
set -u
LISTS=/var/www/html/lists
PULSE=$LISTS/pulse
[ -d "$LISTS" ] || exit 0
changed=0
for f in "$LISTS"/*.m3u8; do
    [ -f "$f" ] || continue
    [ -L "$f" ] && continue
    sz=$(stat -c%s "$f" 2>/dev/null || echo 0)
    [ "$sz" -eq 8 ] || continue
    base=$(basename "$f")
    src="$PULSE/$base"
    if [ -f "$src" ] && [ "$(stat -c%s "$src")" -gt 8 ]; then
        rm -f "$f" && ln -s "pulse/$base" "$f" && changed=$((changed+1))
        echo "$(date -u +%FT%TZ) symlink $base -> pulse/$base ($(stat -c%s "$src") B)" >> /var/log/ara/list-phantom-repair.log
    fi
done
[ "$changed" -gt 0 ] && echo "reparados: $changed"
exit 0