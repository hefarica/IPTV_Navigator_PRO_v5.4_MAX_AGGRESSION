#!/bin/bash
# APE PRISMA — Fire TV Toast Overlay (works on Fire TV Stick 4K / AFTKRT)
# Shows a visible on-screen notification for 5 seconds
DEVICE="${1:-10.200.0.3:5555}"
MSG="${2:-APE PRISMA ACTIVO}"

# Ensure ADB connected
adb connect "$DEVICE" >/dev/null 2>&1
sleep 0.2

# Fire TV Stick 4K (AFTKRT, SDK 30, Android 11)
# Method 1: Settings display overlay (most visible on Fire TV)
adb -s "$DEVICE" shell "am start -a android.settings.SETTINGS" >/dev/null 2>&1
sleep 0.3
adb -s "$DEVICE" shell "input keyevent KEYCODE_BACK" >/dev/null 2>&1

# Method 2: Use notification channel with vibration to force heads-up
adb -s "$DEVICE" shell "cmd notification post -S bigtext -t '$MSG' prisma_hud '$MSG'" 2>/dev/null

# Method 3: Briefly show notification panel then hide
adb -s "$DEVICE" shell "cmd statusbar expand-notifications" 2>/dev/null
sleep 3
adb -s "$DEVICE" shell "cmd statusbar collapse" 2>/dev/null

# Auto-cancel notification after 5s total
(sleep 5; adb -s "$DEVICE" shell "cmd notification cancel prisma_hud" 2>/dev/null) &

echo "FIRE_TV_TOAST_SENT: $MSG"
