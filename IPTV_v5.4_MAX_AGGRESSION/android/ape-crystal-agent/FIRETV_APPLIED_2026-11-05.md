# Fire TV 4K Max (AFTKRT / karat) — paquete de imagen aplicado por ADB

**Fecha:** 2026-11-05 · **IP:** 192.168.10.32:5555 · **PC:** 192.168.10.31
**Device real:** `ro.product.model=AFTKRT`, `ro.build.version.release=11` (SDK 30),
`ro.board.platform=mt8696` → **MediaTek MT8696**.
⚠️ El APK reporta `soc=amlogic / soc_raw=AMLS905Y4`, que **no** coincide con el
hardware real (`mt8696`). Corregir `DeviceSampler.canonicalSoc()` para usar
`ro.board.platform` (y `Build.HARDWARE`) antes de `Build.SOC_MODEL`.

## Panel (medido con `dumpsys display`)

- Modo activo: **`modeId 6` = 3840x2160 @ 60.000004 Hz** (panel 4K60 real).
- Modos 4K disponibles: 59.94, 50, 60, 30, 29.97, 25, 24, 23.976.
- HDR: `mSupportedHdrTypes=[2, 3, 4]` (HDR10 / HLG / DV), `mMaxLuminance=500`.
- `wm size`: Physical 3840x2160 · **Override 1920x1080** (UI lógica de Fire OS).
  Fire OS **reafirma** ese override: `wm size 3840x2160`, `wm size reset` y
  `settings put global display_size_forced` no lo cambian. **No se fuerza**: el
  vídeo se decodifica/emite en 4K igualmente porque el panel está en modo 4K60.

## Aplicado y verificado por lectura (24/25 + 2 props)

| ns | clave | valor | leído |
|---|---|---|---|
| global | always_hdr | 1 | 1 |
| global | hdr_conversion_mode | 2 | 2 |
| global | hdr_force_conversion_type | 4 | 4 |
| global | hdr_output_type | 4 | 4 |
| global | match_content_frame_rate | 1 | 1 |
| secure | display_color_mode | 3 | 3 |
| global | user_preferred_resolution_height | 2160 | 2160 |
| global | user_preferred_refresh_rate | 60.0 | 60.0 |
| system | com.amazon.tv.color_temperature | cool | cool |
| system | com.amazon.tv.dynamic_contrast | high | high |
| system | com.amazon.tv.picture_sharpness | 65 | 65 |
| system | com.amazon.tv.motion_smoothness | 2 (MEMC) | 2 |
| system | com.amazon.tv.noise_reduction | auto | auto |
| system | com.amazon.tv.picture_mode | movie | movie |
| global | window/transition/animator_scale | 0.0 | 0.0 |
| global | forced_app_standby_enabled / app_standby_enabled | 1 | 1 |
| global | stay_on_while_plugged_in / low_power | 3 / 0 | 3 / 0 |
| system | screen_off_timeout | 2147483647 | ok |
| secure | screensaver_enabled | 0 | 0 |
| global | hdmi_system_audio_control | 1 | 1 |
| global | encoded_surround_output | 1 | **0 (el device rechaza 1)** |
| prop | debug.hwui.renderer | skiagl | skiagl |
| prop | debug.media.video.frc | true | true |

**No aplicable aquí:** AISR/AIPQ del ONN (Amlogic S905X4) — este device es MT8696.
Las props **no persisten tras reboot** (reasignar con `setprop`).

## Permiso del APK

`adb shell pm grant com.ape.crystalagent android.permission.WRITE_SECURE_SETTINGS`
→ antes: `SKIPPED_DENIED ... (sin WRITE_SECURE_SETTINGS)`.
Después: `ApeSettingsApplier: device_settings aplicados=13/14 rechazados=0`
por ciclo SSE. El APK mantiene `match_content_frame_rate=1`,
`minimal_post_processing_allowed=0`, `user_preferred_resolution_height=2160`.

## Rollback

```bash
adb -s 192.168.10.32:5555 shell '
settings put global always_hdr 0
settings put global hdr_conversion_mode 1
settings put global hdr_force_conversion_type -1
settings put global hdr_output_type 0
settings put secure display_color_mode 0
settings put system com.amazon.tv.motion_smoothness 0
settings put system com.amazon.tv.picture_sharpness 50
settings put system com.amazon.tv.picture_mode standard
settings put system com.amazon.tv.color_temperature standard
settings put system com.amazon.tv.dynamic_contrast medium
settings put system com.amazon.tv.noise_reduction off
settings put global window_animation_scale 1.0
settings put global transition_animation_scale 1.0
settings put global animator_duration_scale 1.0
setprop debug.hwui.renderer ""
setprop debug.media.video.frc ""'
```

## Prohibiciones respetadas

- **DNS intacto**: `private_dns_mode=opportunistic`, `private_dns_specifier=dns.google`
  (no se tocaron; SOP anti-scope-creep).
- **WiFi intacto** (`wifi_sleep_policy`, watchdog, background data sin tocar).
- Sin root, sin reboot, sin instalar nada desde ADB.
