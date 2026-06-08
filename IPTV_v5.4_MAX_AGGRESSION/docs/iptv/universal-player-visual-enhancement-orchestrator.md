# Universal Player Visual-Enhancement Orchestrator

Orquestador que mejora la imagen/continuidad en **cualquier player** usando el mejor plano de
control disponible por plataforma — **con verdad técnica, sin mentir ni forzar APIs inexistentes**.

## Matriz de capacidad (qué se puede / qué NO)

| Plataforma | Control plane | settings sistema | sentinel | MEMC | Vía de mejora |
|---|---|---|---|---|---|
| **Android TV / Google TV / ONN / box** | ADB | ✅ | ✅ | ✅ si SoC soporta | ADB settings/setprop/intents + AIPQ/AISR/MEMC |
| **Fire TV / Fire Stick** | ADB (Fire-safe) | ✅ | ✅ | best-effort si soporte real | ADB; NO toca servicios Amazon, NO mata launcher/Prime/DRM |
| **Roku** | ECP / network | ❌ | ❌ | ❌ | ECP discovery + selección de variante/codec + ABR conservador server-side |
| **Apple TV / tvOS** | MDM / app_config / network | ❌ | ❌ | ❌ | HLS profile correcto + HEVC/HDR solo si probado (no fake) + frame/range matching recomendado |
| **Web / SmartTV / HLS.js / unknown** | manifest / network | ❌ | ❌ | ❌ | codec ladder HEVC-first + ABR + frame pacing server-side |

**Regla madre:** polimórfico **por capacidad real**, no por fantasía. `fake_capabilities=NO`,
`memc_forced_on_unsupported_devices=NO`.

## Arquitectura por adapters (contrato común)
`vps/prisma/players/adapters/` — cada adapter expone:
`detect_platform · detect_capabilities · can_install_sentinel · can_apply_system_settings ·
can_apply_memc · can_apply_player_hints · apply_visual_profile · apply_antibuffer_profile ·
verify_profile · rollback_profile`.

- `android_adb.sh` — Android TV (delega al `generic_player.sh` polimórfico idempotente).
- `firetv_adb.sh` — hereda android + Fire-safe.
- `roku_ecp.sh` — ECP/network, reporta `system_settings=NOT_SUPPORTED`, `memc=NOT_SUPPORTED`.
- `appletv_profile.sh` — MDM/app_config/network, sin ADB, sin MEMC, sin fake HDR.
- `manifest_only.sh` — solo perfil de lista/stream (web/unknown).
- `generic_network.sh` — fallback network-safe (health/ping + hints).

## Detector universal
`vps/sentinel/lib/detect_universal_player.sh`: intenta **ADB** → si no, **Roku ECP** (`:8060/query/device-info`)
→ si no, **Apple TV** (mDNS `_airplay` / `:7000/info`) → si nada, **unknown/manual**. Exporta
`PLATFORM_FAMILY` + `CONTROL_PLANE`. Graceful: nunca falla.

## Orquestador
`vps/prisma/players/ape-universal-player-orchestrator.sh`: enumera devices (adb + `ape_devices.db` +
IPs conocidas) → detecta plataforma → carga adapter → aplica SOLO lo soportado → reporta
`applied|skipped|not_supported|failed|manual_required`. Un device que no soporta algo **no rompe el loop**.

## Capabilities (salida por device)
JSON con `platform_family · control_plane · soc_family · player · can_apply_system_settings ·
can_apply_memc · can_install_sentinel · can_apply_manifest_hints · can_apply_stream_profile ·
risk_level · enh_version`. Lo que no se puede → `false` / `NOT_SUPPORTED` (honesto).

## Anti-buffer (todas las plataformas, vía distinta)
- Android/Fire: whitelist anti-doze + sentinel + watchdog + QoE/throughput.
- Roku/Apple/Web: ladder seguro + codec compatible + ABR conservador + evitar fake-4K que cause rebuffer.

## Verdad sobre MEMC y HDR
- MEMC: Android (Amlogic/MTK/Realtek/Rockchip) best-effort; Fire solo si soporte real; Roku/Apple/Web = `NOT_SUPPORTED`.
- HDR: solo si probado; **nunca fake HDR**, nunca PQ sobre SDR.

## NO toca
nginx · URLs · túneles · SHIELDED · proveedor. Android/Fire vía ADB al device; resto vía network/manifest server-side.

## ADB Playback Telemetry Plane

ADB NO es solo control de hardware/settings: también **observa cómo el player reproduce de verdad**
y retroalimenta al VPS para que el stream se adapte. Dos planos cuya UNIÓN decide el perfil:

```
Device Capability Plane (hardware/SoC/MEMC/AIPQ/AISR/settings)
        +
Player Playback Plane (codec real, decoder, resolución, FPS, buffer, dropped, judder, errores)
        → playback_profile_decider → perfil de stream que el VPS entrega
```

### Cómo detecta (best-effort, read-only, timeout-safe — `collect_player_telemetry.sh`)
- **Foreground player**: `dumpsys window` (mCurrentFocus/mFocusedApp) + `dumpsys activity activities`.
- **Codec/decoder real**: `dumpsys media.codec` / `media.metrics` → `video/hevc|avc|av01|vp9|mpeg2`,
  decoder `OMX.*`/`c2.*`; `OMX.google.*`/`c2.android.*` = software, vendor = hardware.
- **Resolución/FPS**: `dumpsys SurfaceFlinger` / `dumpsys display` (refresh/active mode).
- **HDR**: `dumpsys display` (DOLBY_VISION/HDR10/ST2084/HLG) — solo si visible.
- **Buffer/dropped/judder/errores**: `logcat -d -t 300` (acotado, NUNCA infinito) → rebuffer,
  `dropped frames`, judder/frame-pacing, último error.
- **confidence** 0.0–1.0 según cuántas fuentes respondieron.

### Cómo decide (`playback_profile_decider.sh`)
- HW HEVC + buffer OK + foreground → `CRYSTAL_UHD_SAFE`.
- HEVC en software-decode o rebuffer → `STABLE_1080P_PREMIUM` (H264 1080p).
- dropped > umbral → downgrade + MEMC off. Judder → `memc_policy=avoid_due_to_judder`, sin 60fps fake.
- HDR no probado → `disable_fake_hdr`. Codec desconocido → `TRUTHFUL_SOURCE_SAFE`. Player no-foreground → sin cambios agresivos.

### Qué NO garantiza (verdad técnica)
- Solo Android/Fire tienen telemetry ADB. **Roku/Apple/Web NO** → `codec_active=unknown`, decisión por
  capabilities declaradas + QoE server-side (no se inventan datos del player).
- `dumpsys`/`logcat` son best-effort: si una fuente no responde → `unknown` (no se miente), confidence baja.
- Nunca fake codec/HDR/fps. MEMC solo donde el SoC lo soporta y nunca si hay judder.

### Reporte al VPS
`report_to_vps` POSTea a `device-register.php` (extendido backward-compat con `playback_profile_json`):
codec/decoder/res/fps/buffer/dropped/judder + `recommended_profile/codec/resolution/memc_policy/hdr_policy`.
Test read-only: `vps/prisma/players/tests/test_playback_decider.sh` (15 aserciones, 8 casos).

## 4K Crystal UHD Visual Upscaler Without VPS Reprocessing

**El VPS NO transcodifica ni reprocesa video.** Es el **cerebro de decisión**; el device/player/TV
son el **motor de mejora visual**. Cualquier `.m3u8` → perfil personalizado por device → imagen
"Crystal UHD safe" → cero buffer/judder → **cero falsas promesas**.

### 4 planos coordinados
1. **Device Capability** — SoC/HW decode/MEMC/AISR (`detect_capabilities.sh`).
2. **Player Playback** — codec/decoder/res/fps/buffer/dropped/judder reales (`collect_player_telemetry.sh`).
3. **Network/Stream** — variantes del master playlist, sin descargar video (`m3u8_variant_analyzer.sh`).
4. **TV/Display** — resolución máx, refresh, HDR, upscaler/MEMC/SR (`tv_capability_probe.sh`).

### Decisión (`visual_payload_decider.sh`) — perfiles y gates
- **CRYSTAL_UHD_EXTREME**: fuente 4K real + HW decode + buffer OK + 0 dropped + sin judder + red alta + TV≥2160.
- **CRYSTAL_UHD_SAFE**: HEVC/AV1 HW decode estable.
- **PERCEPTUAL_4K_BALANCED**: fuente HD/FHD + upscaler/SR del TV + estable (upscale del dispositivo, no fake).
- **STABLE_1080P_PREMIUM**: 4K causa rebuffer / HEVC sw-decode / dropped altos / buffer bajo.
- **LOW_LATENCY_SAFE**: zapping frecuente / provider inestable / red baja.
- **TRUTHFUL_SOURCE_SAFE**: codec/capabilities/manifest desconocidos / player no-foreground / telemetría incompleta.
Salida: `selected_variant` (best_visual/anti_rebuffer/safest), `preferred_codec/resolution`, `fps_policy`,
`hdr_policy`, `memc_policy`, `super_resolution_policy`, `color_policy`, `sharpness_policy`, `anti_rebuffer_policy`.

### Aplicación (`visual_payload_apply.sh`)
- **Android/Fire (ADB)**: universal + SoC + MEMC/AISR/HDR/FPS **policy-driven** (idempotente, reusa
  helpers de `generic_player.sh`). MEMC se apaga si `avoid_due_to_judder`/`disable`.
- **Roku/AppleTV/web**: solo manifest/stream/app hints — **NO device write** (reporta `NOT_SUPPORTED`).

### Feedback loop (`qoe_feedback_loop.sh`)
`telemetry → decision → apply → RE-OBSERVE → adjust`: rebuffer/dropped → baja perfil; judder → MEMC off;
estable N ciclos → sube un nivel; source pobre → se queda en truthful.

### Cómo se evita mentir / romper
- **No fake 4K**: si el manifest no tiene 4K (`MV_HAS_4K=false` / `MV_STATUS=FAILED`) → no se declara 4K.
- **No fake HDR**: HDR solo si fuente + player/TV lo prueban; si no → `disable_fake_hdr`.
- **No fake codec**: codec desconocido → `source`/TRUTHFUL.
- **No judder**: MEMC nunca se fuerza con judder; `memc_policy=avoid_due_to_judder`.
- **Anti-buffer**: si sube dropped/rebuffer tras aplicar → baja perfil/variant (anti_rebuffer).
- **SHIELDED/autopista intactos**: nunca se altera la URL interna del canal ni se duplican/eliminan canales;
  solo se **selecciona** la mejor variante existente del `.m3u8` y se sugiere perfil.

### Rollback
Borrar `persist.ape.visual.profile` + `persist.ape.enh.version` en el device; el siguiente ciclo recalcula.
Roku/Apple/web no reciben cambios de sistema → rollback = noop.

### Límites reales por plataforma
Android/Fire = control completo por ADB. Roku = ECP/manifest (sin settings/MEMC). Apple TV =
app_config/MDM/manifest (sin ADB/MEMC). Web = HLS.js/ABR/manifest. Unknown = truthful source-safe.

Tests read-only: `test_visual_payload_decider.sh` (14 aserciones, 10 casos incl. Roku non-ADB).
