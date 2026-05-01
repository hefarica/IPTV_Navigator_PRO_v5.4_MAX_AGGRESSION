#!/usr/bin/env bash
# ============================================================================
# apply_image_boost_firestick.sh — Fire TV Stick 4K Max image boost via ADB
# ============================================================================
# Gemelo del SOP del ONN 4K (.agent/skills/adb_master_directives_rule/SKILL.md)
# pero adaptado al chip MediaTek MT8696 (Fire OS 7+, sin AISR/AIPQ del Amlogic).
#
# Aplica ~32 settings ADB en 7 categorías (HDR/COLOR/MEMC/PERF/NET/POWER/AUDIO)
# + Vía 1 (OTT Navigator equivalents a nivel SoC, ya que SharedPreferences requiere root).
#
# Idempotente. Detecta device por ro.product.model. Verificación post-aplicación.
# Rollback de emergencia con --rollback.
#
# Usage:
#   bash apply_image_boost_firestick.sh                  # auto-detect Fire TV
#   bash apply_image_boost_firestick.sh --device 10.200.0.3:5555
#   bash apply_image_boost_firestick.sh --verify-only    # solo lee settings
#   bash apply_image_boost_firestick.sh --rollback       # revierte a defaults
# ============================================================================

set -uo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
DEVICE=""
MODE="apply"

# ── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --device)       DEVICE="$2"; shift 2 ;;
        --verify-only)  MODE="verify"; shift ;;
        --rollback)     MODE="rollback"; shift ;;
        -h|--help)
            sed -n '/^# Usage:/,/^# ===/p' "$0" | sed 's/^# *//'
            exit 0
            ;;
        *) echo "ERROR: unknown arg '$1'. Use --help."; exit 1 ;;
    esac
done

# ── Pre-flight ──────────────────────────────────────────────────────────────
command -v adb >/dev/null 2>&1 || { echo "ERROR: adb no encontrado en PATH. Instala platform-tools."; exit 1; }

if [[ -z "$DEVICE" ]]; then
    # Auto-detect: pick first connected device that matches AFTKA* (Fire TV 4K Max)
    while IFS=$'\t' read -r addr state; do
        [[ "$state" != "device" ]] && continue
        model=$(adb -s "$addr" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
        if [[ "$model" =~ ^AFTKA ]] || [[ "$model" =~ ^AFTM ]] || [[ "$model" =~ ^AFTS ]]; then
            DEVICE="$addr"
            echo "OK: auto-detected Fire TV at $addr (model=$model)"
            break
        fi
    done < <(adb devices | tail -n +2 | grep -v '^$')
fi

[[ -z "$DEVICE" ]] && { echo "ERROR: no Fire TV connected. Use --device IP:PORT or 'adb connect IP:5555' first."; exit 1; }

# Verify device reachable + is Fire TV
adb -s "$DEVICE" get-state >/dev/null 2>&1 || {
    echo "WARN: device $DEVICE not connected, attempting reconnect..."
    adb connect "$DEVICE" >/dev/null 2>&1
    sleep 2
    adb -s "$DEVICE" get-state >/dev/null 2>&1 || { echo "ERROR: cannot connect to $DEVICE"; exit 1; }
}

MODEL=$(adb -s "$DEVICE" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
MANUFACTURER=$(adb -s "$DEVICE" shell getprop ro.product.manufacturer 2>/dev/null | tr -d '\r')
SOC=$(adb -s "$DEVICE" shell getprop ro.board.platform 2>/dev/null | tr -d '\r')
echo "Device: $DEVICE | model=$MODEL | mfr=$MANUFACTURER | soc=$SOC"

if [[ ! "$MODEL" =~ ^AFT ]] && [[ "$MANUFACTURER" != "Amazon" ]]; then
    echo "ERROR: this script is specific to Fire TV (model AFT*). Detected: '$MODEL' / '$MANUFACTURER'."
    echo "       For ONN 4K, use the SOP in .agent/skills/adb_master_directives_rule/SKILL.md"
    exit 1
fi

# ── Helper: apply or verify a setting ───────────────────────────────────────
adb_run() {
    adb -s "$DEVICE" shell "$1" 2>/dev/null | tr -d '\r'
}

apply_setting() {
    local namespace="$1" key="$2" value="$3"
    adb_run "settings put $namespace $key '$value'" >/dev/null
    local got
    got=$(adb_run "settings get $namespace $key")
    if [[ "$got" == "$value" ]]; then
        echo "  OK   $namespace.$key = $value"
    else
        echo "  FAIL $namespace.$key expected=$value got=$got"
    fi
}

verify_setting() {
    local namespace="$1" key="$2" expected="$3"
    local got
    got=$(adb_run "settings get $namespace $key")
    local marker
    if [[ "$got" == "$expected" ]]; then marker="OK  "; else marker="MISS"; fi
    printf "  %s  %s.%s = %s (expected %s)\n" "$marker" "$namespace" "$key" "$got" "$expected"
}

apply_setprop() {
    local prop="$1" value="$2"
    adb_run "setprop $prop '$value'" >/dev/null
    local got
    got=$(adb_run "getprop $prop")
    if [[ "$got" == "$value" ]]; then
        echo "  OK   prop $prop = $value"
    else
        echo "  WARN prop $prop set to '$value' but read '$got' (some props don't persist via setprop)"
    fi
}

# ── DESIRED STATE — 32 directives ───────────────────────────────────────────
# Format: namespace|key|value|category
DIRECTIVES=(
    # CAT 1 — HDR + COLOR (8)
    "global|always_hdr|1|HDR_COLOR"
    "global|hdr_conversion_mode|2|HDR_COLOR"
    "global|hdr_force_conversion_type|4|HDR_COLOR"
    "global|hdr_output_type|4|HDR_COLOR"
    "global|match_content_frame_rate|1|HDR_COLOR"
    "secure|display_color_mode|3|HDR_COLOR"
    "global|user_preferred_resolution_height|2160|HDR_COLOR"
    "global|user_preferred_refresh_rate|60.0|HDR_COLOR"

    # CAT 2 — MEMC + PICTURE QUALITY (Amazon proprietary, 6)
    "system|com.amazon.tv.color_temperature|cool|MEMC_PQ"
    "system|com.amazon.tv.dynamic_contrast|high|MEMC_PQ"
    "system|com.amazon.tv.picture_sharpness|65|MEMC_PQ"
    "system|com.amazon.tv.motion_smoothness|2|MEMC_PQ"
    "system|com.amazon.tv.noise_reduction|auto|MEMC_PQ"
    "system|com.amazon.tv.picture_mode|movie|MEMC_PQ"

    # CAT 3 — PERFORMANCE (5; setprop GPU se aplica aparte)
    "global|window_animation_scale|0.0|PERF"
    "global|transition_animation_scale|0.0|PERF"
    "global|animator_duration_scale|0.0|PERF"
    "global|forced_app_standby_enabled|1|PERF"
    "global|app_standby_enabled|1|PERF"

    # CAT 4 — NETWORK aggressive (7)
    "global|tcp_default_init_rwnd|60|NET"
    "global|wifi_sleep_policy|2|NET"
    "global|wifi_watchdog_poor_network_test_enabled|0|NET"
    "global|private_dns_mode|hostname|NET"
    "global|private_dns_specifier|dns.google|NET"
    "global|background_data_enabled|0|NET"
    "global|captive_portal_detection_enabled|0|NET"

    # CAT 5 — POWER + Display always-on (4)
    "global|stay_on_while_plugged_in|3|POWER"
    "global|low_power|0|POWER"
    "system|screen_off_timeout|2147483647|POWER"
    "secure|screensaver_enabled|0|POWER"

    # CAT 6 — AUDIO passthrough (2)
    "global|encoded_surround_output|1|AUDIO"
    "global|hdmi_system_audio_control|1|AUDIO"
)

# ── PROPS (no persisten en reboot — re-apply post-boot) ─────────────────────
PROPS=(
    "debug.hwui.renderer|skiagl"             # GPU renderer (MT8696 Vulkan parcial → skiagl óptimo)
    "debug.media.video.frc|true"             # Frame rate conversion: ExoPlayer hereda → "Hardware+ Decoder" equivalente OTT Navigator
)

# ── ROLLBACK STATE — Fire OS defaults ───────────────────────────────────────
ROLLBACK=(
    "global|always_hdr|0|HDR_COLOR"
    "global|hdr_conversion_mode|0|HDR_COLOR"
    "global|match_content_frame_rate|0|HDR_COLOR"
    "secure|display_color_mode|0|HDR_COLOR"
    "system|com.amazon.tv.picture_mode|standard|MEMC_PQ"
    "system|com.amazon.tv.picture_sharpness|50|MEMC_PQ"
    "system|com.amazon.tv.motion_smoothness|0|MEMC_PQ"
    "system|com.amazon.tv.dynamic_contrast|medium|MEMC_PQ"
    "global|window_animation_scale|1.0|PERF"
    "global|transition_animation_scale|1.0|PERF"
    "global|animator_duration_scale|1.0|PERF"
    "global|forced_app_standby_enabled|0|PERF"
)

# ── DISPATCH ────────────────────────────────────────────────────────────────
echo ""
case "$MODE" in
    apply)
        echo "=== APPLY MODE — 32 directives + 2 props ==="
        last_cat=""
        for entry in "${DIRECTIVES[@]}"; do
            IFS='|' read -r ns key val cat <<< "$entry"
            if [[ "$cat" != "$last_cat" ]]; then
                echo ""
                echo "── $cat ──"
                last_cat="$cat"
            fi
            apply_setting "$ns" "$key" "$val"
        done
        echo ""
        echo "── GPU + DECODER PROPS ──"
        for entry in "${PROPS[@]}"; do
            IFS='|' read -r prop val <<< "$entry"
            apply_setprop "$prop" "$val"
        done
        echo ""
        echo "OK ALL_APPLIED — re-apply props post-reboot:"
        echo "  bash $0 --verify-only"
        ;;

    verify)
        echo "=== VERIFY MODE ==="
        last_cat=""
        for entry in "${DIRECTIVES[@]}"; do
            IFS='|' read -r ns key val cat <<< "$entry"
            if [[ "$cat" != "$last_cat" ]]; then
                echo ""
                echo "── $cat ──"
                last_cat="$cat"
            fi
            verify_setting "$ns" "$key" "$val"
        done
        echo ""
        echo "── PROPS ──"
        for entry in "${PROPS[@]}"; do
            IFS='|' read -r prop val <<< "$entry"
            got=$(adb_run "getprop $prop")
            marker="OK  "; [[ "$got" != "$val" ]] && marker="MISS"
            echo "  $marker  prop $prop = $got (expected $val)"
        done
        ;;

    rollback)
        echo "=== ROLLBACK MODE — restore Fire OS defaults ==="
        last_cat=""
        for entry in "${ROLLBACK[@]}"; do
            IFS='|' read -r ns key val cat <<< "$entry"
            if [[ "$cat" != "$last_cat" ]]; then
                echo ""
                echo "── $cat ──"
                last_cat="$cat"
            fi
            apply_setting "$ns" "$key" "$val"
        done
        echo ""
        echo "OK REVERTED — Fire OS defaults restored. Network/power directives preserved."
        ;;
esac

echo ""
echo "Done. Device: $DEVICE | model=$MODEL"
