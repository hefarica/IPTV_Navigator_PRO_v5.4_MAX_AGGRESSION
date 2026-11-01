# APE Player Compatibility Matrix

## Verified endpoints

| Endpoint | Status | Evidence |
|---|---|---|
| `/jit/playlist.m3u8` | 200 | 4.136.802 bytes |
| `/jit/catalog.json` | 200 | 2.448.699 bytes, 10.573 channels |
| `/jit/capabilities.json` | 200 | formats/HDR/limits |
| `/jit/live/3/master.m3u8` | 200 | HLS 1080, HEVC Main10 + AAC |
| `/jit/live/3/manifest.mpd` | 200 | DASH CMAF |
| `/jit/live/1174213/master.m3u8` | 200 | 4K HDR video-only when source audio invalid |
| `/jit/live/1174213/manifest.mpd` | 200 | 3840x2160, CICP PQ |
| `/jit/live/1174213/init-0.m4s` Range | 206 | `Content-Range: bytes 0-928/929` |

## Format compatibility expectation

| Player | HLS | DASH | HEVC Main10 | HDR10 | Status |
|---|---|---|---|---|---|
| VLC | expected | expected | expected | GPU-dependent | PENDING real test |
| mpv | expected | expected | expected | GPU-dependent | PENDING real test |
| OTT Navigator | expected | not guaranteed | ONN decoder supports | TV-dependent | PENDING real test |
| TiviMate | expected | limited | device-dependent | TV-dependent | PENDING real test |
| Kodi + inputstream.adaptive | expected | expected | device-dependent | TV-dependent | PENDING real test |
| Shaka Player | expected | expected | browser-dependent | browser-dependent | PENDING real test |
| ExoPlayer/Media3 | expected | expected | device-dependent | device-dependent | PENDING real test |
| ONN 4K + ARA | expected | app-dependent | Main10 HDR10 decoder confirmed | TV-dependent | PENDING real playback |

## ONN 4K decoder evidence

```text
onn. 4K Streaming Box
Android 14 / SDK 34
Amlogic s4
HEVC Main10 HDR10 up to 8192
HEVC Main10 HDR10+ up to 8192
OTT Navigator 1.7.3.3
```

## Honest limitations

- HLS is the highest-compatibility path.
- DASH is not accepted by every IPTV player/list parser.
- 4K source audio was EAC3 with 0 channels/sample rate; 4K currently emits video-only to keep the MPD valid.
- 1080 path keeps AAC audio.
- “No freeze, no lag, infinite buffer” cannot be guaranteed by manifests alone. It requires real player/device/network E2E.
- No fake 4K, HDR, CMAF or codec declarations.

## Required E2E matrix

```text
VLC desktop
mpv desktop
OTT Navigator on ONN
TiviMate on ONN
Kodi on ONN
Shaka in Chrome
ExoPlayer sample on ONN
TV HDR10 display
residential network
mobile network
```

Each test must record:

```text
manifest status
first segment status
first frame
video codec/resolution/HDR
audio present
startup time
rebuffer count
freeze count
```
