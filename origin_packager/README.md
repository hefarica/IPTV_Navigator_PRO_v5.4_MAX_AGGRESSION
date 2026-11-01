# APE Authorized-Origin CMAF Packager

Repackage an **authorized** HLS/MPEG-TS input into fMP4/CMAF HLS.

## What it does

```text
authorized TS/HLS input
  → ffmpeg -c copy (no video transcode)
  → init.mp4 + seg_*.m4s + index.m3u8
  → nginx with Range/CORS/no-cache playlist
```

It produces real:

```text
#EXT-X-MAP:URI="init.mp4"
*.m4s
```

It does **not** invent CMAF tags for `.ts` sources.

### Audio handling (measured on the real provider)

The real provider serves **H.264 video + MP2 audio**. MP2 cannot be copied
into fMP4, so the packager keeps video `-c copy` and transcodes **audio only**
to AAC:

```text
AAC       → copy + aac_adtstoasc
AC3/EAC3  → copy
MP2/MP3   → transcode audio to AAC 128k
```

Verified output: `init.mp4` reports `h264 1920x1080` + `aac`.

## Requirements

- Linux host controlled by the owner.
- `ffmpeg` with HLS fMP4 muxer.
- `nginx` for the edge.
- CPU/RAM sized per channel. Start on-demand, not 10k channels at once.
- Written authorization for every input URL.

## Run

```bash
cp .env.example .env
# edit INPUT_URL with an AUTHORIZED source
set -a; . ./.env; set +a
bash packager.sh
```

Serve `/srv/ape-cmaf` with `nginx.conf`.

## Validate

```bash
grep -E 'EXT-X-MAP|\.m4s' /srv/ape-cmaf/index.m3u8
curl -sI http://127.0.0.1:8080/index.m3u8
curl -sI http://127.0.0.1:8080/init.mp4
```

Expected:

```text
#EXT-X-MAP:URI="init.mp4"
seg_000000.m4s
```

## Limits (honest)

- `-c copy` only works if the input audio/video codecs are valid in fMP4.
- This gives **CMAF/fMP4**, not full LL-HLS. LL-HLS needs `EXT-X-PART`,
  `PRELOAD-HINT`, `SERVER-CONTROL` and a packager that emits partial segments.
- No DRM bypass, no provider evasion, no unauthorized access.
- Do not run this on the rebase-only production VPS.
- One process per channel; 10,573 simultaneous live channels is not feasible.
