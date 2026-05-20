#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE SENTINEL — ONN 4K Profile Overrides
# Contains overrides specific to ONN 4K Streaming Box (Amlogic S905X4+)
# ══════════════════════════════════════════════════════════════════════════

# Prevent ONN 4K Box from entering standby
apply_onn_standby_prevention() {
    local target="$1"
    echo "[ONN_PROFILE] Applying standby prevention..."
    
    adb -s "$target" shell "settings put global stay_on_while_plugged_in 3" 2>/dev/null || true
    adb -s "$target" shell "settings put system screen_off_timeout 2147483647" 2>/dev/null || true
    adb -s "$target" shell "settings put secure screensaver_enabled 0" 2>/dev/null || true
    
    # Whitelist media players from doze
    adb -s "$target" shell "cmd deviceidle whitelist +studio.scillarium.ottnavigator" 2>/dev/null || true
    adb -s "$target" shell "cmd deviceidle whitelist +ar.tvplayer.tv" 2>/dev/null || true
}

# Apply Amlogic AIPQ/AISR enhancements (Super Resolution)
apply_onn_aipq_overrides() {
    local target="$1"
    echo "[ONN_PROFILE] Applying Amlogic AIPQ & AISR configuration..."
    
    adb -s "$target" shell "settings put system aipq_enable 1" 2>/dev/null || true
    adb -s "$target" shell "settings put system aisr_enable 1" 2>/dev/null || true
    adb -s "$target" shell "settings put system ai_pq_mode 3" 2>/dev/null || true
    adb -s "$target" shell "settings put system ai_sr_mode 3" 2>/dev/null || true
    
    adb -s "$target" shell "settings put global aipq_enable 1" 2>/dev/null || true
    adb -s "$target" shell "settings put global aisr_enable 1" 2>/dev/null || true
    adb -s "$target" shell "settings put global ai_pic_mode 3" 2>/dev/null || true
    adb -s "$target" shell "settings put global ai_sr_level 3" 2>/dev/null || true
    
    # Broadcast DroidLogic intents for AIPQ/AISR activation
    adb -s "$target" shell "am broadcast -a com.droidlogic.tv.action.AIPQ_ENABLE --ei enable 1" >/dev/null 2>&1 || true
    adb -s "$target" shell "am broadcast -a com.droidlogic.tv.action.AISR_ENABLE --ei enable 1" >/dev/null 2>&1 || true
}

# Force Vulkan hardware acceleration
apply_onn_gpu_tuning() {
    local target="$1"
    echo "[ONN_PROFILE] Applying GPU hardware rendering tuning..."
    
    adb -s "$target" shell "settings put global force_hw_ui 1" 2>/dev/null || true
    adb -s "$target" shell "settings put global force_gpu_rendering 1" 2>/dev/null || true
    adb -s "$target" shell "settings put global hardware_accelerated_rendering_enabled 1" 2>/dev/null || true
    
    # Enable Skiavk if Vulkan hardware property is present
    local vk
    vk=$(adb -s "$target" shell "getprop ro.hardware.vulkan" 2>/dev/null | tr -d '\r\n')
    if [ -n "$vk" ]; then
        adb -s "$target" shell "setprop debug.hwui.renderer skiavk" 2>/dev/null || true
    else
        adb -s "$target" shell "setprop debug.hwui.renderer skiagl" 2>/dev/null || true
    fi
}

# Apply display properties (4K Output Preferred)
apply_onn_display_overrides() {
    local target="$1"
    echo "[ONN_PROFILE] Applying display resolution and refresh rate defaults..."
    
    adb -s "$target" shell "settings put global user_preferred_resolution_height 2160" 2>/dev/null || true
    adb -s "$target" shell "settings put global user_preferred_resolution_width 3840" 2>/dev/null || true
    adb -s "$target" shell "settings put global user_preferred_refresh_rate 60.0" 2>/dev/null || true
    adb -s "$target" shell "settings put global match_content_frame_rate 1" 2>/dev/null || true
    
    # Zero animations for speed
    adb -s "$target" shell "settings put global transition_animation_scale 0.0" 2>/dev/null || true
    adb -s "$target" shell "settings put global window_animation_scale 0.0" 2>/dev/null || true
    adb -s "$target" shell "settings put global animator_duration_scale 0.0" 2>/dev/null || true
}

# Master function called by sentinel_orchestrator when an ONN box is detected
apply_onn_profile() {
    local target="$1"
    echo "[ONN_PROFILE] Applying complete ONN 4K hardening profile to $target"
    apply_onn_standby_prevention "$target"
    apply_onn_aipq_overrides "$target"
    apply_onn_gpu_tuning "$target"
    apply_onn_display_overrides "$target"
}
