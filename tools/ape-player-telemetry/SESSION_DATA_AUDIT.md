# Auditoría de `#EXT-X-SESSION-DATA` de jugador (ExoPlayer)

Fuente: cabecera de `APE_LISTA_1793589060441.m3u8` (sha256 `523d52a6…5049d6`), 1 emisión de cada
`DATA-ID` (censo: `exoplayer.load_control`=1, `exoplayer.track_selection`=1, `com.ape.*`=22).

Skills aplicadas: `exoplayer-track-selection-tuner` · `exoplayer-mediacodec-logger-parser`
(anchor `player-compatibility-matrix`).

---

## Hecho previo que condiciona todo

`#EXT-X-SESSION-DATA` **es un tag estándar de HLS** y ExoPlayer lo **parsea**, pero lo deja en
`HlsManifest.sessionData`. **ExoPlayer NO lo aplica solo** a `DefaultLoadControl` ni a
`DefaultTrackSelector`. La app (o el fork) tiene que leerlo y construir los parámetros.

**Consecuencia:** estas directivas son **plano de control**, no configuración autoejecutada.
En OTT Navigator, TiviMate o ExoPlayer de fábrica no cambian nada salvo que el player las lea.

---

## 1 · `exoplayer.load_control` — **PARÁMETROS REALES** ✅

```json
{"minBufferMs":20000,"bufferForPlaybackMs":1000,"bufferForPlaybackAfterRebufferMs":2000,"maxBufferMs":30000}
```

Corresponden a `DefaultLoadControl.Builder#setBufferDurationsMs(minBufferMs, maxBufferMs,
bufferForPlaybackMs, bufferForPlaybackAfterRebufferMs)`.

| Campo | Valor | Real en ExoPlayer | Nota |
|---|---|---|---|
| `minBufferMs` | 20000 | ✅ | |
| `maxBufferMs` | 30000 | ✅ | |
| `bufferForPlaybackMs` | 1000 | ✅ | agresivo para **live** (recomendado ≥ 2500–3000) |
| `bufferForPlaybackAfterRebufferMs` | 2000 | ✅ | |

Restricción de ExoPlayer cumplida: `bufferForPlayback* ≤ minBufferMs` ✅.

**Riesgo:** 1 s de buffer para arrancar en directo es lo que provoca el primer rebuffer en redes
móviles. El propio repo exige `bufferForPlaybackAfterRebufferMs ≈ 5000` en varios perfiles.

Faltan campos reales que podrían mejorarlo: `prioritizeTimeOverSizeThresholds`, `targetBufferBytes`.

---

## 2 · `exoplayer.track_selection` — **UN PARÁMETRO INVENTADO** ❌

```json
{"maxDurationForQualityDecreaseMs":2000,"minDurationForQualityIncreaseMs":15000,"bandwidthFraction":0.65}
```

| Campo | ¿Existe en ExoPlayer? | Dónde vive de verdad |
|---|---|---|
| `minDurationForQualityIncreaseMs` | ✅ sí (`DefaultTrackSelector.Parameters`, default **10000**) | ExoPlayer |
| `maxDurationForQualityDecreaseMs` | ✅ sí (default **25000**) | ExoPlayer |
| **`bandwidthFraction`** | ❌ **NO EXISTE** | es **hls.js** (`abrBandWidthFactor`) |

**`bandwidthFraction` es un parámetro de hls.js metido en un `DATA-ID` de ExoPlayer.** Un lector
estricto de `TrackSelectionParameters` lo descartaría; peor, invita a creer que ExoPlayer tiene un
factor de banda equivalente, y no lo tiene.

### La dirección del tuning contradice la ley ANTI-DEGRADACIÓN

| Parámetro | Default ExoPlayer | Emitido | Efecto |
|---|---|---|---|
| bajada de calidad | 25 000 ms | **2 000 ms** | baja **12,5× más rápido** |
| subida de calidad | 10 000 ms | **15 000 ms** | sube **1,5× más lento** |

Resultado: **degrada en 2 s y tarda 15 s en recuperar**. Es el perfil más pesimista posible.
Contradice `docs/policies/ANTI_DEGRADATION_LAW.md` (no bajar la señal para resolver un fallo).

---

## 3 · Corrección propuesta (solo claves reales, dirección alineada con la ley)

```json
#EXT-X-SESSION-DATA:DATA-ID="exoplayer.track_selection",VALUE="{\"minDurationForQualityIncreaseMs\":8000,\"maxDurationForQualityDecreaseMs\":25000,\"minDurationToRetainAfterDiscardMs\":10000}"
```

- `minDurationForQualityIncreaseMs` 8000 (< default 10000): recupera antes.
- `maxDurationForQualityDecreaseMs` 25000 (= default): no degrada a la primera.
- `minDurationToRetainAfterDiscardMs` 10000: campo **real** que evita el efecto yoyó.
- **`bandwidthFraction` eliminado**: no existe. Si se quiere control de banda, va en
  `#EXT-X-SESSION-DATA:DATA-ID="com.ape.abr_quality_policy"` (namespace propio), no en `exoplayer.*`.

Y `load_control` corregido para live:

```json
#EXT-X-SESSION-DATA:DATA-ID="exoplayer.load_control",VALUE="{\"minBufferMs\":20000,\"maxBufferMs\":50000,\"bufferForPlaybackMs\":2500,\"bufferForPlaybackAfterRebufferMs\":5000,\"prioritizeTimeOverSizeThresholds\":true}"
```

---

## 4 · Telemetría: cómo saber si fluye de verdad

El `DATA-ID` dice lo que **se declara**. Para saber lo que **pasa**, el instrumento es logcat:

```powershell
adb logcat -d > logcat.txt
node tools/ape-player-telemetry/parse_mediacodec_logcat.js logcat.txt --json
```

Devuelve: códec elegido, clase de decoder (hw/sw), resolución decodificada, frames descartados,
tasa de descarte y **cobertura del parser**.

**Regla fail-honest:** cobertura < 1 significa que el parser no conoce ese formato de log,
**no** que no haya eventos. Nunca se lee una cobertura baja como "todo bien".

### Qué medir para decidir si la información fluye

| Señal | De dónde | Umbral |
|---|---|---|
| códec real vs declarado | `decoderInitialized` | debe ser HEVC si `CODECS=hvc1.*` |
| clase de decoder | nombre del códec (`c2.`/`OMX.` vs `.sw.`) | `hardware_candidate` en 4K |
| resolución decodificada | `videoInputFormat` | = la declarada en el manifiesto |
| tasa de descarte | `Dropped frames` | < 0,5 % |
| 302 → 200 en el manifiesto | `verify_http_matrix.js` | cadena completa |
| 206 real | `verify_http_matrix.js` | **hoy FALLA** |

---

## 5 · Veredicto

| Directiva | Estado | Acción |
|---|---|---|
| `exoplayer.load_control` | parámetros reales, valores agresivos para live | subir `bufferForPlayback*` |
| `exoplayer.track_selection` | **1 clave inventada + dirección anti-doctrina** | reemplazar por el payload de §3 |
| `com.ape.*` (22) | namespace propio, metadata declarativa | sin cambios; no las lee ningún player sin integración explícita |

**Ningún cambio aplicado.** Tocar el generador o el VPS requiere autorización y pasa por
`iptv-pre-edit-audit` + `iptv-vps-touch-nothing`.
