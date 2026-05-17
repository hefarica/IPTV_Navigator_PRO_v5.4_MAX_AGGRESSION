---
name: hlsjs-internals-buffer-stream-controllers
description: Use when debugging segment-loading state machine (player stuck in IDLE/FRAG_LOADING, segments not appending), buffer underruns, FPS-driven level capping, or "player size doesn't reduce quality" issues. Covers BufferController + StreamController state machine + FPSController + CapLevelController + LevelController.
---

# hls.js Internals — BufferController, StreamController, FPS & CapLevel

Source: `class/src/controller/buffer-controller.js` · `stream-controller.js` · `fps-controller.js` · `cap-level-controller.js` · `level-controller.js`

## Overview

Five controllers form the **playback engine** of hls.js:

1. **StreamController** (TaskLoop) — drives state machine: IDLE → KEY_LOADING → FRAG_LOADING → PARSING → PARSED → APPENDING → IDLE
2. **BufferController** (EventHandler) — wires MediaSource API, manages SourceBuffers, queues appends/flushes
3. **FPSController** — monitors decoded vs dropped frames, triggers `FPS_DROP_LEVEL_CAPPING` if threshold exceeded
4. **CapLevelController** — caps quality by player size, by FPS drops, by user restrictions
5. **LevelController** — manages level switching with retry/redundant-stream fallback

These are the controllers most often mentioned in diagnostic logs.

## When to Use

- "Buffer empty, player stalled" → check `BufferController.segments` queue + `StreamController._state`
- "Quality won't drop on small screen" → check `CapLevelController.detectPlayerSize()` + `capLevelToPlayerSize` config
- "Frame drops trigger no action" → check `FPSController.checkFPSInterval` + `capLevelOnFPSDrop`
- "Level switch retries forever" → check `LevelController.recoverLevel` + `levelLoadingMaxRetry`
- Reading `_findFragment()`, `_loadFragmentOrKey()`, `immediateLevelSwitch()` source

## StreamController — State Machine

`StreamController extends TaskLoop extends EventHandler`. `setInterval(100)` typical → `doTick()` every 100ms checks state and acts.

### States (`_state`)
| State | Meaning |
|---|---|
| `IDLE` | Default; on tick → decide if next fragment needed |
| `KEY_LOADING` | Waiting for `KEY_LOADED` |
| `FRAG_LOADING` | Waiting for `FRAG_LOADED` |
| `FRAG_LOADING_WAITING_RETRY` | Backoff between retries |
| `PARSING` | Demuxer/remuxer working |
| `PARSED` | Ready to append |
| `BUFFER_FLUSHING` | Mid-flush after level switch |
| `ENDED` | EOS reached |
| `ERROR` | Fatal, awaiting recovery |

### Key Methods
| Method | Purpose |
|---|---|
| `doTick()` | State machine driver — switches per `_state` |
| `_loadFragmentOrKey()` | Initiates load of segment or its decryption key |
| `_findFragment(start, level, levelDetails)` | Locate next segment by buffer position |
| `_findFragmentBySN(...)` | Lookup by sequence number |
| `_findFragmentByPDT(...)` | Lookup by Program-Date-Time |
| `immediateLevelSwitch()` | Hard switch — flush buffer, reload segment at new level |
| `nextLevelSwitch()` | Soft switch — let buffer drain, switch on next fragment |
| `onMediaSeeked(data)` | Reset state after user seek |
| `onFragLoaded(data)` | Pass to demuxer/remuxer |
| `onBufferAppended(data)` | Advance state to next IDLE |

### Public Properties
- `fragCurrent` — fragment currently in pipeline
- `fragPlaying` — fragment under playhead
- `level` — current quality level index
- `_state` — current state machine value

## BufferController — Reference

`BufferController extends EventHandler`. Bridges demuxed media → MSE.

### Properties
| Property | Type | Purpose |
|---|---|---|
| `mediaSource` | `MediaSource` | The MSE root |
| `media` | `HTMLMediaElement` | The `<video>` |
| `sourceBuffer` | `{audio?, video?, audiovideo?}` | Per-track SourceBuffer instances |
| `tracks` | `{audio?, video?}` | Initialized track configs |
| `pendingTracks` | `{audio?, video?}` | Awaiting MediaSource open |
| `segments` | `Array` | Append queue |
| `flushRange` | `Array` | Flush queue |

### Event Handlers
| Event | Action |
|---|---|
| `MEDIA_ATTACHING` | Create MediaSource, set as `<video>.src` (blob URL) |
| `MEDIA_DETACHING` | Tear down MediaSource |
| `BUFFER_CODECS` | Initialize SourceBuffers from track codec strings |
| `BUFFER_APPENDING` | Push to `segments`, schedule `doAppending()` |
| `BUFFER_FLUSHING` | Push range to `flushRange`, schedule `doFlush()` |

### Internal Operations
- `doAppending()` — drains `segments` queue, calling `sourceBuffer.appendBuffer(data)`
- `doFlush()` — drains `flushRange` queue, calling `sourceBuffer.remove(start, end)`
- `flushBuffer(start, end, type)` — schedules a precise removal
- `updateMediaElementDuration()` — syncs `mediaSource.duration` from playlist totals

## FPSController — Reference

### Metrics
- `lastDecodedFrames` — counter snapshot
- `lastDroppedFrames` — counter snapshot
- `lastTime` — performance.now() at last sample

### Methods
| Method | Behavior |
|---|---|
| `checkFPSInterval()` | Periodic sampler at `fpsDroppedMonitoringPeriod` ms (default 5000) |
| `checkFPS()` | Computes drop rate; if `(dropped / totalFrames) > fpsDroppedMonitoringThreshold` (default 0.2) → emit `FPS_DROP` |
| `onMediaAttaching(data)` | Initialize counters, start interval |

### Integration
On `FPS_DROP`, **CapLevelController** receives the event and calls `capLevelToPlayerSize` logic to reduce `autoLevelCapping` index.

## CapLevelController — Reference

### Static Methods
| Method | Signature | Purpose |
|---|---|---|
| `getMaxLevelByMediaSize(levels, width, height)` | `(Level[], number, number) → number` | Returns highest level index whose `RESOLUTION` ≤ player size |
| `isLevelAllowed(level, restrictedLevels)` | `(number, number[]) → boolean` | Filter by restriction list |

### Instance Methods
- `detectPlayerSize()` — reads `<video>` clientWidth × pixelRatio
- `getMaxLevel(currentLevels)` — combines size cap + restrictions
- `onFpsDropLevelCapping(data)` — handler for `FPS_DROP_LEVEL_CAPPING`

### Properties
- `autoLevelCapping` (number) — current cap index (`-1` = uncapped)
- `restrictedLevels` (number[]) — disallowed indices

### Config Triggers
- `capLevelToPlayerSize: true` → cap by player size
- `capLevelOnFPSDrop: true` → cap on FPS drop event

## LevelController — Reference

### Properties
- `currentLevelIndex` — currently loaded
- `manualLevelIndex` — user override (set via `hls.currentLevel = N`)
- `canload` — gate flag
- `timer` — retry scheduler
- `levels` — array of available levels
- `nextLoadLevel` — queue for pending switch
- `levelRetryCount` — error counter

### Methods
| Method | Behavior |
|---|---|
| `onManifestLoaded(data)` | Initialize `levels[]`, pick start level per `startLevel` config |
| `startLoad()` / `stopLoad()` | Controls level loading lifecycle |
| `loadLevel()` | Trigger reload of current level's playlist |
| `recoverLevel(errorEvent)` | "Switch to a redundant stream if any available. If redundant stream is not available, emergency switch down if ABR mode is enabled" |
| `onError(data)` | Increment retry counter, schedule retry per `levelLoadingRetryDelay` |
| `onFragLoaded(data)` | Track level-loaded state |
| `onLevelLoaded(data)` | Update level details |

### Redundant Streams
A `Level` can have multiple URLs (`url[0]`, `url[1]`, ...). On error, `recoverLevel` rotates to the next URL before fallback to lower quality.

## Common Bugs

| Symptom | Diagnosis |
|---|---|
| `_state` stays at `FRAG_LOADING` | Either timeout fired (check `fragLoadingTimeOut`) or the load promise is leaked. Inspect `fragCurrent.loader` state |
| BufferController throws `QuotaExceededError` | `maxBufferSize` exceeded; reduce or rely on backBuffer eviction |
| `BUFFER_APPENDING` fires but media doesn't play | Check `BUFFER_CODECS` fired first AND codec strings are valid (`avc1.4d401f`, `mp4a.40.2`) |
| Player at 1080p on a 480px-wide thumbnail | `capLevelToPlayerSize` is false, OR detectPlayerSize ran before video had layout |
| FPS drops never reduce quality | `capLevelOnFPSDrop: false` (default true) or `fpsDroppedMonitoringThreshold` too high |
| Level keeps retrying forever | `levelLoadingMaxRetry` too high; or no redundant stream and ABR off |

## Cross-references

- **hlsjs-internals-task-loop-eventhandler** — base class semantics
- **hlsjs-internals-fragment-lifecycle** — Fragment objects flowing through StreamController
- **hlsjs-internals-ewma-abr-math** — AbrController feeds level decisions to LevelController
- **iptv-autopista-doctrine** — buffer/stall config for our Fire TV deployment
