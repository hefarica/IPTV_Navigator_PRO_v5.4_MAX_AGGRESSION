#!/usr/bin/env python3
"""HLS Science Lint — APE Visual Extreme Science-Safe (extended).

Detects toxic/fake visual metadata, codec/level incoherence, broken fallback,
and reports objective per-variant features (bits-per-pixel-per-frame).

Exit code: 1 if any HIGH finding (BLOCK), else 0 (PASS/WARN).
Doctrine: never claim quality without measurement; never break AVC fallback;
GOLDEN RULE hvc1 in STREAM-INF CODECS / hev1 only in KODIPROP+EXTVLCOPT;
Ley Cardinal 1 codec level must carry the declared RESOLUTION.

Covers (>=15 checks requested in the Science-Safe brief):
 1  UNVERIFIED_LCEVC          HIGH  lcevc/lvc1 declared without real enhancement data
 2  TOXIC_HEADER              HIGH  Range/If-None-Match/If-Modified-Since/TE:trailers/Priority/Upgrade-Insecure-Requests
 3  HEVC_CODEC_MALFORMED      MED   hvc1/hev1 token not matching RFC 6381 hvcC pattern
 4  HEV1_IN_STREAM_INF        HIGH  hev1 used in STREAM-INF CODECS (must be hvc1)
 5  HVC1_OUTSIDE_CODECS       MED   hvc1.* literal inside KODIPROP/EXTVLCOPT (use family name there)
 6  PQ_WITHOUT_ROLLBACK_INFO  WARN  VIDEO-RANGE=PQ present; Phase G rollback not verifiable from manifest
 7  LEVEL_BELOW_RESOLUTION    HIGH  4K with HEVC level < L150 / 8K with level < L180 (Ley Cardinal 1)
 8  NO_AVC_FALLBACK           WARN  HEVC present, >1 variant, zero AVC fallback variant
 9  BANDWIDTH_INCOHERENT      WARN  AVERAGE-BANDWIDTH > BANDWIDTH
10  ATTR_UNQUOTED_CODECS      MED   CODECS attribute not double-quoted
11  DUPLICATE_VARIANT         WARN  identical RESOLUTION+CODECS+BANDWIDTH or repeated URL
12  APE_TAG_MISPLACED         LOW   #EXT-X-APE-* carrying URI= or wedged between STREAM-INF and URL
13  URL_WRAPPED_OR_BROKEN     HIGH  playback URL wrapped (/omega/resolve, /shield/) or empty (SHIELDED verbatim)
14  STARVED_4K                MED   4K variant bitrate < 8 Mbps (aspirational / heavily compressed)
15  STARVED_8K                HIGH  8K variant bitrate < 25 Mbps (not true visual 8K)
16  CHANNEL_REMOVAL           INFO  single-file lint cannot detect channel loss; needs before/after diff
"""
from __future__ import annotations
import argparse, json, re, sys, pathlib

STREAM_RE = re.compile(r"#EXT-X-STREAM-INF:(.*)")
ATTR_RE = re.compile(r'([A-Z0-9\-]+)=((?:"[^"]*")|[^,]*)')
HEVC_RFC_RE = re.compile(r'^h(?:vc|ev)1\.\d+\.[0-9A-Fa-f]+\.L\d+(?:\.[0-9A-Fa-f]{1,2})*$', re.I)
HEVC_LEVEL_RE = re.compile(r'h(?:vc|ev)1\.\d+\.[0-9A-Fa-f]+\.L(\d+)', re.I)
TOXIC_PATTERNS = [
    ("range", re.compile(r'\brange\b["\s]*[:=]["\s]*bytes\s*=', re.I)),
    ("if-none-match", re.compile(r'if-none-match', re.I)),
    ("if-modified-since", re.compile(r'if-modified-since', re.I)),
    ("te-trailers", re.compile(r'\bte\b\s*[:=]\s*trailers', re.I)),
    ("priority", re.compile(r'(^|[^a-z-])priority\s*[:=]\s*u=', re.I)),
    ("upgrade-insecure-requests", re.compile(r'upgrade-insecure-requests', re.I)),
]
CFG_TAGS = ('#KODIPROP', '#EXTVLCOPT')


def parse_attrs(s: str) -> dict:
    out = {}
    for k, v in ATTR_RE.findall(s):
        out[k] = v[1:-1] if v.startswith('"') and v.endswith('"') else v
    return out


def parse(path: pathlib.Path):
    raw = path.read_text(errors='replace')
    lines = raw.splitlines()
    variants = []
    for i, line in enumerate(lines):
        m = STREAM_RE.match(line)
        if not m:
            continue
        a = parse_attrs(m.group(1))
        url = lines[i + 1].strip() if i + 1 < len(lines) and not lines[i + 1].startswith('#') else ''
        w = h = 0
        if 'RESOLUTION' in a and 'x' in a['RESOLUTION']:
            try:
                w, h = [int(x) for x in a['RESOLUTION'].split('x', 1)]
            except Exception:
                pass
        bw = int(a.get('AVERAGE-BANDWIDTH') or a.get('BANDWIDTH') or 0)
        decl_bw = int(a.get('BANDWIDTH') or 0)
        fps = float(a.get('FRAME-RATE') or 30)
        bpppf = bw / (w * h * fps) if w and h and fps else 0
        variants.append({
            'line': i + 1, 'url': url, 'attrs': a, 'raw': line,
            'w': w, 'h': h, 'bw': bw, 'decl_bw': decl_bw, 'fps': fps, 'bpppf': bpppf,
        })
    return lines, variants


def lint(path: pathlib.Path):
    lines, variants = parse(path)
    warnings = []

    def add(level, code, line, msg):
        warnings.append({'line': line, 'level': level, 'code': code, 'msg': msg})

    # --- whole-file scans (toxic headers, hvc1 outside CODECS) ---
    for i, line in enumerate(lines, 1):
        ls = line.strip()
        if ls.startswith(CFG_TAGS):
            for name, rx in TOXIC_PATTERNS:
                if rx.search(ls):
                    add('HIGH', 'TOXIC_HEADER', i, f'Toxic header "{name}" causes EOF/403/304 on Android players.')
            if re.search(r'preferred_codec|codec=', ls, re.I) and re.search(r'h(?:vc|ev)1\.\d', ls):
                add('MED', 'HVC1_OUTSIDE_CODECS', i,
                    'Use a family name (hevc) in KODIPROP/EXTVLCOPT codec fields, not a full hvc1.* RFC string.')
        elif ls.startswith('#EXTHTTP'):
            for name, rx in TOXIC_PATTERNS:
                if rx.search(ls):
                    add('HIGH', 'TOXIC_HEADER', i, f'Toxic header "{name}" in EXTHTTP block.')
        if ls.startswith('#EXT-X-APE') and 'URI=' in ls:
            add('LOW', 'APE_TAG_MISPLACED', i, 'Private #EXT-X-APE-* tag should not carry URI= (players may misparse).')

    # --- per-variant checks ---
    seen = {}
    seen_urls = {}
    has_hevc = False
    has_avc = False
    for v in variants:
        a = v['attrs']
        c = a.get('CODECS', '')
        cl = c.lower()
        line = v['line']
        raw = v['raw']

        if 'hvc1' in cl or 'hev1' in cl or 'dvh1' in cl or 'dvhe' in cl:
            has_hevc = True
        if 'avc1' in cl or 'avc3' in cl:
            has_avc = True

        # 1 LCEVC
        if 'lcevc' in cl or 'lvc1' in cl:
            add('HIGH', 'UNVERIFIED_LCEVC', line, 'Do not declare LCEVC unless the stream really carries enhancement data.')
        # 4 hev1 in STREAM-INF
        if 'hev1' in cl:
            add('HIGH', 'HEV1_IN_STREAM_INF', line, 'GOLDEN RULE: use hvc1 (not hev1) in STREAM-INF CODECS for HEVC sample entries.')
        # 10 unquoted CODECS
        if 'CODECS=' in raw and 'CODECS="' not in raw:
            add('MED', 'ATTR_UNQUOTED_CODECS', line, 'CODECS attribute must be double-quoted per RFC 8216.')
        # 3 malformed HEVC token
        for tok in c.split(','):
            t = tok.strip()
            if t.lower().startswith(('hvc1', 'hev1')) and not HEVC_RFC_RE.match(t):
                add('MED', 'HEVC_CODEC_MALFORMED', line, f'HEVC codec token "{t}" is not a valid RFC 6381 hvcC string.')
        # 7 level below resolution (Ley Cardinal 1)
        lm = HEVC_LEVEL_RE.search(cl)
        if lm:
            lvl = int(lm.group(1))
            if v['w'] >= 7680 and lvl < 180:
                add('HIGH', 'LEVEL_BELOW_RESOLUTION', line, f'8K RESOLUTION with HEVC level L{lvl} (<L180) cannot decode -> freeze risk.')
            elif v['w'] >= 3840 and lvl < 150:
                add('HIGH', 'LEVEL_BELOW_RESOLUTION', line, f'4K RESOLUTION with HEVC level L{lvl} (<L150) cannot decode -> freeze risk.')
        # 6 PQ without verifiable rollback
        if a.get('VIDEO-RANGE', '').upper() == 'PQ':
            add('WARN', 'PQ_WITHOUT_ROLLBACK_INFO', line, 'VIDEO-RANGE=PQ present; Phase G SDR rollback cannot be verified from the manifest alone.')
        # 9 bandwidth incoherent
        if v['decl_bw'] and v['bw'] and v['bw'] > v['decl_bw']:
            add('WARN', 'BANDWIDTH_INCOHERENT', line, 'AVERAGE-BANDWIDTH exceeds BANDWIDTH (peak must be >= average).')
        # 14/15 starved 4K/8K
        if v['w'] >= 7680 and v['bw'] and v['bw'] < 25_000_000:
            add('HIGH', 'STARVED_8K', line, '8K with very low bitrate; do not promote as true visual 8K.')
        elif v['w'] >= 3840 and v['bw'] and v['bw'] < 8_000_000:
            add('MED', 'STARVED_4K', line, '4K variant bitrate is very low; likely aspirational or heavily compressed.')
        # 13 wrapped/broken URL (SHIELDED verbatim)
        u = v['url']
        if u == '':
            add('HIGH', 'URL_WRAPPED_OR_BROKEN', line, 'STREAM-INF without a following URL line (broken variant).')
        elif '/omega/resolve' in u or '/shield/' in u:
            add('HIGH', 'URL_WRAPPED_OR_BROKEN', line, 'Playback URL is wrapped; SHIELDED doctrine requires the verbatim provider URL.')
        # 11 duplicates
        key = (a.get('RESOLUTION', ''), c, a.get('BANDWIDTH', ''))
        if key in seen and any(key):
            add('WARN', 'DUPLICATE_VARIANT', line, f'Duplicate variant (same RESOLUTION/CODECS/BANDWIDTH) also at line {seen[key]}.')
        seen[key] = line
        if u:
            if u in seen_urls:
                add('WARN', 'DUPLICATE_VARIANT', line, f'Duplicate variant URL also at line {seen_urls[u]}.')
            seen_urls[u] = line

    # 8 no AVC fallback
    if has_hevc and not has_avc and len(variants) > 1:
        add('WARN', 'NO_AVC_FALLBACK', 0, 'HEVC variants present with no AVC fallback; devices without HEVC may freeze.')
    # 16 channel removal (informational only)
    info = 'CHANNEL_REMOVAL check requires a before/after diff and is not evaluable from a single manifest.'

    high = sum(1 for w in warnings if w['level'] == 'HIGH')
    report = {
        'manifest': str(path),
        'variant_count': len(variants),
        'high': high,
        'warn': sum(1 for w in warnings if w['level'] in ('WARN', 'MED', 'LOW')),
        'verdict': 'BLOCK' if high else ('WARN' if warnings else 'PASS'),
        'note': info,
        'warnings': warnings,
        'variants': variants,
    }
    return report


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    ap = argparse.ArgumentParser(description='HLS Science Lint (Science-Safe)')
    ap.add_argument('manifest')
    ap.add_argument('--json', nargs='?', const='-', default=None,
                    help='emit JSON; optional path to write to, else stdout')
    args = ap.parse_args()
    report = lint(pathlib.Path(args.manifest))
    if args.json is not None:
        payload = json.dumps(report, ensure_ascii=False, indent=2)
        if args.json == '-':
            print(payload)
        else:
            pathlib.Path(args.json).write_text(payload, encoding='utf-8')
            print(f"{report['verdict']} variants={report['variant_count']} "
                  f"high={report['high']} warn={report['warn']} -> {args.json}")
    else:
        print(f"verdict={report['verdict']} variants={report['variant_count']} "
              f"high={report['high']} warn={report['warn']}")
        for w in report['warnings']:
            loc = f"L{w['line']}" if w['line'] else 'GLOBAL'
            print(f"{loc} {w['level']} {w['code']}: {w['msg']}")
    return 1 if report['high'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
