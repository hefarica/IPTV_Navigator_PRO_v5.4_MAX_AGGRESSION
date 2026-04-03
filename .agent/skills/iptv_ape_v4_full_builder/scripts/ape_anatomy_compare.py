#!/usr/bin/env python3
"""
APE Anatomy Comparator — Multi-Version Forensic Analysis
Compares two or more APE M3U8 lists and identifies:
  - Structural differences (lines/channel, header size)
  - Exclusive directives per version
  - New doctrines (grouped by technology block)
  - Integration plan (what goes to global header vs. proxy payload)

Usage:
  python ape_anatomy_compare.py <file1.m3u8> <file2.m3u8> [file3.m3u8 ...]
  python ape_anatomy_compare.py --output report.md <file1.m3u8> <file2.m3u8>
"""
import re
import sys
import os
from collections import Counter
from pathlib import Path

# ── Technology doctrine grouping ──────────────────────────────────────────────
DOCTRINE_MAP = {
    'LCEVC':       r'LCEVC|VNOVA',
    'AI/SR':       r'AI-SR|AI-TEMPORAL|AI-DENOIS|AI-DEBLOCK|AI-ARTIFACT|AI-FRAME|AI-COLOR|AI-SHARP|AI-HDR|AI-VMAF|AI-CONTENT|AI-PERCEP|AI-MOTION|AI-SCENE',
    'HDR':         r'HDR|DOLBY.VISION|ATMOS|TRUEHD|QUANTUM-ITM|ITM-',
    'VVC/EVC':     r'VVC|EVC',
    'CMAF':        r'CMAF',
    'FMP4':        r'FMP4',
    'RESILIENCE':  r'RESILIENCE|DEGRADATION|GUARDIAN|FALLBACK',
    'EVASION':     r'EVASION|STEALTH|HYDRA|IP-ROTATION|POLYMORPHIC',
    'ISP':         r'ISP-THROTTLE',
    'TELCHEMY':    r'TELCHEMY|TVQM|VSMQ|TR101290',
    'CORTEX':      r'CORTEX',
    'SCTE35':      r'SCTE35',
    'AUDIO':       r'AUDIO|ATMOS',
    'TRICK-PLAY':  r'TRICK-PLAY|THUMBNAIL|SEEK|CHAPTER',
    'QOS/QOE':     r'QOE|QOS|VQS|VMAF',
    'BUFFER':      r'BUFFER|PREBUFFER|CACHE|PREFETCH',
    'CODEC':       r'CODEC|AV1|HEVC|H264|H265|VVC|EVC',
    'ENCODER':     r'ENCODER|RATE-CONTROL|VBV|GOP|B-FRAMES|LOOKAHEAD|AQ-MODE',
    'GPU':         r'GPU|SCALER|DENOISE|DEBLOCK|FILM-GRAIN',
    'OTHER':       r'.',
}


def parse_file(path: str) -> dict:
    """Parse an APE M3U8 file and return structural metadata."""
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()

    total = len(lines)
    header_end = next((i for i, l in enumerate(lines) if l.startswith('#EXTINF')), 0)
    channels = sum(1 for l in lines if l.startswith('#EXTINF'))
    block_avg = round((total - header_end) / channels, 1) if channels else 0

    all_dirs = Counter()
    for l in lines:
        ls = l.strip()
        if ls.startswith('#'):
            key = re.split(r'[: =]', ls)[0].strip()
            all_dirs[key] += 1

    header_dirs = set()
    for l in lines[:header_end]:
        ls = l.strip()
        if ls.startswith('#'):
            key = re.split(r'[: =]', ls)[0].strip()
            header_dirs.add(key)

    return {
        'path': path,
        'name': Path(path).name,
        'size_mb': round(os.path.getsize(path) / 1_048_576, 1),
        'total_lines': total,
        'header_lines': header_end,
        'channels': channels,
        'block_avg': block_avg,
        'all_dirs': all_dirs,
        'header_dirs': header_dirs,
    }


def classify_doctrine(directive: str) -> str:
    d = directive.upper()
    for doctrine, pattern in DOCTRINE_MAP.items():
        if doctrine == 'OTHER':
            continue
        if re.search(pattern, d):
            return doctrine
    return 'OTHER'


def compare(files: list) -> dict:
    """Compare multiple APE M3U8 files and return analysis."""
    parsed = [parse_file(f) for f in files]

    # Find directives exclusive to each file
    all_sets = [set(p['all_dirs'].keys()) for p in parsed]
    exclusive = []
    for i, p in enumerate(parsed):
        others = set()
        for j, s in enumerate(all_sets):
            if j != i:
                others |= s
        excl = all_sets[i] - others
        exclusive.append(excl)

    # Find directives common to all
    common = all_sets[0].copy()
    for s in all_sets[1:]:
        common &= s

    # Group exclusive directives by doctrine
    exclusive_by_doctrine = []
    for excl in exclusive:
        by_doc = {}
        for d in excl:
            doc = classify_doctrine(d)
            by_doc.setdefault(doc, []).append(d)
        exclusive_by_doctrine.append(by_doc)

    return {
        'parsed': parsed,
        'exclusive': exclusive,
        'exclusive_by_doctrine': exclusive_by_doctrine,
        'common': common,
    }


def integration_plan(result: dict) -> list:
    """Generate integration plan: what goes to global header vs. proxy payload."""
    plan = []
    # Directives that should go to global header (universal, static)
    global_header_doctrines = {'EVASION', 'ISP', 'LCEVC', 'HDR', 'VVC/EVC', 'QOS/QOE'}
    # Directives that should go to proxy payload (dynamic, per-channel)
    proxy_payload_doctrines = {'RESILIENCE', 'CORTEX', 'TELCHEMY', 'SCTE35', 'TRICK-PLAY'}

    for i, (parsed, by_doc) in enumerate(zip(result['parsed'], result['exclusive_by_doctrine'])):
        for doctrine, dirs in sorted(by_doc.items()):
            if doctrine in global_header_doctrines:
                dest = 'GLOBAL_HEADER'
            elif doctrine in proxy_payload_doctrines:
                dest = 'PROXY_PAYLOAD'
            else:
                dest = 'PER_CHANNEL'
            plan.append({
                'source': parsed['name'],
                'doctrine': doctrine,
                'count': len(dirs),
                'destination': dest,
                'sample': sorted(dirs)[:3],
            })
    return plan


def generate_report(result: dict, plan: list) -> str:
    """Generate a Markdown report."""
    lines = ['# APE Anatomy Comparative Report\n']

    # Stats table
    lines.append('## Structural Statistics\n')
    lines.append('| Metric | ' + ' | '.join(p['name'][:40] for p in result['parsed']) + ' |')
    lines.append('|---|' + '---|' * len(result['parsed']))
    for key, label in [
        ('size_mb', 'Size (MB)'),
        ('total_lines', 'Total Lines'),
        ('channels', 'Channels'),
        ('block_avg', 'Lines/Channel'),
        ('header_lines', 'Header Lines'),
    ]:
        row = f'| **{label}** |'
        for p in result['parsed']:
            row += f" {p[key]:,} |"
        lines.append(row)
    lines.append('')

    # Exclusive directives summary
    lines.append('## Exclusive Directives Per Version\n')
    for i, (parsed, excl) in enumerate(zip(result['parsed'], result['exclusive'])):
        lines.append(f'### {parsed["name"]} — {len(excl)} exclusive directives\n')
        by_doc = result['exclusive_by_doctrine'][i]
        for doctrine in sorted(by_doc.keys()):
            dirs = sorted(by_doc[doctrine])
            lines.append(f'**{doctrine}** ({len(dirs)} directives)')
            for d in dirs[:5]:
                lines.append(f'  - `{d}`')
            if len(dirs) > 5:
                lines.append(f'  - *(+{len(dirs)-5} more)*')
            lines.append('')

    # Integration plan
    lines.append('## Integration Plan\n')
    lines.append('| Source | Doctrine | Count | Destination | Sample Directives |')
    lines.append('|---|---|---|---|---|')
    for item in plan:
        sample = ', '.join(f'`{d}`' for d in item['sample'])
        lines.append(f"| {item['source'][:35]} | **{item['doctrine']}** | {item['count']} | `{item['destination']}` | {sample} |")
    lines.append('')

    # Common directives
    lines.append(f'## Common Directives (Present in All Versions): {len(result["common"])}\n')
    for d in sorted(result['common'])[:20]:
        lines.append(f'- `{d}`')
    if len(result['common']) > 20:
        lines.append(f'- *(+{len(result["common"])-20} more)*')

    return '\n'.join(lines)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='APE Anatomy Comparator')
    parser.add_argument('files', nargs='+', help='M3U8 files to compare')
    parser.add_argument('--output', '-o', default=None, help='Output Markdown report file')
    args = parser.parse_args()

    if len(args.files) < 2:
        print("ERROR: Provide at least 2 M3U8 files to compare.", file=sys.stderr)
        sys.exit(1)

    print(f"Analyzing {len(args.files)} files...")
    result = compare(args.files)
    plan = integration_plan(result)
    report = generate_report(result, plan)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(report)
        print(f"Report saved to: {args.output}")
    else:
        print(report)


if __name__ == '__main__':
    main()
