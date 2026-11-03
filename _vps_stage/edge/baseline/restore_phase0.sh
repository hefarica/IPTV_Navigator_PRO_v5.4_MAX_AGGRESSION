#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E1 · FASE 0 — RESTAURACIÓN DE BACKUPS (dry-run por defecto)
# ═══════════════════════════════════════════════════════════════════════════
# Uso (EN el VPS):
#   ssh root@178.156.147.234 'bash -s' -- <STAMP> < restore_phase0.sh
#   ssh root@178.156.147.234 'bash -s' -- <STAMP> --apply < restore_phase0.sh
#
#   <STAMP>  = 20261026T201500Z  (el del trailer RESULT=OK de phase0_backup.sh)
#
# DRY-RUN (sin --apply): verifica que cada backup existe, su sha256 coincide
# con el manifiesto y que la reinstalación sería byte-exacta. No escribe nada.
# APPLY: reinstala con `install -m <mode>` y valida sha256 post-restore, luego
# `nginx -t`. NO recarga nginx (el reload es una decisión de ventana aparte).
#
# ⚠️ AVISO DE ESTADO: el set `edge-e1-20261026T201548Z` es de la FASE 0 y es
#    PRE-HOTFIX: el 2026-10-26T20:23:27Z otra sesión añadió
#    `location = /upload.php { return 403; }` a sites-enabled/default.
#    Restaurar este set DESHACE ese hotfix de seguridad. Es correcto para
#    volver al estado del baseline; NO lo es para "arreglar" producción actual.
#    Antes de cualquier restore real, re-hashear la config viva y decidir.
# ═══════════════════════════════════════════════════════════════════════════
set -u

STAMP="${1:-}"
MODE="${2:-}"
case "$STAMP" in
  [0-9]*T*Z) : ;;
  *) echo "FATAL: uso: restore_phase0.sh <STAMP> [--apply]"; exit 1 ;;
esac
[ "$MODE" = "--apply" ] || MODE=""
APPLY=0
[ "$MODE" = "--apply" ] && APPLY=1

ROOT="/root/backups/edge-e1-${STAMP}"
MAN="$ROOT/SHA256SUMS"
if [ ! -f "$MAN" ]; then
  echo "FATAL: no existe el manifiesto $MAN"
  exit 1
fi

FAIL=0
echo "===== E1 FASE 0 · RESTORE $([ "$APPLY" -eq 1 ] && echo APPLY || echo DRY-RUN) ====="
echo "manifest=$MAN"
while read -r sha size mode src bak; do
  [ -n "${src:-}" ] || continue
  if [ ! -f "$bak" ]; then
    echo "FAIL falta backup: $bak"
    FAIL=1
    continue
  fi
  bsha="$(sha256sum "$bak" | cut -d' ' -f1)"
  if [ "$bsha" != "$sha" ]; then
    echo "FAIL sha del backup: $bak ($bsha != $sha)"
    FAIL=1
    continue
  fi
  if [ "$APPLY" -eq 1 ]; then
    if ! install -m "$mode" -o root -g root "$bak" "$src"; then
      echo "FAIL install: $src"
      FAIL=1
      continue
    fi
    nsha="$(sha256sum "$src" | cut -d' ' -f1)"
    if [ "$nsha" != "$sha" ]; then
      echo "FAIL sha post-restore: $src ($nsha != $sha)"
      FAIL=1
      continue
    fi
    echo "RESTORED $src (mode=$mode sha=$sha)"
  else
    echo "DRYRUN   $src <- $bak (mode=$mode sha OK)"
  fi
done < "$MAN"

if [ "$APPLY" -eq 1 ]; then
  if nginx -t; then
    echo "OK  nginx -t tras restaurar (NO se ha recargado nginx)"
  else
    echo "FAIL nginx -t tras restaurar"
    FAIL=1
  fi
else
  echo "DRYRUN: nada escrito. Para aplicar: bash restore_phase0.sh $STAMP --apply"
fi

[ "$FAIL" -eq 0 ] && echo "RESULT=OK" || echo "RESULT=FAIL"
exit "$FAIL"
