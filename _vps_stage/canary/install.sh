#!/usr/bin/env bash
# install.sh — instala FASE 0 (skills/gate) y FASE 1 (canary) en el VPS.
# Se ejecuta desde un staging (p. ej. /tmp/ape-fase01) como root.
#
#   bash install.sh              instala + valida (ara-skill check)
#   bash install.sh --rollback <stamp>   restaura el backup de ese stamp
#
# No toca /lists/, /sync, /ara ni el catálogo. Backup en
# /var/backups/ape-canary/<stamp>/.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS="$SRC/../skills"
STAMP_ROOT="/var/backups/ape-canary"
SKILL_DST="/etc/ara/skills"
CANARY_ETC="/etc/ara/canary"
CANARY_LIB="/var/lib/ara/canary"
BIN="/usr/local/bin"
UNIT="/etc/systemd/system/ape-canary@.service"

[ "$(id -u)" -eq 0 ] || { echo "install.sh: requiere root" >&2; exit 2; }
[ -d "$SKILLS" ] || { echo "install.sh: falta $SKILLS" >&2; exit 3; }

if [ "${1:-}" = "--rollback" ]; then
  ST="${2:-}"
  [ -n "$ST" ] || { echo "uso: $0 --rollback <stamp>" >&2; exit 2; }
  BK="$STAMP_ROOT/$ST"
  [ -d "$BK" ] || { echo "no existe $BK" >&2; exit 3; }
  ( cd "$BK" && find . -type f -print0 | while IFS= read -r -d '' f; do
      mode=0644
      case "/${f#./}" in /usr/local/bin/*|*/install.sh) mode=0755;; esac
      install -D -m "$mode" "$f" "/${f#./}"
    done )
  systemctl daemon-reload
  echo "ROLLBACK OK stamp=$ST"
  exit 0
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BK="$STAMP_ROOT/$STAMP"
mkdir -p "$BK"
for p in "$SKILL_DST" "$BIN/ara-skill" "$BIN/ape-visual-emulate.sh" "$BIN/ape-canaryctl" "$UNIT" "$CANARY_ETC"; do
  if [ -e "$p" ]; then
    mkdir -p "$BK$(dirname "$p")"
    cp -a "$p" "$BK$p"
  fi
done

install -d -m 0755 -o root -g root "$SKILL_DST" "$SKILL_DST/corpus"
install -m 0644 "$SKILLS/SKILLS.md" "$SKILL_DST/SKILLS.md"
install -m 0644 "$SKILLS/skills.json" "$SKILL_DST/skills.json"
install -m 0644 "$SKILLS"/corpus/*.md "$SKILL_DST/corpus/"

install -m 0755 "$SRC/ara-skill" "$BIN/ara-skill"
install -m 0755 "$SRC/ape-visual-emulate.sh" "$BIN/ape-visual-emulate.sh"
install -m 0755 "$SRC/ape-canaryctl" "$BIN/ape-canaryctl"
install -d -m 0755 -o root -g root /etc/systemd/system
install -m 0644 "$SRC/ape-canary@.service" "$UNIT"

install -d -m 0750 -o root -g www-data "$CANARY_ETC"
install -d -m 0750 -o www-data -g www-data "$CANARY_LIB"
printf '%s\n' "$STAMP" > /etc/ara/install.stamp
chmod 0644 /etc/ara/install.stamp

systemctl daemon-reload
printf 'install_stamp=%s backup=%s\n' "$STAMP" "$BK"

# Gate FASE 0/1: si falla, el install NO declara éxito.
"$BIN/ara-skill" check --for-canary
echo "FASE0/FASE1 INSTALL OK stamp=$STAMP"
