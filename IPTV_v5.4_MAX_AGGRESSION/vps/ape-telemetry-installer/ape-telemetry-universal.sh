#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# APE TELEMETRY UNIVERSAL v1.0 — Idempotent ADB Telemetry Installer
# ═══════════════════════════════════════════════════════════════════════════════
# ONE SCRIPT. ANY DEVICE. ANY PLAYER. ANY NETWORK. ALWAYS REACHES THE GOAL.
#
# Usage (from VPS):
#   bash ape-telemetry-universal.sh                    # Auto-discover all devices
#   bash ape-telemetry-universal.sh 10.200.0.3:5555    # Target specific device
#   bash ape-telemetry-universal.sh 192.168.1.100      # WiFi IP (auto-adds :5555)
#
# Idempotent: Run infinite times. Never breaks. Always converges to goal state.
# Goal state: ADB connected + telemetry flowing + overlay working + PRISMA fed
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

VERSION="1.0.0"
ADB_BIN="${ADB_BIN:-adb}"
GUARDIAN_CONFIG="/etc/ape-realtime-guardian/config.yaml"
SHM_PLAYER="/dev/shm/guardian_player_state.json"
SHM_TELEMETRY="/dev/shm/prisma_player_telemetry.json"
SHM_ADB_STATE="/dev/shm/adb_persistence_state.json"
PRISMA_STATE="/dev/shm/prisma_state.json"
LOGCAT_TAGS="MediaCodecLogger:I ExoPlayer:D ExoPlayerImpl:D MediaCodecVideoRenderer:D VLC:D libVLC:D KodiPlayer:D MediaSession:D AudioTrack:D *:S"

# ── Colors ────────────────────────────────────────────────────────────────────
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; C='\033[0;36m'; B='\033[1m'; N='\033[0m'
ok()   { echo -e "  ${G}✅${N} $*"; }
fail() { echo -e "  ${R}❌${N} $*"; }
warn() { echo -e "  ${Y}⚠️${N}  $*"; }
info() { echo -e "  ${C}ℹ${N}  $*"; }
step() { echo -e "\n${B}[$1/8]${N} $2"; }

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 0: ENSURE ADB SERVER
# ═══════════════════════════════════════════════════════════════════════════════
ensure_adb() {
    if ! command -v "$ADB_BIN" &>/dev/null; then
        fail "ADB not found. Install: apt install android-tools-adb"
        exit 1
    fi
    $ADB_BIN start-server 2>/dev/null || true
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: DISCOVER OR CONNECT DEVICE
# ═══════════════════════════════════════════════════════════════════════════════
connect_device() {
    local addr="$1"
    # Normalize: add :5555 if missing port
    [[ "$addr" == *:* ]] || addr="${addr}:5555"

    # Idempotent connect — safe to call if already connected
    local out
    out=$($ADB_BIN connect "$addr" 2>&1)
    sleep 1

    # Verify alive (retry once after brief wait)
    local alive
    for attempt in 1 2; do
        alive=$($ADB_BIN -s "$addr" shell echo ALIVE 2>/dev/null | tr -d '\r\n' || true)
        [[ "$alive" == "ALIVE" ]] && break
        sleep 1
    done
    if [[ "$alive" == "ALIVE" ]]; then
        ok "Connected: $addr"
        CONNECTED_RESULT="$addr"
        return 0
    fi

    # If unauthorized, hint user
    if echo "$out" | grep -qi "unauthorized"; then
        warn "Device at $addr needs authorization — check TV screen for 'Allow USB debugging'"
        return 1
    fi

    fail "Cannot reach $addr ($out)"
    return 1
}

discover_devices() {
    local found=()

    # Source 1: Already connected ADB devices
    while IFS= read -r line; do
        local addr=$(echo "$line" | awk '{print $1}')
        [[ "$addr" == *:* ]] && found+=("$addr")
    done < <($ADB_BIN devices 2>/dev/null | grep -E 'device$')

    # Source 2: Guardian config (known devices)
    if [[ -f "$GUARDIAN_CONFIG" ]]; then
        while IFS= read -r addr; do
            [[ -n "$addr" ]] && found+=("$addr")
        done < <(python3 -c "
import yaml
with open('$GUARDIAN_CONFIG') as f:
    cfg = yaml.safe_load(f)
for d in cfg.get('probes',{}).get('devices',[]):
    print(d.get('adb_address',''))
" 2>/dev/null)
    fi

    # Source 3: ADB persistence state
    if [[ -f "$SHM_ADB_STATE" ]]; then
        while IFS= read -r addr; do
            [[ -n "$addr" ]] && found+=("$addr")
        done < <(python3 -c "
import json
with open('$SHM_ADB_STATE') as f:
    d = json.load(f)
for v in d.get('devices',{}).values():
    print(v.get('address',''))
" 2>/dev/null)
    fi

    # Source 4: Scan WireGuard subnet 10.200.0.2-10 for ADB
    for i in $(seq 2 10); do
        local ip="10.200.0.${i}:5555"
        # Quick TCP check (100ms timeout)
        if timeout 0.2 bash -c "echo >/dev/tcp/10.200.0.${i}/5555" 2>/dev/null; then
            found+=("$ip")
        fi
    done

    # Deduplicate
    printf '%s\n' "${found[@]}" | sort -u
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: DETECT DEVICE INFO + PLAYER APP
# ═══════════════════════════════════════════════════════════════════════════════
detect_device() {
    local dev="$1"
    # Device properties — aggressively strip \r from ADB output
    MODEL=$($ADB_BIN -s "$dev" shell getprop ro.product.model 2>/dev/null | tr -dc '[:print:]' | sed 's/[[:space:]]*$//')
    BRAND=$($ADB_BIN -s "$dev" shell getprop ro.product.brand 2>/dev/null | tr -dc '[:print:]' | sed 's/[[:space:]]*$//')
    SDK=$($ADB_BIN -s "$dev" shell getprop ro.build.version.sdk 2>/dev/null | tr -dc '[:print:]' | sed 's/[[:space:]]*$//')
    ANDROID=$($ADB_BIN -s "$dev" shell getprop ro.build.version.release 2>/dev/null | tr -dc '[:print:]' | sed 's/[[:space:]]*$//')
    SOC=$($ADB_BIN -s "$dev" shell getprop ro.hardware 2>/dev/null | tr -dc '[:print:]' | sed 's/[[:space:]]*$//')
    [[ -z "$MODEL" ]] && MODEL="unknown"
    [[ -z "$BRAND" ]] && BRAND="unknown"

    ok "Device: $BRAND $MODEL | Android $ANDROID (SDK $SDK) | SoC: $SOC"
}

detect_player() {
    local dev="$1"
    local pkgs
    pkgs=$($ADB_BIN -s "$dev" shell pm list packages 2>/dev/null | tr -d '\r')

    # Priority-ordered player detection
    DETECTED_PLAYER="unknown"
    local PKG="none"
    if echo "$pkgs" | grep -q "navigator.ottnavigator"; then
        DETECTED_PLAYER="ott_navigator"; PKG="com.ottnavigator.ottnavigator"
    elif echo "$pkgs" | grep -q "ar.tvplayer"; then
        DETECTED_PLAYER="tivimate"; PKG="ar.tvplayer"
    elif echo "$pkgs" | grep -q "tivimate"; then
        DETECTED_PLAYER="tivimate"; PKG=$(echo "$pkgs" | grep tivimate | head -1 | sed 's/package://')
    elif echo "$pkgs" | grep -q "videolan.vlc"; then
        DETECTED_PLAYER="vlc"; PKG="org.videolan.vlc"
    elif echo "$pkgs" | grep -q "xbmc.kodi"; then
        DETECTED_PLAYER="kodi"; PKG="org.xbmc.kodi"
    elif echo "$pkgs" | grep -q "ss.iptv"; then
        DETECTED_PLAYER="ssiptv"; PKG=$(echo "$pkgs" | grep ss.iptv | head -1 | sed 's/package://')
    elif echo "$pkgs" | grep -q "tvirl"; then
        DETECTED_PLAYER="tvirl"; PKG=$(echo "$pkgs" | grep tvirl | head -1 | sed 's/package://')
    elif echo "$pkgs" | grep -q "perfectplayer"; then
        DETECTED_PLAYER="perfectplayer"; PKG=$(echo "$pkgs" | grep perfectplayer | head -1 | sed 's/package://')
    elif echo "$pkgs" | grep -q "sparkle.stb"; then
        DETECTED_PLAYER="sparkle"; PKG=$(echo "$pkgs" | grep sparkle | head -1 | sed 's/package://')
    elif echo "$pkgs" | grep -q "implayer"; then
        DETECTED_PLAYER="implayer"; PKG=$(echo "$pkgs" | grep implayer | head -1 | sed 's/package://')
    fi

    ok "Player: $DETECTED_PLAYER ($PKG)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: ENABLE TELEMETRY LOGGING (idempotent)
# ═══════════════════════════════════════════════════════════════════════════════
enable_telemetry() {
    local dev="$1"
    # Expand logcat buffer (idempotent)
    $ADB_BIN -s "$dev" logcat -G 4M 2>/dev/null || true
    # Enable MediaCodec debug (idempotent, survives until reboot)
    $ADB_BIN -s "$dev" shell setprop debug.stagefright.omx_debug_level 1 2>/dev/null || true
    $ADB_BIN -s "$dev" shell setprop debug.media.codec.log 1 2>/dev/null || true
    $ADB_BIN -s "$dev" shell setprop log.tag.ExoPlayer D 2>/dev/null || true
    $ADB_BIN -s "$dev" shell setprop log.tag.ExoPlayerImpl D 2>/dev/null || true
    $ADB_BIN -s "$dev" shell setprop log.tag.MediaCodecLogger I 2>/dev/null || true
    $ADB_BIN -s "$dev" shell setprop log.tag.MediaCodecVideoRenderer D 2>/dev/null || true
    ok "Telemetry props set (buffer=4MB, MediaCodec=debug)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: COLLECT TELEMETRY SNAPSHOT & WRITE SHM
# ═══════════════════════════════════════════════════════════════════════════════
collect_and_write() {
    local dev="$1"
    local LOGCAT
    LOGCAT=$($ADB_BIN -s "$dev" shell logcat -d -t 500 $LOGCAT_TAGS 2>/dev/null || true)

    local VIDEO_LINE CODEC BITRATE RESOLUTION DECODER BUFFER DROPPED
    VIDEO_LINE=$(echo "$LOGCAT" | grep -E 'video\.\w+\.bitrateInKbps' | tail -1 || true)

    CODEC=$(echo "$VIDEO_LINE" | grep -oP '\.video\.\K\w+(?=\.bitrateInKbps)' 2>/dev/null || echo "unknown")
    BITRATE=$(echo "$VIDEO_LINE" | grep -oP 'bitrateInKbps\s*=\s*\K\d+' 2>/dev/null || echo "0")
    RESOLUTION=$(echo "$VIDEO_LINE" | grep -oP '\d+\.\K(4K|UHD|FHD|HD|SD)(?=\.)' 2>/dev/null || echo "unknown")
    DECODER=$(echo "$VIDEO_LINE" | grep -oP '\d+\.\w+\.\K(HW|SW)(?=\.)' 2>/dev/null || echo "unknown")
    BUFFER=$(echo "$LOGCAT" | grep -oP 'bufferedDurationUs=\K\d+' | tail -1 2>/dev/null || echo "0")
    DROPPED=$(echo "$LOGCAT" | grep -oP 'droppedFrames.*?count=\K\d+' | tail -1 2>/dev/null || echo "0")

    [[ -z "$CODEC" ]] && CODEC="unknown"
    [[ -z "$BITRATE" ]] && BITRATE=0
    [[ -z "$RESOLUTION" ]] && RESOLUTION="unknown"
    [[ -z "$DECODER" ]] && DECODER="unknown"
    [[ -z "$BUFFER" ]] && BUFFER=0
    [[ -z "$DROPPED" ]] && DROPPED=0

    local BUF_MS=$((BUFFER / 1000))

    # Write to both SHM files atomically (for both Bridge and PRISMA direct)
    for OUTFILE in "$SHM_PLAYER" "$SHM_TELEMETRY"; do
        local TMP
        TMP=$(mktemp /dev/shm/.telem_XXXXXX)
        cat > "$TMP" <<ENDJSON
{
  "ts": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "device": "$dev",
  "codec": "$CODEC",
  "resolution": "$RESOLUTION",
  "bitrate_kbps": $BITRATE,
  "decoder_type": "$DECODER",
  "buffer_us": $BUFFER,
  "buffer_ms": $BUF_MS,
  "dropped_frames": $DROPPED,
  "source": "ape-telemetry-universal"
}
ENDJSON
        mv "$TMP" "$OUTFILE"
    done

    if [[ "$BITRATE" -gt 0 ]]; then
        ok "Telemetry: codec=$CODEC res=$RESOLUTION br=${BITRATE}Kbps dec=$DECODER buf=${BUF_MS}ms drop=$DROPPED"
    else
        warn "No active stream detected (bitrate=0) — telemetry will populate when playing"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5: REGISTER IN GUARDIAN CONFIG (idempotent)
# ═══════════════════════════════════════════════════════════════════════════════
register_in_guardian() {
    local dev="$1" name="$2" player="$3"
    [[ -f "$GUARDIAN_CONFIG" ]] || { warn "Guardian config not found — skipping registration"; return; }

    python3 -c "
import yaml
with open('$GUARDIAN_CONFIG') as f:
    cfg = yaml.safe_load(f)
devices = cfg.setdefault('probes', {}).setdefault('devices', [])
# Idempotent: remove existing, re-add with current values
devices = [d for d in devices if d.get('adb_address') != '$dev']
devices.append({'name': '$name', 'adb_address': '$dev', 'player': '$player', 'poll_every_n_cycles': 2})
cfg['probes']['devices'] = devices
with open('$GUARDIAN_CONFIG', 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)
print(f'Registered: {len(devices)} devices total')
" 2>/dev/null && ok "Guardian config updated" || warn "Could not update Guardian config"

    # SIGHUP reload (idempotent — no effect if already current)
    kill -HUP $(pgrep -f "ape_realtime_guardian" | head -1) 2>/dev/null || \
        systemctl restart ape-realtime-guardian 2>/dev/null || true
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6: SEND PRISMA OVERLAY NOTIFICATION (idempotent)
# ═══════════════════════════════════════════════════════════════════════════════
send_overlay() {
    local dev="$1" msg="$2"
    $ADB_BIN -s "$dev" shell "cmd notification post -S bigtext -t '$msg' prisma_setup '$msg'" 2>/dev/null || true
    (sleep 5; $ADB_BIN -s "$dev" shell "cmd notification cancel prisma_setup" 2>/dev/null || true) &
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 7: VERIFY PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════
verify_pipeline() {
    local dev="$1"
    local pass=0 total=0

    ((total++)); local alv; alv=$($ADB_BIN -s "$dev" shell echo ALIVE 2>/dev/null | tr -d '\r\n' || true); [[ "$alv" == "ALIVE" ]] && { ok "ADB alive"; ((pass++)); } || fail "ADB not responding"
    ((total++)); [[ -f "$SHM_PLAYER" ]] && { ok "SHM player state exists"; ((pass++)); } || warn "SHM not written yet"
    ((total++)); systemctl is-active ape-realtime-guardian &>/dev/null && { ok "Guardian daemon active"; ((pass++)); } || warn "Guardian not running"
    ((total++)); systemctl is-active prisma-guardian-bridge &>/dev/null && { ok "Bridge daemon active"; ((pass++)); } || warn "Bridge not running"

    echo ""
    echo -e "  ${B}Pipeline: $pass/$total checks passed${N}"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN — ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════
main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo " 🔮 APE Telemetry Universal v${VERSION} — Idempotent Installer"
    echo " $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "═══════════════════════════════════════════════════════════════"

    ensure_adb

    # Determine target devices
    local TARGETS=()
    if [[ $# -gt 0 ]]; then
        for arg in "$@"; do
            [[ "$arg" == *:* ]] || arg="${arg}:5555"
            TARGETS+=("$arg")
        done
    else
        step "0" "Auto-discovering devices..."
        while IFS= read -r d; do
            [[ -n "$d" ]] && TARGETS+=("$d")
        done < <(discover_devices)
        if [[ ${#TARGETS[@]} -eq 0 ]]; then
            fail "No devices found. Usage: $0 <IP:PORT>"
            exit 1
        fi
        ok "Found ${#TARGETS[@]} device(s): ${TARGETS[*]}"
    fi

    # Process each device
    for DEV_ADDR in "${TARGETS[@]}"; do
        echo ""
        echo -e "${B}━━━ Processing: $DEV_ADDR ━━━${N}"

        step "1" "Connecting..."
        CONNECTED_RESULT=""
        connect_device "$DEV_ADDR" || continue
        local CONNECTED_ADDR="$CONNECTED_RESULT"

        step "2" "Detecting device..."
        detect_device "$CONNECTED_ADDR"

        step "3" "Detecting player..."
        detect_player "$CONNECTED_ADDR"
        local PLAYER="$DETECTED_PLAYER"

        step "4" "Enabling telemetry logging..."
        enable_telemetry "$CONNECTED_ADDR"

        step "5" "Collecting telemetry snapshot..."
        collect_and_write "$CONNECTED_ADDR"

        step "6" "Registering in Guardian..."
        local SAFE_NAME
        SAFE_NAME=$(echo "${MODEL:-device}_${DEV_ADDR%%:*}" | tr -c 'a-zA-Z0-9_' '_' | tr '[:upper:]' '[:lower:]' | head -c 30)
        register_in_guardian "$CONNECTED_ADDR" "$SAFE_NAME" "$PLAYER"

        step "7" "Sending overlay notification..."
        send_overlay "$CONNECTED_ADDR" "⚡ APE Telemetry Active — $PLAYER"

        step "8" "Verifying pipeline..."
        verify_pipeline "$CONNECTED_ADDR"
    done

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo -e " ${G}✅ APE Telemetry Universal — Complete${N}"
    echo ""
    echo " Re-run anytime: bash $0"
    echo " Check PRISMA:   curl -s https://iptv-ape.duckdns.org/prisma/api/prisma-health.php | python3 -m json.tool"
    echo "═══════════════════════════════════════════════════════════════"
}

main "$@"
