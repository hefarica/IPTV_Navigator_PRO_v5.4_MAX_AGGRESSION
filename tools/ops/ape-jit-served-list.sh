#!/usr/bin/env bash
# El JIT debe reconciliar contra la lista que el wrapper SIRVE, no la mas nueva.
#
# El bug medido:
#   ape-pulse-sync descomprime APE_LISTA_*.m3u8.gz -> .m3u8 con mtime NUEVO.
#   reconcile.js ordena por mtime (`.sort((a,b) => b.m - a.m)`) y agarra la
#   descomprimida (10.573 canales) en vez de la viva (21.224).
#   El guard fail-closed aborta correctamente, pero nunca converge.
#
# La verdad de cual es la lista viva esta en cada URL de zap: `l=APE_LISTA_<id>`.
# Este parche hace que pickList lea ese id del log de pulse y lo prefiera.
set -uo pipefail

R=/opt/ape-jit/reconcile.js
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
[ -f "$R" ] || { echo "NO_ENCONTRADO: $R"; exit 1; }

echo "=== 1. Estado actual de pickList ==="
grep -n 'APE_LISTA_\|readdirSync\|sort((a' "$R" | head -n 10 | cut -c1-160

cp -a "$R" "${R}.bak_${STAMP}_served"
echo ""
echo "  backup: ${R}.bak_${STAMP}_served"

echo ""
echo "=== 2. Parche: preferir la lista servida (l=) ==="
python3 - "$R" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()

if 'listaServidaPorWrapper' in s:
    print("  ya parcheado"); sys.exit(0)

# Localiza la funcion pickList y su cuerpo
m = re.search(r'(function\s+pickList\s*\([^)]*\)\s*\{)', s)
if not m:
    print("  NO_ENCONTRADO: function pickList"); sys.exit(1)

inyeccion = """
  // [2026-11-14] La lista VIVA es la que el wrapper sirve en cada URL de zap
  // (`l=APE_LISTA_<id>`), no la de mtime mas nuevo: el sync descomprime listas
  // viejas .gz -> .m3u8 con mtime fresco y ganaban el sort por mtime.
  function listaServidaPorWrapper() {
    try {
      const log = '/var/log/nginx/playlist_access.log';
      const fd  = require('fs').openSync(log, 'r');
      const st  = require('fs').fstatSync(fd);
      const len = Math.min(st.size, 4 * 1024 * 1024);       // ultimos 4 MB
      const buf = Buffer.alloc(len);
      require('fs').readSync(fd, buf, 0, len, Math.max(0, st.size - len));
      require('fs').closeSync(fd);
      const ids = [...buf.toString('utf8').matchAll(/[?&]l=(APE_LISTA_[0-9A-Za-z_.-]+)/g)]
        .map(m => m[1]);
      return ids.length ? ids[ids.length - 1] : null;        // el mas reciente
    } catch (e) { return null; }
  }

"""

s2 = s[:m.end()] + inyeccion + s[m.end():]

# Dentro de pickList, anteponer el filtro por la lista servida
m2 = re.search(r'(function\s+pickList\s*\([^)]*\)\s*\{)', s2)
if not m2:
    print("  NO_ENCONTRADO tras inyectar"); sys.exit(1)

preferencia = """
    // Preferencia 1: exactamente la lista que el wrapper esta sirviendo.
    const servida = listaServidaPorWrapper();
    if (servida) {
      const cand = fs.readdirSync(cfg.listDir).filter(f => f === servida + '.m3u8');
      if (cand.length) {
        const p = require('path').join(cfg.listDir, cand[0]);
        const st = fs.statSync(p);
        if (st.size > 0) {
          log(`LIST ${p} ${(st.size / 1048576).toFixed(0)} MB (servida por wrapper)`);
          return p;
        }
      }
    }
"""

s3 = s2[:m2.end()] + preferencia + s2[m2.end():]
open(p, 'w', encoding='utf-8').write(s3)
print("  parcheado: pickList prefiere la lista servida")
PY

echo ""
echo "=== 3. node --check ==="
if node --check "$R" 2>&1; then echo "  sintaxis: OK"; else
  echo "  ERROR -- ROLLBACK"; cp -a "${R}.bak_${STAMP}_served" "$R"; echo "  restaurado"; exit 1; fi

echo ""
echo "=== 4. ¿Hay un id servido ahora mismo? ==="
grep -oE '[?&]l=APE_LISTA_[0-9]+' /var/log/nginx/playlist_access.log 2>/dev/null | tail -n 1 | sed 's/^/  ultimo: /'

echo ""
echo "=== 5. Ejecuto el reconcile ==="
systemctl start ape-jit-reconcile.service
sleep 8
journalctl -u ape-jit-reconcile --since '-2min' --no-pager -o cat 2>/dev/null | grep -E 'LIST|PARSE|ABORT|SKIP|PUBLISH' | tail -n 5 | cut -c1-175
echo ""
echo -n "  resultado: "; systemctl show ape-jit-reconcile.service -p Result --value
echo -n "  canales en channels.json: "; python3 -c "import json;print(len(json.load(open('/opt/ape-jit/current/channels.json'))))" 2>/dev/null || echo "?"
