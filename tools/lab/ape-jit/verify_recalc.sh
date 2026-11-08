#!/bin/bash
# Verifica que el recalculo devuelve optimos DISTINTOS por resolucion y fps.
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"

echo "=== PANEL DESPLEGADO ==="
curl -s --max-time 15 "$B/js/ape-v9/vps-image-panel.js" -o /tmp/k.js
echo "  bytes: $(stat -c %s /tmp/k.js)"
for f in recalcOptimos aip-b-inband aip-b-infps renderAutoRow loadProfile; do
  echo "  $f: $(grep -c "$f" /tmp/k.js)"
done
echo

echo "=== OPTIMOS POR RESOLUCION (misma entrada 720p@60) ==="
t() {
  curl -s --max-time 20 -X POST -H 'Content-Type: application/json' -d "$1" \
    "$B/jit/image/rules/auto" > /tmp/a.json
  python3 -c "
import json
d=json.load(open('/tmp/a.json'))
if not d.get('ok'):
    print('  ERROR', d.get('error')); raise SystemExit
f=d['fields']
print('  %-22s -> codec=%-5s receta=%-9s fps=%-12s dither=%s' % (
  '$2', f['codec']['value'], f['recipe']['value'],
  str(f['outFps'].get('value'))+' '+f['outFps'].get('op',''), f['dither']['value']))
"
}
t '{"inW":1280,"inH":720,"inFps":60,"outW":1920,"outH":1080,"player":"onn-4k"}' "720p@60 -> 1080p"
t '{"inW":1280,"inH":720,"inFps":60,"outW":2560,"outH":1440,"player":"onn-4k"}' "720p@60 -> 1440p"
t '{"inW":1280,"inH":720,"inFps":60,"outW":3840,"outH":2160,"player":"onn-4k"}' "720p@60 -> 4K"
t '{"inW":1280,"inH":720,"inFps":60,"outW":5760,"outH":3240,"player":"onn-4k"}' "720p@60 -> 6K"
echo
echo "=== OPTIMOS POR FPS DE ENTRADA (misma salida 1440p) ==="
t '{"inW":1280,"inH":720,"inFps":24,"outW":2560,"outH":1440,"player":"onn-4k"}' "720p@24 -> 1440p"
t '{"inW":1280,"inH":720,"inFps":30,"outW":2560,"outH":1440,"player":"onn-4k"}' "720p@30 -> 1440p"
t '{"inW":1280,"inH":720,"inFps":60,"outW":2560,"outH":1440,"player":"onn-4k"}' "720p@60 -> 1440p"
echo
echo "=== OPTIMOS POR CODEC/PREPARACION (misma res, distinta entrada) ==="
t '{"inW":1920,"inH":1080,"inFps":30,"outW":3840,"outH":2160,"player":"onn-4k"}' "1080p@30 -> 4K"
t '{"inW":3840,"inH":2160,"inFps":60,"outW":3840,"outH":2160,"player":"onn-4k"}' "4K@60 -> 4K"
t '{"inW":854,"inH":480,"inFps":30,"outW":1920,"outH":1080,"player":"onn-4k"}' "480p@30 -> 1080p"
