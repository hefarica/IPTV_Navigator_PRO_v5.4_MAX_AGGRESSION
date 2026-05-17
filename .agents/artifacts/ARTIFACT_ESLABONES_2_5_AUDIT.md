# ARTIFACT — AUDIT ESLABONES 2-5 (read-only · ADN preservation forensic)

**Generated:** 2026-05-17
**Method:** read-only audit (cero touch a producción)
**Authority:** S6 Nginx/Lua + S13 Repo Surgeon + S2 LL-HLS/CMAF + S4 Color Scientist
**Mission:** Verificar que los eslabones 2-5 de la Cadena de Manifestación **PRESERVAN** la metadata HDR/codec sin degradación

---

## 1. Resumen ejecutivo

| Eslabón | Archivo principal | Veredicto | Hallazgos críticos |
|---|---|---|---|
| **2 API SERVER** | `frontend/backend_v15/ape_server_v15_ultimate.py` + `hls_rewriter_v15.py` (248L) | ✅ **PRESERVATION INTEGRAL** | 0 critical · 1 minor (UA default browser-like en inject_kodi_props) |
| **3 NGINX** | `net-shield/nginx/nginx.conf` (94L) | ✅ **AUTOPISTA RESPETADA** | 0 critical · gzip on para manifest M3U8 (industria standard, OK) |
| **4 LUA** | `upstream_gate.lua` (46L) + `upstream_response.lua` (81L) | ✅ **PASSTHROUGH PURO** | 0 issues · circuit breaker eliminado per autopista doctrine |
| **5 CMAF PHP** | `cmaf_engine/modules/dual_manifest_generator.php` | ⚠ **1 CRITICAL** | Codec string malformado `hvc1.1.6.L120.90` (debe ser `.B0`) |

---

## 2. Eslabón 2 — API Server (`ape_server_v15_ultimate.py`)

### Estructura
- Flask app, 647 líneas
- Endpoints: `/health`, `/stream`, `/segment`, `/api/metrics`, `/api/force_failover`, `/api/sessions`
- Entry stream: `stream_proxy()` L233-325 — recibe request → fetch upstream → si M3U8 → `hls_rewriter.rewrite_manifest()` → return

### `hls_rewriter_v15.py:rewrite_manifest()` análisis (L60-126)

```python
# L84: if lines[0].startswith("#EXTM3U"):
# L85-96: append #EXTM3U + 9 #EXT-X-APE-* propietarios (RFC §6.3.1 safe)
# L99: lines = lines[1:]   # skip ONLY the original #EXTM3U
# L102-110: for each line starting with '#': append AS-IS
# L113-124: for URL lines: rewrite via proxy
```

**Preservación verificada:**
- ✅ `#EXT-X-VERSION:*` — preserved as-is (line 110)
- ✅ `#EXT-X-TARGETDURATION:*` — preserved as-is
- ✅ `#EXT-X-MEDIA-SEQUENCE:*` — preserved as-is
- ✅ `#EXT-X-STREAM-INF:*` (CODECS, RESOLUTION, VIDEO-RANGE, etc.) — preserved as-is
- ✅ `#EXT-X-MEDIA:*` (AUDIO/SUBTITLES groups) — preserved as-is
- ✅ `#EXT-X-MAP:*` (CMAF init) — preserved as-is
- ✅ `#EXT-X-PART:*`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-SERVER-CONTROL` (LL-HLS) — preserved as-is
- ✅ `#EXTHTTP`, `#EXTVLCOPT`, `#KODIPROP` — preserved as-is

**Rewrite:**
- ❗ URL lines rewritten to `/segment?uri=<encoded>&ch=<id>&profile=<p>&live=<0|1>` — necesario para proxying, NO afecta metadata
- ❗ Cookie `ape_session_id` set (no afecta playback)

**Findings:**

| ID | Severity | File | Line | Issue |
|---|---|---|---|---|
| ES2-001 | LOW | `hls_rewriter_v15.py` | 178 | `inject_vlc_options()` UA default es browser-like Windows Chrome — debería ser SmartTV o IPTV player para evasión 407 (memoria `feedback_http_407_proxy_auth_doctrine`) |
| ES2-002 | LOW | `hls_rewriter_v15.py` | 211 | Idem `inject_kodi_props()` |
| ES2-003 | INFO | `ape_server_v15_ultimate.py` | 305 | Forces `Content-Type: application/vnd.apple.mpegurl` — correcto pero documentar consistencia con upstream `audio/mpegurl` (alias) |

**Veredicto eslabón 2:** ✅ **PRESERVATION INTEGRAL · cero impacto en HDR/codec metadata**

---

## 3. Eslabón 3 — Nginx config (`net-shield/nginx/nginx.conf`)

### Estructura
- 94 líneas, main config (sites en `/etc/nginx/sites-enabled/*` no auditados aquí)
- `worker_processes auto`, `worker_connections 20000`, BBR via sysctl externo

### Verificación autopista doctrine

| Directiva | Valor | Status |
|---|---|---|
| `worker_processes` | auto | ✅ |
| `worker_rlimit_nofile` | 200000 | ✅ |
| `keepalive_timeout` | 65 | ✅ |
| `keepalive_requests` | 100000 | ✅ |
| `client_max_body_size` | 600M | ✅ (listas grandes) |
| `client_body_timeout` | 120s | ✅ |
| `send_timeout` | 180s | ✅ (streaming) |
| `output_buffers` | 4 64k | ✅ |
| `open_file_cache` | max=200000 inactive=30s | ✅ |
| `ssl_protocols` | TLSv1.2 TLSv1.3 | ✅ |
| `gzip` | on (manifest types only) | ⚠ ver §3.1 |
| `proxy_cache_path` | `/dev/shm/nginx_cache` 1.5GB max | ✅ RAM cache |

### §3.1 Gzip on para `application/vnd.apple.mpegurl` (L66-71)

```nginx
gzip_types application/vnd.apple.mpegurl application/x-mpegurl
           application/json application/javascript text/css text/plain text/xml;
```

**Análisis:**
- ✅ Gzip de manifests M3U8 es **industria standard** — todos los players soportan Accept-Encoding: gzip
- ✅ Reduce bandwidth ~70% sobre manifests grandes (cataloges 50MB+ comprimen a ~15MB)
- ⚠ **Riesgo eslabón 5**: si CMAF PHP módulo lee body upstream, debe descomprimir antes (requests Python lib auto-descomprime · cmaf PHP debe verificarse)
- ✅ Segmentos TS/M4S NO están en gzip_types — correcto (video binary no se comprime)

### §3.2 Cache strategy

```nginx
proxy_cache_path /dev/shm/nginx_cache levels=1:2 keys_zone=iptv_cache:500m
                 max_size=1500m inactive=2h use_temp_path=off;
```

- ✅ Cache en RAM (`/dev/shm`) — zapping atómico per `feedback_vps_zapping_atomico_inviolable`
- ✅ Max 1.5GB cache (acorde a CPX21 4GB RAM)
- ⚠ `inactive=2h` razonable para manifests, pero sites-enabled deberían tener `proxy_cache_valid 302 0` (no auditado aquí)

### Findings

| ID | Severity | File | Line | Issue |
|---|---|---|---|---|
| ES3-001 | INFO | `nginx.conf` | 66-71 | `gzip on` para M3U8 manifests — OK, pero verificar que CMAF PHP módulo descomprima si lee body |
| ES3-002 | LOW | `nginx.conf` | (missing) | No incluye `proxy_pass_request_headers off` directiva global — debería estar en sites-enabled (no auditado) |
| ES3-003 | INFO | `nginx.conf` | 14-19 | `accept_mutex off` + `multi_accept on` correcto para autopista |

**Veredicto eslabón 3:** ✅ **AUTOPISTA DOCTRINE RESPETADA · cero riesgo de degradación metadata si sites-enabled mantienen `proxy_pass_request_headers off`**

---

## 4. Eslabón 4 — Lua (`upstream_gate.lua` + `upstream_response.lua`)

### `upstream_gate.lua` (46 líneas · access_by_lua_file)

```lua
-- L20-26: skip if not /shield/* path
-- L29-31: telemetry only — increment metrics_dict (shared dict)
-- L34: ngx.header["X-APE-Circuit"] = "PASSTHROUGH"
-- L40-43: sentinel UA rotation (rotated UA via shared dict, applied for proxy_set_header)
-- L46: return — ALWAYS pass through
```

**Análisis:**
- ✅ **NO** `ngx.exit()` que pudiera bloquear
- ✅ **NO** `body_filter_by_lua` que pudiera modificar body upstream
- ✅ Solo `access_phase` — ejecuta ANTES de fetch, no toca response
- ✅ pcall + module returns silently on error → no rompe pipeline
- ✅ Telemetry-only en `ngx.shared.circuit_metrics`

### `upstream_response.lua` (81 líneas · header_filter_by_lua_file)

```lua
-- L20-25: skip if not /shield/*
-- L28-31: skip if upstream_response_time empty (no upstream hit)
-- L34-37: skip cache hits (STALE/HIT) — telemetry irrelevant
-- L41-54: increment metrics_dict by status class (2xx/3xx/4xx/5xx)
-- L57-64: ngx.log(WARN) for status >= 400 (observability)
-- L67-69: ngx.header X-APE-Circuit/Upstream/Status (debug headers, never block)
-- L71-80: pcall(dofile, "/etc/nginx/lua/sentinel_auth_guard.lua") for UA rotation
```

**Análisis:**
- ✅ `header_filter_by_lua_file` — ejecuta DESPUÉS de upstream response headers, ANTES de body
- ✅ **NO** modifica response body
- ✅ **NO** toca headers HLS estándar (`Content-Type`, etc.)
- ✅ Solo añade headers debug `X-APE-Circuit`, `X-APE-Upstream`, `X-APE-Status` — non-disruptive
- ✅ pcall sobre sentinel_auth_guard.lua — failure-safe

### Findings

| ID | Severity | File | Line | Issue |
|---|---|---|---|---|
| ES4-001 | INFO | `upstream_response.lua` | 67-69 | Headers `X-APE-*` añadidos siempre — verificar que NO se reenvían al upstream provider (riesgo fingerprint) |
| ES4-002 | INFO | `upstream_response.lua` | 77 | `dofile("/etc/nginx/lua/sentinel_auth_guard.lua")` — archivo no auditado en este sprint (en VPS productivo) |

**Veredicto eslabón 4:** ✅ **PASSTHROUGH PURO · cero modificación de body · circuit breaker correctamente removido per autopista doctrine v2 2026-04-26**

---

## 5. Eslabón 5 — CMAF PHP modules

### Files auditados (focus on metadata-touching)

| File | Líneas | Función | Hallazgo |
|---|---|---|---|
| `cmaf_packaging_engine.php` | (no greps) | fMP4 packaging | No mentions de codec strings hardcoded — depende de input |
| `dual_manifest_generator.php` | 320+ | genera HLS + DASH dual | ⚠ CRITICAL finding (§5.1) |
| `hdr10plus_dynamic_engine.php` | 280+ | inyecta `#EXT-X-APE-HDR-*` tags | ✅ propietarios safe per §6.3.1 |
| `lcevc_phase4_injector.php` | (no auditado profundo) | LCEVC enhancement | TBD próxima sesión |

### §5.1 CRITICAL — `dual_manifest_generator.php:25,310`

```php
// LÍNEA 24-25 — constants
const LCEVC_CODEC_H264       = 'avc1.640028';
const LCEVC_CODEC_HEVC       = 'hvc1.1.6.L120.90';     // ⚠ MALFORMED

// LÍNEA 306-315 — codec resolver
private function resolveHlsCodecString(array $rendition, array $dna, bool $lcevcEnabled): string
{
    $codec = $dna['codec_priority'][0] ?? 'h264';
    $videoCodec = match($codec) {
        'hevc', 'h265' => 'hvc1.1.6.L120.90',          // ⚠ MALFORMED
        'av1'          => 'av01.0.08M.08',             // not in 11-tier cascade
        default        => 'avc1.640028',               // T11 OK
    };
    return $videoCodec . ',mp4a.40.2';
}
```

**Análisis del defect:**

- `hvc1.1.6.L120.90` **NO es codec string RFC 6381 §3.3 conforme**
- Per cascada definitiva 11-tier (Tier 9), el codec correcto es: **`hvc1.1.6.L120.B0`**
- `.90` no es constraint flag válido — debe ser `.B0` o `.00.00.00.00.00.00` (6 bytes constraint en hex)
- Players estrictos (Apple AVPlayer, Shaka) podrían **rechazar el manifest** o ignorar el variant
- Players permisivos (hls.js, ExoPlayer) probablemente harán fuzzy match a `hvc1.1.6.L120` y aceptarán — degradación silenciosa

**Impacto:**

- ⚠ Cualquier canal procesado por `dual_manifest_generator.php` con codec HEVC emite codec malformado
- ⚠ Tier 9 (cascada definitiva) NO se está emitiendo correctamente desde este módulo
- ⚠ Cross-impact: `lcevc_state_engine.php` y otros consumers podrían heredar el bug

**Recomendación de fix (próxima sesión + autorización):**

```php
// CHANGE línea 25:
- const LCEVC_CODEC_HEVC       = 'hvc1.1.6.L120.90';
+ const LCEVC_CODEC_HEVC       = 'hvc1.1.6.L120.B0';   // RFC 6381 §3.3 Tier 9

// CHANGE línea 310:
-         'hevc', 'h265' => 'hvc1.1.6.L120.90',
+         'hevc', 'h265' => 'hvc1.1.6.L120.B0',
```

Pero **además** considerar:
- Si el provider entrega HEVC Main10 (HDR), debería emitir Tier 5 (`hvc1.2.4.L120.B0`) no Main 8-bit (Tier 9)
- El dual_manifest_generator debería leer el codec real del probe, no fijar Main 8-bit como default HEVC

### §5.2 `hdr10plus_dynamic_engine.php` — HDR signaling

```php
// L269-270:
"#EXT-X-APE-HDR-CAPABILITY:{$capability}",
"#EXT-X-APE-HDR-MAXCLL:{$maxCll}",
```

✅ Tags propietarios `#EXT-X-APE-HDR-*` — safe per RFC 8216 §6.3.1 graceful ignore.

⚠ **Missing**: no emite `COLOR-PRIMARIES`, `TRANSFER-CHARACTERISTICS`, `MATRIX-COEFFICIENTS` standards en STREAM-INF (per `ARTIFACT_HDR10_METADATA_TRIFECTA.md` doctrina). Los tags propietarios sirven para Guardian/Cortex, pero **no activan HDR en el player** — los players parsean `VIDEO-RANGE=PQ/HLG` estándar.

### Findings eslabón 5

| ID | Severity | File | Line | Issue | Fix recomendado |
|---|---|---|---|---|---|
| **ES5-001** | **CRITICAL** | `dual_manifest_generator.php` | 25 | const `LCEVC_CODEC_HEVC = 'hvc1.1.6.L120.90'` malformado per RFC 6381 | cambiar a `.B0` |
| **ES5-002** | **CRITICAL** | `dual_manifest_generator.php` | 310 | resolver emite `hvc1.1.6.L120.90` para HEVC | cambiar a `.B0` |
| ES5-003 | HIGH | `dual_manifest_generator.php` | 308-313 | HEVC default es Main 8-bit Tier 9 — debería ser Main10 si provider HDR | leer probe + map a tier real |
| ES5-004 | MEDIUM | `dual_manifest_generator.php` | 311 | `av01.0.08M.08` no está en cascada definitiva 11-tier (AV1) | considerar AV1 extension a cascada o omitir |
| ES5-005 | MEDIUM | `hdr10plus_dynamic_engine.php` | (general) | emite `#EXT-X-APE-HDR-*` propietarios pero NO emite `VIDEO-RANGE`/`COLOR-PRIMARIES`/`TRANSFER-CHARACTERISTICS`/`MATRIX-COEFFICIENTS` estándar | añadir emission estándar HLS |
| ES5-006 | INFO | `cmaf_packaging_engine.php` | (no auditado en profundidad) | verificar preservation de fMP4 boxes `colr`/`mdcv`/`clli` | full audit próxima sesión |
| ES5-007 | INFO | `lcevc_phase4_injector.php` | (no auditado) | LCEVC injection logic | full audit próxima sesión |

**Veredicto eslabón 5:** ⚠ **2 CRITICAL + 1 HIGH** · codec string malformado + missing HDR trifecta estándar. Eslabón 5 actualmente DEGRADA la cadena de manifestación.

---

## 6. Tabla consolidada de findings

| ID | Severity | Eslabón | File | Issue |
|---|---|---|---|---|
| ES5-001 | **CRITICAL** | 5 | `dual_manifest_generator.php:25` | codec `.90` malformado |
| ES5-002 | **CRITICAL** | 5 | `dual_manifest_generator.php:310` | idem en resolver |
| ES5-003 | HIGH | 5 | `dual_manifest_generator.php:308-313` | HEVC default Main 8-bit, no Main10 si HDR |
| ES5-005 | MEDIUM | 5 | `hdr10plus_dynamic_engine.php` | falta emit trifecta HDR10 estándar HLS |
| ES5-004 | MEDIUM | 5 | `dual_manifest_generator.php:311` | AV1 codec no en cascada definitiva |
| ES3-002 | LOW | 3 | `nginx.conf` | `proxy_pass_request_headers off` no en main config (probable en sites-enabled) |
| ES2-001 | LOW | 2 | `hls_rewriter_v15.py:178` | UA default browser en `inject_vlc_options` |
| ES2-002 | LOW | 2 | `hls_rewriter_v15.py:211` | idem en `inject_kodi_props` |
| ES4-001 | INFO | 4 | `upstream_response.lua:67-69` | verificar `X-APE-*` headers no se reenvían upstream |
| ES4-002 | INFO | 4 | `upstream_response.lua:77` | sentinel_auth_guard.lua en VPS no auditado |
| ES3-001 | INFO | 3 | `nginx.conf:66-71` | gzip de M3U8 OK industria standard |
| ES3-003 | INFO | 3 | `nginx.conf:14-19` | event loop autopista OK |
| ES2-003 | INFO | 2 | `ape_server_v15_ultimate.py:305` | Content-Type force OK |
| ES5-006 | INFO | 5 | `cmaf_packaging_engine.php` | preservation fMP4 boxes — full audit próxima sesión |
| ES5-007 | INFO | 5 | `lcevc_phase4_injector.php` | full audit próxima sesión |

---

## 7. Plan de remediation (próximas sesiones)

### Sesión próxima — eslabón 5 fixes (high priority)

1. **Autorización del usuario** para editar `dual_manifest_generator.php` (no es archivo locked)
2. Fix ES5-001 + ES5-002: cambiar `.90` → `.B0` (2 occurrences)
3. Fix ES5-003: refactor `resolveHlsCodecString()` para leer probe data y mapear al tier real de la cascada
4. Fix ES5-005: añadir emission de `VIDEO-RANGE`/`COLOR-PRIMARIES`/`TRANSFER-CHARACTERISTICS`/`MATRIX-COEFFICIENTS` en STREAM-INF cuando provider entrega HDR
5. Smoke test: regenerar lista de prueba, ejecutar `iptv-hls-validator` skill, confirmar Tier 9 emitido correctamente

### Sesión próxima — eslabón 2 minor

6. Fix ES2-001 + ES2-002: cambiar UA default en `inject_vlc_options` y `inject_kodi_props` a SmartTV per `feedback_http_407_proxy_auth_doctrine`

### Sesión próxima — full audit pendiente

7. Auditar `cmaf_packaging_engine.php` para verificar preservation de fMP4 boxes `colr`, `mdcv`, `clli`
8. Auditar `lcevc_phase4_injector.php` para LCEVC compliance
9. Auditar VPS sites-enabled (requiere `iptv-vps-touch-nothing` read-only) para confirmar `proxy_pass_request_headers off`

---

## 8. Cero touch durante esta audit

- ✅ Cero modificación a producción
- ✅ Cero comandos VPS (solo lectura local)
- ✅ Cero edición a archivos `m3u8-typed-arrays-ultimate.js` (Agent F lock)
- ✅ Cero commit git
- ✅ Cero secretos expuestos en este reporte
- ✅ OMEGA-NO-DELETE respetada (sólo lectura)

---

## 9. Doctrine alignment

Este audit valida (o refuta) que cada eslabón cumple su rol en la **Cadena de Manifestación** (per `ARTIFACT_CHAIN_OF_MANIFESTATION_11_ESLABONES.md`):

| Eslabón | Rol esperado | Cumplimiento |
|---|---|---|
| 2 API | preserve metadata sin reescritura destructiva | ✅ confirmed |
| 3 Nginx | reverse proxy SIN tocar EXT-X-* ni codec strings | ✅ confirmed (con sites-enabled assumption) |
| 4 Lua | passthrough/telemetry-only | ✅ confirmed |
| 5 CMAF | preserve colr/mdcv/clli boxes + emit codec strings RFC 6381 | ⚠ NO cumple — codec malformado + falta trifecta estándar |

---

## 10. Cross-references

- `ARTIFACT_CHAIN_OF_MANIFESTATION_11_ESLABONES.md` — doctrina de los 11 eslabones
- `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` — Tier 9 = `hvc1.1.6.L120.B0` (no `.90`)
- `ARTIFACT_HDR10_METADATA_TRIFECTA.md` — qué debería emitir hdr10plus_dynamic_engine
- `ARTIFACT_TAG_PARSING_GUARANTEE.md` — RFC 6381 §3.3 codec string format
- `ARTIFACT_M3U8_VALIDATION_SPEC.md` §7 — gate validator BLOCK on non-conforming codec string

---

**Fin Audit Eslabones 2-5 · ADN preservation forensic · cero touch a producción.**
