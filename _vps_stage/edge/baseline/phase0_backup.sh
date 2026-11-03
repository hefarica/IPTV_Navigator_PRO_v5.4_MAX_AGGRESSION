#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E1 · FASE 0 — BACKUPS BYTE-EXACTOS DEL PLANO EDGE
# ═══════════════════════════════════════════════════════════════════════════
# EJECUTAR EN EL VPS (no en el repo):
#   ssh -o BatchMode=yes root@178.156.147.234 'bash -s' \
#     < _vps_stage/edge/baseline/phase0_backup.sh
#
# QUÉ HACE
#   1. Copia los 3 ficheros que gobiernan el edge 443/8088:
#        /etc/nginx/conf.d/50-ape-meta-plane.conf
#        /etc/nginx/snippets/ape-meta-public.conf
#        /etc/nginx/sites-enabled/default
#      a  /root/backups/edge-e1-<UTC>/<ruta original>.bak_<UTC>
#   2. Verifica byte a byte (sha256 + cmp) y SIMULA la restauración (install+cmp).
#   3. Guarda `nginx -T` (referencia exacta para rollback) y `nginx -t`.
#   4. NO recarga nginx, NO escribe ningún .conf vivo ⇒ delta funcional = 0.
#
# POR QUÉ EL SUFIJO .bak_<stamp> NO SE DEJA JUNTO AL ORIGINAL EN sites-enabled
#   /etc/nginx/nginx.conf incluye `include /etc/nginx/sites-enabled/*;` — SIN
#   filtro de extensión. Un hermano `sites-enabled/default.bak_<stamp>` sería
#   parseado como un SEGUNDO `server { listen 443 ssl default_server; }` ⇒
#   `nginx -t` falla ⇒ el siguiente reload/restart falla (cambio funcional).
#   Por eso el backup conserva la ruta original DENTRO de la raíz de backups y
#   el sufijo pedido va en el nombre del fichero.
#
# SALIDA: líneas OK/FAIL + trailer `RESULT=OK|FAIL stamp=... root=...`
# Exit: 0 si todos los backups verifican; 1 si algo falla.
# ═══════════════════════════════════════════════════════════════════════════
set -u

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROOT="/root/backups/edge-e1-${STAMP}"
FILES="
/etc/nginx/conf.d/50-ape-meta-plane.conf
/etc/nginx/snippets/ape-meta-public.conf
/etc/nginx/sites-enabled/default
"
FAIL=0
say() { printf '%s\n' "$*"; }

umask 077
if ! mkdir -p "$ROOT"; then
  say "FATAL: no puedo crear $ROOT"
  exit 1
fi

say "===== E1 FASE 0 · BACKUPS DEL PLANO EDGE ====="
say "stamp_utc=$STAMP"
say "root=$ROOT"
say "host=$(hostname)"
say "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "nginx=$(nginx -v 2>&1)"
say

: > "$ROOT/SHA256SUMS"
for f in $FILES; do
  if [ ! -f "$f" ]; then
    say "FAIL ausente: $f"
    FAIL=1
    continue
  fi
  src_sha="$(sha256sum "$f" | cut -d' ' -f1)"
  src_size="$(stat -c %s "$f")"
  src_mode="$(stat -c %a "$f")"
  dst="$ROOT${f}.bak_${STAMP}"
  if ! mkdir -p "$(dirname "$dst")"; then
    say "FAIL mkdir para $dst"
    FAIL=1
    continue
  fi
  if ! install -m 600 -o root -g root "$f" "$dst"; then
    say "FAIL install: $f"
    FAIL=1
    continue
  fi
  bak_sha="$(sha256sum "$dst" | cut -d' ' -f1)"
  bak_size="$(stat -c %s "$dst")"
  [ "$src_sha" = "$bak_sha" ] || { say "FAIL sha distinto: $f"; FAIL=1; }
  [ "$src_size" = "$bak_size" ] || { say "FAIL size distinto: $f"; FAIL=1; }
  cmp -s "$f" "$dst" || { say "FAIL cmp distinto: $f"; FAIL=1; }

  # Simulación de restauración: el backup se reinstala en un temporal y se
  # compara contra el original. Prueba que el rollback puede devolver los
  # mismos bytes (sin tocar el fichero vivo).
  TMPR="$(mktemp)"
  if install -m "$src_mode" "$dst" "$TMPR" 2>/dev/null && cmp -s "$f" "$TMPR"; then
    :
  else
    say "FAIL restore-sim: $f"
    FAIL=1
  fi
  rm -f "$TMPR"

  printf '%s  %s  %s  %s  %s\n' \
    "$src_sha" "$src_size" "$src_mode" "$f" "$dst" >> "$ROOT/SHA256SUMS"
  say "OK  $f"
  say "    sha256=$src_sha size=$src_size mode=$src_mode"
  say "    bak=$dst"
done

# Referencia exacta de la configuración efectiva (para diff/rollback)
if nginx -T > "$ROOT/nginx-T.conf" 2> "$ROOT/nginx-T.err"; then
  say "OK  nginx -T -> $ROOT/nginx-T.conf ($(stat -c %s "$ROOT/nginx-T.conf") B, sha256=$(sha256sum "$ROOT/nginx-T.conf" | cut -d' ' -f1))"
else
  say "FAIL nginx -T"
  FAIL=1
fi

# La config VIVA no cambia: nginx -t debe seguir limpio
if nginx -t > "$ROOT/nginx-t.txt" 2>&1; then
  say "OK  nginx -t (config viva intacta)"
else
  say "FAIL nginx -t"
  FAIL=1
fi
sed 's/^/    /' "$ROOT/nginx-t.txt"

say
say "===== sites-enabled: censo (no debe haber .bak_*) ====="
SITES="$(find /etc/nginx/sites-enabled -maxdepth 1 -type f -printf '%f\n' 2>/dev/null | sort)"
say "$SITES" | sed 's/^/    /'
EXTRA="$(printf '%s\n' "$SITES" | grep -v -E '^(default|coa-navigator)$' || true)"
if [ -n "$EXTRA" ]; then
  say "WARN ficheros extra en sites-enabled (revisar): $EXTRA"
else
  say "OK  sites-enabled solo contiene los server blocks esperados"
fi

say
if [ "$FAIL" -eq 0 ]; then
  say "RESULT=OK stamp=$STAMP root=$ROOT"
else
  say "RESULT=FAIL stamp=$STAMP root=$ROOT"
fi
exit "$FAIL"
