#!/usr/bin/env bash
# ape-pq-watchdog.sh — vigilante del PLANO DE CALIDAD del VPS
#
# POR QUE EXISTE
#   El crontab de este VPS llama a este fichero cada 5 minutos:
#       */5 * * * * /opt/netshield/ape-pq-watchdog.sh
#   y el fichero NO EXISTIA. El cron fallaba en silencio cada 5 min y no habia
#   ningun vigilante del plano de calidad: un fallo real pasaba inadvertido.
#
# QUE VIGILA (todo medible en este host)
#   1. Frescura de ara_heartbeats  — si un device deja de reportar, aqui se ve
#   2. Volumen de policy_deltas    — si el plano de mejora deja de moverse
#   3. Ultima corrida de ape-quality-sync (systemd)
#   4. Que php y la BD respondan   — si la BD no abre, no hay plano
#
# QUE **NO** HACE, Y SE DICE
#   NO toca el PQ del SoC del device. Medido en el ONN 4K (Amlogic S905Y4,
#   Android 14): las claves aipq/aisr son inertes — no hay receptor
#   (pm query-receivers -> No receivers found) ni nodos VPP
#   (/sys/class/amvideo y /sys/class/amvecm NO EXISTEN). Escribirlas no cambia
#   ni un pixel. Este watchdog vigila el PLANO DEL VPS, no finge gobernar un
#   hardware que no expone esa palanca.
#
# SALIDA
#   exit 0 = todo dentro de rango
#   exit 1 = algo fuera de rango (el cron lo registra)
#   Log append en /var/log/ara/pq-watchdog.log
#
# Instalado por: sesion 2026-11-09 (barrido del VPS).

set -uo pipefail

DB=/opt/netshield/data/conviva.db
SYNC_UNIT=ape-quality-sync
LOG=/var/log/ara/pq-watchdog.log
STALE_HB_SEC=$((36 * 3600))      # un device sin heartbeat en 36 h es stale
MIN_DELTAS=1                     # con 0 deltas el plano de mejora esta muerto
NOW=$(date -u +%s)
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log() { printf '%s %s\n' "$TS" "$*" >> "$LOG" 2>/dev/null || true; }

fallos=0
mal() { log "FALLO $*"; fallos=$((fallos+1)); }
bien() { log "ok    $*"; }

# ── 1. la BD abre y responde ─────────────────────────────────────────────────
if [ ! -r "$DB" ]; then
  mal "BD ilegible: $DB"
else
  # MEDIDO 2026-11-09: este VPS NO tiene el binario sqlite3. Python 3.12.3 SI
  # esta y trae sqlite3 en la stdlib, asi que la BD se consulta por python3.
  # Antes el watchdog decia "no se puede vigilar la BD" y no vigilaba nada.
  if ! command -v python3 >/dev/null 2>&1; then
    mal "python3 no disponible: no se puede vigilar la BD"
  else
    read -r hb n_dev deltas <<< "$(python3 - "$DB" <<'PYEOF'
import sqlite3, sys
p = sys.argv[1]
try:
    c = sqlite3.connect('file:%s?mode=ro' % p, uri=True)
    hb = c.execute("SELECT COALESCE(MAX(last_seen),0) FROM ara_heartbeats").fetchone()[0] or 0
    nd = c.execute("SELECT COUNT(DISTINCT device_id) FROM ara_heartbeats").fetchone()[0] or 0
    dl = c.execute("SELECT COUNT(*) FROM policy_deltas").fetchone()[0] or 0
    print(hb, nd, dl)
    c.close()
except Exception as e:
    print("-1 -1 -1")
PYEOF
)"
    hb=${hb:--1}; n_dev=${n_dev:--1}; deltas=${deltas:--1}
    if [ "$hb" = "-1" ]; then
      mal "BD no abre o no tiene las tablas esperadas: $DB"
    else
      bien "BD responde"
      if [ "$hb" -le 0 ]; then
        mal "ara_heartbeats vacia o sin last_seen (devices=$n_dev)"
      else
        edad=$((NOW - hb))
        if [ "$edad" -gt "$STALE_HB_SEC" ]; then
          mal "heartbeat mas reciente hace ${edad}s (>${STALE_HB_SEC}s) · devices=$n_dev"
        else
          bien "heartbeat fresco hace ${edad}s · devices=$n_dev"
        fi
      fi
      if [ "$deltas" -lt "$MIN_DELTAS" ]; then
        mal "policy_deltas=$deltas: el plano de mejora no tiene historial"
      else
        bien "policy_deltas=$deltas"
      fi
    fi
  fi
fi

# ── 4. ultima corrida de ape-quality-sync ────────────────────────────────────
if command -v systemctl >/dev/null 2>&1; then
  st=$(systemctl is-active "$SYNC_UNIT" 2>/dev/null || true)
  res=$(systemctl show -p Result --value "$SYNC_UNIT" 2>/dev/null || true)
  # oneshot: 'inactive' + 'success' es correcto; 'failed' NO
  if [ "$res" = "failed" ]; then
    mal "$SYNC_UNIT termino en failed"
  else
    bien "$SYNC_UNIT state=$st result=${res:-?}"
  fi
fi

# ── 5. que el cron no se coma el resultado ───────────────────────────────────
if [ "$fallos" -eq 0 ]; then
  log "RESUMEN ok (0 fallos)"
  exit 0
fi
log "RESUMEN $fallos fallo(s)"
exit 1
