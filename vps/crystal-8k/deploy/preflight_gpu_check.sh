#!/usr/bin/env bash
# preflight_gpu_check.sh — run ON THE VPS before enabling any transcode channel.
# Reports GPU/encoder availability and the SAFE concurrency caps. Read-only, no changes.
set -euo pipefail

echo "=== APE Crystal — transcode preflight (read-only) ==="

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg: MISSING -> transcode unavailable. Install ffmpeg (with libx265) first."
  exit 1
fi
echo "ffmpeg: $(ffmpeg -hide_banner -version | head -1)"

HW="cpu"
ENC="$(ffmpeg -hide_banner -encoders 2>/dev/null || true)"
ACC="$(ffmpeg -hide_banner -hwaccels 2>/dev/null || true)"

if echo "$ENC" | grep -q hevc_nvenc && command -v nvidia-smi >/dev/null 2>&1; then
  HW="nvenc"; echo "GPU: NVIDIA NVENC present"; nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || true
elif echo "$ENC" | grep -q hevc_vaapi && echo "$ACC" | grep -q vaapi; then
  HW="vaapi"; echo "GPU: VAAPI present (Intel/AMD)"
elif echo "$ACC" | grep -q vulkan; then
  HW="vulkan"; echo "GPU: Vulkan present"
else
  echo "GPU: NONE detected -> CPU x265 only"
fi

echo
case "$HW" in
  nvenc) echo "RECOMMENDATION: max_concurrent_gpu up to 4x 4K. 8K real-time: 1x with a strong GPU." ;;
  vaapi|vulkan) echo "RECOMMENDATION: 2-3x 4K. 8K real-time: unlikely." ;;
  cpu) echo "RECOMMENDATION: max_concurrent_cpu=1 (maybe 2). DO NOT enable 8K (sub-real-time -> permanent passthrough fallback)." ;;
esac
echo "Detected backend: $HW"
echo "=== preflight OK ==="
