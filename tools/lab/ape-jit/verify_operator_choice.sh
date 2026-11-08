#!/bin/bash
# Prueba que el PERFIL DEL OPERADOR manda y el decoder solo avisa.
set -u
B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"

echo "=== 1. El operador elige P4.5 (6K) y SE RESPETA ==="
curl -s --max-time 20 -X POST -H 'Content-Type: application/json' \
  -d '{"defaultProfile":"P4.5"}' "$B/jit/image/governance" >/dev/null
curl -s --max-time 20 "$B/jit/image/governance?engine=ott" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  perfil por defecto :", d["defaultProfile"])
print("  decoder del motor  :", d["decoderMax"], "(" + d["decoderPlayer"] + ")")
print("  mejor p/ decoder   :", d["bestForDecoder"], "(solo informativo)")
print("  canales que exceden:", d["exceedsDecoder"], "de", d["count"])
print("  REGLA              :", d["rule"])
print()
for r in d["channels"][:4]:
    print("   canal %-4s -> %-6s %-10s %s" % (r["channel"], r["profile"], r["target"],
          "DECODIFICABLE" if r["decodable"] else "EXCEDE DECODER (aviso)"))
'
echo
echo "=== 2. La lista entrega el perfil pedido Y declara el aviso ==="
curl -s --max-time 60 "$B/jit/image/lineup?engine=ott" | sed -n '2,10p' | sed 's/^/   /'
echo
echo "=== 3. El operador baja a P1 (4K) y el aviso desaparece ==="
curl -s --max-time 20 -X POST -H 'Content-Type: application/json' \
  -d '{"defaultProfile":"P1"}' "$B/jit/image/governance" >/dev/null
curl -s --max-time 20 "$B/jit/image/governance?engine=ott" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  perfil por defecto :", d["defaultProfile"])
print("  canales que exceden:", d["exceedsDecoder"], "de", d["count"])
'
echo
echo "=== 4. Y vuelve a P4.5: es SU eleccion, el motor la respeta ==="
curl -s --max-time 20 -X POST -H 'Content-Type: application/json' \
  -d '{"defaultProfile":"P4.5"}' "$B/jit/image/governance" >/dev/null
curl -s --max-time 20 "$B/jit/image/governance?engine=ott" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  perfil restaurado  :", d["defaultProfile"], "| canales:", format(d["count"],","))
'
