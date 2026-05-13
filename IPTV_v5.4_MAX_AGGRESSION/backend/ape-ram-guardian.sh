#!/system/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# APE STREAMING GUARDIAN v3.0 — Total IPTV Flow Controller
# ═══════════════════════════════════════════════════════════════════════════
# Controls the ENTIRE streaming pipeline on the device:
#   1. RAM — Never let it choke (auto-cleanup at threshold)
#   2. VPN TUNNEL — Ensure tun0 stays UP (auto-restart v2rayNG)
#   3. TCP/NETWORK — Aggressive buffers synced with VPS BBR/sysctl
#   4. DNS — Verify IPTV domains resolve through VPS pipeline
#   5. BANDWIDTH — Kill bandwidth thieves, prioritize IPTV
#   6. WIFI — Monitor signal, warn on degradation
#   7. PLAYER — Ensure OTT Navigator stays alive and healthy
#
# Synced with VPS NET SHIELD AUTOPISTA rules:
#   - BBR congestion control on VPS side
#   - 128MB socket buffers on VPS side
#   - tcp_fastopen=3, tcp_slow_start_after_idle=0
#   - Device side mirrors these with max allowed settings
#
# Deploy ONCE: adb push ape-ram-guardian.sh /data/local/tmp/
#              adb shell chmod 755 /data/local/tmp/ape-ram-guardian.sh
#              adb shell nohup /data/local/tmp/ape-ram-guardian.sh daemon >/dev/null 2>&1 &
#
# Then it runs FOREVER autonomously. Zero human intervention.
# ═══════════════════════════════════════════════════════════════════════════

# ─── CONFIG ───────────────────────────────────────────────────────────────
POLL_INTERVAL=15
SOFT_LIMIT_MB=200
HARD_LIMIT_MB=100
LOCKFILE="/data/local/tmp/ape-ram-guardian.lock"
LOGFILE="/data/local/tmp/ape-ram-guardian.log"
MAX_LOG_LINES=500
VPN_RESTART_COOLDOWN=120  # seconds between VPN restart attempts
LAST_VPN_RESTART=0

# VPS connection (for health probes)
VPS_IP="178.156.147.234"

# IPTV provider hosts to verify DNS pipeline
IPTV_HOSTS="nfqdeuxu.x1megaott.online tivigo.cc line.tivi-ott.net"

# Protected packages — NEVER kill
PROTECTED="com.v2ray.ang studio.scillarium.ottnavigator com.wireguard.android com.android.systemui com.android.providers.tv com.google.android.apps.tv.launcherx android"

# Kill targets — always kill when RAM is low
KILL_TARGETS="com.cbs.ott ar.tvplayer.tv com.google.android.youtube.tv com.google.android.apps.youtube.unplugged com.amazon.amazonvideo.livingroom com.google.android.play.games com.android.chrome com.android.vending com.google.android.tvrecommendations com.rma.speedtesttv tv.pluto.android com.surfshark.vpnclient.android com.google.android.gms.unstable"

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

# ─── MEMORY FUNCTIONS ────────────────────────────────────────────────────
get_mem_mb() {
    local key="$1"
    grep "$key" /proc/meminfo 2>/dev/null | awk '{printf "%d", $2/1024}'
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
    # Kill non-protected background apps with high oom_adj
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

# ─── VPN TUNNEL HEALTH (ping-based — v2rayNG uses Android VPN API) ──────
check_vpn() {
    # Test by pinging IPTV provider — if TTL=64 and <5ms, VPS tunnel is alive
    local result
    result=$(ping -c 1 -W 3 nfqdeuxu.x1megaott.online 2>&1 | head -2)
    if echo "$result" | grep -q "bytes from"; then
        local ttl
        ttl=$(echo "$result" | grep -oP 'ttl=\K\d+' || echo 0)
        if [ "$ttl" -ge 60 ] 2>/dev/null; then
            return 0  # TTL=64 = goes through VPS = GOOD
        else
            log "VPN: WARN TTL=$ttl — traffic may bypass VPS"
        fi
        return 0
    fi
    # Ping failed — VPN is down
    local now
    now=$(date +%s 2>/dev/null || echo 0)
    local elapsed=$((now - LAST_VPN_RESTART))
    if [ "$elapsed" -lt "$VPN_RESTART_COOLDOWN" ] 2>/dev/null; then
        log "VPN: DOWN (cooldown ${elapsed}s/${VPN_RESTART_COOLDOWN}s)"
        return 1
    fi
    log "VPN: DOWN — restarting v2rayNG..."
    LAST_VPN_RESTART=$now
    am force-stop com.v2ray.ang 2>/dev/null
    sleep 2
    am start -n com.v2ray.ang/.ui.MainActivity 2>/dev/null
    sleep 4
    # Click the FAB connect button (bounds [1776,912][1888,1024])
    input tap 1832 968 2>/dev/null
    sleep 8
    # Verify
    result=$(ping -c 1 -W 3 nfqdeuxu.x1megaott.online 2>&1)
    if echo "$result" | grep -q "bytes from"; then
        log "VPN: RESTORED via v2rayNG restart"
        input keyevent KEYCODE_HOME 2>/dev/null
    else
        log "VPN: STILL DOWN after restart — manual check needed"
        return 1
    fi
    return 0
}

# ─── DNS PIPELINE HEALTH ────────────────────────────────────────────────
check_dns() {
    local host
    host=$(echo "$IPTV_HOSTS" | awk '{print $1}')
    local result
    result=$(ping -c 1 -W 2 "$host" 2>&1 | head -1)
    if echo "$result" | grep -q "bytes from"; then
        local ttl
        ttl=$(echo "$result" | grep -oP 'ttl=\K\d+')
        local ms
        ms=$(echo "$result" | grep -oP 'time=\K[\d.]+')
        # TTL=64 and <5ms = going through VPS (correct)
        # TTL<60 and >20ms = going direct (BAD)
        if [ -n "$ttl" ] && [ "$ttl" -lt 60 ] 2>/dev/null; then
            log "DNS: WARNING $host TTL=$ttl — may bypass VPS!"
            return 1
        fi
        return 0
    else
        log "DNS: FAIL $host unreachable"
        return 1
    fi
}

# ─── TCP/NETWORK OPTIMIZATION (synced with VPS sysctl) ──────────────────
apply_network_optimization() {
    # TCP initial receive window — match VPS aggressiveness
    settings put global tcp_default_init_rwnd 60 2>/dev/null

    # WiFi never sleep — critical for persistent IPTV streaming
    settings put global wifi_sleep_policy 2 2>/dev/null

    # Disable WiFi scanning during playback — eliminates micro-drops
    settings put global wifi_scan_always_enabled 0 2>/dev/null

    # Disable captive portal — prevents DNS leaks and redirect loops
    settings put global captive_portal_detection_enabled 0 2>/dev/null

    # Stay on forever while plugged in
    settings put global stay_on_while_plugged_in 3 2>/dev/null
    settings put system screen_off_timeout 2147483647 2>/dev/null

    # Zero animations — save CPU for video decode
    settings put global window_animation_scale 0.0 2>/dev/null
    settings put global transition_animation_scale 0.0 2>/dev/null
    settings put global animator_duration_scale 0.0 2>/dev/null

    # Disable network scoring (prevents WiFi/mobile switching)
    settings put global network_scoring_ui_enabled 0 2>/dev/null
    settings put global wifi_watchdog_poor_network_test_enabled 0 2>/dev/null
    settings put global wifi_suspend_optimizations_enabled 0 2>/dev/null
    settings put global wifi_networks_available_notification_on 0 2>/dev/null

    # Aggressive background data restriction
    settings put global background_data_enabled 0 2>/dev/null

    # Kernel TCP tuning (best-effort — may need root)
    # Synced with VPS: tcp_slow_start_after_idle=0, tcp_fastopen=3
    echo 0 > /proc/sys/net/ipv4/tcp_slow_start_after_idle 2>/dev/null
    echo 3 > /proc/sys/net/ipv4/tcp_fastopen 2>/dev/null
    echo 1 > /proc/sys/net/ipv4/tcp_low_latency 2>/dev/null
    echo 1 > /proc/sys/net/ipv4/tcp_sack 2>/dev/null
    echo 1 > /proc/sys/net/ipv4/tcp_dsack 2>/dev/null
    echo 1 > /proc/sys/net/ipv4/tcp_tw_reuse 2>/dev/null
    echo 15 > /proc/sys/net/ipv4/tcp_fin_timeout 2>/dev/null
    # Increase socket buffers to match VPS capacity
    echo 4194304 > /proc/sys/net/core/rmem_max 2>/dev/null
    echo 4194304 > /proc/sys/net/core/wmem_max 2>/dev/null
    echo "4096 262144 4194304" > /proc/sys/net/ipv4/tcp_rmem 2>/dev/null
    echo "4096 262144 4194304" > /proc/sys/net/ipv4/tcp_wmem 2>/dev/null
    echo 4096 > /proc/sys/net/core/netdev_max_backlog 2>/dev/null

    log "NET: TCP/WiFi/kernel optimizations applied (synced with VPS BBR)"
}

# ─── APP PROTECTION ──────────────────────────────────────────────────────
apply_protections() {
    # Battery optimization whitelist
    dumpsys deviceidle whitelist +com.v2ray.ang >/dev/null 2>&1
    dumpsys deviceidle whitelist +studio.scillarium.ottnavigator >/dev/null 2>&1
    dumpsys deviceidle whitelist +com.wireguard.android >/dev/null 2>&1
    # Background execution
    cmd appops set com.v2ray.ang RUN_IN_BACKGROUND allow 2>/dev/null
    cmd appops set com.v2ray.ang RUN_ANY_IN_BACKGROUND allow 2>/dev/null
    cmd appops set studio.scillarium.ottnavigator RUN_IN_BACKGROUND allow 2>/dev/null
    cmd appops set studio.scillarium.ottnavigator RUN_ANY_IN_BACKGROUND allow 2>/dev/null
    log "PROTECT: VPN+Player whitelisted from OOM/Doze"
}

# ─── BANDWIDTH THIEVES ──────────────────────────────────────────────────
kill_bandwidth_thieves() {
    # Kill any app that might be consuming bandwidth (updates, syncs)
    for pkg in com.android.vending com.google.android.gms.unstable \
               com.google.android.youtube.tv com.amazon.amazonvideo.livingroom \
               tv.pluto.android com.rma.speedtesttv; do
        local pid
        pid=$(pidof "$pkg" 2>/dev/null) || continue
        am force-stop "$pkg" 2>/dev/null
        log "BW: Killed bandwidth thief $pkg"
    done
}

# ─── WIFI SIGNAL MONITOR ────────────────────────────────────────────────
check_wifi() {
    local rssi
    rssi=$(dumpsys wifi 2>/dev/null | grep -oP 'rssi=\K-?\d+' | tail -1)
    if [ -n "$rssi" ]; then
        # RSSI: >-50 excellent, -50 to -60 good, -60 to -70 fair, <-70 bad
        if [ "$rssi" -lt -70 ] 2>/dev/null; then
            log "WIFI: POOR signal RSSI=${rssi}dBm — streaming will suffer!"
        fi
    fi
    return 0
}

# ─── PLAYER HEALTH ──────────────────────────────────────────────────────
check_player() {
    local pid
    pid=$(pidof studio.scillarium.ottnavigator 2>/dev/null)
    if [ -z "$pid" ]; then
        log "PLAYER: OTT Navigator not running (standby)"
        return 1
    fi
    return 0
}

# ─── FULL STATUS REPORT ─────────────────────────────────────────────────
status_report() {
    local mem_avail mem_free
    mem_avail=$(get_mem_mb MemAvailable)
    mem_free=$(get_mem_mb MemFree)
    local vpn="DOWN"
    ping -c 1 -W 2 nfqdeuxu.x1megaott.online >/dev/null 2>&1 && vpn="UP"
    local player="OFF"
    pidof studio.scillarium.ottnavigator >/dev/null 2>&1 && player="ON"
    local rssi
    rssi=$(dumpsys wifi 2>/dev/null | grep -oP 'rssi=\K-?\d+' | tail -1 || echo "?")
    log "STATUS: RAM=${mem_avail}/${mem_free}MB VPN=$vpn Player=$player WiFi=${rssi}dBm"
}

# ─── DAEMON MAIN LOOP ───────────────────────────────────────────────────
daemon_main() {
    # Single instance lock
    if [ -f "$LOCKFILE" ]; then
        local old_pid
        old_pid=$(cat "$LOCKFILE" 2>/dev/null)
        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            echo "Guardian already running (pid=$old_pid)"
            exit 0
        fi
        rm -f "$LOCKFILE"
    fi
    echo $$ > "$LOCKFILE"

    log "═══ APE STREAMING GUARDIAN v3.0 STARTED ═══"
    log "Device: $(getprop ro.product.model 2>/dev/null)"
    log "RAM: $(get_mem_mb MemTotal)MB total"
    log "Limits: soft=${SOFT_LIMIT_MB}MB hard=${HARD_LIMIT_MB}MB"
    log "Protected: v2rayNG, OTT Navigator, WireGuard"
    log "VPS: $VPS_IP (NET SHIELD AUTOPISTA)"

    # Initial setup — run once at boot
    apply_protections
    apply_network_optimization
    kill_bandwidth_thieves
    soft_cleanup

    local cycle=0
    local STATUS_INTERVAL=20     # Full status every 20 cycles (5 min)
    local NET_INTERVAL=120       # Re-apply network opts every 120 cycles (30 min)
    local DNS_INTERVAL=40        # DNS check every 40 cycles (10 min)

    while true; do
        sleep "$POLL_INTERVAL"
        cycle=$((cycle + 1))

        # ── RAM CHECK (every cycle) ──
        local mem
        mem=$(get_mem_mb MemAvailable)
        if [ "$mem" -lt "$HARD_LIMIT_MB" ] 2>/dev/null; then
            hard_cleanup
        elif [ "$mem" -lt "$SOFT_LIMIT_MB" ] 2>/dev/null; then
            soft_cleanup
        fi

        # ── VPN CHECK (every cycle) ──
        check_vpn

        # ── BANDWIDTH THIEVES (every 4 cycles = 1 min) ──
        [ $((cycle % 4)) -eq 0 ] && kill_bandwidth_thieves

        # ── DNS PIPELINE (periodic) ──
        [ $((cycle % DNS_INTERVAL)) -eq 0 ] && check_dns

        # ── WIFI SIGNAL (periodic) ──
        [ $((cycle % STATUS_INTERVAL)) -eq 0 ] && check_wifi

        # ── RE-APPLY PROTECTIONS (periodic — Android resets them) ──
        [ $((cycle % STATUS_INTERVAL)) -eq 0 ] && apply_protections

        # ── NETWORK OPTIMIZATION (periodic — settings drift) ──
        [ $((cycle % NET_INTERVAL)) -eq 0 ] && apply_network_optimization

        # ── STATUS REPORT (periodic) ──
        [ $((cycle % STATUS_INTERVAL)) -eq 0 ] && status_report
    done
}

# ─── COMMANDS ────────────────────────────────────────────────────────────
case "${1:-daemon}" in
    daemon) daemon_main ;;
    status)
        echo "=== APE Streaming Guardian v3.0 ==="
        if [ -f "$LOCKFILE" ]; then
            local p; p=$(cat "$LOCKFILE" 2>/dev/null)
            kill -0 "$p" 2>/dev/null && echo "RUNNING (pid=$p)" || echo "DEAD (stale lock)"
        else echo "NOT RUNNING"; fi
        echo "MemAvail: $(get_mem_mb MemAvailable)MB | MemFree: $(get_mem_mb MemFree)MB"
        echo "VPN tun0: $(ip link show tun0 2>/dev/null | grep -c UP | xargs -I{} sh -c '[ {} -gt 0 ] && echo UP || echo DOWN')"
        tail -15 "$LOGFILE" 2>/dev/null ;;
    stop)
        [ -f "$LOCKFILE" ] && { kill $(cat "$LOCKFILE" 2>/dev/null) 2>/dev/null; rm -f "$LOCKFILE"; echo "STOPPED"; } ;;
    cleanup) soft_cleanup; hard_cleanup; echo "MemAvail: $(get_mem_mb MemAvailable)MB" ;;
    *) echo "Usage: $0 {daemon|status|stop|cleanup}" ;;
esac
