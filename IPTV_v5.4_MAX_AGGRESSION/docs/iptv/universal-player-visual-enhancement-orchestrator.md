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
