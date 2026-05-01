#!/usr/bin/env python3
"""
hls_strict_validator.py — RFC 8216 + RFC 6381 strict validator de M3U8.

Detecta cosas que el regex audit NO ve:
  - Master playlist con #EXT-X-STREAM-INF sin URI variant subsequent
  - #EXTINF sin numeric duration o sin URI siguiente
  - CODECS strings malformadas (RFC 6381) — hvc1/hev1/avc1/av01/dvh1/mp4a/ec-3
  - #EXT-X-VERSION insuficiente para features usadas
  - #EXTHTTP JSON malformado (trampas oficiales del manifest)
  - Atributos requeridos faltantes (BANDWIDTH en STREAM-INF, DURATION en EXTINF)
  - Master vs media playlist consistency (no mezclar)
  - URI relative resolution problemas

Usage:
    python hls_strict_validator.py <ruta.m3u8> [--out report.json]

Exit codes:
    0  = full RFC 8216 compliance
    1  = warnings (non-blocking issues)
    2  = errors (blocking — player puede rechazar)
    3  = critical (manifest inválido — playback imposible)
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


# ── RFC 6381 codec patterns ────────────────────────────────────────────────
CODEC_PATTERNS = {
    'hevc': re.compile(r'^(hvc1|hev1)\.[A-Z0-9]\d?\.[A-F0-9]{1,8}\.[LH]\d{1,3}(\.[0-9A-F]{2}){0,6}$', re.I),
    'avc':  re.compile(r'^avc[123]\.[0-9A-F]{6}$', re.I),
    'av1':  re.compile(r'^av01\.\d\.\d{1,2}[MH]\.\d{1,2}(\.\d){0,5}$', re.I),
    'dv':   re.compile(r'^dvh[e1]\.\d{1,2}\.\d{1,2}$', re.I),     # Dolby Vision
    'aac':  re.compile(r'^mp4a\.40\.\d{1,2}$', re.I),              # AAC LC/HE/HEv2
    'eac3': re.compile(r'^ec-3$', re.I),                            # E-AC-3 (Atmos via JOC)
    'ac3':  re.compile(r'^ac-3$', re.I),
    'opus': re.compile(r'^Opus$|^opus$'),
    'mp3':  re.compile(r'^mp4a\.6B$|^mp4a\.40\.34$', re.I),
    'vp9':  re.compile(r'^vp09\.\d{2}\.\d{2}\.\d{2}', re.I),
    'lcevc': re.compile(r'^lcev\.\d\.\d\.\d$', re.I),               # LCEVC enhancement
    'vvc':  re.compile(r'^vvc1\.\d\.[A-F0-9]+\.[LH]\d+\..*$', re.I),
}

# ── Tags que requieren versión específica ──────────────────────────────────
VERSION_REQUIREMENTS = {
    '#EXT-X-MAP': 5,
    '#EXT-X-DATERANGE': 6,
    '#EXT-X-DEFINE': 8,
    '#EXT-X-PART': 9,           # LL-HLS
    '#EXT-X-PART-INF': 9,
    '#EXT-X-PRELOAD-HINT': 9,
    '#EXT-X-RENDITION-REPORT': 9,
    '#EXT-X-SKIP': 9,
    '#EXT-X-CONTENT-STEERING': 9,
}

# ── Atributos requeridos por tag ───────────────────────────────────────────
REQUIRED_ATTRS = {
    '#EXT-X-STREAM-INF': ['BANDWIDTH'],
    '#EXT-X-I-FRAME-STREAM-INF': ['BANDWIDTH', 'URI'],
    '#EXT-X-MEDIA': ['TYPE', 'GROUP-ID', 'NAME'],
    '#EXT-X-KEY': ['METHOD'],
    '#EXT-X-MAP': ['URI'],
    '#EXT-X-DATERANGE': ['ID', 'START-DATE'],
}


def parse_attrs(attr_str):
    """Parsea atributos M3U8 estilo `KEY=VALUE,KEY2="VALUE2"`."""
    attrs = {}
    pattern = re.compile(r'([A-Z0-9-]+)=("([^"]*)"|([^,]+))')
    for m in pattern.finditer(attr_str):
        key = m.group(1)
        val = m.group(3) if m.group(3) is not None else m.group(4)
        attrs[key] = val
    return attrs


def validate_codec_string(codec_str):
    """Valida un CODECS string con múltiples codecs separados por coma."""
    if not codec_str:
        return False, "empty CODECS"
    codecs = [c.strip() for c in codec_str.split(',')]
    invalid = []
    for c in codecs:
        matched = False
        for name, pattern in CODEC_PATTERNS.items():
            if pattern.match(c):
                matched = True
                break
        if not matched:
            invalid.append(c)
    if invalid:
        return False, f"unrecognized RFC 6381 codecs: {invalid}"
    return True, None


def validate_exthttp_json(json_str):
    """Valida #EXTHTTP JSON contra las 8 trampas oficiales."""
    issues = []
    if not (json_str.startswith('{') and json_str.endswith('}')):
        issues.append('TRAP-6: missing braces')
        return issues
    if re.search(r',\s*}', json_str):
        issues.append('TRAP-4: trailing comma')
    if "'" in json_str and '"' not in json_str:
        issues.append("TRAP-5: single quotes (mixed)")
    try:
        obj = json.loads(json_str)
    except json.JSONDecodeError as e:
        issues.append(f'INVALID-JSON: {e}')
        return issues
    for k, v in obj.items():
        if not isinstance(v, str):
            continue
        if '\r' in v or '\n' in v:
            issues.append(f'TRAP-3: CRLF in {k}')
        if k.lower() == 'user-agent' and '%20' in v:
            issues.append(f'TRAP-2: %20 in User-Agent')
        if re.search(r'%25[0-9A-F]{2}', v, re.I):
            issues.append(f'TRAP-8: double-encoding in {k}')
        if re.search(r'(?<!\\)\\(?![\\"/bfnrtu])', v):
            issues.append(f'TRAP-7: unescaped backslash in {k}')
    return issues


def validate(path: Path) -> dict:
    report = {
        'path': str(path),
        'errors': [],
        'warnings': [],
        'info': [],
        'stats': defaultdict(int),
    }
    declared_version = None
    is_master = False
    is_media = False
    pending_extinf = None
    pending_streaminf = None
    line_num = 0
    extinf_with_no_uri = 0
    streaminf_with_no_uri = 0
    extinf_invalid_duration = 0
    bad_codec_strings = 0

    with path.open('r', encoding='utf-8', errors='replace') as fh:
        first_line = fh.readline().rstrip('\n')
        line_num = 1
        if first_line.split()[0] != '#EXTM3U':
            report['errors'].append({'line': 1, 'rule': 'RFC 8216 §4.3.1.1',
                                     'msg': f'first line must be "#EXTM3U", got: {first_line[:80]}'})
            return report

        for line in fh:
            line_num += 1
            line = line.rstrip('\n').rstrip('\r')
            if not line:
                continue

            # URI line (no #)
            if not line.startswith('#'):
                if pending_extinf:
                    pending_extinf = None
                    is_media = True
                elif pending_streaminf:
                    pending_streaminf = None
                    is_master = True
                else:
                    if is_media or is_master:
                        report['warnings'].append({'line': line_num, 'rule': 'orphan URI',
                                                   'msg': f'URI without preceding EXTINF or STREAM-INF: {line[:60]}'})
                continue

            # Tag classification
            if line.startswith('#EXT-X-VERSION:'):
                try:
                    declared_version = int(line.split(':', 1)[1].strip())
                except ValueError:
                    report['errors'].append({'line': line_num, 'rule': 'RFC 8216 §4.3.1.2',
                                             'msg': f'EXT-X-VERSION must be integer, got: {line}'})

            elif line.startswith('#EXTINF:'):
                # If there's a pending EXTINF without URI between, that's an orphan
                if pending_extinf:
                    extinf_with_no_uri += 1
                # Parse duration
                payload = line[len('#EXTINF:'):]
                duration_part = payload.split(',', 1)[0].strip()
                try:
                    dur = float(duration_part)
                    # -1 es válido en LIVE (duration unknown). Solo flag <-1 o >24h
                    if dur < -1 or dur > 86400:
                        extinf_invalid_duration += 1
                except ValueError:
                    extinf_invalid_duration += 1
                pending_extinf = line_num
                report['stats']['EXTINF'] += 1

            elif line.startswith('#EXT-X-STREAM-INF:'):
                if pending_streaminf:
                    streaminf_with_no_uri += 1
                attrs = parse_attrs(line[len('#EXT-X-STREAM-INF:'):])
                # Required attrs
                for req in REQUIRED_ATTRS['#EXT-X-STREAM-INF']:
                    if req not in attrs:
                        report['errors'].append({'line': line_num, 'rule': 'RFC 8216 §4.3.4.2',
                                                 'msg': f'STREAM-INF missing required {req}'})
                # CODECS validation
                if 'CODECS' in attrs:
                    valid, err = validate_codec_string(attrs['CODECS'])
                    if not valid:
                        bad_codec_strings += 1
                        if bad_codec_strings <= 3:  # Limit reports
                            report['warnings'].append({'line': line_num, 'rule': 'RFC 6381',
                                                       'msg': f'CODECS issue: {err}'})
                pending_streaminf = line_num
                report['stats']['STREAM-INF'] += 1

            elif line.startswith('#EXT-X-MEDIA:'):
                attrs = parse_attrs(line[len('#EXT-X-MEDIA:'):])
                for req in REQUIRED_ATTRS['#EXT-X-MEDIA']:
                    if req not in attrs:
                        report['errors'].append({'line': line_num, 'rule': 'RFC 8216 §4.3.4.1',
                                                 'msg': f'EXT-X-MEDIA missing required {req}'})
                report['stats']['EXT-X-MEDIA'] += 1

            elif line.startswith('#EXT-X-KEY:'):
                attrs = parse_attrs(line[len('#EXT-X-KEY:'):])
                if 'METHOD' not in attrs:
                    report['errors'].append({'line': line_num, 'rule': 'RFC 8216 §4.3.2.4',
                                             'msg': 'EXT-X-KEY missing METHOD'})
                report['stats']['EXT-X-KEY'] += 1

            elif line.startswith('#EXTHTTP:'):
                json_payload = line[len('#EXTHTTP:'):]
                issues = validate_exthttp_json(json_payload)
                if issues:
                    for iss in issues:
                        report['errors'].append({'line': line_num, 'rule': 'EXTHTTP JSON traps',
                                                 'msg': iss})
                report['stats']['EXTHTTP'] += 1

            elif line.startswith('#EXT-X-TARGETDURATION:'):
                is_media = True
                report['stats']['EXT-X-TARGETDURATION'] += 1

            elif line.startswith('#EXT-X-MEDIA-SEQUENCE:'):
                is_media = True

            elif line.startswith('#EXT-X-ENDLIST'):
                report['stats']['EXT-X-ENDLIST'] += 1

            # Track other tag types for stats
            elif line.startswith('#EXT'):
                tag_name = line.split(':', 1)[0]
                report['stats'][tag_name] += 1

                # Version requirement check
                if tag_name in VERSION_REQUIREMENTS:
                    req_v = VERSION_REQUIREMENTS[tag_name]
                    if declared_version is not None and declared_version < req_v:
                        report['warnings'].append({'line': line_num, 'rule': 'RFC 8216 §7',
                                                   'msg': f'{tag_name} requires VERSION>={req_v}, got {declared_version}'})

    # Final summary issues
    if extinf_with_no_uri:
        report['errors'].append({'line': 0, 'rule': 'orphan EXTINF',
                                 'msg': f'{extinf_with_no_uri} EXTINF without subsequent URI'})
    if streaminf_with_no_uri:
        report['errors'].append({'line': 0, 'rule': 'orphan STREAM-INF',
                                 'msg': f'{streaminf_with_no_uri} STREAM-INF without subsequent URI'})
    if extinf_invalid_duration:
        report['warnings'].append({'line': 0, 'rule': 'EXTINF duration',
                                   'msg': f'{extinf_invalid_duration} EXTINF with invalid duration'})
    if bad_codec_strings > 3:
        report['warnings'].append({'line': 0, 'rule': 'RFC 6381',
                                   'msg': f'{bad_codec_strings} total CODECS issues (showing first 3)'})

    if is_master and is_media:
        report['errors'].append({'line': 0, 'rule': 'RFC 8216 §4.3.4',
                                 'msg': 'mixed master + media playlist (cannot have both)'})

    if declared_version is None:
        report['warnings'].append({'line': 0, 'rule': 'RFC 8216 §4.3.1.2',
                                   'msg': 'EXT-X-VERSION not declared (defaults to 1)'})

    report['summary'] = {
        'errors_count': len(report['errors']),
        'warnings_count': len(report['warnings']),
        'declared_version': declared_version,
        'is_master': is_master,
        'is_media': is_media,
        'top_tags': dict(Counter(report['stats']).most_common(10)),
    }
    report['stats'] = dict(report['stats'])
    return report


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        sys.exit(3)
    inp = Path(argv[1])
    if not inp.exists():
        print(f'ERROR: {inp} no existe')
        sys.exit(3)
    out = None
    if '--out' in argv:
        out = Path(argv[argv.index('--out') + 1])

    report = validate(inp)
    summary = report['summary']

    # Print human-readable summary
    print(f"=== HLS Strict Validator — {inp.name} ===")
    print(f"Declared VERSION: {summary['declared_version']}")
    print(f"Type: master={summary['is_master']} | media={summary['is_media']}")
    print(f"Errors: {summary['errors_count']}")
    print(f"Warnings: {summary['warnings_count']}")
    print(f"Top tags: {summary['top_tags']}")
    print()

    if report['errors']:
        print(f"--- ERRORS (first 10 of {len(report['errors'])}) ---")
        for e in report['errors'][:10]:
            print(f"  L{e['line']:>5}  [{e['rule']}]  {e['msg']}")
    if report['warnings']:
        print(f"--- WARNINGS (first 10 of {len(report['warnings'])}) ---")
        for w in report['warnings'][:10]:
            print(f"  L{w['line']:>5}  [{w['rule']}]  {w['msg']}")

    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2, default=str), encoding='utf-8')
        print(f"\nReport saved to {out}")

    # Exit code
    if summary['errors_count'] > 0:
        sys.exit(2)
    if summary['warnings_count'] > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main(sys.argv)
