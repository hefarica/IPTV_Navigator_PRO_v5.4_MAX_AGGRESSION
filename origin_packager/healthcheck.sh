#!/usr/bin/env bash
# Exit 0 only when the packager is producing real fMP4/CMAF.
set -euo pipefail
OUT_DIR="${OUT_DIR:-/srv/ape-cmaf}"
test -s "$OUT_DIR/index.m3u8"
test -s "$OUT_DIR/init.mp4"
grep -q '#EXT-X-MAP:URI="init.mp4"' "$OUT_DIR/index.m3u8"
grep -q '\.m4s' "$OUT_DIR/index.m3u8"
test "$(find "$OUT_DIR" -maxdepth 1 -name 'seg_*.m4s' | wc -l)" -gt 0
echo "OK: init.mp4 + m4s + EXT-X-MAP"
