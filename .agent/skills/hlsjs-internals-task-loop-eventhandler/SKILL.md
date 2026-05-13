---
name: hlsjs-internals-task-loop-eventhandler
description: Use when debugging hls.js controller lifecycle issues (registerListeners/destroy not firing, tick loops stuck, controllers not responding to events), when extending hls.js with custom controllers, or when reading hls.js source code to trace event-driven behavior. Covers EventHandler base class + TaskLoop scheduler.
---

# hls.js Internals — EventHandler & TaskLoop

Source: https://nochev.github.io/hls.js/docs/html/class/src/event-handler.js~EventHandler.html · https://nochev.github.io/hls.js/docs/html/class/src/task-loop.js~TaskLoop.html

## Overview

Every hls.js controller (15 subclasses) inherits from **EventHandler**. Three of them (StreamController, AudioStreamController, SubtitleStreamController) further inherit from **TaskLoop** which adds a periodic-tick scheduler. Understanding these two base classes is mandatory for tracing event flow, debugging "why does my listener not fire", and extending hls.js with custom controllers.

## When to Use

- Custom controller doesn't register on `Hls` instance → check `handledEvents` + `registerListeners()`
- Tick loop stuck or running too fast → inspect `_tickInterval`, `setInterval(millis)`, `tick(forceAsync)`
- Memory leak suspicion → verify `destroy()` chain (EventHandler.destroy → unregisterListeners → controller cleanup)
- Reading hls.js source to trace `onFragLoaded` / `onLevelLoaded` etc. dispatch
- Implementing a replacement abrController via `config.abrController = MyAbrController`

## EventHandler — Reference

### Public Members
| Name | Purpose |
|---|---|
| `hls` | Reference to parent `Hls` instance (set during construction) |
| `handledEvents` | `string[]` — events this handler listens for. Auto-bound by `registerListeners()` |
| `useGenericHandler` | `boolean` — if true, all events route to `onEventGeneric(event, data)` |

### Public Methods
| Method | Purpose |
|---|---|
| `registerListeners()` | Iterates `handledEvents`, binds each to `onEvent(event, data)` or `onEventGeneric` based on `useGenericHandler` |
| `unregisterListeners()` | Inverse — detaches all listeners |
| `onEvent(event, data)` | Per-handler dispatch logic (subclass typically routes to `onFragLoaded`, `onLevelLoaded`, etc.) |
| `onEventGeneric(event, data)` | Fallback when no specific `onEvent` defined |
| `onHandlerDestroying()` / `onHandlerDestroyed()` | Lifecycle hooks called by `destroy()` |
| `isEventHandler()` | Type guard — returns `true` |
| `destroy()` | Calls `onHandlerDestroying` → `unregisterListeners` → `onHandlerDestroyed` |

### Subclasses (15)
AbrController, AudioStreamController, AudioTrackController, BufferController, CapLevelController, EMEController, FPSController, FragmentLoader, ID3TrackController, KeyLoader, LevelController, PlaylistLoader, StreamController, SubtitleStreamController, SubtitleTrackController, TimelineController.

## TaskLoop — Reference

`TaskLoop extends EventHandler` — adds periodic tick scheduling.

### Methods
| Method | Signature | Purpose |
|---|---|---|
| `setInterval(millis)` | `(number) → boolean` | Start periodic `doTick()` execution every N ms. Returns `true` if started |
| `clearInterval()` | `() → boolean` | Stop periodic execution. Returns `true` if was active |
| `tick(forceAsync)` | `(boolean) → boolean` | Execute `doTick()` immediately. Returns `true` if scheduled async, `false` if ran sync |
| `doTick()` | `() → void` | **Abstract** — subclass implements. Called on each tick |
| `hasInterval()` | `() → boolean` | Check if interval currently scheduled |

### Private Members
- `_tickInterval` — interval handle (timer id)
- `_tickCallCount` — execution counter

### Subclasses
StreamController, AudioStreamController, SubtitleStreamController. These three drive the segment-fetch state machine.

## Key Patterns

**Pattern 1 — Custom controller registration:**
```javascript
class MyController extends EventHandler {
    constructor(hls) {
        super(hls,
            HlsEvents.MANIFEST_LOADED,
            HlsEvents.LEVEL_SWITCHED,
            HlsEvents.FRAG_LOADED
        );
    }
    onManifestLoaded(data) { /* ... */ }
    onLevelSwitched(data)  { /* ... */ }
    onFragLoaded(data)     { /* ... */ }
}
```
hls.js auto-routes by camelCasing the event name.

**Pattern 2 — TaskLoop tick lifecycle:**
```javascript
// On entering active state
this.setInterval(100);  // tick every 100ms

// On exit
this.clearInterval();

// Force immediate tick (e.g., after fragment loaded)
this.tick();
```

## Common Bugs

| Symptom | Root cause |
|---|---|
| Listener registered but never fires | `handledEvents` missing the event, OR `registerListeners()` not called by hls.js (custom controller config) |
| Tick fires but `doTick` does nothing | State machine in IDLE; check `_state` in subclass |
| Memory leak after `Hls.destroy()` | Custom controller didn't override `onHandlerDestroying` to clean own resources |
| Tick running after destroy | `clearInterval()` not called in `onHandlerDestroying` |

## Cross-references

- **hlsjs-api-complete** — public Hls class + 47 properties + 73 events (modern v1.6 API surface)
- **hlsjs-internals-buffer-stream-controllers** — subclasses of TaskLoop driving fragment loading
- **hlsjs-internals-fragment-lifecycle** — events handled by FragmentLoader/Tracker (also EventHandler subclasses)
