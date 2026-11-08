#!/bin/bash
# Verificacion del modulo de imagen del JIT APE.
# Uso: bash verify_image_module.sh
B=https://iptv-ape.duckdns.org

echo "=== 1 · aplicar FHD_1080 + light + fps 25 ==="
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"target":"FHD_1080","recipe":"light","fps":"25","preset":"ultrafast","crf":20}' \
  "$B/jit/image/config" | head -c 160
echo ""

echo ""
echo "=== 2 · pedir canal 3 y consultar estado EN CALIENTE ==="
curl -s -o /dev/null --max-time 70 "$B/jit/live/3/master.m3u8"
sleep 4
curl -s "$B/jit/image/state" | python3 -c '
import json,sys
d=json.load(sys.stdin)
j=d.get("job") or {}
print("  job      : canal=%s variante=%s pid=%s edad=%ss" % (j.get("channel"),j.get("variant"),j.get("pid"),j.get("age_s")))
print("  modo     : %s   copy=%s" % (j.get("mode"), j.get("copy")))
print("  salida   : %sx%s   fuente: %sx%s" % (j.get("output_width"),j.get("output_height"),j.get("source_width"),j.get("source_height")))
o=d.get("output_observed") or {}
print("  observado: %s" % (json.dumps(o) if o else "(sin probe aun)"))
f=d.get("files") or {}
print("  ficheros : segmentos=%s playlists=%s" % (f.get("segments"), f.get("playlists")))
c=d.get("config") or {}
print("  config   : target=%s recipe=%s fps=%s codec=%s preset=%s crf=%s audio=%s" % (
  c.get("target"),c.get("recipe"),c.get("fps"),c.get("codec"),c.get("preset"),c.get("crf"),c.get("audio")))
print("  filtro   : %s" % d.get("effective_filter"))
e=d.get("engine") or {}
print("  motor    : domain=%s rea_executed=%s slot=%s source=%s" % (
  e.get("processing_domain"),e.get("rea_executed"),e.get("slot"),e.get("source")))
'

echo ""
echo "=== 3 · comando ffmpeg REAL (fps, encoder, filtros) ==="
P=$(ps -eo args 2>/dev/null | grep ffmpeg | grep -v grep | head -1)
if [ -z "$P" ]; then
  echo "  sin ffmpeg vivo; reintentando pedir"
  curl -s -o /dev/null --max-time 60 "$B/jit/live/3/master.m3u8"
  sleep 4
  P=$(ps -eo args 2>/dev/null | grep ffmpeg | grep -v grep | head -1)
fi
if [ -n "$P" ]; then
  echo "  encoder  : $(echo "$P" | grep -oE '\-c:v [a-z0-9]+' | head -1)"
  echo "  preset   : $(echo "$P" | grep -oE '\-preset [a-z]+' | head -1)"
  echo "  crf      : $(echo "$P" | grep -oE '\-crf [0-9]+' | head -1)"
  echo "  fps      : $(echo "$P" | grep -oE '\-r [0-9]+' | head -1)"
  echo "  fps_mode : $(echo "$P" | grep -oE '\-fps_mode [a-z]+' | head -1)"
  echo "  pix_fmt  : $(echo "$P" | grep -oE '\-pix_fmt [a-z0-9]+' | head -1)"
  echo "  audio    : $(echo "$P" | grep -oE '\-c:a [a-z]+' | head -1)"
  echo "  x265     : $(echo "$P" | grep -oE '\-x265-params [^ ]+' | head -1 | cut -c1-95)"
  echo "  filtros  :"
  echo "$P" | sed -E 's/.*-vf ([^ ]+).*/\1/' | tr ',' '\n' | head -8 | sed 's/^/    /'
else
  echo "  (no se pudo capturar el proceso)"
fi

echo ""
echo "=== 4 · manifiesto ==="
curl -s "$B/jit/live/3/master.m3u8" | grep -E "STREAM-INF|CRYSTAL-MODE|CRYSTAL-TARGET|CRYSTAL-UPSCALE" | sed 's/^/  /'

echo ""
echo "=== 5 · salida real por ffprobe ==="
IN=$(curl -s "$B/jit/live/3/media_0.m3u8" | grep -oE 'init-[^"]+\.m4s' | head -1)
CH=$(curl -s "$B/jit/live/3/media_0.m3u8" | grep -oE 'chunk-[^ ]+\.m4s' | tail -1)
if [ -n "$IN" ] && [ -n "$CH" ]; then
  curl -s -o /tmp/i.m4s "$B/jit/live/3/$IN"
  curl -s -o /tmp/c.m4s "$B/jit/live/3/$CH"
  cat /tmp/i.m4s /tmp/c.m4s > /tmp/f.mp4
  timeout 30 ffprobe -v error -show_entries stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,color_transfer -of compact /tmp/f.mp4 2>&1 | head -3 | sed 's/^/  /'
  rm -f /tmp/i.m4s /tmp/c.m4s /tmp/f.mp4
else
  echo "  (sin segmentos)"
fi
