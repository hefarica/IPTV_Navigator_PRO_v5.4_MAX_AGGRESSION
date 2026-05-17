# ARTIFACT — FASE 1 GENERATOR MAP (partial · read-only)

**Generated:** 2026-05-17
**Target:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
**Status:** **read-only inventory** · archivo LOCKED por Agent F per `.agent/COORDINATION.md`
**Source:** Explore subagent mapping (medium breadth · validated by syntactic samples)

---

## 1. File header

| Field | Value |
|---|---|
| **Lines** | 9982 |
| **Engine version** | `22.2.0-FUSION-FANTASMA-NUCLEAR` (constant at L23) |
| **Pattern** | IIFE strict mode |
| **Public globals** | `window.M3U8TypedArraysGenerator`, `window.APEAtomicStealthEngine`, `window._apeGetAuditAcc()` |
| **Auto-init** | Polls `window.app` every 200ms (max 50 attempts = 10s); registers `window.app.generateM3U8_TypedArrays()` when ready |
| **Dependencies** | Browser-only (`window`, `fetch`, `XMLHttpRequest`, `Blob`, `URL.createObjectURL`, `showSaveFilePicker` FSAA) |

---

## 2. Top-level structural skeleton

```
Lines 1-43      License/header comments + IIFE open + 'use strict'
Lines 44-119    M1+M2+M5 audit guards (emitOnce, enforceJsonValid, enforceCap, assertPlaylistOrder, buildAuditScorecard)
Lines 147-267   Córtex JS STEALTH-AWARE — DICTATOR vs STEALTH mode, fetch/XHR wrappers, _apeStealthState Map
Lines 321-484   UA_PHANTOM_BANK — 180 user-agents in 3 tiers (TIER1 SmartTV/99%, TIER2 Browsers/95%, TIER3 IPTV/90%)
Lines 787-?     getRotatedUserAgent() + UAPhantomEngine (3-layer anti-407 rotation)
Lines 970+      IPTV_SUPPORT_CORTEX_V_OMEGA — escalation headers by status code (401/403/407/429/451/500/502/503/504)
Lines 1065-1197 PRE_ARMED_RESPONSE_BUILDER — polymorph fallback tags for 9 error codes (B64 blob)
Lines 1206-1296 class APEAtomicStealthEngine — polymorphic genome burst (10-mutation × 3 attempt batches)
Lines 2186-?    generateGlobalHeader() — RFC 8216 compliance + 90+ headers emission
Lines 2695-?    generateEXTVLCOPT() — 21 VLC options per channel
Lines 5181-5293 G1-P groups (~100 HTTP anabolic headers organized in 15 groups)
Lines 5260-5293 G4 ISP Evasion (REMOVED IP fingerprint headers per C2 2026-04-30)
Lines 5953-?    generateJWT68Fields() — auth/metadata 68-field payload
Lines 6307-?    generateEXTINF() — EXTINF tag + JWT integration
Lines 6995-?    generateChannelEntry() — 139-line monolithic per profile (per `feedback_796_lines_monolithic`)
Lines 9226-?    generateM3U8() — async main playlist builder ⭐ ENTRY POINT
Lines 9403-?    generateAndDownload() — download via Blob
Lines 9456-?    generateAndDownloadStreaming() — FSAA zero-copy direct-to-disk
Lines 9675-9829 Auto-register hook (polls window.app)
Lines 9830-9982 Final closures + IIFE close
```

---

## 3. Public API (window.M3U8TypedArraysGenerator)

Métodos públicos detectados:
- `generateM3U8(channels, profile, options)` — main builder
- `generateAndDownload(channels, profile, options)` — wraps + Blob download
- `generateAndDownloadStreaming(channels, profile, options)` — FSAA streaming
- `getAuditSummary()` — returns M1+M2+M5 scorecard
- `_apeGetAuditAcc()` — accumulator accessor (internal debug)

Eventos despachados:
- `window.dispatchEvent(new CustomEvent('m3u8-generated', { detail: {...} }))` post-generation

---

## 4. Stealth / Evasion modules (críticos · NO modificar sin SECURITY review)

### 4.1 Córtex JS STEALTH-AWARE (L147-L267)
- Dual mode: **DICTATOR** (no delay) o **STEALTH** (exponential backoff + jitter)
- Por host: `window._apeStealthState` Map (host → cooldown state)
- Wraps `fetch` y `XMLHttpRequest` para enforcement
- Trigger STEALTH: cuando upstream devuelve 403/407/429
- Reset DICTATOR: tras N requests OK consecutivos

### 4.2 UA_PHANTOM_BANK (L321-L484)
- 180 user-agents totales
- **TIER1** (99% success): SmartTV strings (Samsung Tizen, LG WebOS, Sony Bravia, Hisense VIDAA)
- **TIER2** (95%): Browser strings (Chrome, Firefox, Safari, Edge — múltiples versiones)
- **TIER3** (90%): IPTV player strings (OTT Navigator, TiviMate, Kodi, VLC, Wiseplay)

### 4.3 UAPhantomEngine (3-layer anti-407)
1. **Generation-time hash**: UA elegido al generar lista (per-channel deterministic)
2. **Zapping-time salt**: UA mutated al zap (per-session randomization)
3. **Recovery-time mutation**: UA cambia tras 407/403 (per-incident burst)

### 4.4 IPTV_SUPPORT_CORTEX_V_OMEGA (L970+)
- Tabla de escalation headers por código de error
- 401 → add Authorization header
- 403 → rotate UA + add Origin
- 407 → trigger anti-407 mutation
- 429 → STEALTH mode + retry-after honor
- 451 → switch upstream (geo-block)
- 5xx → exponential backoff

### 4.5 APEAtomicStealthEngine (L1206-L1296)
- Polymorphic genome: 10 mutations × 3 attempts = 30-shot burst
- Cada mutation cambia: UA tier, header order, Origin/Referer combo, Accept-* values
- Trigger: tras N failures consecutivos del mismo upstream

---

## 5. Audit guards (M1+M2+M5 · L44-L119)

| Guard | Función | Línea |
|---|---|---|
| **M1.emitOnce(tag)** | Anti-duplicate via Set (per `session_20260421_findings_resolved`) | ~50 |
| **M2.enforceJsonValid(json)** | JSON round-trip validation antes de emitir | ~70 |
| **M5.enforceCap(header, max_bytes)** | Header byte cap (8KB default per `feedback_796_lines_monolithic`) | ~85 |
| **assertPlaylistOrder()** | EXTM3U → VERSION → MEDIA-SEQUENCE order | ~100 |
| **buildAuditScorecard()** | Emite `#EXT-X-APE-AUDIT-SCORECARD:{json}` al final del manifest | ~115 |

---

## 6. Profiles P0-P5 (6 perfiles)

| Profile | Resolution | FPS target | Codec ladder | HDR |
|---|---|---|---|---|
| **P0** | 7680×4320 (8K) | 120 | HEVC Main10 + DV / AV1 10-bit | HDR10+ / DV |
| **P1** | 3840×2160 (4K UHD) | 60 | HEVC Main10 | HDR10 si probed |
| **P2** | 1920×1080 (FHD) | 60 | HEVC Main10 / Main / AVC High | SDR + HDR if probed |
| **P3** | 1280×720 (HD) | 30 | HEVC / AVC | SDR |
| **P4** | 854×480 (SD) | 30 | AVC Main | SDR |
| **P5** | 640×360 (low) | 30 | AVC Baseline | SDR · fallback |

Cross-reference: master prompt §"CASCADA HEVC-FIRST" cubre los codec strings; perfiles P0-P5 cubren resolution/fps.

---

## 7. HTTP anabolic headers (G1-P groups · L5181-L5293)

~100 headers organizados en 15 groups:

| Group | Function |
|---|---|
| G1 Identity | User-Agent, Accept-Language, browser identity |
| G2 Capabilities | Accept, Accept-Encoding, Accept-Charset |
| G3 Streaming | Cache-Control, Pragma · ⚠ `Range` REMOVED 2026-05-11 (C8) |
| **G4 ISP Evasion** | ⚠ X-Forwarded-For, X-Real-IP, X-Client-IP REMOVED 2026-04-30 (C2) - VPS fingerprint leak. Only `X-ISP-Bypass`, `X-DPI-Evasion` kept |
| G5 Cache-bypass | If-* (sin `If-None-Match: *` ni `If-Modified-Since` inválido) |
| G6 HDR | X-Color-Gamut, X-HDR-Capability (semantic hint) |
| G7 LCEVC | X-LCEVC-Support, X-LCEVC-Decoder |
| G8 Tone-mapping | X-Tone-Map-PQ-to-SDR (semantic) |
| G9 Video prefs | X-Preferred-Codec, X-Preferred-Resolution |
| G10 Buffer/BBR | X-Buffer-Target, X-Throughput-Hint |
| G11 CDN bypass | Headers para forzar origin si CDN intercepta |
| G12 Premium emulation | Accept-CH (Client Hints) — SmartTV emulation |
| G13-15 | Trace context, custom APE telemetry |

---

## 8. Output modes

### Chunked Blob (default · listas < 500MB)
1. Build complete string in memory (TypedArray)
2. Wrap in `Blob`
3. `URL.createObjectURL` → trigger download
4. RAM-bound: ~ 2× list size during build

### FSAA Streaming (listas > 500MB)
1. Open `showSaveFilePicker()` (File System Access API)
2. Get writable stream
3. Stream chunks (Reader → Uint8Array) directly to disk
4. RAM-bound: ~ chunk size (no full-list spike)
5. Critical for 805MB+ listas (avoids 2.4GB RAM spike → OOM)

---

## 9. Integration map (consumers/producers)

### Consumers (read from this generator)
- `frontend/index-v4.html` — botón `btnGenerateAudited` → invoke `window.app.generateM3U8_TypedArrays()`
- `frontend/js/gateway-manager.js` — receives generated string, applies SHIELDED rename, uploads
- `frontend/js/quality-manifest-widget.js` (uncommitted) — displays quality stats post-generation

### Producers (provide data to this generator)
- `frontend/js/ape-v9/ape-fallback-resolver.js` — F0-F5 tier decisions
- `frontend/js/ape-v9/ape-quality-prober.js` — manifest probes for codec evidence
- `frontend/js/ape-v9/ape-profiles-config.js` — LAB SSOT profiles P0-P5
- `window.APE_PROFILES_CONFIG` — global config object

### Event bus
- Despacha: `m3u8-generated` (with detail metadata)
- Despacha: `m3u8-progress` (durante streaming mode)

---

## 10. Historical change comments (C-series)

Búsqueda detectó 5 occurrences de C-numbered refactor markers:

| Comment ID | Date | Change | Memory reference |
|---|---|---|---|
| **C2** | 2026-04-30 | Removed 5 IP-fingerprint headers (`X-Forwarded-For`, `X-Real-IP`, etc.) | `feedback_shield_proxy_pass_request_headers_off` |
| **C3** | (varios) | Refactor cleanup | — |
| **C8** | **2026-05-11** | Removed `Range: bytes=0-` from G3 (37,128 OkHttp crash hits) | `feedback_exthttp_traps` (caso C8 documentado) |

Cross-confirma con memorias del proyecto. **Cero discrepancias detectadas.**

---

## 11. Áreas críticas — NO TOCAR sin handoff de Agent F

| Función | Línea | Por qué crítica |
|---|---|---|
| `generateChannelEntry()` | ~6995 | 139-line monolítica per profile · `feedback_796_lines_monolithic` prohibe fragmentar |
| `generateGlobalHeader()` | ~2186 | 90+ headers cuidadosamente ordenados (RFC 8216 § 4.3) |
| `Córtex JS STEALTH-AWARE` | L147-L267 | Lógica de evasión — modificación errónea → bloqueos provider en cascada |
| `APEAtomicStealthEngine` | L1206-L1296 | Genome polimórfico — tampering puede romper recuperación 4xx/5xx |
| `M1+M2+M5 guards` | L44-L119 | Audit scorecard depende de estos hooks · cambiar uno = scorecard inválido |

---

## 12. FASE 1 destripe COMPLETO — plan para próxima sesión (cuando Agent F libere)

Cuando se libere el lock, ejecutar en este orden:

### 12.1 Pre-flight
1. `iptv-cortex-init-mandatory` 5-layer scan
2. `iptv-pre-edit-audit` sobre `m3u8-typed-arrays-ultimate.js`
3. Verificar lock release en `.agent/COORDINATION.md`
4. Backup pre-cambio: `cp <path> <path>.audit_<timestamp>.bak.js`
5. `git status` para confirmar working tree limpio (las 18 líneas uncommitted de Agent F deben estar committed o stashed)

### 12.2 Lectura sistemática
- Read en chunks de 500 líneas (20 reads total para 9982 líneas)
- Por chunk, anotar: funciones, constantes, dependencias, side effects, riesgos
- Identificar: hardcode, headers tóxicos no documentados, tags HLS mis-placed, fallback gaps, log de secretos

### 12.3 Per-función análisis (~30 funciones detectadas)
Para cada función entry point + helper interno:
- Documentar I/O contract
- Verificar guards M1+M2+M5 aplicados
- Cross-reference con memoria pertinente
- Marcar hallazgos con severity C/H/M/L
- Sugerir corrección sin destruir funcionalidad

### 12.4 Sintesis
- Tabla agregada de findings
- Priorización fixes (CRITICAL first)
- Propuesta de refactor (NUNCA fragmentar `generateChannelEntry` per doctrine)
- E2E test plan: generate full list → validate via `m3u8-parser-strict-ultimate.js` → compatibility scorecard

### 12.5 Output
- `.agents/reports/FASE_1_DESTRIPE_<timestamp>.md` (esperado ~50-100 páginas equiv markdown)
- Findings table .agents/reports/FASE_1_findings.csv
- Acceptance: cero fixes aplicados sin user GO; reporte como input para sesión 2

---

## 13. Doctrines respetadas en este mapping

- ✅ `iptv-cortex-init-mandatory` — sesión activa, scan ejecutado
- ✅ `iptv-pre-edit-audit` — read-only sobre archivo locked
- ✅ `iptv-omega-no-delete` — solo append/create, cero rm
- ✅ COORDINATION.md respect — Agent F lock intacto, cero edits
- ✅ Conviva engine audit ya hecho en paralelo (no conflicto con este artifact)

---

## 14. Update 2026-05-17 — Cascada 11-tier impact en generator

Per `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md`, el generator debe emitir CODECS strings de los 11 tiers reconocidos. Áreas del generator a auditar especialmente cuando libere Agent F:

| Área | Línea aprox | Acción FASE 1 |
|---|---|---|
| `generateChannelEntry()` | ~6995 | Verificar que CODECS= selecciona del set definitivo 11-tier |
| Profiles P0-P5 ladder | varios | Mapear P0-P5 → tiers 1-11 (P0 puede mapear a T1/T2/T3 según probe) |
| `generateEXTINF()` | ~6307 | Sin impacto (EXTINF no lleva CODECS) |
| Fallback when probe fails | varios | Per F2 PREMIUM_HINT → T5/T4 con `#EXT-X-APE-CODEC-PREFERRED` marker |
| Multi-variant Master playlist emission | varios | Garantizar mínimo 3 tiers per Master (top + mid + universal T11) |

**Cross-impact verification post-handoff:**

- Buscar todas las occurrences de `hvc1.` y `avc1.` literal hardcoded
- Verificar que NO existan tier strings fuera del set definitivo
- Si hay tier strings legacy (e.g. `hvc1.2.4.L156.B0` ya estaba antes de la cascada actualizada), confirmar que están en el set definitivo
- Cross-reference con `ape-fallback-resolver.js` F0-F5 mapping per §8 del cascada definitiva

---

**Fin FASE 1 Generator Map (partial · con 11-tier reference).**
