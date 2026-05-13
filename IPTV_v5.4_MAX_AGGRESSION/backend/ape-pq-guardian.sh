#!/system/bin/sh
# ═══════════════════════════════════════════════════════════════════
# APE PQ GUARDIAN v2.0 — Persistent AI Image Enforcer for ONN 4K
# ═══════════════════════════════════════════════════════════════════
# Amlogic S905X4 | Android TV 12 | Samsung 2017 4K (SDR — no HDR HDMI)
#
# PURPOSE: Forces and maintains maximum AI picture quality settings
#          on the ONN 4K. Runs as a persistent background daemon
#          that re-applies settings every 5 minutes.
#
# INSTALL: Pushed via ADB, runs automatically on boot via
#          the boot-completed trigger mechanism.
#
# IDEMPOTENT: Safe to run multiple times. Only writes if value changed.
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="/data/local/tmp"
SCRIPT_NAME="ape-pq-guardian.sh"
LOG_FILE="/data/local/tmp/ape-pq-guardian.log"
LOCK_FILE="/data/local/tmp/ape-pq-guardian.lock"
CHECK_INTERVAL=300  # 5 minutes

# ── LOGGING ──────────────────────────────────────────────────────
log() {
    local ts=$(date '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "$(date)")
    echo "[$ts] $1" >> "$LOG_FILE" 2>/dev/null
    echo "[$ts] $1"
}

# ── LOCK: Prevent duplicate instances ────────────────────────────
if [ -f "$LOCK_FILE" ]; then
    OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Guardian already running (PID $OLD_PID). Exiting."
        exit 0
    fi
    # Stale lock — remove
    rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"

# ── CLEANUP on exit ──────────────────────────────────────────────
cleanup() {
    rm -f "$LOCK_FILE"
    log "Guardian stopped (PID $$)"
    exit 0
}
trap cleanup EXIT INT TERM

# ═══════════════════════════════════════════════════════════════════
# DIRECTIVE MAP — v2.0 (corrected 2026-05-01)
# Samsung 2017 EDID: HDR10=NO, HLG=NO, HDR10+=NO → SDR only
# Forced HDR was DARKENING the image. Now SDR native = max brightness.
# ═══════════════════════════════════════════════════════════════════
# Format: "setting_key desired_value description"
DIRECTIVES="
aisr_enable|1|AI Super Resolution ON
ai_sr_level|3|AISR Level MAX (hardware upscale 720p/1080p→4K)
aipq_enable|1|AI Picture Quality ON
ai_pic_mode|3|AIPQ Mode MAX (scene-adaptive enhancement)
always_hdr|0|HDR OFF (Samsung 2017 no soporta HDR HDMI — causa imagen oscura)
hdr_conversion_mode|0|HDR Conversion OFF (TV solo acepta SDR)
color_mode_ycbcr422|1|Chroma 4:2:2 (double chroma vs 4:2:0)
force_gpu_rendering|1|Force GPU rendering for all UI/video
peak_luminance|1000|Peak luminance hint for tone mapping
video_brightness|100|Video layer brightness max
sdr_brightness_in_hdr|100|SDR brightness boost
pq_ai_sr_enable|1|PQ Pipeline AI Super Resolution
pq_ai_dnr_enable|1|PQ Pipeline AI Digital Noise Reduction
pq_ai_fbc_enable|1|PQ Pipeline AI Film-mode Blur Compensation
pq_hdr_enable|1|PQ Pipeline HDR tone mapping engine
pq_hdr_mode|1|PQ Pipeline HDR mode (internal processing)
pq_dnr_enable|1|PQ Pipeline Digital Noise Reduction
pq_sharpness_enable|1|PQ Pipeline Sharpness enhancement
pq_nr_enable|1|PQ Pipeline Noise Reduction
"

# ═══════════════════════════════════════════════════════════════════
# ENFORCE — Idempotent settings application
# ═══════════════════════════════════════════════════════════════════
enforce_settings() {
    local changed=0
    local total=0
    local ok=0

    log "=== ENFORCE CYCLE START ==="

    echo "$DIRECTIVES" | while IFS='|' read -r key value desc; do
        # Skip empty lines
        [ -z "$key" ] && continue
        key=$(echo "$key" | tr -d ' ')
        value=$(echo "$value" | tr -d ' ')

        total=$((total + 1))
        current=$(settings get global "$key" 2>/dev/null)

        if [ "$current" = "$value" ]; then
            ok=$((ok + 1))
        else
            settings put global "$key" "$value" 2>/dev/null
            verify=$(settings get global "$key" 2>/dev/null)
            if [ "$verify" = "$value" ]; then
                log "  FIXED: $key ($current → $value) [$desc]"
                changed=$((changed + 1))
            else
                log "  FAIL:  $key (wanted $value, got $verify) [$desc]"
            fi
        fi
    done

    log "=== ENFORCE CYCLE END ==="
}

# ═══════════════════════════════════════════════════════════════════
# DISPLAY MODE — Ensure 4K60 SDR + max brightness
# ═══════════════════════════════════════════════════════════════════
enforce_display() {
    # Verify display is at 3840x2160@60
    local mode=$(cmd display get-user-preferred-display-mode 2>/dev/null)
    if echo "$mode" | grep -q "3840"; then
        log "  DISPLAY: 4K60 confirmed"
    else
        cmd display set-user-preferred-display-mode 3840 2160 60.0 2>/dev/null
        log "  DISPLAY: Forced to 4K60"
    fi

    # Max screen brightness (system setting)
    local bright=$(settings get system screen_brightness 2>/dev/null)
    if [ "$bright" != "255" ]; then
        settings put system screen_brightness 255 2>/dev/null
        settings put system screen_brightness_mode 0 2>/dev/null
        log "  BRIGHTNESS: Pushed to 255 (was $bright)"
    fi
}

# ═══════════════════════════════════════════════════════════════════
# BOOT-COMPLETE INSTALLER — Self-installs the boot trigger
# ═══════════════════════════════════════════════════════════════════
install_boot_trigger() {
    # Method 1: rc.local equivalent for Amlogic
    local RC_DIR="/data/local/tmp"
    local BOOT_SCRIPT="$RC_DIR/ape-boot-trigger.sh"

    cat > "$BOOT_SCRIPT" << 'BOOTEOF'
#!/system/bin/sh
# APE Boot Trigger — Waits for boot completion, then starts Guardian
sleep 30  # Wait for system to stabilize
nohup /data/local/tmp/ape-pq-guardian.sh daemon > /dev/null 2>&1 &
BOOTEOF
    chmod 755 "$BOOT_SCRIPT" 2>/dev/null

    log "Boot trigger installed at $BOOT_SCRIPT"
}

# ═══════════════════════════════════════════════════════════════════
# STATUS — Print current state
# ═══════════════════════════════════════════════════════════════════
print_status() {
    echo "═══════════════════════════════════════════════"
    echo "  APE PQ GUARDIAN — ONN 4K Status Report"
    echo "═══════════════════════════════════════════════"
    echo ""

    echo "$DIRECTIVES" | while IFS='|' read -r key value desc; do
        [ -z "$key" ] && continue
        key=$(echo "$key" | tr -d ' ')
        value=$(echo "$value" | tr -d ' ')

        current=$(settings get global "$key" 2>/dev/null)
        if [ "$current" = "$value" ]; then
            echo "  ✅ $key = $current  [$desc]"
        else
            echo "  ❌ $key = $current (expected $value)  [$desc]"
        fi
    done

    echo ""
    echo "  DISPLAY: $(cmd display get-user-preferred-display-mode 2>/dev/null)"
    echo "  HDR Types: $(dumpsys display 2>/dev/null | grep -o 'supportedHdrTypes=\[[^]]*\]' | head -1)"
    echo ""

    # Check if daemon is running
    if [ -f "$LOCK_FILE" ]; then
        local pid=$(cat "$LOCK_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "  🟢 Guardian daemon RUNNING (PID $pid)"
        else
            echo "  🔴 Guardian daemon DEAD (stale lock)"
        fi
    else
        echo "  🔴 Guardian daemon NOT RUNNING"
    fi

    echo "═══════════════════════════════════════════════"
}

# ═══════════════════════════════════════════════════════════════════
# DAEMON MODE — Persistent watchdog loop
# ═══════════════════════════════════════════════════════════════════
run_daemon() {
    log "Guardian daemon started (PID $$, interval ${CHECK_INTERVAL}s)"

    # Initial enforcement
    enforce_settings
    enforce_display

    # Watchdog loop
    while true; do
        sleep "$CHECK_INTERVAL"
        enforce_settings
        enforce_display

        # Trim log to last 200 lines
        if [ -f "$LOG_FILE" ]; then
            local lines=$(wc -l < "$LOG_FILE" 2>/dev/null)
            if [ "$lines" -gt 200 ] 2>/dev/null; then
                tail -100 "$LOG_FILE" > "${LOG_FILE}.tmp"
                mv "${LOG_FILE}.tmp" "$LOG_FILE"
            fi
        fi
    done
}

# ═══════════════════════════════════════════════════════════════════
# MAIN — Command dispatcher
# ═══════════════════════════════════════════════════════════════════
case "${1:-apply}" in
    apply)
        log "Manual apply triggered"
        enforce_settings
        enforce_display
        print_status
        ;;
    daemon)
        run_daemon
        ;;
    status)
        print_status
        ;;
    install)
        log "Installing Guardian with boot persistence"
        enforce_settings
        enforce_display
        install_boot_trigger
        print_status
        echo ""
        echo "  To start daemon NOW:  nohup $SCRIPT_DIR/$SCRIPT_NAME daemon &"
        echo "  To check status:      $SCRIPT_DIR/$SCRIPT_NAME status"
        echo ""
        ;;
    stop)
        if [ -f "$LOCK_FILE" ]; then
            kill $(cat "$LOCK_FILE") 2>/dev/null
            rm -f "$LOCK_FILE"
            echo "Guardian stopped."
        else
            echo "Guardian not running."
        fi
        ;;
    *)
        echo "Usage: $0 {apply|daemon|status|install|stop}"
        echo ""
        echo "  apply   — Apply settings once (default)"
        echo "  daemon  — Run persistent watchdog (every 5 min)"
        echo "  status  — Show current AI/PQ state"
        echo "  install — Install + boot trigger + apply"
        echo "  stop    — Stop running daemon"
        ;;
esac
