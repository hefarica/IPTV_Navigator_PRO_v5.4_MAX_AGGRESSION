#!/usr/bin/env python3
"""
patch_lab_json.py — Parchea el LAB CALIBRATED JSON corrigiendo los 3 bugs detectados:
  1. {config.user_agent} = "Mozilla/5.0 (Web0S...) Chrome/91"  -> Chrome/119 WebAppManager
  2. adaptive-maxwidth/maxheight = "60000"  -> 7680/4320 (caps a 8K real)
  3. (opcional) {config.referer} = "netflix.com" se mantiene si el provider lo requiere

Esto es un PARCHE TEMPORAL — la solución correcta es Stage 2 (arreglar el LAB Excel).

Uso:
    python patch_lab_json.py <input.json> [<output.json>]

Si no se da output, escribe a `<input>_PATCHED.json`.
"""
import re
import sys
from pathlib import Path


# UA fresh 2026 — Web0S Chrome 119 WebAppManager (LG TV reciente)
UA_FRESH_WEBOS = (
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager'
)

# UA pre-fix exacto que está en el LAB JSON (regex para reemplazo seguro)
UA_OLD_PATTERN = re.compile(
    r'Mozilla/5\.0 \(Web0S; Linux/SmartTV\) AppleWebKit/537\.36 Chrome/91 Safari/537\.36'
)


def patch_lab_json(input_path: Path, output_path: Path) -> dict:
    """Lee el LAB JSON, aplica patches, escribe a output_path. Devuelve stats."""
    text = input_path.read_text(encoding='utf-8-sig')  # utf-8-sig elimina el BOM
    stats = {
        'ua_chrome91_replaced': 0,
        'adaptive_maxwidth_60000_replaced': 0,
        'adaptive_maxheight_60000_replaced': 0,
        'input_size': len(text),
    }

    # Fix 1: reemplazar UA Chrome/91 -> Chrome/119 WebAppManager
    new_text, n = UA_OLD_PATTERN.subn(UA_FRESH_WEBOS, text)
    stats['ua_chrome91_replaced'] = n
    text = new_text

    # Fix 2: adaptive-maxwidth: "60000" -> "7680" (cap 8K real)
    pattern_maxwidth = re.compile(
        r'("key"\s*:\s*"adaptive-maxwidth"\s*,\s*"value"\s*:\s*)"60000"'
    )
    new_text, n = pattern_maxwidth.subn(r'\1"7680"', text)
    stats['adaptive_maxwidth_60000_replaced'] = n
    text = new_text

    # Fix 3: adaptive-maxheight: "60000" -> "4320" (cap 8K real)
    pattern_maxheight = re.compile(
        r'("key"\s*:\s*"adaptive-maxheight"\s*,\s*"value"\s*:\s*)"60000"'
    )
    new_text, n = pattern_maxheight.subn(r'\1"4320"', text)
    stats['adaptive_maxheight_60000_replaced'] = n
    text = new_text

    # Fix 4: remove Connection + Keep-Alive entries (hop-by-hop, RFC 7230)
    # Match the entire object {"key": "Connection", "value": "..."},  WITH optional trailing comma+whitespace
    pattern_connection = re.compile(
        r',?\s*\{\s*"key"\s*:\s*"Connection"\s*,\s*"value"\s*:\s*"[^"]*"\s*\}',
        re.MULTILINE
    )
    new_text, n = pattern_connection.subn('', text)
    stats['connection_removed'] = n
    text = new_text

    pattern_keepalive = re.compile(
        r',?\s*\{\s*"key"\s*:\s*"Keep-Alive"\s*,\s*"value"\s*:\s*"[^"]*"\s*\}',
        re.MULTILINE
    )
    new_text, n = pattern_keepalive.subn('', text)
    stats['keepalive_removed'] = n
    text = new_text

    stats['output_size'] = len(text)
    output_path.write_text(text, encoding='utf-8')
    return stats


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        sys.exit(1)
    inp = Path(argv[1])
    if not inp.exists():
        print(f'ERROR: input no existe: {inp}')
        sys.exit(1)
    out = Path(argv[2]) if len(argv) >= 3 else inp.with_name(inp.stem + '_PATCHED.json')
    stats = patch_lab_json(inp, out)
    print(f'OK Parcheado: {inp.name} -> {out.name}')
    print(f'   Reemplazos:')
    print(f'     UA Chrome/91 -> Chrome/119: {stats["ua_chrome91_replaced"]}')
    print(f'     adaptive-maxwidth=60000 -> 7680: {stats["adaptive_maxwidth_60000_replaced"]}')
    print(f'     adaptive-maxheight=60000 -> 4320: {stats["adaptive_maxheight_60000_replaced"]}')
    print(f'     Connection (hop-by-hop) removed: {stats["connection_removed"]}')
    print(f'     Keep-Alive (hop-by-hop) removed: {stats["keepalive_removed"]}')
    print(f'   Tamaño: {stats["input_size"]:,} -> {stats["output_size"]:,} bytes')
    print(f'   Output: {out}')


if __name__ == '__main__':
    main(sys.argv)
