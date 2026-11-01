#!/usr/bin/env bash
# Synthetic smoke test: no provider URL, no credentials.
set -euo pipefail
TMP="${TMPDIR:-/tmp}/ape-cmaf-smoke"
rm -rf "$TMP"; mkdir -p "$TMP/in" "$TMP/out"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i testsrc2=size=1280x720:rate=30 \
  -f lavfi -i sine=frequency=1000:sample_rate=48000 \
  -t 6 -c:v libx264 -preset ultrafast -g 60 -c:a aac -b:a 128k \
  -f hls -hls_time 2 -hls_list_size 0 \
  -hls_segment_filename "$TMP/in/seg_%03d.ts" "$TMP/in/index.m3u8"

INPUT_URL="$TMP/in/index.m3u8" OUT_DIR="$TMP/out" HLS_TIME=2 HLS_LIST_SIZE=3 \
  timeout 12 bash "$(dirname "$0")/packager.sh" || true

test -s "$TMP/out/init.mp4"
test -s "$TMP/out/index.m3u8"
grep -q '#EXT-X-MAP:URI="init.mp4"' "$TMP/out/index.m3u8"
grep -q '\.m4s' "$TMP/out/index.m3u8"
echo "SMOKE_OK: real fMP4 init + m4s segments"
