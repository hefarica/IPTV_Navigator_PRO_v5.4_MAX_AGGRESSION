#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# APE UHDX — Onn 4K TV Box Resolution Lock Daemon Script
# Governs hardware-level display locking (4K @ 60Hz, HDR Policies)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

TARGET_IP="${1:-}"

if [ -z "${TARGET_IP}" ]; then
  echo "Usage: $0 <onn_4k_device_ip>"
  exit 1
fi

echo "Connecting to Onn 4K Device at ${TARGET_IP}..."
adb connect "${TARGET_IP}" || { echo "ADB Connection failed"; exit 1; }

# Lock Resolution to 2160p60hz (4K @ 60Hz)
echo "Locking display resolution to 2160p60hz..."
adb shell "settings put global display_box_resolution 2160p60hz"
adb shell "settings put global user_preferred_resolution 2160p60hz"
adb shell "wm size 3840x2160"
adb shell "wm density 480"

# Configure HDR policies
# sys.display.hdr.policy: 0 = auto, 1 = force HDR, 2 = force SDR
echo "Setting HDR display manager policy (Adaptive)..."
adb shell "setprop sys.display.hdr.policy 0"
# Prevent Android system from falling back to low-range deep color
adb shell "setprop persist.sys.display.depth 10"
adb shell "setprop persist.sys.color.space BT2020"

# Restart SurfaceFlinger to apply screen resolution changes immediately
echo "Restarting SurfaceFlinger graphics engine..."
adb shell "stop surfaceflinger"
sleep 1
adb shell "start surfaceflinger"

echo "=== Onn 4K Display Configured & Locked ==="
echo "Display size: $(adb shell wm size)"
echo "Display density: $(adb shell wm density)"
echo "HDR policy property: $(adb shell getprop sys.display.hdr.policy)"
echo "Color depth: $(adb shell getprop persist.sys.display.depth)"
echo "=========================================="
