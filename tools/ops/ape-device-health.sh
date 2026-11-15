#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-device-health.sh   (fuente: tools/ops/ape-device-health.sh)
#
# GATE DEL DISPOSITIVO — las fallas que NO se ven desde el VPS.
#
# POR QUE EXISTE
#   El 2026-11-14 el VPS decia "vigilante OK · 0 fallos" mientras en el televisor:
#     · el agente relanzaba el shim cada 5 s en bucle (ShimBridge.running sin refrescar)
#     · el badge llevaba 16 minutos pegado sobre YouTube TV (age_s nunca re-verificado)
#     · la Activity del badge nacia en primer plano y sacaba al operador de OTT
#   Nada de eso es visible desde el servidor: hay que mirar logcat y dumpsys.
#   Este script cierra esa deuda.
#
# QUE COMPRUEBA
#   [1] versionCode instalado (que sea el que se cree)
#   [2] los 4 servicios vivos (AgentService, ProxyService, CaptureWatchdog, SessionTap)
#   [3] MainActivity NO en la pila (LEY #1: ARA no aparece sola)
#   [4] BUCLE del shim: cuantas veces se relanzo en la ventana de log
#   [5] badge coherente: si esta montado, tiene que haber OTT reciente segun el VPS
#   [6] el shim responde /health
#   [7] sin Activity del badge en la pila
#
# USO
#   bash tools/ops/ape-device-health.sh                 # adb por defecto
#   ADB_SERIAL=192.168.1.3:5555 bash tools/ops/ape-device-health.sh
#   bash tools/ops/ape-device-health.sh --json
#
# exit 0 = sano · exit 1 = hay algo roto AHORA
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SERIAL="${ADB_SERIAL:-192.168.1.3:5555}"
PKG="com.ape.crystalagent"
OTS="studio.scillarium.ottnavigator"
VPS="${APE_VPS:-https://iptv-ape.duckdns.org}"
JSON=0
[ "${1:-}" = "--json" ] && JSON=1

PASS=0; FAIL=0; WARN=0; rows=""
ok()   { PASS=$((PASS+1)); rows="${rows}{\"check\":\"$1\",\"status\":\"PASS\",\"detail\":\"$2\"},"; }
bad()  { FAIL=$((FAIL+1)); rows="${rows}{\"check\":\"$1\",\"status\":\"FAIL\",\"detail\":\"$2\"},"; }
warn() { WARN=$((WARN+1)); rows="${rows}{\"check\":\"$1\",\"status\":\"WARN\",\"detail\":\"$2\"},"; }

# El binario de adb: por defecto el del PATH. Desde WSL se puede apuntar al de
# Windows con ADB=adb.exe (requiere que el device sea alcanzable por red) o dejar
# que se use el adb nativo de Linux. Sin ADB explicito, se usa el del PATH.
ADB_BIN="${ADB:-adb}"
adb_() { "$ADB_BIN" -s "$SERIAL" shell "$@" 2>/dev/null | tr -d '\r'; }

if ! "$ADB_BIN" -s "$SERIAL" get-state >/dev/null 2>&1; then
  if [ "$JSON" -eq 1 ]; then echo "{\"verdict\":\"SIN_DEVICE\",\"serial\":\"$SERIAL\"}"; else echo "no hay device en $SERIAL"; fi
  exit 1
fi

# ── [1] versionCode ─────────────────────────────────────────────────────────
VER=$(adb_ "dumpsys package $PKG | grep -oE 'versionCode=[0-9]+' | head -1 | cut -d= -f2")
[ -n "$VER" ] && ok "versionCode" "$VER" || bad "versionCode" "no se pudo leer"

# ── [2] los 4 servicios ─────────────────────────────────────────────────────
SVCS=$(adb_ "dumpsys activity services $PKG | grep -c ServiceRecord")
if [ "${SVCS:-0}" -ge 4 ]; then ok "servicios" "$SVCS vivos (esperados 4)"
elif [ "${SVCS:-0}" -ge 2 ]; then warn "servicios" "$SVCS vivos (esperados 4)"
else bad "servicios" "$SVCS vivos (esperados 4)"; fi

# ── [3] LEY #1: MainActivity no debe estar en la pila ───────────────────────
MAIN=$(adb_ "dumpsys activity activities | grep -c '$PKG/.MainActivity'")
FOCO=$(adb_ "dumpsys activity activities | grep mFocusedApp | head -1 | sed 's/.*u0 //;s/ .*//' | cut -d/ -f1")
if [ "${MAIN:-0}" -eq 0 ]; then ok "sin-MainActivity" "0 en la pila · foco=$FOCO"
else bad "sin-MainActivity" "$MAIN en la pila · foco=$FOCO (LEY #1 violada)"; fi

# ── [4] bucle del shim ──────────────────────────────────────────────────────
# Cada relanzamiento deja una linea. Mas de 3 en 1200 lineas de log = bucle.
REL=$(adb_ "logcat -d -t 1200 | grep -c 'shim realmente caido'" || echo 0)
REL=$(printf '%s' "$REL" | tr -dc '0-9'); REL=${REL:-0}
if [ "$REL" -eq 0 ]; then ok "shim-sin-bucle" "0 relanzamientos"
elif [ "$REL" -le 3 ]; then warn "shim-sin-bucle" "$REL relanzamientos (vigilar)"
else bad "shim-sin-bucle" "$REL relanzamientos en la ventana: BUCLE"; fi

# ── [5] badge coherente con OTT ─────────────────────────────────────────────
BADGE=$(adb_ "dumpsys window windows | grep -c UpscaleBadge")
AUDIO=$(adb_ "dumpsys audio | grep -c state:started")
AGE=$(curl -sk -m 12 "$VPS/prisma/api/ape-last-channel.php" 2>/dev/null \
      | grep -oE '"age_s":[0-9]+' | cut -d: -f2)
AGE=${AGE:--1}
if [ "${BADGE:-0}" -gt 0 ]; then
  if [ "$AGE" -ge 0 ] && [ "$AGE" -le 120 ]; then
    ok "badge-coherente" "montado y OTT reciente (age_s=$AGE)"
  else
    bad "badge-coherente" "MONTADO sin OTT reciente (age_s=$AGE, audio=$AUDIO)"
  fi
else
  if [ "$AUDIO" -gt 0 ] && { [ "$AGE" -gt 120 ] || [ "$AGE" -lt 0 ]; }; then
    ok "badge-coherente" "sin badge y OTT no reciente (age_s=$AGE, audio de otra app)"
  else
    ok "badge-coherente" "sin badge (audio=$AUDIO age_s=$AGE)"
  fi
fi

# ── [6] el shim responde ────────────────────────────────────────────────────
PORT=$(adb_ "cat /storage/emulated/0/Android/data/$PKG/files/port.txt | tr -dc '0-9'")
if [ -n "$PORT" ]; then
  H=$(adb_ "printf 'GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n' | timeout 5 toybox nc 127.0.0.1 $PORT 2>/dev/null | tail -1")
  if printf '%s' "$H" | grep -q '"ok":true'; then ok "shim-health" "puerto $PORT responde ok:true"
  else bad "shim-health" "puerto $PORT no responde ok:true"; fi
else
  warn "shim-health" "sin port.txt (el shim puede no haber arrancado)"
fi

# ── [7] Activity del badge en la pila ───────────────────────────────────────
UBA=$(adb_ "dumpsys activity activities | grep -c 'UpscaleBadgeActivity'")
if [ "${UBA:-0}" -eq 0 ]; then ok "badge-sin-Activity" "0 en la pila"
else bad "badge-sin-Activity" "$UBA en la pila: el overlay vuelve por Activity"; fi

rows="[${rows%,}]"
verdict="PASS"; [ "$FAIL" -gt 0 ] && verdict="FAIL"
[ "$FAIL" -eq 0 ] && [ "$WARN" -gt 0 ] && verdict="WARN"

if [ "$JSON" -eq 1 ]; then
  printf '{"verdict":"%s","serial":"%s","version":"%s","pass":%d,"warn":%d,"fail":%d,"checks":%s}\n' \
    "$verdict" "$SERIAL" "${VER:-?}" "$PASS" "$WARN" "$FAIL" "$rows"
else
  # OJO: NO se puede trocear el JSON por comas (los `detail` llevan comas dentro).
  # Se extraen los tres campos por separado con grep -o y se numeran las lineas.
  printf '%s' "$rows" | grep -o '"check":"[^"]*"' | sed 's/"check":"//;s/"$//' > /tmp/_dc.$$
  printf '%s' "$rows" | grep -o '"status":"[^"]*"' | sed 's/"status":"//;s/"$//' > /tmp/_ds.$$
  printf '%s' "$rows" | grep -o '"detail":"[^"]*"' | sed 's/"detail":"//;s/"$//' > /tmp/_dd.$$
  paste -d'\t' /tmp/_dc.$$ /tmp/_ds.$$ /tmp/_dd.$$ | awk -F'\t' '{printf "  %-20s %-5s %s\n", $1, $2, $3}'
  rm -f /tmp/_dc.$$ /tmp/_ds.$$ /tmp/_dd.$$
  echo "[device-gate] VERDICT=$verdict · pass=$PASS warn=$WARN fail=$FAIL · v${VER:-?} en $SERIAL"
fi
[ "$FAIL" -gt 0 ] && exit 1
exit 0
