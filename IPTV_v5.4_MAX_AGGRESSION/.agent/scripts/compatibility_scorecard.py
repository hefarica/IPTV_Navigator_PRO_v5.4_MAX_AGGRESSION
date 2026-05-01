#!/usr/bin/env python3
"""
compatibility_scorecard.py — score por player de la lista M3U8 emitida.

Para cada player target (TiviMate, Kodi+ISA, VLC, ExoPlayer, Safari/AVPlayer,
OTT Navigator, GSE Smart IPTV, IPTV Smarters Pro), reporta:
  - % de tags emitidos que el player interpreta nativamente
  - % parcial / ignorados / problemáticos
  - Top 5 tags útiles que se están desperdiciando (ignored)

Matriz de soporte hardcoded basada en docs oficiales + foros + memoria del proyecto.

Usage:
    python compatibility_scorecard.py <ruta.m3u8> [--out report.json]
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path


# ── Matriz de soporte por player ──────────────────────────────────────────
# Niveles: 'native' (3pt), 'partial' (1pt), 'no' (0pt), 'problematic' (-1pt)
PLAYER_MATRIX = {
    'TiviMate': {
        '#EXTM3U':                          'native',
        '#EXT-X-VERSION':                   'native',
        '#EXTINF':                          'native',
        '#EXT-X-STREAM-INF':                'native',
        '#EXT-X-MEDIA':                     'partial',
        '#EXTHTTP':                         'native',
        '#EXTVLCOPT':                       'no',
        '#KODIPROP':                        'partial',
        '#EXT-X-KEY':                       'native',
        '#EXT-X-DISCONTINUITY':             'native',
        '#EXT-X-DATERANGE':                 'no',
        '#EXT-X-DEFINE':                    'no',
        '#EXT-X-CONTENT-STEERING':          'no',
        '#EXT-X-PROGRAM-DATE-TIME':         'native',
        '#EXT-X-MAP':                       'native',
        '#EXT-X-START':                     'native',
        '#EXT-X-INDEPENDENT-SEGMENTS':      'native',
        '#EXT-X-I-FRAME-STREAM-INF':        'no',
        '#EXT-X-PART':                      'no',
        '#EXT-X-PART-INF':                  'no',
        '#EXT-X-RENDITION-REPORT':          'no',
        '#EXT-X-CMAF':                      'no',  # propietario, ignorado
        '#EXT-X-APE':                       'no',  # propietario
        '#EXT-X-SYS':                       'no',  # propietario
    },
    'Kodi+ISAdaptive': {
        '#EXTM3U':                          'native',
        '#EXT-X-VERSION':                   'native',
        '#EXTINF':                          'native',
        '#EXT-X-STREAM-INF':                'native',
        '#EXT-X-MEDIA':                     'native',
        '#EXTHTTP':                         'no',
        '#EXTVLCOPT':                       'no',
        '#KODIPROP':                        'native',
        '#EXT-X-KEY':                       'native',
        '#EXT-X-DISCONTINUITY':             'native',
        '#EXT-X-DATERANGE':                 'partial',
        '#EXT-X-DEFINE':                    'partial',
        '#EXT-X-CONTENT-STEERING':          'no',
        '#EXT-X-PROGRAM-DATE-TIME':         'native',
        '#EXT-X-MAP':                       'native',
        '#EXT-X-START':                     'native',
        '#EXT-X-INDEPENDENT-SEGMENTS':      'native',
        '#EXT-X-I-FRAME-STREAM-INF':        'partial',
        '#EXT-X-CMAF':                      'no',
        '#EXT-X-APE':                       'no',
        '#EXT-X-SYS':                       'no',
    },
    'VLC': {
        '#EXTM3U':                          'native',
        '#EXT-X-VERSION':                   'native',
        '#EXTINF':                          'native',
        '#EXT-X-STREAM-INF':                'native',
        '#EXT-X-MEDIA':                     'partial',
        '#EXTHTTP':                         'no',
        '#EXTVLCOPT':                       'native',
        '#KODIPROP':                        'no',
        '#EXT-X-KEY':                       'partial',
        '#EXT-X-DISCONTINUITY':             'native',
        '#EXT-X-DATERANGE':                 'no',
        '#EXT-X-DEFINE':                    'no',
        '#EXT-X-CONTENT-STEERING':          'no',
        '#EXT-X-PROGRAM-DATE-TIME':         'no',
        '#EXT-X-MAP':                       'partial',
        '#EXT-X-START':                     'partial',
        '#EXT-X-INDEPENDENT-SEGMENTS':      'partial',
        '#EXT-X-CMAF':                      'no',
        '#EXT-X-APE':                       'no',
        '#EXT-X-SYS':                       'no',
    },
    'ExoPlayer-Media3': {
        '#EXTM3U':                          'native',
        '#EXT-X-VERSION':                   'native',
        '#EXTINF':                          'native',
        '#EXT-X-STREAM-INF':                'native',
        '#EXT-X-MEDIA':                     'native',
        '#EXTHTTP':                         'no',
        '#EXTVLCOPT':                       'no',
        '#KODIPROP':                        'no',
        '#EXT-X-KEY':                       'native',
        '#EXT-X-DISCONTINUITY':             'native',
        '#EXT-X-DATERANGE':                 'partial',
        '#EXT-X-DEFINE':                    'partial',
        '#EXT-X-CONTENT-STEERING':          'partial',
        '#EXT-X-PROGRAM-DATE-TIME':         'native',
        '#EXT-X-MAP':                       'native',
        '#EXT-X-START':                     'native',
        '#EXT-X-INDEPENDENT-SEGMENTS':      'native',
        '#EXT-X-PART':                      'native',
        '#EXT-X-PART-INF':                  'native',
        '#EXT-X-RENDITION-REPORT':          'partial',
        '#EXT-X-CMAF':                      'no',
        '#EXT-X-APE':                       'no',
        '#EXT-X-SYS':                       'no',
    },
    'Safari-AVPlayer': {
        '#EXTM3U':                          'native',
        '#EXT-X-VERSION':                   'native',
        '#EXTINF':                          'native',
        '#EXT-X-STREAM-INF':                'native',
        '#EXT-X-MEDIA':                     'native',
        '#EXTHTTP':                         'no',
        '#EXTVLCOPT':                       'no',
        '#KODIPROP':                        'no',
        '#EXT-X-KEY':                       'native',
        '#EXT-X-DISCONTINUITY':             'native',
        '#EXT-X-DATERANGE':                 'native',
        '#EXT-X-DEFINE':                    'native',
        '#EXT-X-CONTENT-STEERING':          'native',
        '#EXT-X-PROGRAM-DATE-TIME':         'native',
        '#EXT-X-MAP':                       'native',
        '#EXT-X-START':                     'native',
        '#EXT-X-INDEPENDENT-SEGMENTS':      'native',
        '#EXT-X-PART':                      'native',
        '#EXT-X-PART-INF':                  'native',
        '#EXT-X-RENDITION-REPORT':          'native',
        '#EXT-X-PRELOAD-HINT':              'native',
        '#EXT-X-SKIP':                      'native',
        '#EXT-X-CMAF':                      'no',
        '#EXT-X-APE':                       'no',
        '#EXT-X-SYS':                       'no',
    },
    'OTT-Navigator': {
        '#EXTM3U':                          'native',
        '#EXT-X-VERSION':                   'native',
        '#EXTINF':                          'native',
        '#EXT-X-STREAM-INF':                'native',
        '#EXT-X-MEDIA':                     'partial',
        '#EXTHTTP':                         'native',
        '#EXTVLCOPT':                       'no',
        '#KODIPROP':                        'partial',
        '#EXT-X-KEY':                       'native',
        '#EXT-X-DISCONTINUITY':             'native',
        '#EXT-X-DATERANGE':                 'no',
        '#EXT-X-DEFINE':                    'no',
        '#EXT-X-CONTENT-STEERING':          'no',
        '#EXT-X-PROGRAM-DATE-TIME':         'native',
        '#EXT-X-MAP':                       'native',
        '#EXT-X-START':                     'native',
        '#EXT-X-INDEPENDENT-SEGMENTS':      'native',
        '#EXT-X-CMAF':                      'no',
        '#EXT-X-APE':                       'no',
        '#EXT-X-SYS':                       'no',
    },
    'GSE-Smart-IPTV': {
        '#EXTM3U':                          'native',
        '#EXT-X-VERSION':                   'native',
        '#EXTINF':                          'native',
        '#EXT-X-STREAM-INF':                'native',
        '#EXT-X-MEDIA':                     'no',
        '#EXTHTTP':                         'native',
        '#EXTVLCOPT':                       'partial',
        '#KODIPROP':                        'no',
        '#EXT-X-KEY':                       'partial',
        '#EXT-X-DISCONTINUITY':             'partial',
        '#EXT-X-DATERANGE':                 'no',
        '#EXT-X-DEFINE':                    'no',
        '#EXT-X-CONTENT-STEERING':          'no',
        '#EXT-X-PROGRAM-DATE-TIME':         'partial',
        '#EXT-X-MAP':                       'no',
        '#EXT-X-START':                     'no',
        '#EXT-X-INDEPENDENT-SEGMENTS':      'no',
        '#EXT-X-CMAF':                      'no',
        '#EXT-X-APE':                       'no',
        '#EXT-X-SYS':                       'no',
    },
    'IPTV-Smarters-Pro': {
        '#EXTM3U':                          'native',
        '#EXT-X-VERSION':                   'native',
        '#EXTINF':                          'native',
        '#EXT-X-STREAM-INF':                'native',
        '#EXT-X-MEDIA':                     'partial',
        '#EXTHTTP':                         'native',
        '#EXTVLCOPT':                       'no',
        '#KODIPROP':                        'no',
        '#EXT-X-KEY':                       'native',
        '#EXT-X-DISCONTINUITY':             'native',
        '#EXT-X-DATERANGE':                 'no',
        '#EXT-X-DEFINE':                    'no',
        '#EXT-X-CONTENT-STEERING':          'no',
        '#EXT-X-PROGRAM-DATE-TIME':         'native',
        '#EXT-X-MAP':                       'native',
        '#EXT-X-START':                     'partial',
        '#EXT-X-INDEPENDENT-SEGMENTS':      'native',
        '#EXT-X-CMAF':                      'no',
        '#EXT-X-APE':                       'no',
        '#EXT-X-SYS':                       'no',
    },
}

LEVEL_SCORE = {'native': 3, 'partial': 1, 'no': 0, 'problematic': -1}


def normalize_tag(line):
    """Extrae el tag base (#EXT-X-FOO) de una línea."""
    if not line.startswith('#EXT'):
        return None
    # Strip params after :
    base = line.split(':', 1)[0]
    # Group propietarios bajo prefijos comunes
    if base.startswith('#EXT-X-CMAF'):
        return '#EXT-X-CMAF'
    if base.startswith('#EXT-X-APE'):
        return '#EXT-X-APE'
    if base.startswith('#EXT-X-SYS'):
        return '#EXT-X-SYS'
    return base


def score_player(tag_counts, player_name, matrix):
    """Calcula score para un player dado."""
    total_emitted = sum(tag_counts.values())
    score = 0
    max_score = 0
    breakdown = {'native': 0, 'partial': 0, 'no': 0, 'problematic': 0, 'unknown': 0}
    waste = []  # tags emitidos que el player ignora

    for tag, count in tag_counts.items():
        if tag in matrix:
            level = matrix[tag]
        else:
            # Default: si NO está en matriz, probablemente lo ignora (excepto extensiones X-)
            level = 'no' if tag.startswith('#EXT') else 'unknown'

        breakdown[level] = breakdown.get(level, 0) + count
        score += LEVEL_SCORE.get(level, 0) * count
        max_score += LEVEL_SCORE['native'] * count

        if level in ('no', 'problematic') and count > 100:
            waste.append((tag, count, level))

    pct = (score / max_score * 100) if max_score > 0 else 0
    waste.sort(key=lambda x: -x[1])  # Sort by count desc

    return {
        'player': player_name,
        'pct_compliance': round(pct, 1),
        'score': score,
        'max_score': max_score,
        'tag_breakdown': breakdown,
        'top_5_wasted': waste[:5],
    }


def analyze(path: Path) -> dict:
    tag_counts = Counter()
    with path.open('r', encoding='utf-8', errors='replace') as fh:
        for line in fh:
            tag = normalize_tag(line.rstrip('\r\n'))
            if tag:
                tag_counts[tag] += 1

    report = {
        'path': str(path),
        'total_lines_with_tags': sum(tag_counts.values()),
        'unique_tag_types': len(tag_counts),
        'top_10_tags': dict(tag_counts.most_common(10)),
        'players': {},
    }

    for player_name, matrix in PLAYER_MATRIX.items():
        report['players'][player_name] = score_player(tag_counts, player_name, matrix)

    # Average compliance across all players
    avg = sum(p['pct_compliance'] for p in report['players'].values()) / len(report['players'])
    report['avg_pct_compliance'] = round(avg, 1)
    return report


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        sys.exit(1)
    inp = Path(argv[1])
    if not inp.exists():
        print(f'ERROR: {inp} no existe')
        sys.exit(1)
    out = None
    if '--out' in argv:
        out = Path(argv[argv.index('--out') + 1])

    report = analyze(inp)

    print(f"=== Compatibility Scorecard — {inp.name} ===")
    print(f"Total lines with tags: {report['total_lines_with_tags']:,}")
    print(f"Unique tag types: {report['unique_tag_types']}")
    print(f"Avg compliance: {report['avg_pct_compliance']}%")
    print()
    print(f"{'Player':<22}{'Score':>8}{'Native':>10}{'Partial':>10}{'Ignored':>10}")
    print("-" * 60)
    for pname, pdata in sorted(report['players'].items(), key=lambda x: -x[1]['pct_compliance']):
        bd = pdata['tag_breakdown']
        print(f"{pname:<22}{pdata['pct_compliance']:>7}%{bd['native']:>10}{bd['partial']:>10}{bd['no']:>10}")

    print()
    print("=== Top 5 tags wasted (count) by lowest-compliance player ===")
    worst = min(report['players'].items(), key=lambda x: x[1]['pct_compliance'])
    print(f"Worst: {worst[0]} ({worst[1]['pct_compliance']}%)")
    for tag, count, level in worst[1]['top_5_wasted']:
        print(f"  {tag:<35} {count:>10,} ({level})")

    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(f"\nReport saved to {out}")


if __name__ == '__main__':
    main(sys.argv)
