#!/system/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# DAEMON - SENTINEL v5.4 — Event-Driven IPTV Flow Controller
# ═══════════════════════════════════════════════════════════════════════════
# Monitors the entire signal path on the Android TV Box:
#   1. Operating Modes: ACTIVE_PLAYER_MODE, WATCH_MODE, EMERGENCY_RECOVERY_MODE
#   2. CPU & RAM: Keep memory free, drops caches under limit
#   3. VPN Tunnel: Keep tun0 alive via v2rayNG
#   4. QoS / Network: Real-time throughput, packet loss, and jitter checks
#   5. SRE Integration: Async trigger of VPS recovery routines via cURL/wget
# ═══════════════════════════════════════════════════════════════════════════

# ─── CONFIG ───────────────────────────────────────────────────────────────
LOCKFILE="/data/local/tmp/ape-ram-guardian.lock"
LOGFILE="/data/local/tmp/ape-sentinel.log"
MANIFEST_CACHE="/data/local/tmp/quality-manifest.json"
MANIFEST_HASH="/data/local/tmp/quality-manifest.hash"
MANIFEST_TRIGGER="/data/local/tmp/ape-qm-apply-now"

POLL_INTERVAL=20
SOFT_LIMIT_MB=200
HARD_LIMIT_MB=100
MAX_LOG_LINES=500
VPN_RESTART_COOLDOWN=120
LAST_VPN_RESTART=0

CURL_BIN="/data/local/tmp/curl"

VPS_IP="178.156.147.234"
IPTV_HOSTS="nfqdeuxu.x1megaott.online tivigo.cc line.tivi-ott.net"
IPTV_PLAYERS="studio.scillarium.ottnavigator ar.tvplayer.tv"

PROTECTED="com.v2ray.ang studio.scillarium.ottnavigator ar.tvplayer.tv com.wireguard.android com.android.systemui com.android.providers.tv com.google.android.apps.tv.launcherx android"
KILL_TARGETS="com.cbs.ott ar.tvplayer.tv com.google.android.youtube.tv com.google.android.apps.youtube.unplugged com.amazon.amazonvideo.livingroom com.google.android.play.games com.android.chrome com.android.vending com.google.android.tvrecommendations com.rma.speedtesttv tv.pluto.android com.surfshark.vpnclient.android com.google.android.gms.unstable"

HEARTBEAT_URL="https://iptv-ape.duckdns.org/prisma/api/prisma-adb-quality.php?action=guardian_heartbeat"
HEARTBEAT_CYCLE=0

# ─── STATE VARIABLES ──────────────────────────────────────────────────────
CURRENT_MODE="WATCH_MODE"
WAKE_WINDOW_EXPIRE=0
THROUGHPUT=0
PACKET_LOSS=0
JITTER=0
AVG_RTT=0
rx_prev=""
time_prev=""
LAST_METRICS_CHECK=0

# ─── LOGGING ──────────────────────────────────────────────────────────────
log() {
    local ts
    ts=$(date '+%m-%d %H:%M:%S' 2>/dev/null || echo "?")
    echo "[$ts] $1" >> "$LOGFILE" 2>/dev/null
    local lines
    lines=$(wc -l < "$LOGFILE" 2>/dev/null || echo 0)
    [ "$lines" -gt "$MAX_LOG_LINES" ] 2>/dev/null && {
        tail -n 200 "$LOGFILE" > "${LOGFILE}.tmp" 2>/dev/null
        mv "${LOGFILE}.tmp" "$LOGFILE" 2>/dev/null
    }
}

# ─── NETWORK METRICS ──────────────────────────────────────────────────────
get_rx_bytes() {
    for iface in tun0 wlan0 eth0; do
        if [ -d "/sys/class/net/$iface" ]; then
            cat "/sys/class/net/$iface/statistics/rx_bytes" 2>/dev/null && return
        fi
    done
    if [ -f "/proc/net/dev" ]; then
        awk '/tun0|wlan0|eth0/{print $2; exit}' /proc/net/dev 2>/dev/null
    fi
}

calculate_throughput() {
    local rx_now
    rx_now=$(get_rx_bytes)
    local now
    now=$(date +%s)
    if [ -n "$rx_prev" ] && [ -n "$rx_now" ] && [ "$now" -gt "$time_prev" ] 2>/dev/null; then
        local diff=$((rx_now - rx_prev))
        local sec=$((now - time_prev))
        THROUGHPUT=$((diff / 1024 / sec))
    fi
    rx_prev=$rx_now
    time_prev=$now
}

# ─── VPS SRE TRIGGER ──────────────────────────────────────────────────────
trigger_vps_recovery() {
    local routine="$1"
    log "SENTINEL: Alert declared! Triggering VPS routine: $routine"
    local url="https://iptv-ape.duckdns.org/prisma/api/prisma-adb-quality.php?action=sentinel_trigger&routine=${routine}"
    
    # Fire and forget with 2s timeout
    $CURL_BIN -k -sf -m 2 -o /dev/null "$url" >/dev/null 2>&1 \
      || wget -q -T 2 -O /dev/null "$url" 2>/dev/null \
      || true
}

# ─── MEMORY FUNCTIONS ────────────────────────────────────────────────────
get_mem_mb() {
    grep "$1" /proc/meminfo 2>/dev/null | awk '{printf "%d", $2/1024}'
}

is_protected() {
    echo "$PROTECTED" | grep -wq "$1" 2>/dev/null
}

soft_cleanup() {
    local before
    before=$(get_mem_mb MemAvailable)
    log "RAM_SOFT: ${before}MB — cleaning background apps"
    for pkg in $KILL_TARGETS; do
        pidof "$pkg" >/dev/null 2>&1 && { am force-stop "$pkg" 2>/dev/null; log "  KILL: $pkg"; }
    done
    for pkg in $(pm list packages -3 2>/dev/null | cut -d: -f2); do
        is_protected "$pkg" && continue
        local pid
        pid=$(pidof "$pkg" 2>/dev/null) || continue
        local adj
        adj=$(cat /proc/$pid/oom_score_adj 2>/dev/null || echo 0)
        [ "$adj" -gt 200 ] 2>/dev/null && {
            am force-stop "$pkg" 2>/dev/null
            log "  KILL_BG: $pkg (adj=$adj)"
        }
    done
    local after
    after=$(get_mem_mb MemAvailable)
    log "RAM_SOFT: ${before}→${after}MB (+$((after-before))MB)"
}

hard_cleanup() {
    local before
    before=$(get_mem_mb MemAvailable)
    log "RAM_NUCLEAR: ${before}MB — CRITICAL CLEANUP"
    for pkg in $(pm list packages -3 2>/dev/null | cut -d: -f2); do
        is_protected "$pkg" && continue
        am force-stop "$pkg" 2>/dev/null
    done
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
    echo 1 > /proc/sys/vm/compact_memory 2>/dev/null
    for svc in com.google.android.gms.unstable com.google.process.gapps; do
        local p
        p=$(pidof "$svc" 2>/dev/null) && kill -9 $p 2>/dev/null
    done
    local after
    after=$(get_mem_mb MemAvailable)
    log "RAM_NUCLEAR: ${before}→${after}MB (+$((after-before))MB)"
}

# ─── FOREGROUND DETECTION ────────────────────────────────────────────────
get_foreground_package() {
    dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | grep -oE 'studio.scillarium.ottnavigator|ar.tvplayer.tv' | head -1
}

is_player_foreground() {
    dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | grep -qE 'studio.scillarium.ottnavigator|ar.tvplayer.tv'
}

disable_vpn_lockdown() {
    local fixed=0
    local aov
    aov=$(settings get secure always_on_vpn_app 2>/dev/null)
    if [ "$aov" = "com.v2ray.ang" ]; then
        settings delete secure always_on_vpn_app 2>/dev/null
        fixed=$((fixed+1))
    fi
    local lock
    lock=$(settings get secure always_on_vpn_lockdown 2>/dev/null)
    if [ "$lock" = "1" ]; then
        settings put secure always_on_vpn_lockdown 0 2>/dev/null
        fixed=$((fixed+1))
    fi
    local v2pid
    v2pid=$(pidof com.v2ray.ang 2>/dev/null)
    if [ -n "$v2pid" ]; then
        log "STANDBY: Stopping v2rayNG to release routing"
        am force-stop com.v2ray.ang 2>/dev/null
    fi
    [ $fixed -gt 0 ] && log "STANDBY: Netflix-safe routing restored"
}

# ─── VPN TUNNEL HEALTH ──────────────────────────────────────────────────
check_vpn() {
    local result
    result=$(ping -c 1 -W 3 nfqdeuxu.x1megaott.online 2>&1 | head -2)
    if echo "$result" | grep -q "bytes from"; then
        local ttl
        ttl=$(echo "$result" | grep -oE 'ttl=[0-9]+' | cut -d= -f2 || echo 0)
        if [ "$ttl" -ge 60 ] 2>/dev/null; then
            return 0
        else
            log "VPN: WARN TTL=$ttl — bypassing VPS routing"
        fi
        return 0
    fi

    local now
    now=$(date +%s 2>/dev/null || echo 0)
    local elapsed=$((now - LAST_VPN_RESTART))
    if [ "$elapsed" -lt "$VPN_RESTART_COOLDOWN" ] 2>/dev/null; then
        return 1
    fi
    log "VPN: DOWN — restarting v2rayNG..."
    local active_player
    active_player=$(get_foreground_package)
    LAST_VPN_RESTART=$now
    am force-stop com.v2ray.ang 2>/dev/null
    sleep 2
    am start -n com.v2ray.ang/.ui.MainActivity 2>/dev/null
    sleep 4
    input tap 1832 968 2>/dev/null
    sleep 8
    result=$(ping -c 1 -W 3 nfqdeuxu.x1megaott.online 2>&1)
    if echo "$result" | grep -q "bytes from"; then
        log "VPN: RESTORED via restart"
        if [ -n "$active_player" ]; then
            am start -a android.intent.action.MAIN -n "${active_player}/.MainActivity" 2>/dev/null
        else
            input keyevent KEYCODE_HOME 2>/dev/null
        fi
    else
        log "VPN: CRITICAL — still down after restart"
        return 1
    fi
    return 0
}

enforce_v2ray_immortal() {
    local fixed=0
    local aov=$(settings get secure always_on_vpn_app 2>/dev/null)
    [ "$aov" != "com.v2ray.ang" ] && {
        settings put secure always_on_vpn_app com.v2ray.ang 2>/dev/null
        fixed=$((fixed+1))
    }
    local lock=$(settings get secure always_on_vpn_lockdown 2>/dev/null)
    [ "$lock" != "1" ] && {
        settings put secure always_on_vpn_lockdown 1 2>/dev/null
        fixed=$((fixed+1))
    }
    cmd deviceidle whitelist +com.v2ray.ang 2>/dev/null
    local v2pid=$(pidof com.v2ray.ang 2>/dev/null)
    if [ -n "$v2pid" ]; then
        echo -17 > /proc/$v2pid/oom_adj 2>/dev/null
        echo -1000 > /proc/$v2pid/oom_score_adj 2>/dev/null
    fi
    [ $fixed -gt 0 ] && log "V2RAY: Enforced $fixed immortality settings"
}

# ─── BASELINES & NETWORK TUNING ──────────────────────────────────────────
apply_system_baselines() {
    local fixed=0
    local sto=$(settings get system screen_off_timeout 2>/dev/null)
    [ "$sto" != "2147483647" ] && { settings put system screen_off_timeout 2147483647 2>/dev/null; fixed=$((fixed+1)); }
    local sow=$(settings get global stay_on_while_plugged_in 2>/dev/null)
    [ "$sow" != "3" ] && { settings put global stay_on_while_plugged_in 3 2>/dev/null; fixed=$((fixed+1)); }

    # Zero animations
    for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
        local val=$(settings get global "$scale" 2>/dev/null)
        [ "$val" != "0.0" ] && { settings put global "$scale" 0.0 2>/dev/null; fixed=$((fixed+1)); }
    done

    # WiFi hardening
    for setting in wifi_sleep_policy=2 wifi_scan_always_enabled=0 wifi_suspend_optimizations_enabled=0 wifi_networks_available_notification_on=0 wifi_watchdog_poor_network_test_enabled=0 network_scoring_ui_enabled=0; do
        local k=${setting%=*}
        local v=${setting#*=}
        local curr=$(settings get global "$k" 2>/dev/null)
        [ "$curr" != "$v" ] && { settings put global "$k" "$v" 2>/dev/null; fixed=$((fixed+1)); }
    done

    local rwnd=$(settings get global tcp_default_init_rwnd 2>/dev/null)
    [ "$rwnd" != "60" ] && { settings put global tcp_default_init_rwnd 60 2>/dev/null; fixed=$((fixed+1)); }

    # DNS settings
    local dns=$(settings get global private_dns_mode 2>/dev/null)
    [ "$dns" != "hostname" ] && { settings put global private_dns_mode hostname 2>/dev/null; fixed=$((fixed+1)); }
    local dnss=$(settings get global private_dns_specifier 2>/dev/null)
    [ "$dnss" != "dns.google" ] && { settings put global private_dns_specifier dns.google 2>/dev/null; fixed=$((fixed+1)); }

    [ "$fixed" -gt 0 ] && log "BASELINES: Restored $fixed drifting system settings"
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

# ─── QUALITY MANIFEST ENFORCEMENT ────────────────────────────────────────
enforce_quality_manifest() {
    local source="${1:-drift}"
    local qm_file="$MANIFEST_CACHE"
    [ ! -f "$qm_file" ] && return 0

    settings list global > /data/local/tmp/.global_settings 2>/dev/null
    settings list system > /data/local/tmp/.system_settings 2>/dev/null
    settings list secure > /data/local/tmp/.secure_settings 2>/dev/null

    local drift_list
    drift_list=$(awk '
        BEGIN { ns_val = ""; key_val = "" }
        FILENAME == "/data/local/tmp/.global_settings" {
            idx = index($0, "="); if (idx > 0) current["global", substr($0, 1, idx-1)] = substr($0, idx+1); next
        }
        FILENAME == "/data/local/tmp/.system_settings" {
            idx = index($0, "="); if (idx > 0) current["system", substr($0, 1, idx-1)] = substr($0, idx+1); next
        }
        FILENAME == "/data/local/tmp/.secure_settings" {
            idx = index($0, "="); if (idx > 0) current["secure", substr($0, 1, idx-1)] = substr($0, idx+1); next
        }
        {
            split($0, parts, "\"")
            if (parts[2] == "ns") { ns_val = parts[4] }
            else if (parts[2] == "key") { key_val = parts[4] }
            else if (parts[2] == "value") {
                val_val = parts[4]
                if (val_val == "" && parts[3] != "") {
                    gsub(/[[:space:] :,]/, "", parts[3])
                    val_val = parts[3]
                }
                if (ns_val != "" && key_val != "") {
                    curr = current[ns_val, key_val]
                    if (curr != val_val) print ns_val " " key_val " " val_val " " (curr != "" ? curr : "NULL")
                    ns_val = ""; key_val = ""
                }
            }
        }
    ' /data/local/tmp/.global_settings /data/local/tmp/.system_settings /data/local/tmp/.secure_settings "$qm_file" 2>/dev/null)

    rm -f /data/local/tmp/.global_settings /data/local/tmp/.system_settings /data/local/tmp/.secure_settings

    [ -z "$drift_list" ] && return 0

    local total_corrected=0
    echo "$drift_list" | while read -r ns key value current; do
        [ -z "$ns" ] || [ -z "$key" ] || [ -z "$value" ] && continue
        if [ "$source" != "frontend" ] && [ "$key" = "peak_luminance" ] && [ "$value" = "10000" ] && [ "$current" = "1000" ]; then
            continue
        fi
        settings put "$ns" "$key" "$value" 2>/dev/null
        total_corrected=$((total_corrected + 1))
    done

    [ "$total_corrected" -gt 0 ] && log "SENTINEL: Restored $total_corrected drifting manifest settings"
    return 0
}

# ─── TELEMETRY & HEARTBEAT ───────────────────────────────────────────────
send_heartbeat() {
    HEARTBEAT_CYCLE=$((HEARTBEAT_CYCLE + 1))
    # Heartbeat interval matched to loop speeds
    if [ "$CURRENT_MODE" = "ACTIVE_PLAYER_MODE" ]; then
        # Send heartbeat every 15 seconds in active player mode
        [ $((HEARTBEAT_CYCLE % 15)) -ne 0 ] && return 0
    else
        # Send heartbeat every cycle (20s) in watch mode
        [ $((HEARTBEAT_CYCLE % 1)) -ne 0 ] && return 0
    fi

    local mem_avail vpn player rssi mhash up
    mem_avail=$(get_mem_mb MemAvailable 2>/dev/null || echo 0)
    vpn="DOWN"
    ip addr show tun0 >/dev/null 2>&1 && vpn="UP"
    player="OFF"
    pidof studio.scillarium.ottnavigator >/dev/null 2>&1 && player="ON"
    rssi=$(dumpsys wifi 2>/dev/null | grep -oE 'rssi=-?[0-9]+' | head -1 | cut -d= -f2 || echo "?")
    mhash=""
    [ -f "$MANIFEST_HASH" ] && mhash=$(cat "$MANIFEST_HASH" 2>/dev/null)
    up=$(cat /proc/uptime 2>/dev/null | cut -d. -f1 || echo 0)

    local payload="{\"pid\":$$,\"ram_avail_mb\":${mem_avail},\"vpn_status\":\"${vpn}\",\"player_status\":\"${player}\",\"wifi_rssi\":\"${rssi}\",\"manifest_hash\":\"${mhash}\",\"cycle\":${HEARTBEAT_CYCLE},\"uptime\":${up},\"mode\":\"${CURRENT_MODE}\",\"throughput_kbps\":${THROUGHPUT},\"packet_loss\":${PACKET_LOSS},\"jitter_ms\":${JITTER}}"

    $CURL_BIN -k -sf -m 3 -X POST -H "Content-Type: application/json" -d "$payload" "$HEARTBEAT_URL" >/dev/null 2>&1 \
      || wget -q -T 3 --post-data="$payload" --header="Content-Type: application/json" -O /dev/null "$HEARTBEAT_URL" 2>/dev/null \
      || true
}

# ─── MAIN DAEMON LOOP ─────────────────────────────────────────────────────
daemon_main() {
    if [ -f "$LOCKFILE" ]; then
        local old_pid=$(cat "$LOCKFILE" 2>/dev/null)
        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            echo "Daemon - Sentinel already running (pid=$old_pid)"
            exit 0
        fi
        rm -f "$LOCKFILE"
    fi
    echo $$ > "$LOCKFILE"

    log "═══ DAEMON - SENTINEL v5.4 ACTIVE ═══"
    log "Device: $(getprop ro.product.model 2>/dev/null)"
    log "RAM Total: $(get_mem_mb MemTotal)MB"
    log "VPN Target: v2rayNG | VPS Autopista: $VPS_IP"

    # Initial baselines
    apply_system_baselines
    apply_tcp_tuning
    soft_cleanup

    WOKE_BY_USR1=0
    trap 'log "SENTINEL: USR1 signal received. Forcing instant manifest synchronization."; WOKE_BY_USR1=1; [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null' USR1

    local cycle=0
    local LAST_HASH_CHECK=0
    while true; do
        # ── PULL MANIFEST HASH FROM VPS ──
        local now
        now=$(date +%s 2>/dev/null || echo 0)
        local check_interval=20
        if [ "$CURRENT_MODE" = "ACTIVE_PLAYER_MODE" ]; then
            check_interval=5
        fi
        if [ $((now - LAST_HASH_CHECK)) -ge $check_interval ] 2>/dev/null; then
            LAST_HASH_CHECK=$now
            local hash_url="https://iptv-ape.duckdns.org/prisma/api/prisma-adb-quality.php?action=manifest_hash"
            local remote_json
            remote_json=$($CURL_BIN -k -sf -m 3 "$hash_url" 2>/dev/null || wget -q -T 3 -O - "$hash_url" 2>/dev/null || echo "")
            if [ -n "$remote_json" ]; then
                local remote_hash
                remote_hash=$(echo "$remote_json" | grep -oE '"manifest_hash":"[a-f0-9]+"' | cut -d'"' -f4)
                local local_hash=""
                [ -f "$MANIFEST_HASH" ] && local_hash=$(cat "$MANIFEST_HASH" 2>/dev/null | tr -d '[:space:]')
                if [ -n "$remote_hash" ] && [ "$remote_hash" != "$local_hash" ]; then
                    log "SENTINEL: Remote manifest hash mismatch ($remote_hash != $local_hash). Pulling new manifest..."
                    local download_url="https://iptv-ape.duckdns.org/prisma/quality-manifest.json"
                    local temp_qm="/data/local/tmp/quality-manifest.json.tmp"
                    if $CURL_BIN -k -sf -m 5 -o "$temp_qm" "$download_url" 2>/dev/null || wget -q -T 5 -O "$temp_qm" "$download_url" 2>/dev/null; then
                        if [ -f "$temp_qm" ] && grep -q '{' "$temp_qm"; then
                            mv "$temp_qm" "$MANIFEST_CACHE"
                            echo "$remote_hash" > "$MANIFEST_HASH"
                            log "SENTINEL: Deployed new manifest from VPS. Triggering application."
                            echo 1 > "$MANIFEST_TRIGGER"
                        else
                            log "SENTINEL: Downloaded manifest is invalid JSON."
                            rm -f "$temp_qm"
                        fi
                    else
                        log "SENTINEL: Failed to download manifest from VPS."
                    fi
                fi
            fi
        fi

        # Immediate manifest reload check
        if [ -f "$MANIFEST_TRIGGER" ] || [ "$WOKE_BY_USR1" = "1" ]; then
            rm -f "$MANIFEST_TRIGGER" 2>/dev/null
            WOKE_BY_USR1=0
            enforce_quality_manifest "frontend"
            apply_system_baselines
            apply_tcp_tuning
            local new_hash
            new_hash=$(md5sum "$MANIFEST_CACHE" 2>/dev/null | cut -d' ' -f1)
            [ -n "$new_hash" ] && echo "$new_hash" > "$MANIFEST_HASH"
            cycle=0
        fi

        # Sleep logic matching polling intervals
        local slept=0
        while [ "$slept" -lt "$POLL_INTERVAL" ]; do
            if [ -f "$MANIFEST_TRIGGER" ] || [ "$WOKE_BY_USR1" = "1" ]; then
                break
            fi
            sleep 1 &
            SLEEP_PID=$!
            wait "$SLEEP_PID" 2>/dev/null
            slept=$((slept + 1))
        done

        cycle=$((cycle + 1))

        if [ -f "$MANIFEST_TRIGGER" ] || [ "$WOKE_BY_USR1" = "1" ]; then
            continue
        fi

        # ── MODE TRANSITIONS ──
        if is_player_foreground; then
            WAKE_WINDOW_EXPIRE=$(( $(date +%s) + 45 ))
            if [ "$CURRENT_MODE" != "ACTIVE_PLAYER_MODE" ]; then
                CURRENT_MODE="ACTIVE_PLAYER_MODE"
                POLL_INTERVAL=1
                log "SENTINEL: Transitioned to ACTIVE_PLAYER_MODE (POLL=1s)"
            fi
        else
            local now=$(date +%s)
            if [ "$now" -gt "$WAKE_WINDOW_EXPIRE" ]; then
                if [ "$CURRENT_MODE" != "WATCH_MODE" ]; then
                    CURRENT_MODE="WATCH_MODE"
                    POLL_INTERVAL=20
                    log "SENTINEL: Transitioned to WATCH_MODE (POLL=20s)"
                    disable_vpn_lockdown
                fi
            fi
        fi

        # Calculate network throughput on active interface
        calculate_throughput

        # ── METRICS ASSESSMENT & SRE RECOVERY GATES ──
        if [ "$CURRENT_MODE" = "ACTIVE_PLAYER_MODE" ]; then
            local now=$(date +%s)
            if [ $((now - LAST_METRICS_CHECK)) -ge 3 ]; then
                LAST_METRICS_CHECK=$now
                
                # Active ping validation
                local ping_res=$(ping -c 3 -W 1 "$VPS_IP" 2>&1)
                PACKET_LOSS=$(echo "$ping_res" | grep -oE '[0-9]+% packet loss' | grep -oE '[0-9]+' || echo 100)
                
                local rtt_line=$(echo "$ping_res" | grep -E 'rtt|round-trip')
                if [ -n "$rtt_line" ]; then
                    AVG_RTT=$(echo "$rtt_line" | awk -F'/' '{print $5}' | cut -d. -f1 || echo 0)
                    JITTER=$(echo "$rtt_line" | awk -F'/' '{print $7}' | cut -d. -f1 || echo 0)
                else
                    AVG_RTT=999
                    JITTER=999
                fi

                # SRE Trigger Conditions
                local freeze_risk=0
                local routine=""
                
                if [ "$PACKET_LOSS" -ge 15 ]; then
                    log "SENTINEL: Packet loss too high (${PACKET_LOSS}%). Declaring emergency."
                    freeze_risk=1
                    routine="wg_failover"
                elif [ "$JITTER" -ge 150 ]; then
                    log "SENTINEL: Jitter too high (${JITTER}ms). Declaring emergency."
                    freeze_risk=1
                    routine="route_diagnose"
                fi

                if ! ip addr show tun0 >/dev/null 2>&1; then
                    log "SENTINEL: VPN tun0 interface DOWN."
                    freeze_risk=1
                    routine="wg_failover"
                fi

                if [ "$freeze_risk" -eq 1 ]; then
                    CURRENT_MODE="EMERGENCY_RECOVERY_MODE"
                    trigger_vps_recovery "$routine"
                    # Reset mode quickly to verify recovery effect
                    CURRENT_MODE="ACTIVE_PLAYER_MODE"
                fi
            fi
        fi

        # ── RAM MONITORING ──
        local mem=$(get_mem_mb MemAvailable)
        if [ "$mem" -lt "$HARD_LIMIT_MB" ] 2>/dev/null; then
            hard_cleanup
        elif [ "$mem" -lt "$SOFT_LIMIT_MB" ] 2>/dev/null; then
            soft_cleanup
        fi

        # ── TUNNEL ASSURANCE ──
        if [ "$CURRENT_MODE" = "ACTIVE_PLAYER_MODE" ]; then
            check_vpn
            enforce_v2ray_immortal
        fi

        enforce_quality_manifest
        send_heartbeat
    done
}

# ─── IMAGE FACTORY DEFAULTS (2026-05-21) ─────────────────────────────────
# Recommended picture baseline (AI / HDR / Color / Brightness / GPU).
# `ape-sentinel.sh defaults` re-applies all 30 in one shot (restore-to-default).
IMAGE_DEFAULTS="
system|aipq_enable|1
system|aisr_enable|1
system|ai_pq_mode|3
system|ai_sr_mode|3
global|ai_pic_mode|3
global|ai_sr_level|3
global|pq_ai_dnr_enable|1
global|pq_ai_fbc_enable|1
global|pq_ai_sr_enable|1
global|pq_nr_enable|1
global|pq_sharpness_enable|1
global|pq_dnr_enable|1
global|smart_illuminate_enabled|1
global|hdr_conversion_mode|1
global|hdr_output_type|4
global|hdr_force_conversion_type|-1
global|hdr_brightness_boost|100
global|sdr_brightness_in_hdr|100
global|peak_luminance|8000
global|pq_hdr_enable|1
global|pq_hdr_mode|1
global|always_hdr|0
global|hdmi_color_space|2
global|color_depth|10
global|color_mode_ycbcr422|1
global|video_brightness|100
system|screen_brightness|255
global|force_gpu_rendering|1
global|force_hw_ui|1
global|hardware_accelerated_rendering_enabled|1
"
reset_image_defaults() {
    local n=0
    printf '%s\n' "$IMAGE_DEFAULTS" | while IFS='|' read -r ns key val; do
        [ -z "$key" ] && continue
        settings put "$ns" "$key" "$val" 2>/dev/null
        n=$((n + 1))
    done
    log "DEFAULTS: re-applied image factory baseline (AI/HDR/color/brightness/GPU)"
}

# ─── COMMANDS ────────────────────────────────────────────────────────────
case "${1:-daemon}" in
    daemon) daemon_main ;;
    defaults) reset_image_defaults; echo "Image factory defaults re-applied (30 settings)." ;;
    status)
        echo "=== Daemon - Sentinel v5.4 ==="
        if [ -f "$LOCKFILE" ]; then
            local p=$(cat "$LOCKFILE" 2>/dev/null)
            kill -0 "$p" 2>/dev/null && echo "RUNNING (pid=$p, mode=$CURRENT_MODE)" || echo "DEAD (stale lock)"
        else echo "NOT RUNNING"; fi
        echo "MemAvail: $(get_mem_mb MemAvailable)MB"
        echo "VPN tun0: $(if ip addr show tun0 >/dev/null 2>&1; then echo UP; else echo DOWN; fi)"
        tail -15 "$LOGFILE" 2>/dev/null ;;
    stop)
        [ -f "$LOCKFILE" ] && { kill $(cat "$LOCKFILE" 2>/dev/null) 2>/dev/null; rm -f "$LOCKFILE"; echo "STOPPED"; } ;;
    cleanup) soft_cleanup; hard_cleanup; echo "MemAvail: $(get_mem_mb MemAvailable)MB" ;;
    *) echo "Usage: $0 {daemon|status|stop|cleanup}" ;;
esac
