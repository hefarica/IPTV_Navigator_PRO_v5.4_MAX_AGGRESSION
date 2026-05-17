# ARTIFACT — 8 BONDADES EMBEBIDAS (mandatory per generación .m3u8)

**Generated:** 2026-05-17
**Source:** User directive — PROMPT MAESTRO INGENIERO IPTV SUPREMO §III
**Authority:** All 13 specialists
**Status:** OBLIGATORIO end-to-end · cada generación las inyecta sin excepción

---

## 1. Las 8 bondades

| # | Bondad | Embebida en | Verifica con | Cross-artifact |
|---|---|---|---|---|
| 1 | **Cascada 11-tier** (Main 10 antes que 8-bit) | `m3u8-typed-arrays-ultimate.js` CODECS field | `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` | `iptv-hls-validator` skill |
| 2 | **HDR10 trifecta** (BT.2020 + PQ + Matrix=9) | STREAM-INF + CMAF colr box | `ARTIFACT_HDR10_METADATA_TRIFECTA.md` | S4 Color Scientist |
| 3 | **ABR inteligente** (BANDWIDTH peak + AVG + FRAME-RATE exacto) | STREAM-INF attributes | probe real measurements | S5 QoE Researcher |
| 4 | **LL-HLS para fluidez** (CAN-BLOCK-RELOAD + PART-HOLD-BACK + PART) | Media playlist LL-HLS | RFC 8216bis | S2 LL-HLS Engineer |
| 5 | **Buffer anti-stall** (TARGETDURATION + PLAYLIST-TYPE + GOP closed + IDR 2s) | Media playlist + encoder source | smoke test zap < 1s | S2 + S9 |
| 6 | **Audio multifluido lossless-ready** (CODECS incluye ec-3 / CHANNELS="16/JOC") | STREAM-INF + EXT-X-MEDIA AUDIO | per channel detection | S3 + S9 |
| 7 | **Subtítulos WebVTT forced** (EXT-X-MEDIA TYPE=SUBTITLES FORCED=YES) | EXT-X-MEDIA SUBTITLES section | provider availability | S1 + S9 |
| 8 | **Keep-Alive & Reconnect nativo** (Connection: keep-alive upstream + INDEPENDENT-SEGMENTS) | EXTHTTP headers + EXT-X-INDEPENDENT-SEGMENTS | nginx upstream config | S6 + S8 |

---

## 2. Bondad 1 — Cascada 11-tier

Authority: `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md`

**Resumen para embebido:**
```text
T1  hvc1.2.4.L153.B0  4K@60   10-bit HDR  ← CORONA
T2  hvc1.2.4.L150.B0  4K@30   10-bit HDR
T3  hvc1.2.4.L156.B0  4K@120  10-bit HDR  ← opcional
T4  hvc1.2.4.L123.B0  1080@60 10-bit HDR  ← nuevo
T5  hvc1.2.4.L120.B0  1080@30 10-bit HDR
T6  hvc1.2.4.L93.B0   720@30  10-bit HDR  ← último 10-bit
T7  hvc1.1.6.L153.B0  4K@60   8-bit  SDR
T8  hvc1.1.6.L150.B0  4K@30   8-bit  SDR
T9  hvc1.1.6.L120.B0  1080@30 8-bit  SDR
T10 hvc1.1.6.L93.B0   720@30  8-bit  SDR
T11 avc1.640028       1080@30 8-bit  SDR  ← fallback universal
```

Cada Master playlist DEBE emitir mínimo 3 tiers (top + mid + universal T11) para garantizar player selection.

---

## 3. Bondad 2 — HDR10 trifecta

Authority: `ARTIFACT_HDR10_METADATA_TRIFECTA.md`

**Inyección obligatoria en STREAM-INF tier HDR (T1-T6):**

```m3u
#EXT-X-STREAM-INF:BANDWIDTH=28000000,...,CODECS="hvc1.2.4.L153.B0",VIDEO-RANGE=PQ
```

**CMAF init.mp4 (eslabón 5) debe preservar:**
- `colr` box: nclx (colour_primaries=9, transfer_characteristics=16, matrix_coefficients=9, full_range_flag=0)
- `mdcv` box: mastering display color volume (XY primaries, max/min luminance)
- `clli` box: content light level info (MaxCLL, MaxFALL)

**Política honesta:** SOLO si probe confirmó HDR real del provider. Sin evidencia → emitir SDR.

---

## 4. Bondad 3 — ABR inteligente

**Atributos obligatorios per STREAM-INF:**

| Atributo | Source | Anti-pattern |
|---|---|---|
| `BANDWIDTH=<peak>` | probe.peak_segment_bandwidth | NO hardcoded · NO inflado |
| `AVERAGE-BANDWIDTH=<avg>` | probe.avg_segment_bandwidth | `AVG <= BANDWIDTH` siempre |
| `FRAME-RATE=<exact>` | probe.fps (29.970 / 59.940 / 23.976 / 25.000 / 50.000 / 60.000) | NO redondear (29.970 ≠ 30) |

**Bitrate floor recomendado por tier:** ver `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` §4.

**Player ABR algorithm hint (EXT-X-SESSION-DATA):**
```m3u
#EXT-X-SESSION-DATA:DATA-ID="com.ape.track_selection",VALUE="{\"bandwidthFraction\":0.65,\"maxDurationForQualityDecreaseMs\":2000,\"minDurationForQualityIncreaseMs\":15000}"
```

`bandwidthFraction=0.65` significa: el player selecciona el variant más alto cuyo BANDWIDTH ≤ 0.65 × ancho de banda observado. Headroom 35% absorbe oscilaciones.

---

## 5. Bondad 4 — LL-HLS para fluidez

**Solo en Media playlist real (NO en M3U Plus channel catalog):**

```m3u
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=3.0,CAN-SKIP-UNTIL=12.0
#EXT-X-PART-INF:PART-TARGET=0.33334
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part-3.mp4"
```

| Atributo | Valor user-prompt | Política toolkit |
|---|---|---|
| `PART-TARGET` | 0.33334 (1/3 segundo) | requiere Nginx blocking reload + provider con LL-HLS real |
| `PART-HOLD-BACK` | 3.0 | mínimo 3 × PART-TARGET |
| `CAN-SKIP-UNTIL` | 12.0 | playlist delta updates support |

**Gate:** SOLO emitir si:
1. Provider entrega segments < 2s con keyframe per part
2. Nginx upstream configurado con `proxy_request_buffering off` + `proxy_buffering off`
3. CDN HTTP/2 enabled

Si NO → omit LL-HLS tags, usar standard HLS.

---

## 6. Bondad 5 — Buffer anti-stall

**Inyección en Media playlist (standard HLS):**

```m3u
#EXT-X-TARGETDURATION:6
#EXT-X-PLAYLIST-TYPE:EVENT
#EXT-X-INDEPENDENT-SEGMENTS
```

**Inyección en Master playlist (per master prompt Disney+ parity):**

```m3u
#EXT-X-TARGETDURATION:2   ← Disney+ low-latency
#EXT-X-SESSION-DATA:DATA-ID="com.ape.load_control",VALUE="{\"bufferForPlaybackMs\":1000,\"maxBufferMs\":30000,\"bufferForPlaybackAfterRebufferMs\":2000}"
```

| Setting | Valor recomendado | Función |
|---|---|---|
| `TARGETDURATION` standard | 6 (standard) o 2 (LL-HLS) | match max EXTINF |
| `PLAYLIST-TYPE` | `EVENT` (live) o `VOD` (catch-up) | player behavior hint |
| `INDEPENDENT-SEGMENTS` | always | each segment decodable independently |
| `bufferForPlaybackMs` | 1000 | start playing after 1s buffered |
| `maxBufferMs` | 30000 | max buffer ahead |
| `bufferForPlaybackAfterRebufferMs` | 2000 | recovery after stall |

**Encoder source requirement:** GOP closed + IDR cada 2 segundos para zap < 1s.

---

## 7. Bondad 6 — Audio multifluido lossless-ready

**Inyección en STREAM-INF (codec audio inline):**

```m3u
#EXT-X-STREAM-INF:BANDWIDTH=28000000,CODECS="hvc1.2.4.L153.B0,ec-3",AUDIO="atmos-audio",...
```

**Inyección EXT-X-MEDIA AUDIO group:**

```m3u
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="atmos-audio",NAME="English Atmos",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="en",CHANNELS="16/JOC",URI="audio-atmos.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="standard-audio",NAME="English Stereo",DEFAULT=NO,LANGUAGE="en",CHANNELS="2",URI="audio-stereo.m3u8"
```

| Codec string | Container | Meaning |
|---|---|---|
| `mp4a.40.2` | AAC-LC | universal baseline |
| `mp4a.40.5` | HE-AAC v1 | low bitrate |
| `ac-3` | Dolby Digital | 5.1 surround |
| `ec-3` | Dolby Digital Plus | 5.1/7.1 + Atmos JOC |
| `ac-4` | Dolby AC-4 | next-gen broadcast |

**CHANNELS attribute:**
- `"2"` — stereo
- `"6"` — 5.1
- `"8"` — 7.1
- `"16/JOC"` — Atmos Joint Object Coding (Dolby Atmos signaling)

**Política honesta:** SOLO emitir `ec-3` + `16/JOC` si provider entrega real EC-3 con JOC objects. Sin evidencia → `mp4a.40.2` AAC-LC standard.

---

## 8. Bondad 7 — Subtítulos WebVTT forced

**Inyección EXT-X-MEDIA SUBTITLES group:**

```m3u
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English Forced",DEFAULT=NO,AUTOSELECT=YES,FORCED=YES,LANGUAGE="en",URI="subtitles-en-forced.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Spanish",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="es",URI="subtitles-es.m3u8"
```

**STREAM-INF reference:**

```m3u
#EXT-X-STREAM-INF:BANDWIDTH=28000000,CODECS="hvc1.2.4.L153.B0,ec-3,wvtt",SUBTITLES="subs",...
```

| Atributo | Función |
|---|---|
| `FORCED=YES` | siempre mostrar (para foreign dialogue en película en idioma del usuario) |
| `FORCED=NO` | usuario activa manualmente |
| `DEFAULT=YES` | seleccionado al inicio |
| `AUTOSELECT=YES` | player puede elegir auto basado en language preference |

**Política:** SOLO emitir si provider entrega WebVTT real. Sin evidencia → omit subtitles section.

---

## 9. Bondad 8 — Keep-Alive & Reconnect nativo

**EXTHTTP headers per channel:**

```json
{
  "Connection": "keep-alive",
  "User-Agent": "...",
  "Accept": "...",
  "Accept-Encoding": "identity"
}
```

⚠ Per `feedback_okhttp_single_value_headers`: `Connection` debe ser **single-value** (no 4-layer comma-separated) para OkHttp Android.

**Master playlist hint:**

```m3u
#EXT-X-INDEPENDENT-SEGMENTS
```

Indica al player que cada segment es decodable independientemente — facilita reconnect rápido sin re-buffering.

**Upstream nginx config (eslabón 3):**

```nginx
upstream xtream_provider {
    server provider.host.tld:80;
    keepalive 1;           # min · prevent session bleed
    keepalive_requests 100;
    keepalive_timeout 60s;
}
```

`keepalive 1` es crítico para Xtream providers con `max_connections=1` per `reference_xtream_slot_protection`.

---

## 10. Validation gate (per generación)

```python
def validate_8_bondades(playlist):
    issues = []

    # Bondad 1: tier in cascade
    for variant in playlist.variants:
        if variant.codecs not in DEFINITIVE_11_TIER_SET and not is_marker_preferred(variant):
            issues.append(("B1", variant, "codec not in 11-tier"))

    # Bondad 2: HDR trifecta consistency
    for variant in playlist.variants:
        if variant.video_range in ['PQ', 'HLG']:
            if not is_main10_codec(variant.codecs):
                issues.append(("B2", variant, "HDR range with non-Main10 codec"))

    # Bondad 3: ABR attributes
    for variant in playlist.variants:
        if not variant.has(['BANDWIDTH', 'AVERAGE-BANDWIDTH', 'FRAME-RATE']):
            issues.append(("B3", variant, "missing ABR attributes"))
        if variant.avg_bw > variant.bw:
            issues.append(("B3", variant, "AVERAGE-BANDWIDTH > BANDWIDTH (RFC violation)"))

    # Bondad 4: LL-HLS placement
    if playlist.has_part_tags() and playlist.type == M3U_PLUS:
        issues.append(("B4", None, "LL-HLS in M3U Plus catalog forbidden"))

    # Bondad 5: anti-stall
    if playlist.type == MEDIA and not playlist.has('EXT-X-TARGETDURATION'):
        issues.append(("B5", None, "Media playlist without TARGETDURATION"))

    # Bondad 6: audio codec consistency
    for variant in playlist.variants:
        if 'ec-3' in variant.codecs and not provider_supports_ec3(variant):
            issues.append(("B6", variant, "ec-3 declared without provider evidence"))

    # Bondad 7: subtitles optional (no block)
    # (informational only)

    # Bondad 8: Keep-Alive
    for ch in playlist.channels:
        if 'Connection' in ch.exthttp and is_multi_value(ch.exthttp['Connection']):
            issues.append(("B8", ch, "Connection must be single-value (OkHttp)"))

    return issues
```

---

## 11. Acceptance gates (GO / WARN / BLOCK)

| Bondad | CRITICAL | WARN | INFO |
|---|---|---|---|
| B1 Cascade | tier desconocido sin marker | menos de 3 tiers en Master | falta T11 universal |
| B2 HDR | range sin probe evidence | Main10 sin trifecta | trifecta sin extended attrs |
| B3 ABR | AVG > BANDWIDTH | FRAME-RATE redondeado | bitrate floor no respetado |
| B4 LL-HLS | tags en M3U Plus catalog | PART-HOLD-BACK < 3×PART-TARGET | PRELOAD-HINT ausente |
| B5 Anti-stall | Media sin TARGETDURATION | TARGETDURATION inconsistente con max EXTINF | INDEPENDENT-SEGMENTS ausente |
| B6 Audio | declaración ec-3 falsa | CHANNELS no match codec | audio group sin DEFAULT=YES |
| B7 Subtitles | URI inválido | FORCED=YES sin language | subtitles group sin AUTOSELECT |
| B8 Keep-Alive | Connection multi-value | upstream sin keepalive | INDEPENDENT-SEGMENTS ausente |

---

## 12. Cross-references

- `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` — Bondad 1
- `ARTIFACT_HDR10_METADATA_TRIFECTA.md` — Bondad 2
- `ARTIFACT_M3U8_VALIDATION_SPEC.md` §7-10 — Bondades 3-5
- `ARTIFACT_CHAIN_OF_MANIFESTATION_11_ESLABONES.md` — propagación end-to-end
- `ARTIFACT_PLAYER_COMPATIBILITY_MATRIX.md` — per-player support
- `ARTIFACT_SECURITY_HEADERS_MATRIX.md` — Bondad 8 keep-alive policy
- `ARTIFACT_TAG_PARSING_GUARANTEE.md` — universal RFC 8216 §6.3.1 graceful ignore

---

**Fin 8 Bondades Embebidas · obligatorio per generación.**
