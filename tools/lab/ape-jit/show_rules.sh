#!/bin/bash
# Tabla de reglas entrada+resolucion+fps -> salida+resolucion+fps.
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"

echo "=== REGLAS: entrada (res + fps) -> salida (res + fps) ==="
curl -s --max-time 20 "$B/jit/image/rules" > /tmp/r.json
python3 -c '
import json
d=json.load(open("/tmp/r.json"))
print("  %-18s %-13s %-13s %-7s %-10s" % ("REGLA", "ENTRADA", "SALIDA", "FPS", "CODEC"))
print("  " + "-" * 68)
cur=None
for r in d["rules"]:
    key=r["input"]
    inp = "%s@%s" % (r["input"], r["inFps"] or "any")
    out = "%dx%d" % (r["outW"], r["outH"])
    fps = "%s -> %s" % (r["inFps"] or "any", r["outFps"] or "same")
    mark = " *" if r.get("outFps") and r.get("inFps") and r["outFps"] != r["inFps"] else ""
    print("  %-18s %-13s %-13s %-7s %-10s%s" % (r["id"], inp, out, fps, r["codec"], mark))
print()
print("  reglas totales:", d["count"])
print("  * = cambia la cadencia (interpola o decima)")
'
echo
echo "=== RESOLVER: una fuente 1280x720 @60fps ==="
curl -s --max-time 20 "$B/jit/image/rules/resolve?w=1280&h=720&fps=60" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  entrada %dx%d @60fps -> %d reglas" % (d["input"]["width"], d["input"]["height"], d["count"]))
for m in d["matches"]:
    print("   %-20s -> %4dx%-4d @%-4s  %-24s %5.2fx area" % (m["id"], m["output"]["width"],
          m["output"]["height"], m["outFps"] or "same", m["fpsOp"], m["areaRatio"]))
'
echo
echo "=== RESOLVER: la MISMA fuente 1280x720 @30fps -> otras reglas ==="
curl -s --max-time 20 "$B/jit/image/rules/resolve?w=1280&h=720&fps=30" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  entrada %dx%d @30fps -> %d reglas" % (d["input"]["width"], d["input"]["height"], d["count"]))
for m in d["matches"]:
    print("   %-20s -> %4dx%-4d @%-4s  %-24s" % (m["id"], m["output"]["width"],
          m["output"]["height"], m["outFps"] or "same", m["fpsOp"]))
'
