#!/usr/bin/env python3
"""Import real LAB Excel profiles P0-P5 into a browser JS module.

Reads 6_NIVEL_2_PROFILES. Values are preserved as calibrated in the workbook;
JSON-looking cells are parsed where possible. No synthetic fields are added.
"""
import json
import os
import sys

import openpyxl

SECTIONS = {
    '-- SETTINGS --': 'settings',
    '-- VLCOPT --': 'vlcopt',
    '-- KODIPROP --': 'kodiprop',
    '-- HEADEROVERRIDES --': 'headerOverrides',
    '-- PREFETCH_CONFIG --': 'prefetch_config',
    '-- HLSJS --': 'hlsjs',
    '-- OPTIMIZER BOUNDS (Nivel C Per-Profile, bump +15% escalonado) --': 'bounds',
    '-- OPTIMIZER RESULTS (populated by Brain_OmegaOptimizer_PerProfile) --': 'optimized_knobs',
    '-- PRISMA STAGE 1 LAB-SYNC v2.0 (consumed by ProfileVal + Guardian Daemon) --': 'lab_sync',
}


def maybe_json(v):
    if isinstance(v, str):
        s = v.strip()
        if s[:1] in '[{' and s[-1:] in ']}':
            try:
                return json.loads(s)
            except Exception:
                pass
    return v


def main(xlsm, outjs):
    wb = openpyxl.load_workbook(xlsm, read_only=True, data_only=True)
    ws = wb['6_NIVEL_2_PROFILES']
    profiles = {f'P{i}': {'settings': {}, 'vlcopt': {}, 'kodiprop': {},
                          'headerOverrides': {}, 'prefetch_config': {}, 'hlsjs': {},
                          'bounds': {}, 'optimized_knobs': {}, 'lab_sync': {}}
                for i in range(6)}
    section = None
    for row in ws.iter_rows(min_row=5, max_row=ws.max_row, values_only=True):
        attr = row[0]
        if attr is None:
            continue
        attr = str(attr).strip()
        if attr in SECTIONS:
            section = SECTIONS[attr]
            continue
        if attr.startswith('-- META --') or attr.startswith('NIVEL'):
            section = 'meta'
            continue
        if attr.startswith('--') or attr == 'Atributo':
            continue
        for i, pid in enumerate(('P0', 'P1', 'P2', 'P3', 'P4', 'P5'), start=1):
            val = row[i]
            if val is None:
                continue
            p = profiles[pid]
            if section == 'meta':
                p[attr] = maybe_json(val)
            elif section and attr.startswith(section + '.'):
                p[section][attr.split('.', 1)[1]] = val
            elif section == 'lab_sync' and attr.startswith('settings.'):
                p['settings'][attr.split('.', 1)[1]] = val
            elif section:
                p[section][attr] = val
    js = '/* Auto-generated from APE_M3U8_LAB_v8_FIXED_CERTIFIED.xlsm */\n' \
         'window.APE_LAB_V8_PROFILES = ' + json.dumps(profiles, ensure_ascii=False, indent=1, default=str) + ';\n'
    os.makedirs(os.path.dirname(outjs), exist_ok=True)
    open(outjs, 'w', encoding='utf-8', newline='').write(js)
    for pid in profiles:
        p = profiles[pid]
        print(pid, 'settings', len(p['settings']), 'vlcopt', len(p['vlcopt']),
              'kodiprop', len(p['kodiprop']), 'overrides', len(p['headerOverrides']),
              'prefetch', len(p['prefetch_config']), 'hlsjs', len(p['hlsjs']),
              'bounds', len(p['bounds']), 'opt', len(p['optimized_knobs']))
    print('wrote', outjs)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('usage: import_lab_to_profiles.py <lab.xlsm> <out.js>', file=sys.stderr)
        raise SystemExit(2)
    main(sys.argv[1], sys.argv[2])
