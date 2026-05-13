#!/system/bin/sh
# ═══════════════════════════════════════════════════════════════════
# APE PQ GUARDIAN — FireStick 4K Max (MediaTek MT8696)
# ═══════════════════════════════════════════════════════════════════
# version: 1.0 — 2026-05-01
# Applies Amazon-specific HDR and quality enhancement properties.
# ═══════════════════════════════════════════════════════════════════

LOG="/data/local/tmp/ape-pq-guardian.log"
LOCK="/data/local/tmp/ape-pq-guardian.lock"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG" 2>/dev/null; echo "$1"; }

# Lock
if [ -f "$LOCK" ]; then
    OLD=$(cat "$LOCK" 2>/dev/null)
    kill -0 "$OLD" 2>/dev/null && { echo "Already running (PID $OLD)"; exit 0; }
    rm -f "$LOCK"
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"; exit 0' EXIT INT TERM

# ── Amazon HDR Pipeline ──────────────────────────────────────────
DIRECTIVES="
persist.amazon.hdr.mode|1|Amazon HDR mode ON
persist.amazon.hdr.hlg|1|HLG HDR support ON
persist.amazon.hdr.hdr10plus|1|HDR10+ support ON
persist.amazon.video.quality.enhancement|1|Video quality enhancement ON
persist.amazon.video.decoder.hevc|1|HEVC hardware decoder ON
persist.amazon.video.decoder.hevc10|1|HEVC 10-bit decoder ON
persist.amazon.video.hdr.enabled|1|Video HDR output ON
"

# ── Settings equivalents (fallback if setprop fails) ─────────────
SETTINGS_DIRECTIVES="
amazon_hdr_mode|1|Amazon HDR mode
amazon_hdr_hlg|1|HLG support
amazon_hdr_hdr10plus|1|HDR10+ support
amazon_video_quality_enhancement|1|Quality enhancement
amazon_video_decoder_hevc|1|HEVC decoder
amazon_video_decoder_hevc10|1|HEVC 10-bit
amazon_video_hdr_enabled|1|Video HDR
"

enforce() {
    log "=== ENFORCE START ==="

    # Try setprop first (needs root)
    echo "$DIRECTIVES" | while IFS='|' read -r key value desc; do
        [ -z "$key" ] && continue
        key=$(echo "$key" | tr -d ' ')
        value=$(echo "$value" | tr -d ' ')
        current=$(getprop "$key" 2>/dev/null)
        if [ "$current" != "$value" ]; then
            setprop "$key" "$value" 2>/dev/null
            verify=$(getprop "$key" 2>/dev/null)
            if [ "$verify" = "$value" ]; then
                log "  PROP OK: $key=$value [$desc]"
            else
                log "  PROP FAIL: $key (using settings fallback)"
            fi
        fi
    done

    # Settings fallback (works without root)
    echo "$SETTINGS_DIRECTIVES" | while IFS='|' read -r key value desc; do
        [ -z "$key" ] && continue
        key=$(echo "$key" | tr -d ' ')
        value=$(echo "$value" | tr -d ' ')
        current=$(settings get global "$key" 2>/dev/null)
        if [ "$current" != "$value" ]; then
            settings put global "$key" "$value" 2>/dev/null
            log "  SET: $key=$value [$desc]"
        fi
    done

    # Max brightness
    local bright=$(settings get system screen_brightness 2>/dev/null)
    if [ "$bright" != "255" ]; then
        settings put system screen_brightness 255 2>/dev/null
        log "  BRIGHTNESS: $bright → 255"
    fi

    log "=== ENFORCE END ==="
}

case "${1:-apply}" in
    apply)   enforce ;;
    daemon)
        log "Daemon started (PID $$)"
        enforce
        while true; do sleep 300; enforce; done
        ;;
    status)
        echo "=== FireStick 4K Max PQ Status ==="
        echo "$DIRECTIVES" | while IFS='|' read -r key value desc; do
            [ -z "$key" ] && continue
            key=$(echo "$key" | tr -d ' ')
            val=$(getprop "$key" 2>/dev/null)
            [ "$val" = "$value" ] && echo "  ✅ $key=$val" || echo "  ❌ $key=$val (want $value)"
        done
        echo "$SETTINGS_DIRECTIVES" | while IFS='|' read -r key value desc; do
            [ -z "$key" ] && continue
            key=$(echo "$key" | tr -d ' ')
            val=$(settings get global "$key" 2>/dev/null)
            [ "$val" = "$value" ] && echo "  ✅ $key=$val (settings)" || echo "  ⚠️ $key=$val (settings)"
        done
        ;;
    stop)    [ -f "$LOCK" ] && kill $(cat "$LOCK") 2>/dev/null && rm -f "$LOCK" && echo "Stopped." || echo "Not running." ;;
    *)       echo "Usage: $0 {apply|daemon|status|stop}" ;;
esac
