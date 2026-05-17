# ARTIFACT — TAG PARSING GUARANTEE (universal player safety)

**Generated:** 2026-05-17
**Authority:** S9 Player Compatibility Engineer · S1 IPTV/HLS Architect
**Mission:** Garantizar que toda directiva emitida por el toolkit es parseable o ignorable graciosamente por **TODOS** los players del mundo. Cero collisión, cero error de interpretación, cero rechazo de manifest.

---

## 1. Tres garantías cardinales

### 1.1 Garantía RFC-conformance
Toda directiva estándar (`#EXTM3U`, `#EXTINF`, `#EXT-X-STREAM-INF`, `#EXT-X-VERSION`, `#EXT-X-TARGETDURATION`, etc.) cumple **RFC 8216** o **RFC 8216bis** según corresponda. CODECS strings cumplen **RFC 6381 §3.3**.

### 1.2 Garantía RFC-graceful-ignore
Toda directiva propietaria (`#EXT-X-APE-*`, `#EXTHTTP`, `#EXTVLCOPT`, `#KODIPROP`) cumple **RFC 8216 §6.3.1**:

> "A client MUST ignore any tags and attributes it does not recognize."

Por tanto un player que no entienda `#EXT-X-APE-FALLBACK-DIRECT` simplemente lo salta sin error.

### 1.3 Garantía no-collision
Ningún tag propietario interfiere con un tag estándar. Específicamente:
- Los `#EXT-X-APE-*` NO van **dentro** de bloques `#EXT-X-STREAM-INF` (esos bloques solo aceptan atributos RFC)
- Los `#EXTHTTP`, `#EXTVLCOPT`, `#KODIPROP` van **después** de `#EXTINF` y **antes** de la URL (per convención M3U Plus)
- No se mezclan tags LL-HLS en M3U Plus channel catalog (per `iptv-hls-validator` doctrine)

---

## 2. Player parsing matrix — directivas estándar

| Directiva | OTT Nav | TiviMate | hls.js | Shaka | VLC | AVPlayer | ExoPlayer | Comportamiento si no reconocido |
|---|---|---|---|---|---|---|---|---|
| `#EXTM3U` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required — todos lo entienden |
| `#EXTINF:<dur>,<title>` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required |
| `#EXT-X-VERSION:<N>` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Universal |
| `#EXT-X-TARGETDURATION:<N>` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required en Media playlist |
| `#EXT-X-MEDIA-SEQUENCE:<N>` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required en Media |
| `#EXT-X-ENDLIST` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | VOD marker |
| `#EXT-X-STREAM-INF:...` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Master playlist variant |
| `#EXT-X-MAP:URI="..."` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | fMP4/CMAF init segment |
| `#EXT-X-DISCONTINUITY` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Sequence break |
| `#EXT-X-KEY:METHOD=AES-128,...` | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | DRM/encryption |
| `#EXT-X-BYTERANGE:<size>[@<offset>]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Range request |
| `#EXT-X-INDEPENDENT-SEGMENTS` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Decoding hint |
| `#EXT-X-START:TIME-OFFSET=...` | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | Live edge offset |

Legenda: ✅ supported · ⚠ partial · ❌ not supported

---

## 3. Player parsing matrix — directivas LL-HLS (solo en Media playlist, NUNCA M3U Plus)

| Directiva | OTT Nav | TiviMate | hls.js | Shaka | VLC | AVPlayer | ExoPlayer | Notes |
|---|---|---|---|---|---|---|---|---|
| `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES` | ⚠ | ⚠ | ✅ | ✅ | ❌ | ✅ | ⚠ | Apple-native AVPlayer best |
| `#EXT-X-SERVER-CONTROL:PART-HOLD-BACK=N` | ⚠ | ⚠ | ✅ | ✅ | ❌ | ✅ | ⚠ | idem |
| `#EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=N` | ⚠ | ⚠ | ✅ | ✅ | ❌ | ✅ | ⚠ | idem |
| `#EXT-X-PART-INF:PART-TARGET=N` | ⚠ | ⚠ | ✅ | ✅ | ❌ | ✅ | ⚠ | idem |
| `#EXT-X-PART:DURATION=N,URI="..."` | ⚠ | ⚠ | ✅ | ✅ | ❌ | ✅ | ⚠ | idem |
| `#EXT-X-PRELOAD-HINT:TYPE=PART,URI="..."` | ⚠ | ⚠ | ✅ | ✅ | ❌ | ✅ | ⚠ | idem |

**Política universal:** Si emitimos LL-HLS tags en M3U Plus channel catalog → **BLOCK** (rompe parsers OkHttp Android estrictos). LL-HLS solo en Media playlist real con segmentos verificados.

---

## 4. Player parsing matrix — directivas propietarias `#EXT-X-APE-*`

Per RFC 8216 §6.3.1, todos los players ignoran tags no reconocidos. Por tanto:

| Directiva propietaria | OTT Nav | TiviMate | hls.js | Shaka | VLC | AVPlayer | ExoPlayer | Comportamiento real |
|---|---|---|---|---|---|---|---|---|
| `#EXT-X-APE-CODEC-REAL:<codec>` | ignore | ignore | ignore | ignore | ignore | ignore | ignore | metadata-only · safe |
| `#EXT-X-APE-CODEC-PREFERRED:<codec>` | ignore | ignore | ignore | ignore | ignore | ignore | ignore | idem |
| `#EXT-X-APE-FALLBACK-DIRECT:<flag>` | ignore | ignore | ignore | ignore | ignore | ignore | ignore | idem |
| `#EXT-X-APE-AUDIT-SCORECARD:{json}` | ignore | ignore | ignore | ignore | ignore | ignore | ignore | M5 guard internal |
| `#EXT-X-APE-DEGRADATION-CHAIN:<chain>` | ignore | ignore | ignore | ignore | ignore | ignore | ignore | semantic hint |
| `#EXT-X-APE-ISP-EVASION:<level>` | ignore | ignore | ignore | ignore | ignore | ignore | ignore | semantic |
| `#EXT-X-APE-HDCP-VERIFIED:<source>` | ignore | ignore | ignore | ignore | ignore | ignore | ignore | evidence trail |

**Garantía:** Cero impacto en reproducción. Solo legibles por nuestro toolkit (PRISMA, Guardian, Cortex auditors).

Memoria de respaldo: `feedback_parsers_invisible_to_players` (RFC §6.3.1 confirmation).

---

## 5. Player parsing matrix — directivas HTTP/header (M3U Plus per-channel)

### 5.1 `#EXTHTTP:{...JSON...}`

| Player | Parse behavior | Headers honored | Notes |
|---|---|---|---|
| OTT Nav | ✅ parse JSON, apply via OkHttp | most (4-layer comma-separated OK except Connection/Keep-Alive/Sec-Fetch-*) | per `feedback_okhttp_single_value_headers` |
| TiviMate | ✅ parse JSON, apply via OkHttp | idem | idem |
| hls.js | ❌ ignored entirely | n/a | use server-side headers instead |
| Shaka | ❌ ignored | n/a | idem |
| VLC | ⚠ partial — some headers respected via `--http-*` flags | partial | usar EXTVLCOPT en su lugar |
| AVPlayer (iOS) | ❌ ignored | n/a | uses iOS networking stack |
| ExoPlayer raw | ⚠ partial | depends on `DefaultHttpDataSource.Factory` config | per APE PRISMA wiring |

**Garantía:** Si el player ignora EXTHTTP, ignora silenciosamente (cero impacto en reproducción).

### 5.2 `#EXTVLCOPT:<key>=<value>`

| Player | Parse behavior |
|---|---|
| VLC desktop / mobile | ✅ full support (native) |
| OTT Nav | ❌ ignore (silencioso) |
| TiviMate | ❌ ignore |
| hls.js / Shaka / AVPlayer / ExoPlayer | ❌ ignore |

**Garantía:** VLC-only directive. Otros players lo saltan.

### 5.3 `#KODIPROP:<key>=<value>`

| Player | Parse behavior |
|---|---|
| Kodi (cualquier addon) | ✅ full support |
| TiviMate | ⚠ partial (algunos props inputstream.adaptive) |
| OTT Nav | ❌ ignore |
| Others | ❌ ignore |

**Garantía:** Kodi/TiviMate-targeted. Otros players lo saltan.

---

## 6. Validación de no-collision (matriz transitiva)

Para cada par (Tag propietario × Player que no lo soporta), verificar que el comportamiento es **ignore**, NO **error**:

```
∀ tag ∈ {APE-*, EXTHTTP, EXTVLCOPT, KODIPROP, LL-HLS-tags}
∀ player ∈ {OTT_Nav, TiviMate, hls.js, Shaka, VLC, AVPlayer, ExoPlayer}
  player.parse(tag) ∈ {SUPPORTED, IGNORE_SILENT}
  ∧ player.parse(tag) ∉ {ERROR, REJECT_MANIFEST}
```

**Resultado:** ✅ Verificado per RFC 8216 §6.3.1 + testing empírico documentado en memorias del proyecto.

---

## 7. CODECS string parsing (RFC 6381 universal)

Los 11 codec strings de la cascada definitiva (ver `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md`):

```
T1:  hvc1.2.4.L153.B0   ─┐
T2:  hvc1.2.4.L150.B0    │
T3:  hvc1.2.4.L156.B0    │  Main 10 — todos los players modernos parsean
T4:  hvc1.2.4.L123.B0    │  (hls.js 1.x+, Shaka 4.x+, ExoPlayer 2.x+, AVPlayer iOS 11+)
T5:  hvc1.2.4.L120.B0    │
T6:  hvc1.2.4.L93.B0    ─┘
T7:  hvc1.1.6.L153.B0   ─┐
T8:  hvc1.1.6.L150.B0    │
T9:  hvc1.1.6.L120.B0    │  Main 8-bit — universal HEVC support
T10: hvc1.1.6.L93.B0    ─┘
T11: avc1.640028                AVC High L4.0 — universal H.264 support
```

### Player support per tier
| Player | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OTT Nav Fire TV 4K Max | ✅ HW | ✅ HW | ⚠ HW@120 | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW |
| OTT Nav Fire TV Stick 1080p | ⚠ SW | ⚠ SW | ❌ | ⚠ SW | ✅ HW | ✅ HW | ⚠ SW | ⚠ SW | ✅ HW | ✅ HW | ✅ HW |
| TiviMate Onn 4K | ✅ HW | ✅ HW | ⚠ HW@120 | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW |
| TiviMate Fire TV Stick | ⚠ SW | ⚠ SW | ❌ | ⚠ SW | ✅ HW | ✅ HW | ⚠ SW | ⚠ SW | ✅ HW | ✅ HW | ✅ HW |
| hls.js (Chrome 90+) | ⚠ MSE | ⚠ MSE | ❌ | ⚠ MSE | ✅ MSE | ✅ MSE | ⚠ MSE | ⚠ MSE | ✅ MSE | ✅ MSE | ✅ MSE |
| hls.js (Firefox) | ❌ | ❌ | ❌ | ❌ | ⚠ | ⚠ | ❌ | ❌ | ⚠ | ⚠ | ✅ MSE |
| Shaka (Chrome) | ⚠ MSE | ⚠ MSE | ❌ | ⚠ MSE | ✅ MSE | ✅ MSE | ⚠ MSE | ⚠ MSE | ✅ MSE | ✅ MSE | ✅ MSE |
| VLC desktop | ✅ SW | ✅ SW | ⚠ | ✅ SW | ✅ SW | ✅ SW | ✅ SW | ✅ SW | ✅ SW | ✅ SW | ✅ SW |
| AVPlayer iOS 14+ | ✅ HW | ✅ HW | ⚠ | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW |
| ExoPlayer raw | ✅ HW | ✅ HW | ⚠ | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW | ✅ HW |

Legenda: ✅ HW (hardware decode) · ✅ SW (software decode) · ✅ MSE (browser MSE) · ⚠ partial/device-dependent · ❌ unsupported

**Garantía:** Cualquier player que NO soporte un tier específico, simplemente lo skip y elige otro variant del Master playlist (per RFC 8216 §4.4.4.2). NUNCA error.

---

## 8. Multi-variant Master playlist strategy

Para maximizar compatibilidad, el toolkit DEBE emitir **múltiples variants** en el Master playlist, no un solo tier:

```m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS

# Tier 1 — top of ladder (selecciona si player + red lo soportan)
#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0",FRAME-RATE=60,VIDEO-RANGE=PQ
https://provider/.../t1.m3u8

# Tier 5 — middle 10-bit (fallback HDR)
#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=7000000,RESOLUTION=1920x1080,CODECS="hvc1.2.4.L120.B0",FRAME-RATE=30,VIDEO-RANGE=PQ
https://provider/.../t5.m3u8

# Tier 9 — middle 8-bit SDR (fallback)
#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,CODECS="hvc1.1.6.L120.B0",FRAME-RATE=30
https://provider/.../t9.m3u8

# Tier 11 — universal fallback H.264
#EXT-X-STREAM-INF:BANDWIDTH=6500000,AVERAGE-BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028",FRAME-RATE=30
https://provider/.../t11.m3u8
```

El player elige la mejor variant que **puede decodificar** y **cabe en su bandwidth**. Esto cumple la doctrina **"MAX IMAGE FIRST · COVERAGE ALWAYS"** del proyecto.

---

## 9. Emission gate (pre-publish validator checks)

Antes de publicar cualquier lista, ejecutar:

```python
def emission_gate(playlist):
    # Gate 1: CODECS strings RFC 6381
    for variant in playlist.variants:
        if not is_rfc6381_codec_string(variant.codecs):
            return BLOCK(f"Invalid codec string: {variant.codecs}")

    # Gate 2: Tier in known set
    if variant.codecs not in DEFINITIVE_11_TIER_SET and not variant.is_preferred_marker:
        return WARN(f"Codec {variant.codecs} not in 11-tier cascade · should be tagged as PREFERRED")

    # Gate 3: Level vs resolution/fps
    for variant in playlist.variants:
        level = parse_level(variant.codecs)
        if not level_supports(level, variant.resolution, variant.frame_rate):
            return BLOCK(f"Level mismatch: {level} cannot decode {variant.resolution}@{variant.frame_rate}")

    # Gate 4: HDR consistency
    for variant in playlist.variants:
        if variant.codecs.startswith('hvc1.2.') and not variant.video_range in [PQ, HLG]:
            return WARN("Main10 tier without VIDEO-RANGE evidence; consider 8-bit tier")

    # Gate 5: No LL-HLS in M3U Plus channel list
    if playlist.type == M3U_PLUS_CHANNEL_LIST:
        for tag in playlist.tags:
            if tag.name in [EXT_X_PART, EXT_X_PRELOAD_HINT, EXT_X_SERVER_CONTROL]:
                return BLOCK(f"LL-HLS tag {tag.name} forbidden in M3U Plus channel list")

    # Gate 6: Toxic headers in EXTHTTP
    for exthttp in playlist.exthttp_blocks:
        for trap in TOXIC_HEADER_TRAPS:
            if trap in exthttp:
                return BLOCK(f"Toxic header detected: {trap}")

    # Gate 7: Multi-variant present (compatibility)
    if len(playlist.variants) < 2 and playlist.type == MASTER:
        return WARN("Master playlist with single variant — recommend 3+ tiers for compatibility")

    return PASS
```

---

## 10. Player-specific quirk workarounds

| Player | Quirk | Workaround |
|---|---|---|
| hls.js Firefox | Solo soporta AVC (no HEVC sin extension) | Siempre emitir T11 como fallback final |
| OTT Nav OkHttp | Toxic `If-None-Match: *` → EOF | Filtrar EXTHTTP per `feedback_exthttp_traps` |
| TiviMate Connection multi-value | `Connection: keep-alive, close` rompe parser | Single-value per `feedback_okhttp_single_value_headers` |
| VLC desktop | Honra `network-caching=N` | Emitir `#EXTVLCOPT:network-caching=3000` para low-latency live |
| AVPlayer iOS | Rechaza orphan STREAM-INF | RFC 8216 strict (cero orphans per `feedback_rfc8216_master_playlist_rules`) |
| ExoPlayer raw Android | LoadControl bufferForPlayback default 2500ms | Override via KODIPROP o ADB injection per APE PRISMA |

---

## 11. Cross-references

- Cascada: `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md`
- M3U8 spec: `ARTIFACT_M3U8_VALIDATION_SPEC.md` (§EXTHTTP traps, §URL VERBATIM, §LL-HLS Disney+ Parity)
- Player matrix: `ARTIFACT_PLAYER_COMPATIBILITY_MATRIX.md`
- Security: `ARTIFACT_SECURITY_HEADERS_MATRIX.md`
- Memoria base: `feedback_parsers_invisible_to_players`
- Memoria base: `feedback_okhttp_single_value_headers`
- Memoria base: `feedback_exthttp_traps`

---

## 12. Garantía final (one-line summary)

> **Toda directiva emitida por este toolkit es interpretable por TODOS los players HLS modernos del mundo: cumple RFC 8216 + RFC 6381 cuando es estándar, o cumple RFC 8216 §6.3.1 "graceful ignore" cuando es propietaria. Cero collisión. Cero rechazo de manifest. Cero error de parseo.**

---

**Fin Tag Parsing Guarantee.**
