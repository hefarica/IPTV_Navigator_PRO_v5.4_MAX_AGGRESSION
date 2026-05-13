# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r'C:\Users\HFRC\AppData\Local\Temp\ape_pkg\ape_integration\frontend\js\ape-v9\health-runtime.js')
src = p.read_text(encoding='utf-8')
old = (
    "        filterAdmittedChannels(channels) {\n"
    "            if (!this.config.requireAdmission || this.admittedMap.size === 0) return channels;\n"
)
new = (
    "        filterAdmittedChannels(channels) {\n"
    "            if (!this.config.requireAdmission) return channels;\n"
    "            if (this.admittedMap.size === 0) {\n"
    "                if (this.config.debug) console.warn('\\u{1F6AB} [APE-HEALTH] admittedMap empty with requireAdmission=true -> returning empty list (fail-closed)');\n"
    "                return [];\n"
    "            }\n"
)
if old not in src:
    raise SystemExit('ERR: patch target not found (ya aplicado o archivo distinto)')
p.write_text(src.replace(old, new, 1), encoding='utf-8')
print('OK: patch fail-closed v2.0 aplicado a', p)
