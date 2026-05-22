#!/usr/bin/env python3
"""
IPTV HEVC Cascade Injector — M3U8 Audit & Fix Script
=====================================================
Versión: 2.0.0-golden-rule-enforcer
Proyecto: IPTV Navigator PRO v5.4 MAX AGGRESSION

GOLDEN RULE de codecs (inmutable):
  hvc1.*  →  Solo en #EXT-X-STREAM-INF CODECS= (Apple/Tizen/webOS)
  hev1.*  →  Solo en #KODIPROP / #EXTVLCOPT / #EXT-X-APE-* (ExoPlayer/Kodi)
  hevc    →  Nombre de familia en #EXTVLCOPT:codec= y #KODIPROP:preferred_codec=

Uso:
  python audit_and_fix_m3u8.py <input.m3u8> <output.m3u8> [--keep-atmos] [--dry-run]
"""

import sys
import re
import argparse


def is_master_playlist(lines):
    return any(l.strip().startswith('#EXT-X-STREAM-INF') for l in lines)


def fix_golden_rule_violation(line, fixes):
    if not line.startswith('#EXT-X-STREAM-INF'):
        return line
    hev1_pattern = re.compile(r'hev1\.[A-Za-z0-9._]+')
    matches = hev1_pattern.findall(line)
    if not matches:
        return line
    for match in matches:
        hvc1_equiv = match.replace('hev1.', 'hvc1.', 1)
        line = line.replace(match, hvc1_equiv)
        fixes.append(f'  [GOLDEN RULE FIX] {match} → {hvc1_equiv} en STREAM-INF')
    return line


def audit_and_fix(input_file, output_file, keep_atmos=False, dry_run=False):
    print(f'[*] Procesando {input_file}...')
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    is_master = is_master_playlist(lines)
    out_lines = []
    fixes = []
    start_count = 0

    for i, line in enumerate(lines):
        raw = line.rstrip('\n\r')
        stripped = raw.strip()

        if stripped.startswith('#EXT-X-STREAM-INF') and 'hev1.' in stripped:
            out_lines.append(fix_golden_rule_violation(stripped, fixes) + '\n')
            continue

        if is_master and stripped.startswith('#EXT-X-TARGETDURATION'):
            fixes.append(f'  [RFC8216] Eliminado #EXT-X-TARGETDURATION de Master Playlist (L{i+1})')
            continue

        if is_master and stripped.startswith('#EXT-X-PART-INF'):
            fixes.append(f'  [RFC8216] Eliminado #EXT-X-PART-INF de Master Playlist (L{i+1})')
            continue

        # VERSION:9 NO se degrada (el proyecto usa VERSION:9 para LL-HLS)

        if stripped.startswith('#EXT-X-START:'):
            start_count += 1
            if start_count > 1:
                fixes.append(f'  [RFC8216] Eliminado #EXT-X-START duplicado #{start_count} (L{i+1})')
                continue
            if 'TIME-OFFSET=-14' in stripped or 'TIME-OFFSET=14' in stripped:
                fixes.append(f'  [FIX] TIME-OFFSET extremo → -3.0 (L{i+1})')
                out_lines.append('#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES\n')
                continue

        if not keep_atmos and 'ec-3' in stripped and not stripped.startswith('#EXT-X-APE-'):
            fixes.append(f'  [AUDIO] ec-3 → ac-3 en L{i+1}')
            out_lines.append(stripped.replace('ec-3', 'ac-3') + '\n')
            continue

        out_lines.append(raw + '\n')

    if fixes:
        print(f'[!] {len(fixes)} correcciones:')
        for fix in fixes:
            print(fix)
    else:
        print('[+] Lista limpia — sin violaciones.')

    if dry_run:
        print('[DRY-RUN] No se escribió salida.')
        return len(fixes)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(out_lines)
    print(f'[+] Guardado en: {output_file}')
    return len(fixes)


def main():
    parser = argparse.ArgumentParser(description='IPTV HEVC Cascade Injector — Audit M3U8')
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--keep-atmos', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    try:
        fixes = audit_and_fix(args.input, args.output, args.keep_atmos, args.dry_run)
        sys.exit(0 if fixes == 0 else 1)
    except FileNotFoundError as e:
        print(f'[ERROR] {e}')
        sys.exit(2)


if __name__ == '__main__':
    main()
