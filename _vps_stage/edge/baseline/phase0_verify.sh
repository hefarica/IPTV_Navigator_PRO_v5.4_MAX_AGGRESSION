#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E1 · FASE 0 — RE-VERIFICACIÓN READ-ONLY DE LOS BACKUPS (evidencia cruda)
# ═══════════════════════════════════════════════════════════════════════════
# Uso (EN el VPS, desde el repo):
#   ssh root@178.156.147.234 "STAMP=<stamp> bash -s" \
#     < _vps_stage/edge/baseline/phase0_verify.sh
#
# No escribe nada: solo lista, hashea y compara. `nginx -t` no muta estado.
# ═══════════════════════════════════════════════════════════════════════════
set -u
STAMP="${STAMP:-20261026T201548Z}"
ROOT="/root/backups/edge-e1-${STAMP}"
FAIL=0

echo "===== BACKUP TREE ====="
find "$ROOT" -type f -printf '%M %u:%g %10s %p\n' | sort
echo
echo "===== MANIFEST ====="
cat "$ROOT/SHA256SUMS"
echo
echo "===== RE-VERIFICACIÓN (fuente vs backup) ====="
while read -r sha size mode src bak; do
  [ -n "${src:-}" ] || continue
  s="$(sha256sum "$src" | cut -d' ' -f1)"
  b="$(sha256sum "$bak" | cut -d' ' -f1)"
  if cmp -s "$src" "$bak" && [ "$s" = "$sha" ] && [ "$b" = "$sha" ]; then
    echo "OK   $src  sha256=$s  size=$size  mode=$mode"
  else
    echo "FAIL $src"
    FAIL=1
  fi
done < "$ROOT/SHA256SUMS"
echo
echo "===== NGINX STATE (sin cambios) ====="
nginx -t 2>&1
systemctl show nginx -p MainPID -p NRestarts -p ActiveEnterTimestamp
echo
echo "===== FICHEROS VIVOS (stat) ====="
stat -c '%n|%s|%a|%y' \
  /etc/nginx/conf.d/50-ape-meta-plane.conf \
  /etc/nginx/snippets/ape-meta-public.conf \
  /etc/nginx/sites-enabled/default
echo
echo "===== NGINX EFECTIVO (hash) ====="
echo "nginx-T sha256=$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"
echo
[ "$FAIL" -eq 0 ] && echo "RESULT=OK" || echo "RESULT=FAIL"
exit "$FAIL"
