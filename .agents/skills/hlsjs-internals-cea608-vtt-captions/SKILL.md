---
name: hlsjs-internals-cea608-vtt-captions
description: Use when debugging closed captions / subtitles (CEA-608 captions not appearing, WebVTT cues garbled, subtitle track switching), or when implementing custom caption rendering. Covers Cea608Parser, VTTParser, WebVTTParser, OutputFilter, TimelineController.
---

# hls.js Internals — CEA-608, WebVTT & Caption Pipeline

Source: `class/src/utils/cea-608-parser.js` · `function/index.html#static-function-VTTParser` · `controller/timeline-controller.js`

## Overview

Two caption formats supported:

1. **CEA-608** — embedded in MPEG-TS video stream as user-data SEI messages. Parsed live by `Cea608Parser` from H.264 NALU SEI payload.
2. **WebVTT** — separate `#EXT-X-MEDIA:TYPE=SUBTITLES` track, fetched as standalone segments. Parsed by `WebVTTParser`.

`TimelineController` wires both into `<track>` elements on the HTMLMediaElement.

## When to Use

- "CEA-608 captions in TS but never visible" → check `enableCEA708Captions: true` (yes the option says 708 but covers 608)
- "Subtitle track URI fails to load" → PlaylistLoader misroutes SUBTITLES type
- "Captions appear with wrong timing" → `cueSplitAtTime` boundary issue
- Implementing burned-in captions, custom rendering
- Reading TS user-data SEI extraction in TSDemuxer

## Cea608Parser — Reference

### Methods
| Method | Signature | Purpose |
|---|---|---|
| `addData(timestamp, byteList)` | `(number, number[]) → void` | Process byte pairs at given timestamp |
| `parseCmd(a, b)` | `(number, number) → boolean` | Interpret control commands (clear, roll-up, paint-on) |
| `parsePAC(a, b)` | `(number, number) → boolean` | Preamble Address Code — set row/column/style |
| `parseMidrow(a, b)` | `(number, number) → boolean` | Mid-row attribute change (color, italics) |
| `parseChars(a, b)` | `(number, number) → number[] \| null` | Extract printable characters |
| `parseBackgroundAttributes(a, b)` | `(number, number) → boolean` | Background color/transparency |
| `cueSplitAtTime(t)` | `(number) → void` | Force cue boundary at time `t` (e.g., on segment boundary) |
| `getHandler(idx)` / `setHandler(idx, fn)` | | Register `OutputFilter` for channel idx |
| `reset()` | | Reset all channel state |

### Properties
- `channels` — array of caption channels (CC1, CC2, CC3, CC4)
- `currChNr` — currently active channel
- `field` — TS field byte (0 or 1)
- `dataCounters` — counters for `padding`, `char`, `cmd`, `other` byte types (debug)

### Output Pattern
Cea608Parser doesn't render directly. It calls registered `OutputFilter.dispatchCue(cue)` when a cue completes. The OutputFilter then bridges to `<track>.addCue()`.

## OutputFilter — Reference

`class/src/utils/output-filter.js`. Bridges Cea608Parser → WebVTT cues.

### Methods
- `newCue(startTime, endTime, screen)` — emit a new cue
- `dispatchCue()` — flush current cue
- `reset()` — clear state

### Integration
TimelineController instantiates OutputFilter per channel. OutputFilter accumulates rows from Cea608Parser, calls `newCue()` on completion which propagates to TextTrack.

## WebVTTParser — Reference

`class/src/utils/webvtt-parser.js`. Parses WEBVTT subtitle segments fetched as part of a SUBTITLES track.

### Functions
- `WebVTTParser` — main parser entry
- `fixLineBreaks(input)` — normalize line endings to Unix `\n`
- `clearCurrentCues(track)` — remove all current cues from a TextTrack
- `sendAddTrackEvent(track, video)` — fire `addtrack` on `<video>.textTracks`
- `newCue(track, startTime, endTime, captionScreen)` — create VTTCue and add to track

## VTTParser

Lower-level parser used by WebVTTParser. Strict WEBVTT spec parsing.

### Cue Format
```
WEBVTT

00:00:00.000 --> 00:00:05.000 line:90% align:center
First subtitle text
Multiple lines OK

00:00:05.500 --> 00:00:10.000
Second subtitle
```

Settings recognized:
- `line:N%` / `line:N` — vertical position
- `align:start|center|end|left|right`
- `position:N%`
- `size:N%`
- `vertical:rl|lr` — vertical text

## TimelineController — Reference

`class/src/controller/timeline-controller.js`. Top-level caption coordinator.

### Responsibilities
- Listen for `MEDIA_ATTACHED` → create `<track>` elements per channel
- Listen for `FRAG_PARSING_USERDATA` (CEA-608 SEI from TSDemuxer) → forward to `Cea608Parser.addData`
- Listen for `FRAG_LOADED` for SUBTITLES track → invoke `WebVTTParser`
- Manage track activation per `defaultTextTrack` config

### Config Keys
| Key | Purpose |
|---|---|
| `enableCEA708Captions` (default true) | Enable CEA-608 parsing (poorly-named, covers 608+708) |
| `captionsTextTrack1Label` | Label for CC1 track |
| `captionsTextTrack1LanguageCode` | Lang for CC1 |
| `captionsTextTrack2Label` / `LanguageCode` | Same for CC2 |
| `enableWebVTT` | Enable WebVTT subtitle track parsing |
| `defaultTextTrack` | Auto-activate this track id |

## Common Bugs

| Symptom | Diagnosis |
|---|---|
| TS has CEA-608 but no captions | TSDemuxer not extracting SEI user-data, OR `enableCEA708Captions: false` |
| WebVTT cues 5s late | TIMESTAMP MAP mismatch — VTT has `X-TIMESTAMP-MAP:LOCAL=00:00:00.000,MPEGTS=N` and N doesn't match expected PTS offset |
| Subtitle text shows raw markdown chars | OutputFilter not stripping CEA-608 attributes correctly |
| Subtitle track empty in `<video>.textTracks` | TimelineController didn't create track — check `MEDIA_ATTACHED` fired before manifest load |
| Wrong language detected | `#EXT-X-MEDIA:TYPE=SUBTITLES,LANGUAGE="..."` missing or AttrList parse failed |

## Toolkit Application

For our IPTV Navigator:
- **Most live providers don't ship captions** — TimelineController idle
- **Some sports/news channels embed CEA-608** in TS — keep `enableCEA708Captions: true`
- **No WebVTT subtitles** in our streams currently — `enableWebVTT` doesn't matter
- ID3 timed metadata for SCTE-35 ad markers may pass through TimelineController as well (separate track)

## Cross-references

- **hlsjs-internals-demuxers-remuxers** — TSDemuxer extracts SEI user-data
- **hlsjs-internals-buffer-stream-controllers** — TimelineController is also EventHandler subclass
- **skill_hls_fmp4_encryption_cbcs** — encrypted captions (rare)
