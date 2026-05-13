#!/system/bin/sh
echo '══════════════════════════════════════════════════════════'
echo '  ONN 4K QUALITY SUPREMA MANIFEST — LIVE VALUES'
echo '══════════════════════════════════════════════════════════'
echo ''
echo '═══ 1. AI PICTURE QUALITY ENGINE (Amlogic S905X4) ═══'
V=$(settings get system aipq_enable);       echo "  aipq_enable (system)      = $V"
V=$(settings get system aisr_enable);       echo "  aisr_enable (system)      = $V"
V=$(settings get system ai_pq_mode);        echo "  ai_pq_mode (system)       = $V"
V=$(settings get system ai_sr_mode);        echo "  ai_sr_mode (system)       = $V"
V=$(settings get global ai_pic_mode);       echo "  ai_pic_mode (global)      = $V"
V=$(settings get global ai_sr_level);       echo "  ai_sr_level (global)      = $V"
V=$(settings get global pq_ai_dnr_enable);  echo "  pq_ai_dnr_enable          = $V"
V=$(settings get global pq_ai_fbc_enable);  echo "  pq_ai_fbc_enable          = $V"
V=$(settings get global pq_ai_sr_enable);   echo "  pq_ai_sr_enable           = $V"
V=$(settings get global pq_dnr_enable);     echo "  pq_dnr_enable             = $V"
V=$(settings get global pq_nr_enable);      echo "  pq_nr_enable              = $V"
V=$(settings get global pq_sharpness_enable); echo "  pq_sharpness_enable       = $V"
V=$(settings get global pq_hdr_enable);     echo "  pq_hdr_enable             = $V"
V=$(settings get global pq_hdr_mode);       echo "  pq_hdr_mode               = $V"
V=$(settings get global smart_illuminate_enabled); echo "  smart_illuminate          = $V"
echo ''
echo '═══ 2. DISPLAY / RESOLUTION / REFRESH ═══'
V=$(settings get global user_preferred_resolution_height); echo "  resolution_height         = $V"
V=$(settings get global user_preferred_resolution_width);  echo "  resolution_width          = $V"
V=$(settings get global user_preferred_refresh_rate);      echo "  refresh_rate              = $V"
V=$(settings get global display_color_mode);               echo "  display_color_mode        = $V"
V=$(settings get global match_content_frame_rate_pref);    echo "  match_frame_rate_pref     = $V"
V=$(settings get global match_content_frame_rate);         echo "  match_frame_rate          = $V"
echo ''
echo '═══ 3. HDR ═══'
V=$(settings get global hdr_conversion_mode);       echo "  hdr_conversion_mode       = $V"
V=$(settings get global hdr_output_type);            echo "  hdr_output_type           = $V"
V=$(settings get global hdr_force_conversion_type);  echo "  hdr_force_conversion      = $V"
V=$(settings get global hdr_brightness_boost);       echo "  hdr_brightness_boost      = $V"
V=$(settings get global sdr_brightness_in_hdr);      echo "  sdr_brightness_in_hdr     = $V"
V=$(settings get global peak_luminance);             echo "  peak_luminance            = $V"
V=$(settings get global always_hdr);                 echo "  always_hdr                = $V"
V=$(settings get global user_disabled_hdr_formats);  echo "  disabled_hdr_formats      = $V"
echo ''
echo '═══ 4. COLOR ═══'
V=$(settings get global hdmi_color_space);       echo "  hdmi_color_space          = $V"
V=$(settings get global color_depth);            echo "  color_depth               = $V"
V=$(settings get global color_mode_ycbcr422);    echo "  color_mode_ycbcr422       = $V"
echo ''
echo '═══ 5. VIDEO BRIGHTNESS ═══'
V=$(settings get global video_brightness);   echo "  video_brightness          = $V"
V=$(settings get system screen_brightness);  echo "  screen_brightness         = $V"
echo ''
echo '═══ 6. AUDIO ═══'
V=$(settings get global encoded_surround_output);                echo "  surround_output           = $V"
V=$(settings get global encoded_surround_output_enabled_formats); echo "  surround_formats          = $V"
V=$(settings get global enable_dolby_atmos);                     echo "  dolby_atmos               = $V"
V=$(settings get global db_id_sound_spdif_output_enable);        echo "  spdif_output              = $V"
V=$(settings get global hdmi_system_audio_control);              echo "  hdmi_audio_control        = $V"
echo ''
echo '═══ 7. GPU / RENDERING ═══'
V=$(settings get global force_gpu_rendering);                  echo "  force_gpu_rendering       = $V"
V=$(settings get global force_hw_ui);                          echo "  force_hw_ui               = $V"
V=$(settings get global hardware_accelerated_rendering_enabled); echo "  hw_accel_rendering        = $V"
V=$(settings get global window_animation_scale);               echo "  window_animation          = $V"
V=$(settings get global transition_animation_scale);           echo "  transition_animation      = $V"
V=$(settings get global animator_duration_scale);              echo "  animator_duration         = $V"
echo ''
echo '═══ 8. SCREEN / POWER ═══'
V=$(settings get system screen_off_timeout);         echo "  screen_off_timeout        = $V"
V=$(settings get global stay_on_while_plugged_in);   echo "  stay_on_plugged           = $V"
echo ''
echo '═══ 9. NETWORK / WIFI ═══'
V=$(settings get global tcp_default_init_rwnd);                    echo "  tcp_init_rwnd             = $V"
V=$(settings get global wifi_sleep_policy);                        echo "  wifi_sleep_policy         = $V"
V=$(settings get global wifi_scan_always_enabled);                 echo "  wifi_scan_always          = $V"
V=$(settings get global wifi_suspend_optimizations_enabled);       echo "  wifi_suspend_opt          = $V"
V=$(settings get global wifi_networks_available_notification_on);  echo "  wifi_notif                = $V"
V=$(settings get global wifi_watchdog_poor_network_test_enabled);  echo "  wifi_watchdog             = $V"
V=$(settings get global network_scoring_ui_enabled);               echo "  network_scoring           = $V"
echo ''
echo '═══ 10. DNS ═══'
V=$(settings get global private_dns_mode);       echo "  private_dns_mode          = $V"
V=$(settings get global private_dns_specifier);  echo "  private_dns_specifier     = $V"
echo ''
echo '═══ 11. BLOAT CONTROL ═══'
V=$(settings get global package_verifier_enable); echo "  package_verifier          = $V"
V=$(settings get global netstats_enabled);        echo "  netstats_enabled          = $V"
echo ''
echo '══════════════════════════════════════════════════════════'
echo '  TOTAL: 55 settings monitoreados cada 15 segundos'
echo '══════════════════════════════════════════════════════════'
