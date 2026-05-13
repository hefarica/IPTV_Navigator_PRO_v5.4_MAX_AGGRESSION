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
        am start -n com.v2ray.ang/.ui.MainActivity 2>/dev/null
        sleep 3
        input tap 1832 968 2>/dev/null  # FAB connect button
        sleep 5
        input keyevent KEYCODE_HOME 2>/dev/null
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

enforce_quality_manifest() {
    local fixed=0

    # ── DISPLAY: 4K @ 60Hz ──
    local h=$(settings get global user_preferred_resolution_height 2>/dev/null)
    [ "$h" != "2160" ] && { settings put global user_preferred_resolution_height 2160 2>/dev/null; fixed=$((fixed+1)); }
    local w=$(settings get global user_preferred_resolution_width 2>/dev/null)
    [ "$w" != "3840" ] && { settings put global user_preferred_resolution_width 3840 2>/dev/null; fixed=$((fixed+1)); }
    local fps=$(settings get global user_preferred_refresh_rate 2>/dev/null)
    [ "$fps" != "60.0" ] && { settings put global user_preferred_refresh_rate 60.0 2>/dev/null; fixed=$((fixed+1)); }

    # ── HDR: Passthrough (Android rejects FORCE on this TV) ──
    local hdr=$(settings get global hdr_conversion_mode 2>/dev/null)
    [ "$hdr" != "0" ] && { settings put global hdr_conversion_mode 0 2>/dev/null; fixed=$((fixed+1)); }
    local hdr_out=$(settings get global hdr_output_type 2>/dev/null)
    [ "$hdr_out" != "4" ] && { settings put global hdr_output_type 4 2>/dev/null; fixed=$((fixed+1)); }
    local hdr_force=$(settings get global hdr_force_conversion_type 2>/dev/null)
    [ "$hdr_force" != "-1" ] && { settings put global hdr_force_conversion_type -1 2>/dev/null; fixed=$((fixed+1)); }
    local hdr_en=$(settings get global pq_hdr_enable 2>/dev/null)
    [ "$hdr_en" != "1" ] && { settings put global pq_hdr_enable 1 2>/dev/null; fixed=$((fixed+1)); }
    local hdr_mode=$(settings get global pq_hdr_mode 2>/dev/null)
    [ "$hdr_mode" != "1" ] && { settings put global pq_hdr_mode 1 2>/dev/null; fixed=$((fixed+1)); }
    local hdr_boost=$(settings get global hdr_brightness_boost 2>/dev/null)
    [ "$hdr_boost" != "100" ] && { settings put global hdr_brightness_boost 100 2>/dev/null; fixed=$((fixed+1)); }
    local sdr_hdr=$(settings get global sdr_brightness_in_hdr 2>/dev/null)
    [ "$sdr_hdr" != "100" ] && { settings put global sdr_brightness_in_hdr 100 2>/dev/null; fixed=$((fixed+1)); }
    local peak=$(settings get global peak_luminance 2>/dev/null)
    # Try 8000 but accept 1000 if Android clamps it (EDID limit)
    if [ "$peak" != "8000" ] && [ "$peak" != "1000" ]; then
        settings put global peak_luminance 8000 2>/dev/null; fixed=$((fixed+1))
    elif [ "$peak" = "1000" ]; then
        settings put global peak_luminance 8000 2>/dev/null
        sleep 1
        local recheck=$(settings get global peak_luminance 2>/dev/null)
        if [ "$recheck" = "1000" ]; then
            : # Android clamped it — accept 1000, don't count as drift
        else
            fixed=$((fixed+1))
        fi
    fi

    # ── COLOR: HDR mode, max depth ──
    local cm=$(settings get global display_color_mode 2>/dev/null)
    [ "$cm" != "3" ] && { settings put global display_color_mode 3 2>/dev/null; fixed=$((fixed+1)); }
    local cs=$(settings get global hdmi_color_space 2>/dev/null)
    [ "$cs" != "2" ] && { settings put global hdmi_color_space 2 2>/dev/null; fixed=$((fixed+1)); }

    # ── MATCH CONTENT FRAME RATE: Seamless ──
    local mf=$(settings get global match_content_frame_rate_pref 2>/dev/null)
    [ "$mf" != "2" ] && { settings put global match_content_frame_rate_pref 2 2>/dev/null; fixed=$((fixed+1)); }
    local mf2=$(settings get global match_content_frame_rate 2>/dev/null)
    [ "$mf2" != "1" ] && { settings put global match_content_frame_rate 1 2>/dev/null; fixed=$((fixed+1)); }

    # ── AUDIO: Surround Passthrough + Atmos ──
    local sur=$(settings get global encoded_surround_output 2>/dev/null)
    [ "$sur" != "2" ] && { settings put global encoded_surround_output 2 2>/dev/null; fixed=$((fixed+1)); }
    local atmos=$(settings get global enable_dolby_atmos 2>/dev/null)
    [ "$atmos" != "1" ] && { settings put global enable_dolby_atmos 1 2>/dev/null; fixed=$((fixed+1)); }
    local spdif=$(settings get global db_id_sound_spdif_output_enable 2>/dev/null)
    [ "$spdif" != "1" ] && { settings put global db_id_sound_spdif_output_enable 1 2>/dev/null; fixed=$((fixed+1)); }

    # ── AI PICTURE QUALITY (Amlogic PQ Engine) ──
    local aipq=$(settings get system aipq_enable 2>/dev/null)
    [ "$aipq" != "1" ] && { settings put system aipq_enable 1 2>/dev/null; fixed=$((fixed+1)); }
    local aisr=$(settings get system aisr_enable 2>/dev/null)
    [ "$aisr" != "1" ] && { settings put system aisr_enable 1 2>/dev/null; fixed=$((fixed+1)); }
    local aipqm=$(settings get system ai_pq_mode 2>/dev/null)
    [ "$aipqm" != "3" ] && { settings put system ai_pq_mode 3 2>/dev/null; fixed=$((fixed+1)); }
    local aisrm=$(settings get system ai_sr_mode 2>/dev/null)
    [ "$aisrm" != "3" ] && { settings put system ai_sr_mode 3 2>/dev/null; fixed=$((fixed+1)); }
    local dnr=$(settings get global pq_ai_dnr_enable 2>/dev/null)
    [ "$dnr" != "1" ] && { settings put global pq_ai_dnr_enable 1 2>/dev/null; fixed=$((fixed+1)); }
    local fbc=$(settings get global pq_ai_fbc_enable 2>/dev/null)
    [ "$fbc" != "1" ] && { settings put global pq_ai_fbc_enable 1 2>/dev/null; fixed=$((fixed+1)); }
    local aisr2=$(settings get global pq_ai_sr_enable 2>/dev/null)
    [ "$aisr2" != "1" ] && { settings put global pq_ai_sr_enable 1 2>/dev/null; fixed=$((fixed+1)); }
    local pqnr=$(settings get global pq_nr_enable 2>/dev/null)
    [ "$pqnr" != "1" ] && { settings put global pq_nr_enable 1 2>/dev/null; fixed=$((fixed+1)); }
    local sharp=$(settings get global pq_sharpness_enable 2>/dev/null)
    [ "$sharp" != "1" ] && { settings put global pq_sharpness_enable 1 2>/dev/null; fixed=$((fixed+1)); }
    local pqdnr=$(settings get global pq_dnr_enable 2>/dev/null)
    [ "$pqdnr" != "1" ] && { settings put global pq_dnr_enable 1 2>/dev/null; fixed=$((fixed+1)); }
    local aipicm=$(settings get global ai_pic_mode 2>/dev/null)
    [ "$aipicm" != "3" ] && { settings put global ai_pic_mode 3 2>/dev/null; fixed=$((fixed+1)); }
    local aisrl=$(settings get global ai_sr_level 2>/dev/null)
    [ "$aisrl" != "3" ] && { settings put global ai_sr_level 3 2>/dev/null; fixed=$((fixed+1)); }
    local smil=$(settings get global smart_illuminate_enabled 2>/dev/null)
    [ "$smil" != "1" ] && { settings put global smart_illuminate_enabled 1 2>/dev/null; fixed=$((fixed+1)); }

    # ── COLOR: 12-bit, 4:2:2 chroma ──
    local cdepth=$(settings get global color_depth 2>/dev/null)
    [ "$cdepth" != "12" ] && { settings put global color_depth 12 2>/dev/null; fixed=$((fixed+1)); }
    local c422=$(settings get global color_mode_ycbcr422 2>/dev/null)
    [ "$c422" != "1" ] && { settings put global color_mode_ycbcr422 1 2>/dev/null; fixed=$((fixed+1)); }
    local ahdr=$(settings get global always_hdr 2>/dev/null)
    [ "$ahdr" != "0" ] && { settings put global always_hdr 0 2>/dev/null; fixed=$((fixed+1)); }

    # ── VIDEO BRIGHTNESS ──
    local vb=$(settings get global video_brightness 2>/dev/null)
    [ "$vb" != "100" ] && { settings put global video_brightness 100 2>/dev/null; fixed=$((fixed+1)); }
    local sb=$(settings get system screen_brightness 2>/dev/null)
    [ "$sb" != "255" ] && { settings put system screen_brightness 255 2>/dev/null; fixed=$((fixed+1)); }

    # ── GPU & HARDWARE RENDERING ──
    local gpu=$(settings get global force_gpu_rendering 2>/dev/null)
    [ "$gpu" != "1" ] && { settings put global force_gpu_rendering 1 2>/dev/null; fixed=$((fixed+1)); }
    local hwui=$(settings get global force_hw_ui 2>/dev/null)
    [ "$hwui" != "1" ] && { settings put global force_hw_ui 1 2>/dev/null; fixed=$((fixed+1)); }
    local hwar=$(settings get global hardware_accelerated_rendering_enabled 2>/dev/null)
    [ "$hwar" != "1" ] && { settings put global hardware_accelerated_rendering_enabled 1 2>/dev/null; fixed=$((fixed+1)); }

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

    [ "$fixed" -gt 0 ] && log "MANIFEST: Restored $fixed settings that drifted"
}

# ─── TCP/NETWORK OPTIMIZATION (synced with VPS sysctl) ──────────────────
apply_network_optimization() {
    # Apply the quality manifest first
    enforce_quality_manifest

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

enforce_quality_manifest() {
    # Download manifest from VPS (timeout 5s, fail silently if offline)
    local tmp="/data/local/tmp/.qm_download.json"
    wget -q -T 5 -O "$tmp" "$MANIFEST_URL" 2>/dev/null || curl -sf -m 5 -o "$tmp" "$MANIFEST_URL" 2>/dev/null

    # If download failed or empty, skip
    [ ! -s "$tmp" ] && return 0

    # Check if manifest changed (hash comparison)
    local new_hash
    new_hash=$(md5sum "$tmp" 2>/dev/null | cut -d' ' -f1)
    local old_hash=""
    [ -f "$MANIFEST_HASH" ] && old_hash=$(cat "$MANIFEST_HASH" 2>/dev/null)

    if [ "$new_hash" = "$old_hash" ] && [ -n "$old_hash" ]; then
        # Manifest unchanged — skip
        rm -f "$tmp"
        return 0
    fi

    # New manifest detected — apply all settings
    log "QM: New manifest detected (hash=$new_hash), applying..."

    # Parse JSON and apply each setting
    # Format: {"manifest":[{"ns":"global","key":"xxx","value":"yyy",...},...]}
    local count=0
    local drifted=0

    # Use grep+sed to extract settings (busybox-compatible, no jq)
    # Each setting line: "ns":"global","key":"foo","value":"bar"
    local entries
    entries=$(cat "$tmp" | tr '{' '\n' | grep '"ns"')

    echo "$entries" | while IFS= read -r line; do
        [ -z "$line" ] && continue
        local ns key value
        ns=$(echo "$line" | sed 's/.*"ns":"\([^"]*\)".*/\1/')
        key=$(echo "$line" | sed 's/.*"key":"\([^"]*\)".*/\1/')
        value=$(echo "$line" | sed 's/.*"value":"\([^"]*\)".*/\1/')

        [ -z "$ns" ] || [ -z "$key" ] || [ -z "$value" ] && continue

        # Read current value
        local current
        current=$(settings get "$ns" "$key" 2>/dev/null)

        # Apply if different
        if [ "$current" != "$value" ]; then
            settings put "$ns" "$key" "$value" 2>/dev/null
            log "QM: $ns:$key $current → $value"
            drifted=$((drifted + 1))
        fi
        count=$((count + 1))
    done

    # Save hash to avoid re-applying unchanged manifest
    echo "$new_hash" > "$MANIFEST_HASH"
    cp "$tmp" "$MANIFEST_CACHE"
    rm -f "$tmp"

    [ "$drifted" -gt 0 ] && log "QM: Applied $drifted changes from VPS manifest"
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
