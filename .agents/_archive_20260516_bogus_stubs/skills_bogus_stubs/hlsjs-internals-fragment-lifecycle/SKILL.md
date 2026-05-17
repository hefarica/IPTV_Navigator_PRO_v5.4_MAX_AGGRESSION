---
name: hlsjs-internals-fragment-lifecycle
description: Use when debugging fragment loading errors (FRAG_LOAD_ERROR, FRAG_LOAD_TIMEOUT), tracking buffer state per segment, building byte-range or encrypted-fragment logic, or implementing custom fragment retry/eviction. Covers Fragment, FragmentLoader, FragmentTracker, KeyLoader.
---

# hls.js Internals — Fragment Lifecycle

Source: `class/src/loader/fragment.js` · `fragment-loader.js` · `helper/fragment-tracker.js` · `loader/key-loader.js`

## Overview

Every segment hls.js plays passes through a 4-stage lifecycle:

```
FragmentLoader.onFragLoading
   → (if encrypted) KeyLoader.onKeyLoading → KEY_LOADED
   → loadsuccess → FRAG_LOADED
   → demuxer/remuxer → BUFFER_APPENDING
   → FragmentTracker tracks state: NOT_LOADED → APPENDING → PARTIAL/OK
   → BufferController eviction → detectEvictedFragments → marked NOT_LOADED again
```

The **Fragment** class is the data carrier; **FragmentLoader/KeyLoader** are network layers; **FragmentTracker** is the buffer-state mirror.

## When to Use

- "Segments load but never appear in buffer" → trace through FragmentTracker states
- Implementing partial-load (Range request) handling
- Debugging encrypted-segment failures (KEY_LOAD_ERROR)
- Building custom retry policy for our shield
- Reading `_findFragment()` etc. — need to know Fragment shape

## Fragment Class — Reference

### Core Properties
| Property | Type | Purpose |
|---|---|---|
| `url` (rw) | `string` | Resolved fragment URL |
| `baseurl` | `string` | Source playlist URL (for relative resolution) |
| `sn` | `number \| 'initSegment'` | Sequence number |
| `level` | `number` | Quality level index |
| `cc` | `number` | Discontinuity counter |
| `start` | `number` | Start time in seconds (relative to playlist) |
| `duration` | `number` | Length in seconds (from `#EXTINF`) |
| `type` | `'main' \| 'audio' \| 'subtitle'` | Track type |
| `byteRange` | `[start, end] \| []` | Byte range from `#EXT-X-BYTERANGE` |
| `byteRangeStartOffset` (getter) | `number` | Computed start byte |
| `byteRangeEndOffset` (getter) | `number` | Computed end byte |
| `decryptdata` | `LevelKey` | Encryption metadata (method, key URI, IV) |
| `programDateTime` (getter) | `number` | Unix timestamp from `#EXT-X-PROGRAM-DATE-TIME` |
| `tagList` | `string[][]` | Associated #EXT-X-* tags |
| `encrypted` (getter) | `boolean` | True if `decryptdata.method !== null` |

### Static
- `Fragment.ElementaryStreamTypes` — `{AUDIO: 'audio', VIDEO: 'video'}`

### Methods
| Method | Purpose |
|---|---|
| `addElementaryStream(type)` | Mark fragment as containing audio or video |
| `hasElementaryStream(type)` | Check if a stream type is present |
| `createInitializationVector(segmentNumber)` | Generates IV from sequence number when `#EXT-X-KEY` doesn't supply IV |
| `fragmentDecryptdataFromLevelkey(levelKey, segmentNumber)` | Builds per-fragment `decryptdata` from playlist-level KEY |

## FragmentLoader — Reference

`extends EventHandler`. Coordinates HTTP loading of one fragment.

### Properties
- `loaders` — object indexed by load type (`fragment`, `key`)

### Methods
| Method | Purpose |
|---|---|
| `onFragLoading(data)` | Initiates load. Wires `loadsuccess`/`loaderror`/`loadtimeout`/`loadprogress` callbacks |
| `loadsuccess(response, stats, context, networkDetails)` | Emit `FRAG_LOADED` with payload |
| `loaderror(response, context, networkDetails)` | Retry or emit `FRAG_LOAD_ERROR` |
| `loadtimeout(stats, context, networkDetails)` | Same with timeout reason |
| `loadprogress(stats, context, data, networkDetails)` | Emit `FRAG_LOAD_PROGRESS` |
| `destroy()` | Abort all active loaders |

### Configurable Retry/Timeout
| Config key | Default | Purpose |
|---|---|---|
| `fragLoadingTimeOut` | 20000ms | Per-attempt timeout |
| `fragLoadingMaxRetry` | 6 | Total retry count |
| `fragLoadingRetryDelay` | 1000ms | Base delay between retries |
| `fragLoadingMaxRetryTimeout` | 64000ms | Cap on exponential backoff |

## KeyLoader — Reference

`extends EventHandler`. Identical structure to FragmentLoader but for AES keys.

### Properties
| Property | Purpose |
|---|---|
| `loaders` | Active loader instances |
| `decryptkey` | Cached key bytes (Uint8Array) |
| `decrypturl` | URL of last loaded key (for caching) |

### Methods
- `onKeyLoading(data)` — initiate key fetch
- `loadsuccess` / `loaderror` / `loadtimeout` — emit `KEY_LOADED` / `KEY_LOAD_ERROR` / `KEY_LOAD_TIMEOUT`

### Caching Behavior
KeyLoader caches the last fetched key by URL — repeated AES-128 fragments using the same KEY URI fetch only once.

## FragmentTracker — Reference

`helper/fragment-tracker.js`. Mirrors fragment lifecycle in buffer space.

### FragmentState Enum
| State | Meaning |
|---|---|
| `NOT_LOADED` | Fragment not yet appended (default) |
| `APPENDING` | Currently in `sourceBuffer.appendBuffer()` |
| `PARTIAL` | Partially in buffer (eviction or incomplete append) |
| `OK` | Fully in buffer |

### Methods
| Method | Signature | Purpose |
|---|---|---|
| `getState(fragment)` | `(Fragment) → FragmentState` | Current state |
| `getBufferedFrag(time, type)` | `(number, string) → Fragment \| null` | Find fragment containing playhead `time` for given track type |
| `removeFragment(fragment)` | `(Fragment) → void` | Mark as NOT_LOADED, allowing reload |
| `detectEvictedFragments(type, timeRanges)` | `(string, TimeRanges) → void` | Walk buffer ranges, update fragments outside ranges to PARTIAL/NOT_LOADED |
| `detectPartialFragments(fragment)` | `(Fragment) → void` | Inspect buffer at fragment's expected range, set PARTIAL if incomplete |

### Why It Exists
Browser MSE auto-evicts buffer to free memory. Without FragmentTracker, hls.js wouldn't know that fragment N is gone — and would never reload it. The tracker reconciles "what hls.js thinks is buffered" vs "what `<video>.buffered` actually shows" on every BUFFER_APPENDED event.

## Common Bugs

| Symptom | Diagnosis |
|---|---|
| `FRAG_LOAD_TIMEOUT` on every fragment | `fragLoadingTimeOut` too low for upstream latency. Default 20s; for slow proxies extend to 60s |
| Encrypted segment stuck on KEY_LOADING | KeyLoader URL wrong (relative resolution failed). Check `Fragment.decryptdata.uri` |
| Same fragment loaded N times | FragmentTracker not being updated; `detectEvictedFragments` not firing post-flush |
| `Fragment.byteRange` empty when expected | `#EXT-X-BYTERANGE` missing in playlist or AttrList parser couldn't read it |
| AES decryption fails silently | `Fragment.decryptdata.iv` not auto-generated when `#EXT-X-KEY` lacks IV. Should fall through to `createInitializationVector(sn)` |

## Toolkit-Specific Application

For our IPTV Navigator generator (`m3u8-typed-arrays-ultimate.js`):

- **VERBATIM URL doctrine** maps directly to `Fragment.url` field — bytes-identical preservation matters per memory `feedback_never_strip_port_from_baseUrl`
- **Slot reaper** in our shield is the network-side analog of `loaderror` retry — both reclaim a session
- **Connection limit** (max_connections=1 on Xtream) breaks `KeyLoader.loaders` if hls.js parallelizes key + frag fetch. Test with sequential fetch profile

## Cross-references

- **hlsjs-internals-buffer-stream-controllers** — StreamController consumes Fragment events
- **hlsjs-internals-crypto-aes-eme** — Decrypter consumes `Fragment.decryptdata`
- **hlsjs-internals-m3u8-parser-attrlist** — M3U8Parser produces Fragment instances
- **iptv-url-constructor-7-rules** — applies to Fragment.url integrity
