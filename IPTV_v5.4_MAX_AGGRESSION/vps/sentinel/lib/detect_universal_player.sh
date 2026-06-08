#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Universal Player Detector
# Clasifica CUALQUIER device por el mejor plano de control disponible, SIN mentir:
#   ADB (Android/Fire) → Roku ECP → Apple TV/network → manifest/unknown.
# Source:  . detect_universal_player.sh <target>
# Exports: PLATFORM_FAMILY CONTROL_PLANE  (+ las de detect_capabilities si ADB)
#   PLATFORM_FAMILY: androidtv|firetv|roku|appletv|web|smarttv|unknown
#   CONTROL_PLANE:   adb|roku_ecp|mdm|app_config|manifest|network_only|manual
# Graceful: nunca falla; lo que no se sabe → unknown/manual.
# ══════════════════════════════════════════════════════════════════════════
: "${APE_ENH_VERSION:=2026.06-universal-1}"
_dup_self="${BASH_SOURCE[0]:-$0}"
_DUP_DIR="$(cd "$(dirname "${_dup_self}")" 2>/dev/null && pwd)"
TARGET="${1:-${TARGET:-}}"

PLATFORM_FAMILY=unknown
CONTROL_PLANE=manual

# 1) ADB (Android/Fire) — el más capaz
if [ -n "$TARGET" ] && adb connect "$TARGET" >/dev/null 2>&1 && adb -s "$TARGET" shell echo ok >/dev/null 2>&1; then
    CONTROL_PLANE=adb
    if [ -f "${_DUP_DIR}/detect_capabilities.sh" ]; then
        # shellcheck source=/dev/null
        . "${_DUP_DIR}/detect_capabilities.sh" "$TARGET"
    fi
    _mfr="$(printf '%s%s%s' "${DEVICE_MANUFACTURER:-}" "${DEVICE_BRAND:-}" "${CHARACTERISTICS:-}" | tr '[:upper:]' '[:lower:]')"
    case "$_mfr" in
        *amazon*|*aft*) PLATFORM_FAMILY=firetv ;;
        *)              PLATFORM_FAMILY=androidtv ;;
    esac
    return 0 2>/dev/null || exit 0
fi

# 2) Roku ECP (puerto 8060) — sin ADB
if [ -n "$TARGET" ] && command -v curl >/dev/null 2>&1; then
    _ip="${TARGET%%:*}"
    if curl -s -m 3 "http://${_ip}:8060/query/device-info" 2>/dev/null | grep -qiE 'roku|<device-info'; then
        PLATFORM_FAMILY=roku
        CONTROL_PLANE=roku_ecp
        return 0 2>/dev/null || exit 0
    fi
fi

# 3) Apple TV / tvOS (AirPlay/mDNS _airplay._tcp / _appletv) — network only
if [ -n "$TARGET" ]; then
    _ip="${TARGET%%:*}"
    if command -v avahi-resolve >/dev/null 2>&1 && avahi-resolve -a "$_ip" 2>/dev/null | grep -qiE 'apple|appletv'; then
        PLATFORM_FAMILY=appletv; CONTROL_PLANE=network_only
        return 0 2>/dev/null || exit 0
    fi
    if command -v curl >/dev/null 2>&1 && curl -s -m 3 "http://${_ip}:7000/info" 2>/dev/null | grep -qiE 'apple|airplay'; then
        PLATFORM_FAMILY=appletv; CONTROL_PLANE=network_only
        return 0 2>/dev/null || exit 0
    fi
fi

# 4) Desconocido → solo manifest/manual (truthful)
PLATFORM_FAMILY=unknown
CONTROL_PLANE=manual
return 0 2>/dev/null || true
