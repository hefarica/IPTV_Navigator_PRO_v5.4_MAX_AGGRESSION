#!/bin/bash
# Despliegue del panel de imagen al VPS: backup, JS, div+script en el index.
set -euo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
HTML=/var/www/html
IDX=$HTML/index-v4.html
BAK=/var/backups/ape-deploy/$STAMP

echo "  stamp: $STAMP"
mkdir -p "$BAK"
cp -a "$IDX" "$BAK/index-v4.html" 2>/dev/null || true
echo "  backup: $BAK/index-v4.html"
echo

echo "=== estado ANTES ==="
echo "  index bytes : $(stat -c %s "$IDX")"
echo "  refs script : $(grep -c 'vps-image-panel' "$IDX" || true)"
echo "  div panel   : $(grep -c 'id="ape-image-panel"' "$IDX" || true)"
echo "  tabs        : $(grep -o 'id="tab-[a-z]*"' "$IDX" | sort -u | tr '\n' ' ')"
echo

# 1) el JS del panel
mkdir -p "$HTML/js/ape-v9"
if [ -f /tmp/vps-image-panel.js ]; then
  install -m 644 /tmp/vps-image-panel.js "$HTML/js/ape-v9/vps-image-panel.js"
  echo "  JS instalado: $(stat -c %s "$HTML/js/ape-v9/vps-image-panel.js") bytes"
else
  echo "  ERROR: falta /tmp/vps-image-panel.js"
  exit 1
fi

# 2) el div dentro de la pestana de telemetria, y el script
python3 - "$IDX" <<'PY'
import io, re, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8', errors='surrogateescape').read()

changed = []

# el div: dentro de #tab-telemetry, antes de su cierre
if 'id="ape-image-panel"' not in s:
    m = re.search(r'<div[^>]*id="tab-telemetry"[^>]*>', s)
    if m:
        # buscar el cierre de ese contenedor contando divs
        start = m.end()
        depth = 1
        i = start
        while i < len(s) and depth > 0:
            nxt_open = s.find('<div', i)
            nxt_close = s.find('</div>', i)
            if nxt_close == -1:
                break
            if nxt_open != -1 and nxt_open < nxt_close:
                depth += 1
                i = nxt_open + 4
            else:
                depth -= 1
                if depth == 0:
                    s = s[:nxt_close] + '\n            <div id="ape-image-panel"></div>\n        ' + s[nxt_close:]
                    changed.append('div insertado en #tab-telemetry')
                    break
                i = nxt_close + 6
    else:
        changed.append('AVISO: no encontre #tab-telemetry')
else:
    changed.append('div ya presente')

# el script: antes de </body>
if 'vps-image-panel' not in s:
    tag = '<script src="js/ape-v9/vps-image-panel.js?v=20261108-auto" defer></script>'
    if '</body>' in s:
        s = s.replace('</body>', tag + '\n</body>', 1)
    else:
        s = s + tag
    changed.append('script insertado')
else:
    changed.append('script ya presente')

io.open(p, 'w', encoding='utf-8', errors='surrogateescape', newline='').write(s)
for c in changed:
    print('  ' + c)
PY

echo
echo "=== estado DESPUES ==="
echo "  index bytes : $(stat -c %s "$IDX")"
echo "  refs script : $(grep -c 'vps-image-panel' "$IDX" || true)"
echo "  div panel   : $(grep -c 'id="ape-image-panel"' "$IDX" || true)"
echo "  tab telem   : $(grep -c 'id="tab-telemetry"' "$IDX" || true)"
echo
echo "  backup para revertir: cp -a $BAK/index-v4.html $IDX"
