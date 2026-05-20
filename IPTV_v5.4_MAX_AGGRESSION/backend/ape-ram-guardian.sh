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

# IPTV player packages (app-aware VPN target)
IPTV_PLAYERS="studio.scillarium.ottnavigator ar.tvplayer.tv"

# Protected packages — NEVER kill
PROTECTED="com.v2ray.ang studio.scillarium.ottnavigator ar.tvplayer.tv com.wireguard.android com.android.systemui com.android.providers.tv com.google.android.apps.tv.launcherx android"

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

# ─── APP-AWARE VPN GUARDIAN FOREGROUND DETECTOR ─────────────────────────
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
        log "STANDBY: Removed Always-On VPN app setting"
    fi
    local lock
    lock=$(settings get secure always_on_vpn_lockdown 2>/dev/null)
    if [ "$lock" = "1" ]; then
        settings put secure always_on_vpn_lockdown 0 2>/dev/null
        fixed=$((fixed+1))
        log "STANDBY: Disabled VPN Lockdown"
    fi
    local v2pid
    v2pid=$(pidof com.v2ray.ang 2>/dev/null)
    if [ -n "$v2pid" ]; then
        log "STANDBY: Stopping v2rayNG to release routing"
        am force-stop com.v2ray.ang 2>/dev/null
    fi
    [ $fixed -gt 0 ] && log "STANDBY: Restored standard routing for device (Netflix-safe)"
}

# ─── VPN TUNNEL HEALTH (ping-based — v2rayNG uses Android VPN API) ──────
check_vpn() {
    # Test by pinging IPTV provider — if TTL=64 and <5ms, VPS tunnel is alive
    local result
    result=$(ping -c 1 -W 3 nfqdeuxu.x1megaott.online 2>&1 | head -2)
    if echo "$result" | grep -q "bytes from"; then
        local ttl
        ttl=$(echo "$result" | grep -oE 'ttl=[0-9]+' | cut -d= -f2 || echo 0)
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
    local active_player
    active_player=$(get_foreground_package)
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
        if [ -n "$active_player" ]; then
            log "VPN: Relaunching active player $active_player"
            am start -a android.intent.action.MAIN -n "${active_player}/.MainActivity" 2>/dev/null
        else
            input keyevent KEYCODE_HOME 2>/dev/null
        fi
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
        ttl=$(echo "$result" | grep -oE 'ttl=[0-9]+' | cut -d= -f2)
        local ms
        ms=$(echo "$result" | grep -oE 'time=[0-9.]+' | cut -d= -f2)
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

# ─── V2RAYNG IMMORTALITY (Always-On VPN + Anti-Kill) ────────────────────
enforce_v2ray_immortal() {
    local fixed=0

    # Always-On VPN — Android restarts v2rayNG automatically if it dies
    local aov=$(settings get secure always_on_vpn_app 2>/dev/null)
    [ "$aov" != "com.v2ray.ang" ] && {
        settings put secure always_on_vpn_app com.v2ray.ang 2>/dev/null
        fixed=$((fixed+1))
        log "V2RAY: Restored Always-On VPN"
    }

    # Lockdown — block all traffic if VPN disconnects (forces reconnect)
    local lock=$(settings get secure always_on_vpn_lockdown 2>/dev/null)
    [ "$lock" != "1" ] && {
        settings put secure always_on_vpn_lockdown 1 2>/dev/null
        fixed=$((fixed+1))
        log "V2RAY: Restored VPN Lockdown"
    }

    # Battery whitelist — prevent Doze from killing v2rayNG
    cmd deviceidle whitelist +com.v2ray.ang 2>/dev/null

    # OOM protection — make v2rayNG unkillable
    local v2pid=$(pidof com.v2ray.ang 2>/dev/null)
    if [ -n "$v2pid" ]; then
        echo -17 > /proc/$v2pid/oom_adj 2>/dev/null
        echo -1000 > /proc/$v2pid/oom_score_adj 2>/dev/null
    fi

    # Daemon process too
    local v2dpid=$(pidof com.v2ray.ang:RunSoLibV2RayDaemon 2>/dev/null)
    if [ -n "$v2dpid" ]; then
        echo -17 > /proc/$v2dpid/oom_adj 2>/dev/null
        echo -1000 > /proc/$v2dpid/oom_score_adj 2>/dev/null
    fi

    # Verify v2rayNG is actually running
    if [ -z "$v2pid" ]; then
        log "V2RAY: DEAD — launching..."
        local active_player
        active_player=$(get_foreground_package)
        am start -n com.v2ray.ang/.ui.MainActivity 2>/dev/null
        sleep 3
        input tap 1832 968 2>/dev/null  # FAB connect button
        sleep 5
        if [ -n "$active_player" ]; then
            log "V2RAY: Relaunching active player $active_player"
            am start -a android.intent.action.MAIN -n "${active_player}/.MainActivity" 2>/dev/null
        else
            input keyevent KEYCODE_HOME 2>/dev/null
        fi
        fixed=$((fixed+1))
    fi

    [ $fixed -gt 0 ] && log "V2RAY: Enforced $fixed immortality settings"
}

# ═══════════════════════════════════════════════════════════════════════════
# QUALITY SUPREMA MANIFEST — The Sacred Settings That Must NEVER Drift
# ═══════════════════════════════════════════════════════════════════════════
# Every 15 seconds the guardian checks ALL of these. If ANY value differs
# from the manifest, it is IMMEDIATELY corrected. No exceptions.
# ═══════════════════════════════════════════════════════════════════════════

apply_system_baselines() {
    local fixed=0

    # ── SCREEN & POWER ──
    local sto=$(settings get system screen_off_timeout 2>/dev/null)
    [ "$sto" != "2147483647" ] && { settings put system screen_off_timeout 2147483647 2>/dev/null; fixed=$((fixed+1)); }
    local sow=$(settings get global stay_on_while_plugged_in 2>/dev/null)
    [ "$sow" != "3" ] && { settings put global stay_on_while_plugged_in 3 2>/dev/null; fixed=$((fixed+1)); }

    # ── ZERO ANIMATIONS ──
    local wa=$(settings get global window_animation_scale 2>/dev/null)
    [ "$wa" != "0.0" ] && { settings put global window_animation_scale 0.0 2>/dev/null; fixed=$((fixed+1)); }
    local ta=$(settings get global transition_animation_scale 2>/dev/null)
    [ "$ta" != "0.0" ] && { settings put global transition_animation_scale 0.0 2>/dev/null; fixed=$((fixed+1)); }
    local ad=$(settings get global animator_duration_scale 2>/dev/null)
    [ "$ad" != "0.0" ] && { settings put global animator_duration_scale 0.0 2>/dev/null; fixed=$((fixed+1)); }

    # ── NETWORK: WiFi hardening ──
    local ws=$(settings get global wifi_sleep_policy 2>/dev/null)
    [ "$ws" != "2" ] && { settings put global wifi_sleep_policy 2 2>/dev/null; fixed=$((fixed+1)); }
    local wsa=$(settings get global wifi_scan_always_enabled 2>/dev/null)
    [ "$wsa" != "0" ] && { settings put global wifi_scan_always_enabled 0 2>/dev/null; fixed=$((fixed+1)); }
    local wso=$(settings get global wifi_suspend_optimizations_enabled 2>/dev/null)
    [ "$wso" != "0" ] && { settings put global wifi_suspend_optimizations_enabled 0 2>/dev/null; fixed=$((fixed+1)); }
    local wna=$(settings get global wifi_networks_available_notification_on 2>/dev/null)
    [ "$wna" != "0" ] && { settings put global wifi_networks_available_notification_on 0 2>/dev/null; fixed=$((fixed+1)); }
    local wpn=$(settings get global wifi_watchdog_poor_network_test_enabled 2>/dev/null)
    [ "$wpn" != "0" ] && { settings put global wifi_watchdog_poor_network_test_enabled 0 2>/dev/null; fixed=$((fixed+1)); }
    local nsu=$(settings get global network_scoring_ui_enabled 2>/dev/null)
    [ "$nsu" != "0" ] && { settings put global network_scoring_ui_enabled 0 2>/dev/null; fixed=$((fixed+1)); }

    # ── NETWORK: TCP tuning ──
    local rwnd=$(settings get global tcp_default_init_rwnd 2>/dev/null)
    [ "$rwnd" != "60" ] && { settings put global tcp_default_init_rwnd 60 2>/dev/null; fixed=$((fixed+1)); }

    # ── DNS: Private DNS via Google ──
    local dns=$(settings get global private_dns_mode 2>/dev/null)
    [ "$dns" != "hostname" ] && { settings put global private_dns_mode hostname 2>/dev/null; fixed=$((fixed+1)); }
    local dnss=$(settings get global private_dns_specifier 2>/dev/null)
    [ "$dnss" != "dns.google" ] && { settings put global private_dns_specifier dns.google 2>/dev/null; fixed=$((fixed+1)); }

    # ── DISABLE BLOAT ──
    local pve=$(settings get global package_verifier_enable 2>/dev/null)
    [ "$pve" != "0" ] && { settings put global package_verifier_enable 0 2>/dev/null; fixed=$((fixed+1)); }
    local ns=$(settings get global netstats_enabled 2>/dev/null)
    [ "$ns" != "0" ] && { settings put global netstats_enabled 0 2>/dev/null; fixed=$((fixed+1)); }

    [ "$fixed" -gt 0 ] && log "BASELINES: Restored $fixed system/network baselines that drifted"
}

# ─── TCP/NETWORK OPTIMIZATION (synced with VPS sysctl) ──────────────────
apply_tcp_tuning() {
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

apply_network_optimization() {
    # Apply system baselines
    apply_system_baselines

    # Apply the quality manifest
    enforce_quality_manifest

    # Apply TCP tuning
    apply_tcp_tuning
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
    rssi=$(dumpsys wifi 2>/dev/null | grep -oE 'rssi=-?[0-9]+' | tail -1 | cut -d= -f2)
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
    rssi=$(dumpsys wifi 2>/dev/null | grep -oE 'rssi=-?[0-9]+' | tail -1 | cut -d= -f2 || echo "?")
    log "STATUS: RAM=${mem_avail}/${mem_free}MB VPN=$vpn Player=$player WiFi=${rssi}dBm"
}

# ─── HEARTBEAT: PHONE HOME TO VPS ──────────────────────────────────────
# Every cycle, POST telemetry to VPS so the widget knows Guardian is alive.
# This works through the v2rayNG tunnel — no ADB needed from VPS side.
HEARTBEAT_URL="https://iptv-ape.duckdns.org/prisma/api/prisma-adb-quality.php?action=guardian_heartbeat"
HEARTBEAT_CYCLE=0

send_heartbeat() {
    HEARTBEAT_CYCLE=$((HEARTBEAT_CYCLE + 1))
    # Only send every 2 cycles (30s) to reduce overhead
    [ $((HEARTBEAT_CYCLE % 2)) -ne 0 ] && return 0

    local mem_avail vpn player rssi mhash up
    mem_avail=$(get_mem_mb MemAvailable 2>/dev/null || echo 0)
    vpn="DOWN"
    ip link show tun0 2>/dev/null | grep -q UP && vpn="UP"
    player="OFF"
    pidof studio.scillarium.ottnavigator >/dev/null 2>&1 && player="ON"
    rssi=$(dumpsys wifi 2>/dev/null | grep -oE 'rssi=-?[0-9]+' | head -1 | cut -d= -f2 || echo "?")
    mhash=""
    [ -f "$MANIFEST_HASH" ] && mhash=$(cat "$MANIFEST_HASH" 2>/dev/null)
    up=$(cat /proc/uptime 2>/dev/null | cut -d. -f1 || echo 0)

    local payload="{\"pid\":$$,\"ram_avail_mb\":${mem_avail},\"vpn_status\":\"${vpn}\",\"player_status\":\"${player}\",\"wifi_rssi\":\"${rssi}\",\"manifest_hash\":\"${mhash}\",\"cycle\":${HEARTBEAT_CYCLE},\"uptime\":${up}}"

    # POST with 3s timeout, fail silently
    wget -q -T 3 --post-data="$payload" --header="Content-Type: application/json" -O /dev/null "$HEARTBEAT_URL" 2>/dev/null \
      || curl -sf -m 3 -X POST -H "Content-Type: application/json" -d "$payload" "$HEARTBEAT_URL" >/dev/null 2>&1 \
      || true
}

# ─── QUALITY MANIFEST: FETCH FROM VPS & APPLY IN REAL-TIME ─────────────
# Downloads quality-manifest.json from VPS (saved by frontend) and applies
# every setting on the ONN. This enables "Guardar y Aplicar" from the UI.
MANIFEST_URL="https://iptv-ape.duckdns.org/prisma/quality-manifest.json"
MANIFEST_CACHE="/data/local/tmp/quality-manifest.json"
MANIFEST_HASH="/data/local/tmp/quality-manifest.hash"

is_timestamp_newer() {
    local new_ts="$1"
    local local_ts="$2"

    [ -z "$new_ts" ] && return 1
    [ -z "$local_ts" ] && return 0

    local new_epoch
    new_epoch=$(date -d "$new_ts" +%s 2>/dev/null)
    local local_epoch
    local_epoch=$(date -d "$local_ts" +%s 2>/dev/null)

    if [ -z "$new_epoch" ] || [ -z "$local_epoch" ]; then
        # String lexicographical comparison fallback
        if [ "$new_ts" \> "$local_ts" ]; then
            return 0
        else
            return 1
        fi
    fi

    if [ "$new_epoch" -gt "$local_epoch" ]; then
        return 0
    else
        return 1
    fi
}

enforce_quality_manifest() {
    # Download manifest from VPS (timeout 5s, fail silently if offline)
    local tmp="/data/local/tmp/.qm_download.json"
    local qm_file="$MANIFEST_CACHE"
    local is_new_manifest=0

    if wget -q -T 5 -O "$tmp" "$MANIFEST_URL" 2>/dev/null || curl -sf -m 5 -o "$tmp" "$MANIFEST_URL" 2>/dev/null; then
        if [ -s "$tmp" ]; then
            # Parse saved_at timestamps
            local local_ts=""
            [ -f "$qm_file" ] && local_ts=$(grep -o '"saved_at":"[^"]*"' "$qm_file" 2>/dev/null | head -n 1 | cut -d'"' -f4)
            local new_ts=""
            new_ts=$(grep -o '"saved_at":"[^"]*"' "$tmp" 2>/dev/null | head -n 1 | cut -d'"' -f4)

            local download_manifest=0
            if [ -z "$local_ts" ]; then
                download_manifest=1
            elif is_timestamp_newer "$new_ts" "$local_ts"; then
                download_manifest=1
            fi

            if [ "$download_manifest" -eq 1 ]; then
                local new_hash
                new_hash=$(md5sum "$tmp" 2>/dev/null | cut -d' ' -f1)
                log "QM: New manifest accepted from VPS (ts=$new_ts, hash=$new_hash)"
                mv -f "$tmp" "$qm_file"
                echo "$new_hash" > "$MANIFEST_HASH"
                is_new_manifest=1
            else
                # VPS manifest is older or equal (local update won), discard download
                rm -f "$tmp"
            fi
        else
            rm -f "$tmp"
        fi
    fi

    # If local manifest file does not exist, nothing to enforce
    [ ! -f "$qm_file" ] && return 0

    # Read current state in batch to minimize process forks (extremely fast/lightweight)
    local global_settings
    global_settings=$(settings list global 2>/dev/null)
    local system_settings
    system_settings=$(settings list system 2>/dev/null)
    local secure_settings
    secure_settings=$(settings list secure 2>/dev/null)

    # Use a file-based counter since the pipe runs in a subshell
    local count_file="/data/local/tmp/.qm_corrected"
    echo 0 > "$count_file"

    local entries
    entries=$(cat "$qm_file" | tr -d '\n\r' | sed 's/}/}\n/g' | grep '"ns"')

    echo "$entries" | while IFS= read -r line; do
        [ -z "$line" ] && continue
        local ns key value
        ns=$(echo "$line" | grep -oE '"ns"[[:space:]]*:[[:space:]]*"[^"]+"' | cut -d'"' -f4)
        key=$(echo "$line" | grep -oE '"key"[[:space:]]*:[[:space:]]*"[^"]+"' | cut -d'"' -f4)
        value=$(echo "$line" | grep -oE '"value"[[:space:]]*:[[:space:]]*"[^"]+"' | cut -d'"' -f4)

        [ -z "$ns" ] || [ -z "$key" ] || [ -z "$value" ] && continue

        # Extract current value from batch variables
        local current=""
        if [ "$ns" = "global" ]; then
            current=$(echo "$global_settings" | grep -E "^${key}=" | head -n 1 | cut -d= -f2-)
        elif [ "$ns" = "system" ]; then
            current=$(echo "$system_settings" | grep -E "^${key}=" | head -n 1 | cut -d= -f2-)
        elif [ "$ns" = "secure" ]; then
            current=$(echo "$secure_settings" | grep -E "^${key}=" | head -n 1 | cut -d= -f2-)
        fi

        # Apply if value differs (with EDID exception for peak_luminance, bypassed if new from frontend)
        if [ "$current" != "$value" ]; then
            if [ "$is_new_manifest" -eq 0 ] && [ "$key" = "peak_luminance" ] && [ "$value" = "10000" ] && [ "$current" = "1000" ]; then
                # Device EDID hardware clamp, skip restoring to avoid loop
                continue
            fi

            settings put "$ns" "$key" "$value" 2>/dev/null
            if [ "$is_new_manifest" -eq 1 ]; then
                log "QM: Applied frontend setting [$ns] $key -> '$value'"
            else
                log "QM: Restored drifted setting [$ns] $key: '$current' -> '$value'"
            fi
            local c; c=$(cat "$count_file" 2>/dev/null || echo 0)
            echo $((c + 1)) > "$count_file"
        fi
    done

    local total_corrected; total_corrected=$(cat "$count_file" 2>/dev/null || echo 0)
    rm -f "$count_file"

    if [ "$is_new_manifest" -eq 1 ]; then
        log "QM: Completed frontend manifest update ($total_corrected settings applied). Re-applying baseline and network optimizations..."
        apply_system_baselines
        apply_tcp_tuning
    elif [ "$total_corrected" -gt 0 ]; then
        log "QM: Enforced manifest and corrected $total_corrected drifted settings"
    fi

    return 0
}
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

    # Traps for real-time triggers from frontend/local API
    trap 'log "QM: SIGUSR1 trigger received. Waking up daemon loop."; [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null' USR1

    while true; do
        sleep "$POLL_INTERVAL" &
        SLEEP_PID=$!
        wait "$SLEEP_PID" 2>/dev/null
        cycle=$((cycle + 1))

        # ── STANDBY CHECK (Netflix-safe routing) ──
        if ! is_player_foreground; then
            # Standby mode — user is not using IPTV
            if [ $((cycle % 20)) -eq 0 ]; then
                log "STANDBY: IPTV Player not active. VPN bypassed (Netflix-safe mode)."
            fi
            disable_vpn_lockdown
            send_heartbeat
            continue
        fi

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

        # ── V2RAYNG IMMORTALITY (every cycle — implacable) ──
        enforce_v2ray_immortal

        # ── QUALITY MANIFEST (every cycle — implacable) ──
        enforce_quality_manifest

        # ── HEARTBEAT (every cycle) ──
        send_heartbeat

        # ── BANDWIDTH THIEVES (every 4 cycles = 1 min) ──
        [ $((cycle % 4)) -eq 0 ] && kill_bandwidth_thieves

        # ── DNS PIPELINE (periodic) ──
        [ $((cycle % DNS_INTERVAL)) -eq 0 ] && check_dns

        # ── WIFI SIGNAL (periodic) ──
        [ $((cycle % STATUS_INTERVAL)) -eq 0 ] && check_wifi

        # ── RE-APPLY PROTECTIONS (periodic — Android resets them) ──
        [ $((cycle % STATUS_INTERVAL)) -eq 0 ] && apply_protections

        # ── KERNEL TCP (periodic — settings drift) ──
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
