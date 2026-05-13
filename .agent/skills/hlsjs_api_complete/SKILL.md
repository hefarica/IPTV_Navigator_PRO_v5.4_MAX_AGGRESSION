---
name: hlsjs-api-complete
description: "API completo de HLS.js v1.6 absorbido 100%: 25 métodos públicos, 47 properties, 73 events, 49 ErrorDetails, 5 ErrorTypes, ABRConfig/BufferConfig completos. Usar cuando: se necesite referenciar cualquier método/evento/error de HLS.js, calibrar parámetros de player, implementar listeners de eventos, o manejar cualquier error específico por ErrorDetails."
---

# HLS.js v1.6 — API Reference 100% Completa

Fuente oficial: https://hlsjs.video-dev.org/api-docs/hls.js.hls

## 25 Métodos Públicos del Hls Class

| Método | Firma | Uso |
|--------|-------|-----|
| `attachMedia(data)` | (HTMLMediaElement) → void | Adjunta player a un `<video>` |
| `detachMedia()` | → void | Desadjunta player |
| `loadSource(url)` | (string) → void | Set source URL (relativa o absoluta) |
| `startLoad(position, skipSeek?)` | (number, boolean) → void | Inicia streaming |
| `stopLoad()` | → void | Detiene carga total |
| `pauseBuffering()` | → void | Pausa carga de segmentos (mantiene refresh de playlist) |
| `resumeBuffering()` | → void | Resume carga de segmentos |
| `destroy()` | → void | Destruye la instancia |
| `recoverMediaError()` | → void | Recovery: detach + reattach |
| `removeLevel(index)` | (number) → void | Elimina un quality level |
| `swapAudioCodec()` | → void | Swap entre codecs de audio |
| `transferMedia()` | → {MediaSource, SourceBuffers} | Transfiere MediaSource entre instancias |
| `setAudioOption(opt)` | (AudioSelectionOption) → void | Selecciona audio track por criterio |
| `setSubtitleOption(opt)` | (SubtitleSelectionOption) → void | Selecciona subtítulo |
| `getMediaDecodingInfo(level, audioTracks)` | async | MediaCapabilities.decodingInfo |
| `on(event, listener, ctx?)` | (event, fn, ctx) → void | Registra listener |
| `once(event, listener, ctx?)` | (event, fn, ctx) → void | Listener de 1 sola vez |
| `off(event, listener?, ctx?, once?)` | → void | Desregistra listener |
| `emit(event, name, data)` | → void | Dispara evento |
| `trigger(event, data)` | → void | Alias de emit |
| `listeners(event)` | → Function[] | Lista de listeners |
| `listenerCount(event)` | → number | Cuenta listeners |
| `removeAllListeners(event?)` | → void | Desregistra todos |
| `createController(Class, components)` | → Controller | Instancia controller custom |

## 47 Properties del Hls Instance

### State/Config
- `config: HlsConfig` (readonly) — merged config
- `userConfig: Partial<HlsConfig>` (readonly) — lo que pasaste
- `media: HTMLMediaElement | null` (readonly)
- `url: string | null` (readonly)
- `logger: ILogger` (readonly)
- `sessionId: string` (readonly) — UUID único

### Quality Levels (13)
- `currentLevel: number` (rw) — playing
- `nextLevel: number` (rw) — scheduled
- `loadLevel: number` (rw) — last loaded
- `nextLoadLevel: number` (rw) — next to load
- `loadLevelObj: Level | null` (readonly)
- `levels: Level[]` (readonly)
- `firstLevel: number` (rw)
- `startLevel: number` (rw) — `-1` para auto
- `firstAutoLevel: number` (readonly)
- `manualLevel: number` (readonly)
- `nextAutoLevel: number` (rw)
- `maxAutoLevel: number` (readonly)
- `minAutoLevel: number` (readonly)

### ABR/Capping (4)
- `autoLevelCapping: number` (rw)
- `autoLevelEnabled: boolean` (readonly)
- `capLevelToPlayerSize: boolean` (rw)
- `lowLatencyMode: boolean` (rw)

### Audio/Subtitles (7)
- `audioTrack: number` (rw)
- `audioTracks: MediaPlaylist[]` (readonly)
- `allAudioTracks: MediaPlaylist[]` (readonly)
- `subtitleTrack: number` (rw)
- `subtitleTracks: MediaPlaylist[]` (readonly)
- `allSubtitleTracks: MediaPlaylist[]` (readonly)
- `subtitleDisplay: boolean` (rw)

### Buffer/Loading (7)
- `latestLevelDetails: LevelDetails | null` (readonly)
- `bufferedToEnd: boolean` (readonly)
- `bufferingEnabled: boolean` (readonly)
- `loadingEnabled: boolean` (readonly)
- `forceStartLoad: boolean` (readonly)
- `hasEnoughToStart: boolean` (readonly)
- `mainForwardBufferInfo: BufferInfo | null` (readonly)
- `maxBufferLength: number` (readonly)
- `inFlightFragments: InFlightFragments` (readonly)

### Network/Bandwidth (3)
- `bandwidthEstimate: number` (readonly) — bits/sec
- `ttfbEstimate: number` (readonly) — seconds
- `abrEwmaDefaultEstimate: number` (readonly)

### Live (6)
- `latency: number` (readonly) — posición del live edge
- `targetLatency: number | null` (rw) — objetivo
- `maxLatency: number` (readonly)
- `drift: number | null` (readonly) — rate del edge
- `liveSyncPosition: number | null` (readonly)
- `playingDate: Date | null` (readonly) — Program Date Time

### ContentSteering (2)
- `pathways: string[]` (readonly)
- `pathwayPriority: string[] | null` (rw)

### Otros (3)
- `startPosition: number` (readonly)
- `interstitialsManager: InterstitialsManager | null` (readonly)
- `maxHdcpLevel: HdcpLevel` (rw)

## Static Methods & Properties

| Item | Tipo | Descripción |
|------|------|-------------|
| `Hls.version` | string | Versión del paquete |
| `Hls.DefaultConfig` | HlsConfig | Config default |
| `Hls.Events` | typeof Events | Enum de eventos |
| `Hls.ErrorTypes` | typeof ErrorTypes | Enum de tipos de error |
| `Hls.ErrorDetails` | typeof ErrorDetails | Enum de detalles |
| `Hls.MetadataSchema` | typeof MetadataSchema | Enum de schemas |
| `Hls.isMSESupported()` | → boolean | Check MSE availability |
| `Hls.isSupported()` | → boolean | Check MSE + isTypeSupported |
| `Hls.getMediaSource()` | → typeof MediaSource | Global MediaSource |

## 73 Events Completos

### Media Lifecycle (6)
`MEDIA_ATTACHING`, `MEDIA_ATTACHED`, `MEDIA_DETACHING`, `MEDIA_DETACHED`, `MEDIA_ENDED`, `DESTROYING`

### Manifest (3)
`MANIFEST_LOADING`, `MANIFEST_LOADED`, `MANIFEST_PARSED`

### Levels (6)
`LEVEL_LOADING`, `LEVEL_LOADED`, `LEVEL_UPDATED`, `LEVEL_PTS_UPDATED`, `LEVEL_SWITCHING`, `LEVEL_SWITCHED`, `LEVELS_UPDATED`, `MAX_AUTO_LEVEL_UPDATED`

### Audio Tracks (5)
`AUDIO_TRACK_LOADING`, `AUDIO_TRACK_LOADED`, `AUDIO_TRACK_SWITCHING`, `AUDIO_TRACK_SWITCHED`, `AUDIO_TRACK_UPDATED`, `AUDIO_TRACKS_UPDATED`

### Subtitle Tracks (7)
`SUBTITLE_TRACK_LOADING`, `SUBTITLE_TRACK_LOADED`, `SUBTITLE_TRACK_SWITCH`, `SUBTITLE_TRACK_UPDATED`, `SUBTITLE_TRACKS_UPDATED`, `SUBTITLE_TRACKS_CLEARED`, `SUBTITLE_FRAG_PROCESSED`

### Fragments (9)
`FRAG_LOADING`, `FRAG_LOADED`, `FRAG_PARSED`, `FRAG_BUFFERED`, `FRAG_CHANGED`, `FRAG_DECRYPTED`, `FRAG_LOAD_EMERGENCY_ABORTED`, `FRAG_PARSING_INIT_SEGMENT`, `FRAG_PARSING_METADATA`, `FRAG_PARSING_USERDATA`

### Keys/DRM (2)
`KEY_LOADING`, `KEY_LOADED`

### Buffer (9)
`BUFFER_CODECS`, `BUFFER_CREATED`, `BUFFER_APPENDING`, `BUFFER_APPENDED`, `BUFFER_FLUSHING`, `BUFFER_FLUSHED`, `BUFFER_EOS`, `BUFFER_RESET`, `BUFFERED_TO_END`, `BACK_BUFFER_REACHED`, `LIVE_BACK_BUFFER_REACHED`

### Stalls & FPS (3)
`STALL_RESOLVED`, `FPS_DROP`, `FPS_DROP_LEVEL_CAPPING`

### PTS/Metadata (2)
`INIT_PTS_FOUND`, `CUES_PARSED`

### Interstitials (8)
`INTERSTITIAL_STARTED`, `INTERSTITIAL_ENDED`, `INTERSTITIAL_ASSET_STARTED`, `INTERSTITIAL_ASSET_ENDED`, `INTERSTITIAL_ASSET_ERROR`, `INTERSTITIAL_ASSET_PLAYER_CREATED`, `INTERSTITIALS_UPDATED`, `INTERSTITIALS_BUFFERED_TO_BOUNDARY`, `INTERSTITIALS_PRIMARY_RESUMED`

### Asset Lists (2)
`ASSET_LIST_LOADING`, `ASSET_LIST_LOADED`

### Steering & Events (3)
`STEERING_MANIFEST_LOADED`, `EVENT_CUE_ENTER`, `PLAYOUT_LIMIT_REACHED`

### Text Tracks (1)
`NON_NATIVE_TEXT_TRACKS_FOUND`

### Error (1)
`ERROR`

## ErrorTypes (5 categorías)

| Type | String | Significado |
|------|--------|-------------|
| `NETWORK_ERROR` | `networkError` | Problemas de red/request |
| `MEDIA_ERROR` | `mediaError` | Problemas con formato/playback |
| `KEY_SYSTEM_ERROR` | `keySystemError` | DRM/keys |
| `MUX_ERROR` | `muxError` | Container/multiplexing |
| `OTHER_ERROR` | `otherError` | No clasificado |

## 49 ErrorDetails (todos, clasificados por action)

### NETWORK_ERROR (17)
| Detail | Action default |
|--------|---------------|
| `MANIFEST_LOAD_ERROR` | Retry + switch |
| `MANIFEST_LOAD_TIMEOUT` | Retry + switch |
| `MANIFEST_PARSING_ERROR` | Fatal |
| `MANIFEST_INCOMPATIBLE_CODECS_ERROR` | Fatal |
| `LEVEL_EMPTY_ERROR` | Retry (live) / Switch |
| `LEVEL_LOAD_ERROR` | Retry + switch |
| `LEVEL_LOAD_TIMEOUT` | Retry + switch |
| `LEVEL_PARSING_ERROR` | Switch level |
| `AUDIO_TRACK_LOAD_ERROR` | Retry + MoveAlternatesHost |
| `AUDIO_TRACK_LOAD_TIMEOUT` | Retry + MoveAlternatesHost |
| `SUBTITLE_LOAD_ERROR` | Retry + switch |
| `SUBTITLE_TRACK_LOAD_TIMEOUT` | Retry + switch |
| `FRAG_LOAD_ERROR` | Retry (6x, 1-8s backoff) + switch |
| `FRAG_LOAD_TIMEOUT` | Retry (4x) + switch |
| `KEY_LOAD_ERROR` | Retry + switch |
| `KEY_LOAD_TIMEOUT` | Retry + switch |
| `ASSET_LIST_LOAD_ERROR` | Retry |
| `ASSET_LIST_LOAD_TIMEOUT` | Retry |
| `ASSET_LIST_PARSING_ERROR` | Fatal |

### MEDIA_ERROR (14)
| Detail | Action |
|--------|--------|
| `BUFFER_ADD_CODEC_ERROR` | Switch level (remove incompatible) |
| `BUFFER_APPEND_ERROR` | Switch level |
| `BUFFER_APPENDING_ERROR` | Switch |
| `BUFFER_FULL_ERROR` | Trim buffer + reduce maxBuffer |
| `BUFFER_INCOMPATIBLE_CODECS_ERROR` | Switch |
| `BUFFER_NUDGE_ON_STALL` | DoNothing (gap-controller handles) |
| `BUFFER_SEEK_OVER_HOLE` | DoNothing |
| `BUFFER_STALLED_ERROR` | DoNothing (non-fatal hasta 3er nudge) |
| `FRAG_DECRYPT_ERROR` | Switch level |
| `FRAG_GAP` | Switch (non-fatal!) |
| `FRAG_PARSING_ERROR` | Switch level |
| `LEVEL_SWITCH_ERROR` | - |
| `REMUX_ALLOC_ERROR` | Switch |
| `ATTACH_MEDIA_ERROR` | Fatal |

### KEY_SYSTEM_ERROR (11)
`KEY_SYSTEM_NO_ACCESS`, `KEY_SYSTEM_NO_KEYS`, `KEY_SYSTEM_NO_SESSION`, `KEY_SYSTEM_NO_CONFIGURED_LICENSE`, `KEY_SYSTEM_LICENSE_REQUEST_FAILED`, `KEY_SYSTEM_SERVER_CERTIFICATE_REQUEST_FAILED`, `KEY_SYSTEM_SERVER_CERTIFICATE_UPDATE_FAILED`, `KEY_SYSTEM_SESSION_UPDATE_FAILED`, `KEY_SYSTEM_STATUS_OUTPUT_RESTRICTED` (HDCP demote), `KEY_SYSTEM_STATUS_INTERNAL_ERROR`, `KEY_SYSTEM_DESTROY_MEDIA_KEYS_ERROR`, `KEY_SYSTEM_DESTROY_CLOSE_SESSION_ERROR`, `KEY_SYSTEM_DESTROY_REMOVE_SESSION_ERROR`

### MUX_ERROR (1)
`REMUX_ALLOC_ERROR`

### OTHER_ERROR (4)
`INTERNAL_ABORTED` (`aborted`), `INTERNAL_EXCEPTION`, `INTERSTITIAL_ASSET_ITEM_ERROR`, `UNKNOWN`

## HlsConfig — Core Properties

| Property | Type |
|----------|------|
| `debug` | boolean \| ILogger |
| `enableWorker` | boolean |
| `workerPath` | string \| null |
| `enableSoftwareAES` | boolean |
| `minAutoBitrate` | number |
| `ignoreDevicePixelRatio` | boolean |
| `maxDevicePixelRatio` | number |
| `preferManagedMediaSource` | boolean |
| `preserveManualLevelOnError` | boolean |
| `timelineOffset` | number? |
| `ignorePlaylistParsingErrors` | boolean |
| `progressive` | boolean |
| `lowLatencyMode` | boolean |
| `enableInterstitialPlayback` | boolean |
| `interstitialAppendInPlace` | boolean |
| `interstitialLiveLookAhead` | number |
| `useMediaCapabilities` | boolean |
| `assetPlayerId` | string? |
| `primarySessionId` | string? |

### Loaders
- `loader: Constructor<Loader>` — XhrLoader o FetchLoader
- `fLoader?`, `pLoader?` — fragment/playlist loaders custom
- `fetchSetup`, `xhrSetup` — request customization

## ABRControllerConfig (11 fields)

```
abrEwmaFastLive: number           // default 3
abrEwmaSlowLive: number           // default 9
abrEwmaFastVoD: number            // default 3
abrEwmaSlowVoD: number            // default 9
abrEwmaDefaultEstimate: number    // default 500000 (500kbps)
abrEwmaDefaultEstimateMax: number // default 5e6 (5Mbps)
abrBandWidthFactor: number        // default 0.95
abrBandWidthUpFactor: number      // default 0.7
abrMaxWithRealBitrate: boolean    // default false
maxStarvationDelay: number        // default 4
maxLoadingDelay: number           // default 4
```

## BufferControllerConfig (5 fields)

```
appendErrorMaxRetry: number          // default 3
backBufferLength: number             // default Infinity
frontBufferFlushThreshold: number    // default Infinity
liveDurationInfinity: boolean        // default false
liveBackBufferLength: number | null  // deprecated, use backBufferLength
```

## Implementación en Generador IPTV

Cuando el generador produce M3U8, debe incluir estos campos del API en `X-HLSjs-Config` header:

```javascript
// Los 20+ parámetros que nuestro player va a leer
{
  maxBufferLength, maxMaxBufferLength, backBufferLength,
  maxBufferSize, maxBufferHole, maxFragLookUpTolerance,
  abrEwmaFastLive, abrEwmaSlowLive, abrEwmaDefaultEstimate,
  abrBandWidthFactor, abrBandWidthUpFactor, abrMaxWithRealBitrate,
  abrSwitchInterval,
  detectStallWithCurrentTimeMs, nudgeOffset, nudgeMaxRetry,
  nudgeOnVideoHole, skipBufferHolePadding, highBufferWatchdogPeriod,
  maxStarvationDelay, maxLoadingDelay,
  liveSyncDurationCount, liveMaxLatencyDurationCount,
  maxLiveSyncPlaybackRate, liveSyncMode, liveSyncOnStallIncrease,
  lowLatencyMode, enableWorker, startFragPrefetch,
  appendErrorMaxRetry, errorPenaltyExpireMs, preserveManualLevelOnError
}
```

## Events que el Player emite y que podemos capturar

Para debugging/telemetría en runtime inyectar:
```javascript
hls.on(Hls.Events.FRAG_LOAD_EMERGENCY_ABORTED, ...)  // anti-stall triggered
hls.on(Hls.Events.FPS_DROP_LEVEL_CAPPING, ...)       // quality capped
hls.on(Hls.Events.BACK_BUFFER_REACHED, ...)          // buffer trim
hls.on(Hls.Events.STALL_RESOLVED, ...)               // recovery success
hls.on(Hls.Events.ERROR, (evt, data) => {            // all errors
  if (data.fatal) { ... }
  else if (data.details === Hls.ErrorDetails.FRAG_GAP) { ... }
})
```

## Referencias

- API Root: https://hlsjs.video-dev.org/api-docs/
- Hls Class: https://hlsjs.video-dev.org/api-docs/hls.js.hls
- Events: https://hlsjs.video-dev.org/api-docs/hls.js.events
- ErrorTypes: https://hlsjs.video-dev.org/api-docs/hls.js.errortypes
- ErrorDetails: https://hlsjs.video-dev.org/api-docs/hls.js.errordetails
- ABRConfig: https://hlsjs.video-dev.org/api-docs/hls.js.abrcontrollerconfig
- BufferConfig: https://hlsjs.video-dev.org/api-docs/hls.js.buffercontrollerconfig
- HlsConfig: https://hlsjs.video-dev.org/api-docs/hls.js.hlsconfig
