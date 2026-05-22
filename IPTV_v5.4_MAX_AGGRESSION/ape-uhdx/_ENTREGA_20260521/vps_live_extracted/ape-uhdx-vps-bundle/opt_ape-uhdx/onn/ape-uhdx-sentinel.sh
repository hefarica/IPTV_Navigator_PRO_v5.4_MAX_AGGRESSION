#!/system/bin/sh
# ═════════════════════════════════════════════════════════════════════════════
# APE UHDX — DAEMON - SENTINEL UNIFICADO v6.0
# ONN 4K / Android TV — anti-freeze + red/VPN + TCP tuning + quality manifest
# + AI/PQ image enforcement + heartbeat + VPS SRE triggers
#
# Objetivo:
#   Reemplaza a:
#     - /data/local/tmp/ape-sentinel.sh
#     - /data/local/tmp/ape-pq-guardian.sh
#   y elimina choques entre ajustes de imagen, locks y loops paralelos.
#
# Diseño:
#   - Un solo PID lock.
#   - Un solo dueño de settings AI/PQ/HDR.
#   - Un solo loop con cadencias internas.
#   - Perfil SDR/HDR automático para evitar imagen oscura en TVs SDR.
#   - Watchdog externo recomendado: APE_UHDX_Watchdog_Unified.ps1 cada 1 min.
# ═════════════════════════════════════════════════════════════════════════════

BASE="/data/local/tmp"
SCRIPT="$BASE/ape-uhdx-sentinel.sh"
LOCK="$BASE/ape-uhdx-sentinel.lock"
LOG="$BASE/ape-uhdx-sentinel.log"

# Locks antiguos: se limpian/retiran para que no compitan.
OLD_RAM_LOCK="$BASE/ape-ram-guardian.lock"
OLD_SENTINEL_LOCK="$BASE/ape-sentinel.lock"
OLD_PQ_LOCK="$BASE/ape-pq-guardian.lock"

MANIFEST="$BASE/quality-manifest.json"
MANIFEST_HASH="$BASE/quality-manifest.hash"
MANIFEST_TRIGGER="$BASE/ape-qm-apply-now"
PROFILE_FILE="$BASE/ape-uhdx-profile.conf"

CURL_BIN="$BASE/curl"
VPS_IP="${VPS_IP:-178.156.147.234}"
VPS_BASE="${VPS_BASE:-https://iptv-ape.duckdns.org}"
HEARTBEAT_URL="$VPS_BASE/prisma/api/prisma-adb-quality.php?action=guardian_heartbeat"
TRIGGER_URL="$VPS_BASE/prisma/api/prisma-adb-quality.php?action=sentinel_trigger"
MANIFEST_HASH_URL="$VPS_BASE/prisma/api/prisma-adb-quality.php?action=manifest_hash"
MANIFEST_DOWNLOAD_URL="$VPS_BASE/prisma/quality-manifest.json"

# Apps principales.
PLAYER_RE="studio.scillarium.ottnavigator|ar.tvplayer.tv"
VPN_PACKAGE="${VPN_PACKAGE:-com.v2ray.ang}"
V2RAY_MAIN="${V2RAY_MAIN:-com.v2ray.ang/.ui.MainActivity}"
V2RAY_TOGGLE_TAP="${V2RAY_TOGGLE_TAP:-1832 968}"

# Cadencias.
WATCH_INTERVAL=20
ACTIVE_INTERVAL=1
PQ_INTERVAL=300
BASELINE_INTERVAL=60
MANIFEST_WATCH_INTERVAL=20
MANIFEST_ACTIVE_INTERVAL=5
METRIC_INTERVAL=3
HEARTBEAT_WATCH_INTERVAL=60
HEARTBEAT_ACTIVE_INTERVAL=15

# RAM.
SOFT_LIMIT_MB="${SOFT_LIMIT_MB:-200}"
HARD_LIMIT_MB="${HARD_LIMIT_MB:-100}"
MAX_LOG_LINES=700

# Red / emergencia.
VPN_RESTART_COOLDOWN=120
LAST_VPN_RESTART=0
LAST_VPS_TRIGGER=0
VPS_TRIGGER_COOLDOWN=20
PACKET_LOSS=0
JITTER_MS=0
AVG_RTT_MS=0
THROUGHPUT_KBPS=0
RX_PREV=""
TS_PREV=""

CURRENT_MODE="WATCH_MODE"
WAKE_WINDOW_EXPIRE=0

PROTECTED_PACKAGES="
$VPN_PACKAGE
studio.scillarium.ottnavigator
ar.tvplayer.tv
com.wireguard.android
com.android.systemui
com.android.providers.tv
com.google.android.apps.tv.launcherx
android
"

KILL_TARGETS="
com.cbs.ott
com.google.android.youtube.tv
com.google.android.apps.youtube.unplugged
com.amazon.amazonvideo.livingroom
com.google.android.play.games
com.android.chrome
com.android.vending
com.google.android.tvrecommendations
com.rma.speedtesttv
tv.pluto.android
com.surfshark.vpnclient.android
com.google.android.gms.unstable
"

log() {
    ts=$(date '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "?")
    echo "[$ts] $1" >> "$LOG" 2>/dev/null
    lines=$(wc -l < "$LOG" 2>/dev/null || echo 0)
    if [ "$lines" -gt "$MAX_LOG_LINES" ] 2>/dev/null; then
        tail -n 300 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" 2>/dev/null
    fi
}

http_get() {
    timeout="$1"
    url="$2"
    if [ -x "$CURL_BIN" ]; then
        "$CURL_BIN" -k -sf -m "$timeout" "$url" 2>/dev/null && return 0
    fi
    wget -q -T "$timeout" -O - "$url" 2>/dev/null
}

http_post_json() {
    timeout="$1"
    url="$2"
    payload="$3"
    if [ -x "$CURL_BIN" ]; then
        "$CURL_BIN" -k -sf -m "$timeout" -X POST -H "Content-Type: application/json" -d "$payload" "$url" >/dev/null 2>&1 && return 0
    fi
    wget -q -T "$timeout" --post-data="$payload" --header="Content-Type: application/json" -O /dev/null "$url" 2>/dev/null
}

get_mem_mb() {
    grep "$1" /proc/meminfo 2>/dev/null | awk '{printf "%d", $2/1024}'
}

is_alive_pid() {
    p="$1"
    [ -n "$p" ] && kill -0 "$p" 2>/dev/null
}

cleanup_lock() {
    rm -f "$LOCK" 2>/dev/null
    log "STOP: Daemon - Sentinel Unificado stopped"
}

acquire_lock() {
    if [ -f "$LOCK" ]; then
        old_pid=$(cat "$LOCK" 2>/dev/null)
        if is_alive_pid "$old_pid"; then
            echo "APE UHDX Sentinel already running (pid=$old_pid)"
            exit 0
        fi
        rm -f "$LOCK" 2>/dev/null
    fi
    echo $$ > "$LOCK"
    trap cleanup_lock EXIT INT TERM
}

stop_pid_from_lock() {
    old_lock="$1"
    label="$2"
    if [ -f "$old_lock" ]; then
        old_pid=$(cat "$old_lock" 2>/dev/null)
        if is_alive_pid "$old_pid"; then
            kill "$old_pid" 2>/dev/null
            sleep 1
            if is_alive_pid "$old_pid"; then
                kill -9 "$old_pid" 2>/dev/null
            fi
            log "INTEGRATION: stopped legacy $label pid=$old_pid"
        fi
        rm -f "$old_lock" 2>/dev/null
    fi
}

decommission_legacy_daemons() {
    stop_pid_from_lock "$OLD_RAM_LOCK" "ram-guardian"
    stop_pid_from_lock "$OLD_SENTINEL_LOCK" "sentinel"
    stop_pid_from_lock "$OLD_PQ_LOCK" "pq-guardian"
}

is_protected_pkg() {
    pkg="$1"
    echo "$PROTECTED_PACKAGES" | grep -wq "$pkg" 2>/dev/null
}

get_foreground_package() {
    dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | grep -oE "$PLAYER_RE" | head -1
}

is_player_foreground() {
    dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | grep -qE "$PLAYER_RE"
}

get_rx_bytes() {
    for iface in tun0 wlan0 eth0; do
        if [ -r "/sys/class/net/$iface/statistics/rx_bytes" ]; then
            cat "/sys/class/net/$iface/statistics/rx_bytes" 2>/dev/null
            return
        fi
    done
    awk '/tun0|wlan0|eth0/{print $2; exit}' /proc/net/dev 2>/dev/null
}

calculate_throughput() {
    rx_now=$(get_rx_bytes)
    ts_now=$(date +%s 2>/dev/null || echo 0)
    if [ -n "$RX_PREV" ] && [ -n "$rx_now" ] && [ "$ts_now" -gt "$TS_PREV" ] 2>/dev/null; then
        diff=$((rx_now - RX_PREV))
        sec=$((ts_now - TS_PREV))
        if [ "$diff" -gt 0 ] 2>/dev/null && [ "$sec" -gt 0 ] 2>/dev/null; then
            THROUGHPUT_KBPS=$((diff / 1024 / sec))
        else
            THROUGHPUT_KBPS=0
        fi
    fi
    RX_PREV="$rx_now"
    TS_PREV="$ts_now"
}

soft_cleanup() {
    before=$(get_mem_mb MemAvailable)
    log "RAM_SOFT: ${before}MB — cleaning non-critical background apps"
    for pkg in $KILL_TARGETS; do
        if pidof "$pkg" >/dev/null 2>&1; then
            am force-stop "$pkg" 2>/dev/null
            log "RAM_SOFT: force-stop $pkg"
        fi
    done

    for pkg in $(pm list packages -3 2>/dev/null | cut -d: -f2); do
        is_protected_pkg "$pkg" && continue
        pid=$(pidof "$pkg" 2>/dev/null) || continue
        adj=$(cat "/proc/$pid/oom_score_adj" 2>/dev/null || echo 0)
        if [ "$adj" -gt 250 ] 2>/dev/null; then
            am force-stop "$pkg" 2>/dev/null
            log "RAM_SOFT: force-stop bg $pkg adj=$adj"
        fi
    done
    after=$(get_mem_mb MemAvailable)
    log "RAM_SOFT: ${before}→${after}MB"
}

hard_cleanup() {
    before=$(get_mem_mb MemAvailable)
    log "RAM_HARD: ${before}MB — critical cleanup"
    for pkg in $(pm list packages -3 2>/dev/null | cut -d: -f2); do
        is_protected_pkg "$pkg" && continue
        am force-stop "$pkg" 2>/dev/null
    done
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
    echo 1 > /proc/sys/vm/compact_memory 2>/dev/null
    after=$(get_mem_mb MemAvailable)
    log "RAM_HARD: ${before}→${after}MB"
}

apply_tcp_tuning() {
    echo 0 > /proc/sys/net/ipv4/tcp_slow_start_after_idle 2>/dev/null
    echo 3 > /proc/sys/net/ipv4/tcp_fastopen 2>/dev/null
    echo 1 > /proc/sys/net/ipv4/tcp_low_latency 2>/dev/null
    echo 1 > /proc/sys/net/ipv4/tcp_sack 2>/dev/null
    echo 1 > /proc/sys/net/ipv4/tcp_dsack 2>/dev/null
    echo 1 > /proc/sys/net/ipv4/tcp_tw_reuse 2>/dev/null
    echo 15 > /proc/sys/net/ipv4/tcp_fin_timeout 2>/dev/null
    echo 4194304 > /proc/sys/net/core/rmem_max 2>/dev/null
    echo 4194304 > /proc/sys/net/core/wmem_max 2>/dev/null
    echo "4096 262144 4194304" > /proc/sys/net/ipv4/tcp_rmem 2>/dev/null
    echo "4096 262144 4194304" > /proc/sys/net/ipv4/tcp_wmem 2>/dev/null
    echo 4096 > /proc/sys/net/core/netdev_max_backlog 2>/dev/null
}

apply_system_baselines() {
    fixed=0

    cur=$(settings get system screen_off_timeout 2>/dev/null)
    if [ "$cur" != "2147483647" ]; then
        settings put system screen_off_timeout 2147483647 2>/dev/null
        fixed=$((fixed+1))
    fi

    cur=$(settings get global stay_on_while_plugged_in 2>/dev/null)
    if [ "$cur" != "3" ]; then
        settings put global stay_on_while_plugged_in 3 2>/dev/null
        fixed=$((fixed+1))
    fi

    for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
        cur=$(settings get global "$scale" 2>/dev/null)
        if [ "$cur" != "0.0" ]; then
            settings put global "$scale" 0.0 2>/dev/null
            fixed=$((fixed+1))
        fi
    done

    for item in \
        wifi_sleep_policy=2 \
        wifi_scan_always_enabled=0 \
        wifi_suspend_optimizations_enabled=0 \
        wifi_networks_available_notification_on=0 \
        wifi_watchdog_poor_network_test_enabled=0 \
        network_scoring_ui_enabled=0 \
        tcp_default_init_rwnd=60
    do
        k=${item%=*}
        v=${item#*=}
        cur=$(settings get global "$k" 2>/dev/null)
        if [ "$cur" != "$v" ]; then
            settings put global "$k" "$v" 2>/dev/null
            fixed=$((fixed+1))
        fi
    done

    # Private DNS puede causar problemas con algunos proveedores; se mantiene Google por defecto.
    cur=$(settings get global private_dns_mode 2>/dev/null)
    if [ "$cur" != "hostname" ]; then
        settings put global private_dns_mode hostname 2>/dev/null
        fixed=$((fixed+1))
    fi
    cur=$(settings get global private_dns_specifier 2>/dev/null)
    if [ "$cur" != "dns.google" ]; then
        settings put global private_dns_specifier dns.google 2>/dev/null
        fixed=$((fixed+1))
    fi

    [ "$fixed" -gt 0 ] 2>/dev/null && log "BASELINE: restored $fixed system/network settings"
}

detect_profile() {
    if [ -f "$PROFILE_FILE" ]; then
        mode=$(cat "$PROFILE_FILE" 2>/dev/null | tr -d ' \r\n')
        case "$mode" in
            hdr|HDR|force_hdr) echo "hdr"; return ;;
            sdr|SDR|safe_sdr) echo "sdr"; return ;;
            auto|AUTO|"") ;;
        esac
    fi

    hdr_line=$(dumpsys display 2>/dev/null | grep -o 'supportedHdrTypes=\[[^]]*\]' | head -1)
    if echo "$hdr_line" | grep -q '\[\]'; then
        echo "sdr"
    elif echo "$hdr_line" | grep -q 'supportedHdrTypes=\[[0-9]'; then
        echo "hdr"
    else
        # Fail-safe: evita imagen oscura si no se puede leer EDID/HDR.
        echo "sdr"
    fi
}

picture_directives() {
    profile=$(detect_profile)

    # Formato: namespace|key|value|description
    # Perfil SDR: recomendado para Samsung 2017 sin HDR por HDMI.
    if [ "$profile" = "hdr" ]; then
        cat <<'EOF'
system|aisr_enable|1|AI Super Resolution ON
system|aipq_enable|1|AI Picture Quality ON
system|ai_pq_mode|3|AIPQ Mode MAX
system|ai_sr_mode|3|AISR Mode MAX
system|screen_brightness|255|Panel brightness max
system|screen_brightness_mode|0|Manual brightness
global|ai_pic_mode|3|AI picture profile MAX
global|ai_sr_level|3|AI SR level MAX
global|pq_ai_dnr_enable|1|AI DNR
global|pq_ai_fbc_enable|1|AI FBC
global|pq_ai_sr_enable|1|AI SR pipeline
global|pq_nr_enable|1|Noise reduction
global|pq_sharpness_enable|1|Sharpness enhancement
global|pq_dnr_enable|1|DNR
global|smart_illuminate_enabled|1|Smart illumination
global|hdr_conversion_mode|1|HDR conversion ON for HDR-capable display
global|hdr_output_type|4|HDR output type
global|hdr_force_conversion_type|-1|HDR auto force conversion
global|hdr_brightness_boost|100|HDR brightness boost
global|sdr_brightness_in_hdr|100|SDR in HDR brightness
global|peak_luminance|8000|HDR peak luminance hint
global|pq_hdr_enable|1|HDR pipeline
global|pq_hdr_mode|1|HDR mode
global|always_hdr|1|Always HDR only on HDR-capable display
global|hdmi_color_space|2|HDMI color space
global|color_depth|10|10-bit output
global|color_mode_ycbcr422|1|YCbCr 4:2:2 chroma
global|video_brightness|100|Video brightness max
global|force_gpu_rendering|1|Force GPU rendering
global|force_hw_ui|1|Force HW UI
global|hardware_accelerated_rendering_enabled|1|HW accelerated rendering
EOF
    else
        cat <<'EOF'
system|aisr_enable|1|AI Super Resolution ON
system|aipq_enable|1|AI Picture Quality ON
system|ai_pq_mode|3|AIPQ Mode MAX
system|ai_sr_mode|3|AISR Mode MAX
system|screen_brightness|255|Panel brightness max
system|screen_brightness_mode|0|Manual brightness
global|ai_pic_mode|3|AI picture profile MAX
global|ai_sr_level|3|AI SR level MAX
global|pq_ai_dnr_enable|1|AI DNR
global|pq_ai_fbc_enable|1|AI FBC
global|pq_ai_sr_enable|1|AI SR pipeline
global|pq_nr_enable|1|Noise reduction
global|pq_sharpness_enable|1|Sharpness enhancement
global|pq_dnr_enable|1|DNR
global|smart_illuminate_enabled|1|Smart illumination
global|hdr_conversion_mode|0|HDR conversion OFF for SDR-only display
global|hdr_output_type|0|SDR output
global|hdr_force_conversion_type|-1|HDR auto disabled/safe
global|hdr_brightness_boost|100|Brightness boost kept
global|sdr_brightness_in_hdr|100|SDR brightness max
global|peak_luminance|1000|SDR-safe peak luminance hint
global|pq_hdr_enable|1|Internal tone mapping pipeline enabled
global|pq_hdr_mode|1|Internal HDR/PQ processing
global|always_hdr|0|Always HDR OFF to avoid dark image
global|hdmi_color_space|2|HDMI color space
global|color_depth|10|10-bit output if accepted
global|color_mode_ycbcr422|1|YCbCr 4:2:2 chroma
global|video_brightness|100|Video brightness max
global|force_gpu_rendering|1|Force GPU rendering
global|force_hw_ui|1|Force HW UI
global|hardware_accelerated_rendering_enabled|1|HW accelerated rendering
EOF
    fi
}

put_setting_if_diff() {
    ns="$1"
    key="$2"
    want="$3"
    desc="$4"
    [ -z "$ns" ] || [ -z "$key" ] || [ -z "$want" ] && return 0

    cur=$(settings get "$ns" "$key" 2>/dev/null)
    if [ "$cur" != "$want" ]; then
        settings put "$ns" "$key" "$want" 2>/dev/null
        verify=$(settings get "$ns" "$key" 2>/dev/null)
        if [ "$verify" = "$want" ]; then
            log "PQ_FIX: $ns.$key $cur -> $want ($desc)"
            return 0
        fi
        log "PQ_FAIL: $ns.$key wanted=$want got=$verify ($desc)"
        return 1
    fi
    return 0
}

enforce_picture_quality() {
    changed=0
    profile=$(detect_profile)
    tmp="$BASE/.ape-uhdx-picture.$$"
    picture_directives > "$tmp" 2>/dev/null

    while IFS='|' read ns key val desc; do
        [ -z "$key" ] && continue
        before=$(settings get "$ns" "$key" 2>/dev/null)
        put_setting_if_diff "$ns" "$key" "$val" "$desc"
        after=$(settings get "$ns" "$key" 2>/dev/null)
        [ "$before" != "$after" ] && changed=$((changed+1))
    done < "$tmp"
    rm -f "$tmp" 2>/dev/null

    # Display 4K60 si el comando existe.
    mode=$(cmd display get-user-preferred-display-mode 2>/dev/null)
    if ! echo "$mode" | grep -q "3840"; then
        cmd display set-user-preferred-display-mode 3840 2160 60.0 2>/dev/null
        log "DISPLAY: requested 3840x2160@60"
    fi

    [ "$changed" -gt 0 ] 2>/dev/null && log "PQ: profile=$profile corrected=$changed"
}

manifest_parse_apply_line() {
    ns="$1"
    key="$2"
    val="$3"
    [ -z "$ns" ] || [ -z "$key" ] || [ -z "$val" ] && return 0

    # El manifest externo no puede romper el perfil SDR seguro salvo si se fuerza por archivo de perfil.
    profile=$(detect_profile)
    if [ "$profile" = "sdr" ]; then
        if [ "$key" = "always_hdr" ] && [ "$val" != "0" ]; then
            log "MANIFEST_SKIP: $key=$val blocked by SDR profile"
            return 0
        fi
        if [ "$key" = "hdr_conversion_mode" ] && [ "$val" != "0" ]; then
            log "MANIFEST_SKIP: $key=$val blocked by SDR profile"
            return 0
        fi
        if [ "$key" = "peak_luminance" ] && [ "$val" -gt 1000 ] 2>/dev/null; then
            log "MANIFEST_SKIP: $key=$val blocked by SDR profile"
            return 0
        fi
    fi

    put_setting_if_diff "$ns" "$key" "$val" "manifest"
}

enforce_quality_manifest() {
    [ -f "$MANIFEST" ] || return 0

    # Soporta líneas ns|key|value y JSON simple con objetos {"ns":"global","key":"x","value":"1"}.
    if grep -q '|' "$MANIFEST" 2>/dev/null; then
        while IFS='|' read ns key val rest; do
            [ -z "$key" ] && continue
            manifest_parse_apply_line "$ns" "$key" "$val"
        done < "$MANIFEST"
        return 0
    fi

    tmp="$BASE/.ape-manifest-flat.$$"
    tr -d '\n\r' < "$MANIFEST" 2>/dev/null | sed 's/},{/}\n{/g' > "$tmp" 2>/dev/null
    while read obj; do
        ns=$(echo "$obj" | sed -n 's/.*"ns"[ ]*:[ ]*"\([^"]*\)".*/\1/p')
        key=$(echo "$obj" | sed -n 's/.*"key"[ ]*:[ ]*"\([^"]*\)".*/\1/p')
        val=$(echo "$obj" | sed -n 's/.*"value"[ ]*:[ ]*"\{0,1\}\([^",}]*\)"\{0,1\}.*/\1/p')
        [ -n "$ns" ] && [ -n "$key" ] && [ -n "$val" ] && manifest_parse_apply_line "$ns" "$key" "$val"
    done < "$tmp"
    rm -f "$tmp" 2>/dev/null
}

pull_manifest_if_changed() {
    now="$1"
    interval="$MANIFEST_WATCH_INTERVAL"
    [ "$CURRENT_MODE" = "ACTIVE_PLAYER_MODE" ] && interval="$MANIFEST_ACTIVE_INTERVAL"

    [ -z "$LAST_HASH_CHECK" ] && LAST_HASH_CHECK=0
    if [ $((now - LAST_HASH_CHECK)) -lt "$interval" ] 2>/dev/null; then
        return 0
    fi
    LAST_HASH_CHECK="$now"

    remote_json=$(http_get 3 "$MANIFEST_HASH_URL" || echo "")
    remote_hash=$(echo "$remote_json" | grep -oE '"manifest_hash"[ ]*:[ ]*"[a-fA-F0-9]+"' | cut -d'"' -f4)
    [ -z "$remote_hash" ] && return 0

    local_hash=""
    [ -f "$MANIFEST_HASH" ] && local_hash=$(cat "$MANIFEST_HASH" 2>/dev/null | tr -d ' \r\n')

    if [ "$remote_hash" != "$local_hash" ]; then
        tmp="$MANIFEST.tmp"
        if [ -x "$CURL_BIN" ]; then
            "$CURL_BIN" -k -sf -m 5 -o "$tmp" "$MANIFEST_DOWNLOAD_URL" 2>/dev/null
        else
            wget -q -T 5 -O "$tmp" "$MANIFEST_DOWNLOAD_URL" 2>/dev/null
        fi
        if [ -s "$tmp" ] && grep -qE '\{|\|' "$tmp" 2>/dev/null; then
            mv "$tmp" "$MANIFEST" 2>/dev/null
            echo "$remote_hash" > "$MANIFEST_HASH" 2>/dev/null
            echo 1 > "$MANIFEST_TRIGGER" 2>/dev/null
            log "MANIFEST: downloaded new hash=$remote_hash"
        else
            rm -f "$tmp" 2>/dev/null
            log "MANIFEST: invalid or empty download"
        fi
    fi
}

disable_vpn_lockdown_for_standby() {
    fixed=0
    cur=$(settings get secure always_on_vpn_app 2>/dev/null)
    if [ "$cur" = "$VPN_PACKAGE" ]; then
        settings delete secure always_on_vpn_app 2>/dev/null
        fixed=$((fixed+1))
    fi
    cur=$(settings get secure always_on_vpn_lockdown 2>/dev/null)
    if [ "$cur" = "1" ]; then
        settings put secure always_on_vpn_lockdown 0 2>/dev/null
        fixed=$((fixed+1))
    fi
    if pidof "$VPN_PACKAGE" >/dev/null 2>&1; then
        am force-stop "$VPN_PACKAGE" 2>/dev/null
    fi
    [ "$fixed" -gt 0 ] 2>/dev/null && log "VPN: standby routing released"
}

enforce_vpn_active() {
    fixed=0
    cur=$(settings get secure always_on_vpn_app 2>/dev/null)
    if [ "$cur" != "$VPN_PACKAGE" ]; then
        settings put secure always_on_vpn_app "$VPN_PACKAGE" 2>/dev/null
        fixed=$((fixed+1))
    fi
    cur=$(settings get secure always_on_vpn_lockdown 2>/dev/null)
    if [ "$cur" != "1" ]; then
        settings put secure always_on_vpn_lockdown 1 2>/dev/null
        fixed=$((fixed+1))
    fi
    cmd deviceidle whitelist +"$VPN_PACKAGE" 2>/dev/null
    vpid=$(pidof "$VPN_PACKAGE" 2>/dev/null)
    if [ -n "$vpid" ]; then
        echo -17 > "/proc/$vpid/oom_adj" 2>/dev/null
        echo -1000 > "/proc/$vpid/oom_score_adj" 2>/dev/null
    fi
    [ "$fixed" -gt 0 ] 2>/dev/null && log "VPN: active lockdown restored fixed=$fixed"
}

restart_vpn_if_needed() {
    if ip addr show tun0 >/dev/null 2>&1; then
        return 0
    fi

    now=$(date +%s 2>/dev/null || echo 0)
    elapsed=$((now - LAST_VPN_RESTART))
    if [ "$elapsed" -lt "$VPN_RESTART_COOLDOWN" ] 2>/dev/null; then
        return 1
    fi
    LAST_VPN_RESTART="$now"

    active_player=$(get_foreground_package)
    log "VPN: tun0 down. Restarting $VPN_PACKAGE"
    am force-stop "$VPN_PACKAGE" 2>/dev/null
    sleep 2
    am start -n "$V2RAY_MAIN" 2>/dev/null
    sleep 4

    # Botón de conectar de v2rayNG. Se deja configurable para evitar hardcode rígido.
    x=$(echo "$V2RAY_TOGGLE_TAP" | awk '{print $1}')
    y=$(echo "$V2RAY_TOGGLE_TAP" | awk '{print $2}')
    [ -n "$x" ] && [ -n "$y" ] && input tap "$x" "$y" 2>/dev/null
    sleep 8

    if ip addr show tun0 >/dev/null 2>&1; then
        log "VPN: restored tun0"
        if [ -n "$active_player" ]; then
            monkey -p "$active_player" 1 >/dev/null 2>&1
        fi
        return 0
    fi

    log "VPN: still down after restart"
    return 1
}

trigger_vps_recovery() {
    routine="$1"
    reason="$2"
    now=$(date +%s 2>/dev/null || echo 0)
    if [ $((now - LAST_VPS_TRIGGER)) -lt "$VPS_TRIGGER_COOLDOWN" ] 2>/dev/null; then
        return 0
    fi
    LAST_VPS_TRIGGER="$now"

    url="$TRIGGER_URL&routine=$routine&reason=$reason"
    log "SRE_TRIGGER: routine=$routine reason=$reason"
    http_get 2 "$url" >/dev/null 2>&1 || true
}

update_network_metrics() {
    ping_res=$(ping -c 3 -W 1 "$VPS_IP" 2>&1)
    loss=$(echo "$ping_res" | grep -oE '[0-9]+% packet loss' | head -1 | grep -oE '[0-9]+')
    [ -z "$loss" ] && loss=100
    PACKET_LOSS="$loss"

    rtt_line=$(echo "$ping_res" | grep -E 'rtt|round-trip' | head -1)
    if [ -n "$rtt_line" ]; then
        AVG_RTT_MS=$(echo "$rtt_line" | awk -F'/' '{print $5}' | cut -d. -f1)
        JITTER_MS=$(echo "$rtt_line" | awk -F'/' '{print $7}' | cut -d. -f1)
        [ -z "$AVG_RTT_MS" ] && AVG_RTT_MS=0
        [ -z "$JITTER_MS" ] && JITTER_MS=0
    else
        AVG_RTT_MS=999
        JITTER_MS=999
    fi

    if [ "$PACKET_LOSS" -ge 15 ] 2>/dev/null; then
        trigger_vps_recovery "wg_failover" "packet_loss_${PACKET_LOSS}"
    elif [ "$JITTER_MS" -ge 150 ] 2>/dev/null; then
        trigger_vps_recovery "route_diagnose" "jitter_${JITTER_MS}"
    elif ! ip addr show tun0 >/dev/null 2>&1; then
        trigger_vps_recovery "wg_failover" "tun0_down"
    fi
}

send_heartbeat() {
    now="$1"
    interval="$HEARTBEAT_WATCH_INTERVAL"
    [ "$CURRENT_MODE" = "ACTIVE_PLAYER_MODE" ] && interval="$HEARTBEAT_ACTIVE_INTERVAL"

    [ -z "$LAST_HEARTBEAT" ] && LAST_HEARTBEAT=0
    if [ $((now - LAST_HEARTBEAT)) -lt "$interval" ] 2>/dev/null; then
        return 0
    fi
    LAST_HEARTBEAT="$now"

    mem=$(get_mem_mb MemAvailable)
    vpn="DOWN"; ip addr show tun0 >/dev/null 2>&1 && vpn="UP"
    player="OFF"; is_player_foreground && player="FOREGROUND"
    profile=$(detect_profile)
    ai_sr=$(settings get global ai_sr_level 2>/dev/null)
    hdr_mode=$(settings get global hdr_conversion_mode 2>/dev/null)
    always_hdr=$(settings get global always_hdr 2>/dev/null)
    peak=$(settings get global peak_luminance 2>/dev/null)
    chroma=$(settings get global color_mode_ycbcr422 2>/dev/null)
    uptime=$(cat /proc/uptime 2>/dev/null | cut -d. -f1)
    mhash=""; [ -f "$MANIFEST_HASH" ] && mhash=$(cat "$MANIFEST_HASH" 2>/dev/null | tr -d ' \r\n')

    payload="{\"daemon\":\"ape-uhdx-sentinel\",\"pid\":$$,\"mode\":\"$CURRENT_MODE\",\"profile\":\"$profile\",\"ram_avail_mb\":$mem,\"vpn\":\"$vpn\",\"player\":\"$player\",\"throughput_kbps\":$THROUGHPUT_KBPS,\"packet_loss\":$PACKET_LOSS,\"jitter_ms\":$JITTER_MS,\"avg_rtt_ms\":$AVG_RTT_MS,\"ai_sr_level\":\"$ai_sr\",\"hdr_conversion_mode\":\"$hdr_mode\",\"always_hdr\":\"$always_hdr\",\"peak_luminance\":\"$peak\",\"chroma_ycbcr422\":\"$chroma\",\"manifest_hash\":\"$mhash\",\"uptime\":$uptime}"

    http_post_json 3 "$HEARTBEAT_URL" "$payload" || true
}

handle_mode_transition() {
    now="$1"
    if is_player_foreground; then
        WAKE_WINDOW_EXPIRE=$((now + 45))
        if [ "$CURRENT_MODE" != "ACTIVE_PLAYER_MODE" ]; then
            CURRENT_MODE="ACTIVE_PLAYER_MODE"
            log "MODE: ACTIVE_PLAYER_MODE"
        fi
    else
        if [ "$now" -gt "$WAKE_WINDOW_EXPIRE" ] 2>/dev/null; then
            if [ "$CURRENT_MODE" != "WATCH_MODE" ]; then
                CURRENT_MODE="WATCH_MODE"
                log "MODE: WATCH_MODE"
                disable_vpn_lockdown_for_standby
            fi
        fi
    fi
}

daemon_loop() {
    acquire_lock
    decommission_legacy_daemons

    echo "auto" > "$PROFILE_FILE" 2>/dev/null || true

    log "════════ APE UHDX DAEMON - SENTINEL UNIFICADO v6.0 START ════════"
    log "Device=$(getprop ro.product.model 2>/dev/null) Android=$(getprop ro.build.version.release 2>/dev/null) RAM=$(get_mem_mb MemTotal)MB"

    apply_system_baselines
    apply_tcp_tuning
    enforce_picture_quality
    soft_cleanup

    WOKE_BY_USR1=0
    trap 'WOKE_BY_USR1=1; log "SIGNAL: USR1 instant manifest/PQ apply"' USR1

    LAST_PQ=0
    LAST_BASELINE=0
    LAST_METRIC=0
    LAST_HASH_CHECK=0
    LAST_HEARTBEAT=0

    while true; do
        now=$(date +%s 2>/dev/null || echo 0)

        handle_mode_transition "$now"
        pull_manifest_if_changed "$now"

        if [ -f "$MANIFEST_TRIGGER" ] || [ "$WOKE_BY_USR1" = "1" ]; then
            rm -f "$MANIFEST_TRIGGER" 2>/dev/null
            WOKE_BY_USR1=0
            enforce_quality_manifest
            enforce_picture_quality
            LAST_PQ="$now"
        fi

        if [ $((now - LAST_BASELINE)) -ge "$BASELINE_INTERVAL" ] 2>/dev/null; then
            apply_system_baselines
            apply_tcp_tuning
            LAST_BASELINE="$now"
        fi

        if [ $((now - LAST_PQ)) -ge "$PQ_INTERVAL" ] 2>/dev/null; then
            enforce_picture_quality
            enforce_quality_manifest
            LAST_PQ="$now"
        fi

        calculate_throughput

        if [ "$CURRENT_MODE" = "ACTIVE_PLAYER_MODE" ]; then
            if [ $((now - LAST_METRIC)) -ge "$METRIC_INTERVAL" ] 2>/dev/null; then
                update_network_metrics
                LAST_METRIC="$now"
            fi
            enforce_vpn_active
            restart_vpn_if_needed
        fi

        mem=$(get_mem_mb MemAvailable)
        if [ "$mem" -lt "$HARD_LIMIT_MB" ] 2>/dev/null; then
            hard_cleanup
        elif [ "$mem" -lt "$SOFT_LIMIT_MB" ] 2>/dev/null; then
            soft_cleanup
        fi

        send_heartbeat "$now"

        if [ "$CURRENT_MODE" = "ACTIVE_PLAYER_MODE" ]; then
            sleep "$ACTIVE_INTERVAL"
        else
            sleep "$WATCH_INTERVAL"
        fi
    done
}

print_status() {
    echo "════════════════════════════════════════════════════"
    echo " APE UHDX — DAEMON - SENTINEL UNIFICADO v6.0"
    echo "════════════════════════════════════════════════════"
    if [ -f "$LOCK" ]; then
        p=$(cat "$LOCK" 2>/dev/null)
        if is_alive_pid "$p"; then
            echo "Daemon: RUNNING pid=$p"
        else
            echo "Daemon: DEAD stale_lock=$p"
        fi
    else
        echo "Daemon: NOT RUNNING"
    fi
    echo "Profile: $(detect_profile)"
    echo "MemAvailable: $(get_mem_mb MemAvailable)MB"
    echo "tun0: $(if ip addr show tun0 >/dev/null 2>&1; then echo UP; else echo DOWN; fi)"
    echo "Foreground player: $(get_foreground_package)"
    echo ""
    echo "AI/PQ/HDR:"
    for item in "global ai_sr_level" "global aipq_enable" "system aisr_enable" "global hdr_conversion_mode" "global always_hdr" "global peak_luminance" "global color_mode_ycbcr422" "system screen_brightness"; do
        ns=$(echo "$item" | awk '{print $1}')
        key=$(echo "$item" | awk '{print $2}')
        val=$(settings get "$ns" "$key" 2>/dev/null)
        echo "  $ns.$key=$val"
    done
    echo ""
    echo "Last log:"
    tail -20 "$LOG" 2>/dev/null
    echo "════════════════════════════════════════════════════"
}

stop_daemon() {
    if [ -f "$LOCK" ]; then
        p=$(cat "$LOCK" 2>/dev/null)
        if is_alive_pid "$p"; then
            kill "$p" 2>/dev/null
            sleep 1
            is_alive_pid "$p" && kill -9 "$p" 2>/dev/null
        fi
        rm -f "$LOCK" 2>/dev/null
        echo "STOPPED"
    else
        echo "NOT RUNNING"
    fi
}

install_self() {
    chmod 755 "$SCRIPT" 2>/dev/null
    decommission_legacy_daemons
    enforce_picture_quality
    apply_system_baselines
    apply_tcp_tuning
    echo "INSTALL OK. Start with: nohup $SCRIPT daemon >/dev/null 2>&1 &"
}

selftest() {
    echo "Shell: OK"
    echo "Date: $(date 2>/dev/null)"
    echo "Device: $(getprop ro.product.model 2>/dev/null)"
    echo "Profile: $(detect_profile)"
    echo "MemAvailable: $(get_mem_mb MemAvailable)MB"
    echo "tun0: $(if ip addr show tun0 >/dev/null 2>&1; then echo UP; else echo DOWN; fi)"
    echo "PlayerFG: $(get_foreground_package)"
}

case "${1:-daemon}" in
    daemon|start)
        daemon_loop
        ;;
    install)
        install_self
        ;;
    apply|pq|quality)
        enforce_picture_quality
        enforce_quality_manifest
        print_status
        ;;
    manifest-now)
        echo 1 > "$MANIFEST_TRIGGER"
        if [ -f "$LOCK" ]; then
            p=$(cat "$LOCK" 2>/dev/null)
            is_alive_pid "$p" && kill -USR1 "$p" 2>/dev/null
        fi
        echo "Manifest/PQ apply requested."
        ;;
    profile-sdr)
        echo "sdr" > "$PROFILE_FILE"
        enforce_picture_quality
        echo "Profile forced to SDR safe."
        ;;
    profile-hdr)
        echo "hdr" > "$PROFILE_FILE"
        enforce_picture_quality
        echo "Profile forced to HDR."
        ;;
    profile-auto)
        echo "auto" > "$PROFILE_FILE"
        enforce_picture_quality
        echo "Profile set to AUTO."
        ;;
    cleanup)
        soft_cleanup
        hard_cleanup
        echo "MemAvailable: $(get_mem_mb MemAvailable)MB"
        ;;
    status)
        print_status
        ;;
    stop)
        stop_daemon
        ;;
    selftest)
        selftest
        ;;
    *)
        echo "Usage: $0 {daemon|install|apply|manifest-now|profile-sdr|profile-hdr|profile-auto|cleanup|status|stop|selftest}"
        exit 1
        ;;
esac
