# R5 · Auditoría de política 4K/8K de LAS DOS listas (I5)

**Tarea:** `t17` (I5) · **Autor:** `codec-hdr-scientist` (S3+S4) · **Fecha:** 2026-10-30
**Motor:** `ara-x/policy/policy_engine.js` (spec `ara-x-codec-policy.v1`, 30 reglas) · **Validador:** `ara-x/scripts/policy/validate_catalog.js`
**Salidas:** `policy_findings.json` (A) · `policy_findings_cdn.json` (B) · este reporte.

Sin red, sin VPS, sin device. Las capturas se abren en **solo lectura**; ninguna URL completa se guarda (solo muestras enmascaradas).

## 1 · Resumen por lista

| Métrica | A · APE_LISTA_4K (local) | B · APE_LISTA_CDN (CDN) |
|---|---|---|
| Bytes | 572.170.477 | 568.241.457 |
| sha256 | `E27C03EB45DACD6E…` | `81DBDD11EC620B1D…` |
| Líneas | 10.169.562 | 10.139.240 |
| Tiempo de auditoría | 8676 ms | 17227 ms |
| Canales (#EXTINF) | 10.631 | 10.631 |
| #EXT-X-STREAM-INF | 10.631 | 10.586 |
| Variantes clasificadas | 10.631 (100 %) | 10.586 (100 %) |
| Cobertura | 100 % | 100 % |
| VIOLATION / WARN / PASS / NO_VARIANT | 10631 / 0 / 0 / 0 | 10586 / 0 / 0 / 45 |
| Canales sin variante | 0 | 45 |
| 8KFAKE | 10.631 | 808 |
| EXT-X-PART / EXT-X-MAP | 0 / 0 | 0 / 0 |
| I-FRAME sin URI | 10.631 | 10.631 |
| EXT-X-START (duplicado) | 2 | 2 |
| tvg-name duplicados (grupos/dup) | 105 / 108 | 105 / 108 |
| SID duplicados (grupos) | 1 | 1 |

## 2 · Cuantificación del contrato (medida, no hardcodeada)

| Métrica | Esperado (R1/R2) | A · APE_LISTA_4K (local) | B · APE_LISTA_CDN (CDN) |
|---|---|---|---|
| `fz01_avc_with_hvc1` | 9.593 | 9593 | 9548 |
| `hvc1_pq_over_avc` | 9.593 | 9593 | 9548 |
| `fake_cmaf` | 10.631 | 10631 | 10586 |
| `fake_lcevc` | 10.631 | 10631 | 10586 |
| `fake_dv` | 10.631 | 10631 | 10586 |
| `ai_sr_not_scoped` | 10.631 | 10631 | 10586 |
| `pq_public_sdr_inband` | 9.823 | 9823 | 9778 |
| `hdr_metadata_impossible` | 9.823 | 9823 | 9778 |
| `frame_rate_overclaim` | 10.503 | 10503 | 10458 |
| `fourk_9_15_avc` | 9.548 | 9548 | 9548 |
| `blanket_4k_without_marker` | 9.823 | 9823 | 9778 |
| `declared_4k_below_28mbps` | 9.778 | 9778 | 9778 |
| `channels_without_variant` | 45 (B) | 0 | 45 |
| `eight_k_marker_absent` | — | 0 | 9778 |
| `level_public_under` | 0 | 0 | 0 |
| `level_hint_under` | 2.565 | 2565 | 2565 |
| `wire_8k` | 0 | 0 | 0 |
| `codec_verified_true` | 0 | 0 | 0 |
| `supplemental_present` | 0 | 0 | 0 |
| `cmaf_malformed_codecs` | 10.631 | 10631 | 10586 |
| `vlc_knobs_8k120` | 10.631 | 10631 | 10586 |
| `fps_conflict` | ≥1.186 | 10631 | 10586 |
| `missing_codec_evidence` | 45 (A) | 45 | 0 |

## 3 · Hallazgos por regla (ambas listas)

| Regla | Severidad | Hallazgo | A · APE_LISTA_4K (local) | B · APE_LISTA_CDN (CDN) | Fix |
|---|---|---|---|---|---|
| `I5-R02H` | medium | Hint de nivel por debajo de la resolucion declarada | 2565 | 2565 | Alinear CODEC-PREFERRED con la resolucion in-band o no promoverlo a CODECS publico. |
| `I5-R03` | critical | FZ-01: familia AVC con CODECS hvc1 publico | 9593 | 9548 | Publicar avc1.640033 (4K<=30fps) / avc1.64002A (1080p>=50) / avc1.640028, o exigir cascade_type verificado. |
| `I5-R04` | critical | FZ-01 agravado: hvc1 + VIDEO-RANGE=PQ sobre fuente AVC | 9593 | 9548 | Codec veraz y, si se mantiene PQ como intencion, marcador HDR-INTENT con VERIFIED=0. |
| `I5-R05` | high | CMAF ficticio (contenedor mpegts / sin EXT-X-MAP) | 10631 | 10586 | Retirar el claim CMAF o declarar LL-HLS sobre TS; CMAF exige fMP4 + EXT-X-MAP real. |
| `I5-R06` | high | LCEVC anunciado sin capa en el bitstream | 10631 | 10586 | Eliminar LCEVC o marcarlo SYNTHETIC=1;SCOPE=DEVICE;PIXELS=0 (no es procesamiento del VPS). |
| `I5-R07` | high | Dolby Vision anunciado sin codec DV | 10631 | 10586 | Exigir dvh1.08.* en CODECS/SUPPLEMENTAL + BL HEVC; si no, retirar DV. |
| `I5-R08` | medium | AI-SR/AI-FI sin scope de device | 10631 | 10586 | Marcar SCOPE=DEVICE;PIXELS=0 o retirar; el VPS no procesa pixeles. |
| `I5-R09` | medium | PQ publico sobre fuente SDR sin marcador de intencion | 9823 | 9778 | Anadir #EXT-X-APE-HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0. |
| `I5-R10` | high | Metadata HDR fisicamente imposible (MaxFALL > MaxCLL / AVG > PEAK) | 9823 | 9778 | MaxFALL <= MaxCLL y AVG <= PEAK; corregir a min(). |
| `I5-R11` | medium | FRAME-RATE declarado por encima del fps medido | 10503 | 10458 | FRAME-RATE = fps medido (o declarado si no hay medido); el target de display va en marcador. |
| `I5-R12` | medium | 4K declarado con bitrate 9-15 Mbps y familia AVC | 9548 | 9548 | No declarar 4K real; mantener 4K solo como presentacion marcada y codec veraz. |
| `I5-R13` | low | CODECS malformado en el tag CMAF (coma final) | 10631 | 10586 | Emitir lista de codecs RFC 6381 sin elementos vacios. |
| `I5-R14` | high | Knobs de player empujan 8K/120 sobre decoder 4K@60 | 10631 | 10586 | Clamp adaptive-maxwidth<=3840, adaptive-maxheight<=2160, video_vrr_max<=60, minterpolate fps<=60. |
| `I5-R15` | low | FPS declarado multiple y contradictorio | 10631 | 10586 | Un solo FPS por canal coherente en EXTINF, STREAM-INF, EXTVLCOPT y EXTHTTP. |
| `I5-R16` | high | EXT-X-I-FRAME-STREAM-INF sin URI | 1 | 1 | Emitir URI real o retirar el tag (RFC 8216 §4.3.4.3). |
| `I5-R17` | high | Gramatica HLS hibrida (Master + Media + Media Segment) | 1 | 1 | No anadir gramatica: la lista es M3U Plus; separar tipos o retirar tags media-only. |
| `I5-R18` | high | LL-HLS declarado e inexistente (0 EXT-X-PART, PART-HOLD-BACK < 3x) | 1 | 1 | Retirar LL-HLS o emitir PART reales con PART-HOLD-BACK >= 3x PART-TARGET. |
| `I5-R19` | medium | EXT-X-START duplicado con offsets contradictorios | 1 | 1 | Una sola declaracion EXT-X-START por archivo. |
| `I5-R20` | medium | Footer VALIDATED con errors=0 no confiable | 1 | 1 | Contar channels_without_variant y missing_uri como warnings; no declarar errors=0 en falso. |
| `I5-R21` | low | tvg-name duplicados | 1 | 1 | Hacer unicos tvg-name (o declarar alias por tvg-id). |
| `I5-R22` | low | SID de idempotencia duplicado | 1 | 1 | Semilla/ID unica por generacion. |
| `I5-R23` | high | 4K declarado sobre fuente in-band <4K sin marcador de presentacion | 9823 | 9778 | Anadir #EXT-X-APE-UPSCALE:declared=3840x2160;codec=truthful;src=<WxH>;can8k=0. |
| `I5-R24` | medium | Canal sin EXT-X-STREAM-INF | 0 | 45 | Emitir variante veraz (codec real) o dejar F5; contar channels_without_variant. |
| `I5-R25` | low | Marcador 8KFAKE ausente en canal con wire 4K | 0 | 9778 | Emitir #EXT-X-APE-8KFAKE:ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY de forma consistente entre generaciones. |
| `I5-R28` | medium | Transfer declarado contradictorio (BT1886 SDR vs TRANSFER=16 PQ) | 10586 | 10586 | Coherencia CICP: PQ => TRANSFER-CHARACTERISTICS=16 y APE-HDR-TRANSFER=PQ; SDR => BT1886 y no PQ. |
| `I5-R31` | medium | Canal sin evidencia de codec (CODEC-PREFERRED/VERIFIED) | 45 | 0 | Emitir evidencia o marcar NO_CODEC_DECLARED de forma explicita. |

## 4 · Qué cambiaría con la política D2 (`proposed_wire`)

| Lista | Codecs propuestos (top) | Resoluciones | Modos |
|---|---|---|---|
| A · APE_LISTA_4K (local) | `avc1.640033`×8913 · `hvc1.2.4.L150.B0`×894 · `avc1.640028`×410 · `avc1.64002A`×270 · `hvc1.2.4.L153.B0`×144 | 3840x2160×9951 · 1280x720×410 · 1920x1080×270 | TRUTHFUL_SIGNAL×10631 |
| B · APE_LISTA_CDN (CDN) | `avc1.640033`×8868 · `hvc1.2.4.L150.B0`×894 · `avc1.640028`×410 · `avc1.64002A`×270 · `hvc1.2.4.L153.B0`×144 | 3840x2160×9906 · 1280x720×410 · 1920x1080×270 | TRUTHFUL_SIGNAL×10586 |

## 5 · Hallazgos de archivo

### A · APE_LISTA_4K (local)

- **I5-R16** (high, línea 1060): iframe_without_uri=10631 — _Emitir URI real o retirar el tag (RFC 8216 §4.3.4.3)._
- **I5-R17** (high, línea 1): master+media+segment — _No anadir gramatica: la lista es M3U Plus; separar tipos o retirar tags media-only._
- **I5-R18** (high, línea 1): part_hold_back=1 part_target=1 parts=0 — _Retirar LL-HLS o emitir PART reales con PART-HOLD-BACK >= 3x PART-TARGET._
- **I5-R19** (medium, línea 57): start_count=2 — _Una sola declaracion EXT-X-START por archivo._
- **I5-R20** (medium, línea 1): footer_errors=0 channels_without_variant=0 — _Contar channels_without_variant y missing_uri como warnings; no declarar errors=0 en falso._
- **I5-R21** (low, línea 1): dup_name_groups=105 duplicates=108 — _Hacer unicos tvg-name (o declarar alias por tvg-id)._
- **I5-R22** (low, línea 1): dup_sid_groups=1 — _Semilla/ID unica por generacion._

### B · APE_LISTA_CDN (CDN)

- **I5-R16** (high, línea 1060): iframe_without_uri=10631 — _Emitir URI real o retirar el tag (RFC 8216 §4.3.4.3)._
- **I5-R17** (high, línea 1): master+media+segment — _No anadir gramatica: la lista es M3U Plus; separar tipos o retirar tags media-only._
- **I5-R18** (high, línea 1): part_hold_back=1 part_target=1 parts=0 — _Retirar LL-HLS o emitir PART reales con PART-HOLD-BACK >= 3x PART-TARGET._
- **I5-R19** (medium, línea 57): start_count=2 — _Una sola declaracion EXT-X-START por archivo._
- **I5-R20** (medium, línea 1): footer_errors=0 channels_without_variant=45 — _Contar channels_without_variant y missing_uri como warnings; no declarar errors=0 en falso._
- **I5-R21** (low, línea 1): dup_name_groups=105 duplicates=108 — _Hacer unicos tvg-name (o declarar alias por tvg-id)._
- **I5-R22** (low, línea 1): dup_sid_groups=1 — _Semilla/ID unica por generacion._

## 6 · Muestras enmascaradas

- A · APE_LISTA_4K (local): `https://iptv-ape.duckdns.org/<masked-path:48>`
- B · APE_LISTA_CDN (CDN): `https://iptv-ape.duckdns.org/<masked-path:48>`

Ninguna muestra contiene user/pass, query ni token: el enmascarado conserva solo esquema, host y longitud del path.

## 7 · Método y verificación

```
node --check ara-x/policy/policy_engine.js
node --test ara-x/tests/policy.test.js
node ara-x/scripts/policy/validate_catalog.js --all
```

- El parser es streaming (una pasada para clasificar; una segunda solo para sha256).
- Cada `#EXT-X-STREAM-INF` se clasifica con el motor D2 (`TRUTHFUL_SIGNAL`, piso 4K como testigo, 8K presentación, FPS-first) y las reglas R1/R2.
- `variants[]` enumera las 10.631 variantes (A) / 10.586 + 45 sin variante (B) con línea, tvg-id, clase y reglas.
- `occurrences` enumera cada ocurrencia por regla en arrays paralelos `lines[]` + `tvg_ids[]`; `rules` da severidad y fix.
- Footer `VALIDATED … errors=0` se contrasta con la realidad medida (R1-F12).

