---
name: m3u8_restructuring_rules_engine
description: "Motor de reestructuración M3U8 con Rules Engine de 68 reglas, deduplicación estricta, consolidación FALLBACK-B64, KODIPROP profile-aware, y Balanced Scorecard de validación. Garantiza compatibilidad universal de player y máxima agresión de calidad/red."
---

# 🔧 M3U8 Restructuring Rules Engine v6.1

**Propósito**: Transformar cualquier M3U8 generado por APE Typed Arrays en una lista estructuralmente perfecta, parseable por cualquier player del mundo, sin perder agresividad técnica.

**Score de calidad**: Mínimo **99/100** en Balanced Scorecard.

## 1. Arquitectura de Capas (Orden de Emisión OBLIGATORIO)

Todo canal DEBE emitir sus directivas en este orden estricto. Un player lee secuencialmente; si rompes el orden, se desincroniza.

```
CAPA 1:  #EXTINF:-1 tvg-id="..." ...,Nombre Canal     ← SIEMPRE PRIMERA
CAPA 2:  #EXTHTTP:{...}                                ← JSON monolítico (1 línea)
CAPA 3:  #EXT-X-APE-OVERFLOW-HEADERS:eyJ...            ← Base64 (1 línea)
CAPA 4:  #EXTVLCOPT:key=value                          ← 1 key = 1 value (deduplicado)
CAPA 5:  #KODIPROP:key=value                           ← 1 key = 1 value (profile-aware)
CAPA 6:  #EXT-X-APE-*:value                            ← APE tags (deduplicados)
CAPA 7:  #EXTATTRFROMURL:...                            ← Atributos desde URL
CAPA 8:  #EXT-X-CORTEX-* / #EXT-X-VNOVA-*              ← Cortex/LCEVC tags
CAPA 9:  #EXT-X-APE-FALLBACK-CHAIN:...                 ← FALLBACK (4 líneas max B64)
CAPA 10: http://servidor/stream/id.m3u8                 ← URL SIEMPRE ÚLTIMA
```

> [!CAUTION]
> **NUNCA** colocar tags entre la URL y el siguiente `#EXTINF`. Esto causa `index=3` en OTT Navigator.

## 2. Rules Engine — Políticas de Deduplicación

### 2.1 VLC (EXTVLCOPT) — 1 Key = 1 Value

Cuando hay duplicados, la política decide cuál valor gana:

| Policy | Descripción | Keys afectados |
|---|---|---|
| **KEEP_HIGHEST** (NEVER_DOWN) | El valor numérico más alto gana | `network-caching`, `live-caching`, `file-caching`, `disc-caching`, `tcp-caching`, `sout-mux-caching`, `clock-jitter`, `preferred-resolution`, `adaptive-maxwidth`, `adaptive-maxheight`, `postproc-quality`, `swscale-mode`, `mtu`, `sout-video-bitrate`, `sout-video-maxrate`, `sout-video-bufsize`, `repeat`, `input-repeat`, `adaptive-cache-size` |
| **KEEP_LOWEST** (NEVER_UP) | El valor numérico más bajo gana | `avcodec-hurry-up`, `avcodec-fast`, `avcodec-skiploopfilter`, `avcodec-skipframe`, `avcodec-skip-idct`, `avcodec-lowres` |
| **KEEP_FIRST** (EXACT_MATCH) | La primera instancia gana | `avcodec-hw` (=`any`), `clock-synchro` (=`1`), `deinterlace-mode` (=`bwdif,...`), `preferred-codec`, `codec-priority`, `adaptive-logic`, `video-filter`, `deinterlace` |

### 2.2 KODIPROP — Profile-Aware

Los valores de resolución y bandwidth se ajustan al perfil real del canal:

| Perfil | max_resolution | max_bandwidth | max_fps |
|---|---|---|---|
| P0 | 7680x4320 | 130000000 | 120 |
| P1 | 3840x2160 | 50000000 | 60 |
| P2 | 3840x2160 | 35000000 | 30 |
| P3 | 1920x1080 | 15000000 | 60 |
| P4 | 1280x720 | 8000000 | 30 |
| P5 | 854x480 | 3000000 | 25 |

**Keys afectados**:
- `inputstream.adaptive.max_resolution`
- `inputstream.adaptive.resolution_secure_max`
- `inputstream.adaptive.max_bandwidth`
- `inputstream.adaptive.initial_bandwidth`
- `inputstream.adaptive.initial_bitrate_max`
- `inputstream.adaptive.max_fps`

### 2.3 APE Tags — NEVER_DOWN Numérico

Si hay dos APE tags con la misma key, gana el valor numérico más alto (BUFFER-TARGET, BUFFER-MIN, etc.)

### 2.4 FALLBACK-IDs — Consolidación B64

**PROBLEMA**: Cada `#EXT-X-APE-FALLBACK-ID:xxx` suelto cuenta como "variante" para el parser de OTT Navigator, causando `length=N, index=N`.

**SOLUCIÓN**: Consolidar TODOS los fallback IDs y sus sub-tags en exactamente 4 líneas:

```
#EXT-X-APE-FALLBACK-CHAIN:403_NUCLEAR>407_MULTI_PROBE>401_AUTH>...
#EXT-X-APE-FALLBACK-STRATEGY:POLYMORPHIC_ESCALATION
#EXT-X-APE-FALLBACK-PERSIST:INFINITE
#EXT-X-APE-FALLBACK-GENOME-B64:eyJ7Li4ufQ==
```

## 3. Sanitización Unicode

| Carácter | Código | Reemplazo | Razón |
|---|---|---|---|
| ┃ | U+2503 | \| (U+007C) | Genera "grupo fantasma" en parsers que usan pipe como separador |

Aplicar SOLO en `#EXTINF` (nombre del canal y group-title).

## 4. Balanced Scorecard — Criterios de Validación

| Perspectiva | Peso | Criterios clave | Mínimo |
|---|---|---|---|
| Compatibilidad Universal | 30% | Zero duplicados VLC, FALLBACK consolidados, Unicode limpio | 95% |
| Calidad Técnica | 25% | Profile-aware, caching NEVER_DOWN, avcodec-hw=any definitivo | 95% |
| Agresión de Red | 20% | ISP 10 niveles, RECONNECT UNLIMITED, MULTI-SOURCE 5 | 100% |
| Integridad Estructural | 15% | Orden capas, URL al final, zero violations | 100% |
| Eficiencia | 10% | Dedup efectivo, B64 consolidación, <10s procesamiento | 90% |

**Score mínimo aceptable**: **97/100**

## 5. Scripts del Toolkit

| Script | Ruta | Función |
|---|---|---|
| `restructure_m3u8.js` | `scripts/restructure_m3u8.js` | Procesa M3U8 de producción (streaming, 500MB+) |
| `validate_m3u8_compat.js` | `scripts/validate_m3u8_compat.js` | Valida con Rules Engine (68 reglas), genera JSON |

## 6. Contradicciones Conocidas y Su Resolución

| Contradicción | Causa Raíz | Resolución |
|---|---|---|
| `network-caching=120000` → `=3000` | Inyección PEVCE post-generación | KEEP_HIGHEST → 120000 |
| `avcodec-hw=any` → `=d3d11va` → `=vaapi` | Múltiples capas legadas | KEEP_FIRST → `any` |
| `clock-synchro=1` → `=0` | Capa de deinterlace inyecta `=0` | KEEP_FIRST → `1` |
| `deinterlace-mode=bwdif` → `=yadif` → `=auto` | 5 capas compiten | KEEP_FIRST → `bwdif,yadif2x,yadif` |
| KODIPROP `max_resolution=7680x4320` para P3 | No era profile-aware | Forzar 1920x1080 para P3 |
| 12 FALLBACK-IDs sueltos | PRE_ARMED_RESPONSE no consolidaba | Consolidar en B64 |

## 7. Skills Relacionadas

| Skill | Relación |
|---|---|
| `generacion_lista_ape_typed_arrays_ultimate` | Pipeline de generación (upstream) |
| `auditoria_calidad_5_pilares` | Auditoría de calidad (complemento) |
| `arquitectura_anatomica_m3u8_ultimate` | Anatomía del M3U8 (referencia) |
| `auditoria_forense_linea_por_linea` | Auditoría forense (complemento) |
| `generacion_m3u8_bulletproof_1_to_1` | Generación 1:1 (upstream) |
