#!/bin/bash
# Prueba las reglas entrada->salida: resolver, crear, editar, borrar.
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"

echo "=== 1. Entrada real 1280x720 -> que salidas ofrece ==="
curl -s --max-time 20 "$B/jit/image/rules/resolve?w=1280&h=720" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  entrada: %dx%d (%s px, aspecto %.3f)" % (d["input"]["width"], d["input"]["height"],
      format(d["input"]["pixels"],","), d["input"]["aspect"]))
print("  reglas que aplican:", d["count"])
for m in d["matches"]:
    print("   %-14s -> %4dx%-4d  (%5.2fx area)  %s" % (m["id"], m["output"]["width"],
          m["output"]["height"], m["areaRatio"], m["label"]))
'
echo
echo "=== 2. Entrada 1920x1080 ==="
curl -s --max-time 20 "$B/jit/image/rules/resolve?w=1920&h=1080" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  entrada: %dx%d -> %d salidas" % (d["input"]["width"], d["input"]["height"], d["count"]))
for m in d["matches"]:
    print("   %-16s -> %dx%d" % (m["label"], m["output"]["width"], m["output"]["height"]))
'
echo
echo "=== 3. Crear una regla nueva: 720p -> 4K en AVC ==="
curl -s --max-time 20 -X POST -H 'Content-Type: application/json' \
  -d '{"id":"r-720-4k-avc","input":"720p","outW":3840,"outH":2160,"codec":"avc1","recipe":"light","profile":"P4","label":"720p -> 4K AVC"}' \
  "$B/jit/image/rules" | python3 -m json.tool | sed 's/^/   /'
echo
echo "=== 4. Ahora 720p tiene SEIS salidas ==="
curl -s --max-time 20 "$B/jit/image/rules" | python3 -c '
import json,sys
d=json.load(sys.stdin)
rows=d["byInput"].get("720p",[])
print("  720p ->", len(rows), "salidas:")
for r in rows:
    print("     %-14s %4dx%-4d codec=%-5s" % (r["id"], r["outW"], r["outH"], r["codec"]))
'
echo
echo "=== 5. Borrar la regla ==="
curl -s --max-time 20 -X DELETE "$B/jit/image/rules/r-720-4k-avc" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  borrada:", d.get("removed",{}).get("id"), "| persisted:", d.get("persisted"))
'
curl -s --max-time 20 "$B/jit/image/rules" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  720p ->", len(d["byInput"].get("720p",[])), "salidas (vuelve a 5)")
'
echo
echo "=== 6. La lineup ya no da 502 ==="
curl -s -o /tmp/l2.m3u8 -w "  http=%{http_code} bytes=%{size_download} tiempo=%{time_total}s\n" --max-time 120 "$B/jit/image/lineup?engine=ott"
sed -n '2p' /tmp/l2.m3u8 | sed 's/^/   /'
