#!/usr/bin/env bash
# ============================================================================
# adb-keepalive.sh — watchdog 1Hz IDEMPOTENTE del ADB al Firestick.
# ----------------------------------------------------------------------------
# Cada segundo:
#   - si ADB esta VIVO (get-state == device) -> NO hace nada (idempotente).
#   - si lo toma CAIDO -> `adb connect` inmediato; si reconecta -> KEYCODE_WAKEUP.
# El get-state cada 1s ademas mantiene viva la conexion (anti idle-timeout).
#
# Corre en el HOST LAN con ADB al device (NO el VPS: NAT + WG muerto no lo
# alcanzan; el wake debe originarse en la LAN). Complementa adb-conviva-push.sh
# (mantiene el device vivo para que la telemetria URL-2 nunca se corte).
#
# LIMITE HONESTO: si el puerto ADB-red (5555) esta REFUSED (deep-doze/reboot del
# Fire TV), `adb connect` no puede reabrirlo (chicken-and-egg). El watchdog
# RECONECTA en cuanto el device reabra 5555 (al despertar/interactuar). Reabrir
# un 5555 totalmente cerrado requiere USB `adb tcpip 5555` o un boton del control.
#
# Uso:  ./adb-keepalive.sh [device-ip:5555]
# Env:  ADB_PATH (default: adb en PATH, luego /c/Android/platform-tools/adb)
# ============================================================================
set -u
DEV="${1:-auto}"                              # "auto" = autodescubrir por mDNS (resiliente a cambios IP/puerto)
ADB="${ADB_PATH:-adb}"
command -v "$ADB" >/dev/null 2>&1 || ADB="/c/Android/platform-tools/adb"

# --- autodescubrir el device por mDNS (anuncia _adb._tcp / _adb-tls-connect._tcp) -------------
# Resuelve el problema real: el Fire TV cambia de IP (DHCP) y/o pasa a Depuracion Inalambrica
# (puerto aleatorio != 5555). mDNS lo encuentra sin importar IP/puerto.
discover() {
  "$ADB" mdns services 2>/dev/null \
    | grep -E '_adb(-tls-connect)?\._tcp' \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+' | head -1
}

echo "[keepalive] watchdog 1Hz (autodescubre por mDNS si DEV=auto; idempotente si vivo)" >&2
down_prev=0
while true; do
  # si no hay target o el actual esta caido, intentar autodescubrir
  if [ "$DEV" = "auto" ] || [ "$("$ADB" -s "$DEV" get-state 2>/dev/null)" != "device" ]; then
    found="$(discover)"
    if [ -n "$found" ] && [ "$found" != "$DEV" ]; then
      echo "[keepalive] $(date +%H:%M:%S) descubierto por mDNS: $found" >&2
      DEV="$found"
    fi
  fi
  st="$("$ADB" -s "$DEV" get-state 2>/dev/null)"
  if [ "$st" = "device" ]; then
    if [ "$down_prev" = "1" ]; then echo "[keepalive] $(date +%H:%M:%S) ADB OK ($DEV)" >&2; fi
    down_prev=0
  else
    [ "$DEV" != "auto" ] && "$ADB" connect "$DEV" >/dev/null 2>&1
    if [ "$("$ADB" -s "$DEV" get-state 2>/dev/null)" = "device" ]; then
      "$ADB" -s "$DEV" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1
      echo "[keepalive] $(date +%H:%M:%S) reconectado + wake ($DEV)" >&2
      down_prev=0
    else
      if [ "$down_prev" = "0" ]; then echo "[keepalive] $(date +%H:%M:%S) device no alcanzable (mDNS sin resultado) — reintentando 1Hz" >&2; fi
      down_prev=1
    fi
  fi
  sleep 1
done
