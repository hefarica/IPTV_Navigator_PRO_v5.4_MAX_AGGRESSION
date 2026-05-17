# ARTIFACT — M3U8 VALIDATION SPEC

**Generated:** 2026-05-17
**Authority:** RFC 8216 + repo doctrines + memorias del proyecto
**Enforcement:** `iptv-hls-validator` skill (S1)

---

## 1. Tipos de playlist y reglas duras

### A. **M3U Plus (channel catalog)** — listas Xtream / lista publicada

#### MUST
- ✅ Primera línea: `#EXTM3U`
- ✅ Cada canal: `#EXTINF:-1` + atributos (`tvg-id`, `tvg-name`, `tvg-logo`, `group-title`) + nombre del canal
- ✅ Línea siguiente: EXACTAMENTE 1 URL al canal
- ✅ Encoding UTF-8 (BOM permitido pero no requerido)

#### MUST NOT
- ❌ `#EXT-X-TARGETDURATION` (es tag de Media playlist)
- ❌ `#EXT-X-MEDIA-SEQUENCE` (idem)
- ❌ `#EXT-X-PART`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-SERVER-CONTROL` (LL-HLS — Media playlist only)
- ❌ `#EXT-X-MAP` (fMP4/CMAF — Media playlist only)
- ❌ Múltiples URLs por canal (causa Anti-509 trip)
- ❌ Tags HLS de Media playlist embebidos (rompe parsers estrictos)

#### SHOULD
- ⚠ `#EXTHTTP:{...}` JSON block para headers HTTP (validar contra trap list)
- ⚠ `#EXTVLCOPT`, `#KODIPROP` per-player directives
- ⚠ `#EXT-X-VERSION:3` (no duplicado — bug histórico per `session_20260421_findings_resolved`)

### B. **Master playlist (HLS multi-variant)**

#### MUST
- ✅ `#EXTM3U` primera línea
- ✅ `#EXT-X-VERSION:<N>` (≥3 si BYTERANGE, ≥4 si I-FRAMES-ONLY, etc.)
- ✅ Cada variant: `#EXT-X-STREAM-INF:BANDWIDTH=...,RESOLUTION=...,CODECS="..."` seguido inmediatamente por URI en próxima línea
- ✅ `CODECS` value: RFC 6381 compliant strings (e.g. `"hvc1.2.4.L153.B0,mp4a.40.2"`)

#### MUST NOT
- ❌ `#EXT-X-TARGETDURATION` (es de Media)
- ❌ `#EXT-X-MEDIA-SEQUENCE`
- ❌ Segmentos `.ts` / `.m4s` inline
- ❌ STREAM-INF huérfano (sin URI en línea siguiente) — bug fatal RFC 8216

#### Conditional (per memoria CLAUDE.md doctrine)
- `VIDEO-RANGE=PQ|HLG` — emitir SOLO si probe encontró `VIDEO-RANGE` en manifest real
- `SUPPLEMENTAL-CODECS` — SOLO si probe encontró real `dvh1`/`dvhe`
- `HDCP-LEVEL` — SOLO si probe encontró HDCP real (NUNCA hardcoded `TYPE-1`)

### C. **Media playlist (HLS segment list)**

#### MUST
- ✅ `#EXTM3U` primera línea
- ✅ `#EXT-X-VERSION:<N>`
- ✅ `#EXT-X-TARGETDURATION:<N>` (>= max EXTINF)
- ✅ `#EXT-X-MEDIA-SEQUENCE:<N>` (>=0)
- ✅ Cada segment: `#EXTINF:<duration>,<title?>` seguido por URI
- ✅ Si VOD: `#EXT-X-ENDLIST` al final
- ✅ Si CMAF/fMP4: `#EXT-X-MAP:URI="init.mp4"`

### D. **LL-HLS Media playlist**

#### MUST (en adición a Media playlist)
- ✅ `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=<3*PART-TARGET>`
- ✅ `#EXT-X-PART-INF:PART-TARGET=<n>` (<= TARGETDURATION/3 recomendado)
- ✅ Cada PART: `#EXT-X-PART:DURATION=<n>,URI="..."[,INDEPENDENT=YES]`
- ✅ `#EXT-X-PRELOAD-HINT:TYPE=PART,URI="..."` cuando aplique

#### MUST NOT
- ❌ Emitir LL-HLS tags si Nginx upstream NO soporta blocking reload
- ❌ Emitir `INDEPENDENT=YES` si la PART no inicia con keyframe

---

## 2. EXTHTTP trap list (BLOCK on detection · per `feedback_exthttp_traps`)

The following headers MUST NOT appear in any `#EXTHTTP:{...}` block:

| Header | Trap | Severity |
|---|---|---|
| `Range: bytes=0-` | Causes EOF on OkHttp Android | CRITICAL |
| `If-None-Match: *` | Returns 304+0B → "unexpected end of stream" (incident C8 2026-05-11) | CRITICAL |
| `If-Modified-Since` with invalid date | 304 false positive | HIGH |
| `TE: trailers` | Upstream may not support | HIGH |
| `Priority: u=0, i` | Many upstreams reject | MEDIUM |
| `Upgrade-Insecure-Requests: 1` | Browser-fingerprint causes 403 | MEDIUM |

Per `feedback_okhttp_single_value_headers`:
- `Connection`, `Keep-Alive`, `Sec-Fetch-*` MUST be single-value (no 4-layer comma-separated for these)

Per `feedback_beautiful_madness_4layer`:
- Other headers MAY be 4-layer comma-separated (User-Agent, Accept, Accept-Encoding, etc.)

---

## 3. URL VERBATIM rules (per `feedback_universal_url_constructor_7_rules`)

- **R1**: Cada canal mantiene su URL ORIGINAL del provider (no transformar para "shielding")
- **R2**: Si la URL tiene query params (`?profile=PX&token=...`), preservar verbatim
- **R3**: NO strip de puerto (`:80`, `:443`, custom)
- **R4**: NO doble URL-encode
- **R5**: Bytes-identical: lo emitido = lo almacenado
- **R6**: Single URL per channel (Anti-509 per memoria `reference_xtream_slot_protection`)
- **R7**: `#EXT-X-MEDIA URI=`, `#EXT-X-I-FRAME-STREAM-INF URI=` PROHIBIDOS en M3U Plus (metadata-only)

---

## 4. Validation pipeline

```bash
# 1. Syntax check del generador
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js

# 2. CA11 STRICT parser
node IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8-parser-strict-ultimate.js <path>

# 3. Python strict validator
python3 IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/hls_strict_validator.py <path>

# 4. Compatibility scorecard per-player
python3 IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/compatibility_scorecard.py <path>

# 5. EXTHTTP trap grep
grep -E '"Range"\s*:|If-None-Match["\\]+:?\s*\*|"Priority"\s*:|Upgrade-Insecure-Requests' <path>

# 6. RFC 8216 master gate
awk '/^#EXT-X-STREAM-INF/{getline n; if (n ~ /^https?:|^\.\.|^\//) valid++; else orphan++} END{print "valid="valid" orphan="orphan}' <master>
```

---

## 5. Output report schema (JSON)

```json
{
  "schema_version": "iptv-m3u8-validation-spec-v1",
  "list_path": "<absolute path>",
  "list_type": "M3U_PLUS | MASTER | MEDIA | LL_HLS_MEDIA",
  "profile_target": "OTT_NAVIGATOR | TIVIMATE | HLS_JS | VLC | ANDROID_TV | ALL",
  "validated_at": "<ISO 8601 UTC>",
  "validator_version": "1.0.0",
  "totals": {
    "channels": 0,
    "valid": 0,
    "warnings": 0,
    "invalid": 0
  },
  "findings": [
    {
      "id": "<CRITICAL|HIGH|MEDIUM|LOW>-<NNN>",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "file": "<path>",
      "line": 0,
      "rule": "<RFC 8216 §X.Y | EXTHTTP-TRAP | URL-VERBATIM-Rn | LL-HLS-INVALID-CONTEXT>",
      "current": "<offending text>",
      "suggestion": "<corrected text>"
    }
  ],
  "compatibility_matrix": {
    "OTT_NAVIGATOR": {"compat_score": 0, "issues": []},
    "TIVIMATE": {"compat_score": 0, "issues": []},
    "HLS_JS": {"compat_score": 0, "issues": []},
    "VLC": {"compat_score": 0, "issues": []},
    "EXOPLAYER": {"compat_score": 0, "issues": []}
  },
  "decision": "PASS | WARN | BLOCK",
  "rationale": "<short justification>"
}
```

---

## 6. Acceptance gates (GO/NO-GO)

| Gate | Threshold | Block decision |
|---|---|---|
| CRITICAL findings | 0 | YES if >0 |
| HIGH findings | <= 3 | WARN if >3 |
| EXTHTTP traps detected | 0 | YES if >0 |
| RFC 8216 master orphans | 0 | YES if >0 |
| Master with TARGETDURATION | absent | YES if present |
| Media without TARGETDURATION | rejected | YES if absent |
| Channel loss (vs source) | 0% | WARN if >0 unjustified |
| Compatibility score (worst player) | >= 80 | WARN if <80 |

---

## 7. HEVC 11-Tier Cascade (DEFINITIVA — obligatorio end-to-end)

**Authority:** `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` (full doctrine).
**Resumen tabla:**

| Tier | Codec String | Profile | Level | Resolution | FPS | Color |
|---|---|---|---|---|---|---|
| 1 | `hvc1.2.4.L153.B0` | Main 10 | 5.1 | 4K (4096×2160) | 60 | 10-bit HDR |
| 2 | `hvc1.2.4.L150.B0` | Main 10 | 5.0 | 4K (4096×2160) | 30 | 10-bit HDR |
| 3 | `hvc1.2.4.L156.B0` | Main 10 | 5.2 | 4K (4096×2160) | 120 | 10-bit HDR |
| 4 | `hvc1.2.4.L123.B0` | Main 10 | 4.1 | 1080p (2048×1080) | 60 | 10-bit HDR |
| 5 | `hvc1.2.4.L120.B0` | Main 10 | 4.0 | 1080p (2048×1080) | 30 | 10-bit HDR |
| 6 | `hvc1.2.4.L93.B0` | Main 10 | 3.1 | 720p (1280×720) | 30 | 10-bit HDR |
| 7 | `hvc1.1.6.L153.B0` | Main | 5.1 | 4K (4096×2160) | 60 | 8-bit SDR |
| 8 | `hvc1.1.6.L150.B0` | Main | 5.0 | 4K (4096×2160) | 30 | 8-bit SDR |
| 9 | `hvc1.1.6.L120.B0` | Main | 4.0 | 1080p (2048×1080) | 30 | 8-bit SDR |
| 10 | `hvc1.1.6.L93.B0` | Main | 3.1 | 720p (1280×720) | 30 | 8-bit SDR |
| 11 | `avc1.640028` | H.264 High | 4.0 | 1080p | 30 | 8-bit SDR |

**Gate:** El validador BLOCK si `CODECS=` no está en este set Y no lleva marcador `#EXT-X-APE-CODEC-PREFERRED`.

**Validation rules:**

- Tiers 1-6: requieren probe evidence de 10-bit + (VIDEO-RANGE=PQ/HLG si tier HDR)
- Tier 3: requiere probe evidence de 120fps (raro en IPTV — soft warning)
- Tiers 7-10: 8-bit SDR — sin requirement HDR
- Tier 11: universal fallback final · no antes de agotar T1-T10

**Resolution policy:** valores tabla son DCI (cinema). Si provider entrega UHD (3840×2160, 1920×1080), emitir UHD verbatim — el tier se selecciona por **codec profile/level**, no por resolución exacta.

---

## 8. LL-HLS Disney+ Parity directives (Media playlist only)

Per `PROMPT_MAESTRO_INGENIERIA_EXTREMA.md`, las directivas obligatorias en Media playlist LL-HLS son:

```m3u
#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0
#EXT-X-TARGETDURATION:2
#EXT-X-PART-INF:PART-TARGET=1.0
#EXT-X-SESSION-DATA:DATA-ID="com.ape.load_control",VALUE="{\"bufferForPlaybackMs\":1000,\"maxBufferMs\":30000,\"bufferForPlaybackAfterRebufferMs\":2000}"
#EXT-X-SESSION-DATA:DATA-ID="com.ape.track_selection",VALUE="{\"bandwidthFraction\":0.65,\"maxDurationForQualityDecreaseMs\":2000}"
```

**Reglas:**

- Solo en Media playlist real con segmentos LL-HLS verificados (CMAF + EXT-X-PART)
- NUNCA en M3U Plus channel catalog → BLOCK detection
- TARGETDURATION:2 (Disney+ parity) requiere segment duration efectiva ≤ 2s
- PART-TARGET:1.0 requiere `EXT-X-PART:DURATION=1` reales emitidos

---

## 9. EXT-X-STREAM-INF Disney+ Parity per channel (Master playlist)

Atributos obligatorios + opcionales reconciliados:

```m3u
#EXT-X-STREAM-INF:BANDWIDTH=X,AVERAGE-BANDWIDTH=Y,RESOLUTION=WxH,CODECS="<tier>",FRAME-RATE=fps[,VIDEO-RANGE=<range>][,HDCP-LEVEL=<level>][,STABLE-VARIANT-ID="id"]
```

| Atributo | Required | Política |
|---|---|---|
| `BANDWIDTH` | yes | Real measured o floor del tier (ver §7) |
| `AVERAGE-BANDWIDTH` | yes | Real average · `AVG <= BANDWIDTH` |
| `RESOLUTION` | yes | Real probed |
| `CODECS` | yes | Uno de los 11 tiers del §7 (o `PREFERRED` con marker) |
| `FRAME-RATE` | recommended | Real probed |
| `VIDEO-RANGE` | conditional | Solo si probe = `PQ`/`HLG` (NUNCA hardcoded) |
| `HDCP-LEVEL` | conditional | Solo si probe confirmó HDCP real (NUNCA hardcoded `TYPE-1`) — ver `ARTIFACT_HEVC_8TIER_CASCADE.md.SUPERSEDED §7` para política reconciliada |
| `STABLE-VARIANT-ID` | recommended | Formato sugerido `"ape-t<N>-<res>-<codec_hash>"` · estable across reloads (anti-yoyo ABR) |

---

## 10. Conviva QoE integration (per-channel telemetry)

El toolkit ahora integra `frontend/js/conviva-qoe-engine.js` (audit completo en `.agents/reports/AUDIT_CONVIVA_QOE_ENGINE.md`).

Per-channel debe registrar:

- `ConvivaQoE.createSession(channelId, channelName, profile)` al startup
- `ConvivaQoE.reportFirstFrame(sessionId)` al primer frame (VST)
- `ConvivaQoE.reportRebufferStart/End(sessionId)` en rebuffer events
- `ConvivaQoE.reportBitrate(sessionId, bps)` cada segundo
- `ConvivaQoE.reportFrameDrops(sessionId, dropped, total)` periódico
- `ConvivaQoE.reportError(sessionId, code, message)` en cualquier 4xx/5xx/EOF

DecisionEngine automáticamente:

- RBR > 0.02 (2%) → `FORCE_SURVIVAL_MODE` (480p)
- QoE < 50 → `DEGRADE_QUALITY`
- FDR > 5/s → `REDUCE_DECODER_LOAD`
- VST > 3000ms → `PRELOAD_NEXT_CHANNEL`
- QoE > 80 sostenido 15s+ → `PROMOTE_QUALITY`

**Threshold reconciliation note:** El master prompt menciona RBR > 5% → SURVIVAL. El código de Conviva está en 2% (más estricto). **Mantener el código** — más estricto es mejor para QoE enterprise.

---

**Fin M3U8 Validation Spec (with 11-tier + LL-HLS Disney+ + Conviva).**
