#!/usr/bin/env bash
# APE authorized-origin CMAF packager.
# Input must be an AUTHORIZED HLS source owned/operated by the user.
# This script does not transcode: it repackages TS -> fMP4/CMAF with -c copy.
set -euo pipefail

: "${INPUT_URL:?INPUT_URL is required (authorized HLS URL)}"
OUT_DIR="${OUT_DIR:-/srv/ape-cmaf}"
HLS_TIME="${HLS_TIME:-2}"
HLS_LIST_SIZE="${HLS_LIST_SIZE:-6}"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/index.m3u8 "$OUT_DIR"/init.mp4 "$OUT_DIR"/seg_*.m4s

# ffmpeg writes the fMP4 init with a relative URI only when CWD == OUT_DIR.
cd "$OUT_DIR"

# fMP4 audio support:
#   AAC  -> copy + ADTS->ASC
#   AC3/EAC3 -> copy
#   MP2/MP3/other -> transcode AUDIO ONLY to AAC (video stays copy)
AUDIO_CODEC="$("${FFPROBE:-ffprobe}" -v error -select_streams a:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "$INPUT_URL" 2>/dev/null | head -1 || true)"
AUDIO_ARGS=()
case "$AUDIO_CODEC" in
  aac)         AUDIO_ARGS=(-c:a copy -bsf:a aac_adtstoasc) ;;
  ac3|eac3)    AUDIO_ARGS=(-c:a copy) ;;
  mp2|mp3|"")  AUDIO_ARGS=(-c:a aac -b:a 128k -ac 2) ;;
  *)           AUDIO_ARGS=(-c:a aac -b:a 128k -ac 2) ;;
esac

exec "${FFMPEG:-ffmpeg}" -hide_banner -nostdin -loglevel warning \
  -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 \
  -i "$INPUT_URL" \
  -map 0:v:0 -map 0:a? \
  -c:v copy "${AUDIO_ARGS[@]}" \
  -f hls \
  -hls_time "$HLS_TIME" \
  -hls_list_size "$HLS_LIST_SIZE" \
  -hls_flags delete_segments+independent_segments \
  -hls_segment_type fmp4 \
  -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename "$OUT_DIR/seg_%06d.m4s" \
  index.m3u8
