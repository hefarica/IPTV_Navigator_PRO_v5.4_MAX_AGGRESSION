---
name: hlsjs-internals-demuxers-remuxers
description: Use when debugging codec/container issues (TS won't play, fMP4 init segment errors, audio drift, ID3 metadata missing), analyzing PTS/DTS continuity, or implementing a custom demuxer/remuxer. Covers TSDemuxer, AAC/MP3/MP4 demuxers, MP4Remuxer, PassThroughRemuxer, ID3, ExpGolomb.
---

# hls.js Internals — Demuxers & Remuxers

Source: `class/src/demux/*.js` · `class/src/remux/*.js`

## Overview

hls.js converts every fragment to **fragmented MP4 (fMP4)** for the MSE SourceBuffer (which only accepts ISO-BMFF). Two stages:

1. **Demuxer** — parse container (TS, AAC, MP3, MP4) → elementary streams (audio frames, video NALUs, ID3)
2. **Remuxer** — wrap elementary streams into fMP4 boxes (`moof`, `mdat`, `traf`) → `appendBuffer()`

PassThroughRemuxer skips remuxing when source is already fMP4 (`#EXT-X-MAP` + `.m4s` segments).

## When to Use

- "Audio out of sync after discontinuity" → `_PTSNormalize` issue in MP4Remuxer
- "TS won't play, but provider works in VLC" → TSDemuxer PID detection or PMT parse issue
- "ID3 timed metadata events not firing" → ID3 demuxer + `FRAG_PARSING_METADATA` event not propagated
- Reading `decryptAndRemux*` to understand sample-AES path
- Writing a probe to detect TS vs MP4 vs AAC raw

## TSDemuxer — Reference

`extends EventHandler`. Parses MPEG-2 TS (RFC 13818-1) — 188-byte packets.

### Static Methods
| Method | Purpose |
|---|---|
| `probe(data: Uint8Array)` | Returns true if first bytes match TS sync byte `0x47` at expected intervals (188, 376, 564) |
| `createTrack(type, duration)` | Builds Track for `'audio'`, `'video'`, `'id3'`, or `'text'` |

### Public Instance Methods
| Method | Purpose |
|---|---|
| `append(data, timeOffset, contiguous, accurateTimeOffset)` | Process incoming TS bytes |
| `resetInitSegment(audioCodec, videoCodec, duration)` | Reinitialize on discontinuity or track change |
| `decryptAndRemux(...)` | Sample-AES path: decrypt audio TS first, then remux |
| `decryptAndRemuxAvc(...)` | Same but for AVC video samples |
| `discardEPB(data)` | Strip Emulation-Prevention-Bytes from H.264 RBSP (NALU sanitization) |

### Internal Tables Parsed
- **PAT** (Program Association Table) — at PID `0x0000`. Lists programs.
- **PMT** (Program Map Table) — per program. Maps stream-type byte → PID. Common types:
  - `0x01`/`0x02`: MPEG-1/2 video
  - `0x0F`: ADTS AAC audio
  - `0x1B`: H.264 video
  - `0x24`: H.265 video (HEVC)
  - `0x15`: ID3 timed metadata in PES
- **PES** (Packetized Elementary Stream) — actual codec bytes wrapped with PTS/DTS

### Internal State
- Audio/video/id3/text tracks
- Codec strings (`avc1.4d401f`, `mp4a.40.2`)
- Encryption key (when sample-AES)

## Other Demuxers

| Demuxer | Container | Use case |
|---|---|---|
| `AACDemuxer` | Raw ADTS AAC | Audio-only HLS audio renditions, podcasts |
| `MP3Demuxer` | Raw MP3 | Legacy audio-only |
| `MP4Demuxer` | ISO-BMFF (fMP4) | Pre-segmented fMP4 streams |
| `DemuxerInline` | Wrapper around any demuxer | Used when worker disabled |
| `Demuxer` (root class) | Worker dispatcher | Routes to correct demuxer per probe |
| `ID3` | Helper, not a demuxer | Parses ID3 frames inside PES |
| `ExpGolomb` | Helper | Variable-length code reader for SPS/PPS parsing |
| `SampleAesDecrypter` | Helper | Sample-AES decryption (per-sample, not per-segment) |

### Demuxer Functions (free)
- `appendFrame(track, frame, ...)` — push elementary-stream frame
- `getAudioConfig(observer, data, offset, audioCodec)` — extract AAC config from ADTS
- `getFrameDuration(samplerate)` — frames per AAC sample
- `getFullFrameLength(data, offset)`, `getHeaderLength(data, offset)` — ADTS sizes
- `parseFrameHeader(data, offset, ...)` — full ADTS parser
- `probe(data)`, `isHeader(data, offset)`, `isHeaderPattern(data, offset)` — format probes

### Demuxer Variables
- `utf8ArrayToStr` — UTF-8 string converter for ID3 text frames
- `MpegAudio` — MP3 helper

## MP4Remuxer — Reference

`class/src/remux/mp4-remuxer.js`. Converts demuxed elementary streams → fMP4 segments.

### Methods
| Method | Purpose |
|---|---|
| `generateIS(audioTrack, videoTrack, timeOffset)` | Produce **Initialization Segment** (ftyp + moov) — required before appending media |
| `remuxVideo(track, timeOffset, contiguous, accurateTimeOffset)` | Wrap H.264/H.265 NALUs into `moof+mdat` |
| `remuxAudio(track, timeOffset, contiguous, accurateTimeOffset)` | Wrap AAC frames into `moof+mdat` |
| `remuxID3(track, timeOffset)` | Emit `FRAG_PARSING_METADATA` for ID3 timed metadata |
| `remuxText(track, timeOffset)` | Wrap timed text |
| `remuxEmptyAudio(track, timeOffset, contiguous, videoData)` | Generate silent audio when track is empty (avoids MSE pipeline errors) |

### State Properties
| Property | Purpose |
|---|---|
| `ISGenerated` | True after `generateIS` ran (init segment sent) |
| `nextAudioPts` | PTS continuity counter for next audio chunk |
| `nextAvcDts` | DTS continuity counter for next video chunk |
| `_initDTS` (private) | First DTS seen — anchor for timeline |
| `_initPTS` (private) | First PTS seen |
| `_PTSNormalize` (private method) | Wrap-around handler for 33-bit MPEG-TS PTS field overflow |

### Why PTSNormalize Matters
TS PTS is 33-bit, wraps every ~26.5 hours. Live streams crossing wraparound need normalization to keep MSE timeline monotonic. Off-by-one here = 24h of audio drift.

## Other Remuxers

| Remuxer | Use case |
|---|---|
| `MP4` | Static helper for fMP4 box generation (`MP4.moov(...)`, `MP4.moof(...)`, `MP4.mdat(...)`) |
| `PassThroughRemuxer` | Source already fMP4 — skip remux. Used when `#EXT-X-MAP` declared init segment |
| `DummyRemuxer` | No-op for unrecognized streams |

## Key Helpers

### AAC (`helper/aac.js`)
- `getSilentFrame(codec, channelCount)` — synthesize silent AAC frame for `remuxEmptyAudio`

### Helper Functions (free)
- `isCodecSupportedInMp4(codec, type)` — feature-detects codec in current MSE impl
- `isCodecType(codec, type)` — `'audio'` vs `'video'` classification
- `getMediaSource()` — returns `MediaSource` or `WebKitMediaSource` for older Safari

### Discontinuity / PTS Helpers
- `adjustPts(sliding, details)`
- `alignDiscontinuities(lastFrag, lastLevel, details)`
- `findDiscontinuousReferenceFrag(prevDetails, curDetails)`
- `findFirstFragWithCC(fragments, cc)`
- `findFragWithCC(fragments, cc)`
- `shouldAlignOnDiscontinuities(lastFrag, lastLevel, details)`
- `updatePTS(fragments, fromIdx, toIdx)`
- `updateFragPTSDTS(details, frag, startPTS, endPTS, startDTS, endDTS)`
- `mergeDetails(oldDetails, newDetails)` — overlap merge between playlist refreshes

## Common Bugs

| Symptom | Diagnosis |
|---|---|
| Audio drifts +/- N seconds after a couple hours of live | PTS wraparound — check `_PTSNormalize` integration / version |
| Video plays but audio silent | `remuxEmptyAudio` triggered (codec mismatch or empty audio track from demux) — check `audioCodec` in PMT |
| HEVC/H.265 won't play on Chrome | `isCodecSupportedInMp4('hev1.1.6.L150.B0', 'video')` returns false — Chrome HEVC support gated |
| `#EXT-X-MAP` fMP4 stream stalls | PassThroughRemuxer expected; if MP4Remuxer engaged → init segment double-generated |
| ID3 events not firing | TSDemuxer not detecting PMT stream-type `0x15`, OR `id3TrackController` not registered |

## Cross-references

- **hlsjs-internals-fragment-lifecycle** — Fragment payload feeds into demuxer
- **hlsjs-internals-buffer-stream-controllers** — BufferController appends remuxed output
- **hlsjs-internals-crypto-aes-eme** — sample-AES path runs before remux
