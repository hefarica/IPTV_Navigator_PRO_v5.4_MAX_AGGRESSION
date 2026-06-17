# F2 — Feed-forward mesh + F1.1 — DEPLOYED + TESTED (2026-06-15)

## F2 engine audit (workflow `f2-engine-audit`, 12 agentes paralelos)
**11 WIRE_NOW · 1 DEFER · 0 REJECT.** Todos los motores ociosos auditados son **decisores puros de metadata** (sin transcode), excepto `cmaf_orchestrator.php` (DEFER — STAGE 8 enruta a ffmpeg real, no viable en CPX21).

| Motor | Veredicto | Nota |
|---|---|---|
| ai_super_resolution_engine | WIRE_NOW | ya cableado en `resilience_integration_shim.php:665`; ⚠ caché `/tmp` global = cross-talk; emite fake-HDR headers (solo como hints, no STREAM-INF) |
| hdr10plus_dynamic_engine | WIRE_NOW | `getDirectives(streamInfo,health,contentType)` → 16 directivas. ⚠ emite HDR aun en SDR (mantener como hint) |
| lcevc_phase4_injector | WIRE_NOW | `getDirectives(streamInfo,health,contentType)` → 11 directivas |
| lcevc_state_engine / player_detector | WIRE_NOW | estado/deteccion LCEVC |
| neuro_buffer_controller | WIRE_NOW | API 2 pasos: `calculateAggression(ch,bufferPct,net)`→profile→`buildApeTags/buildVlcOpts` → 5 tags |
| modem_priority_manager | WIRE_NOW | red/transporte |
| kodiprop_enhancer / vlcopt_enhancer | WIRE_NOW | enriquecen config player |
| codecs_reorder | WIRE_NOW | reordena CODECS por familia |
| lab_tier_qoe_aggregator | WIRE_NOW | QoE feedback P0-P5 |
| **cmaf_orchestrator** | **DEFER** | **asume transcode ffmpeg** |

**Hallazgo:** el orquestador `visual_supremacy_orchestrator.php` (webroot) está **ROTO** (requiere módulos en `__DIR__` pero viven en `cmaf_engine/modules/`; además llama `NeuroBufferController::getDirectives()` que **no existe**). No se reutilizó; se construyó un router nuevo que requiere los motores directo.

## Artefactos construidos (repo + VPS, aditivos, sin tocar nginx/URL-1)
- **F1.0** `list_registry.php` (+self-heal count desde .gz) · `register_lists_scan.php` · `list-activate.php` → tabla `registered_lists` en `ape_lists.db`. **26 listas matriculadas** (gz=22595 canales).
- **F1.1a** hook en `/var/www/html/upload.php` (matrícula al subir; try/catch; backup `/root/ape-deploy-rollback/20260615T235557Z/`).
- **F2** `ape-feedforward.php` = gate matrícula (F1.1b) + fan-out malla → **30 presets** (NeuroBuffer 5 + LCEVC 11 + HDR10Plus 16).

## Pruebas reales (vía dominio público)
- Lista registrada → `activated:true` + 30 presets (LCEVC 4K upscale, EXTVLCOPT zscale→st2084/bt2020 SDR→HDR, nlmeans denoise, unsharp, KODIPROP). Player-blind, **fuera de STREAM-INF**.
- Lista no registrada / sin params → `passthrough` (no activa, no procesa).
- `php -l` limpio en todos. Per-sesión, sin estado global.

## Honesto — qué falta
- **F1.1b auto-trigger:** el endpoint activa cuando se le llama por URL-2; el **trigger automático al reproducir** (generador embebe la llamada + nginx `/lists` log-hook o daemon) es **pendiente** (F1.1b-gen + F4).
- **No es "imagen procesada ≤1s"**: F2 emite presets; aplicarlos en imagen = F4 (daemon on-device). F3 = streaming SSE.
- Caveats a respetar al ampliar la malla: AI-SR caché global (pasar device explícito), nunca fake-HDR/4K en STREAM-INF.
