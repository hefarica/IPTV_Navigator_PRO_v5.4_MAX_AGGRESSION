#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# wg-health-fast.sh — Sub-second failover detector (cadencia 2s)
# Aplicado 2026-05-11 per orden HFRC: failover imperceptible Miami↔Brasil
#
# Detección de gaps que el wg-health-monitor.sh (cada 30s) no cubre:
#   1. ICMP ping fail × 3 consecutivos (6s detección) → failover instant
#   2. /tmp/sentinel_force_failover flag (de sentinel_auth_guard.lua) → failover en próximo tick
#   3. Histéresis 10 ticks OK Miami antes de failback
#   4. Cooldown 10 min post-swap (evita flap-flap)
#
# Coexiste con wg-health-monitor.sh (cada 30s) que se queda para restart logic
# y recovery deep checks. Roles separados:
#   - fast.sh = detección + decisión swap (this script)
#   - monitor.sh = restart logic, cooldown, deep checks
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

LOG=/var/log/netshield-wg-health.log
STATE_DIR=/opt/netshield/state
ACTIVE_VPN_FILE=$STATE_DIR/active_vpn
FAIL_COUNT_FILE=/tmp/wg_miami_fail_fast
GOOD_COUNT_FILE=/tmp/wg_miami_good_count
SENTINEL_FLAG=/tmp/sentinel_force_failover
COOLDOWN_FILE=/tmp/wg_failover_cooldown
ROUTING_SCRIPT=/opt/netshield/scripts/surfshark-routing.sh
FAIL_THRESHOLD=3        # 3 ticks × 2s = 6s detección Miami dead
GOOD_THRESHOLD=10       # 10 ticks × 2s = 20s estable para failback
COOLDOWN_SECONDS=600    # 10 min entre swaps (anti-flap)
PING_TIMEOUT=1

NOW=$(date +%s)
TS=$(date -u +%FT%TZ)
ACTIVE=$(cat "$ACTIVE_VPN_FILE" 2>/dev/null || echo miami)

log() { echo "$TS [fast] $*" >> "$LOG"; }

# Cooldown post-swap
if [[ -f "$COOLDOWN_FILE" ]]; then
    CD_AGE=$((NOW - $(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)))
    [[ $CD_AGE -lt $COOLDOWN_SECONDS ]] && exit 0
fi

# Priority 1: sentinel 407 flag (instant trigger)
if [[ -f "$SENTINEL_FLAG" ]] && [[ "$ACTIVE" == "miami" ]]; then
    FLAG_AGE=$((NOW - $(awk "{print \$1}" "$SENTINEL_FLAG" 2>/dev/null || echo 0)))
    if [[ $FLAG_AGE -lt 30 ]]; then
        log "TRIGGER 407 force-failover to Brasil (flag age ${FLAG_AGE}s)"
        "$ROUTING_SCRIPT" failover-brazil
        echo "$NOW" > "$COOLDOWN_FILE"
        rm -f "$SENTINEL_FLAG" "$FAIL_COUNT_FILE" "$GOOD_COUNT_FILE"
        exit 0
    fi
fi

# Sub-second ping check Miami (via wg-surfshark)
if ping -c1 -W$PING_TIMEOUT -I wg-surfshark 1.1.1.1 &>/dev/null; then
    # Miami OK
    echo 0 > "$FAIL_COUNT_FILE"
    
    if [[ "$ACTIVE" == "brazil" ]]; then
        GOOD=$(($(cat "$GOOD_COUNT_FILE" 2>/dev/null || echo 0) + 1))
        echo "$GOOD" > "$GOOD_COUNT_FILE"
        if [[ $GOOD -ge $GOOD_THRESHOLD ]]; then
            log "RECOVERY $GOOD ticks Miami OK -> failback"
            "$ROUTING_SCRIPT" failover-miami
            echo "$NOW" > "$COOLDOWN_FILE"
            echo 0 > "$GOOD_COUNT_FILE"
        fi
    fi
else
    # Miami FAIL
    FAILS=$(($(cat "$FAIL_COUNT_FILE" 2>/dev/null || echo 0) + 1))
    echo "$FAILS" > "$FAIL_COUNT_FILE"
    
    if [[ $FAILS -ge $FAIL_THRESHOLD ]] && [[ "$ACTIVE" == "miami" ]]; then
        log "FAILOVER $FAILS consecutive fails -> Brasil"
        "$ROUTING_SCRIPT" failover-brazil
        echo "$NOW" > "$COOLDOWN_FILE"
        echo 0 > "$FAIL_COUNT_FILE"
    fi
fi
exit 0
