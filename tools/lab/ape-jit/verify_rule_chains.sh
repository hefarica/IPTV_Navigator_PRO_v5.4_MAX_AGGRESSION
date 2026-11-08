#!/bin/bash
# Valida contra ffmpeg REAL las cadenas de cada regla, en la entrada que le toca.
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"
OK=0
BAD=0

check() {
  local id="$1" w="$2" h="$3" fps="$4"
  local vf
  vf=$(curl -s --max-time 20 "$B/jit/image/rules/resolve?w=$w&h=$h&fps=$fps" \
       | python3 -c "import json,sys;d=json.load(sys.stdin);print([m['filter'] for m in d['matches'] if m['id']=='$id'][0])" 2>/dev/null)
  if [ -z "$vf" ]; then
    echo "  SKIP  $id (no aplica a esa entrada)"
    return
  fi
  if ffmpeg -hide_banner -nostdin -loglevel error -f lavfi -i "testsrc2=s=${w}x${h}:d=0.2" \
       -vf "$vf" -frames:v 3 -f null - 2>/tmp/fe.txt; then
    echo "  OK    $id  (${w}x${h}@${fps})"
    OK=$((OK+1))
  else
    echo "  FALLA $id -> $(tr -d '\n' < /tmp/fe.txt | cut -c1-120)"
    BAD=$((BAD+1))
  fi
}

echo "=== VALIDACION ffmpeg de las reglas con cambio de cadencia ==="
check "r-720-60-4k-30"    1280 720 60
check "r-720-60-4k-60"    1280 720 60
check "r-720-60-1080-30"  1280 720 60
check "r-720-60-6k-30"    1280 720 60
check "r-720-30-1440-60"  1280 720 30
check "r-720-30-4k-30"    1280 720 30
check "r-1080-30-4k-60"   1920 1080 30
check "r-1080-60-4k-30"   1920 1080 60
check "r-4k-60-6k-30"     3840 2160 60
check "r-480-30-1080-30"  854 480 30
echo
echo "  aceptadas: $OK   rechazadas: $BAD"
