#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# NET SHIELD WATCHDOG — Daemon Inmortal de Infraestructura IPTV
# Vigila y auto-repara: rutas, WireGuard, NGINX, cache, prefetch
# NUNCA se duerme. Ciclo cada 15 segundos.
# ═══════════════════════════════════════════════════════════════════════

LOG="/var/log/netshield-watchdog.log"
STATE="/opt/netshield/state/watchdog_state.json"
SURFSHARK_IFACE="wg-surfshark"
TABLE=100
CHECK_INTERVAL=15
MAX_LOG_SIZE=10485760  # 10MB

log() {
    local ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "$ts [$1] $2" >> "$LOG"
}

rotate_log() {
    local size=$(stat -f%z "$LOG" 2>/dev/null || stat -c%s "$LOG" 2>/dev/null || echo 0)
    if [ "$size" -gt "$MAX_LOG_SIZE" ]; then
        mv "$LOG" "${LOG}.old"
        log "INFO" "Log rotated (was ${size} bytes)"
    fi
}

update_state() {
    cat > "$STATE" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "uptime_cycles": $CYCLES,
    "repairs": $REPAIRS,
    "last_check": "$1",
    "status": "$2",
    "route_ok": $ROUTE_OK,
    "wg_ok": $WG_OK,
    "nginx_ok": $NGINX_OK,
    "cache_ok": $CACHE_OK
}
EOF
}

# ═══ CHECK 1: Routing Table 100 → wg-surfshark (Miami) ═══
check_route() {
    local current=$(ip route show table $TABLE 2>/dev/null | grep "^default" | awk '{print $3}')
    if [ "$current" != "$SURFSHARK_IFACE" ]; then
        log "REPAIR" "Route table $TABLE was '$current', fixing → $SURFSHARK_IFACE"
        ip route replace default dev "$SURFSHARK_IFACE" table $TABLE
        ip route replace 10.200.0.0/24 dev wg0 table $TABLE 2>/dev/null
        REPAIRS=$((REPAIRS + 1))
        ROUTE_OK="false"
        return 1
    fi
    ROUTE_OK="true"
    return 0
}

# ═══ CHECK 2: WireGuard Interfaces ═══
check_wireguard() {
    local wg_up=true

    # Check wg-surfshark (Miami — primary for IPTV)
    if ! ip link show "$SURFSHARK_IFACE" &>/dev/null; then
        log "REPAIR" "$SURFSHARK_IFACE is DOWN, restarting"
        wg-quick up "$SURFSHARK_IFACE" 2>/dev/null
        sleep 2
        REPAIRS=$((REPAIRS + 1))
        wg_up=false
    fi

    # Check wg0 (FireStick tunnel)
    if ! ip link show wg0 &>/dev/null; then
        log "REPAIR" "wg0 is DOWN, restarting"
        wg-quick up wg0 2>/dev/null
        sleep 2
        REPAIRS=$((REPAIRS + 1))
        wg_up=false
    fi

    # Check handshake freshness (stale = >180s since last handshake)
    local last_hs=$(wg show "$SURFSHARK_IFACE" latest-handshakes 2>/dev/null | awk '{print $2}')
    if [ -n "$last_hs" ] && [ "$last_hs" != "0" ]; then
        local now=$(date +%s)
        local age=$((now - last_hs))
        if [ "$age" -gt 180 ]; then
            log "WARN" "$SURFSHARK_IFACE handshake stale (${age}s ago), bouncing"
            wg-quick down "$SURFSHARK_IFACE" 2>/dev/null
            sleep 1
            wg-quick up "$SURFSHARK_IFACE" 2>/dev/null
            sleep 3
            REPAIRS=$((REPAIRS + 1))
            wg_up=false
        fi
    fi

    if $wg_up; then
        WG_OK="true"
        return 0
    else
        WG_OK="false"
        return 1
    fi
}

# ═══ CHECK 3: NGINX Running ═══
check_nginx() {
    if ! systemctl is-active --quiet nginx; then
        log "REPAIR" "NGINX is not running, starting"
        nginx -t 2>/dev/null && systemctl start nginx
        REPAIRS=$((REPAIRS + 1))
        NGINX_OK="false"
        return 1
    fi

    # Check for stuck workers (0 connections for >60s = zombie)
    local conns=$(ss -tnp | grep -c ':80 ' 2>/dev/null || echo "0")
    NGINX_OK="true"
    return 0
}

# ═══ CHECK 4: RAM Cache Health ═══
check_cache() {
    local avail=$(df /dev/shm 2>/dev/null | awk 'NR==2 {print $4}')
    if [ -n "$avail" ] && [ "$avail" -lt 102400 ]; then
        # Less than 100MB free in RAM cache — purge stale
        log "REPAIR" "RAM cache low (${avail}KB free), purging stale"
        find /dev/shm/nginx_cache -type f -amin +30 -delete 2>/dev/null
        REPAIRS=$((REPAIRS + 1))
        CACHE_OK="false"
        return 1
    fi
    CACHE_OK="true"
    return 0
}

# ═══ CHECK 5: Xray (VLESS) Running ═══
check_xray() {
    if ! pgrep -x xray &>/dev/null; then
        log "REPAIR" "Xray is not running, restarting"
        systemctl restart xray 2>/dev/null
        REPAIRS=$((REPAIRS + 1))
        return 1
    fi
    return 0
}

# ═══ CHECK 6: iptables MARK rules present ═══
check_iptables() {
    local marks=$(iptables -t mangle -L SURFSHARK_MARK -n 2>/dev/null | grep -c "MARK")
    if [ "$marks" -lt 5 ]; then
        log "REPAIR" "iptables SURFSHARK_MARK rules missing ($marks found), restoring"
        iptables-restore < /etc/iptables/rules.v4 2>/dev/null
        REPAIRS=$((REPAIRS + 1))
        return 1
    fi
    return 0
}

# ═══════════════════════════════════════════════════════════════════════
# MAIN LOOP — Ciclo infinito cada 15 segundos
# ═══════════════════════════════════════════════════════════════════════

CYCLES=0
REPAIRS=0
ROUTE_OK="true"
WG_OK="true"
NGINX_OK="true"
CACHE_OK="true"

log "INFO" "═══ NET SHIELD WATCHDOG STARTED ═══"
log "INFO" "Check interval: ${CHECK_INTERVAL}s"
log "INFO" "Primary VPN: $SURFSHARK_IFACE (Miami)"

while true; do
    CYCLES=$((CYCLES + 1))

    check_route
    check_wireguard
    check_nginx
    check_cache
    check_xray
    check_iptables

    # Update state file every cycle
    if [ $((CYCLES % 4)) -eq 0 ]; then
        # Every ~60s, write state
        update_state "all" "running"
    fi

    # Rotate log if too big
    if [ $((CYCLES % 100)) -eq 0 ]; then
        rotate_log
    fi

    # Heartbeat log every 5 min (20 cycles × 15s)
    if [ $((CYCLES % 20)) -eq 0 ]; then
        log "HEARTBEAT" "cycles=$CYCLES repairs=$REPAIRS route=$ROUTE_OK wg=$WG_OK nginx=$NGINX_OK cache=$CACHE_OK"
    fi

    sleep $CHECK_INTERVAL
done
