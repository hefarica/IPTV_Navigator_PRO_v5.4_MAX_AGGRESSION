#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# APE UHDX — Client-Side Shaders & Profiles Installer/Generator
# Version: 1.0.0
# Target environments: mpv, OTT Navigator config structures, and Custom TV players.
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SHADERS_DIR="${HOME}/.config/mpv/shaders"
MPV_CONF="${HOME}/.config/mpv/mpv.conf"

echo "=== APE UHDX Shader Installer ==="

# 1. Ensure directories exist
mkdir -p "${SHADERS_DIR}"

# 2. Define shader URLs (Anime4K, FSRCNNX, AdaptiveSharpen)
ANIME4K_VERSION="v4.0.1"
FSRCNNX_URL="https://raw.githubusercontent.com/igv/FSRCNN-TensorFlow/master/FSRCNNX_x2_8-0-4-1.glsl"
ADAPTIVESHARPEN_URL="https://raw.githubusercontent.com/brenton-cozby/Adaptive-Sharpen/master/Adaptive-Sharpen.glsl"

echo "Fetching FSRCNNX shader..."
curl -sSLo "${SHADERS_DIR}/FSRCNNX_x2_8-0-4-1.glsl" "${FSRCNNX_URL}"

echo "Fetching AdaptiveSharpen shader..."
curl -sSLo "${SHADERS_DIR}/AdaptiveSharpen.glsl" "${ADAPTIVESHARPEN_URL}"

echo "Fetching Anime4K shaders (${ANIME4K_VERSION})..."
# Fetching select Anime4K shaders
curl -sSLo "${SHADERS_DIR}/Anime4K_Upscale_CNN_x2_M.glsl" \
  "https://raw.githubusercontent.com/bloc97/Anime4K/master/glsl/Upscale/Anime4K_Upscale_CNN_x2_M.glsl"
curl -sSLo "${SHADERS_DIR}/Anime4K_Restore_CNN_M.glsl" \
  "https://raw.githubusercontent.com/bloc97/Anime4K/master/glsl/Restore/Anime4K_Restore_CNN_M.glsl"

echo "Shaders successfully downloaded to ${SHADERS_DIR}"

# 3. Create/Append mpv config profiles mapped to APE headers
echo "Writing/Updating ${MPV_CONF} with APE UHDX conditional profiles..."

cat << 'EOF' >> "${MPV_CONF}"

# ═══════════════════════════════════════════════════════════════════════════════
# APE UHDX Dynamic Scaler Profiles
# ═══════════════════════════════════════════════════════════════════════════════

[profile-P0_SHOWROOM_FLASH_4K]
profile-desc="Maximum aggression upscaling and sharpness (Showroom mode)"
glsl-shaders-append="~~/shaders/Anime4K_Upscale_CNN_x2_M.glsl;~~/shaders/Anime4K_Restore_CNN_M.glsl"
video-aspect-override=16:9
vo=gpu-next
gpu-api=vulkan
dither-depth=auto

[profile-P1_DAILY_EXTREME_4K]
profile-desc="High fidelity daily scaling (Hardware protection mode)"
glsl-shaders-append="~~/shaders/FSRCNNX_x2_8-0-4-1.glsl;~~/shaders/AdaptiveSharpen.glsl"
vo=gpu
gpu-api=opengl
dither-depth=auto

[profile-P2_SAFE_COMPAT]
profile-desc="Standard bilateral scaling fallback"
glsl-shaders-clr
scale=bilinear
cscale=bilinear
vo=gpu

EOF

echo "mpv configuration updated."
echo "=========================================="
echo "Deployment complete! Shaders ready."
echo "=========================================="
