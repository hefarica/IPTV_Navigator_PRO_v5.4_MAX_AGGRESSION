#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# IPTV CACHE HYGIENE DAEMON
# Limpia automáticamente /dev/shm para mantener espacio para
# el proxy cache de NGINX. Se ejecuta cada 60 segundos.
# ═══════════════════════════════════════════════════════════════

SHM="/dev/shm"
LOG="/var/log/cache_hygiene.log"
MAX_SHM_PERCENT=70  # Alertar si /dev/shm supera 70%

log() {
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$LOG"
}

cleanup_stale() {
    local freed=0
    
    # 1. Sesiones PHP viejas (> 24h)
    local old_sessions=$(find "$SHM" -name 'sess_*.json' -mmin +1440 2>/dev/null)
    if [ -n "$old_sessions" ]; then
        local count=$(echo "$old_sessions" | wc -l)
        echo "$old_sessions" | xargs rm -f 2>/dev/null
        log "CLEANED $count stale sessions (>24h)"
        freed=$((freed + count))
    fi
    
    # 2. Historical logs viejos (> 7 days)
    local old_hist=$(find "$SHM" -name 'ape_historical_global_*.jsonL' -mtime +7 2>/dev/null)
    if [ -n "$old_hist" ]; then
        local count=$(echo "$old_hist" | wc -l)
        echo "$old_hist" | xargs rm -f 2>/dev/null
        log "CLEANED $count stale historical logs (>7d)"
        freed=$((freed + count))
    fi
    
    # 3. Guardian telemetry logs (> 3 days)
    local old_guardian=$(find "$SHM" -name 'guardian_telemetry_*.log' -mtime +3 2>/dev/null)
    if [ -n "$old_guardian" ]; then
        echo "$old_guardian" | xargs rm -f 2>/dev/null
        log "CLEANED stale guardian logs (>3d)"
    fi
    
    # 4. APE metrics log (truncar si > 1MB)
    if [ -f "$SHM/ape_metrics_v4.log" ]; then
        local size=$(stat -c%s "$SHM/ape_metrics_v4.log" 2>/dev/null)
        if [ "${size:-0}" -gt 1048576 ]; then
            tail -1000 "$SHM/ape_metrics_v4.log" > "$SHM/ape_metrics_v4.log.tmp"
            mv "$SHM/ape_metrics_v4.log.tmp" "$SHM/ape_metrics_v4.log"
            log "TRUNCATED ape_metrics_v4.log (was ${size}B)"
        fi
    fi
    
    # 5. NGINX cache — purgar entradas >2h (inactive ya debería hacerlo, 
    #    pero por si el cache manager no corre)
    local stale_cache=$(find "$SHM/nginx_cache" -type f -mmin +120 2>/dev/null | wc -l)
    if [ "$stale_cache" -gt 0 ]; then
        find "$SHM/nginx_cache" -type f -mmin +120 -delete 2>/dev/null
        log "PURGED $stale_cache stale cache entries (>2h)"
    fi
    
    echo $freed
}

check_pressure() {
    local usage=$(df --output=pcent "$SHM" | tail -1 | tr -d ' %')
    if [ "$usage" -ge "$MAX_SHM_PERCENT" ]; then
        log "WARNING: /dev/shm at ${usage}% — emergency cleanup"
        
        # Emergency: borrar channel_dna (es regenerable)
        if [ -d "$SHM/ape_channel_dna" ] && [ "$usage" -ge 85 ]; then
            rm -rf "$SHM/ape_channel_dna"
            log "EMERGENCY: removed ape_channel_dna (regenerable)"
        fi
        
        # Emergency: borrar dna_index (es regenerable)
        if [ -f "$SHM/ape_dna_index.json" ] && [ "$usage" -ge 90 ]; then
            rm -f "$SHM/ape_dna_index.json"
            log "EMERGENCY: removed ape_dna_index.json (196MB, regenerable)"
        fi
        
        return 1
    fi
    return 0
}

# === MAIN ===
log "Cache hygiene started — threshold=${MAX_SHM_PERCENT}%"

# Initial report
usage=$(df --output=pcent "$SHM" | tail -1 | tr -d ' %')
total_files=$(find "$SHM" -type f 2>/dev/null | wc -l)
log "Initial state: /dev/shm at ${usage}%, ${total_files} files"

# Run cleanup
cleaned=$(cleanup_stale)
check_pressure

# Final report
usage=$(df --output=pcent "$SHM" | tail -1 | tr -d ' %')
log "After cleanup: /dev/shm at ${usage}%, freed approx ${cleaned} items"

echo "=== CACHE HYGIENE COMPLETE ==="
echo "/dev/shm usage: ${usage}%"
df -h "$SHM"
