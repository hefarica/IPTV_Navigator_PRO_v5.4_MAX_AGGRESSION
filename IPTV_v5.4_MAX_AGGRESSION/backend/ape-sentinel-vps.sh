#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# APE NET SHIELD SENTINEL v2.0 — IMPLACABLE PIPELINE ENFORCER
# ═══════════════════════════════════════════════════════════════════════════
# EVERY 10 seconds, checks EVERYTHING. If ANY condition fails → FIX IT NOW.
# No waiting, no periodic checks, no mercy.
#
#   L1: HETZNER — CPU/RAM/Disk → auto-clean
#   L2: SURFSHARK — Miami + Brazil → instant restart if dead
#   L3: NGINX — running? errors? → instant restart
#   L4: PROVIDERS — reachable? → log degradation
#   L5: XRAY — running? clients? → instant restart
#   L6: DNS — Unbound alive? hijack working? → instant restart
#   L7: QOS — BBR/DSCP/buffers → instant re-apply if drifted
#   L8: PRIME — 2x aggression 18:00-23:00
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

POLL=10
LOG="/var/log/ape-sentinel.log"
LOCKFILE="/opt/netshield/state/sentinel.lock"
MAX_LOG=2000

log() {
    echo "[$(date '+%m-%d %H:%M:%S')] $1" >> "$LOG"
    local n=$(wc -l < "$LOG" 2>/dev/null || echo 0)
    [ "$n" -gt "$MAX_LOG" ] && { tail -500 "$LOG" > "${LOG}.tmp"; mv "${LOG}.tmp" "$LOG"; }
}

# ─── L1: SERVER ──────────────────────────────────────────────────────────
fix_server() {
    local mem_pct=$(free | awk '/Mem:/{printf "%.0f",$3/$2*100}')
    [ "$mem_pct" -gt 90 ] 2>/dev/null && {
        echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
        log "L1_FIX: RAM=${mem_pct}% → dropped caches"
    }
    local disk_pct=$(df / | awk 'NR==2{print $5}' | tr -d '%')
    [ "$disk_pct" -gt 85 ] 2>/dev/null && {
        find /var/log/nginx/ -name "*.log" -size +50M -exec truncate -s 10M {} \; 2>/dev/null
        log "L1_FIX: Disk=${disk_pct}% → truncated logs"
    }
}

# ─── L2: SURFSHARK ───────────────────────────────────────────────────────
fix_surfshark() {
    # Miami
    if ! ip link show wg-surfshark 2>/dev/null | grep -q UP; then
        log "L2_ATK: Miami DOWN → restarting"
        wg-quick down wg-surfshark 2>/dev/null; sleep 1; wg-quick up wg-surfshark 2>/dev/null
        sleep 2
        ip link show wg-surfshark 2>/dev/null | grep -q UP && log "L2_OK: Miami RESTORED" || log "L2_FAIL: Miami"
    else
        # Verify it actually works (handshake fresh?)
        local hs=$(wg show wg-surfshark latest-handshakes 2>/dev/null | awk '{print $2}')
        local now=$(date +%s)
        if [ -n "$hs" ] && [ "$hs" -gt 0 ] 2>/dev/null; then
            local age=$((now - hs))
            [ "$age" -gt 180 ] && {
                log "L2_ATK: Miami handshake stale (${age}s) → bouncing"
                wg-quick down wg-surfshark 2>/dev/null; sleep 1; wg-quick up wg-surfshark 2>/dev/null
            }
        fi
    fi

    # Brazil
    if ! ip link show wg-surfshark-br 2>/dev/null | grep -q UP; then
        log "L2_ATK: Brazil DOWN → restarting"
        wg-quick down wg-surfshark-br 2>/dev/null; sleep 1; wg-quick up wg-surfshark-br 2>/dev/null
        sleep 2
        ip link show wg-surfshark-br 2>/dev/null | grep -q UP && log "L2_OK: Brazil RESTORED" || log "L2_FAIL: Brazil"
    else
        local hs=$(wg show wg-surfshark-br latest-handshakes 2>/dev/null | awk '{print $2}')
        local now=$(date +%s)
        if [ -n "$hs" ] && [ "$hs" -gt 0 ] 2>/dev/null; then
            local age=$((now - hs))
            [ "$age" -gt 180 ] && {
                log "L2_ATK: Brazil handshake stale (${age}s) → bouncing"
                wg-quick down wg-surfshark-br 2>/dev/null; sleep 1; wg-quick up wg-surfshark-br 2>/dev/null
            }
        fi
    fi
}

# ─── L3: NGINX ───────────────────────────────────────────────────────────
fix_nginx() {
    if ! pgrep -x nginx >/dev/null; then
        log "L3_ATK: NGINX DEAD → restarting NOW"
        nginx -t 2>/dev/null && systemctl start nginx 2>/dev/null || systemctl restart nginx 2>/dev/null
        sleep 1
        pgrep -x nginx >/dev/null && log "L3_OK: NGINX RESTORED" || log "L3_FAIL: NGINX won't start"
    fi
    # Check for recent self-503s
    local s503=$(tail -50 /var/log/nginx/iptv_intercept.log 2>/dev/null | grep ' 503 ' | grep 'ut=-' | wc -l)
    [ "$s503" -gt 3 ] && log "L3_WARN: ${s503} self-503s in recent log"
}

# ─── L4: PROVIDERS ───────────────────────────────────────────────────────
fix_providers() {
    local dead=0
    for ip in 154.6.184.6 154.6.184.66 154.6.184.126 154.6.184.186; do
        timeout 2 bash -c "echo > /dev/tcp/$ip/80" 2>/dev/null || dead=$((dead+1))
    done
    for ip in 149.18.45.78 149.18.45.119 149.18.45.189; do
        timeout 2 bash -c "echo > /dev/tcp/$ip/80" 2>/dev/null || dead=$((dead+1))
    done
    timeout 2 bash -c "echo > /dev/tcp/154.6.152.13/80" 2>/dev/null || dead=$((dead+1))
    [ "$dead" -gt 4 ] && log "L4_CRIT: ${dead}/8 providers DEAD"
}

# ─── L5: XRAY ────────────────────────────────────────────────────────────
fix_xray() {
    if ! pgrep -x xray >/dev/null; then
        log "L5_ATK: XRAY DEAD → restarting NOW"
        systemctl restart xray 2>/dev/null
        sleep 2
        pgrep -x xray >/dev/null && log "L5_OK: XRAY RESTORED" || log "L5_FAIL: XRAY won't start"
    fi
    # Verify port listening
    if ! ss -tlnp | grep -q ':8443'; then
        log "L5_ATK: XRAY port 8443 not listening → restart"
        systemctl restart xray 2>/dev/null
    fi
}

# ─── L6: DNS ─────────────────────────────────────────────────────────────
fix_dns() {
    if ! pgrep -x unbound >/dev/null; then
        log "L6_ATK: UNBOUND DEAD → restarting NOW"
        systemctl restart unbound 2>/dev/null
        sleep 1
        pgrep -x unbound >/dev/null && log "L6_OK: UNBOUND RESTORED" || log "L6_FAIL: UNBOUND"
    fi
}

# ─── L7: QOS ENFORCEMENT ────────────────────────────────────────────────
fix_qos() {
    # BBR
    local cc=$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null)
    [ "$cc" != "bbr" ] && { sysctl -w net.ipv4.tcp_congestion_control=bbr >/dev/null 2>&1; log "L7_FIX: BBR re-enabled"; }

    # Socket buffers 128MB
    local rmem=$(sysctl -n net.core.rmem_max 2>/dev/null)
    [ "$rmem" -lt 134217728 ] 2>/dev/null && {
        sysctl -w net.core.rmem_max=134217728 net.core.wmem_max=134217728 >/dev/null 2>&1
        sysctl -w net.ipv4.tcp_rmem="4096 1048576 134217728" net.ipv4.tcp_wmem="4096 1048576 134217728" >/dev/null 2>&1
        log "L7_FIX: 128MB buffers restored"
    }

    # Key sysctl
    [ "$(sysctl -n net.ipv4.tcp_slow_start_after_idle 2>/dev/null)" != "0" ] && sysctl -w net.ipv4.tcp_slow_start_after_idle=0 >/dev/null 2>&1
    [ "$(sysctl -n net.ipv4.tcp_fastopen 2>/dev/null)" != "3" ] && sysctl -w net.ipv4.tcp_fastopen=3 >/dev/null 2>&1
    [ "$(sysctl -n net.core.somaxconn 2>/dev/null)" -lt 65535 ] 2>/dev/null && sysctl -w net.core.somaxconn=65535 >/dev/null 2>&1
}

# ─── L9: ONN 4K GUARDIAN WATCHDOG ────────────────────────────────────────
ONN_IP="192.168.10.28:5555"
fix_onn_guardian() {
    # Check if ADB is reachable
    local adb_ok=$(timeout 5 adb -s "$ONN_IP" shell "cat /data/local/tmp/ape-ram-guardian.lock 2>/dev/null" 2>/dev/null)
    if [ -z "$adb_ok" ]; then
        # ADB unreachable — try to reconnect
        timeout 5 adb connect "$ONN_IP" >/dev/null 2>&1
        sleep 2
        adb_ok=$(timeout 5 adb -s "$ONN_IP" shell "cat /data/local/tmp/ape-ram-guardian.lock 2>/dev/null" 2>/dev/null)
        [ -z "$adb_ok" ] && { log "L9_WARN: ONN 4K ADB unreachable"; return; }
    fi

    # Check if guardian PID is alive
    local alive=$(timeout 5 adb -s "$ONN_IP" shell "kill -0 $adb_ok 2>/dev/null && echo YES || echo NO" 2>/dev/null)
    if [ "$alive" != "YES" ]; then
        log "L9_ATK: ONN Guardian DEAD (was PID $adb_ok) → restarting"
        timeout 10 adb -s "$ONN_IP" shell "rm -f /data/local/tmp/ape-ram-guardian.lock; chmod 755 /data/local/tmp/ape-ram-guardian.sh; nohup /data/local/tmp/ape-ram-guardian.sh daemon > /dev/null 2>&1 &" 2>/dev/null
        sleep 5
        local newpid=$(timeout 5 adb -s "$ONN_IP" shell "cat /data/local/tmp/ape-ram-guardian.lock 2>/dev/null" 2>/dev/null)
        [ -n "$newpid" ] && log "L9_OK: ONN Guardian RESTORED (PID $newpid)" || log "L9_FAIL: ONN Guardian won't start"
    fi
}

# ─── L8: PRIME TIME ─────────────────────────────────────────────────────
is_prime() {
    local h=$(date -u '+%H' | sed 's/^0//')
    # Colombia prime 18-23h = UTC 23-04
    [ "$h" -ge 23 ] || [ "$h" -le 4 ] 2>/dev/null
}

# ─── STATUS ──────────────────────────────────────────────────────────────
emit_status() {
    local cpu=$(awk '{u=$2+$4;t=$2+$4+$5;if(NR==1){ou=u;ot=t}else{printf"%.0f",(u-ou)*100/(t-ot)}}' <(grep 'cpu ' /proc/stat;sleep 1;grep 'cpu ' /proc/stat) 2>/dev/null)
    local mem=$(free | awk '/Mem:/{printf "%.0f",$3/$2*100}')
    local load=$(cut -d' ' -f1 /proc/loadavg)
    local miami="DOWN"; ip link show wg-surfshark 2>/dev/null | grep -q UP && miami="UP"
    local brazil="DOWN"; ip link show wg-surfshark-br 2>/dev/null | grep -q UP && brazil="UP"
    local nx="DOWN"; pgrep -x nginx >/dev/null && nx="UP"
    local xr="DOWN"; pgrep -x xray >/dev/null && xr="UP"
    local dns="DOWN"; pgrep -x unbound >/dev/null && dns="UP"
    local clients=$(ss -tnp 2>/dev/null | grep ':8443' | grep ESTAB | awk '{print $5}' | grep -oP '\d+\.\d+\.\d+\.\d+' | sort -u | wc -l)
    local prime="OFF"; is_prime && prime="ON"
    log "══ CPU=${cpu}% RAM=${mem}% Load=${load} | Miami=$miami Brazil=$brazil | Nginx=$nx Xray=$xr DNS=$dns | Clients=$clients | Prime=$prime ══"
}

# ─── DAEMON ──────────────────────────────────────────────────────────────
main() {
    mkdir -p /opt/netshield/state 2>/dev/null
    if [ -f "$LOCKFILE" ]; then
        local old=$(cat "$LOCKFILE" 2>/dev/null)
        kill -0 "$old" 2>/dev/null && { echo "Running (pid=$old)"; exit 0; }
        rm -f "$LOCKFILE"
    fi
    echo $$ > "$LOCKFILE"

    log "═══ APE SENTINEL v2.0 IMPLACABLE — STARTED (PID $$) ═══"
    log "Mode: EVERY ${POLL}s → check ALL, fix ALL, no mercy"

    local cycle=0
    while true; do
        sleep "$POLL"
        cycle=$((cycle + 1))

        # EVERY CYCLE: fix everything broken
        fix_xray
        fix_nginx
        fix_dns
        fix_surfshark
        fix_server

        # Every 3 cycles (30s): providers
        [ $((cycle % 3)) -eq 0 ] && fix_providers

        # Every 6 cycles (60s): QoS enforcement + ONN Guardian watchdog
        [ $((cycle % 6)) -eq 0 ] && fix_qos
        [ $((cycle % 6)) -eq 0 ] && fix_onn_guardian

        # Every 30 cycles (5min): full status report
        [ $((cycle % 30)) -eq 0 ] && emit_status

        # Prime time: even more aggressive
        if is_prime; then
            # Extra provider check every cycle during prime
            [ $((cycle % 2)) -eq 0 ] && fix_providers
        fi
    done
}

case "${1:-daemon}" in
    daemon) main ;;
    status) emit_status; tail -25 "$LOG" ;;
    stop) [ -f "$LOCKFILE" ] && { kill $(cat "$LOCKFILE") 2>/dev/null; rm -f "$LOCKFILE"; echo STOPPED; } ;;
    *) echo "Usage: $0 {daemon|status|stop}" ;;
esac
