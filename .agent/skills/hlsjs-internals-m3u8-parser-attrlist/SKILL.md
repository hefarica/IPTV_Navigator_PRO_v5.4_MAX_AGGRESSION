---
name: hlsjs-internals-m3u8-parser-attrlist
description: Use when designing or auditing M3U8 manifest parsers (master/level playlist), when our generator needs to emit a tag that hls.js will accept, when debugging "tag X is silently ignored by hls.js", or when extracting attributes from EXT-X-KEY/STREAM-INF/MEDIA. Mirrors hls.js's own parser semantics so our emitted manifests parse cleanly.
---

# hls.js Internals — M3U8Parser & AttrList

Source: https://nochev.github.io/hls.js/docs/html/class/src/loader/m3u8-parser.js~M3U8Parser.html · https://nochev.github.io/hls.js/docs/html/class/src/utils/attr-list.js~AttrList.html

## Overview

Two static parsers convert raw `.m3u8` text into structured objects hls.js consumes:

- **M3U8Parser** — top-level orchestrator. Splits master vs media playlists, resolves URLs, finds groups.
- **AttrList** — sub-parser for attribute-list tags (`KEY="...",DURATION=...,RESOLUTION=NxM`). Type-safe getters.

Aligning our M3U8 generator's output with these parsers' expectations is non-negotiable: malformed attribute syntax causes silent rendition drop, not error.

## When to Use

- Validating that our `m3u8-typed-arrays-ultimate.js` output is parseable by hls.js
- Debugging "level X never appears in `hls.levels[]`" → likely AttrList rejected its STREAM-INF
- Adding a new EXT-X-* tag → cross-check what AttrList getter would consume it
- Implementing custom playlist parser in toolkit — mirror these semantics

## M3U8Parser — Static Methods

| Method | Signature | Purpose |
|---|---|---|
| `parseMasterPlaylist(string, baseurl)` | `(string, string) → Level[]` | Parses master multivariant. Extracts `#EXT-X-STREAM-INF` blocks → `Level{url, bitrate, codecs, resolution, audioGroupIds, ...}` |
| `parseLevelPlaylist(string, baseurl, id, type)` | `(string, string, number, string) → LevelDetails` | Parses media playlist. Extracts `#EXTINF`, `#EXT-X-BYTERANGE`, `#EXT-X-KEY`, `#EXT-X-MAP`, `#EXT-X-DISCONTINUITY` |
| `parseMasterPlaylistMedia(string, baseurl, type, audioGroups?)` | `(string, string, string, Array) → MediaTrack[]` | Parses `#EXT-X-MEDIA` rows. Filters by `TYPE=AUDIO\|SUBTITLES` |
| `resolve(url, baseurl)` | `(string, string) → string` | URI resolution per RFC 3986 — handles relative paths, `://`, `//host` |
| `findGroup(groups, mediaGroupId)` | `(MediaTrack[], string) → MediaTrack` | Lookup `#EXT-X-MEDIA` row by `GROUP-ID` |
| `convertAVC1ToAVCOTI(codec)` | `(string) → string` | Transforms `avc1.4D4028` ↔ `avc1.77.40` for codec compat |

## AttrList — Reference

### Construction

```javascript
const a = new AttrList('BANDWIDTH=5000000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1920x1080');
// or:
AttrList.parseAttrList('BANDWIDTH=5000000,...');
```

### Type-Safe Getters

| Method | Returns | Example input value |
|---|---|---|
| `decimalInteger(name)` | `number \| NaN` | `BANDWIDTH=5000000` → `5000000` |
| `hexadecimalInteger(name)` | `Uint8Array` | `IV=0x1A2B3C...` → bytes |
| `hexadecimalIntegerAsNumber(name)` | `number` | Same hex but as 32-bit number |
| `decimalFloatingPoint(name)` | `number` | `DURATION=10.024` → `10.024` |
| `enumeratedString(name)` | `string \| undefined` | `TYPE=AUDIO` → `"AUDIO"` |
| `decimalResolution(name)` | `{width, height}` | `RESOLUTION=1920x1080` → `{width: 1920, height: 1080}` |

### Tags Consumed

| M3U8 tag | AttrList format |
|---|---|
| `#EXT-X-STREAM-INF` | `BANDWIDTH=...,CODECS="...",RESOLUTION=NxM,FRAME-RATE=...,VIDEO-RANGE=PQ,HDCP-LEVEL=TYPE-0,AUDIO="grp"` |
| `#EXT-X-MEDIA` | `TYPE=AUDIO,GROUP-ID="aac",NAME="English",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="en",URI="audio.m3u8"` |
| `#EXT-X-KEY` | `METHOD=AES-128,URI="key.bin",IV=0x...,KEYFORMAT="..."` |
| `#EXT-X-MAP` | `URI="init.mp4",BYTERANGE="1000@0"` |
| `#EXT-X-I-FRAME-STREAM-INF` | Same as STREAM-INF |
| `#EXT-X-SESSION-KEY` | Same as KEY |

## Critical Rules for Our Generator

These rules ensure hls.js's M3U8Parser doesn't silently drop our renditions:

| Rule | Why |
|---|---|
| **Quote string values** containing comma/space (`CODECS="a,b"`, `NAME="Channel 1"`) | Unquoted comma terminates the attribute — `CODECS=a,b` is parsed as two attrs |
| **`BANDWIDTH` is REQUIRED** in `#EXT-X-STREAM-INF` | Missing → entire rendition rejected |
| **`RESOLUTION` format `WxH`** with literal `x`, no spaces | `1920 x 1080` or `1920X1080` may be tolerated but inconsistent across versions |
| **`FRAME-RATE` decimal**, not fraction | `60` or `59.94` OK; `60000/1001` rejected |
| **`URI` is RELATIVE-resolvable** to the playlist URL via `M3U8Parser.resolve()` | If absolute, must be valid URL or rejected |
| **No trailing comma** in attribute list | Some versions tolerate it; be conservative |
| **`#EXT-X-VERSION` declared** before any version-gated tag (KEY, MAP, etc.) | Tag presence triggers version-check enforcement |

## Common Bugs in Our Toolkit

| Symptom | Root cause |
|---|---|
| Player only shows one rendition out of 6 | One profile's STREAM-INF has unquoted `CODECS=hvc1.2.4.L153.B0,mp4a.40.2` → parser splits at `,` |
| `hls.levels` empty after parse | Master playlist has no `#EXT-X-STREAM-INF` — generator emitted only `#EXT-X-MEDIA` rows |
| Audio track not selectable | `#EXT-X-MEDIA` `URI=` missing, or `GROUP-ID` mismatch with STREAM-INF `AUDIO=` |
| Encryption key not loaded | `#EXT-X-KEY:METHOD=AES-128,URI=key.bin` — URI not quoted (auth tokens with `,` break it) |

## Cross-references

- **iptv-exthttp-traps-checklist** — 8 traps in EXTHTTP block (sister concept to STREAM-INF)
- **iptv-4layer-fallback-doctrine** — comma-separated multi-value strategy must NOT bleed into STREAM-INF/MEDIA values
- **hlsjs-internals-fragment-lifecycle** — Fragment objects are the output of `parseLevelPlaylist`
