#!/bin/bash
# Matriz de fallback: cada player contra cada target. Muestra el tier elegido y
# cuantos se saltaron, con el motivo del primero saltado.
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"

one() {
  curl -s --max-time 25 -X POST -H 'Content-Type: application/json' \
    -d "{\"player\":\"$1\",\"target\":\"$2\",\"fps\":${3:-25}}" "$B/jit/image/fallback" > /tmp/fb.json
  python3 -c '
import json,sys
try:
    d=json.load(open("/tmp/fb.json"))
except Exception as e:
    print("  ERROR json:", e); sys.exit()
if not d.get("ok"):
    print("  ERROR:", d.get("error")); sys.exit()
c=d.get("chosen")
ch = ("tier %d %s" % (c["tier"], c["serial"])) if c else ("NINGUNO->" + d["fallbackToAvc"]["serial"])
first = ""
for t in d["trace"]:
    if t["verdict"] != "USADO":
        first = " | 1er salto: " + (t["reason"] or "")[:58]
        break
print("  %-24s %-14s %2dfps -> %-28s [%d/%d]%s" % (
  d["player"]["label"][:24], d["target"]["label"][:14], d["fps"], ch,
  d.get("skipped",0), len(d["trace"]), first))
'
}

echo "=== FALLBACK: 5 players x 3 targets @ 25fps ==="
for p in onn-4k firestick-4k-max firestick-lite shield-tv generic; do
  for t in FHD_1080 UHD_4K K6_3240; do
    one "$p" "$t" 25
  done
  echo
done

echo "=== y el mismo target 4K a distintas cadencias (el fps manda) ==="
for f in 25 30 60 120; do
  one "onn-4k" "UHD_4K" "$f"
done
echo
for f in 25 60; do
  one "shield-tv" "UHD_4K" "$f"
done
