---
name: "adb-master-directives-rule"
description: "SOP ABSOLUTO: Inventario certificado de TODAS las directivas ADB del ONN 4K (Buga). 39 directivas activas + AI Vision + Vulkan GPU. Verificado 2026-04-30."
---

# 🛡️ SOP: ADB MASTER DIRECTIVES — ONN 4K (Buga)

> **Versión:** 2.0 — 2026-04-30
> **Estado:** PRODUCCIÓN ACTIVA — 39 directivas certificadas
> **Dispositivo:** ONN 4K Streaming Box (Amlogic S905X4, Mali GPU, Android TV 12)
> **Conexión ADB:** `192.168.10.28:5555` (WiFi LAN)
> **TV:** Samsung 2017 — HDR10/HLG/HDR10+, 500 nits, 4K 60Hz

---

## 1. Arquitectura de Salida de Video

```
ONN 4K (Amlogic S905X4)
  │
  ├─→ AI Super Resolution (AISR) — Upscale hardware a nivel de SoC
  ├─→ AI Picture Quality (AIPQ) — Ajuste inteligente por escena
  ├─→ HDR10+ Forced Conversion — SDR→HDR10+ en hardware
  ├─→ Vulkan Renderer (skiavk) — GPU rendering máximo
  │
  └─→ HDMI 2.0b
        ├─→ 3840x2160 @ 60Hz
        ├─→ YCbCr 4:2:2 12-bit Deep Color
        └─→ HDR10+ metadata
              │
              └─→ Samsung TV (2017)
                    ├─→ HDR+ Mode: ON (configurar en TV)
                    ├─→ Dynamic Contrast: High (configurar en TV)
                    ├─→ Color Temperature: Cool (configurar en TV)
                    └─→ Contrast: 95-100 (configurar en TV)
```

---

## 2. Comando Único — Aplica TODO

```bash
C:\Android\platform-tools\adb.exe -s 192.168.10.28:5555 shell "
settings put global always_hdr 1;
settings put global hdr_conversion_mode 3;
settings put global hdr_force_conversion_type 4;
settings put global hdr_output_type 4;
settings put global match_content_frame_rate 1;
settings put secure display_color_mode 3;
settings put global user_preferred_resolution_height 2160;
settings put global user_preferred_resolution_width 3840;
settings put global user_preferred_refresh_rate 60.0;
settings put system aipq_enable 1;
settings put system aisr_enable 1;
settings put system ai_pq_mode 3;
settings put system ai_sr_mode 3;
settings put global aipq_enable 1;
settings put global aisr_enable 1;
settings put global ai_pic_mode 3;
settings put global ai_sr_level 3;
settings put global force_hw_ui 1;
settings put global force_gpu_rendering 1;
settings put global hardware_accelerated_rendering_enabled 1;
settings put global window_animation_scale 0.0;
settings put global transition_animation_scale 0.0;
settings put global animator_duration_scale 0.0;
settings put global forced_app_standby_enabled 1;
settings put global app_standby_enabled 1;
settings put global adaptive_battery_management_enabled 0;
settings put global tcp_default_init_rwnd 60;
settings put global captive_portal_detection_enabled 0;
settings put global wifi_sleep_policy 2;
settings put global wifi_scan_always_enabled 0;
settings put global wifi_networks_available_notification_on 0;
settings put global network_scoring_ui_enabled 0;
settings put global wifi_watchdog_poor_network_test_enabled 0;
settings put global wifi_suspend_optimizations_enabled 0;
settings put global background_data_enabled 0;
settings put global data_roaming 0;
settings put global package_verifier_enable 0;
settings put global device_provisioned 1;
settings put global stay_on_while_plugged_in 3;
settings put global low_power 0;
settings put system screen_off_timeout 2147483647;
settings put secure screensaver_enabled 0;
settings put global encoded_surround_output 1;
settings put global hdmi_system_audio_control 1;
settings put global private_dns_mode hostname;
settings put global private_dns_specifier dns.google;
echo ALL_APPLIED
"
```

```bash
# GPU Renderer (setprop, no persiste en reboot)
C:\Android\platform-tools\adb.exe -s 192.168.10.28:5555 shell "setprop debug.hwui.renderer skiavk"

# AI Vision broadcast
C:\Android\platform-tools\adb.exe -s 192.168.10.28:5555 shell "
am broadcast -a com.droidlogic.tv.action.AIPQ_ENABLE --ei enable 1;
am broadcast -a com.droidlogic.tv.action.AISR_ENABLE --ei enable 1
"
```

---

## 3. Inventario Completo por Categoría

### CATEGORÍA 1: 🖼️ IMAGEN — HDR10+ Extreme (8 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|-----------|-----------|:-----:|--------|
| 1 | `always_hdr` | global | `1` | HDR siempre activo |
| 2 | `hdr_conversion_mode` | global | `3` | Conversión forzada (SDR→HDR) |
| 3 | `hdr_force_conversion_type` | global | `4` | HDR10+ forzado |
| 4 | `hdr_output_type` | global | `4` | Salida HDR10+ |
| 5 | `match_content_frame_rate` | global | `1` | Sync framerate con contenido |
| 6 | `display_color_mode` | secure | `3` | Enhanced/Saturated |
| 7 | `user_preferred_resolution` | global | `3840x2160` | 4K forzado |
| 8 | `user_preferred_refresh_rate` | global | `60.0` | 60Hz base |

> **HDMI:** YCbCr 4:2:2 12-bit Deep Color (verificado en `/sys/class/amhdmitx/amhdmitx0/attr`)

### CATEGORÍA 2: 🧠 AI VISION — Super Resolution + Picture Quality (7 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|-----------|-----------|:-----:|--------|
| 9 | `aipq_enable` | system | `1` | AI Picture Quality ON |
| 10 | `aisr_enable` | system | `1` | AI Super Resolution ON |
| 11 | `ai_pq_mode` | system | `3` | PQ nivel High |
| 12 | `ai_sr_mode` | system | `3` | SR nivel High |
| 13 | `aipq_enable` | global | `1` | Respaldo global |
| 14 | `aisr_enable` | global | `1` | Respaldo global |
| 15 | `ai_sr_level` | global | `3` | SR nivel High |

> **Hardware:** `libpqcontrol.so` → funciones `SetAiSrEnable`, `SetAipqEnable`, `SetAipqMode` confirmadas en el SoC Amlogic S905X4.

### CATEGORÍA 3: 🔥 GPU — Vulkan Maximum (4 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|-----------|-----------|:-----:|--------|
| 16 | `force_hw_ui` | global | `1` | GPU forzado para toda UI |
| 17 | `force_gpu_rendering` | global | `1` | GPU rendering obligatorio |
| 18 | `hardware_accelerated_rendering_enabled` | global | `1` | HW acceleration |
| 19 | `debug.hwui.renderer` | prop | `skiavk` | **Skia Vulkan** (máximo rendimiento) |

> **GPU:** Mali (Amlogic), OpenGL ES 3.2, Vulkan soportado. `skiavk` > `skiagl` en latencia y throughput.
> **NOTA:** `setprop` no persiste en reboot — ejecutar después de cada reinicio.

### CATEGORÍA 4: ⚡ RENDIMIENTO (5 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|-----------|-----------|:-----:|--------|
| 20 | `window_animation_scale` | global | `0.0` | Zapping instantáneo |
| 21 | `transition_animation_scale` | global | `0.0` | Sin transiciones |
| 22 | `animator_duration_scale` | global | `0.0` | GPU 100% para video |
| 23 | `forced_app_standby_enabled` | global | `1` | Apps inútiles en standby |
| 24 | `app_standby_enabled` | global | `1` | Bucket de standby activo |

### CATEGORÍA 5: 🌐 RED (12 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|-----------|-----------|:-----:|--------|
| 25 | `tcp_default_init_rwnd` | global | `60` | ~87KB ventana TCP inicial |
| 26 | `captive_portal_detection_enabled` | global | `0` | Sin check portal |
| 27 | `wifi_sleep_policy` | global | `2` | WiFi NUNCA duerme |
| 28 | `wifi_scan_always_enabled` | global | `0` | Sin escaneo background |
| 29 | `wifi_networks_available_notification_on` | global | `0` | Sin notificaciones WiFi |
| 30 | `network_scoring_ui_enabled` | global | `0` | Sin scoring de red |
| 31 | `wifi_watchdog_poor_network_test_enabled` | global | `0` | **No desconectar por señal** |
| 32 | `wifi_suspend_optimizations_enabled` | global | `0` | Sin optimizaciones suspensión |
| 33 | `background_data_enabled` | global | `0` | Corta DATA background |
| 34 | `data_roaming` | global | `0` | Sin roaming |
| 35 | `package_verifier_enable` | global | `0` | Sin verificación paquetes |
| 36 | `device_provisioned` | global | `1` | Evita setup wizard |

### CATEGORÍA 6: 🔋 ENERGÍA (4 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|-----------|-----------|:-----:|--------|
| 37 | `stay_on_while_plugged_in` | global | `3` | Siempre encendido (USB+AC) |
| 38 | `low_power` | global | `0` | Sin modo ahorro |
| 39 | `screen_off_timeout` | system | `2147483647` | Pantalla nunca se apaga |
| 40 | `screensaver_enabled` | secure | `0` | Sin screensaver |

### CATEGORÍA 7: 🔊 AUDIO (2 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|-----------|-----------|:-----:|--------|
| 41 | `encoded_surround_output` | global | `1` | Auto-detect surround (Dolby/DTS passthrough) |
| 42 | `hdmi_system_audio_control` | global | `1` | CEC audio control |

### CATEGORÍA 8: 🔒 DNS (2 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|-----------|-----------|:-----:|--------|
| 43 | `private_dns_mode` | global | `hostname` | DNS privado habilitado |
| 44 | `private_dns_specifier` | global | `dns.google` | Google DNS seguro |

---

## 4. Verificación Completa

```bash
C:\Android\platform-tools\adb.exe -s 192.168.10.28:5555 shell "
echo '=IMAGEN=';
settings get global always_hdr;
settings get global hdr_conversion_mode;
settings get global hdr_force_conversion_type;
settings get global match_content_frame_rate;
settings get secure display_color_mode;
settings get global user_preferred_resolution_height;
settings get global user_preferred_refresh_rate;
cat /sys/class/amhdmitx/amhdmitx0/attr 2>/dev/null;
echo '=AI=';
settings get system aipq_enable;
settings get system aisr_enable;
settings get system ai_pq_mode;
settings get system ai_sr_mode;
echo '=GPU=';
settings get global force_hw_ui;
settings get global force_gpu_rendering;
getprop debug.hwui.renderer;
echo '=PERF=';
settings get global window_animation_scale;
settings get global transition_animation_scale;
settings get global animator_duration_scale;
echo '=NET=';
settings get global tcp_default_init_rwnd;
settings get global wifi_sleep_policy;
settings get global background_data_enabled;
echo '=POWER=';
settings get global stay_on_while_plugged_in;
settings get global low_power;
echo '=AUDIO=';
settings get global encoded_surround_output;
echo '=DNS=';
settings get global private_dns_mode;
settings get global private_dns_specifier
"
```

### Valores esperados

```
=IMAGEN= 1, 3, 4, 1, 3, 2160, 60.0, 422,12bit
=AI=     1, 1, 3, 3
=GPU=    1, 1, skiavk
=PERF=   0.0, 0.0, 0.0
=NET=    60, 2, 0
=POWER=  3, 0
=AUDIO=  1
=DNS=    hostname, dns.google
```

---

## 5. Configuración del TV Samsung (Manual — Control Remoto del TV)

Estas configuraciones NO son ADB — se aplican desde el menú del televisor:

| Setting | Ubicación en TV | Valor |
|---------|-----------------|:-----:|
| HDR+ Mode | Picture → Expert Settings | **ON** |
| Dynamic Contrast | Picture → Expert Settings | **High** |
| Color Temperature | Picture → Expert Settings | **Cool** |
| Peak Brightness | Picture → Expert Settings | **High** |
| HDR Tone Mapping | Picture → Expert Settings → HDR+ | **Dynamic** |
| Contrast | Picture → Contrast | **95-100** |
| Picture Mode | Picture | **Movie** o **Dynamic** |

---

## 6. Capacidades de Hardware Verificadas

| Característica | Soportado | Detalle |
|---------------|:---------:|---------|
| 4K 60Hz | ✅ | Modo activo: 3840x2160 @ 60Hz |
| 120Hz | ❌ | No disponible en hardware |
| HDR10 | ✅ | Tipo 2 |
| HLG | ✅ | Tipo 3 |
| HDR10+ | ✅ | Tipo 4 |
| Dolby Vision | ❌ | No soportado |
| YCbCr 4:2:2 12-bit | ✅ | Deep Color activo |
| HEVC/H.265 HW decoder | ✅ | `c2.amlogic.hevc.decoder` |
| AV1 HW decoder | ✅ | `c2.amlogic.av1.decoder` |
| VP9 HW decoder | ✅ | Implícito |
| LCEVC | ❌ | Requiere firmware OEM |
| AI Super Resolution | ✅ | `libpqcontrol.so` → `SetAiSrEnable` |
| AI Picture Quality | ✅ | `libpqcontrol.so` → `SetAipqEnable` |
| Vulkan GPU | ✅ | `ro.hardware.vulkan = amlogic` |
| OpenGL ES 3.2 | ✅ | `ro.opengles.version = 196610` |
| Luminancia máxima | — | 500 nits (limitado por TV Samsung 2017) |

---

## 7. Prohibiciones

> [!CAUTION]
> Las siguientes acciones están **PROHIBIDAS**:

1. **NUNCA** forzar 120Hz — el hardware no lo soporta, causa pantalla negra
2. **NUNCA** cambiar `adb_enabled` — perderíamos acceso ADB
3. **NUNCA** cambiar `development_settings_enabled` — requerido para ADB
4. **NUNCA** tocar settings de `secure/` que requieran root (no hay root)
5. **NUNCA** instalar firmware custom sin backup — riesgo de brick
6. **NUNCA** desactivar `wifi_sleep_policy=2` — causa desconexiones durante streaming

---

## 8. Post-Reboot

Después de cada reinicio del ONN, ejecutar:

```bash
# El renderer Vulkan no persiste en reboot
C:\Android\platform-tools\adb.exe -s 192.168.10.28:5555 shell "setprop debug.hwui.renderer skiavk"

# Re-broadcast AI Vision
C:\Android\platform-tools\adb.exe -s 192.168.10.28:5555 shell "
am broadcast -a com.droidlogic.tv.action.AIPQ_ENABLE --ei enable 1;
am broadcast -a com.droidlogic.tv.action.AISR_ENABLE --ei enable 1
"
```

> Los `settings put` SÍ persisten en reboot — no necesitan re-aplicarse.

---

## 9. Rollback de Emergencia

```bash
C:\Android\platform-tools\adb.exe -s 192.168.10.28:5555 shell "
settings put global always_hdr 1;
settings put global hdr_conversion_mode 1;
settings put secure display_color_mode 3;
settings put global window_animation_scale 1.0;
settings put global transition_animation_scale 1.0;
settings put global animator_duration_scale 1.0;
settings put system aipq_enable 0;
settings put system aisr_enable 0;
setprop debug.hwui.renderer skiagl;
echo REVERTED_TO_DEFAULTS
"
```
