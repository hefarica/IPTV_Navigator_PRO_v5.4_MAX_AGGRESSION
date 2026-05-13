---
name: Claude — IPTV Navigator v5.4 Master Skills Index
description: "Índice maestro y mapa de navegación de las 671 skills en .agent/skills/. Categoriza por familia, identifica las críticas (Tier-1), las gold (Tier-2), y las que son ruido (placeholders vacíos, autostubs, generic SE). Guía a Claude Code hacia la skill correcta según el tipo de tarea sin tener que leer todas las 671."
---

# Claude — IPTV Navigator v5.4 Master Skills Index

> **Cuándo usar:** Cuando necesites encontrar la skill correcta para una tarea pero no sepas cuál de las 671 carpetas en `.agent/skills/` aplica. Esta skill es un mapa, no contenido — apunta a otras skills.

## 1. Tamaño y Calidad del Sistema

| Tipo | Cantidad | Valor |
|---|---|---|
| **Total skills** | 671 | — |
| **Empty placeholders (`super_skill_*`)** | 69 | ZERO — son carpetas con `SKILL.md` vacíos por bug de generación |
| **Autostub duplicates (`Skill_*`/`Expert_Skill_*`)** | 65 | LOW — frase genérica "Mi capacidad instalada para dominar X" |
| **Generic Software Engineering (`skill_xxx_*` sin nombre)** | 126 | MEDIUM — temas genéricos no-IPTV (Kubernetes, GraphQL, ZFS, etc.) |
| **Real IPTV/APE gold** | ~411 | HIGH/CRITICAL — esto es el material útil |
| **Mis skills custom (creadas para mí)** | 11 | CRITICAL — tier-1 propias |

**Conclusión:** Solo ~61% de las skills tienen valor real para el proyecto. Las otras ~260 son ruido que se puede ignorar (NO borrar — no me autorizaste y la regla `regla_suprema_no_borrado` lo prohíbe).

## 2. Familias Principales (Por Funcionalidad)

### 2.1 Reglas Maestras / Doctrinas (`.agent/rules/` + skills)
Estas son INVIOLABLES — leer al inicio de cualquier sesión:

| Skill / Rule | Cuándo aplica |
|---|---|
| `.agent/rules/omega_absolute_doctrine.md` | SIEMPRE — 5 disciplinas OMEGA |
| `.agent/rules/mandatory_skills_activation.md` | Antes de toda tarea — exige escanear skills |
| `.agent/rules/omega_iptv_ops.md` | Operaciones de soporte/mantenimiento |
| `.agent/rules/omega_orchestrator_mandatory.md` | Edits al generador o resolver — V17.2 SUPREMA |
| `.agent/rules/rule_zero_trust_iptv.md` | Cualquier código que toque inputs externos |
| `.agent/rules/ssot-resolve-unified.md` | Routing del resolver — `resolve_quality_unified.php` es el único |
| `.agent/rules/v5_multicanal_sacred_4_layers_rule.md` | 10 capas L0-L10 inmutables |
| `.agent/rules/iptv-ape-v4-full-builder.md` | 5 doctrinas + cadena de degradación 7 niveles |
| `regla_suprema_no_borrado/SKILL.md` | OMEGA-NO-DELETE — NUNCA eliminar líneas/directivas |
| `omega_absolute_dynamic_supremacy/SKILL.md` | 221 headers + jerarquía dinámica |
| `mandatory_full_skills_activation/SKILL.md` | MFSAP — usar TODAS las skills |
| `rule_100_percent_skill_activation/SKILL.md` | Cero excepción a usar todas las skills |
| `competitive_advantage_execution_protocol/SKILL.md` | Pragmatismo extremo, hacks comprobados |

### 2.2 Arquitectura OMEGA CRYSTAL V5 (796 líneas/canal)
Skills que definen la estructura sagrada:

| Skill | Para qué |
|---|---|
| `arquitectura_omega_v5_2_746_lineas/SKILL.md` | Desglose L0-L10 de las 796 líneas |
| `m3u8_120_120_perfection_invariant/SKILL.md` | Reglas anti-regresión 120/120 |
| `mapa_directivas_definitivo/SKILL.md` | Mapa atómico de las 10 capas |
| `omega_crystal_10_10_751_lines/SKILL.md` | Doctrina absoluta 796 líneas (supersede 735/746/751) |
| `iptv_omega_796_integrator/SKILL.md` | Cómo inyectar el bloque 796 al generador |
| `m3u8_typed_arrays_perfect_baseline_v10/SKILL.md` | Baseline mínimo 300+ tags + 51 inyecciones Cortex |
| `ape_v18_2_perfection_list_120_120/SKILL.md` | Invariantes de serialización para 120/120 |
| `cortex_omega_4bug_megafix/SKILL.md` | 4 bugs críticos del 90→120 |
| `santo_grial_arquitectura_ape/SKILL.md` | Biblia técnica completa 0-100% |

### 2.3 Edición Segura del Generador / Config
Skills que eviten regresiones al tocar Tier-S files:

| Skill | Para qué |
|---|---|
| `m3u8_typed_arrays_ultimate_safe_modify_protocol/SKILL.md` | Protocolo edit del generador 7,094 líneas |
| `ape_profiles_config_surgical_repair_v10/SKILL.md` | Reparar bug recurrente 504 |
| `iptv_navigator_v54_pre_edit_audit_checklist/SKILL.md` | 8 puntos pre-edit obligatorios |
| `iptv_navigator_v54_post_edit_validation_pipeline/SKILL.md` | Validación post-edit + rollback |
| `iptv_navigator_v54_backup_rollback_index/SKILL.md` | Mapa de `.bak_*` y rollback |
| `iptv_header_4layer_fallback_validator/SKILL.md` | Validador Beautiful Madness |
| `omega_absolute_v10_header_matrix_sync/SKILL.md` | Sync JSON v10 → DEFAULT_PROFILES |
| `iptv_omega_l11_l12_l13_integration_protocol/SKILL.md` | Integrar capas oro puro → 851 líneas |

### 2.4 Resolver Backend (`resolve_quality_unified.php`)
Skills críticas antes de tocar el resolver:

| Skill | Para qué |
|---|---|
| `resolve-architecture/SKILL.md` | Anatomía completa del pipeline + 8 reglas críticas + CTX v25 |
| `resolver_blindaje_total/SKILL.md` | Anti-Fatal-Error: file_exists + function_exists + class_exists guards |
| `resolver_stateless_arch/SKILL.md` | Resolver es stateless per-channel — todo viaja en URL |
| `ssot_resolve_quality_unified/SKILL.md` | Solo `resolve_quality_unified.php` activo, otros deprecated |
| `proxy_200ok_m3u8_parser_blindaje/SKILL.md` | Routing 200 OK / 302 Redirect del resolver |
| `skill_resolve_quality_302_redirect_shield/SKILL.md` | Redirect HTTP 302 para .ts/.mp4 |
| `nginx_if_is_evil_fix/SKILL.md` | Fix del bug `if(OPTIONS)` Nginx FastCGI |
| `php_zero_state_resilience/SKILL.md` | Anti DivisionByZero / colapsos PHP 500 |
| `diagnostico_forense_php_500/SKILL.md` | Debug PHP 500 cuando display_errors=0 |
| `binary_output_purity_v162/SKILL.md` | Pureza binaria proxies CMAF/DASH |

### 2.5 Generación / Pipeline M3U8
Cómo generar listas correctamente:

| Skill | Para qué |
|---|---|
| `generacion_lista_ape_typed_arrays_ultimate/SKILL.md` | Pipeline maestro de generación, 45+ módulos APE v9 |
| `generacion_m3u8_bulletproof_1_to_1/SKILL.md` | Strict 1:1 (1 EXTINF = 1 URL, no empty tags) |
| `pipeline_blindaje_m3u8/SKILL.md` | 9 contratos no negociables del pipeline |
| `cableado_dinamico_omni_inyeccion/SKILL.md` | UI ↔ M3U8 100% wired (40 toggles + 154 headers) |
| `boton_generador_typed_arrays_protocol/SKILL.md` | Botón generador strict bind |
| `protocolo_herencia_estricta/SKILL.md` | Paridad 1:1 frontend ↔ channels_map.json ↔ resolver |
| `directive_sync_flow/SKILL.md` | E2E sync flow obligatorio |
| `profile_sync_rule/SKILL.md` | Reglas mandatorias de generación |
| `m3u8-hls-manifest-supremo/SKILL.md` | Anatomía RFC 8216 |
| `m3u8_async_structure_python_audited/SKILL.md` | Orden estructural absoluto |
| `m3u8_restructuring_rules_engine/SKILL.md` | 68 reglas de reestructuración |
| `rfc8216_strict_parser_compliance/SKILL.md` | Anti "Loaded playlist has unexpected type" |
| `orquestacion_suprema_rfc8216_vlc_strict/SKILL.md` | 120+ cabeceras sin contradicciones |
| `protocolo_json_string_casting_exoplayer/SKILL.md` | Anti error parser InputStreamReader |

### 2.6 Auditoría Post-Generación
Cómo validar que la lista quedó bien:

| Skill | Para qué |
|---|---|
| `post_generation_audit_v10_4/SKILL.md` | Balanced Scorecard 16 reproductores |
| `balanced_scorecard_m3u8/SKILL.md` | 10 dimensiones, scoring, history (incluye script Node.js) |
| `auditoria_calidad_5_pilares/SKILL.md` | 5 pilares 2026 (Sintaxis, Salud, Calidad, UX, Seguridad) |
| `auditoria_conformidad_mpd_iso/SKILL.md` | Conformidad MPD ISO 23009-1 |
| `auditoria_forense_linea_por_linea/SKILL.md` | Auditoría forense JS/PHP/Bash línea por línea |
| `auditoria_forense_pipeline_m3u8/SKILL.md` | Auditoría completa del pipeline |
| `auditoria_sre_infraestructura_vps/SKILL.md` | SRE NGINX/PHP via curl/logs/HEAD |
| `auditoria_valores_hardcodeados/SKILL.md` | Cazar defaults estáticos |
| `auditoria_zero_touch_v3/SKILL.md` | Resolve V3.0 zero-touch verification |
| `playeo_simulado_stress_test/SKILL.md` | Stress test E2E simulando players |

### 2.7 Despliegue VPS Hetzner
Cómo desplegar al VPS sin romper nada:

| Skill | Para qué |
|---|---|
| `despliegue_quirurgico_vps/SKILL.md` | 7-step atomic deploy a `178.156.147.234` |
| `despliegue_atomico_payload/SKILL.md` | Despliegue por ZIP atómico |
| `despliegue_ape_v18x_workflow/SKILL.md` | Workflow parcheo iterativo v18.3-v18.6 |
| `ape_deployment_safety_guardrails/SKILL.md` | Pre/post deployment checks |
| `vps_upload_gateway/SKILL.md` | Upload gateway industrial rules |
| `gzip_static_streaming_500mb/SKILL.md` | Servir listas 500MB+ via gzip_static |
| `gzip_static_streaming_vps/SKILL.md` | Protocolo completo gzip pre-compress |
| `upload_gzip_placeholder_pipeline/SKILL.md` | Pipeline upload + placeholder trick |
| `upload_pipeline_vps/SKILL.md` | Pipeline subida completo |
| `convencion_nombres_listas_vps/SKILL.md` | Naming conventions VPS |
| `sop_subida_bulletproof_m3u8/SKILL.md` | SOP subida bulletproof |
| `sop_dns_duckdns_troubleshooting/SKILL.md` | Troubleshooting DNS DuckDNS |
| `sop_omega_absolute_v5_1/SKILL.md` y `_v5_2/SKILL.md` y `_v5_4/SKILL.md` | SOP de cada versión |
| `sop_ui_dev_to_prod_pipeline/SKILL.md` | Dev → Prod pipeline UI |

### 2.8 FFmpeg / Codec / HDR (70 skills `antigravity_quantum_ffmpeg_001-070`)
Mastery profundo de FFmpeg, codecs, HDR. Para cuando toques `ffmpeg` commands en el resolver o cmaf_worker. Las más útiles inmediatas:

| Skill | Para qué |
|---|---|
| `antigravity_quantum_ffmpeg_001_vvc_subpic_decoding` | VVC/H.266 sub-pictures paralelo |
| `antigravity_quantum_ffmpeg_005_libsvtav1_tune_vmaf` | AV1 con `--tune 2` VMAF |
| `antigravity_quantum_ffmpeg_007_cmaf_sdr_to_hdr10_dynamic_tonemap` | SDR→HDR dynamic tonemap |
| `antigravity_quantum_ffmpeg_021_minterpolate_optical_flow_120fps` | Interpolación 120fps (PROHIBIDO por doctrina, ver v5_multicanal rule) |
| `antigravity_quantum_ffmpeg_026_hw_nvdec_direct_vulkan_interop` | NVDEC Vulkan interop |
| `antigravity_quantum_ffmpeg_027_opencl_nlmeans_denoising_L2` | OpenCL NLMeans GPU |
| `antigravity_quantum_ffmpeg_034_hls_fmp4_init_preload_L4` | EXT-X-MAP preload anticipado |
| `antigravity_quantum_ffmpeg_041-050` | Subskills UVSE (User Visual Sports Engine) |
| `antigravity_quantum_ffmpeg_051-070` | Mirror del crystal_skill_51-70 (HTTP Guard, DSCP, Hydra, etc.) |

### 2.9 Crystal Skills (`crystal_skill_51-80`) — APE-Specific
Espejos de antigravity_quantum_ffmpeg_* enfocados en APE:

| Familia | Cobertura |
|---|---|
| `crystal_skill_51-60` | HTTP guard, Nginx FastCGI, DSCP, Hydra evasion, X-Forwarded-For, RAMDisk, HTTP Range, anti-509, Polymorphic freeze, TCP window scaling |
| `crystal_skill_61-70` | FrameRate Integrity, BWDIF, Yadif fallback, FPS CFR, Motion blur, GOP, VRR HDMI 2.1, Min Keyint, Vsync override, Telecine inverse |
| `crystal_skill_71-80` | Latency vs Quality, Stream Consistency, Segment Size, Visual Artifact Risk, SSIM, VMAF, Adaptive Bitrate, Bandwidth Efficiency, RealTime Bitrate, RealTime Quality Ranker |

### 2.10 Evasión de ISP / Stealth / Phantom
Skills para evadir bloqueos:

| Skill | Para qué |
|---|---|
| `iptv-isp-evasion-phantom-hydra/SKILL.md` | Phantom Hydra full guide |
| `iptv-polimorfismo-idempotencia/SKILL.md` | Polimorfismo + Idempotencia (DPI evasion + cache key estable) |
| `hydra_stream_evasion_engine/SKILL.md` | Mutación estocástica anti-bloqueo |
| `anti_407_stealth_fingerprint/SKILL.md` | Anti HTTP 407 zero proxy leakage |
| `anti_405_method_not_allowed_strict_get/SKILL.md` | Anti HTTP 405 |
| `anti_509_blind_resolution/SKILL.md` | Zero-Probe single-consumer enforcement |
| `cdn_throttling_evasion` (skill_*) | UA rotation + headers anárquicos |
| `rotacion_user_agents_dinamica/SKILL.md` | UA rotation database |
| `dscp_aggression_cascade/SKILL.md` | DSCP escalation cascade |
| `latencia_rayo_qos/SKILL.md` | QoS DSCP backend |
| `isp_strangulation_x2/SKILL.md` | Resolver pide doble del frontend |
| `vps_cors_proxy_bypass/SKILL.md` | Bypass HTTP 451 |

### 2.11 HDR / LCEVC / Visual Quality
Skills de calidad visual extrema:

| Skill | Para qué |
|---|---|
| `iptv-hdr-lcevc-pipeline/SKILL.md` | Guía HDR10+, Dolby Vision, LCEVC Phase 4, AI SR, tone-mapping |
| `lcevc_100_percent_compliance_master/SKILL.md` | LCEVC v16.4.1 compliance |
| `jerarquia_base_lcevc_dinamica/SKILL.md` | LCEVC HEVC>AVC fallback |
| `quantum_pixel_overdrive/SKILL.md` | Quantum pixel overdrive max-color |
| `crystal_uhd_sniper_engine/SKILL.md` | Filtros HW silent sniper |
| `god_tier_perceptual_quality/SKILL.md` | Per-scene encoding AI-driven |
| `ai_super_resolution_orchestrator_v4/SKILL.md` | AI SR multi-device polymorphic |
| `Skill_OLED_Showroom_Supremacy/SKILL.md` | Burn OLED contrast extremo |
| `jerarquia_codec_hevc_suprema/SKILL.md` | HEVC universal preference |
| `jerarquia_resolucion_infinita/SKILL.md` | Cascada 8K→4K→FHD→HD→SD |
| `jerarquia_deinterlace_bwdif/SKILL.md` | BWDIF → YADIF2X → YADIF |
| `fusion_infinita_bwdif/SKILL.md` | BWDIF + Resolución infinita |
| `video_enhancement_technologies/SKILL.md` | Reference completo de AI SR / GNVC / RTX VSR |
| `phoenix_qmax_adaptive_v2/SKILL.md` | Greedy best-available + anti-downgrade |
| `resolucion_driven_anti_downgrade/SKILL.md` | Anti-downgrade SSOT |

### 2.12 CMAF / fMP4 / DASH
Skills de transporte CMAF:

| Skill | Para qué |
|---|---|
| `cmaf_dominance_engine_v1/SKILL.md` | UHD CMAF Zero-Transcode |
| `cmaf_http200_direct_fix/SKILL.md` | Fix CMAF HTTP 200 OTT Navigator |
| `cmaf_proxy_ramdisk_server/SKILL.md` | RAM-disk segment server |
| `cmaf_worker_ffmpeg_pipeline/SKILL.md` | Pipeline MPEG-TS → CMAF |
| `dash_timeline_epoch_sync/SKILL.md` | Anti-freeze cada 2 minutos ExoPlayer |
| `motor_dinamico_renderizado_mpd/SKILL.md` | Motor dinámico MPD + fallback HLS 2 pasos |
| `exoplayer_dash_black_screen_diagnostic/SKILL.md` | UnrecognizedInputFormatException |
| `skill_41_cmaf_unification/SKILL.md` | CMAF/fMP4 unification |
| `pevce_harmonic_fallback_strict_1_to_1/SKILL.md` | PEVCE redundancia CMAF/TS |
| `annex_b_avcc_bridge/SKILL.md` | H264 Annex-B → AVCC bridge |
| `arquitectura_puente_doble_protocolo/SKILL.md` | DASH + HLS dual protocol |

### 2.13 Resilience / Anti-Cut / Anti-Freeze
Skills de robustez:

| Skill | Para qué |
|---|---|
| `iptv-resiliencia-degradacion/SKILL.md` | Cadena 7 niveles de degradación |
| `resilience_pipeline_v6_3_complete/SKILL.md` | 5 motores resilience (NeuroBuffer, BW Floor, ModemPriority, AISuperRes) |
| `anti_cut_engine/SKILL.md` | APE Anti-Cut v1.0 — 5-layer |
| `polymorphic_freeze_detector/SKILL.md` | Dual-signal freeze prevention |
| `bandwidth_floor_enforcement/SKILL.md` | Min bandwidth per profile |
| `neuro_adaptive_telemetry_engine/SKILL.md` | Buffer health from HTTP frequency |
| `sniper_mode/SKILL.md` y `sniper_mode_v31_8gaps/SKILL.md` | Active channel detection |
| `Skill_Anti_Freeze_Jump_To_Live` (skills_*) | Jump-to-live atomic |
| `omega_asymmetric_resilience_engine/SKILL.md` | OMNI-orchestrator V5 + Health Engine |

### 2.14 Audio / Atmos / Multi-Channel
Skills de audio premium:

| Skill | Para qué |
|---|---|
| `audio_track_safety_ott_navigator/SKILL.md` | Track safety OTT Navigator |
| `Skill_Audio_Passthrough_Atmos_Strict` | Atmos passthrough crudo |
| `Skill_Audio_Video_Sync_Drop_Tolerance` | A/V sync L3 |
| `antigravity_quantum_ffmpeg_003_audio_ebur128_loudness_normalization` | Loudnorm |
| `antigravity_quantum_ffmpeg_012_audio_dts_neural_x_upmix` | DTS Neural-X upmix |
| `antigravity_quantum_ffmpeg_037_audio_pan_law_compensation` | Pan law -3dB |

### 2.15 Profile Manager / Persistence / Channels
Skills del profile manager y persistencia:

| Skill | Para qué |
|---|---|
| `channel-persistence/SKILL.md` | SIEMPRE guardar channelsMaster, NUNCA channelsFiltered |
| `credential-lock/SKILL.md` | Credenciales validadas son INMUTABLES |
| `credenciales_ssot_end_to_end_port_binding/SKILL.md` | Port binding SSOT E2E |
| `relational_master_data_anti_bleed/SKILL.md` | Anti credential bleed multi-tenant |
| `profile_resolution_inheritance_engine/SKILL.md` | Herencia P0-P5 ↔ resolución |
| `compliance_indexeddb_architect/SKILL.md` | IndexedDB persistence atómica |
| `iptv-ape-spinal-cord/SKILL.md` | 251 headers + Profile Info wired UI ↔ M3U8 |

### 2.16 Pentest / Security
Skills de seguridad ofensiva-defensiva:

| Skill | Para qué |
|---|---|
| `pentest_anti_osint_shield/SKILL.md` | Anti OSINT recon |
| `pentest_anti_rce_ffmpeg/SKILL.md` | Anti RCE FFmpeg priv-drop |
| `pentest_drm_network_defense/SKILL.md` | DRM + network MITM defense |
| `pentest_web_auth_ssrf_blocker/SKILL.md` | SSRF blocker |
| `drm_security_encryption_phd/SKILL.md` | Widevine/FairPlay teoría PhD |

### 2.17 PhD-Level Theoretical Reference
Documentación teórica (no operativa pero útil):

| Skill | Para qué |
|---|---|
| `drm_security_encryption_phd/SKILL.md` | DRM/CENC theory |
| `gpu_decoders_players_phd/SKILL.md` | NVDEC/MediaCodec/ExoPlayer/VLC |
| `low_level_video_engineering_phd/SKILL.md` | C/PHP video parsers, FFmpeg, GStreamer |
| `math_control_adaptive_models_phd/SKILL.md` | Control theory adaptive |
| `network_engineering_qos_phd/SKILL.md` | TCP/UDP behavior, DSCP, BBR |
| `product_design_tech_ux_phd/SKILL.md` | QoE perceptual UX |
| `streaming_protocols_cmaf_phd/SKILL.md` | HLS/DASH/CMAF estructural |
| `video_compression_hdr_phd/SKILL.md` | H264/HEVC/AV1 + VMAF/SSIM |

### 2.18 Mis Skills Custom (Tier-1 Propias)
Las que creé específicamente para mí en sesiones recientes:

| Skill | Cuándo |
|---|---|
| `claude_iptv_navigator_v54_master_context` | SIEMPRE al iniciar sesión nueva |
| `claude_iptv_navigator_v54_skills_index` | (esta skill) cuando no sepa qué skill usar |
| `ape_profiles_config_surgical_repair_v10` | Cuando `ape-profiles-config.js` esté roto |
| `iptv_header_4layer_fallback_validator` | Antes/después de tocar `headerOverrides` |
| `omega_absolute_v10_header_matrix_sync` | Para sync JSON v10 → DEFAULT_PROFILES |
| `m3u8_typed_arrays_ultimate_safe_modify_protocol` | Antes de tocar el generador |
| `iptv_navigator_v54_pre_edit_audit_checklist` | SIEMPRE antes de Edit |
| `iptv_navigator_v54_post_edit_validation_pipeline` | SIEMPRE después de Edit |
| `iptv_omega_l11_l12_l13_integration_protocol` | Integrar capas oro puro → 851 |
| `iptv_navigator_v54_backup_rollback_index` | Para rollback con `.bak_*` |
| `iptv_navigator_v54_user_collab_doctrine` | Para entender preferencias del usuario |

## 3. Ruido / Skills a Ignorar

### 3.1 Empty placeholders (`super_skill_*` — 69 skills)
Auto-generadas con character encoding bugs (`super_skill_topolog_a_gossip_protocol_cruda_l4__bare`). **TODAS están vacías** (`SKILL.md` sin contenido). Ignorar todas.

### 3.2 Autostub duplicates (65 skills `Skill_*` / `Expert_Skill_*`)
Frase plantilla "Mi capacidad instalada para dominar X y telemetría avanzada". El nombre `X` suele duplicar una skill real con descripción mejor. Si necesitas la real, busca por keyword sin el prefijo `Skill_`/`Expert_Skill_`.

### 3.3 Generic Software Engineering (126 skills `skill_*` sin nombre)
Topics como "Database per Service", "GraphQL Query Complexity", "Compilación Ahead-of-Time", "Kubernetes Service Mesh". NO son específicas de IPTV. Útiles solo si necesitas referencia teórica de un tema externo. No las consultes para tareas IPTV.

## 4. Decision Tree — Qué Skill Usar Según la Tarea

```
¿Qué estás por hacer?
│
├── Iniciar sesión nueva → claude_iptv_navigator_v54_master_context
│
├── Edit en archivo Tier-S (generador, config, resolver)
│   ├── Antes  → iptv_navigator_v54_pre_edit_audit_checklist
│   ├── Generador → m3u8_typed_arrays_ultimate_safe_modify_protocol
│   ├── Config perfiles → ape_profiles_config_surgical_repair_v10
│   ├── Resolver PHP → resolver_blindaje_total + resolve-architecture
│   └── Después → iptv_navigator_v54_post_edit_validation_pipeline
│
├── Generar / regenerar lista M3U8
│   ├── generacion_lista_ape_typed_arrays_ultimate
│   ├── pipeline_blindaje_m3u8 (9 contratos)
│   ├── generacion_m3u8_bulletproof_1_to_1
│   └── post_generation_audit_v10_4 (auditar después)
│
├── Sincronizar JSON v10 a config
│   └── omega_absolute_v10_header_matrix_sync
│
├── Validar headers / fallbacks
│   └── iptv_header_4layer_fallback_validator
│
├── Integrar capas L11/L12/L13
│   └── iptv_omega_l11_l12_l13_integration_protocol
│
├── Auditar lista generada
│   ├── balanced_scorecard_m3u8 (incluye script Node.js)
│   ├── post_generation_audit_v10_4
│   └── auditoria_calidad_5_pilares
│
├── Desplegar al VPS
│   ├── despliegue_quirurgico_vps (7 steps)
│   ├── ape_deployment_safety_guardrails (pre/post checks)
│   └── vps_upload_gateway (upload rules)
│
├── Debug HTTP 5xx en resolver
│   ├── diagnostico_forense_php_500
│   ├── resolver_blindaje_total
│   └── nginx_if_is_evil_fix
│
├── Tocar FFmpeg / codecs
│   ├── antigravity_quantum_ffmpeg_001-070 (lo específico)
│   ├── crystal_skill_51-80 (mirrors APE-specific)
│   └── video_compression_hdr_phd (teoría)
│
├── Calidad visual extrema (HDR/LCEVC)
│   ├── iptv-hdr-lcevc-pipeline
│   ├── lcevc_100_percent_compliance_master
│   ├── jerarquia_base_lcevc_dinamica
│   └── ai_super_resolution_orchestrator_v4
│
├── Evasión ISP / stealth
│   ├── iptv-isp-evasion-phantom-hydra
│   ├── iptv-polimorfismo-idempotencia
│   ├── hydra_stream_evasion_engine
│   └── rotacion_user_agents_dinamica
│
├── Resilience / anti-cut
│   ├── iptv-resiliencia-degradacion (cadena 7 niveles)
│   ├── anti_cut_engine
│   ├── resilience_pipeline_v6_3_complete
│   └── omega_asymmetric_resilience_engine
│
├── Rollback de un archivo
│   └── iptv_navigator_v54_backup_rollback_index
│
└── No sé qué hacer
    └── ESTA SKILL (claude_iptv_navigator_v54_skills_index)
```

## 5. Comandos Rápidos del Índice

```bash
# Buscar skill por keyword en el índice JSON
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/.agent/skills"
python -c "
import json
with open('_skills_index.json') as f: data = json.load(f)
kw = 'KEYWORD_AQUI'
for s in data:
    if kw.lower() in (s.get('name','') + s.get('desc','') + s.get('folder','')).lower():
        print(s['folder'], '|', s.get('name',''))
"

# Listar todas las skills de una familia
ls .agent/skills/ | grep -E '^crystal_skill_' | sort

# Re-generar el índice si se agregaron skills nuevas
python -c "
import os, re, json
skills = []
for d in sorted(os.listdir('.')):
    if not os.path.isfile(os.path.join(d, 'SKILL.md')): continue
    with open(os.path.join(d, 'SKILL.md'), encoding='utf-8', errors='replace') as f:
        c = f.read(4000)
    name = (re.search(r'^name:\s*(.+)$', c, re.M) or ['',''])[1].strip().strip('\"\\'')
    desc = (re.search(r'^description:\s*(.+)$', c, re.M) or ['',''])[1].strip().strip('\"\\'')
    skills.append({'folder': d, 'name': name, 'desc': desc})
json.dump(skills, open('_skills_index.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(skills), 'skills')
"
```

## 6. Métricas del Sistema

| Métrica | Valor |
|---|---|
| Total carpetas | 671 |
| Con SKILL.md válido (con name) | ~480 |
| Sin name pero con desc | ~125 |
| Vacíos completamente | ~66 (`super_skill_*` + algunos otros) |
| Mis skills custom | 11 (10 anteriores + esta) |
| Reglas en `.agent/rules/` | 8 |
| Familias funcionales identificadas | 18 |
| Tier-1 críticas a leer al inicio | ~15 |
| Tier-2 a consultar bajo demanda | ~280 |
| Ruido (placeholders + autostubs + generic) | ~260 |

## 7. Referencias

- Índice JSON crudo: `.agent/skills/_skills_index.json` (3,356 líneas)
- Categorización: `.agent/skills/_skills_categorized.json`
- Master context: `claude_iptv_navigator_v54_master_context/SKILL.md`
- Doctrina: `.agent/rules/omega_absolute_doctrine.md`
