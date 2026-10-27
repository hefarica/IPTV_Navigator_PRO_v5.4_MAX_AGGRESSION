#!/usr/bin/env bash
# deploy.sh — DESPLIEGUE ATÓMICO. Sin --apply NO hace nada (dry-run por defecto).
# Flujo: staging en /tmp -> validar -> backup -> install -> nginx -t -> reload -> verify
#        Si falla cualquier paso posterior al backup: rollback automático.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
APPLY=0; YES=0
for a in "$@"; do case "$a" in --apply) APPLY=1;; --yes) YES=1;; esac; done
c_hdr "DEPLOY · $VPS_HOST · $STAMP"
if [ "$APPLY" -ne 1 ]; then
  c_warn "   Modo SIMULACIÓN: no se despliega nada. Para aplicar: $0 --apply --yes"
  exec "$DEPLOY_DIR/dry-run.sh"
fi
[ "$YES" -eq 1 ] || { c_bad "   Falta --yes (confirmación explícita del propietario). Abortado."; exit 2; }

# 0) validación previa obligatoria
"$DEPLOY_DIR/validate.sh" || { c_bad "   validate.sh falló: no se despliega"; exit 3; }

STAGING="/tmp/ape-deploy-$STAMP"
BK="$REMOTE_BACKUP_ROOT/$STAMP"
rsh "mkdir -p '$STAGING' '$BK'" || { c_bad "   no se pudo crear staging/backup"; exit 4; }
trap 'c_warn "   limpieza de staging"; rsh "rm -rf \"$STAGING\"" >/dev/null 2>&1 || true' EXIT

c_hdr "1 · subida a staging + validación remota"
changed=0
STAGED_LIST=""   # [t112] destinos realmente subidos a staging
while IFS=$'\t' read -r src dst mode owner note; do
  lf="$REPO_ROOT/$src"; [ -f "$lf" ] || continue
  lh="$(sha_local "$lf")"
  rh="$(rsh "[ -f '$dst' ] && sha256sum '$dst' | cut -d' ' -f1 || echo AUSENTE")"
  if [ "$lh" = "$rh" ]; then printf '   SIN CAMBIO  %s\n' "$dst"; continue; fi
  b="$(basename "$src")"
  rsh "cat > '$STAGING/$b'" < "$lf" || { c_bad "   fallo subiendo $src"; exit 5; }
  case "$src" in
    *.lua) rsh "luac -p '$STAGING/$b'" || { c_bad "   luac falla en staging: $b"; exit 6; } ;;
    *.php) rsh "php -l '$STAGING/$b' | grep -q 'No syntax errors'" || { c_bad "   php -l falla en staging: $b"; exit 6; } ;;
    *.conf) rsh "cp -a '$STAGING/$b' '$STAGING/_candidate.conf'" >/dev/null || true ;;
  esac
  printf '   STAGED      %s (sha %s…)\n' "$dst" "${lh:0:12}"
  STAGED_LIST="$STAGED_LIST$dst"$'\n'          # [t112] solo se instala lo que está en staging
  changed=$((changed+1))
done < <(manifest_rows)
[ "$changed" -eq 0 ] && { c_ok "   Nada que desplegar (todo idéntico)."; exit 0; }

c_hdr "2 · backup de los destinos afectados"
while IFS=$'\t' read -r src dst mode owner note; do
  rsh "[ -f '$dst' ] && { mkdir -p \"$BK\$(dirname '$dst')\"; cp -a '$dst' \"$BK$dst\"; echo \"   BACKUP \$dst\"; } || true"
done < <(manifest_rows)

c_hdr "3 · instalación (mv atómico dentro del mismo FS) + nginx -t + reload"
fail=0
while IFS=$'\t' read -r src dst mode owner note; do
  b="$(basename "$src")"
  [ -f "$REPO_ROOT/$src" ] || continue
  # [t112] BUG: se instalaba desde $STAGING SIEMPRE, pero staging solo tiene lo
  # que cambió. Un fichero no subido => install de un origen inexistente.
  if ! printf '%s' "$STAGED_LIST" | grep -qxF "$dst"; then
    printf '   NO-STAGED   %s (sin cambios: no se toca)\n' "$dst"; continue
  fi
  [ -f "$STAGING/$b" ] || { c_bad "   FATAL: $STAGING/$b no existe pero $dst está en STAGED_LIST"; fail=1; continue; }
  rsh "install -m '$mode' -o '${owner%%:*}' -g '${owner##*:}' '$STAGING/$b' '$dst' && sha256sum '$dst' | cut -d' ' -f1" > /tmp/_ape_installed.sha 2>/dev/null \
    || { c_bad "   install falló: $dst"; fail=1; continue; }
  got="$(tail -n1 /tmp/_ape_installed.sha | tr -d '[:space:]')"
  want="$(sha_local "$REPO_ROOT/$src")"
  if [ "$got" != "$want" ]; then
    c_bad "   PARIDAD ROTA $dst (repo=$want remoto=$got)"; fail=1
  else
    printf '   INSTALADO   %s (sha %s… paridad OK)\n' "$dst" "${want:0:12}"
  fi
done < <(manifest_rows)
if [ "$fail" -ne 0 ] || ! rsh "nginx -t" ; then
  c_bad "   nginx -t falló → ROLLBACK automático"
  "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes || c_bad "   ROLLBACK TAMBIÉN FALLÓ: intervención manual con $BK"
  exit 7
fi
rsh "nginx -s reload" || { c_bad "   reload falló → ROLLBACK"; "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes; exit 8; }
c_ok "   desplegado y recargado"

c_hdr "4 · verificación (smoke)"
if ! "$DEPLOY_DIR/verify.sh"; then
  c_bad "   verify.sh falló → ROLLBACK automático"
  "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes
  exit 9
fi
c_hdr "RESUMEN DEPLOY"
printf '   ficheros instalados: %d\n   backup: %s\n   rollback: %s/rollback.sh %s --yes\n' "$changed" "$BK" "$DEPLOY_DIR" "$STAMP"
c_ok "   DEPLOY OK"
