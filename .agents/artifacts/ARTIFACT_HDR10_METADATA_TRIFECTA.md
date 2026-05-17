# ARTIFACT — HDR10 METADATA TRIFECTA (BT.2020 + PQ + Matrix=9)

**Generated:** 2026-05-17
**Authority:** S4 Color Scientist HDR
**Source:** User directive — "BONDAD 2: METADATA HDR10 TRIFECTA EXPLÍCITA"
**Mission:** Garantizar emisión y propagación de los 3 valores HDR10 críticos en toda la cadena de manifestación

---

## 1. La Trifecta

Para que un panel TV active HDR10 mode (no SDR fallback ni tone-mapped pseudo-HDR), la metadata debe llevar **estos 3 valores exactos**:

| # | Atributo HLS | Valor numérico | Significado | Estándar |
|---|---|---|---|---|
| 1 | `COLOR-PRIMARIES` | **9** | BT.2020 color gamut | ITU-R BT.2020 |
| 2 | `TRANSFER-CHARACTERISTICS` | **16** | SMPTE ST.2084 / PQ | SMPTE ST 2084 / ITU-R BT.2100 |
| 3 | `MATRIX-COEFFICIENTS` | **9** | BT.2020 non-constant luminance | ITU-R BT.2020 |

### Variante HLG (alternativa)

| Atributo HLS | Valor PQ | Valor HLG |
|---|---|---|
| `TRANSFER-CHARACTERISTICS` | 16 (ST.2084) | **18** (ARIB STD-B67 / HLG) |
| `VIDEO-RANGE` | `PQ` | `HLG` |
| Otros | iguales | iguales |

---

## 2. Por qué EXACTAMENTE 9 / 16 / 9

Los valores son **enums del estándar ITU-T H.273** ("Coding-independent code points for video signal type identification"):

### COLOR-PRIMARIES (CICP §8.1)
| Valor | Color primaries | Uso típico |
|---|---|---|
| 1 | BT.709 | SDR HD |
| 6 | SMPTE 170M | SDR NTSC |
| 9 | **BT.2020** | UHD/HDR |
| 11 | DCI-P3 | cinema |
| 12 | Display P3 | Apple devices |

### TRANSFER-CHARACTERISTICS (CICP §8.2)
| Valor | Transfer function | Uso típico |
|---|---|---|
| 1 | BT.709 | SDR HD |
| 14 | BT.2020 10-bit | UHD SDR |
| 15 | BT.2020 12-bit | UHD SDR 12-bit |
| 16 | **SMPTE ST 2084 (PQ)** | HDR10/HDR10+ |
| 18 | ARIB STD-B67 (HLG) | broadcast HDR |

### MATRIX-COEFFICIENTS (CICP §8.3)
| Valor | Matrix | Uso típico |
|---|---|---|
| 1 | BT.709 | SDR HD |
| 6 | BT.601 | SDR SD |
| 9 | **BT.2020 NC** (non-constant luminance) | UHD/HDR |
| 10 | BT.2020 CL (constant luminance) | UHD rare |
| 14 | ICtCp | Dolby Vision Profile 8 |

### Por qué BT.2020 NC y no CL
- **NC (non-constant)** es estándar industria: HDR10, HDR10+ usan NC
- **CL (constant)** es teóricamente más eficiente pero rompe pipelines existentes
- **Default seguro = NC = matrix=9**

---

## 3. Emisión en HLS Master playlist

### Atributos `#EXT-X-STREAM-INF` (RFC 8216bis §4.4.6.2.1)

```m3u
#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0",FRAME-RATE=60,VIDEO-RANGE=PQ
```

**Importante:** `VIDEO-RANGE=PQ` es el atributo canónico HLS para indicar HDR10. Los players parsean esto y configuran el display.

### Atributos extendidos (no estándar HLS, pero usados en DASH MPD y CMAF)

```xml
<!-- DASH MPD AdaptationSet -->
<EssentialProperty schemeIdUri="urn:mpeg:mpegB:cicp:ColourPrimaries" value="9"/>
<EssentialProperty schemeIdUri="urn:mpeg:mpegB:cicp:TransferCharacteristics" value="16"/>
<EssentialProperty schemeIdUri="urn:mpeg:mpegB:cicp:MatrixCoefficients" value="9"/>
```

### CMAF / fMP4 — boxes obligatorias

| Box | Contenido | Función |
|---|---|---|
| `colr` (Colour Information) | `nclx`: colour_primaries=9, transfer_characteristics=16, matrix_coefficients=9, full_range_flag=0 | identifica color space dentro del init.mp4 |
| `mdcv` (Mastering Display Color Volume) | max_display_mastering_luminance, primaries XY coords | HDR10 mastering display info |
| `clli` (Content Light Level Info) | max_content_light_level (MaxCLL), max_pic_average_light_level (MaxFALL) | HDR10 metadata |

**Política:** estas boxes DEBEN preservarse a través del eslabón 5 (CMAF Proxy). Si el repackager fMP4 las strippea, el player no detecta HDR10.

---

## 4. SEI messages en stream HEVC (NAL units)

Aún si la metadata HLS+CMAF está correcta, el stream HEVC interno DEBE contener:

| SEI message | Función |
|---|---|
| `SEI_TYPE_MASTERING_DISPLAY_COLOUR_VOLUME` (137) | Mastering display info inline |
| `SEI_TYPE_CONTENT_LIGHT_LEVEL_INFO` (144) | MaxCLL / MaxFALL inline |
| `SEI_TYPE_ALTERNATIVE_TRANSFER_CHARACTERISTICS` (147) | HLG fallback signaling (HLG only) |

**Política:** estas SEI son emitidas por el encoder del provider. El toolkit NO genera SEI (solo passthrough). Si el provider NO emite SEI, el HDR podría no activarse en algunos panels strict.

---

## 5. Emisión sugerida en STREAM-INF (extended attributes)

El toolkit DEBE emitir `VIDEO-RANGE` (estándar HLS). Como **extensión propietaria opcional**, puede emitir:

```m3u
#EXT-X-APE-COLOR-METADATA:PRIMARIES=9,TRANSFER=16,MATRIX=9
```

Como tag NO-RFC, se ignora silenciosamente per `feedback_parsers_invisible_to_players`. Sirve solo para auditoría interna (Guardian/PRISMA/Cortex).

---

## 6. Validation matrix (per tier · cuándo emitir)

| Tier | Codec | VIDEO-RANGE | Color metadata trifecta | Notes |
|---|---|---|---|---|
| T1 | hvc1.2.4.L153.B0 | `PQ` | 9 / 16 / 9 | si probe = PQ |
| T1 | hvc1.2.4.L153.B0 | `HLG` | 9 / **18** / 9 | si probe = HLG |
| T2 | hvc1.2.4.L150.B0 | `PQ` / `HLG` | 9 / 16-18 / 9 | idem T1 |
| T3 | hvc1.2.4.L156.B0 | `PQ` | 9 / 16 / 9 | rare (4K@120) |
| T4 | hvc1.2.4.L123.B0 | `PQ` / `HLG` | 9 / 16-18 / 9 | 1080p HDR |
| T5 | hvc1.2.4.L120.B0 | `PQ` / `HLG` | 9 / 16-18 / 9 | 1080p HDR |
| T6 | hvc1.2.4.L93.B0 | `PQ` / `HLG` | 9 / 16-18 / 9 | 720p HDR |
| T7 | hvc1.1.6.L153.B0 | (omit) | omit | 4K SDR · BT.709 default |
| T8-T10 | hvc1.1.6.* | (omit) | omit | SDR · BT.709 |
| T11 | avc1.640028 | (omit) | omit | SDR H.264 BT.709 |

---

## 7. Probe → trifecta inference

Para evitar declarar HDR sin evidencia (per CLAUDE.md doctrine "Reglas Honestas"):

```python
def derive_video_range(probe):
    # Per CICP H.273 values
    if probe.transfer_characteristics == 16 and probe.color_primaries == 9:
        return "PQ"
    if probe.transfer_characteristics == 18 and probe.color_primaries == 9:
        return "HLG"
    if probe.has_mdcv_box() or probe.has_clli_box():
        return "PQ"  # implicit HDR10
    return None  # omit VIDEO-RANGE for SDR
```

Si `probe.video_range_inference == None`, NO emitir `VIDEO-RANGE` ni trifecta — emitir como SDR.

---

## 8. Player support matrix (trifecta interpretation)

| Player | VIDEO-RANGE=PQ | VIDEO-RANGE=HLG | colr/mdcv/clli boxes | SEI messages |
|---|---|---|---|---|
| OTT Nav Fire TV 4K Max | ✅ HDR10 | ✅ HLG | ✅ HW decoder | ✅ |
| TiviMate Onn 4K | ✅ | ✅ | ✅ | ✅ |
| hls.js Chrome (MSE) | ⚠ device-dep | ⚠ | ⚠ MSE limited | ⚠ |
| Shaka (Chrome) | ⚠ | ⚠ | ⚠ | ⚠ |
| VLC desktop | ✅ if HW | ✅ | ✅ | ✅ |
| AVPlayer iOS 14+ | ✅ | ✅ | ✅ | ✅ |
| ExoPlayer raw | ✅ if SoC HEVC L5.1+ | ✅ | ✅ | ✅ |

---

## 9. Anti-patterns (violación de la trifecta)

| Anti-pattern | Por qué fatal |
|---|---|
| `VIDEO-RANGE=PQ` sin probe evidence | Falso HDR · player puede rechazar manifest o mostrar tone-mapped artifact |
| `COLOR-PRIMARIES=1` (BT.709) con `TRANSFER=16` (PQ) | Inconsistencia · player decoder confunde gamut |
| `MATRIX=1` (BT.709) con tier HDR | Color shift (verdes saturados, skin tones wrong) |
| Strip `colr` box en CMAF repackaging | Player no detecta HDR aunque manifest lo declare |
| `VIDEO-RANGE=PQ` en tier 7-11 (8-bit SDR) | Inconsistencia codec vs range · BLOCK |

---

## 10. Validation gates

```python
def validate_hdr_emission(stream_inf):
    # Gate 1: VIDEO-RANGE consistency with codec
    if stream_inf.video_range in ['PQ', 'HLG']:
        if not stream_inf.codecs.startswith('hvc1.2.'):  # Main10
            return BLOCK("HDR range requires Main10 codec (hvc1.2.*)")

    # Gate 2: Trifecta presence (if PQ)
    if stream_inf.video_range == 'PQ':
        if not (stream_inf.color_primaries == 9 and
                stream_inf.transfer_characteristics == 16 and
                stream_inf.matrix_coefficients == 9):
            return WARN("PQ tier should emit trifecta 9/16/9 (extended)")

    # Gate 3: Probe evidence
    if stream_inf.video_range and not probe_confirmed_hdr(stream_inf):
        return BLOCK("VIDEO-RANGE without probe evidence — forbidden per CLAUDE.md")

    return PASS
```

---

## 11. Cross-references

- `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` — qué tiers requieren trifecta
- `ARTIFACT_CHAIN_OF_MANIFESTATION_11_ESLABONES.md` — qué eslabones la preservan
- `ARTIFACT_M3U8_VALIDATION_SPEC.md` §6 (CLAUDE.md "Reglas Honestas")
- ITU-T H.273 standard (CICP) — fuente de los valores 9 / 16 / 18
- ISO/IEC 14496-12 — fMP4 box structure (`colr`, `mdcv`, `clli`)
- Memory `feedback_parsers_invisible_to_players` — tags propietarios safe

---

**Fin HDR10 Metadata Trifecta · 9 / 16 / 9 · doctrina obligatoria.**
