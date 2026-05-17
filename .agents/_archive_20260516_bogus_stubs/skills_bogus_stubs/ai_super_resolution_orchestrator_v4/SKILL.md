---
name: AI Super Resolution Orchestrator v4.0 — Polymorphic Visual Maximizer
description: Detects 20 devices (9 TVs, 6 players, 5 software), merges player+TV combos for max quality. Always-active HDR/SDR 4000-5000 nits. Bandwidth boost for AI processing. Hardware acceleration forcing. Idempotent and polymorphic.
---

# AI Super Resolution Orchestrator v4.0

## Purpose

Orchestrate the maximum possible visual quality by detecting the player AND the TV, merging their capabilities, and injecting metadata that activates every AI processing engine available in the hardware chain.

**Zero Proxy Policy**: Never touches video bytes. Only injects HTTP headers and EXTVLCOPT directives that tell the player and TV how to process the stream.

## Architecture

```
HTTP Request (User-Agent) → detectDevice() → storeDeviceMemory()
                                                    ↓
                               detectCombo() ← loadDeviceMemory()
                                    ↓
                    ┌───────────────────────────────┐
                    │  Merge: MAX of each capability │
                    │  - Best HDR (ranked)           │
                    │  - Best Audio (ranked)         │
                    │  - Max neural networks         │
                    │  - Max nits                    │
                    │  - Best codecs                 │
                    └───────────────────────────────┘
                                    ↓
                    injectHardwareAcceleration()
                    calculateBandwidthBoost()
                    injectClientSideLogic() ← per resolution tier
                                    ↓
                    Headers + EXTVLCOPT injected into M3U8 response
```

## Supported Devices (20)

### Smart TVs (9)
| Brand | AI Processor | Neural Nets | HDR | Nits |
|:---|:---|:---:|:---|:---:|
| Samsung | NQ8 AI Gen3 | 768 | HDR10+ Advanced | 5000 |
| LG | α11 AI 4K | 512 | Dolby Vision IQ | 4000 |
| Sony | XR Backlight Master | 384 | Dolby Vision/HDR10 | 3000 |
| Panasonic | HCX Pro AI MK2 | 256 | HDR10+/Dolby Vision | 2000 |
| Hisense | Hi-View Engine X | 128 | HDR10+ | 2000 |
| Philips | P5 AI Engine | 128 | DV/HDR10+ | 2000 |
| TCL | AIPQ Engine 3 | 96 | HDR10+ | 2500 |
| Xiaomi | AI Picture Quality | 64 | Dolby Vision IQ | 1500 |
| Vizio | IQ Ultra | 64 | Dolby Vision IQ | 1800 |

### Hardware Players (6)
| Player | Processor | HW Codecs | HDR | Combo |
|:---|:---|:---|:---|:---:|
| Fire TV 4K Max | MediaTek MT8696 | AV1,HEVC,H264,VP9 | HDR10+/DV | ✅ |
| Apple TV 4K | A15 Bionic | HEVC,H264,VP9 | DV/HDR10 | ✅ |
| NVIDIA Shield | Tegra X1+ | AV1,HEVC,H264,VP9 | DV/HDR10 | ✅ |
| ONN 4K | Amlogic S905Y4 | AV1,HEVC,H264,VP9 | HDR10+/DV | ✅ |
| Chromecast | Amlogic S905X4 | AV1,HEVC,H264,VP9 | HDR10+/DV | ✅ |
| Roku | ARM Cortex A55 | HEVC,H264,VP9 | HDR10+/DV | ✅ |

### Software Players (5)
VLC (Lanczos), Kodi (Bilinear), ExoPlayer, OTT Navigator, Stremio (mpv)

## Combo Detection (Polymorphic)

When a player (e.g., Fire Stick 4K Max) and a TV (e.g., Samsung) are both detected:

```
Fire Stick 4K Max          Samsung NQ8 AI Gen3
     ↓                           ↓
AV1 HW decode 4K60       768 neural networks
Dolby Atmos eARC          AI Upscaling Pro
                  ↓
         COMBO MERGE: fire_tv+samsung
         - decode: AV1 (from Fire Stick)
         - AI: NQ8 768 nets (from Samsung)
         - HDR: HDR10+ Advanced 5000 nits
         - Audio: Dolby Atmos Spatial
         - BW boost: 1.3x (30% more for AI processing)
```

### Combo BW Boost
```
Combo (1.3x) × SD upscale (1.5x) = 1.95x bandwidth boost
Combo (1.3x) × HD upscale (1.3x) = 1.69x bandwidth boost
Combo (1.3x) × FHD upscale (1.15x) = 1.50x bandwidth boost
Combo (1.3x) × Native 4K (1.0x) = 1.30x bandwidth boost
```

## Resolution Strategy (Always HDR/SDR at 4000-5000 nits)

| Input | Output Target | Key Features |
|:---|:---|:---|
| SD 480p | 4K 2160p | AI Upscale 4.5x, Fake HDR 5000 nits, deinterlace, denoise |
| HD 720p | 4K 2160p | HDR10+ Advanced, AI Color, AI Motion, tone mapping |
| FHD 1080p | 4K 2160p | AI Full Pipeline, genre detection, judder reduction |
| 4K+ native | 4K/8K | Deep Color 12bit 4:4:4, Dolby Vision IQ, grain preserve |

**SDR content → ALWAYS gets HDR simulation (4000-5000 nits)**
**HDR content → ALWAYS gets AI-enhanced tone mapping**

## Properties

- **Idempotent**: Same UA + same height → always same output
- **Polymorphic**: Adapts to device combo, takes MAX of every capability
- **Orchestrator**: Finds the absolute best quality path through the hardware chain

## Files

| File | Location |
|:---|:---|
| Engine | `/var/www/html/cmaf_engine/modules/ai_super_resolution_engine.php` |
| Device Memory | `/tmp/ape_device_memory.json` |
| Shim Log | `/var/log/iptv-ape/shim_operations.log` |

## Monitoring

```bash
# Check detected devices and combos
cat /tmp/ape_device_memory.json

# Watch AI engine in action
tail -f /var/log/iptv-ape/shim_operations.log | grep ai
```
