#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# APE Crystal Agent (aplicador puro device-keyed) — instalación + permiso + provisión.
# Uso:  sh install.sh <device> <TOKEN> [vps_url] [dev_id] [apk_path]
#   ej: sh install.sh 10.200.0.3:5555 b2ad...c4 https://iptv-ape.duckdns.org firestick-cali \
#         app/build/outputs/apk/release/app-release.apk
#
# Concepción: el daemon NO observa (no READ_LOGS). Solo aplica device_settings que el VPS le
# manda por el bus SSE (device-keyed). El token va por ARCHIVO 0600, nunca en la command-line.
# ──────────────────────────────────────────────────────────────────────────
set -eu
DEV="${1:?uso: sh install.sh <device> <TOKEN> [vps] [dev_id] [apk]}"
TOKEN="${2:?TOKEN requerido (ape-cmd-push.sh enroll <dev> lo imprime)}"
VPS="${3:-https://iptv-ape.duckdns.org}"
DEVID="${4:-firestick-cali}"
APK="${5:-app/build/outputs/apk/release/app-release.apk}"
PKG="com.ape.crystalagent"

echo "== 1) instalar APK =="
adb -s "$DEV" install -r "$APK"

echo "== 2) permiso (solo WRITE_SECURE_SETTINGS; ya NO se usa READ_LOGS) =="
adb -s "$DEV" shell pm grant "$PKG" android.permission.WRITE_SECURE_SETTINGS \
  || echo "WARN: WRITE_SECURE_SETTINGS no grant (los settings no se aplicarán)"

echo "== 3) token por ARCHIVO 0600 (NO en command-line: evita leak argv/dumpsys) =="
adb -s "$DEV" shell "mkdir -p /sdcard/ape"
printf '%s' "$TOKEN" | adb -s "$DEV" shell "cat > /sdcard/ape/token && chmod 600 /sdcard/ape/token" \
  || echo "WARN: no se pudo escribir /sdcard/ape/token"

echo "== 4) arrancar + provisionar (vps/dev por extras; el token lo lee del archivo) =="
adb -s "$DEV" shell am startservice -n "$PKG/.AgentService" --es vps "$VPS" --es dev "$DEVID" \
  || adb -s "$DEV" shell am start-foreground-service -n "$PKG/.AgentService" --es vps "$VPS" --es dev "$DEVID" \
  || adb -s "$DEV" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1

echo "== 5) verificar =="
echo "adb -s $DEV logcat -s ApeAgentService:I ApeFeedForward:W ApeSettingsApplier:I"
