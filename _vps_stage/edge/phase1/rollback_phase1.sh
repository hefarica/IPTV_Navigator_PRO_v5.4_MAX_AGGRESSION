#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E2 · FASE 1 — ROLLBACK: restaurar el `default` pre-FASE-1 + nginx -t + reload
# ═══════════════════════════════════════════════════════════════════════════
# Uso (EN el VPS):
#   ssh root@178.156.147.234 'bash -s' -- <STAMP> < rollback_phase1.sh          # dry-run
#   ssh root@178.156.147.234 'bash -s' -- <STAMP> --apply < rollback_phase1.sh  # aplica
#
#   <STAMP> = 20261026T203255Z (backup pre-FASE-1, incluye el hotfix de /upload.php)
#
# Restaura SOLO /etc/nginx/sites-enabled/default (los otros 2 ficheros no se
# tocaron en FASE 1). Dry-run por defecto: verifica sha256 y no escribe nada.
# --apply: install -m 644 + nginx -t + systemctl reload nginx (nunca restart).
# ═══════════════════════════════════════════════════════════════════════════
set -u

STAMP="${1:-}"
MODE="${2:-}"
case "$STAMP" in
  [0-9]*T*Z) : ;;
  *) echo "FATAL: uso: rollback_phase1.sh <STAMP> [--apply]"; exit 1 ;;
esac
APPLY=0
[ "$MODE" = "--apply" ] && APPLY=1

ROOT="/root/backups/edge-e1-${STAMP}"
FILE="/etc/nginx/sites-enabled/default"
BAK="$ROOT${FILE}.bak_${STAMP}"
MAN="$ROOT/SHA256SUMS"
FAIL=0

echo "===== E2 FASE 1 · ROLLBACK $([ "$APPLY" -eq 1 ] && echo APPLY || echo DRY-RUN) ====="
echo "backup=$BAK"
echo "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

[ -f "$MAN" ] || { echo "FATAL: falta $MAN"; exit 1; }
[ -f "$BAK" ] || { echo "FATAL: falta $BAK"; exit 1; }

want="$(awk -v f="$FILE" '$4 == f { print $1; exit }' "$MAN")"
got="$(sha256sum "$BAK" | cut -d' ' -f1)"
if [ -z "$want" ] || [ "$want" != "$got" ]; then
  echo "FATAL: sha del backup no coincide con el manifiesto ($got != ${want:-?})"
  exit 1
fi
echo "backup sha256=$got (OK)"
echo "actual sha256=$(sha256sum "$FILE" | cut -d' ' -f1)"

if [ "$APPLY" -eq 1 ]; then
  install -m 644 -o root -g root "$BAK" "$FILE" || { echo "FAIL install"; exit 1; }
  now="$(sha256sum "$FILE" | cut -d' ' -f1)"
  if [ "$now" != "$got" ]; then
    echo "FAIL sha post-restore ($now != $got)"
    exit 1
  fi
  echo "RESTORED $FILE (sha256=$now)"
  if nginx -t; then
    systemctl reload nginx && echo "RELOADED nginx"
    echo "state: $(systemctl is-active nginx) MainPID=$(systemctl show nginx -p MainPID --value)"
  else
    echo "FAIL nginx -t tras restaurar — NO se recarga"
    FAIL=1
  fi
else
  echo "DRYRUN: restauraría $FILE desde $BAK (sha verificado). Nada escrito."
  echo "DRYRUN: para aplicar → bash rollback_phase1.sh $STAMP --apply"
fi

[ "$FAIL" -eq 0 ] && echo "RESULT=OK" || echo "RESULT=FAIL"
exit "$FAIL"
