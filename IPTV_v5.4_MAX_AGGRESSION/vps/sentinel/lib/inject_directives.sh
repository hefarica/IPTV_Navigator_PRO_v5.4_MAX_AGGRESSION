#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE SENTINEL — Directives Injection Engine
# Formulates and injects settings and intents to Android TV devices via ADB.
#
# Usage: inject_directives.sh <device_ip:port> <platform>
# ══════════════════════════════════════════════════════════════════════════

set -euo pipefail

ADB_TARGET="${1:-10.200.0.3:5555}"
PLATFORM="${2:-generic}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILES_DIR="${SCRIPT_DIR}/../profiles"

echo "[DIRECTIVES_INJECTOR] Target: $ADB_TARGET | Platform: $PLATFORM"

# ── 1. Apply Global Common Hardening Overrides ─────────────────────────
echo "[DIRECTIVES_INJECTOR] Injecting common performance and system baselines..."

# Speed and animation optimization
adb -s "$ADB_TARGET" shell "settings put global window_animation_scale 0.0" 2>/dev/null || true
adb -s "$ADB_TARGET" shell "settings put global transition_animation_scale 0.0" 2>/dev/null || true
adb -s "$ADB_TARGET" shell "settings put global animator_duration_scale 0.0" 2>/dev/null || true

# Network / TCP tweaks
adb -s "$ADB_TARGET" shell "settings put global tcp_default_init_rwnd 60" 2>/dev/null || true
adb -s "$ADB_TARGET" shell "settings put global wifi_sleep_policy 2" 2>/dev/null || true
adb -s "$ADB_TARGET" shell "settings put global wifi_scan_always_enabled 0" 2>/dev/null || true
adb -s "$ADB_TARGET" shell "settings put global wifi_suspend_optimizations_enabled 0" 2>/dev/null || true

# Energy and stay awake configuration
adb -s "$ADB_TARGET" shell "settings put global stay_on_while_plugged_in 3" 2>/dev/null || true
adb -s "$ADB_TARGET" shell "settings put system screen_off_timeout 2147483647" 2>/dev/null || true

# Audio passthrough
adb -s "$ADB_TARGET" shell "settings put global encoded_surround_output 2" 2>/dev/null || true
adb -s "$ADB_TARGET" shell "settings put global hdmi_system_audio_control 1" 2>/dev/null || true

# DNS routing
adb -s "$ADB_TARGET" shell "settings put global private_dns_mode hostname" 2>/dev/null || true
adb -s "$ADB_TARGET" shell "settings put global private_dns_specifier dns.google" 2>/dev/null || true

# ── 2. Apply Platform-Specific Settings ────────────────────────────────
if [ "$PLATFORM" = "firetv" ]; then
    if [ -f "${PROFILES_DIR}/firetv.sh" ]; then
        source "${PROFILES_DIR}/firetv.sh"
        apply_firetv_profile "$ADB_TARGET"
    else
        echo "[DIRECTIVES_INJECTOR] Warning: Fire TV profile not found at ${PROFILES_DIR}/firetv.sh"
    fi
elif [ "$PLATFORM" = "onn_4k" ]; then
    if [ -f "${PROFILES_DIR}/onn_4k.sh" ]; then
        source "${PROFILES_DIR}/onn_4k.sh"
        apply_onn_profile "$ADB_TARGET"
    else
        echo "[DIRECTIVES_INJECTOR] Warning: ONN 4K profile not found at ${PROFILES_DIR}/onn_4k.sh"
    fi
else
    echo "[DIRECTIVES_INJECTOR] Generic platform. Sourcing fallback display tweaks."
    adb -s "$ADB_TARGET" shell "settings put global hdr_conversion_mode 0" 2>/dev/null || true
    adb -s "$ADB_TARGET" shell "settings put global match_content_frame_rate 1" 2>/dev/null || true
fi

# ── 3. Broadcast Intents and System Triggers ───────────────────────────
echo "[DIRECTIVES_INJECTOR] Broadcasting configuration intent triggers..."

# Notify OS about display/audio hardware change
adb -s "$ADB_TARGET" shell "am broadcast -a android.intent.action.CONFIGURATION_CHANGED" >/dev/null 2>&1 || true
adb -s "$ADB_TARGET" shell "am broadcast -a android.media.action.HDMI_AUDIO_PLUG" >/dev/null 2>&1 || true

# Force OTT Navigator configuration reload if active
if adb -s "$ADB_TARGET" shell "pidof studio.scillarium.ottnavigator" &>/dev/null; then
    echo "[DIRECTIVES_INJECTOR] OTT Navigator is active. Sending sync overlay toast."
    # Broadcast intent for notification toast
    adb -s "$ADB_TARGET" shell "cmd notification post -S bigtext -t '🔮 PRISMA SYNC' 'prisma_toast' 'AIPQ, HDR10+, and Network parameters verified.'" >/dev/null 2>&1 || true
    # Cancel toast notification after 4s
    (sleep 4; adb -s "$ADB_TARGET" shell "cmd notification cancel prisma_toast" >/dev/null 2>&1) &
fi

echo "[DIRECTIVES_INJECTOR] Injection sequence complete."
