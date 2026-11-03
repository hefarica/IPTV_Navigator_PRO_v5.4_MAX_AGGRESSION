# 26 — Cómo medir de verdad `audio_channels`, `chroma` y `GOP` (sin inventar)

**Ciclo:** REA · entregable 26 · **diseño, sin código ni producción**. **Fecha:** 2026-10-28. Escrito solo en `docs/rea/`. **Evidencia:** `MEDIDO` = ejecutado/leído aquí con `archivo:línea` · `DOC` = documentación citada · `NOT_RUN` = no medible en esta sesión.
**Contexto:** `/a` ya reserva los slots **17 = AUDIO_CHANNELS · 18 = CHROMA (0=420,1=422,2=444) · 19 = GOP (frames)** (`_vps_stage/lua/ape_attr.lua:267-283`), con la regla explícita **«se emiten SÓLO si hay valor. Nunca se inventa un valor»** (`:268`, y `docs/rea/22_SLOTS_ENDPOINT.md:51`) y `0xFFFF = sin dato` (`ape_attr.lua:26`). Hoy esos slots no tienen fuente. Este documento define cómo obtenerlos.

---

## 1. Qué hay hoy (y por qué no sirve)

| pieza | qué es en realidad | por qué no da 17/18/19 | fuente |
|---|---|---|---|
| `ape-quality-prober.js` | `fetch()` del **manifiesto** + `resp.text()` + regex de atributos (`EXT-X-STREAM-INF`/`SUPPLEMENTAL-CODECS`) | sólo ve **texto de playlist**: no hay bitstream, ni pista de audio real, ni frames | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-quality-prober.js:107,123,192-207` |
| `audioCodec` del prober | se deduce del **string `CODECS=`**, no del stream | un `mp4a.40.2` declarado no dice 2/6/8 canales; puede ser mentira del proveedor | `…/ape-quality-prober.js:247,273` |
| `X-Chroma-Subsampling` | **literal de LAB**: `"4:2:2,4:2:0"` en la matriz; emisión con `cfg.chroma_subsampling \|\| '4:2:0'` | es una **constante/config**, igual para todos los canales ⇒ no es medición | `…/ape-profiles-config.js:522` · `m3u8-typed-arrays-ultimate.js` HEAD:5170 · defaults por perfil HEAD:2034-2272 |
| `X-TELCHEMY-GOP-POLICY` | **nombre de cabecera** en la lista LAB (valor fijo, p. ej. `MAX_SIZE=120,MIN_IDR_INTERVAL=2s`) | es una **política declarada**, no el GOP del stream | `…/ape-profiles-config.js:273` · plantilla `#EXT-X-TELCHEMY-GOP-POLICY:MAX_SIZE=120,…` |

**Conclusión §1:** el generador **no tiene** esos datos por canal; `t57` hizo bien en negarse. Cualquier número ahí hoy sería ficción.

---

## 2. Opciones reales de medición

| opción | qué SÍ da (verificado) | qué NO da / límite | coste | nivel | fuente |
|---|---|---|---|---|---|
| **(a) `ffprobe` server-side sobre el 1.er segmento** | `-show_streams` → `channels` (audio), `pix_fmt` (⇒ chroma 4:2:0/4:2:2/4:4:4 y bit depth), `codec_name/profile/level`, `color_*`; `-show_frames` → `key_frame`/`pict_type` (⇒ intervalo de IDR = GOP) | **GOP necesita ≥2 keyframes**: si el segmento es más corto que el GOP, no se observa ⇒ `0xFFFF`; `pix_fmt` puede venir del decoder y no del SPS si hay conversión | decodifica N frames (ver §3) | **POSIBLE** (no desplegado) | flags verificados **MEDIDO** local (`ffprobe 8.0.1`: `-select_streams`, `-show_streams`, `-show_frames`, `-show_entries`, `-read_intervals`) · [ffprobe docs](https://ffmpeg.org/ffprobe.html) |
| **(b) Probe en browser: MSE + MediaCapabilities** | `decodingInfo()` responde **supported / smooth / powerEfficient** para una config (codec, resolución, bitrate) | **NO** expone `channels`, `chroma` ni `GOP` del stream: es una consulta de **capacidad del device**, no del contenido | ~0 (cliente) | **NO_VERIFICABLE** para 17/18/19 (sirve como pre-filtro) | [MDN Media Capabilities](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capabilities_API) |
| **(c) Parsear `SPS/PPS` del bitstream (H.264/H.265)** | verdad de **bitstream**: `chroma_format_idc` (4:2:0/4:2:2/4:4:4), bit depth; GOP = distancia entre IDR | implementación propia (exp-Golomb) o vía decoder; **no** da audio; requiere bytes del segmento y NAL parsing | CPU baja, pero código nuevo y frágil | **POSIBLE** (más caro de mantener que (a)) | [ffprobe `pix_fmt`/`color_*`](https://ffmpeg.org/ffprobe.html) · ITU-T H.264/H.265 (`chroma_format_idc`) — **NV**: no se descargó la norma en esta sesión |

**Nota:** (a) y (c) miden lo mismo por caminos distintos; (a) es la vía con menos código propio y ya está disponible como binario.

---

## 3. Coste y riesgo

| eje | análisis | mitigación propuesta |
|---|---|---|
| **CPU/RAM (VPS 2 GB, 3 cores, sin GPU)** | `ffprobe` sobre **1 segmento** decodifica pocos frames (no transcodifica); el coste real es desconocido ⇒ **NOT_RUN**. Referencia del mismo host: manifiesto = µs; transcode 1080p→4K = 8-9 s/segmento | proceso **fuera de fase** (no bloquea la playlist), `nice`, concurrencia ≤1-2, timeout por canal |
| **Latencia de generación** | si el probe es síncrono, añade segundos por canal | **cache-first**: la lista se genera con lo que haya; el probe rellena en background |
| **Egress al proveedor** | 1 descarga de segmento por canal y refresco | **1 segmento / canal / 24 h**, con `-read_intervals` y tope de bytes; sólo streams **autorizados** por el propietario |
| **Caché** | clave = `channel_id + url-hash` (+ `ETag`/`Last-Modified` si existe) | TTL 24 h; invalidar si cambia la variante declarada |
| **Fallo del probe** | nunca se inventa | escribir `0xFFFF` (contrato §1) y **no** emitir el slot en la máscara; log con el exit code de ffprobe |
| **Legal/ético** | sólo streams que el propietario ya tiene autorizados; sin bypass ni scraping de terceros | registrar en el mismo gate la lista de canales autorizados |

---

## 4. Veredicto y mínima viable

| opción | veredicto | motivo |
|---|---|---|
| (a) `ffprobe` server-side | **POSIBLE** (recomendada) | herramienta verificada, cubre 17/18/19 + 16/20/22/23/24/25 con el mismo JSON; requiere componente nuevo y ventana autorizada |
| (b) MSE/MediaCapabilities | **NO_VERIFICABLE** para 17/18/19 | sólo capacidad del device; útil como pre-filtro, no como fuente |
| (c) SPS/PPS propio | **POSIBLE** (no recomendada a corto plazo) | verdad de bitstream, pero exige parser propio y no cubre audio |

**Mínima viable (lo que se propone implementar cuando haya autorización):** un probador único `ffprobe` por canal con
`-v error -select_streams v:0 -show_entries stream=codec_name,profile,level,pix_fmt,color_space,color_transfer,color_primaries -of json`
y `-select_streams a:0 -show_entries stream=channels` sobre **el primer segmento**, más
`-show_entries frame=key_frame,pict_type -read_intervals %+<N>` para GOP; resultado a caché 24 h y de ahí a los slots 16-26.

**Gate medible (antes de publicar cualquier valor):**
1. **0 valores inventados**: cada slot ≠ `0xFFFF` debe traer el JSON crudo de ffprobe como evidencia.
2. **Cobertura declarada**: `n_medidos / n_intentados / n_fallidos`, y los fallidos en `0xFFFF`.
3. **No bloqueante**: la generación de la lista no aumenta su p95 de latencia con el probe apagado vs encendido.
4. **Egress acotado**: ≤1 segmento por canal y 24 h, verificado en el log del propio probador.
5. **GOP honesto**: si el segmento no contiene ≥2 keyframes ⇒ `GOP=0xFFFF` (nunca estimado).

---

## 5. NOT_RUN explícito

- **NOT_RUN**: no se ejecutó `ffprobe` sobre **ningún canal real** (no hay muestra autorizada ni ventana aprobada). Todo §3-CPU y §4-gate queda como diseño.
- **NOT_RUN**: efecto del probe en la latencia de generación y en el egress real del VPS.
- **NV**: norma ITU-T H.264/H.265 no descargada; los nombres de campo `chroma_format_idc` se citan como referencia, no verificados en esta sesión.

## 6. Fuentes

1. https://ffmpeg.org/ffprobe.html — `-show_streams`/`-show_frames`/`-show_entries`/`-read_intervals` (+ `probesize`/`analyzeduration` como opciones de formato).
2. https://developer.mozilla.org/en-US/docs/Web/API/Media_Capabilities_API — `decodingInfo()` ⇒ supported/smooth/powerEfficient (capacidad, no propiedades del stream).
3. Repo (**leído**): `_vps_stage/lua/ape_attr.lua:26,267-283` · `frontend/js/ape-v9/ape-quality-prober.js:107,123,192-207,247,273` · `frontend/js/ape-v9/ape-profiles-config.js:273,522` · `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (HEAD) `:2034,2272,5170` · `docs/rea/22_SLOTS_ENDPOINT.md` (contrato de slots).
4. Medición local (**MEDIDO**, sin tocar producción): `ffprobe version 8.0.1-full_build` con `-select_streams`, `-show_streams`, `-show_frames`, `-show_entries`, `-read_intervals` presentes.
