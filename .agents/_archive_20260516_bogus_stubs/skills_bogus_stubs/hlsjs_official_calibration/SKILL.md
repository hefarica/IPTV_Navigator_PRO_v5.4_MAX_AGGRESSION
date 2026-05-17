---
name: hlsjs-official-calibration
description: "Calibración de perfiles P0-P5 usando los valores DEFAULT OFICIALES de HLS.js v1.6.15 extraídos del source code (github.com/video-dev/hls.js/src/config.ts). Usar cuando: el usuario reporte cortes/freezes/lacks/rebuffer, se calibre un nuevo perfil, se revisen valores de ABR/buffer/stall detection, o se quiera garantizar 0 cortes 0 bugs 0 freezes con máxima calidad."
---

# HLS.js Official Calibration Skill

Extraído del source code oficial de HLS.js (repo `video-dev/hls.js`, archivo `src/config.ts`).

## Valores DEFAULT Oficiales (NO los inventes)

```javascript
// ── BUFFER ─────────────────────────────────────────────────────
maxBufferLength: 30             // segundos
maxMaxBufferLength: 600         // segundos (techo absoluto)
maxBufferSize: 60 * 1000 * 1000 // 60MB
maxBufferHole: 0.1              // segundos de tolerancia a gaps
backBufferLength: Infinity      // NO limitar por default
frontBufferFlushThreshold: Infinity

// ── STALL DETECTION (gap-controller) ─────────────────────────
detectStallWithCurrentTimeMs: 1250  // ⚠️ 1250ms, NO 250ms
highBufferWatchdogPeriod: 2         // segundos
nudgeOffset: 0.1                    // segundos
nudgeMaxRetry: 3
nudgeOnVideoHole: true
skipBufferHolePadding: 0.1

// ── ABR ────────────────────────────────────────────────────────
abrEwmaFastLive: 3              // ventana rápida EWMA
abrEwmaSlowLive: 9              // ventana lenta EWMA
abrEwmaFastVoD: 3
abrEwmaSlowVoD: 9
abrEwmaDefaultEstimate: 500000  // 500 kbps estimación inicial
abrEwmaDefaultEstimateMax: 5e6  // 5 Mbps cap
abrBandWidthFactor: 0.95        // usar 95% del BW estimado
abrBandWidthUpFactor: 0.7       // ⚠️ necesita 43% más BW para subir
abrMaxWithRealBitrate: false    // default OFF
abrSwitchInterval: 0            // ⚠️ SIN delay entre switches
maxStarvationDelay: 4           // segundos antes de emergency switch
maxLoadingDelay: 4              // segundos max load delay

// ── LIVE / LOW LATENCY ─────────────────────────────────────────
lowLatencyMode: true
liveSyncMode: 'edge'
liveSyncDurationCount: 3
liveMaxLatencyDurationCount: Infinity
liveSyncOnStallIncrease: 1
maxLiveSyncPlaybackRate: 1

// ── FRAGMENT LOADING POLICY ────────────────────────────────────
fragLoadPolicy.default.maxTimeToFirstByteMs: 10000
fragLoadPolicy.default.maxLoadTimeMs: 120000
fragLoadPolicy.default.timeoutRetry.maxNumRetry: 4
fragLoadPolicy.default.errorRetry.maxNumRetry: 6
fragLoadPolicy.default.errorRetry.retryDelayMs: 1000
fragLoadPolicy.default.errorRetry.maxRetryDelayMs: 8000

// ── PLAYLIST LOADING POLICY ────────────────────────────────────
playlistLoadPolicy.default.maxTimeToFirstByteMs: 10000
playlistLoadPolicy.default.maxLoadTimeMs: 20000
playlistLoadPolicy.default.timeoutRetry.maxNumRetry: 2
playlistLoadPolicy.default.errorRetry.maxNumRetry: 2

// ── WORKER ─────────────────────────────────────────────────────
enableWorker: true              // CRITICAL para performance
enableSoftwareAES: true
```

## 3 TRAMPAS CRÍTICAS — Valores que estaban MAL en nuestros perfiles

### Trampa 1: `detectStallWithCurrentTimeMs: 250`
**Por qué estaba mal:** 250ms es DEMASIADO agresivo. HLS.js usa 1250ms.
**Síntoma:** Falsos positivos de stall → nudges innecesarios → cortes visibles al usuario.
**Fix:** Usar 1250ms (oficial).

### Trampa 2: `abrBandWidthUpFactor: 0.90`
**Por qué estaba mal:** 0.90 hace que sea MUY fácil subir de calidad, causa oscilaciones.
**Síntoma:** Sube calidad → BW no alcanza → baja calidad → repetir = rebuffer loop.
**Fix:** Usar 0.70 (oficial). Con 0.70 se necesita 43% MÁS bandwidth del esperado para hacer upgrade. Da estabilidad.

### Trampa 3: `abrSwitchInterval: 5-15s`
**Por qué estaba mal:** HLS.js NO limita switches por default (0ms). Confía en EWMA para evitar oscilaciones.
**Síntoma:** Forzar switchInterval alto impide que el player reaccione a cambios reales de BW.
**Fix:** Usar 0 (oficial). El EWMA slow/fast ya provee el suavizado.

## Fórmulas Oficiales HLS.js

### EWMA Bandwidth Estimation
```
slow_ewma(t) = slow_ewma(t-1) * (1 - alpha_slow) + sample * alpha_slow
fast_ewma(t) = fast_ewma(t-1) * (1 - alpha_fast) + sample * alpha_fast
alpha_slow = 1 - exp(-delta_t / (abrEwmaSlowLive * segment_duration))
alpha_fast = 1 - exp(-delta_t / (abrEwmaFastLive * segment_duration))
estimated_bw = min(slow_ewma, fast_ewma)  // conservador
```

### Decisión de ABR
```
switch UP:   (estimated_bw * abrBandWidthUpFactor) > next_level_bitrate
             // 0.7x requiere 43% más BW del esperado
switch DOWN: (estimated_bw * abrBandWidthFactor) < current_level_bitrate
             // 0.95x tolera 5% de drop antes de bajar
emergency:   buffer < maxStarvationDelay (4s) → force switch down
```

### Stall Recovery (gap-controller)
```
if (currentTime_stale_for > detectStallWithCurrentTimeMs) {
  for i in range(nudgeMaxRetry):
    currentTime += nudgeOffset  // 0.1s nudge
    if playing → break
}
```

## Calibración P0-P5 (aplicada 2026-04-11)

| Perfil | maxBuffer | backBuf | bufferHole | stall | LL-HLS | starv | retry |
|--------|-----------|---------|-----------|-------|--------|-------|-------|
| P0 8K | 45s | 120s | 0.1s | 1250ms | ON | 6s | 6 |
| P1 4K | 30s | 90s | 0.1s | 1250ms | ON | 4s | 6 |
| P2 4K | 30s | 60s | 0.1s | 1250ms | ON | 4s | 6 |
| P3 FHD | 30s | 45s | 0.1s | 1250ms | OFF | 4s | 6 |
| P4 HD | 30s | 30s | 0.5s | 1250ms | OFF | 4s | 6 |
| P5 SD | 30s | 20s | 1.0s | 1250ms | OFF | 4s | 8 |

**Regla clave:** NUNCA usar valores "custom agresivos" sin referencia al oficial. Los defaults de HLS.js están calibrados por el equipo que mantiene el player más usado del mundo.

## CMCD Spec (CTA-5004) — como lo hace HLS.js

**Delivery mode**: headers O query params (mutuamente exclusivos via `useHeaders` flag)

**Campos soportados y mapeo a headers**:

| Header | Campos |
|--------|--------|
| `CMCD-Object` | `br` (bitrate kbps), `d` (duration ms), `ot` (object type: v/a/av/m/i/tt), `tb` (top bitrate kbps) |
| `CMCD-Request` | `bl` (buffer length ms), `su` (startup flag), `nor` (next object URL), `bs` (starvation flag) |
| `CMCD-Session` | `sid` (quoted), `cid` (quoted), `sf=h` (HLS), `pr` (playback rate), `mtp` (measured throughput kbps), `v=1` |
| `CMCD-Status` | `bs` (only when starvation occurs) |

**Fórmulas oficiales**:
```
br  = level.bitrate / 1000              // kbps
tb  = max(levels.bitrate) / 1000        // kbps del TOP del ladder
d   = fragment.duration * 1000          // ms
bl  = bufferInfo(currentTime).len * 1000 // ms
mtp = hls.bandwidthEstimate / 1000      // kbps
```

**Flags**: `su`, `bs` son BARE (sin `=true`), se **omiten** cuando son falsos.

**Strings**: `sid` y `cid` van QUOTED: `sid="uuid",cid="channel-id"`.

**CMCD-Status**: se omite entero cuando no hay starvation.

## Trampas CMCD que corregimos

| Campo | Antes (MAL) | Oficial | Motivo |
|-------|-------------|---------|--------|
| `tb` en CMCD-Object | `tb=${br}` | `tb=<max_ladder>` | tb es el TOP del ladder, no el current |
| `mtp` en CMCD-Request | `mtp=${br}` | En CMCD-Session | mtp pertenece a Session, no Request |
| `st=l` en CMCD-Session | `st=l` | (no existe) | `st` no es campo CMCD spec |
| `sid=${sid}` | sin comillas | `sid="${sid}"` | strings van quoted |
| `cid=${cid}` | sin comillas | `cid="${cid}"` | strings van quoted |
| `pr` playback rate | ausente | `pr=1` | oficial lo incluye |
| `CMCD-Status: bs=false` | `bs=false` | (omitir entero) | bs es bare flag, si false no se emite |

## FPS Controller

Quality capping dinámico por dropped frames:
- `fpsDroppedMonitoringPeriod`: 5000ms (default)
- `fpsDroppedMonitoringThreshold`: 0.2 (20% dropped triggers cap)
- Cálculo: `droppedFPS = (1000 * currentDropped) / currentPeriod`
- Trigger: `currentDropped > threshold * currentDecoded` → baja `autoLevelCapping` 1 nivel

## Cap Level Controller

Quality capping por viewport:
- `capLevelToPlayerSize: true` activa el capping
- `squareSize = max(mediaWidth, mediaHeight)` previene toggling por aspect ratio
- `contentScaleFactor = min(devicePixelRatio, maxDevicePixelRatio)`
- Usa `ResizeObserver` preferente (fallback: polling 1s)

## 13 Defensas Anti-Freeze de HLS.js (del source oficial)

| Problema | Defensa HLS.js | Parámetro clave |
|----------|----------------|-----------------|
| Freeze al inicio | Start gap jump: seek past unbuffered start | `MAX_START_GAP_JUMP=2.0s` (VOD), `2×targetDuration` (live) |
| Freeze por gap mid-playback | `_trySkipBufferHole` con padding | `skipBufferHolePadding=0.1` |
| Stall en buffered range | Nudge progresivo: +0.2s, +0.3s, +0.4s | `nudgeOffset=0.1`, 3 retries |
| Chrome video hole bug | Micro-seek proactivo (+0.000001s) | `nudgeOnVideoHole=true` |
| Error de red | Retry 6x con backoff 1-8s, luego switch level | `errorRetry.maxNumRetry=6` |
| Timeout | Retry 4x, luego switch level | `timeoutRetry.maxNumRetry=4` |
| QuotaExceeded | Evict back-buffer, retry; reduce maxBuffer dinámico | `appendErrorMaxRetry=3` |
| Audio/video desync | Bloquear audio append hasta que video lo alcance | `blockAudio/unblockAudio` |
| Live lag (falling behind) | Seek forzado a liveSyncPosition + playbackRate catch-up | `liveMaxLatencyDurationCount`, `maxLiveSyncPlaybackRate` |
| Stall detection | 100ms polling + 1250ms threshold + "waiting" event fusion | `detectStallWithCurrentTimeMs=1250` |
| Codec/DRM error | Switch a alternate level, remove incompatibles | `getLevelSwitchAction` |
| MediaSource close (Safari) | Trigger `recoverMediaError()` | `MEDIA_SOURCE_REQUIRES_RESET` |
| Over-buffering | Buffer target dinámico por bitrate | `min(max(8×maxBufferSize/bitrate, 30s), 600s)` |

## Fórmula de Buffer Target Dinámico

```
maxBufLen = levelBitrate > 0
  ? max((8 × maxBufferSize) / levelBitrate, maxBufferLength)
  : maxBufferLength
result = min(maxBufLen, maxMaxBufferLength)
```

Ejemplos:
- 5 Mbps @ 60MB buffer: `max(96s, 30s) = 96s`, cap en 600s → **96s**
- 50 Mbps (4K): `max(9.6s, 30s) = 30s` → **30s**
- 80 Mbps (8K) @ 120MB: `max(12s, 45s) = 45s` → **45s**

## Algoritmo de Stall Detection (gap-controller)

```
poll() cada 100ms:
  if currentTime !== lastCurrentTime → MOVING (reset nudgeRetry, skipRetry)
  if paused/ended/playbackRate===0 → EXPECTED STOP
  if no buffered ranges → WAITING FOR DATA
  
  Stall timer inicia si:
    - "waiting" event + (now - waitingTime < detectStallWithCurrentTimeMs)
    - OR currentTime frozen 1 tick
  
  Stall confirmado si:
    stalledDuration ≥ detectStallWithCurrentTimeMs (1250ms)
    OR (waiting event + playhead antes movió)
  
  Recovery en orden:
    1. if !moved: _trySkipBufferHole (start gap jump)
    2. if stalled > highBufferWatchdogPeriod*1000 (2000ms): _tryNudgeBuffer
    3. if nudgeRetry ≥ 3: FATAL BUFFER_STALLED_ERROR
```

## Algoritmo de Error Recovery

```
Fragment error → getFragRetryOrSwitchAction:
  level.fragmentError++
  if totalFragmentErrors < maxNumRetry (6): RetryRequest
  else: getLevelSwitchAction → switch level
  
Playlist error → getPlaylistRetryOrSwitchAction:
  playlistError++
  if < maxNumRetry (2): RetryRequest
  else: switch level

Level Switch Algorithm:
  para cada candidate (round-robin desde loadLevel):
    skip si candidate === loadLevel
    skip si fuera de [minAutoLevel, maxAutoLevel]
    skip si loadError > 0 AND penalty no expirado (errorPenaltyExpireMs)
    skip si mismo audio/subtitle group que falló
    → usar candidate como nextAutoLevel
  si no hay candidate: SendAlternateToPenaltyBox → FATAL (excepto FRAG_GAP)
```

## QuotaExceeded Recovery (Anti-Memory-Blow)

```
Al fallar appendBuffer con QuotaExceededError:
  1. Primera vez: calcular back-buffer eviction target
     evictEnd = fragmentTracker.getBackBufferEvictionEnd(currentTime, type, segmentBytes)
  2. Si evictEnd > 0: queue [removeOp(0, evictEnd), retryAppendOp, clearEvictionPendingOp]
  3. Si no hay back-buffer o 2da falla del mismo tipo:
     - BUFFER_FULL_ERROR
     - appendErrors[type]++ 
     - si ≥ appendErrorMaxRetry (3): FATAL
  4. trimBuffers(frag.start, 1) emergency trim
  5. reduceLengthAndFlushBuffer: reduce maxMaxBufferLength dinámicamente
```

## Append Timeout

```
appendTimeoutTime = max(
  config.appendTimeout,
  max(
    activeBufferInfo.len * 1000,        // proporcional al buffer
    2 * targetDuration * 1000           // 2× segment duration
  )
)
```

## Algoritmo ABR Completo (findBestLevel + getNextABRAutoLevel)

### EWMA Bandwidth Estimator — Fórmula exacta

```
sample(durationMs, numBytes):
    durationMs = max(durationMs, 50)              # minDelayMs floor
    bandwidthBps = (8 * numBytes) / (durationMs/1000)
    weight = durationMs/1000
    fast_ewma.sample(weight, bandwidthBps)        # ventana 3s (abrEwmaFastLive)
    slow_ewma.sample(weight, bandwidthBps)        # ventana 9s (abrEwmaSlowLive)

sampleTTFB(ttfbMs):
    s = ttfbMs/1000
    weight = sqrt(2) * exp(-s²/2)                 # curva Gaussiana

getEstimate():
    if fast.totalWeight >= 0.001:
        return MIN(fast.estimate, slow.estimate)  # PESIMISTA: adapt down fast, up slow
    else:
        return abrEwmaDefaultEstimate (500000)
```

**Doctrina clave**: `min(fast, slow)` es intencionalmente pesimista — baja rápido, sube lento.

### findBestLevel — Decisión de switch (nivel por nivel, max→min)

```
adjustedbw = upSwitch ? (bwUpFactor * currentBw)   # 0.7 para subir (conservador)
                      : (bwFactor   * currentBw)   # 0.8 para bajar

bitrate = (bufferStarvationDelay >= 2*fragDuration AND maxStarvationDelay==0)
          ? level.averageBitrate
          : level.maxBitrate

fetchDuration = TTFB + (bitrate*avgDuration)/adjustedbw
maxFetchDuration = bufferStarvationDelay + maxStarvationDelay

CanSwitch = adjustedbw >= bitrate
            AND (no error OR penalty expirado)
            AND (fetchDuration <= TTFB
                 OR live AND !bitrateTest
                 OR fetchDuration < maxFetchDuration)
```

### getNextABRAutoLevel — 2-pass selection

```
PASS 1: zero-rebuffer guarantee
  best = findBestLevel(avgbw, min, max, bufferDelay,
                       maxStarvationDelay=0,       # NO tolera rebuffer
                       bwFactor=0.8, bwUpFactor=0.7)
  if best >= 0: return best

PASS 2: allow maxStarvationDelay rebuffer
  maxStarvationDelay = min(currentFragDuration, config.maxStarvationDelay)  # 4s
  best = findBestLevel(avgbw, ..., maxStarvationDelay, 0.8, 0.7)
  if best > -1: return best

Fallback: minAutoLevel or loadLevel
```

### Emergency Switch-Down (in-flight abort)

Se dispara durante descarga cuando `fragLoadedDelay > bufferStarvationDelay`:

```
timeLoading < max(ttfb, 500*duration/playbackRate) → return (muy temprano)

bufferStarvationDelay = bufferInfo.len / playbackRate
fragLoadedDelay = (expectedLen - loaded) / loadRate

if fragLoadedDelay <= bufferStarvationDelay → return (va a terminar a tiempo)

# Escanear niveles inferiores
for n = currentLevel-1 downto minAutoLevel:
    delay = TTFB + duration*levels[n].maxBitrate / bwe
    if delay < min(bufferStarvationDelay, duration+ttfb): break

if fragLevelNextLoadedDelay >= fragLoadedDelay: return (no mejora)

if fragBlockingSwitch OR fragLoadedDelay > 2*fragLevelNextLoadedDelay:
    abortAndSwitch()                              # ABORTA descarga, baja nivel
else:
    setTimeout(abortAndSwitch, fragLevelNextLoadedDelay*1000)
```

## Live Latency Controller — Sigmoid Catch-Up

### Cálculo de live edge

```
liveEdge = levelDetails.edge + levelDetails.age
latency  = liveEdge - media.currentTime

targetLatency = (lowLatencyMode ? partHoldBack || holdBack : holdBack)
                OR (liveSyncDuration ?? liveSyncDurationCount * targetDuration)
                + min(stallCount * liveSyncOnStallIncrease, targetDuration)

edgeStalled = max(levelDetails.age - 3*targetDuration, 0)

liveSyncPosition = clamp(
    liveEdge - targetLatency - edgeStalled,
    min = edge - totalduration,
    max = edge - (partTarget || targetduration)
)
```

### Playback rate sigmoide (catch-up automático)

```
distanceFromTarget = latency - targetLatency
inLiveRange = distanceFromTarget < min(maxLatency, targetLatency + targetDuration)

if inLiveRange AND distanceFromTarget > 0.05 AND forwardBuffer > 1:
    # Función sigmoide que acelera cuando estamos detrás del target,
    # y se auto-amortigua al acercarse
    rate = round((2 / (1 + exp(-0.75*distanceFromTarget - edgeStalled))) * 20) / 20
    playbackRate = clamp(rate, 1, min(2, maxLiveSyncPlaybackRate))
else:
    playbackRate = 1
```

## Referencias

- Source: https://github.com/video-dev/hls.js/blob/master/src/config.ts
- CMCD: https://github.com/video-dev/hls.js/blob/master/src/controller/cmcd-controller.ts
- CTA-5004: Common Media Client Data spec
- Version: 1.6.15
- Archivo local: `c:/tmp/hls-js-study/src/`
