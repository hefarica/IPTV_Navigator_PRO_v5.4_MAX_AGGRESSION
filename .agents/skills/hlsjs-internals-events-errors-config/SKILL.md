---
name: hlsjs-internals-events-errors-config
description: Use when listening for hls.js events (MANIFEST_LOADED, FRAG_LOADED, ERROR, FPS_DROP, etc.), classifying errors by ErrorTypes (NETWORK_ERROR, MEDIA_ERROR, KEY_SYSTEM_ERROR, MUX_ERROR, OTHER_ERROR), or tuning hlsDefaultConfig top-level keys. Single-stop reference for the static enums + config skeleton.
---

# hls.js Internals — HlsEvents, ErrorTypes & hlsDefaultConfig

Source: `variable/index.html` (hlsDefaultConfig + HlsEvents + ErrorTypes + ErrorDetail typedef)

## Overview

Three top-level static exports drive every integration:

- **HlsEvents** — 50+ event names. All emit through EventHandler.
- **ErrorTypes** — 5 categories of error. Useful for top-level `on(ERROR)` dispatch.
- **hlsDefaultConfig** — every tunable parameter, default value visible.

Cross-reference for any event name or config key.

## When to Use

- Wiring `hls.on(HlsEvents.X, ...)` and need exact constant name
- Switching error handling by `data.type` — need ErrorTypes enum
- Auditing `new Hls(config)` — need top-level keys to inspect
- Reading hls.js source — every controller dispatches via these constants

## HlsEvents — Full Enumeration

```
// Media lifecycle
MEDIA_ATTACHING       MEDIA_ATTACHED       MEDIA_DETACHING       MEDIA_DETACHED

// Buffer
BUFFER_RESET          BUFFER_CODECS        BUFFER_CREATED        BUFFER_APPENDING
BUFFER_APPENDED       BUFFER_EOS           BUFFER_FLUSHING       BUFFER_FLUSHED

// Manifest
MANIFEST_LOADING      MANIFEST_LOADED      MANIFEST_PARSED

// Levels
LEVEL_SWITCHING       LEVEL_SWITCHED       LEVEL_LOADING         LEVEL_LOADED
LEVEL_UPDATED         LEVEL_PTS_UPDATED

// Audio tracks
AUDIO_TRACKS_UPDATED  AUDIO_TRACK_SWITCHING AUDIO_TRACK_SWITCHED
AUDIO_TRACK_LOADING   AUDIO_TRACK_LOADED

// Subtitle tracks
SUBTITLE_TRACKS_UPDATED   SUBTITLE_TRACK_SWITCH   SUBTITLE_TRACK_LOADING
SUBTITLE_TRACK_LOADED     SUBTITLE_FRAG_PROCESSED

// PTS / sync
INIT_PTS_FOUND

// Fragments
FRAG_LOADING               FRAG_LOAD_PROGRESS         FRAG_LOAD_EMERGENCY_ABORTED
FRAG_LOADED                FRAG_DECRYPTED
FRAG_PARSING_INIT_SEGMENT  FRAG_PARSING_USERDATA      FRAG_PARSING_METADATA
FRAG_PARSING_DATA          FRAG_PARSED                FRAG_BUFFERED
FRAG_CHANGED

// FPS / quality
FPS_DROP                   FPS_DROP_LEVEL_CAPPING

// Errors / lifecycle
ERROR                      DESTROYING                 STREAM_STATE_TRANSITION

// Encryption
KEY_LOADING                KEY_LOADED
```

### Most-Used Subscription Patterns

```javascript
hls.on(Hls.Events.MEDIA_ATTACHED, () => { /* attach side-effects */ });
hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
    // data.levels, data.audioTracks, data.subtitles
    // pick startLevel here
});
hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => { /* data.level */ });
hls.on(Hls.Events.FRAG_LOADED, (event, data) => { /* data.frag, data.payload */ });
hls.on(Hls.Events.ERROR, (event, data) => { /* see ErrorTypes below */ });
```

## ErrorTypes — Reference

5 categories. Always check `data.type` first, then `data.details`.

| Type | Recovery hint |
|---|---|
| `NETWORK_ERROR` | Manifest/level/fragment/key load failed. Try `hls.startLoad()` to resume |
| `MEDIA_ERROR` | Demux/remux/append failed. Try `hls.recoverMediaError()` |
| `KEY_SYSTEM_ERROR` | EME / DRM failure. License server unreachable, key system rejected. Often fatal |
| `MUX_ERROR` | Demuxer/remuxer internal exception. Try `swapAudioCodec()` or `recoverMediaError()` |
| `OTHER_ERROR` | Catch-all (level not found, unknown fragment, internal bug) |

### ErrorDetail Examples (commonly seen)

| ErrorDetail | Type |
|---|---|
| `manifestLoadError`, `manifestLoadTimeOut`, `manifestParsingError` | NETWORK |
| `levelLoadError`, `levelLoadTimeOut`, `levelEmptyError` | NETWORK |
| `fragLoadError`, `fragLoadTimeOut`, `fragLoopLoadingError`, `fragDecryptError` | NETWORK |
| `keyLoadError`, `keyLoadTimeOut` | NETWORK |
| `bufferAppendError`, `bufferAppendingError`, `bufferStalledError` | MEDIA |
| `bufferFullError`, `bufferSeekOverHole`, `bufferNudgeOnStall` | MEDIA |
| `internalException` | MUX |
| `keySystemNoKeys`, `keySystemNoSession`, `keySystemNoLicense` | KEY_SYSTEM |

### Recovery Recipe

```javascript
hls.on(Hls.Events.ERROR, (event, data) => {
    if (data.fatal) {
        switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                console.warn('Network fatal, restarting load');
                hls.startLoad();
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                console.warn('Media fatal, recovering');
                hls.recoverMediaError();
                break;
            default:
                // Cannot recover, destroy
                hls.destroy();
        }
    }
});
```

## hlsDefaultConfig — Top-Level Keys (Legacy 0.x catalog)

### Buffer / Stall
```
maxBufferLength            maxMaxBufferLength      maxBufferSize
maxBufferHole              lowBufferWatchdogPeriod highBufferWatchdogPeriod
nudgeOffset                nudgeMaxRetry           maxFragLookUpTolerance
```

### Live
```
liveSyncDurationCount      liveMaxLatencyDurationCount
liveSyncDuration           liveMaxLatencyDuration
liveDurationInfinity       initialLiveManifestSize
```

### Loading / Retry
```
manifestLoadingTimeOut     manifestLoadingMaxRetry
manifestLoadingRetryDelay  manifestLoadingMaxRetryTimeout
levelLoadingTimeOut        levelLoadingMaxRetry
levelLoadingRetryDelay     levelLoadingMaxRetryTimeout
fragLoadingTimeOut         fragLoadingMaxRetry
fragLoadingRetryDelay      fragLoadingMaxRetryTimeout
appendErrorMaxRetry
```

### ABR
```
startLevel                 minAutoBitrate
abrEwmaFastLive            abrEwmaSlowLive
abrEwmaFastVoD             abrEwmaSlowVoD
abrEwmaDefaultEstimate     abrBandWidthFactor
abrBandWidthUpFactor       abrMaxWithRealBitrate
maxStarvationDelay         maxLoadingDelay
```

### FPS / Caps
```
capLevelOnFPSDrop          capLevelToPlayerSize
fpsDroppedMonitoringPeriod fpsDroppedMonitoringThreshold
```

### Workers / AES
```
enableWorker               enableSoftwareAES
```

### Discontinuity / Audio
```
defaultAudioCodec          stretchShortVideoTrack
maxAudioFramesDrift        forceKeyFrameOnDiscontinuity
```

### EME / DRM
```
emeEnabled                 widevineLicenseUrl
requestMediaKeySystemAccessFunc
licenseXhrSetup
```

### Loaders / Custom
```
loader                     fLoader                pLoader
xhrSetup
```

### Controller Overrides
```
abrController              bufferController
capLevelController         fpsController
```

### Lifecycle
```
autoStartLoad              startPosition          debug
startFragPrefetch
```

## Common Bugs

| Symptom | Config fix |
|---|---|
| Player auto-loads before user clicks play | `autoStartLoad: false`, then call `hls.startLoad()` manually |
| First fragment timeouts on slow proxy | `manifestLoadingTimeOut: 60000`, `fragLoadingTimeOut: 60000` |
| `bufferStalledError` floods on poor network | Increase `nudgeMaxRetry`, increase `maxBufferHole` |
| Live latency too high | Reduce `liveSyncDurationCount` from 3 to 1 (1 segment behind edge) |
| Worker thread breaks debug | `enableWorker: false` for stack traces |

## Cross-references

- **hlsjs-api-complete** — modern v1.6 method list (this skill is the v0.x baseline event list)
- **hlsjs-official-calibration** — concrete default values + safe ranges
- **hlsjs-internals-ewma-abr-math** — abr* config drilling-down
- **hlsjs-internals-fragment-lifecycle** — fragLoading* config + Fragment events
