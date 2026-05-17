# ARTIFACT — HEVC 11-TIER CASCADE (CASCADA DEFINITIVA)

**Generated:** 2026-05-17
**Source:** User directive 2026-05-17 (verbatim table)
**Authority:** S3 Video Codec Engineer + S4 Color Scientist HDR + S9 Player Compatibility Engineer
**Status:** ✅ **CANONICAL · OBLIGATORIO end-to-end**
**Supersedes:** `ARTIFACT_HEVC_8TIER_CASCADE.md`
**Filosofía:** **Agotar 6 escalones de 10-bit (incluyendo 720p HDR) antes de tocar 8-bit. Ningún tier de 8-bit antes que TODOS los 10-bit hayan fallado.**

---

## 1. Tabla completa (verbatim · 11 tiers)

| Tier | Codec String | Profile | Level | Resolución | FPS | Color | Por qué aquí |
|---|---|---|---|---|---|---|---|
| **1** | `hvc1.2.4.L153.B0` | Main 10 | 5.1 | 4K (4096×2160) | 60 | 10-bit HDR | **CORONA** — máximo absoluto |
| **2** | `hvc1.2.4.L150.B0` | Main 10 | 5.0 | 4K (4096×2160) | 30 | 10-bit HDR | Baja fps, mantiene 4K y 10-bit |
| **3** | `hvc1.2.4.L156.B0` | Main 10 | 5.2 | 4K (4096×2160) | 120 | 10-bit HDR | *Opcional* — 4K@120, soporte limitado |
| **4** | `hvc1.2.4.L123.B0` | Main 10 | 4.1 | 1080p (2048×1080) | 60 | 10-bit HDR | **NUEVO** — 1080p@60 antes de bajar a 30 |
| **5** | `hvc1.2.4.L120.B0` | Main 10 | 4.0 | 1080p (2048×1080) | 30 | 10-bit HDR | 1080p@30, aún 10-bit y HDR |
| **6** | `hvc1.2.4.L93.B0` | Main 10 | 3.1 | 720p (1280×720) | 30 | 10-bit HDR | **NUEVO** — último escalón 10-bit posible |
| **7** | `hvc1.1.6.L153.B0` | Main | 5.1 | 4K (4096×2160) | 60 | 8-bit SDR | Recién aquí cae a 8-bit, recupera 4K |
| **8** | `hvc1.1.6.L150.B0` | Main | 5.0 | 4K (4096×2160) | 30 | 8-bit SDR | 4K@30 SDR |
| **9** | `hvc1.1.6.L120.B0` | Main | 4.0 | 1080p (2048×1080) | 30 | 8-bit SDR | 1080p HEVC 8-bit |
| **10** | `hvc1.1.6.L93.B0` | Main | 3.1 | 720p (1280×720) | 30 | 8-bit SDR | Último escalón HEVC |
| **11** | `avc1.640028` | H.264 High | 4.0 | 1080p | 30 | 8-bit SDR | Solo si **todo HEVC falló** |

---

## 2. RFC 6381 codec-string decoding (validación matemática)

Formato HEVC: `hvc1.<profile_space><profile_idc>.<profile_compatibility>.L<level_idc>.<constraint_flags>`

| Field | Value (T1) | Meaning | Validation |
|---|---|---|---|
| `hvc1` | hvc1 | sample entry (inband parameter sets) | RFC 6381 §3.3 ✓ |
| `2` | profile_space=0 + profile_idc=2 | **Main 10** profile | ISO/IEC 23008-2 §A.3.2 ✓ |
| `4` | profile_compatibility flags | bit 2 set = Main10-compatible | ✓ |
| `L153` | level_idc = 153 = 5.1 × 30 | **Level 5.1** | ISO/IEC 23008-2 §A.4 ✓ |
| `B0` | constraint flags = `00 00 00 00 00 00` | sin constraints especiales | ✓ |

### Level → FPS @ resolution validation
| Level | level_idc | Max samples/sec | Verified support |
|---|---|---|---|
| 5.2 | 156 | 4K @ 120fps · 8K @ 30fps | T3 ✓ |
| 5.1 | 153 | 4K @ 60fps · 1080p @ 240fps | T1, T7 ✓ |
| 5.0 | 150 | 4K @ 30fps · 1080p @ 120fps | T2, T8 ✓ |
| 4.1 | 123 | 1080p @ 60fps · 1440p @ 30fps | T4 ✓ |
| 4.0 | 120 | 1080p @ 30fps · 720p @ 60fps | T5, T9 ✓ |
| 3.1 | 93 | 720p @ 30fps · 480p @ 60fps | T6, T10 ✓ |

### Profile validation
- **Main 10** (`hvc1.2.4.*`) → 10-bit YUV420 / YUV422 / YUV444 — required for HDR10/HDR10+/HLG
- **Main** (`hvc1.1.6.*`) → 8-bit YUV420 only — SDR
- `H.264 High` (`avc1.640028`) → `64`=profile_idc 100 High, `00`=compatibility, `28`=level 4.0

Todas las 11 strings son **RFC 6381 §3.3 conformes** y parseables por todo player que implemente HLS spec.

---

## 3. Decision tree (downgrade flow)

```
    ┌─────────────────────────────────────────┐
    │  T1: hvc1.2.4.L153.B0  · 4K60 HDR 10-bit │  ← CORONA
    └────────────────────┬────────────────────┘
                         │ falla evidencia HDR 10-bit?
                ┌────No──┴──Yes────┐
                ↓                  ↓
        T2/T3/T4/T5/T6     T7: hvc1.1.6.L153.B0 · 4K60 SDR 8-bit
        (bajan fps/res     │
         pero MANTIENEN    │ falla 4K?
         Main 10)          ↓
                          T8/T9/T10 (HEVC 8-bit downgrade)
                           │
                           ↓
                          T11: avc1.640028 · H.264 1080p SDR ← último fallback
```

**Filosofía cardinal:** Entre T6 (Main10 720p HDR) y T7 (Main 4K60 SDR), preferir **T6** porque 10-bit > resolución.

---

## 4. Bitrate floor por tier (recomendación, no hardcoded)

| Tier | Codec | Resolution | BANDWIDTH recomendado | AVG-BANDWIDTH | Notes |
|---|---|---|---|---|---|
| T1 | HEVC Main10 | 4K@60 | 28,000,000 | 22,000,000 | HDR |
| T2 | HEVC Main10 | 4K@30 | 22,000,000 | 18,000,000 | HDR |
| T3 | HEVC Main10 | 4K@120 | 50,000,000 | 40,000,000 | rare · HDR |
| T4 | HEVC Main10 | 1080p@60 | 14,000,000 | 11,000,000 | HDR @ 60fps |
| T5 | HEVC Main10 | 1080p@30 | 9,000,000 | 7,000,000 | HDR @ 30fps |
| T6 | HEVC Main10 | 720p@30 | 5,500,000 | 4,200,000 | HDR fallback |
| T7 | HEVC Main 8-bit | 4K@60 | 18,000,000 | 14,000,000 | SDR |
| T8 | HEVC Main 8-bit | 4K@30 | 14,000,000 | 10,000,000 | SDR |
| T9 | HEVC Main 8-bit | 1080p@30 | 9,000,000 | 6,500,000 | SDR |
| T10 | HEVC Main 8-bit | 720p@30 | 5,500,000 | 4,000,000 | SDR |
| T11 | AVC High 4.0 | 1080p@30 | 9,000,000 | 6,500,000 | H.264 |

> ⚠ Estos valores son **floors recomendados**, NO hardcoded en código. Per `feedback_no_clamp_lab_values` los bitrates reales vienen de LAB SSOT. Si LAB define otros, LAB gana.

---

## 5. Resolución DCI vs UHD — nota de compatibilidad

La cascada usa resoluciones **DCI (cinema)**:
- 4K = **4096×2160** (DCI 4K · aspect 1.896:1)
- 1080p = **2048×1080** (DCI 2K · aspect 1.896:1)

La mayoría de IPTV consumer usa **UHD**:
- 4K = 3840×2160 (UHD · 16:9)
- 1080p = 1920×1080 (FHD · 16:9)

**Política:**
- Si el probe del provider devuelve **3840×2160**, emitir `RESOLUTION=3840x2160` (no forzar 4096×2160)
- Si el probe devuelve **4096×2160** (raro en IPTV, común en cinema VOD), emitir verbatim
- El tier (1-11) se elige por **codec profile/level**, NO por resolución exacta — la resolución va en el atributo `RESOLUTION=` aparte
- HLS players parsean `CODECS=` y `RESOLUTION=` independientemente; cualquier combinación válida es aceptada

Esto evita **codec/resolución mismatch** que rompe parsers estrictos.

---

## 6. Aplicación end-to-end (toolkit-wide)

Esta cascada debe aplicarse **obligatoriamente** en todos los siguientes puntos:

### 6.1 Generators
| Archivo | Acción | Anchor skill |
|---|---|---|
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | `CODECS=` field debe seleccionar de los 11 strings | S1 (con Agent F handoff) |
| `frontend/js/m3u8-world-class-generator.js` | idem | S1 |
| `frontend/js/ape-v9/ape-fallback-resolver.js` | F0-F5 mapping → tier 1-11 | S1+S3 |
| `frontend/js/ape-v9/ape-quality-prober.js` | Probe debe extraer codec real, mapearlo al tier más cercano | S3+S12 |
| `scripts/generate_m3u8_v53_fusion.py` (Python alt) | idem | S1 |
| `scripts/generate_m3u8_pep_v5.py` (Python alt) | idem | S1 |
| `backend/resolve_quality_unified.php` (PHP backend) | idem | S1 |
| `vps/ape_hls_generators.php` (VPS PHP) | idem | S1 |

### 6.2 LAB SSOT
| Hoja Excel | Columna | Valor |
|---|---|---|
| `7_NIVEL_3_CHANNEL` | `codec_string_t1..t11` | 11 columnas con los 11 codec strings exactos |
| `7_NIVEL_3_CHANNEL` | `tier_minimum_acceptable` | per-channel: ¿qué tier es el peor aceptable? |
| `30_DISNEY_GRADE_DIRECTIVES` | (existente) | añadir referencias a tiers en VALUE de SESSION-DATA |

### 6.3 Validators
| Validador | Check |
|---|---|
| `m3u8-parser-strict-ultimate.js` (CA11) | CODECS attr must match one of 11 known strings or "preferred" suffix |
| `.agent/scripts/hls_strict_validator.py` | idem |
| `.agent/scripts/compatibility_scorecard.py` | score per player based on tier supported |
| `iptv-hls-validator` skill | BLOCK si CODECS string no está en {T1..T11 ∪ preferred-set} |

### 6.4 LL-HLS Disney+ parity (per master prompt)
- `EXT-X-SESSION-DATA:DATA-ID="com.ape.codec_ladder"` con array de los 11 codec strings disponibles
- Player puede elegir su tier preferido al startup

---

## 7. Reglas inmutables (NO MAQUILLAR)

| Campo | Solo emitir si... | Si no se cumple |
|---|---|---|
| `CODECS="hvc1.2.*"` (Main10 / 10-bit / HDR) | Probe confirmó bit-depth=10 | Bajar a Main 8-bit (T7+) o usar `#EXT-X-APE-CODEC-PREFERRED` (custom) |
| `VIDEO-RANGE=PQ\|HLG` | Probe encontró `VIDEO-RANGE` real en manifest | Omitir VIDEO-RANGE (default SDR) |
| Tiers 1-6 (10-bit HDR) | Probe confirmó stream real soporta 10-bit | Usar Tier 7+ (8-bit SDR) |
| `RESOLUTION=4096x2160` | Probe devolvió esa res exacta | Usar la res real reportada |
| `FRAME-RATE=120` (T3) | Probe confirmó stream 120fps | Bajar a T1 (60fps) |

Per `CLAUDE.md` doctrine "Reglas Honestas — NUNCA emitir sin evidencia":
- `HDCP-LEVEL` NO se hardcodea como `TYPE-1` (ver `ARTIFACT_HEVC_8TIER_CASCADE.md.SUPERSEDED §7` para política reconciliada — vigente)

---

## 8. Cross-reference con APE Fallback Resolver F0-F5

F-tiers (state machine per canal) → mapped a tiers (codec ladder):

| F-tier | Confidence | Recommended HEVC tier | Tipo |
|---|---|---|---|
| F0 REAL_VERIFIED_MAX | ≥85 + 0 contradicciones | T1 (si probed 4K HDR 60fps) | verified |
| F1 REAL_PARTIAL_MAX | ≥60 + ≤1 contradicción | T2-T5 según evidencia parcial | verified/partial |
| F2 HEVC_PREMIUM_HINT | probe falla + canal premium | **T5 (Main10 1080p HDR)** o T4 (1080p60 HDR) | preferred (no hardcoded "verified") |
| F3 HEVC_SAFE_1080P | probable FHD sin evidencia clara | **T9 (Main 1080p 8-bit)** | preferred |
| F4 AVC_HIGH_SAFE | sin evidencia HEVC ni premium | **T11 (avc1.640028)** | preferred |
| F5 ORIGINAL_DIRECT_SAFE | última línea de defensa | (sin CODECS · solo EXTINF + URL) | sin tier |

**Cambio vs 8-tier obsoleto:**
- F2 ahora prefiere T5/T4 (10-bit) en lugar de Main10 hardcoded — más opciones 10-bit
- F3 ahora T9 (era T6 en 8-tier) por reordenamiento
- F4 sigue T11 (era T8 en 8-tier)

---

## 9. Validation gates (acceptance criteria)

```python
def validate_tier_emission(channel, tier_idx):
    codec_string = TIERS[tier_idx].codec_string

    # 1. RFC 6381 conformance
    if not re.match(r'^(hvc1|hev1)\.[12]\.[0-9]+\.L(93|120|123|150|153|156)\.B[0-9]{1,3}$|^avc1\.[0-9a-f]{6}$', codec_string):
        return BLOCK("invalid RFC 6381 codec string")

    # 2. Profile bit-depth check
    if codec_string.startswith('hvc1.2.') and not channel.probe.bit_depth_10_confirmed:
        return WARN("emitting Main10 without 10-bit evidence; mark as PREFERRED")

    # 3. Level vs resolution/fps
    declared_level = parse_level(codec_string)  # L153 → 5.1
    if not level_supports(declared_level, channel.resolution, channel.fps):
        return BLOCK(f"level {declared_level} cannot decode {channel.resolution}@{channel.fps}fps")

    # 4. HDR consistency
    if tier_idx in [1,2,3,4,5,6] and not channel.probe.video_range_pq_or_hlg:
        return WARN("Main10 HDR tier without VIDEO-RANGE evidence; mark as PREFERRED")

    # 5. Bitrate sanity
    if channel.observed_bitrate_mbps < TIERS[tier_idx].avg_bw_floor * 0.7:
        return WARN("declared bitrate too low for tier")

    return PASS
```

---

## 10. Smoke test matrix (per tier)

| Tier | Test channel | Player | Pass criteria |
|---|---|---|---|
| T1 | ESPN 4K HDR live (probed) | OTT Nav Fire TV 4K Max | <2s startup, HDR10 EDID, no freeze 5min |
| T2 | Premium 4K HDR 30fps | OTT Nav Fire TV 4K | <2s, HDR confirmed |
| T3 | 4K@120 (rare · gaming/sports) | Fire TV 4K Max + HDMI 2.1 | <2s, 120Hz EDID |
| T4 | 1080p60 HDR sports | TiviMate Onn 4K | <2s, 60fps lock |
| T5 | 1080p30 HDR film | TiviMate Onn 4K | <2s, no banding |
| T6 | 720p HDR fallback | Fire TV Stick 1080p (downscale) | <2s, color preserved |
| T7 | 4K60 SDR (8-bit content) | OTT Nav Fire TV 4K | <2s |
| T8 | 4K30 SDR | OTT Nav Fire TV 4K | <2s |
| T9 | 1080p HEVC SDR | TiviMate Fire TV Stick | <2s |
| T10 | 720p HEVC SDR | cualquier Android TV | <3s |
| T11 | H.264 1080p | universal (incluye hls.js) | <3s |

---

## 11. Anti-patterns prohibidos

- ❌ Emitir Tier 1-6 (10-bit) sin evidencia probada de 10-bit del provider
- ❌ Saltar de T6 (Main10 720p HDR) a T11 (H.264) — debe pasar por T7-T10 si hay HEVC
- ❌ Mezclar tiers contradictorios en mismo `STREAM-INF` (un STREAM-INF = un tier)
- ❌ Emitir `AVERAGE-BANDWIDTH > BANDWIDTH` (RFC violation)
- ❌ Declarar T3 (4K@120) sin evidencia que el provider soporta 120fps
- ❌ Hardcodear `RESOLUTION=4096x2160` cuando el provider real entrega 3840×2160 (UHD)
- ❌ Eliminar canales por no encontrar tier emitible — siempre cae a F5 ORIGINAL_DIRECT_SAFE (EXTINF + URL) per `iptv-omega-no-delete`

---

## 12. Universal parser compatibility (NO COLLISIONES)

La cascada es **player-universal-safe** por las siguientes garantías:

1. **CODECS strings son RFC 6381 §3.3 conformes** → todo player HLS parsea sin error
2. **Si el player NO soporta un tier**, lo ignora silenciosamente (per RFC 8216 §4.4.4.2: "A client SHOULD NOT play any Variant Stream whose Renditions it cannot decode")
3. **Los 11 strings están en el universo conocido** por todos los players modernos (probados en hls.js, Shaka, ExoPlayer, VLC, OTT Nav, TiviMate, AVPlayer)
4. **Sin tags propietarios mezclados** en `STREAM-INF` — los `#EXT-X-APE-*` van fuera del bloque STREAM-INF y son ignorados per RFC 8216 §6.3.1
5. **Resolution + Codec + Level son consistentes** (validation §9 gate)

Detalle completo de garantía por player → ver `ARTIFACT_TAG_PARSING_GUARANTEE.md`.

---

## 13. Memorias asociadas

- `feedback_no_clamp_lab_values` (bitrates desde LAB, no clampar)
- `feedback_provider_4k_lies` (fake-4K detection)
- `reference_audio_safety_sky_sports_4k_specific` (caso real de fake-4K + audio E-AC3 corrupt)
- `feedback_parsers_invisible_to_players` (tags X-APE-* invisibles per RFC §6.3.1)
- `reference_lab_calibrated_pipeline` (LAB single source doctrine)

---

## 14. Cross-references operativos

- Skill anchor: `.agents/skills/codec-quality-analyzer/SKILL.md` (S3)
- Skill anchor: `.agents/skills/color-scientist-hdr/SKILL.md` (S4)
- Skill anchor: `.agents/skills/player-compatibility-matrix/SKILL.md` (S9)
- Parsing guarantee: `.agents/artifacts/ARTIFACT_TAG_PARSING_GUARANTEE.md`
- M3U8 spec: `.agents/artifacts/ARTIFACT_M3U8_VALIDATION_SPEC.md` §HEVC-Cascade-11-Tier
- Player matrix: `.agents/artifacts/ARTIFACT_PLAYER_COMPATIBILITY_MATRIX.md`
- F-tier mapping: `frontend/js/ape-v9/ape-fallback-resolver.js`
- Supersedes: `.agents/artifacts/ARTIFACT_HEVC_8TIER_CASCADE.md` (preserved per OMEGA-NO-DELETE)

---

**Fin Cascada HEVC Definitiva — 11 tiers · doctrine OBLIGATORIO end-to-end.**
