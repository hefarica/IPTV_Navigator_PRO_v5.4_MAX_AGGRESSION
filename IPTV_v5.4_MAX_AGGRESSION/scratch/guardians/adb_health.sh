#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# adb_health.sh — ADB Possession Watchdog (HOST-side) v1.0 — ONN 4K
# ═══════════════════════════════════════════════════════════════════════════
# CORRE EN LA PC (Git Bash), que es el host ADB del ONN por LAN.
# Adaptado al entorno real (NO los placeholders genéricos del doc):
#   · DEV real = 192.168.10.28:5555  (onn. 4K Streaming Box)
#   · Sentinel on-device = /data/local/tmp/ape-sentinel.sh  (lock ape-ram-guardian.lock)
#   · Comandos del sentinel: daemon | defaults | status | stop
#
# QUÉ HACE (lo que el sentinel on-device NO puede hacerse a sí mismo):
#   1. Mantiene viva la conexión ADB PC↔ONN (reconexión escalada L1→L3)
#   2. INSTANCIA ÚNICA del sentinel (mata duplicados — bug recurrente de 2+ daemons)
#   3. En reboot (uptime<120s) → re-aplica defaults de imagen + re-lanza el sentinel
#   4. Log local en la PC (el heartbeat al VPS ya lo manda el sentinel)
#
# NO toca el VPS. NO bloquea nada. Idempotente: 1 ciclo por invocación.
# Uso:  adb_health.sh [ip:port]      (default 192.168.10.28:5555)
# Cron PC: Task Scheduler cada 1 min, o loop `while true; do adb_health.sh; sleep 30; done`
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

DEV="${1:-192.168.10.28:5555}"
SENTINEL_REMOTE="/data/local/tmp/ape-sentinel.sh"
SENTINEL_LOCK="/data/local/tmp/ape-ram-guardian.lock"
LOGDIR="$HOME/.ape"
LOG="$LOGDIR/adb_health.log"
mkdir -p "$LOGDIR" 2>/dev/null
log() { echo "[$(date -Iseconds 2>/dev/null || date)] [$DEV] $*" | tee -a "$LOG"; }

adbsh() { adb -s "$DEV" shell "$@" 2>/dev/null | tr -d '\r'; }

# ── FASE 1: conexión ADB + recuperación escalada ────────────────────────────
STATE=$(adb -s "$DEV" get-state 2>/dev/null || echo offline)
if [ "$STATE" != "device" ]; then
  log "ADB down (state=$STATE) → L1 connect"
  adb connect "$DEV" >/dev/null 2>&1; sleep 1
  STATE=$(adb -s "$DEV" get-state 2>/dev/null || echo offline)
  if [ "$STATE" != "device" ]; then
    log "L2 kill-server + start-server"
    adb kill-server >/dev/null 2>&1; sleep 1
    adb start-server >/dev/null 2>&1; sleep 2
    adb connect "$DEV" >/dev/null 2>&1; sleep 1
    STATE=$(adb -s "$DEV" get-state 2>/dev/null || echo offline)
  fi
  if [ "$STATE" != "device" ]; then
    log "L3 backoff exponencial"
    for i in 1 2 3; do
      sleep $((i * 2))
      adb connect "$DEV" >/dev/null 2>&1
      STATE=$(adb -s "$DEV" get-state 2>/dev/null || echo offline)
      [ "$STATE" = "device" ] && break
    done
  fi
fi
if [ "$STATE" != "device" ]; then
  log "DEAD: ONN inalcanzable por ADB tras L1-L3"
  exit 1
fi

# ── FASE 2: detección de reboot ─────────────────────────────────────────────
UP=$(adbsh "cat /proc/uptime | cut -d. -f1")
UP=${UP:-9999}
REBOOTED=0
[ "$UP" -lt 120 ] 2>/dev/null && REBOOTED=1

# ── FASE 3: instancia única del sentinel (mata duplicados, re-lanza si falta) ─
# Lanzador detach-limpio (</dev/null en ambos lados → adb shell retorna, no deja wrapper colgado)
launch_sentinel() {
  adb -s "$DEV" shell "rm -f $SENTINEL_LOCK" </dev/null >/dev/null 2>&1
  adb -s "$DEV" shell "setsid sh $SENTINEL_REMOTE daemon </dev/null >/dev/null 2>&1 &" </dev/null >/dev/null 2>&1
}
kill9() { adb -s "$DEV" shell "kill -9 $1" </dev/null >/dev/null 2>&1; }   # SIGTERM lo ignora sh; -9 es seguro
count_pids() { echo "$1" | grep -c '[0-9]'; }   # grep -c imprime UN entero limpio; SIN '|| echo 0' (causaba "0\n0")

PS=$(adb -s "$DEV" shell "ps -A -o PID,PPID,ARGS" 2>/dev/null | tr -d '\r')
# Solo daemons REALES (PPID=1, detached). Ignora hijos transitorios (subshells del
# loop del sentinel, PPID=PID-del-sentinel, edad ~0s) — esos NO son duplicados.
PIDS=$(echo "$PS" | grep "ape-sentinel.sh daemon" | grep -v grep | awk '$2==1 {print $1}')
NP=$(count_pids "$PIDS"); NP=${NP:-0}

if [ "$NP" -eq 0 ] || [ "$REBOOTED" -eq 1 ]; then
  if [ "$REBOOTED" -eq 1 ]; then
    log "REBOOT detectado (uptime=${UP}s) → re-aplicando defaults de imagen"
    adbsh "sh $SENTINEL_REMOTE defaults"
    for p in $PIDS; do [ -n "$p" ] && kill9 "$p"; done
  fi
  log "Sentinel ausente (np=$NP) → lanzando daemon (detach limpio)"
  launch_sentinel
  sleep 2
  PS=$(adb -s "$DEV" shell "ps -A -o PID,ARGS" 2>/dev/null | tr -d '\r')
  PIDS=$(echo "$PS" | grep "ape-sentinel.sh daemon" | grep -v grep | awk '{print $1}')
  NP=$(count_pids "$PIDS"); NP=${NP:-0}
elif [ "$NP" -gt 1 ]; then
  KEEP=$(echo "$PIDS" | head -1)
  log "Sentinel DUPLICADO ($NP instancias) → conservo $KEEP, mato el resto"
  for p in $PIDS; do
    [ -n "$p" ] && [ "$p" != "$KEEP" ] && { kill9 "$p"; log "  kill -9 $p"; }
  done
  PIDS="$KEEP"
  NP=1
fi

# ── FASE 4: pq-guardian RETIRADO (2026-05-21) ───────────────────────────────
# pq-guardian peleaba con el sentinel (peak_luminance=1000/hdr_conversion=0 vs el
# SSOT del sentinel 8000/1). Se retiró; el sentinel ya cubre PQ con los valores
# correctos (IMAGE_DEFAULTS: ai_sr=3, peak=8000, hdr=1). Aquí lo mantenemos muerto
# por si algún lanzador intenta resucitarlo.
PQPIDS=$(adb -s "$DEV" shell "ps -A -o PID,ARGS" 2>/dev/null | tr -d '\r' | grep "ape-pq-guardian.sh" | grep -v grep | awk '{print $1}')
for p in $PQPIDS; do
  [ -n "$p" ] && { kill9 "$p"; log "RETIRE: pq-guardian pid $p eliminado -9 (retirado, peleaba con sentinel)"; }
done

log "OK state=$STATE uptime=${UP}s rebooted=$REBOOTED sentinel_pids=[$(echo $PIDS | tr '\n' ' ')] count=$NP"
exit 0
