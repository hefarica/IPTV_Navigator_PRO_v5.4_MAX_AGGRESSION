#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# NET SHIELD AUTOPISTA — WireGuard Health Monitor v1.0
# ────────────────────────────────────────────────────────────────────────────
# Runs every 30s via systemd timer. Checks:
#   1. wg0 (player tunnel) — is interface UP + handshake < 5min
#   2. wg-surfshark (IPTV VPN) — ping test + handshake freshness
#   3. wg-surfshark-br (failover) — same checks
#
# Actions:
#   - If wg-surfshark is down → restart it
#   - If wg-surfshark stays down after restart → log CRITICAL
#   - If wg0 is down → restart it (players can't connect)
#   - If both SurfShark tunnels are down → attempt both restarts
#
# REGLA CARDINAL: NUNCA tocar wg0 si los players están conectados y
#   handshake es reciente. Solo reiniciar si está realmente muerto.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

LOG="/var/log/netshield-wg-health.log"
STATE_FILE="/opt/netshield/state/wg_health_state.json"
MAX_HANDSHAKE_AGE=300     # 5 min — más viejo = stale
PING_TIMEOUT=3            # seconds
PING_TARGET="1.1.1.1"    # via SurfShark VPN
PROVIDER_IP="154.6.41.6" # tivigo primary — proves full path works
COOLDOWN_FILE="/tmp/wg_restart_cooldown"
COOLDOWN_SECONDS=120      # no reiniciar más de 1 vez cada 2 min

NOW=$(date +%s)
TS=$(date -u +%FT%TZ)

log() {
    echo "$TS $1" >> "$LOG"
}

# ─── Cooldown check (prevent restart loops) ───
can_restart() {
    local iface="$1"
    local cd_file="${COOLDOWN_FILE}_${iface}"
    if [ -f "$cd_file" ]; then
        local last_restart
        last_restart=$(cat "$cd_file" 2>/dev/null || echo 0)
        local elapsed=$((NOW - last_restart))
        if [ "$elapsed" -lt "$COOLDOWN_SECONDS" ]; then
            return 1  # still in cooldown
        fi
    fi
    return 0
}

mark_restart() {
    local iface="$1"
    echo "$NOW" > "${COOLDOWN_FILE}_${iface}"
}

# ─── Check a WireGuard interface ───
check_wg_interface() {
    local iface="$1"
    local status="OK"
    local details=""

    # 1. Is interface UP?
    if ! ip link show "$iface" &>/dev/null; then
        echo "DOWN_NO_IFACE"
        return
    fi

    local state
    state=$(ip -o link show "$iface" 2>/dev/null | grep -o 'state [A-Z]*' | awk '{print $2}')
    if [ "$state" != "UNKNOWN" ] && [ "$state" != "UP" ]; then
        # WireGuard interfaces show as UNKNOWN when UP (no carrier concept)
        echo "DOWN_STATE_${state}"
        return
    fi

    # 2. Handshake freshness
    local hs_epoch
    hs_epoch=$(wg show "$iface" latest-handshakes 2>/dev/null | awk '{print $2}' | sort -rn | head -1)
    if [ -z "$hs_epoch" ] || [ "$hs_epoch" = "0" ]; then
        echo "NO_HANDSHAKE"
        return
    fi

    local hs_age=$((NOW - hs_epoch))
    if [ "$hs_age" -gt "$MAX_HANDSHAKE_AGE" ]; then
        echo "STALE_HANDSHAKE_${hs_age}s"
        return
    fi

    echo "OK_${hs_age}s"
}

# ─── Ping test through a specific interface ───
ping_through() {
    local iface="$1"
    local target="$2"
    if ping -c1 -W "$PING_TIMEOUT" -I "$iface" "$target" &>/dev/null; then
        echo "OK"
    else
        echo "FAIL"
    fi
}

# ─── Restart a WireGuard interface ───
restart_wg() {
    local iface="$1"
    if ! can_restart "$iface"; then
        log "SKIP restart $iface (cooldown active)"
        return 1
    fi

    log "ACTION restarting $iface"
    
    # Try gentle restart first
    if wg-quick down "$iface" 2>/dev/null; then
        sleep 1
    fi
    
    if wg-quick up "$iface" 2>&1 | head -5 >> "$LOG"; then
        mark_restart "$iface"
        sleep 3  # give it time to establish handshake
        log "ACTION $iface restarted successfully"
        return 0
    else
        mark_restart "$iface"
        log "CRITICAL $iface restart FAILED"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════
# MAIN CHECKS
# ═══════════════════════════════════════════════════════════════════════════

ALERTS=0

# ─── 1. wg0 (Player tunnel) ───
WG0_STATUS=$(check_wg_interface "wg0")
if [[ "$WG0_STATUS" != OK_* ]]; then
    log "ALERT wg0 status=$WG0_STATUS"
    ALERTS=$((ALERTS+1))
    
    if [[ "$WG0_STATUS" == "DOWN_NO_IFACE" ]] || [[ "$WG0_STATUS" == DOWN_STATE_* ]]; then
        restart_wg "wg0"
    fi
fi

# ─── 2. wg-surfshark (Primary VPN — Miami) ───
SURF_STATUS=$(check_wg_interface "wg-surfshark")
SURF_PING="SKIP"

if [[ "$SURF_STATUS" == OK_* ]]; then
    # Interface is up, test actual connectivity
    SURF_PING=$(ping_through "wg-surfshark" "$PING_TARGET")
    
    if [ "$SURF_PING" = "FAIL" ]; then
        # Handshake is fresh but no connectivity — more serious
        log "ALERT wg-surfshark ping_fail (handshake OK but no connectivity)"
        ALERTS=$((ALERTS+1))
        
        # Test if we can reach the provider through SurfShark
        PROVIDER_PING=$(ping_through "wg-surfshark" "$PROVIDER_IP")
        if [ "$PROVIDER_PING" = "FAIL" ]; then
            log "CRITICAL wg-surfshark can't reach provider — restarting"
            restart_wg "wg-surfshark"
        fi
    fi
else
    log "ALERT wg-surfshark status=$SURF_STATUS"
    ALERTS=$((ALERTS+1))
    restart_wg "wg-surfshark"
    
    # Re-check after restart
    sleep 2
    SURF_STATUS=$(check_wg_interface "wg-surfshark")
    SURF_PING=$(ping_through "wg-surfshark" "$PING_TARGET")
    
    if [[ "$SURF_STATUS" != OK_* ]] || [ "$SURF_PING" = "FAIL" ]; then
        log "CRITICAL wg-surfshark STILL DOWN after restart"
    else
        log "RECOVERY wg-surfshark recovered after restart"
    fi
fi

# ─── 3. wg-surfshark-br (Failover VPN — São Paulo) ───
SURFBR_STATUS=$(check_wg_interface "wg-surfshark-br")
if [[ "$SURFBR_STATUS" != OK_* ]]; then
    log "ALERT wg-surfshark-br status=$SURFBR_STATUS"
    ALERTS=$((ALERTS+1))
    restart_wg "wg-surfshark-br"
fi

# ─── 4. Full path test: VPS → SurfShark → Provider ───
# Only if SurfShark is UP, test that the full IPTV path works
if [[ "$SURF_STATUS" == OK_* ]] && [ "$SURF_PING" = "OK" ]; then
    # Test actual IPTV provider reachability through the VPN
    PROVIDER_TEST=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 5 \
        --interface wg-surfshark \
        "http://${PROVIDER_IP}/" 2>/dev/null || echo "000")
    
    # Any response (even 403/404) means the path works
    if [ "$PROVIDER_TEST" = "000" ]; then
        log "WARN provider unreachable through wg-surfshark (curl timeout)"
        ALERTS=$((ALERTS+1))
    fi
fi

# ─── Write state file (for metrics/dashboard) ───
cat > "$STATE_FILE" <<EOF
{
    "timestamp": "$TS",
    "wg0": "$WG0_STATUS",
    "wg_surfshark": "$SURF_STATUS",
    "wg_surfshark_ping": "$SURF_PING",
    "wg_surfshark_br": "$SURFBR_STATUS",
    "alerts": $ALERTS
}
EOF

# Hourly heartbeat (log OK every hour if no alerts)
MIN=$(date -u +%M)
if [ "$MIN" = "00" ] || [ "$MIN" = "30" ]; then
    if [ "$ALERTS" = "0" ]; then
        log "OK wg0=$WG0_STATUS surfshark=$SURF_STATUS($SURF_PING) br=$SURFBR_STATUS"
    fi
fi

exit 0
