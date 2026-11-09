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
n_installed=0    # [t114] contador real de instalaciones
n_rows=0         # [t115] filas realmente iteradas
n_manifest=$(manifest_rows | grep -c . || true)   # [t115] filas del manifiesto
while IFS=$'\t' read -r src dst mode owner note <&3; do   # [t115] fd 3: ssh NO puede robar el manifiesto por stdin
  n_rows=$((n_rows+1))
  lf="$REPO_ROOT/$src"
  [ -f "$lf" ] || { c_bad "   AUSENTE-LOCAL $src (el manifiesto cita un origen que no existe) → ABORTA"; exit 11; }   # [t115] sin continue silencioso
  lh="$(sha_local "$lf")"
  rh="$(rsh "[ -f '$dst' ] && sha256sum '$dst' | cut -d' ' -f1 || echo AUSENTE")"
  if [ "$lh" = "$rh" ]; then printf '   SIN CAMBIO  %s\n' "$dst"; continue; fi
  b="$(basename "$src")"
  rsh "cat > '$STAGING/$b'" < "$lf" || { c_bad "   fallo subiendo $src"; exit 5; }
  staged_sha="$(rsh "sha256sum '$STAGING/$b' 2>/dev/null | cut -d' ' -f1" | tr -d '[:space:]')"   # [t115] verifica el transporte
  [ "$staged_sha" = "$lh" ] || { c_bad "   FATAL: staging corrupto $b (local=${lh:0:12} remoto=${staged_sha:0:12})"; exit 5; }
  case "$src" in
    *.lua) rsh "luac -p '$STAGING/$b'" || { c_bad "   luac falla en staging: $b"; exit 6; } ;;
    *.php) rsh "php -l '$STAGING/$b' | grep -q 'No syntax errors'" || { c_bad "   php -l falla en staging: $b"; exit 6; } ;;
    *.conf) rsh "cp -a '$STAGING/$b' '$STAGING/_candidate.conf'" >/dev/null || true ;;
  esac
  printf '   STAGED      %s (sha %s…)\n' "$dst" "${lh:0:12}"
  STAGED_LIST="$STAGED_LIST$dst"$'\n'          # [t112] solo se instala lo que está en staging
  changed=$((changed+1))
done 3< <(manifest_rows)   # [t115]
if [ "$n_rows" -ne "$n_manifest" ]; then
  c_bad "   ABORTA: manifiesto=$n_manifest filas, iteradas=$n_rows (algún comando consumió el stdin del loop)"
  exit 10
fi
if [ "$changed" -eq 0 ]; then
  # [t35-fix] NO salir: /sync puede necesitar provision/include/reload aunque
  # los ficheros ya estén idénticos (p.ej. tras un verify fallido con rollback).
  c_warn "   Sin cambios de ficheros ($n_rows/$n_manifest filas); continúo con /sync, reload y verify."
fi

c_hdr "2 · backup de los destinos afectados"
while IFS=$'\t' read -r src dst mode owner note <&3; do   # [t115]
  rsh "[ -f '$dst' ] && { mkdir -p \"$BK\$(dirname '$dst')\"; cp -a '$dst' \"$BK$dst\"; } || true"
  printf '   BACKUP    %s\n' "$dst"
done 3< <(manifest_rows)   # [t115]

c_hdr "2.1 · dirs de estado /sync (idempotente)"
rsh "install -d -m 0750 -o root -g www-data /etc/ara-x && install -d -m 0750 -o www-data -g www-data /var/lib/ara-x" \
  || { c_bad "   no se pudieron crear los dirs de /sync"; exit 12; }

c_hdr "3 · instalación (mv atómico dentro del mismo FS) + nginx -t + reload"
fail=0
while IFS=$'\t' read -r src dst mode owner note <&3; do   # [t115]
  b="$(basename "$src")"
  [ -f "$REPO_ROOT/$src" ] || { c_bad "   AUSENTE-LOCAL $src en fase de instalación"; fail=1; continue; }   # [t115]
  # [t112] BUG: se instalaba desde $STAGING SIEMPRE, pero staging solo tiene lo
  # que cambió. Un fichero no subido => install de un origen inexistente.
  if ! printf '%s' "$STAGED_LIST" | grep -qxF "$dst"; then
    printf '   NO-STAGED   %s (sin cambios: no se toca)\n' "$dst"; continue
  fi
  rsh "test -f '$STAGING/$b'" || { c_bad "   FATAL REMOTO: $STAGING/$b no existe pero $dst está en STAGED_LIST"; fail=1; continue; }   # [t115] antes era un -f LOCAL sobre una ruta REMOTA (siempre falso)
  rsh "install -m '$mode' -o '${owner%%:*}' -g '${owner##*:}' '$STAGING/$b' '$dst' && sha256sum '$dst' | cut -d' ' -f1" > /tmp/_ape_installed.sha 2>/dev/null \
    || { c_bad "   install falló: $dst"; fail=1; continue; }
  got="$(tail -n1 /tmp/_ape_installed.sha | tr -d '[:space:]')"
  want="$(sha_local "$REPO_ROOT/$src")"
  if [ "$got" != "$want" ]; then
    c_bad "   PARIDAD ROTA $dst (repo=$want remoto=$got)"; fail=1
  else
    printf '   INSTALADO   %s (sha %s… paridad OK)\n' "$dst" "${want:0:12}"
    n_installed=$((n_installed+1))
  fi
done 3< <(manifest_rows)   # [t115]
# [t114] recuento explícito: cuántas se instalaron de cuántas había que instalar
n_expected=$(printf '%s' "$STAGED_LIST" | grep -c . || true)
c_ok "   instaladas ${n_installed:-0} de ${n_expected} filas en STAGED_LIST"
if [ "${n_installed:-0}" -ne "$n_expected" ]; then
  c_bad "   DESCUADRE: esperaba $n_expected y se instalaron ${n_installed:-0}"
  fail=1
fi
if [ "$fail" -ne 0 ] || ! rsh "nginx -t" ; then
  c_bad "   nginx -t falló → ROLLBACK automático"
  "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes || c_bad "   ROLLBACK TAMBIÉN FALLÓ: intervención manual con $BK"
  exit 7
fi

# [t35] Provisionar estado de /sync (migración + key/artifact desde el
# Environment). Si falta la clave, NO falla el deploy: /sync quedará 503.
if [ -x "$DEPLOY_DIR/sync-provision.sh" ]; then
  if ! "$DEPLOY_DIR/sync-provision.sh" --apply; then
    c_bad "   sync-provision falló → ROLLBACK automático"
    "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes || true
    exit 13
  fi
fi

# [t35] Añadir `include snippets/prisma-ara-sync.conf;` al snippet público 443
# (idempotente; backup dentro del stamp para rollback).
if [ -x "$DEPLOY_DIR/sync-include.sh" ]; then
  if ! "$DEPLOY_DIR/sync-include.sh" "$STAMP" --apply; then
    c_bad "   sync-include falló → ROLLBACK automático"
    "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes || true
    exit 14
  fi
fi

# Revalidar tras provision/include antes del reload.
if ! rsh "nginx -t"; then
  c_bad "   nginx -t falló tras provision/include → ROLLBACK"
  "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes || true
  exit 15
fi
rsh "nginx -s reload" || { c_bad "   reload falló → ROLLBACK"; "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes; exit 8; }
c_ok "   desplegado y recargado"

# ── [2026-11-09] REINICIO DE SERVICIOS QUE NO SON NGINX ──────────────────────
# HUECO QUE ESTO CIERRA, medido: el manifiesto instala /opt/ape-jit/server.js,
# pero deploy.sh solo recargaba nginx. El proceso vivo seguia ejecutando el
# codigo ANTERIOR en memoria: el sha256 del fichero coincidia con el repo y el
# motor corria lo viejo. Es el mismo patron de mentira que el gate de paridad
# existe para impedir, solo que en la capa del proceso.
#
# REGLA DE ESTADO (no negociable): solo se reinicia lo que YA estaba activo.
# Si estaba parado se deja parado. Arrancar un servicio que el operador detuvo a
# proposito seria cambiar produccion sin que lo pidiera — justo lo que este
# pipeline existe para impedir.
restart_if_was_active() {
  _svc="$1"; _why="$2"
  [ -n "$_svc" ] || return 0
  _was="$(rsh "systemctl is-active '$_svc' 2>/dev/null || true" | tr -d '[:space:]')"
  if [ "$_was" != "active" ]; then
    c_warn "   $_svc NO estaba activo ('${_was:-desconocido}'): se deja como estaba, NO se arranca"
    return 0
  fi
  c_hdr "3b · reinicio $_svc ($_why)"
  if ! rsh "systemctl restart '$_svc'"; then
    c_bad "   restart de $_svc fallo → ROLLBACK"
    "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes || true
    exit 16
  fi
  _now="$(rsh "systemctl is-active '$_svc' 2>/dev/null || true" | tr -d '[:space:]')"
  if [ "$_now" != "active" ]; then
    c_bad "   $_svc no quedo activo tras el restart ('$_now') → ROLLBACK"
    "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes || true
    exit 17
  fi
  c_ok "   $_svc reiniciado y activo"
}

# unit de systemd nueva o cambiada -> daemon-reload antes de cualquier restart
case "$STAGED_LIST" in
  *ape-canary@.service*)
    rsh "systemctl daemon-reload" && c_ok "   daemon-reload (unit ape-canary@.service instalada)" ;;
esac
# el motor JIT solo si se instalo SU fichero
case "$STAGED_LIST" in
  *ape-jit/server.js*) restart_if_was_active ape-jit "server.js instalado" ;;
  *ape-jit/jit_*|*ape-jit/*.py|*ape-jit/*.sh)
    restart_if_was_active ape-jit "herramienta del JIT instalada" ;;
esac
# el worker del canary lo invoca el timer: toma el fichero nuevo sin reinicio
case "$STAGED_LIST" in
  *ape-pulse-canary-worker.sh*)
    c_ok "   worker del canary instalado: el timer lo relanza, sin reinicio" ;;
esac


c_hdr "4 · verificación (smoke)"
if ! "$DEPLOY_DIR/verify.sh"; then
  c_bad "   verify.sh falló → ROLLBACK automático"
  "$DEPLOY_DIR/rollback.sh" "$STAMP" --yes
  exit 9
fi
c_hdr "RESUMEN DEPLOY"
printf '   ficheros instalados: %d\n   backup: %s\n   rollback: %s/rollback.sh %s --yes\n' "$changed" "$BK" "$DEPLOY_DIR" "$STAMP"
c_ok "   DEPLOY OK"
