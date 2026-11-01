# APE JIT CMAF (single active channel)

Deployed at `https://iptv-ape.duckdns.org/jit`.

## Endpoints

```text
GET /jit/playlist.m3u8                    10.573-channel JIT list
GET /jit/live/<id>/master.m3u8            master (HEVC + AAC)
GET /jit/live/<id>/index.m3u8             media playlist (CMAF)
GET /jit/live/<id>/init.mp4               fMP4 init
GET /jit/live/<id>/seg_NNN.m4s            CMAF segments
GET /jit/health                           service state
```

## Native 4K HDR passthrough

If `ffprobe` reports a real 4K HDR HEVC source (3840x2160, BT.2020/PQ), the
service does **not** transcode video and does **not** downscale:

```text
-c:v copy -tag:v hvc1
audio only: EAC3 -> AAC 256k (DASH muxer rejects EAC3 copy here)
```

Verified with `TNT SPORTS ULTIMATE 4K` (id 1174213):

```text
HLS master: RESOLUTION=3840x2160, VIDEO-RANGE=PQ
MPD:        maxWidth=3840 maxHeight=2160, CICP 9/16/9
init:       hevc Main10, yuv420p10le, level 153, BT.2020/PQ
CPU:        21 % (video copy)
```

1080/480/720 sources still use the zscale HDR10 transcode path.

## Runtime

```text
Node 20 service:  /opt/ape-jit/server.js
systemd:          /etc/systemd/system/ape-jit.service
channel allowlist:/opt/ape-jit/channels.json  (root-only, not in git)
output cache:     /dev/shm/ape-jit/<id>
```

## FFmpeg profile

```text
video: H.264 SDR -> HEVC Main10 HDR10, 3 threads, minimum 1920x1080
      480/720 sources: Lanczos upscale to 1920x1080
      1080 sources:    unchanged (no downscale)
color: setparams bt709 -> zscale SDR->PQ (npl=100), BT.2020 / ST 2084 / BT.2020nc
audio: MP2/AAC source -> AAC 128k
container: HLS fMP4/CMAF (init-*.m4s + chunk-*.m4s)
bitrate: 3000k / max 3300k / bufsize 6000k
DASH: manifest.mpd + CICP SupplementalProperty
HLS: VIDEO-RANGE=PQ + hvc1.2.4.L123.B0
```

Measured on the production VPS:

```text
10 s of 1080p source transcoded in 9.30 s
66.84 fps, 2.18 CPU cores, 228 MB RSS
```

Only **one** channel is active at a time. A channel switch kills the previous
FFmpeg. Idle timeout is 20 s.

## Why not 3 ABR renditions

Three simultaneous x265 encoders (1080p+720p+480p) do not fit in 3 vCPU.
The deployed service uses one 1080p HEVC rendition to preserve real-time.

## Not implemented

- LCEVC (requires licensed encoder and enhancement layer).
- Three-rendition ABR: measured 25.13 fps for a 30 fps source on the 3-vCPU VPS
  (6 s encoded in 5.97 s, 189% CPU), so it is not sustainable real-time.
- DASH is now implemented alongside HLS from the same fMP4 segments.

## Measured limits

```text
1 x 1080p SDR HEVC, t=2:        66.84 fps
1 x 1080p HDR10 (no zscale), t=3: 27.47 fps
1 x 1080p HDR10 + zscale, t=3:  30.25 fps
3 x ABR 1080/720/480, t=1:      25.13 fps (not real-time)
```

The source has ~25 real frames/s (149 frames in 6 s), so 1080p HDR10 at
30.25 fps is the non-downgrade operating point. Resolution stays 1920x1080.

SD verification with a real channel (`1313573`, name says UHD EN SD):

```text
HLS master: RESOLUTION=1920x1080, VIDEO-RANGE=PQ
DASH MPD:   maxWidth=1920 maxHeight=1080
MPD video:  width=1920 height=1080, hvc1.2.4.L123.B0
CICP:       primaries 9, transfer 16, matrix 9
```

## List generation

`build_channels.js` reads an authorized list and writes:

```text
channels.json       id -> source URL (root-only)
APE_JIT_LIST.m3u8   10.573 entries -> /jit/live/<id>/master.m3u8
```

The generated map is deployed manually to `/opt/ape-jit/channels.json`; it is
never committed because it contains source URLs.
