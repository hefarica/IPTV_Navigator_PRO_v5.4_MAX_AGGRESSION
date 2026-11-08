#!/bin/bash
# Prueba el modo REAL vs EMULADO: la resolucion se puede colocar igual.
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"

auto() {
  curl -s --max-time 25 -X POST -H 'Content-Type: application/json' -d "$1" \
    "$B/jit/image/rules/auto" > /tmp/au.json
  python3 -c '
import json,sys
d=json.load(open("/tmp/au.json"))
if not d.get("ok"): print("  ERROR:", d.get("error")); sys.exit()
print("  modo     :", d["mode"].upper(), "(excede decoder:", str(d.get("exceedsDecoder")) + ")")
print("  que es   :", d["modeMeaning"][:92])
print("  propone  : codec=%s recipe=%s fps=%s dither=%s" % (
    d["fields"]["codec"]["value"], d["fields"]["recipe"]["value"],
    d["fields"]["outFps"].get("value"), d["fields"]["dither"]["value"]))
if d.get("hostCost"):
    h=d["hostCost"]
    print("  coste    : %.2fx -> %.2fx tiempo real -> %s" % (h["relative"], h["estimatedRatio"],
          "VIABLE" if h["viable"] else "NO VIABLE"))
for w in d.get("warnings", []): print("  AVISO    :", w[:96])
for i in d.get("impossible", []): print("  IMPOSIBLE:", i[:96])
if not d.get("impossible"): print("  IMPOSIBLE: ninguno -> la regla SE PUEDE COLOCAR")
'
}

echo "=== 720p@30 -> 6K en ONN 4K, modo REAL ==="
auto '{"inW":1280,"inH":720,"inFps":30,"outW":5760,"outH":3240,"player":"onn-4k","mode":"real"}'
echo
echo "=== la MISMA regla, modo EMULADO ==="
auto '{"inW":1280,"inH":720,"inFps":30,"outW":5760,"outH":3240,"player":"onn-4k","mode":"emulado"}'
echo
echo "=== 4K@60 -> 8K en Shield, EMULADO ==="
auto '{"inW":3840,"inH":2160,"inFps":60,"outW":7680,"outH":4320,"player":"shield-tv","mode":"emulado"}'
echo
echo "=== la tabla: que reglas son REAL y cuales EMULADO ==="
curl -s --max-time 20 "$B/jit/image/rules" | python3 -c '
import json,sys
d=json.load(sys.stdin)
real=emul=0
print("  %-20s %-14s %-7s %s" % ("REGLA", "SALIDA", "MODO", "PERFIL"))
print("  " + "-"*58)
for r in d["rules"]:
    m = r.get("mode","real")
    if m=="emulado": emul+=1
    else: real+=1
    print("  %-20s %-14s %-7s %s" % (r["id"], "%dx%d" % (r["outW"],r["outH"]), m, r.get("profile","-")))
print()
print("  REAL: %d   EMULADO: %d   total: %d" % (real, emul, d["count"]))
'
