#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE SENTINEL — Fire TV Profile Overrides
# Contains overrides specific to Amazon Fire TV platforms (AFTKRT, AFTKA, etc.)
# ══════════════════════════════════════════════════════════════════════════

# Prevent device from entering sleep or standby mode
apply_firetv_standby_prevention() {
    local target="$1"
    echo "[FIRETV_PROFILE] Applying standby prevention..."
    
    # Standard stay awake keys
    adb -s "$target" shell "settings put global stay_on_while_plugged_in 3" 2>/dev/null || true
    adb -s "$target" shell "settings put system screen_off_timeout 2147483647" 2>/dev/null || true
    
    # Fire TV specific standby/sleep settings
    adb -s "$target" shell "settings put secure sleep_timeout 0" 2>/dev/null || true
    adb -s "$target" shell "settings put secure screensaver_timeout 0" 2>/dev/null || true
    adb -s "$target" shell "settings put secure screensaver_enabled 0" 2>/dev/null || true
    
    # Whitelist media players from doze
    adb -s "$target" shell "cmd deviceidle whitelist +studio.scillarium.ottnavigator" 2>/dev/null || true
    adb -s "$target" shell "cmd deviceidle whitelist +ar.tvplayer.tv" 2>/dev/null || true
}

# Apply Fire TV display & HDR settings
apply_firetv_display_overrides() {
    local target="$1"
    echo "[FIRETV_PROFILE] Applying display and HDR overrides..."
    
    # 0 = Adaptive (Match content dynamic range), 1 = Always HDR, 2 = Disable HDR (Force SDR)
    adb -s "$target" shell "settings put global hdr_conversion_mode 0" 2>/dev/null || true
    
    # Match content frame rate (0 = Never, 1 = Adaptive/Match)
    adb -s "$target" shell "settings put global match_content_frame_rate 1" 2>/dev/null || true
    
    # Set color mode (BT.2020 / Deep Color preferred)
    adb -s "$target" shell "settings put global display_color_mode 3" 2>/dev/null || true
    
    # Disable screen saver overlays or promo videos on wake
    adb -s "$target" shell "settings put global transition_animation_scale 0.0" 2>/dev/null || true
    adb -s "$target" shell "settings put global window_animation_scale 0.0" 2>/dev/null || true
    adb -s "$target" shell "settings put global animator_duration_scale 0.0" 2>/dev/null || true
}

# Master function called by sentinel_orchestrator when a Fire TV is detected
apply_firetv_profile() {
    local target="$1"
    echo "[FIRETV_PROFILE] Applying complete Fire TV hardening profile to $target"
    apply_firetv_standby_prevention "$target"
    apply_firetv_display_overrides "$target"
}
