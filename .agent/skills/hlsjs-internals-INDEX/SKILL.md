---
name: hlsjs-internals-INDEX
description: Use when answering "which hls.js internal area does this question touch" or when needing a directory of all hls.js internals skills. Master index that routes questions about hls.js source code, controllers, demuxers, encryption, captions, and configuration to the right specialized skill.
---

# hls.js Internals — Master Index

A 9-skill family covering hls.js architecture extracted from `https://nochev.github.io/hls.js/docs/html/`.

## When to Use

Pick this skill when the question is hls.js-related but you don't yet know which specific area applies. Use the routing table below.

## Routing Table

| Question contains... | Go to skill |
|---|---|
| "EventHandler", "TaskLoop", "tick", "registerListeners", "destroy chain", "doTick", custom controller | **hlsjs-internals-task-loop-eventhandler** |
| "M3U8Parser", "AttrList", "STREAM-INF", "EXT-X-MEDIA", "playlist parser", "URI resolution", "convertAVC1ToAVCOTI", attribute getters | **hlsjs-internals-m3u8-parser-attrlist** |
| "EWMA", "EwmaBandWidthEstimator", "abrBandWidthUpFactor", "abrEwmaFastLive", "ABR math", "level selection", "findBestLevel", "abandon rules" | **hlsjs-internals-ewma-abr-math** |
| "BufferController", "StreamController", "doTick", "FRAG_LOADING state", "FPSController", "CapLevelController", "LevelController", "redundant streams" | **hlsjs-internals-buffer-stream-controllers** |
| "Fragment", "FragmentLoader", "FragmentTracker", "KeyLoader", "FragmentState", "byteRange", "decryptdata", "evicted fragments" | **hlsjs-internals-fragment-lifecycle** |
| "TSDemuxer", "AAC/MP3/MP4 demuxer", "MP4Remuxer", "PassThroughRemuxer", "PAT/PMT/PES", "PTS/DTS", "SampleAesDecrypter", "ID3", "ExpGolomb" | **hlsjs-internals-demuxers-remuxers** |
| "Decrypter", "AESCrypto", "AESDecryptor", "FastAESKey", "Web Crypto fallback", "EMEController", "Widevine", "PlayReady", "license server" | **hlsjs-internals-crypto-aes-eme** |
| "CEA-608", "CEA-708", "Cea608Parser", "WebVTT", "captions", "subtitles", "TimelineController", "OutputFilter" | **hlsjs-internals-cea608-vtt-captions** |
| "HlsEvents", "ErrorTypes", "ErrorDetail", "hlsDefaultConfig", "MANIFEST_LOADED", "FRAG_LOADED event names", "fatal error recovery" | **hlsjs-internals-events-errors-config** |

## Pre-existing Sister Skills (do NOT duplicate)

| Skill | Coverage |
|---|---|
| **hlsjs-api-complete** | Modern v1.6 public Hls class — 25 methods, 47 properties, 73 events |
| **hlsjs-official-calibration** | Concrete v1.6 default values from `src/config.ts` (P0-P5 tuning) |

These two cover the **public API of modern hls.js v1.6**. The 9-skill `hlsjs-internals-*` family below covers the **legacy 0.x architectural docs** (still useful for reading source, debugging at framework level, implementing custom controllers).

## Decision Flow

```
Q: hls.js question?
  ├─ Need public API method/property/event of v1.6 → hlsjs-api-complete
  ├─ Need concrete default config value or tuning recipe → hlsjs-official-calibration
  └─ Need internal architecture / source-level understanding → use routing table above
```

## Cross-references

All 9 internal skills + the 2 v1.6 skills are designed to coexist. Each `hlsjs-internals-*` skill links to its peers via cross-reference sections.

This index itself does NOT carry technical content — it routes. Read the destination skill for substance.
