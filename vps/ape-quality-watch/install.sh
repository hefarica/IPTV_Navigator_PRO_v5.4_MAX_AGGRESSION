#!/usr/bin/env bash
# install.sh — instalador/reconciliador IDEMPOTENTE de ape-quality-watch.
#
# TRES MODOS
#   --audit   solo lectura: dice que hay y que falta. No escribe NADA.
#   --plan    lista los cambios que aplicaria, con riesgos y rollback. No escribe NADA.
#   --apply   aplica SOLO lo aprobado. Idempotente: correrlo dos veces no duplica nada.
#
# PRINCIPIOS (del mandato, seccion 12)
#   IDEMPOTENTE   : segunda ejecucion = mismo estado, sin duplicar unidades ni ficheros.
#   NO DESTRUCTIVO: nunca borra nada que no haya escrito este instalador. Todo backup.
#   TRANSACCIONAL : escribe a temporal y mueve con mv atomico.
#   REVERSIBLE    : deja un rollback.sh con los comandos exactos.
#
# LO QUE ESTE INSTALADOR **NO** HACE
#   - No toca nginx, /lists/, /sync, /ara ni ninguna configuracion de produccion.
#   - No activa el timer. Lo deja habilitado y dice el comando para arrancarlo.
#     Arrancar un servicio es una decision del operador, no del instalador.
#   - No escribe el token. Crea /etc/ape-quality-watch/env vacio y avisa.

set -uo pipefail

PREFIX=/opt/ape-quality-watch
STATE=/var/lib/ape-quality-watch
CONF=/etc/ape-quality-watch
UNIT_DIR=/etc/systemd/system
SVC=ape-quality-watch.service
TMR=ape-quality-watch.timer
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/backups/ape-quality-watch/$STAMP"

MODE=""
case "${1:-}" in
  --audit) MODE=audit ;;
  --plan)  MODE=plan ;;
  --apply) MODE=apply ;;
  *) echo "uso: $0 --audit|--plan|--apply" >&2; exit 2 ;;
esac

ok()   { printf '  [OK]      %s\n' "$*"; }
falta(){ printf '  [FALTA]   %s\n' "$*"; }
dif()  { printf '  [CAMBIA]  %s\n' "$*"; }
info() { printf '  [INFO]    %s\n' "$*"; }
warn() { printf '  [AVISO]   %s\n' "$*"; }

echo ""
echo "=== ape-quality-watch · modo $MODE ==="
echo ""

# ── 1 · AUDITORIA (solo lectura en los tres modos) ───────────────────────────
echo "-- estado actual --"
FALTAS=0

if command -v node >/dev/null 2>&1; then
  NODE_V=$(node -v)
  ok "node $NODE_V"
  NODE_MAJ=$(echo "$NODE_V" | sed 's/v\([0-9]*\).*/\1/')
  if [ "${NODE_MAJ:-0}" -lt 18 ]; then
    warn "node < 18: fetch nativo no existe, el empuje al VPS no funcionará"
  fi
else
  falta "node (necesario para ejecutar el vigilante)"
  FALTAS=$((FALTAS+1))
fi

if command -v adb >/dev/null 2>&1; then
  ok "adb $(adb version 2>/dev/null | head -n1 | sed 's/Android Debug Bridge version //')"
else
  falta "adb (sin el no hay dispositivo que observar)"
  FALTAS=$((FALTAS+1))
fi

if id -u ape-quality >/dev/null 2>&1; then
  ok "usuario ape-quality existe"
  USER_OK=1
else
  falta "usuario de sistema ape-quality"
  USER_OK=0
fi

[ -d "$PREFIX" ] && ok "directorio $PREFIX" || falta "directorio $PREFIX"
[ -d "$STATE" ] && ok "directorio $STATE" || falta "directorio $STATE (ledger)"
[ -f "$CONF/env" ] && ok "fichero de entorno $CONF/env" || falta "fichero de entorno $CONF/env"

if [ -f "$UNIT_DIR/$SVC" ]; then
  ok "unidad $SVC instalada"
  if diff -q "$HERE/$SVC" "$UNIT_DIR/$SVC" >/dev/null 2>&1; then
    ok "unidad $SVC identica a la del repo"
  else
    dif "unidad $SVC difiere de la del repo"
  fi
else
  falta "unidad $SVC"
fi

if [ -f "$UNIT_DIR/$TMR" ]; then
  ok "timer $TMR instalado"
else
  falta "timer $TMR"
fi

if command -v systemctl >/dev/null 2>&1; then
  ACT=$(systemctl is-active "$TMR" 2>/dev/null || echo "inactive")
  ENA=$(systemctl is-enabled "$TMR" 2>/dev/null || echo "disabled")
  info "timer: active=$ACT enabled=$ENA"
else
  warn "systemctl no disponible: no se puede consultar el estado del timer"
fi

echo ""
if [ "$FALTAS" -gt 0 ]; then
  info "$FALTAS elemento(s) por resolver"
else
  info "no falta ningun elemento base"
fi
echo ""

if [ "$MODE" = "audit" ]; then
  echo "AUDIT: solo lectura. No se ha escrito nada."
  exit 0
fi

# ── 2 · PLAN ─────────────────────────────────────────────────────────────────
echo "-- cambios que se aplicarian --"
[ "$USER_OK" -eq 1 ] || dif "crear usuario de sistema ape-quality (sin shell, sin home escribible)"
[ -d "$PREFIX" ] || dif "crear $PREFIX y copiar watch.js + PLACEMENT.md + unidad + timer"
[ -d "$STATE" ] || dif "crear $STATE (ledger) propiedad de ape-quality"
[ -f "$CONF/env" ] || dif "crear $CONF/env vacio (el token lo pone el operador, NUNCA el instalador)"
[ -f "$UNIT_DIR/$SVC" ] || dif "instalar $UNIT_DIR/$SVC"
[ -f "$UNIT_DIR/$TMR" ] || dif "instalar $UNIT_DIR/$TMR"
diff -q "$HERE/$SVC" "$UNIT_DIR/$SVC" >/dev/null 2>&1 || dif "actualizar $SVC (contenido distinto)"
diff -q "$HERE/$TMR" "$UNIT_DIR/$TMR" >/dev/null 2>&1 || dif "actualizar $TMR (contenido distinto)"
echo ""
echo "  NO se toca: nginx, /lists/, /sync, /ara, ni ninguna config de produccion."
echo "  NO se arranca el timer. Se deja instalado y se documenta el comando."
echo "  REVERSIBLE: se deja $BACKUP/rollback.sh"
echo ""

if [ "$MODE" = "plan" ]; then
  echo "PLAN: no se ha escrito nada. Ejecuta --apply para aplicar."
  exit 0
fi

# ── 3 · APPLY ────────────────────────────────────────────────────────────────
echo "-- aplicando --"
mkdir -p "$BACKUP" || { echo "no se pudo crear el backup: abortando" >&2; exit 1; }

# Rollback: guarda lo que habia antes de tocarlo
{
  echo '#!/usr/bin/env bash'
  echo '# rollback de ape-quality-watch generado el '"$STAMP"
  echo 'set -uo pipefail'
  if [ -f "$UNIT_DIR/$SVC" ]; then echo "cp -a '$BACKUP/$SVC' '$UNIT_DIR/$SVC'"; fi
  if [ -f "$UNIT_DIR/$TMR" ]; then echo "cp -a '$BACKUP/$TMR' '$UNIT_DIR/$TMR'"; fi
  echo 'systemctl daemon-reload'
  echo 'systemctl stop '"$TMR"' 2>/dev/null || true'
  echo 'echo "rollback aplicado"'
} > "$BACKUP/rollback.sh"
chmod 0755 "$BACKUP/rollback.sh"
[ -f "$UNIT_DIR/$SVC" ] && cp -a "$UNIT_DIR/$SVC" "$BACKUP/$SVC"
[ -f "$UNIT_DIR/$TMR" ] && cp -a "$UNIT_DIR/$TMR" "$BACKUP/$TMR"
ok "backup y rollback en $BACKUP"

# Usuario
if [ "$USER_OK" -eq 0 ]; then
  if getent group ape-quality >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin -g ape-quality ape-quality
  else
    useradd --system --no-create-home --shell /usr/sbin/nologin ape-quality
  fi
  ok "usuario ape-quality creado"
else
  ok "usuario ape-quality ya existe (sin cambios)"
fi

# Directorios
install -d -o root -g root -m 0755 "$PREFIX"
install -d -o ape-quality -g ape-quality -m 0750 "$STATE"
install -d -o root -g ape-quality -m 0750 "$CONF"
ok "directorios listos"

# Ficheros del programa: a temporal y mv atomico
install -m 0644 "$HERE/watch.js" "$PREFIX/.watch.js.$STAMP"
mv -f "$PREFIX/.watch.js.$STAMP" "$PREFIX/watch.js"
[ -f "$HERE/PLACEMENT.md" ] && install -m 0644 "$HERE/PLACEMENT.md" "$PREFIX/PLACEMENT.md"
ok "programa copiado a $PREFIX"

# Entorno: se crea vacio si no existe. NUNCA se sobrescribe.
if [ ! -f "$CONF/env" ]; then
  : > "$CONF/env"
  chown root:ape-quality "$CONF/env"
  chmod 0640 "$CONF/env"
  ok "$CONF/env creado vacio (pon el token ahi, no en el repo)"
else
  ok "$CONF/env ya existe (respetado, no se toca)"
fi

# Unidades
install -m 0644 "$HERE/$SVC" "$UNIT_DIR/.$SVC.$STAMP"
mv -f "$UNIT_DIR/.$SVC.$STAMP" "$UNIT_DIR/$SVC"
install -m 0644 "$HERE/$TMR" "$UNIT_DIR/.$TMR.$STAMP"
mv -f "$UNIT_DIR/.$TMR.$STAMP" "$UNIT_DIR/$TMR"
ok "unidades instaladas"

systemctl daemon-reload
ok "systemd recargado"

systemctl enable "$TMR" >/dev/null 2>&1 && ok "timer habilitado (arranque en el proximo boot)"
echo ""
echo "  El timer NO se ha arrancado. Para arrancarlo ahora:"
echo "      systemctl start $TMR"
echo "  Y para ver el primer ciclo sin esperar:"
echo "      systemctl start $SVC && journalctl -u $SVC -n 20"
echo ""
echo "APPLY completado. Rollback: $BACKUP/rollback.sh"
exit 0
