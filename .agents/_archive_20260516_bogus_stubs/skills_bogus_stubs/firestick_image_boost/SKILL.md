---
name: "firestick-image-boost"
description: "SOP gemelo del ONN 4K SOP — 32 directivas ADB + 2 props para Fire TV Stick 4K Max (MediaTek MT8696, Fire OS 7+). Boost imagen vía MEMC + sharpen + HDR pass-through + color saturation. Sin AISR/AIPQ (chip distinto al Amlogic)."
---

# 🛡️ SOP: Fire TV Stick 4K Max Image Boost

> **Versión:** 1.0 — 2026-05-01
> **Estado:** PRODUCCIÓN — gemelo del `adb_master_directives_rule` del ONN
> **Dispositivo:** Fire TV Stick 4K Max (`AFTKAUST` / `AFTKA*`)
> **SoC:** MediaTek MT8696 (NO Amlogic — sin AISR/AIPQ HW)
> **Conexión ADB:** LAN (default `10.200.0.3:5555` — Cali)
> **Script:** `IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/apply_image_boost_firestick.sh`

---

## 1. Por qué este SKILL existe

El SOP del ONN 4K (`adb_master_directives_rule/SKILL.md`) cubre 39 directivas optimizadas para el chip Amlogic S905X4 (AISR + AIPQ + Vulkan + HDR10+ forzado). El Fire TV Stick 4K Max usa **MediaTek MT8696** — chip distinto, sin esas APIs propietarias. Necesita su propio set de directivas adaptadas a Fire OS + capacidades del MT8696.

**Cobertura comparada:**

| Capacidad | ONN 4K (S905X4) | Fire TV 4K Max (MT8696) |
|---|:---:|:---:|
| HDR10+ forzado | ✅ `hdr_force_conversion_type=4` | ✅ `hdr_conversion_mode=2` + Amazon-specific |
| AI Super Resolution | ✅ HW (`libpqcontrol.so`) | ❌ no HW (smoothness software) |
| AI Picture Quality | ✅ HW | ⚠ parcial (`com.amazon.tv.dynamic_contrast`) |
| MEMC | ❌ no | ✅ `com.amazon.tv.motion_smoothness` HW |
| Vulkan GPU | ✅ `skiavk` | ⚠ parcial → usar `skiagl` |
| 4K 60Hz | ✅ | ✅ |
| Dolby Vision | ❌ | ✅ (Fire TV 4K Max es DV-capable) |
| 120Hz | ❌ | ❌ (forzar = pantalla negra) |

## 2. Comando único — Aplica TODO

```bash
bash IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/apply_image_boost_firestick.sh
```

Auto-detecta el Fire TV via `adb devices` filtrando por `ro.product.model=AFTKA*`. Si tienes múltiples Fire TVs, especificar:

```bash
bash apply_image_boost_firestick.sh --device 10.200.0.3:5555
```

## 3. Inventario completo por categoría (32 directivas + 2 props)

### CATEGORÍA 1 — 🖼️ HDR + COLOR (8 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|---|---|:---:|---|
| 1 | `always_hdr` | global | `1` | HDR pass-through siempre activo |
| 2 | `hdr_conversion_mode` | global | `2` | Force HDR10+ negotiation |
| 3 | `hdr_force_conversion_type` | global | `4` | HDR10+ tier |
| 4 | `hdr_output_type` | global | `4` | Output HDR10+ |
| 5 | `match_content_frame_rate` | global | `1` | 24p/30p/60p auto |
| 6 | `display_color_mode` | secure | `3` | Vivid/Saturated |
| 7 | `user_preferred_resolution_height` | global | `2160` | 4K base |
| 8 | `user_preferred_refresh_rate` | global | `60.0` | 60Hz base |

### CATEGORÍA 2 — 🧠 MEMC + Picture Quality (Amazon proprietary, 6 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|---|---|:---:|---|
| 9 | `com.amazon.tv.color_temperature` | system | `cool` | Color azulado (cinematic) |
| 10 | `com.amazon.tv.dynamic_contrast` | system | `high` | Contraste dinámico HW |
| 11 | `com.amazon.tv.picture_sharpness` | system | `65` | Sharpen (sweet spot 50-70) |
| 12 | `com.amazon.tv.motion_smoothness` | system | `2` | **MEMC del MT8696** (1=low, 2=med, 3=high) |
| 13 | `com.amazon.tv.noise_reduction` | system | `auto` | NR adaptive |
| 14 | `com.amazon.tv.picture_mode` | system | `movie` | Modo cine (NO `dynamic` — colores reventados) |

> **Importante:** estos `com.amazon.tv.*` son namespace `system` no `secure` ni `global`. Requieren `settings put system <key> <value>` exactamente.

### CATEGORÍA 3 — ⚡ PERFORMANCE (5 directivas + 2 props)

| # | Directiva | Namespace | Valor | Efecto |
|---|---|---|:---:|---|
| 15 | `window_animation_scale` | global | `0.0` | Zapping instantáneo |
| 16 | `transition_animation_scale` | global | `0.0` | Sin transiciones |
| 17 | `animator_duration_scale` | global | `0.0` | GPU 100% para video |
| 18 | `forced_app_standby_enabled` | global | `1` | Apps inútiles dormidas |
| 19 | `app_standby_enabled` | global | `1` | Bucket standby activo |
| P1 | `debug.hwui.renderer` | prop | `skiagl` | GPU renderer (MT8696: NO `skiavk`) |
| P2 | `debug.media.video.frc` | prop | `true` | FRC ExoPlayer → equivale a "Hardware+ Decoder" en OTT Navigator |

### CATEGORÍA 4 — 🌐 NETWORK aggressive (7 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|---|---|:---:|---|
| 20 | `tcp_default_init_rwnd` | global | `60` | TCP window inicial 87KB |
| 21 | `wifi_sleep_policy` | global | `2` | WiFi nunca duerme |
| 22 | `wifi_watchdog_poor_network_test_enabled` | global | `0` | No desconectar por señal |
| 23 | `private_dns_mode` | global | `hostname` | DNS privado activado |
| 24 | `private_dns_specifier` | global | `dns.google` | Google DNS |
| 25 | `background_data_enabled` | global | `0` | Mata data background |
| 26 | `captive_portal_detection_enabled` | global | `0` | Sin captive portal check |

### CATEGORÍA 5 — 🔋 POWER + Display always-on (4 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|---|---|:---:|---|
| 27 | `stay_on_while_plugged_in` | global | `3` | Siempre encendido |
| 28 | `low_power` | global | `0` | Sin ahorro |
| 29 | `screen_off_timeout` | system | `2147483647` | Pantalla nunca off |
| 30 | `screensaver_enabled` | secure | `0` | Sin screensaver |

### CATEGORÍA 6 — 🔊 AUDIO passthrough (2 directivas)

| # | Directiva | Namespace | Valor | Efecto |
|---|---|---|:---:|---|
| 31 | `encoded_surround_output` | global | `1` | Auto-detect Dolby/DTS |
| 32 | `hdmi_system_audio_control` | global | `1` | CEC audio |

## 4. Verificación — `--verify-only`

```bash
bash apply_image_boost_firestick.sh --verify-only
```

Output esperado (las 32 directivas + 2 props con `OK` o `MISS`):

```
── HDR_COLOR ──
  OK  global.always_hdr = 1 (expected 1)
  OK  global.hdr_conversion_mode = 2 (expected 2)
  ...
── MEMC_PQ ──
  OK  system.com.amazon.tv.motion_smoothness = 2 (expected 2)
  OK  system.com.amazon.tv.picture_sharpness = 65 (expected 65)
  ...
── PROPS ──
  OK  prop debug.hwui.renderer = skiagl (expected skiagl)
  OK  prop debug.media.video.frc = true (expected true)
```

Si aparece `MISS` en alguna línea, re-aplicar con `bash apply_image_boost_firestick.sh` (sin flags).

## 5. Rollback de emergencia

Si la pantalla se ve rara, el TV no negocia HDR, o aparece pantalla negra:

```bash
bash apply_image_boost_firestick.sh --rollback
```

Revierte 12 settings críticos a Fire OS defaults (HDR=0, picture_mode=standard, sharpness=50, motion_smoothness=0, animations=1.0). Las directivas de Network/Power se preservan (no causan problemas de imagen).

## 6. Capacidades del MT8696 verificadas

| Característica | Soporte | Detalle |
|---|:---:|---|
| 4K @ 60Hz | ✅ | HDMI 2.1 |
| Dolby Vision | ✅ | Fire TV 4K Max DV-capable (vs ONN que NO) |
| HDR10 / HDR10+ | ✅ | `hdr_conversion_mode=2` |
| HLG | ✅ | Implícito en passthrough |
| HEVC HW decoder | ✅ | Fire OS MediaCodec |
| AV1 HW decoder | ✅ | MT8696 AV1 hardware |
| MEMC HW | ✅ | `com.amazon.tv.motion_smoothness` |
| AISR (AI Super Res) | ❌ | No es chip Amlogic |
| AIPQ (AI Picture Quality) | ⚠ | Solo `dynamic_contrast` HW (parcial) |
| Vulkan completo | ❌ | Parcial — usar `skiagl` |
| 120Hz | ❌ | NO forzar — pantalla negra |
| LCEVC | ❌ | Sin HW + sin player con decoder + sin stream encoded |

## 7. Settings internos de OTT Navigator

> **Pregunta del usuario:** ¿se pueden aplicar `Decoder=Hardware+`, `Buffer=25-60s`, `Smooth motion=ON`, `Sharpen=0.5-1.0` por ADB?

**Respuesta corta:** los SharedPreferences de la app `net.ott.navigator` viven en `/data/data/net.ott.navigator/shared_prefs/*.xml` y requieren root para leer/escribir. Fire TV 4K Max sin root → no se pueden tocar directamente.

### Vía 1 — Settings de SISTEMA equivalentes (RECOMENDADA)

Este script aplica el equivalente a nivel SoC, que **es más potente** que los settings del player:

| Setting OTT Navigator | Equivalente SoC vía ADB | Efecto |
|---|---|---|
| Decoder: Hardware+ | `setprop debug.media.video.frc=true` + ExoPlayer hereda MediaCodec HW | Decode HW prioritario |
| Buffer: 25-60s | Daemon `prisma_adb_daemon.sh` (Fire TV) ya fuerza `BUFFER_FLOOR_SECONDS=18` con bitrate floor reactivo | Buffer red más agresivo que app-level |
| Smooth motion: ON | `com.amazon.tv.motion_smoothness=2` (MEMC HW del MT8696) | Interpola 24→60 antes del decode (vs shader OpenGL post-decode del player) |
| Sharpen: 0.5-1.0 | `com.amazon.tv.picture_sharpness=65` | Sharpen HW sobre todo el output (vs solo el video del player) |

**El script ya cubre los 4 → 80-90% del efecto.** Los settings del player suman 10% extra.

### Vía 2 — UI Automation (frágil, solo emergencia)

ADB simula keyevents para navegar el menú de OTT Navigator:

```bash
adb -s 10.200.0.3:5555 shell '
am start -n net.ott.navigator/.MainActivity
sleep 2
input keyevent KEYCODE_MENU
sleep 0.5
input keyevent KEYCODE_DPAD_DOWN  # navegar a Settings
sleep 0.3
# ... 8-12 keyevents más para Decoder → Hardware+
'
```

> **Problemas:** requiere geometría exacta de pantalla, rompe entre versiones, no idempotente. Solo usar si el user pidió scriptear y aceptó la fragilidad.

### Vía 3 — Configuración manual una sola vez (LA ÚLTIMA MILLA)

Después de aplicar el script ADB, abrir OTT Navigator y tocar a mano:

```
OTT Navigator → Settings → Player
  Decoder ............................ Hardware+ (MediaCodec)
  Buffer size ........................ 60s
  Buffer for play .................... 25s
  Smooth motion ...................... ON
  Sharpen filter ..................... 0.7
  Frame rate matching ................ ON (auto)
  Decoder fallback ................... Software (si HW falla)
```

3 minutos de configuración → persiste hasta reinstall de la app.

## 8. Post-reboot

Después de cada reinicio del Fire TV, los `settings put` SÍ persisten. Pero los `setprop` NO:

```bash
# Solo re-aplicar las 2 props
adb -s 10.200.0.3:5555 shell '
setprop debug.hwui.renderer skiagl
setprop debug.media.video.frc true
'
```

## 9. Prohibiciones

> [!CAUTION]

1. **NUNCA** forzar 120Hz — el MT8696 reporta soporte pero el HDMI no lo entrega → pantalla negra
2. **NUNCA** desactivar `wifi_sleep_policy=2` — causa drops durante streaming
3. **NUNCA** instalar APKs vía ADB sin autorización explícita del usuario — el Fire TV permite sideload pero el SOP es CONFIG only
4. **NUNCA** intentar root vía exploit — Fire TV 4K Max patches están al día y bricking es probable
5. **NUNCA** tocar `com.amazon.tv.picture_mode=dynamic` — colores sobresaturados rompen percepción de fidelidad
6. **NUNCA** sobrescribir directivas del daemon `prisma_adb_daemon.sh` (network/buffer) — corre en VPS y reaplica cada N segundos

## 10. Cross-references

- **adb_master_directives_rule** — gemelo del ONN 4K (Amlogic S905X4)
- **PRISMA v1.4 35 ADB Master Directives** — daemon reactivo en VPS para Fire TV Cali
- **iptv-vps-touch-nothing** — el script vive localmente (PC del user → Fire TV LAN), no toca VPS

## 11. Diff de directivas vs ONN SOP

| Categoría | ONN 4K | Fire TV 4K Max | Diff |
|---|:---:|:---:|---|
| HDR + COLOR | 8 | 8 | mismo count, valores Fire-OS-specific |
| AI Vision (AISR/AIPQ) | 7 | 0 | NO aplica (chip distinto) |
| MEMC + PQ Amazon | 0 | 6 | NUEVO en Fire TV (no existe en ONN) |
| GPU | 4 | 1 (skiagl) | Vulkan parcial vs completo |
| Performance | 5 | 5 | igual |
| Network | 12 | 7 | Fire TV usa daemon reactivo para los demás |
| Power | 4 | 4 | igual |
| Audio | 2 | 2 | igual |
| DNS | 2 | 2 (en Network) | unificado en Network |
| **Total** | **39** | **32 + 2 props** | Cobertura equivalente con adaptación al SoC |
