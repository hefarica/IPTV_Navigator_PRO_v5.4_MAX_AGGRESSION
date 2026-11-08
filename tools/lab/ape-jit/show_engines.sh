#!/bin/bash
# Muestra la cabecera de gobierno de cada motor: que perfil se elige y por que.
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"

echo "=== PERFIL AUTO POR MOTOR (cabecera de la lista) ==="
echo
for e in ott vlc kodi tivimate apk; do
  echo "  --- engine=$e ---"
  curl -s --max-time 60 "$B/jit/image/lineup?engine=$e" | sed -n '2,3p' | sed 's/^/    /'
  echo
done
