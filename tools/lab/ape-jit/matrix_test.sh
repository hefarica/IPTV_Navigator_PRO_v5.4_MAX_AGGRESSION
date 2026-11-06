#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# matrix_test.sh — matriz de decision fuente->output del JIT CMAF, medida
# ═══════════════════════════════════════════════════════════════════════════════
# Aisla en :3098 con ffprobe falso que lee /tmp/matrix/profile.json. NO toca prod.
# Para cada combinacion (resolucion, transfer, codec, flags) captura la linea
# START que emite el server, que es la decision REAL: copy4k, crystalMode y el
# tamano de salida. Asi la tabla sale del binario, no de leer el codigo a ojo.
set -u
ROOT=/tmp/matrix
PORT=3097
rm -rf "$ROOT"; mkdir -p "$ROOT/bin" "$ROOT/out"

cp /tmp/ape-jit-candidate.js "$ROOT/server.js" 2>/dev/null || cp /tmp/ape-jit-candidate.js "$ROOT/server.js"
echo '{"1":{"url":"http://fake/1.m3u8","ua":"VLC/3.0.19"}}' > "$ROOT/channels.json"

cat > "$ROOT/bin/ffprobe" <<'FP'
#!/bin/bash
P=/tmp/matrix/profile.json
W=$(node -e "try{console.log(require('$P').w)}catch(e){console.log(1920)}" 2>/dev/null)
H=$(node -e "try{console.log(require('$P').h)}catch(e){console.log(1080)}" 2>/dev/null)
T=$(node -e "try{console.log(require('$P').t)}catch(e){console.log('bt709')}" 2>/dev/null)
C=$(node -e "try{console.log(require('$P').c)}catch(e){console.log('hevc')}" 2>/dev/null)
case "$*" in
  *"a:0"*) echo '{"streams":[{"codec_name":"aac","channels":2,"sample_rate":48000}]}' ;;
  *) echo "{\"streams\":[{\"width\":$W,\"height\":$H,\"codec_name\":\"$C\",\"color_transfer\":\"$T\",\"color_primaries\":\"bt2020\"}]}" ;;
esac
FP
chmod +x "$ROOT/bin/ffprobe"

cat > "$ROOT/bin/ffmpeg" <<'FF'
#!/bin/bash
DIR="$PWD"
printf '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-MAP:URI="init-0.m4s"\n#EXTINF:5,\nchunk-0-1.m4s\n' > "$DIR/master.m3u8"
printf 'ftyp' > "$DIR/init-0.m4s"
printf 'stypmoofmdat' > "$DIR/chunk-0-1.m4s"
trap 'exit 0' TERM
while true; do sleep 1; done
FF
chmod +x "$ROOT/bin/ffmpeg"

PATH="$ROOT/bin:$PATH" PORT=$PORT BIND=127.0.0.1 MAP_FILE="$ROOT/channels.json" \
OUT_ROOT="$ROOT/out" IDLE_MS=20000 BOOT_GRACE_MS=45000 WAIT_MS=30000 \
node "$ROOT/server.js" > "$ROOT/server.log" 2>&1 &
SRV=$!
sleep 1.2

run_case() {
  local label="$1" w="$2" h="$3" t="$4" c="$5"; shift 5
  printf '{"w":%s,"h":%s,"t":"%s","c":"%s"}' "$w" "$h" "$t" "$c" > /tmp/matrix/profile.json
  # reiniciar para limpiar current (el server cachea current entre requests)
  kill -TERM $SRV 2>/dev/null; wait $SRV 2>/dev/null
  PATH="$ROOT/bin:$PATH" PORT=$PORT BIND=127.0.0.1 MAP_FILE="$ROOT/channels.json" \
  OUT_ROOT="$ROOT/out" IDLE_MS=20000 BOOT_GRACE_MS=45000 WAIT_MS=30000 "$@" \
  node "$ROOT/server.js" >> "$ROOT/server.log" 2>&1 &
  SRV=$!
  sleep 1.1
  curl -s -o /tmp/matrix/m.m3u8 -m 25 "http://127.0.0.1:$PORT/live/1/master.m3u8" >/dev/null 2>&1
  sleep 1.2
  local line
  line=$(grep "START 1 " "$ROOT/server.log" | tail -1 | sed 's/.*START 1 //')
  local enh ups
  enh=$(grep -oE "APE-CRYSTAL-ENHANCE:[A-Z0-9_]+" /tmp/matrix/m.m3u8 2>/dev/null | head -1 | cut -d: -f2)
  ups=$(grep -oE "APE-CRYSTAL-UPSCALE:[^ ]*" /tmp/matrix/m.m3u8 2>/dev/null | head -1 | cut -d: -f2)
  local res
  res=$(grep -oE "RESOLUTION=[0-9x]+" /tmp/matrix/m.m3u8 2>/dev/null | head -1 | cut -d= -f2)
  printf "  %-26s %s\n" "$label" "${line:-<sin START>}"
  printf "  %-26s ENHANCE=%-14s RESOLUTION=%-10s UPSCALE=%s\n" "" "${enh:-?}" "${res:-?}" "${ups:-?}"
}

echo "═══════════════════════════════════════════════════════════════════════"
echo "  MATRIZ FUENTE -> OUTPUT (medida en el binario, aislada en :$PORT)"
echo "═══════════════════════════════════════════════════════════════════════"
run_case "4K HDR (PQ) hevc"      3840 2160 smpte2084 hevc
run_case "4K HDR (HLG) hevc"     3840 2160 arib-std-b67 hevc
run_case "4K SDR (bt709) hevc"   3840 2160 bt709 hevc
run_case "4K SDR h264"           3840 2160 bt709 h264
run_case "4K HDR av1 (proveedor)" 3840 2160 smpte2084 av1
run_case "1080p HDR (PQ)"        1920 1080 smpte2084 hevc
run_case "1080p SDR"             1920 1080 bt709 hevc
run_case "720p SDR"              1280 720  bt709 hevc
run_case "480p SDR"               854 480  bt709 h264
run_case "360p SDR"               640 360  bt709 h264
run_case "1080p SDR + APE_2K"    1920 1080 bt709 hevc APE_2K=1
run_case "720p SDR + APE_2K"     1280 720  bt709 hevc APE_2K=1

kill -TERM $SRV 2>/dev/null; sleep 0.5; kill -9 $SRV 2>/dev/null
pkill -f "$ROOT/bin/ffmpeg" 2>/dev/null
echo "═══════════════════════════════════════════════════════════════════════"
