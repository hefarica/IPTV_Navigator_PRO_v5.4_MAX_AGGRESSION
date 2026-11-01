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
| ONN 4K + ARA | playlist loaded | app-dependent | HDR10 init failed; SDR AVC fallback works | TV-dependent | HDR failed 4001; SDR/H.264 1080p PLAYED |

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

## Real device test 2026-11-01

Command:

`	ext
PlayerActivity --es url https://iptv-ape.duckdns.org/jit/live/3/master.m3u8
`

Observed:

`	ext
VIDEO elegido: video/hevc hvc1.2.4.L123.90 1920x1080 bps=3000000
ColorInfo: BT2020, Limited range, ST2084 PQ, 10bit
player error: ERROR_CODE_DECODER_INIT_FAILED (4001)
decoder fallback 1/2 and 2/2: same failure
`

Conclusion: the ONN's advertised HEVC Main10 HDR10 capability does not
guarantee that this 1080p60 PQ stream initializes. A real SDR/AVC fallback
path is still required before claiming device compatibility.

## Device fallback verified 2026-11-01

Observed:

`	ext
HDR HEVC 1080p:
ERROR_CODE_DECODER_INIT_FAILED (4001)

ARA automatic fallback:
https://iptv-ape.duckdns.org/jit/live/3/sdr/master.m3u8

Selected:
mime=video/avc codecs=avc1.640028 1920x1080 bps=4500000
`

Screenshot shows live video rendering in APE Crystal Agent on the ONN.

Conclusion: HDR10 is not usable on this ONN for this 1080p60 stream; the
SDR/H.264 variant is the working fallback. Maximum-quality HDR remains
device-dependent, not universal.
