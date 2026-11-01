# AUDITORÍA — `APE_LISTA_1793558303852_CDN.m3u8`

**Fecha:** 2026-11-01 · **Skills aplicadas:** `max-cll-emitter`, `max-fall-emitter`, `iptv-m3u8-auditor`
**Archivo auditado:** `APE_LISTA_1793558303852_CDN.m3u8`
**SHA-256:** `882dddf0524c913a8a708b6814502490e66262cff2d8ad3726ac5e088a93cf79`
**Tamaño:** 606.074.057 bytes (578,0 MiB) · **Líneas:** 10.315.622 · **Canales:** 10.573
**Tipo:** catálogo M3U Plus + directivas HLS por canal (no es un media playlist)

---

## 0. Veredicto en una línea

La lista es **estructuralmente disciplinada** (1 URL por canal, 1 STREAM-INF por canal, EXTHTTP JSON válido, sin headers prohibidos) pero **semánticamente contradictoria en HDR**: declara `4K HEVC Main10 PQ + Dolby Vision P8` sobre contenido real **H.264 1080p 8-bit SDR**, y emite **cuatro pares distintos de MaxCLL/MaxFALL** en el mismo canal, algunos **físicamente imposibles** (`MaxCLL > peak`, `MaxFALL(avg) > MaxCLL(peak)`, `MaxCLL = 0`).

**Scorecard:** rúbrica legacy de la skill **2,59/10** (falsos negativos por nombres/case); rúbrica semántica de 19 dimensiones **≈4,7/10**. Sub-score HDR/MaxCLL: **2/10**.

---

## 1. Ficha técnica

| Métrica | Valor |
|---|---|
| Bytes / líneas | 606.074.057 / 10.315.622 |
| Canales (`#EXTINF`) | 10.573 (= `#EXT-X-APE-CHANNELS:10573`) |
| Cabecera global | 148 líneas (incluye 20 chunks base64 `#EXT-X-APE-LAB-METADATA` ≈ 67 KB) |
| Líneas por canal | min 951 · p50 973 · p90 974 · max 976 · **media 973** |
| EXTVLCOPT | 1.416.782 (134,0/canal) |
| KODIPROP | 1.089.019 (103,0/canal) |
| `#EXTATTRFROMURL` | 570.942 (54,0/canal) |
| `#EXT-X-APE-*` | 6.498.682 (614,6/canal) |
| `#EXTHTTP` | 10.573 (1/canal; 200 headers en 5.803 canales; máx 8.124 B) |
| `#EXT-X-STREAM-INF` | 10.573 (1/canal) |
| URLs | 10.573 (1/canal; 0 canales sin URL, 0 con >1) |
| `#EXT-X-MEDIA` / `#EXT-X-KEY` / `#EXT-X-ENDLIST` / `#EXT-X-PLAYLIST-TYPE` | 0 / 0 / 0 / 0 |
| `#EXT-X-I-FRAME-STREAM-INF` | 10.573 · con `URI=` **0** ✅ |
| Fin de línea | LF (0 CRLF) · BOM: no |
| Dominio de URLs | `iptv-ape.duckdns.org` (100 %) |
| Perfiles declarados | P4 7.457 (70,5 %) · P3 2.308 (21,8 %) · P1 808 (7,6 %) |
| Grupos top | Europa Occ. Generalista FHD 1.960 · Europa Occ. Deportes FHD 1.084 · LATAM Generalista FHD 610 · Europa Or. Generalista FHD 600 |

**Lo bueno (no rehacer):**
- Anti-509 correcto: exactamente 1 URL por `#EXTINF`, 1 `#EXT-X-STREAM-INF` por canal.
- `#EXT-X-I-FRAME-STREAM-INF` sin `URI=` (metadata, no abre conexión extra).
- Cero `#EXT-X-ENDLIST` / `#EXT-X-PLAYLIST-TYPE` (correcto en catálogo).
- EXTHTTP: **10.573/10.573 JSON válido**, **0 headers prohibidos** (Range/If-None-Match/If-Modified-Since/TE/Priority/Connection…). Verificado parseando los 10.573 JSON.
- Tags LL-HLS **no** invaden el bloque por canal (solo cabecera global): no rompen el parseo tipo M3U Plus.

---

## 2. MaxCLL / MaxFALL — auditoría dedicada (`max-cll-emitter`, `max-fall-emitter`)

### 2.1 Inventario de emisores (los 4+ pares)

| # | Emisor | Nº canales | Valores |
|---|---|---|---|
| E1 | `#EXT-X-APE-HDR-MAXCLL` / `#EXT-X-APE-HDR-MAXFALL` | 10.573 | CLL 100/400/1500 · FALL 25/100/375 |
| E2 | `#EXT-X-APE-HDR-METADATA:…PEAK=<n>,AVG=<n>` | 10.573 | PEAK 100/400/1500 · **AVG=1000 fijo** |
| E3 | `#EXT-X-DATERANGE … X-HDR-MAX-CLL=<n>,X-HDR-PEAK-LUMINANCE=<n>` | 10.574 (1 global + 1/canal) | CLL 600/1000/4000 · PEAK 400/600/2000 · **sin `X-HDR-MAX-FALL` (0 ocurrencias en todo el archivo)** |
| E4 | EXTHTTP `X-APE-MaxCLL` / `X-APE-MaxFALL` | 10.573 | **0/0 (9.086 canales)** · 400/100 (1.487) |
| E5 | EXTHTTP `X-HDR-MaxCLL` / `X-HDR-MaxFALL` + `X-HDR-Mastering-Display` + HDR10+/DV MaxLuminance | 10.573 | **5000 / 800 / L(5000,0.0005) fijos** |

### 2.2 Matriz por perfil (declarado, sin sondeo)

| Perfil | Canales | E1 CLL/FALL | E3 CLL/PEAK | E2 PEAK/AVG | E4 CLL/FALL | E5 CLL/FALL | HDR declarado | Fuente real (EXTHTTP) | Declarado STREAM-INF |
|---|---|---|---|---|---|---|---|---|---|
| P4 | 7.457 | 100/25 | 600/400 | 100/1000 | 0/0 | 5000/800 | SDR | 1280x720 | 3840x2160 |
| P3 | 2.308 | 400/100 | 1000/600 | 400/1000 | 400/100 (1.487) · 0/0 (821) | 5000/800 | SDR + HLG fallback | 1920x1080 | 3840x2160 |
| P1 | 808 | 1500/375 | 4000/2000 | 1500/1000 | 0/0 | 5000/800 | HDR10 + HLG | 3840x2160 | 3840x2160 |

### 2.3 Hallazgos con conteo exacto

| ID | Hallazgo | Evidencia (10.573 canales) | Severidad |
|---|---|---|---|
| HDR-01 | **Valores MaxCLL/MaxFALL contradictorios entre emisores del MISMO canal** (4 fuentes) | `cllDistinctValues = 10.573/10.573` (100 %). Ej.: P3 → tag 400, metadata 400, DATERANGE 1000, EXTHTTP 5000, header X-APE 400/0 | **CRITICAL** |
| HDR-02 | **`MaxCLL > peak luminance` en DATERANGE** (físicamente imposible) | 10.573/10.573 (100 %): 600>400 · 1000>600 · 4000>2000 | **HIGH** |
| HDR-03 | **`MaxFALL` (AVG) > `MaxCLL` (PEAK)** en `#EXT-X-APE-HDR-METADATA` | 9.765/10.573 (92,4 %): PEAK 100 vs AVG 1000; PEAK 400 vs AVG 1000 | **HIGH** |
| HDR-04 | **`X-APE-MaxCLL = 0` / `X-APE-MaxFALL = 0`** (valor inválido para HDR10; no es "ausencia") | 9.086/10.573 (86 %) | **HIGH** |
| HDR-05 | **Tag vs EXTHTTP discrepan** | 9.086/10.573 (86 %): tag 100/400/1500 vs header 0 | **HIGH** |
| HDR-06 | **`X-HDR-MaxCLL=5000`, `X-HDR-MaxFALL=800`, mastering `L(5000,…)`, HDR10+/DV 5000 fijos** sobre canales SDR | 10.573 (100 %); 9.765 SDR (92,4 %) | **CRITICAL** |
| HDR-07 | **DATERANGE sin `MaxFALL`** (asimetría CLL sí / FALL no) | `X-HDR-MAX-FALL=` = **0 ocurrencias** en 606 MB | **MEDIUM** |
| HDR-08 | **`HDR-VERIFIED=false` y `QUALITY-SOURCE=ESTIMATED` en el 100 %**: los valores no son medidos | 10.573/10.573 | **HIGH** (contexto: invalida cualquier claim numérico) |
| HDR-09 | **HDR10+ declarado sin tag/SEI**: EXTHTTP `X-HDR10-Plus: enabled` en 100 %, pero `#EXT-X-APE-HDR10PLUS` = **0** y no hay metadata dinámica en el stream | 10.573/10.573 | **HIGH** |
| HDR-10 | **DV Profile 8 declarado sobre SDR** (`#EXT-X-APE-DV-PROFILE:8`, `X-Dolby-Vision-RPU: present`) | 9.765/10.573 (92,4 %) | **HIGH** |

### 2.4 Verificación contra contenido REAL (ffprobe, 2 canales)

No se puede validar MaxCLL/MaxFALL sin mirar el bitstream. Se descargó **1 segmento** de dos canales del gateway (read-only) y se sondeó con `ffprobe 8.0.1`:

| Canal | Perfil lista | Declarado en la lista | Segmento real (ffprobe) |
|---|---|---|---|
| `.../3.m3u8` (P3, ∈ 1080p) | P3 | `3840x2160`, `hvc1.2.4.L153.B0`, `VIDEO-RANGE=PQ`, MaxCLL 400 / FALL 100, DV P8 | **H.264 High@L4.0 · 1920x1080 · yuv420p (8-bit) · bt709 SDR · 25 fps · MPEG-TS · 4,14 Mbps** · sin side-data HDR |
| `.../47.m3u8` (`KLAN MACEDONIA 4K`, P1) | P1 | `3840x2160`, `hvc1.2.4.L153.B0`, `PQ`, MaxCLL 1500 / FALL 375, HDR10+HLG, DV P8 | **H.264 Main@L4.0 · 1920x1080 · yuv420p · 25 fps · MPEG-TS · 6,45 Mbps** · sin metadata de color ni HDR |

Manifiestos entregados por el gateway: `#EXT-X-VERSION:3`, `TARGETDURATION:11`, segmentos `.ts`, **sin `#EXT-X-MAP`**, cabeceras `X-APE-LL-HLS: none`, `X-APE-UHD: off`. Es decir: **HLS clásico MPEG-TS, no CMAF/LL-HLS, no 4K, no HEVC, no HDR**.

> Consecuencia directa: los valores MaxCLL/MaxFALL (y `PEAK`, `MaxLuminance`, DV P8, HDR10+) **describen contenido que no existe en el bitstream**. Son estimaciones de perfil, no metadata HDR10 verificada.

---

## 3. Declaración vs realidad (además de HDR)

| ID | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| DEC-01 | **Todos los canales declaran el mismo codec/resolución**: `CODECS="hvc1.2.4.L153.B0,mp4a.40.2"`, `RESOLUTION=3840x2160`, `VIDEO-RANGE=PQ` | 10.573/10.573; real H.264 1080p | **CRITICAL** (riesgo FZ-01 en players estrictos: declara HEVC sobre AVC) |
| DEC-02 | **Motor `4KFALSE` ACTIVO en el 100 %**, target 4K, sobre fuentes 720p/1080p (92,4 %) e incluso sobre las 808 “4K” reales | `#EXT-X-APE-4KFALSE-MODE:ACTIVE` 10.573 · target 3840x2160 | **HIGH** |
| DEC-03 | **Tres codecs distintos en el mismo canal**: STREAM-INF `L153`, EXTHTTP `X-APE-Codec-Video: L150/L123`, QUALITY-OVERRIDE `CODEC: L123` | `streamCodecNeExthttpCodec = 1.487` (L153 vs L150); L123 en override | **HIGH** |
| DEC-04 | **CMAF/LL-HLS declarados, TS clásico real** | `#EXT-X-CMAF-*` 10.573; `#EXT-X-PART:` 0; `PRELOAD-HINT` 0; manifiesto real v3/TS | **HIGH** |
| DEC-05 | **`#EXT-X-CONTENT-STEERING:SERVER-URI="pool://failover"`** (URI inválido, 1 sola, global) | 1 ocurrencia | **MEDIUM** |
| DEC-06 | **`#EXT-X-MEDIA` = 0**: sin renditions de audio/subtítulos; el player solo tiene EXTVLCOPT/KODIPROP | 0 ocurrencias | **MEDIUM** |
| DEC-07 | **`vrr_sync` KODIPROP ausente** aunque se emiten 10 tags VRR/canal y `QUALITY-OVERRIDE-VRR:24-120Hz` | `vrr_sync` = 0 | **MEDIUM** |
| DEC-08 | **`#EXT-X-DEFINE` = 0**: manifest sin compresión por variables; solo flag `SYS-COMPRESSION:gzip` | 0 ocurrencias | **LOW** |
| DEC-09 | **Perfil de lista P1 vs perfil de runtime del gateway P3** en el canal 4K (`X-APE-Floor-Fuse: PROFILE=P3`) | cabecera del manifiesto 47.m3u8 | **MEDIUM** |
| DEC-10 | **DATERANGE global P0** (`X-HDR-MAX-CLL=10000`, `HDR10+DV-P81-P10`) con **0 canales P0** en la lista | 1 DATERANGE global; profiles = P4/P3/P1 | **LOW** |

---

## 4. Estructura HLS / catálogo

| Chequeo | Resultado | Veredicto |
|---|---|---|
| 1 URL por `#EXTINF` | 10.573/10.573 | ✅ |
| 1 `#EXT-X-STREAM-INF` por canal | 10.573/10.573 | ✅ |
| `#EXT-X-MEDIA` con `URI=` | 0 | ✅ (no hay MEDIA) |
| `#EXT-X-I-FRAME-STREAM-INF` con `URI=` | 0/10.573 | ✅ |
| `#EXT-X-ENDLIST` / `PLAYLIST-TYPE` en catálogo | 0/0 | ✅ |
| `#EXT-X-VERSION` | 9 (global) | ✅ |
| Tags LL-HLS por canal (`PART`, `PRELOAD-HINT`) | 0 | ⚠️ declarativo, no real |
| `#EXT-X-KEY` | 0 | ⚠️ streams en claro (puede ser correcto) |
| EXTHTTP JSON válido | 10.573/10.573 | ✅ |
| Headers prohibidos exactos en EXTHTTP | 0/10.573 | ✅ |
| EXTHTTP > 7.800 B | 7.457 (70,5 %); máx 8.124 B | ⚠️ margen nginx 8K muy justo |
| Tamaño total / por canal | 606 MB / 973 líneas | ⚠️ import/zapping risk |

---

## 5. Scorecard 19 dimensiones (`iptv-m3u8-auditor`)

Rúbrica semántica (no literal): 0 = ausente, 10 = completo y verificado.

| # | Dimensión | Score | Evidencia / carencia principal |
|---|---|---:|---|
| D1 | Dynamic Range Classifier | **4** | Tags HDR por perfil + tipo en DATERANGE, pero sin `tonemap`/`colorspace`/`trc` y PQ sobre SDR |
| D2 | Space Validator | **3** | Sin `yuv444p`, `chromal`, `deband`; bit-depth declarado 10/12 vs real 8 |
| D3 | Bitrate Anarchy | **5** | `X-Max/Min-Bitrate`, ladder y tag `BITRATE-ANARCHY`; sin ramp/monitor por canal |
| D4 | Hardware Spoofing | **5** | UA pool por perfil, `X-Device-Capabilities/Type`; sin `X-Device-Class`/`Decoding-Capability` |
| D5 | Quantum Pixel | **4** | Tag `QUANTUM-PIXEL` + unsharp/nlmeans; sin 4:4:4/10-bit reales |
| D6 | Luma Precision | **6** | nlmeans + unsharp + LUMA-PRECISION; sin hqdn3d; efectos solo declarados |
| D7 | Network Buffer | **7** | network/live/file-caching + prefetch 16/15/8 en EXTHTTP |
| D8 | Codec Priority | **5** | `X-Quality-Preference` HEVC-first; CODEC-PRIORITY ausente; hvc1 sobre AVC real |
| D9 | HLS Metadata L10 | **7** | 1 STREAM-INF, 1 URL, I-FRAME sin URI; falta `#EXT-X-MEDIA` |
| D10 | VRR / Refresh Sync | **3** | Tags VRR y override 24–120 Hz; sin `vrr_sync` KODIPROP ni tunneling |
| D11 | AI / DLSS | **6** | AI-SR/FI + CORTEX por canal; sin efecto medible en bitstream |
| D12 | Audio Pipeline | **6** | `audio_passthrough` 10.573 + Atmos; sin eARC ni renditions |
| D13 | DRM / License | **3** | Claims en EXTHTTP (`X-DRM-Support`, PSSH flags); sin `EXT-X-KEY` ni licencias |
| D14 | Auditoría automática | **7** | TELCHEMY ×11/canal + SCORECARD tags |
| D15 | LL-HLS | **2** | Solo `SERVER-CONTROL`/`PART-INF` globales; 0 `PART`/`PRELOAD-HINT`; real TS 10 s |
| D16 | Multi-CDN | **2** | 1 `CONTENT-STEERING` global con `pool://failover` inválido |
| D17 | Zapping | **7** | `manifest_type=hls` + `stream_selection_type`; targets globales |
| D18 | Telemetría activa | **5** | 24 `SESSION-DATA` globales + QOE engine; 0 por canal |
| D19 | Compresión de manifest | **2** | Sin `EXT-X-DEFINE`; solo flag SYS gzip |
| | **Media (19)** | **4,7/10** | |

### Rúbrica legacy de la skill (14 GAP, tal cual su script)
`2,59/10` — **no usar como veredicto**: el script `audit_pipeline.py` está hardcodeado a otro archivo y hace `in content` **case-sensitive** con vocabulario de abril-2026; esta lista de noviembre usa CamelCase (`X-Cortex-AI-Super-Resolution`) y tags APE nuevos, produciendo falsos negativos (p. ej. GAP-10/11 puntúan 0 aunque las features existen). Detalle en `summary.json → legacy_14gap`.

---

## 6. Plan de corrección priorizado

### P0 — Verdad HDR / MaxCLL·MaxFALL (obligatorio antes de publicar)
1. **Un solo emisor canónico** de MaxCLL/MaxFALL por perfil; los demás (tags E1/E2/E3 y headers E4/E5) deben **derivarse del mismo par**.
2. **Invariantes duras** en generación y en el validador:
   `0 < MaxFALL ≤ MaxCLL ≤ peak_luminance` y `AVG ≤ PEAK`. Si no se cumple → abortar la emisión de números (no publicar).
3. **No emitir `0`** como MaxCLL/MaxFALL (9.086 canales). Si no hay medición: **omitir** los campos o marcar `MEASURED=false` sin valor numérico.
4. **DATERANGE**: `X-HDR-PEAK-LUMINANCE ≥ X-HDR-MAX-CLL`; añadir `X-HDR-MAX-FALL` (hoy ausente).
5. **Eliminar hardcodes 5000/800/`L(5000…)`/HDR10+-DV MaxLuminance** o derivarlos del perfil/SSOT; no declarar HDR10+/DV sin metadata real.
6. **DV**: emitir `DV-PROFILE` solo si la base layer es HDR10 real; quitar `RPU=present` sin verificación.
7. Añadir test automático: parsear una lista y fallar si `distinct(MaxCLL sources) > 1` o se viola el invariante.

### P1 — Declaración de codec/resolución
8. Gate de `CODECS`/`RESOLUTION` por evidencia real (`QUALITY-SOURCE`); si es `ESTIMATED`, **no declarar hvc1/L153/4K/PQ** en STREAM-INF (usar el real o mover el “virtual 4K” a tags internas no player-facing). Mantener el guard LEVER B (nunca `hvc1` sobre AVC en P2–P5).
9. Unificar los 3 codecs por canal (STREAM-INF / EXTHTTP / QUALITY-OVERRIDE); hoy hay hasta 3 valores.
10. No emitir `#EXT-X-CMAF-*`/LL-HLS si el manifiesto real es TS clásico; o marcarlos como “intención del daemon” fuera de atributos que el player interpreta.
11. Corregir `CONTENT-STEERING` (`pool://` no es URI HTTP) o retirarlo.

### P2 — Peso y operación
12. **Reducir 973 líneas/canal**: mover directivas comunes a cabecera y dejar ≤300/canal; objetivo <150 MB (hoy 606 MB).
13. Mantener EXTHTTP ≤ 7.800 B (hoy 7.457 canales por encima) y ≤200 headers (ya en el límite: 5.803 canales a 200).
14. Añadir `#EXT-X-MEDIA` para audio/subs si se conocen; `vrr_sync` si se pretende VRR.
15. Partir la lista por región/grupo para import/zapping.

---

## 7. Evidencia y reproducibilidad

```bash
# 1) Métricas globales + inventario de tags (streaming, 42 s)
node audit-list.js <lista.m3u8>           # → audit.json

# 2) Coherencia MaxCLL/MaxFALL por canal (14 s)
node audit-hdr.js  <lista.m3u8>           # → hdr-audit.json + hdr-audit.tsv

# 3) Distribución de valores HDR/4K y marcadores de 19 dimensiones (≈40 s)
node value-scan.js <lista.m3u8>           # → value-counts.json
node scan-patterns.js <lista.m3u8>        # marcadores LL-HLS/MEDIA/DEFINE/KEY...
node scan-exthttp.js  <lista.m3u8>        # 0 JSON inválido, 0 headers prohibidos

# 4) Rúbrica legacy de la skill (14 GAP, streaming)
node legacy-14gap.js <lista.m3u8>         # → legacy-14gap.json

# 5) Contenido real (ffprobe) — 2 canales: P3 y P1/4K
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,width,height,pix_fmt,color_space -of json <segmento.ts>
```

**Límites de esta auditoría:** se sondeó el bitstream de **2 de 10.573 canales** (muestreo); el resto se evaluó por metadata. Los dos casos elegidos cubren P3 (1080p) y P1 (“4K”), y **ambos** entregaron H.264 1080p SDR, por lo que la conclusión “no hay 4K/HEVC/HDR real” es evidencia directa en 2/2 muestras, no una extrapolación de laboratorio.

---

## 8. Artefactos

| Archivo | Contenido |
|---|---|
| `summary.json` | métricas consolidadas (estructura, EXTHTTP, MaxCLL, probes, legacy) |
| `maxcll_matrix.tsv` | matriz por perfil de los 5 emisores |
| `hdr-audit.tsv` | 10.573 filas por canal (valores MaxCLL/FALL/HDR/res/codec) |
| `legacy-14gap.json` | puntuación legacy con huecos por dimensión |
| `REPORT.md` | este informe |
| `SHA256SUMS` | hash de artefactos + hash del archivo auditado |
