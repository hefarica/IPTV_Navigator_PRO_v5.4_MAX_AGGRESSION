#!/usr/bin/env bash
# Triage de 404/502/403 y del disco — solo lectura, no cambia nada.
set -uo pipefail
L=/var/log/nginx/playlist_access.log

echo "=== 1. 404: que rutas se piden (top 12) ==="
awk '{print $7}' "$L" | sed 's|?.*||' | sort | uniq -c | sort -rn | head -n 12

echo ""
echo "=== 2. 404: quien las pide (UA, top 6) ==="
awk '$9==404 {for(i=12;i<=NF;i++) printf "%s ", $i; print ""}' "$L" | sort | uniq -c | sort -rn | head -n 6

echo ""
echo "=== 3. 502: hora y ruta (ultimas 10) ==="
awk '$9==502 {print $4, $7}' "$L" | sed 's|?.*||' | tail -n 10

echo ""
echo "=== 4. 502: cuantos por hora ==="
awk '$9==502 {print substr($4,2,14)}' "$L" | sort | uniq -c | tail -n 8

echo ""
echo "=== 5. 403: quien ==="
awk '$9==403 {for(i=12;i<=NF;i++) printf "%s ", $i; print ""}' "$L" | sort | uniq -c | sort -rn | head -n 5

echo ""
echo "=== 6. DISCO: reparto ==="
df -h / | awk 'NR==2{print "  raiz: "$3"/"$2" ("$5")"}'
du -sh /var/www/lists 2>/dev/null | sed 's/^/  lists:      /'
du -sh /var/log      2>/dev/null | sed 's/^/  log:        /'
du -sh /var/lib/ara  2>/dev/null | sed 's/^/  ara:        /'
du -sh /var/backups  2>/dev/null | sed 's/^/  backups:    /'
du -sh /opt/ape-jit  2>/dev/null | sed 's/^/  ape-jit:    /'

echo ""
echo "=== 7. DISCO: ficheros > 200 MB ==="
find / -xdev -type f -size +200M 2>/dev/null -printf '%s %p\n' | sort -rn | head -n 10 | \
  while read -r s p; do printf "  %6s MB  %s\n" "$((s/1048576))" "$p"; done

echo ""
echo "=== 8. DISCO: que se puede purgar con seguridad ==="
echo "  backups (>7 dias):"
find /var/backups -type f -mtime +7 2>/dev/null -printf '%s %p\n' | awk '{s+=$1} END{printf "    %d MB\n", s/1048576}'
echo "  logs rotados comprimidos:"
find /var/log -name '*.gz' -type f 2>/dev/null -printf '%s %p\n' | awk '{s+=$1} END{printf "    %d MB\n", s/1048576}'
echo "  listas antiguas en lists/pulse:"
ls -1t /var/www/lists/pulse/APE_LISTA_*.m3u8 2>/dev/null | tail -n +2 | while read -r f; do
  printf "    %s MB  %s\n" "$(( $(stat -c%s "$f") / 1048576 ))" "$(basename "$f")"
done
