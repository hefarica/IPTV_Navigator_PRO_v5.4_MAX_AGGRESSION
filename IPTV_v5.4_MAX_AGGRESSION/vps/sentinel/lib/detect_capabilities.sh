#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE SENTINEL — Capability Detector (polymorphic, idempotent)
# Extends detect_device.sh with SoC family + player + enhancement marker.
# Source it:  . detect_capabilities.sh <device_ip:port>
# Standalone: ./detect_capabilities.sh <device_ip:port>  → prints shell exports
#
# Exports: SOC HW SOC_FAMILY SDK ANDROID_VERSION PLAYER ENH_VER ADB_OK
#          DEVICE_BRAND DEVICE_MODEL DEVICE_MANUFACTURER DEVICE_PLATFORM
# NEVER fails the caller (graceful unknown). Respects iptv-onn-sentinel-never-down.
# ══════════════════════════════════════════════════════════════════════════

# SSOT del marcador de versión de la mejora (usado por idempotencia en todo el stack)
: "${APE_ENH_VERSION:=2026.06-universal-1}"

_dc_self="${BASH_SOURCE[0]:-$0}"
if [ "${_dc_self}" = "${0}" ]; then _DC_STANDALONE=true; else _DC_STANDALONE=false; fi

ADB_TARGET="${1:-${ADB_TARGET:-10.200.0.3:5555}}"
_DC_LIB_DIR="$(cd "$(dirname "${_dc_self}")" 2>/dev/null && pwd)"

# Idempotencia de detección (B6 S7): si ya se detectó para ESTE target en este proceso
# (process_device source-ea aquí, y luego apply_generic_profile lo vuelve a source-ear),
# no repetir ~10 getprops ADB → evita exceder TimeoutStartSec=120 con varios devices.
if [ "$_DC_STANDALONE" = false ] && [ -n "${SOC_FAMILY:-}" ] && [ "${_DC_DETECTED_FOR:-}" = "$ADB_TARGET" ]; then
    return 0
fi
_DC_DETECTED_FOR="$ADB_TARGET"

# Reutiliza detect_device.sh (get_adb_prop + DEVICE_BRAND/MODEL/DEVICE/SDK/PLATFORM)
if [ -f "${_DC_LIB_DIR}/detect_device.sh" ]; then
    # shellcheck source=/dev/null
    . "${_DC_LIB_DIR}/detect_device.sh" "$ADB_TARGET"
else
    # Fallback mínimo si detect_device.sh no está presente
    get_adb_prop() { adb -s "$ADB_TARGET" shell getprop "$1" 2>/dev/null | tr -d '\r\n' || echo ""; }
    DEVICE_BRAND=""; DEVICE_MODEL=""; DEVICE_PLATFORM="generic"; DEVICE_SDK=""
fi

# ADB vivo?
ADB_OK=false
if adb -s "$ADB_TARGET" shell echo ok >/dev/null 2>&1; then ADB_OK=true; fi

# Propiedades base
SOC="$(get_adb_prop ro.board.platform)"
HW="$(get_adb_prop ro.hardware)"
SDK="${DEVICE_SDK:-$(get_adb_prop ro.build.version.sdk)}"
ANDROID_VERSION="$(get_adb_prop ro.build.version.release)"
DEVICE_MANUFACTURER="$(get_adb_prop ro.product.manufacturer)"
DEVICE_BRAND="${DEVICE_BRAND:-$(get_adb_prop ro.product.brand)}"
DEVICE_MODEL="${DEVICE_MODEL:-$(get_adb_prop ro.product.model)}"
CHARACTERISTICS="$(get_adb_prop ro.build.characteristics)"

# Identidad ESTABLE (no la IP, que cambia con DHCP → registros duplicados en ape_devices.db).
# ro.serialno es persistente al hardware; fallback a model+device si el device lo oculta.
DEVICE_SERIAL="$(get_adb_prop ro.serialno)"
[ -z "$DEVICE_SERIAL" ] && DEVICE_SERIAL="$(get_adb_prop ro.boot.serialno)"
[ -z "$DEVICE_SERIAL" ] && DEVICE_SERIAL="${DEVICE_MODEL:-dev}-${DEVICE_DEVICE:-unknown}"

# Familia de SoC (polimórfico — NO solo Amlogic)
_socsig="$(printf '%s%s' "$SOC" "$HW" | tr '[:upper:]' '[:lower:]')"
case "$_socsig" in
    *amlogic*|*s905*|*s922*|*t9*)        SOC_FAMILY=amlogic ;;
    *mt8*|*mt6*|*mt9*|*mediatek*|*mtk*)  SOC_FAMILY=mediatek ;;
    *rtd1*|*realtek*)                    SOC_FAMILY=realtek ;;
    *rk3*|*rockchip*)                    SOC_FAMILY=rockchip ;;
    *msm*|*qcom*|*qualcomm*|*sm[0-9]*)   SOC_FAMILY=qualcomm ;;
    *)                                   SOC_FAMILY=generic ;;
esac

# Player instalado (best-effort; no falla si pm no responde)
# GATE por ADB_OK: 'pm list packages' en un device muerto espera el timeout completo
# de adb en CADA ciclo del auto-installer → arrastra el loop con varios devices offline.
PLAYER=unknown
_pkgs=""
if [ "$ADB_OK" = true ]; then
    _pkgs="$(adb -s "$ADB_TARGET" shell pm list packages 2>/dev/null | tr -d '\r' || echo '')"
fi
case "$_pkgs" in
    *studio.scillarium.ottnavigator*) PLAYER=ottnavigator ;;
    *ar.tvplayer.tv*)                 PLAYER=tivimate ;;
    *org.xbmc.kodi*)                  PLAYER=kodi ;;
    *org.videolan.vlc*)               PLAYER=vlc ;;
    *smarters*|*nst.iptvsmarters*)    PLAYER=smarters ;;
    *exoplayer*)                      PLAYER=exoplayer ;;
esac

# Marcador de idempotencia (versión de mejora ya aplicada)
ENH_VER="$(get_adb_prop persist.ape.enh.version)"

if [ "$_DC_STANDALONE" = true ]; then
    cat <<EOF
SOC='$SOC'
HW='$HW'
SOC_FAMILY='$SOC_FAMILY'
SDK='$SDK'
ANDROID_VERSION='$ANDROID_VERSION'
PLAYER='$PLAYER'
ENH_VER='$ENH_VER'
ADB_OK='$ADB_OK'
DEVICE_BRAND='$DEVICE_BRAND'
DEVICE_MODEL='$DEVICE_MODEL'
DEVICE_MANUFACTURER='$DEVICE_MANUFACTURER'
DEVICE_PLATFORM='${DEVICE_PLATFORM:-generic}'
APE_ENH_VERSION='$APE_ENH_VERSION'
EOF
fi
