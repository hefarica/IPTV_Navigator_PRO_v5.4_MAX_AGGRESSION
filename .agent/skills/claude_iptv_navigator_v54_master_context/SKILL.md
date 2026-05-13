---
name: Claude — IPTV Navigator PRO v5.4 Master Context
description: "Skill maestra que carga el contexto completo del proyecto IPTV Navigator PRO v5.4 MAX AGGRESSION para Claude Code. SIEMPRE leer al iniciar una sesión nueva en este repo. Resume arquitectura, doctrina, módulos críticos, estado actual y rutas de archivos clave."
---

# Master Context — IPTV Navigator PRO v5.4 MAX AGGRESSION

> **Lectura obligatoria al iniciar sesión nueva en este repo.** Esta skill te da en <2 minutos el mapa mental completo para no perder tiempo re-explorando.

## 1. Identidad del Proyecto

- **Nombre:** IPTV Navigator PRO v5.4 MAX AGGRESSION
- **Working dir:** `c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\`
- **Branch principal:** `master`
- **Repo Git:** sí — usa commits convencionales en español/inglés
- **Naturaleza:** Plataforma de generación M3U8 OMEGA con calidad visual extrema y resiliencia nuclear contra ISPs, geo-bloqueos, baneos y mismatches de codec.

## 2. Doctrina Operativa (NO violar nunca)

1. **OMEGA CRYSTAL V5 — 796 líneas/canal indivisibles** (10 capas L0–L10).
2. **Player Enslavement** — destruir ABR, forzar HW decode, cadena CMAF→fMP4→TS.
3. **GPU Rendering supremo** — LCEVC Phase 4, HDR10+ 5000 nits, 12-bit I444.
4. **Evasión ISP nuclear** — Swarm Phantom Hydra Stealth, X-Forwarded-For random, DSCP DiffServ.
5. **Polimorfismo + Idempotencia** — `_nonce796` muta cada descarga (DPI evasion), `_sid796` estable (cache key resolver).
6. **Telchemy TVQM** — métricas QA bidireccionales sin gatillar 509.
7. **"Beautiful Madness"** — cada header con cadena de fallback de 4 capas: `GOD_TIER,ELITE,BALANCED,COMPATIBLE`.
8. **NUNCA fragmentar** `generateChannelEntry()` en sub-módulos (regresiones L9 y L13 documentadas).
9. **NUNCA eliminar "redundancia"** entre EXTVLCOPT/KODIPROP/EXTHTTP/EXT-X-APE — es deliberada (cada player lee de capa distinta).

Ver `omega_absolute_doctrine.md` y `m3u8_120_120_perfection_invariant/SKILL.md` para detalles.

## 3. Mapa de Archivos Críticos

### Frontend (`IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/`)

| Archivo | Líneas | Propósito |
|---|---|---|
| `m3u8-typed-arrays-ultimate.js` | ~7,094 | **Generador OMEGA v22.2.0-FUSION-FANTASMA-NUCLEAR**. Función `generateChannelEntry()` produce 796 líneas/canal. |
| `ape-profiles-config.js` | ~3,041 | `HEADER_CATEGORIES` (19) + `DEFAULT_PROFILES` (P0–P5) + clase `APEProfilesConfig`. |
| `profile-manager-v9.js` | grande | UI v13.1.0-SUPREMO de gestión de perfiles. Matriz BPP 5×5. |
| `profile-bridge-v9.js` | medio | Puente IndexedDB ↔ UI. |
| `headers-matrix-v9.js` | ~29 KB | 154 combinaciones de headers. |
| `tls-coherence-engine-v9.js` | ~395 | TLS 1.3 / JA3 / JA4 spoofing coherente. |
| `xtream-exploit-engine-v9.js` | ~606 | 8 vulns × 8 técnicas Xtream. |
| `phantom-hydra-engine.js` | ~97 | Multi-identity masking. |
| `cortex-js-resilience.js` | pequeño | Pilar 5: intercepta `fetch`/`XHR` global. |
| `jwt-token-generator-v9.js` | ~26 KB | JWT con 68+ campos en 8 secciones. |
| `gateway-m3u8-integrated.js` | medio | Gateway de generación. |

### Backend (`IPTV_v5.4_MAX_AGGRESSION/backend/`)

| Archivo | Líneas | Propósito |
|---|---|---|
| `resolve_quality_unified.php` | ~6,892 | Resolver maestro con APCu, 10 ISP × 7 fallback levels. |
| `rq_streaming_health_engine.php` | medio | Health monitoring tiempo real. |
| `rq_sniper_mode.php` | medio | Precision quality targeting. |
| `rq_anti_cut_engine.php` | medio | Stall/cut prevention. |
| `ape_phantom_engine.php` | medio | UA + cookie rotation server-side. |
| `cortex_orchestrator.php` | 48 | Ultra-lean dispatcher. |
| `quantum_guardian.py` | medio | Daemon `<30ms`, IPC vía `/dev/shm/guardian_exchange.json`. |
| `upload-server/src/upload.rs` | ~14 KB | Servidor Rust async chunked + JWT + WebSocket. |

### Skills y reglas

- **Skills:** `.agent/skills/` (~667 carpetas, cada una con `SKILL.md`).
- **Reglas:** `.agent/rules/` — 8 archivos `.md`. La doctrina maestra es `omega_absolute_doctrine.md`.

## 4. Estado Actual (verificar antes de operar)

### Bug crítico verificado el 2026-04-08
- **`ape-profiles-config.js:504`** — `},DICTION":` corruption + ~27 líneas huérfanas (505–531).
- Causa: Edit fallido en sesión previa al intentar el upgrade "Omega Absolute v9.0/v10.0 Header Matrix".
- Efecto: `node -c` falla → todo el módulo de perfiles caído → cascada a Profile Manager y M3U8 generation.
- **Fix sugerido:** eliminar líneas 504–531, dejar `},` cerrando P0. Ver skill `ape_profiles_config_surgical_repair_v10`.

### Trabajo pendiente identificado
1. Reparar bug línea 504 (P0).
2. Sincronizar `APE_OMEGA_PROFILES_v10.0_FINAL.json` → `DEFAULT_PROFILES`.
3. Validar 4-layer fallback en cada uno de los ~233 headers × 6 perfiles.
4. Integrar las 8 capas "oro puro" (L11/L12/L13) al generador OMEGA.

## 5. Skills Hermanas que Debes Conocer

| Skill | Cuándo usarla |
|---|---|
| `ape_profiles_config_surgical_repair_v10` | Cuando `ape-profiles-config.js` falle `node -c`. |
| `iptv_header_4layer_fallback_validator` | Antes/después de tocar `headerOverrides`. |
| `omega_absolute_v10_header_matrix_sync` | Para sincronizar JSON v10 → DEFAULT_PROFILES. |
| `m3u8_typed_arrays_ultimate_safe_modify_protocol` | Antes de tocar el generador OMEGA. |
| `iptv_navigator_v54_pre_edit_audit_checklist` | SIEMPRE antes de cualquier Edit en este repo. |
| `iptv_navigator_v54_post_edit_validation_pipeline` | SIEMPRE después de cualquier Edit. |
| `iptv_omega_l11_l12_l13_integration_protocol` | Cuando integres nuevas capas al generador. |
| `iptv_navigator_v54_backup_rollback_index` | Cuando necesites rollback de un archivo. |
| `iptv_navigator_v54_user_collab_doctrine` | Para entender preferencias del usuario. |
| `arquitectura_omega_v5_2_746_lineas` | Para entender las 10 capas L0–L10. |
| `m3u8_120_120_perfection_invariant` | Para no romper el conteo de 796 líneas. |
| `post_generation_audit_v10_4` | Para validar conformidad universal de players. |

## 6. Comandos Frecuentes

```bash
# Sintaxis del config de perfiles
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js

# Sintaxis del generador
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js

# Auditoría de M3U8 generado
python audit_m3u8.py
python IPTV_v5.4_MAX_AGGRESSION/audit.py

# Test E2E
node test-e2e-v6.js

# Git status (ya hay 22 archivos modificados sin commitear)
git status
git log --oneline -10
```

## 7. Idioma y Estilo

- **Idioma del usuario:** Español. Responder siempre en español salvo que pida otro.
- **Densidad técnica:** Alta. El usuario es experto y prefiere explicaciones técnicas concisas con file paths y line numbers.
- **No editorializar:** Ir al grano. No agregar resúmenes redundantes al final de las respuestas.
- **No optimizar prematuramente:** "Redundancia" en este proyecto suele ser intencional. Ver doctrina §8–9.
