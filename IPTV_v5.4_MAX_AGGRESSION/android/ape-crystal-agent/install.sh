#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# APE Crystal Agent — instalación + permisos + provisión (1 sola sesión ADB).
# Uso:  sh install.sh <device> <TOKEN> [vps_url] [apk_path]
#   ej: sh install.sh 192.168.1.7:5555 b2ad...c4 https://iptv-ape.duckdns.org app/build/outputs/apk/release/app-release.apk
# ──────────────────────────────────────────────────────────────────────────
set -eu
DEV="${1:?uso: sh install.sh <device> <TOKEN> [vps] [apk]}"
TOKEN="${2:?TOKEN requerido (ape-cmd-push.sh enroll <dev> lo imprime)}"
VPS="${3:-https://iptv-ape.duckdns.org}"
APK="${4:-app/build/outputs/apk/release/app-release.apk}"
PKG="com.ape.crystalagent"

echo "== 1) instalar APK =="
adb -s "$DEV" install -r "$APK"

echo "== 2) permisos (grantables por adb: protectionLevel ...|development) =="
adb -s "$DEV" shell pm grant "$PKG" android.permission.READ_LOGS || echo "WARN: READ_LOGS no grant (¿Fire OS lo bloquea? el agente degrada)"
adb -s "$DEV" shell pm grant "$PKG" android.permission.WRITE_SECURE_SETTINGS || echo "WARN: WRITE_SECURE_SETTINGS no grant (settings no se aplicarán)"

echo "== 3) (opcional) índice de canales esperado, si lo tienes =="
# adb -s "$DEV" shell mkdir -p /sdcard/ape
# adb -s "$DEV" push channels_index.json /sdcard/ape/channels_index.json

echo "== 4) arrancar + provisionar (token va por SharedPreferences, NUNCA en URL) =="
adb -s "$DEV" shell am startservice -n "$PKG/.AgentService" --es token "$TOKEN" --es vps "$VPS" --es dev firestick-cali \
  || adb -s "$DEV" shell am start-foreground-service -n "$PKG/.AgentService" --es token "$TOKEN" --es vps "$VPS" --es dev firestick-cali \
  || adb -s "$DEV" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1

echo "== 5) verificar =="
echo "adb -s $DEV logcat -s ApeAgentService:I ApeDecodeObserver:I ApeMatchClient:W ApeCargaApplier:I"
