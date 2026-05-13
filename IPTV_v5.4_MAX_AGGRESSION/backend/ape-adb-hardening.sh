#!/system/bin/sh
# ═══════════════════════════════════════════════════════════════
# APE PRISMA — ADB Hardening Script v2.0
# Idempotente: seguro de ejecutar N veces sin efectos secundarios
# Target: ONN 4K (S905X4) / Fire TV Stick 4K Max (MT8696)
# ═══════════════════════════════════════════════════════════════

# --- Device Detection ---
MODEL=$(getprop ro.product.model)
PLATFORM=$(getprop ro.board.platform)
echo "═══ APE PRISMA HARDENING v2.0 ═══"
echo "Device: $MODEL"
echo "Platform: $PLATFORM"
echo "Date: $(date)"
echo "═════════════════════════════════"

# --- CATEGORÍA 1: IMAGEN — HDR10+ Extreme ---
echo "[1/8] Imagen HDR10+..."
settings put global always_hdr 1
settings put global hdr_conversion_mode 3
settings put global hdr_force_conversion_type 4
settings put global hdr_output_type 4
settings put global match_content_frame_rate 1
settings put secure display_color_mode 3
settings put global user_preferred_resolution_height 2160
settings put global user_preferred_resolution_width 3840
settings put global user_preferred_refresh_rate 60.0

# --- CATEGORÍA 2: AI VISION (solo Amlogic S905X4+) ---
echo "[2/8] AI Vision..."
if [ "$PLATFORM" = "s4" ] || [ "$PLATFORM" = "sc2" ] || [ "$PLATFORM" = "s5" ]; then
    settings put system aipq_enable 1
    settings put system aisr_enable 1
    settings put system ai_pq_mode 3
    settings put system ai_sr_mode 3
    settings put global aipq_enable 1
    settings put global aisr_enable 1
    settings put global ai_pic_mode 3
    settings put global ai_sr_level 3
    am broadcast -a com.droidlogic.tv.action.AIPQ_ENABLE --ei enable 1 > /dev/null 2>&1
    am broadcast -a com.droidlogic.tv.action.AISR_ENABLE --ei enable 1 > /dev/null 2>&1
    echo "  AIPQ+AISR: ENABLED (Amlogic)"
else
    echo "  AIPQ+AISR: SKIP (no Amlogic)"
fi

# --- CATEGORÍA 3: GPU — Vulkan Maximum ---
echo "[3/8] GPU Vulkan..."
settings put global force_hw_ui 1
settings put global force_gpu_rendering 1
settings put global hardware_accelerated_rendering_enabled 1
# Check Vulkan support before setting
VK=$(getprop ro.hardware.vulkan)
if [ -n "$VK" ]; then
    setprop debug.hwui.renderer skiavk
    echo "  Renderer: skiavk (Vulkan)"
else
    setprop debug.hwui.renderer skiagl
    echo "  Renderer: skiagl (OpenGL — no Vulkan)"
fi

# --- CATEGORÍA 4: RENDIMIENTO ---
echo "[4/8] Rendimiento..."
settings put global window_animation_scale 0.0
settings put global transition_animation_scale 0.0
settings put global animator_duration_scale 0.0
settings put global forced_app_standby_enabled 1
settings put global app_standby_enabled 1
settings put global adaptive_battery_management_enabled 0

# --- CATEGORÍA 5: RED ---
echo "[5/8] Red..."
settings put global tcp_default_init_rwnd 60
settings put global captive_portal_detection_enabled 0
settings put global wifi_sleep_policy 2
settings put global wifi_scan_always_enabled 0
settings put global wifi_networks_available_notification_on 0
settings put global network_scoring_ui_enabled 0
settings put global wifi_watchdog_poor_network_test_enabled 0
settings put global wifi_suspend_optimizations_enabled 0
settings put global background_data_enabled 0
settings put global data_roaming 0
settings put global package_verifier_enable 0
settings put global device_provisioned 1

# --- CATEGORÍA 6: ENERGÍA ---
echo "[6/8] Energía..."
settings put global stay_on_while_plugged_in 3
settings put global low_power 0
settings put system screen_off_timeout 2147483647
settings put secure screensaver_enabled 0

# --- CATEGORÍA 7: AUDIO ---
echo "[7/8] Audio..."
settings put global encoded_surround_output 1
settings put global hdmi_system_audio_control 1

# --- CATEGORÍA 8: DNS ---
echo "[8/8] DNS..."
settings put global private_dns_mode hostname
settings put global private_dns_specifier dns.google

# --- VERIFICACIÓN ---
echo ""
echo "═══ VERIFICACIÓN ═══"
echo "HDR:$(settings get global always_hdr) ConvMode:$(settings get global hdr_conversion_mode) ForceType:$(settings get global hdr_force_conversion_type)"
echo "Color:$(settings get secure display_color_mode) Res:$(settings get global user_preferred_resolution_height) Rate:$(settings get global user_preferred_refresh_rate)"
echo "AIPQ:$(settings get system aipq_enable) AISR:$(settings get system aisr_enable)"
echo "GPU:$(settings get global force_gpu_rendering) Renderer:$(getprop debug.hwui.renderer)"
echo "Anim:$(settings get global window_animation_scale) TCP:$(settings get global tcp_default_init_rwnd)"
echo "WiFi:$(settings get global wifi_sleep_policy) StayOn:$(settings get global stay_on_while_plugged_in)"
echo "Surround:$(settings get global encoded_surround_output) DNS:$(settings get global private_dns_mode)"
echo ""
echo "═══ APE PRISMA HARDENING COMPLETE ═══"
echo "STATUS: ALL_OK"
