#!/bin/bash
# FASE 0 — preflight bloqueante (ONN/VPS reality check)
f=0
chk(){ if eval "$2"; then echo "OK   $1"; else echo "FALLA $1"; f=1; fi; }
chk "ffmpeg" "command -v ffmpeg"
chk "ffprobe" "command -v ffprobe"
chk "x265 10-bit" "ffmpeg -h encoder=libx265 2>/dev/null | grep -q 10le"
for x in deblock dering hqdn3d deband unsharp eq noise scale; do
  chk "filtro $x" "ffmpeg -hide_banner -filters 2>/dev/null | grep -qw $x"
done
chk "libx265" "ffmpeg -hide_banner -encoders 2>/dev/null | grep -qw libx265"
chk "disco 5G" "[ \$(df -Pk /var/www | awk 'NR==2{print \$4}') -gt 5000000 ]"
chk "nginx lua" "nginx -V 2>&1 | grep -q lua"
chk "auth_sync.php" "[ -f /var/www/ara/auth_sync.php ]"
[ $f -eq 0 ] && echo "PREFLIGHT OK" || { echo "PREFLIGHT FALLA"; exit 1; }
