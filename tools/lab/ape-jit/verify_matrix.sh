#!/bin/bash
# Verifica el motor de calculo de la matriz: entrada -> salida, bandas y cadena.
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"

plan() {
  curl -s --max-time 20 -X POST -H 'Content-Type: application/json' \
    -d "{\"profile\":\"$1\",\"input\":$2}" "$B/jit/image/plan"
}

show() {
  python3 -c '
import json,sys
p=json.load(open("/tmp/pp.json"))
if not p.get("ok"):
    print("  ERROR:", p.get("error")); sys.exit(1)
i=p["input"]; o=p["output"]; s=p["scaled"]; pd=p["pad"]; m=p["metrics"]
print("  %-6s %4dx%-4d -> %4dx%-4d | escalado %4dx%-4d | bandas L=%-4d R=%-4d T=%-4d B=%-4d | %6.2fx area" % (
  p["profile"], i["width"], i["height"], o["width"], o["height"],
  s["width"], s["height"], pd["left"], pd["right"], pd["top"], pd["bottom"], m["areaRatio"]))
'
}

echo "=== CASOS DE CALCULO ==="
plan "P3"   '{"width":720,"height":576,"dar":1.25}'   > /tmp/pp.json; show
plan "P4.5" '{"width":1280,"height":720}'             > /tmp/pp.json; show
plan "P0"   '{"width":854,"height":480,"dar":1.7778}' > /tmp/pp.json; show
plan "P1"   '{"width":1920,"height":1080}'            > /tmp/pp.json; show
plan "P2.5" '{"width":1920,"height":804,"dar":2.388}' > /tmp/pp.json; show
plan "P5"   '{"width":7680,"height":4320}'            > /tmp/pp.json; show

echo
echo "=== CADENAS y su validacion contra ffmpeg REAL ==="
for spec in "P3|720|576|1.25" "P4.5|1280|720|1.7778" "P1|1920|804|2.388" "P5|7680|4320|1.7778"; do
  P=$(echo "$spec" | cut -d'|' -f1)
  W=$(echo "$spec" | cut -d'|' -f2)
  H=$(echo "$spec" | cut -d'|' -f3)
  D=$(echo "$spec" | cut -d'|' -f4)
  plan "$P" "{\"width\":$W,\"height\":$H,\"dar\":$D}" > /tmp/pp.json
  VF=$(python3 -c 'import json;print(json.load(open("/tmp/pp.json"))["filter"])')
  # la entrada de prueba usa las mismas dimensiones que el plan declara
  if ffmpeg -hide_banner -nostdin -loglevel error -f lavfi \
       -i "testsrc2=s=${W}x${H}:d=0.1" -vf "$VF" -frames:v 1 -f null - 2>/tmp/fe.txt; then
    echo "  OK    $P  ${W}x${H} -> $(python3 -c 'import json;d=json.load(open("/tmp/pp.json"));print("%dx%d"%(d["output"]["width"],d["output"]["height"]))')"
  else
    echo "  FALLA $P  -> $(tr -d '\n' < /tmp/fe.txt | cut -c1-140)"
  fi
done
