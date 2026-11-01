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

## Runtime

```text
Node 20 service:  /opt/ape-jit/server.js
systemd:          /etc/systemd/system/ape-jit.service
channel allowlist:/opt/ape-jit/channels.json  (root-only, not in git)
output cache:     /dev/shm/ape-jit/<id>
```

## FFmpeg profile

```text
video: H.264 source -> HEVC libx265 ultrafast, 2 threads, 1080p
audio: MP2/AAC source -> AAC 128k
container: HLS fMP4/CMAF (init.mp4 + .m4s)
bitrate: 2500k / max 2800k / bufsize 5000k
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
1 x 1080p HEVC, threads=2:  66.84 fps  (HLS test)
1 x 1080p DASH+HLS:         55.13 fps  (DASH test)
3 x ABR 1080/720/480, t=1:  25.13 fps  (not real-time)
```

One 1080p rendition is the safe operating point.

## List generation

`build_channels.js` reads an authorized list and writes:

```text
channels.json       id -> source URL (root-only)
APE_JIT_LIST.m3u8   10.573 entries -> /jit/live/<id>/master.m3u8
```

The generated map is deployed manually to `/opt/ape-jit/channels.json`; it is
never committed because it contains source URLs.
