#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
import re
import time
from pathlib import Path
from typing import List
from urllib.parse import parse_qsl, urlparse

import requests


HLS_CONTENT_TYPES = {
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'application/mpegurl',
    'audio/mpegurl',
    'audio/x-mpegurl',
}

# Etapa 4 del plan "Integración sin /resolve/" — MIME role table
# Alineado 1:1 con frontend/js/ape-v9/mime-policy.js y prepublish_checker.py
MIME_ROLE_TABLE = {
    'application/vnd.apple.mpegurl': 'playlist_hls',
    'application/x-mpegurl':         'playlist_hls',
    'application/dash+xml':          'playlist_dash',
    'video/mp2t':                    'segment_ts',
    'video/iso.segment':             'segment_cmaf',
    'application/mp4':               'segment_cmaf',
    'audio/aac':                     'audio_track',
    'audio/mp4':                     'audio_track',
    'text/vtt':                      'subtitle',
    'application/ttml+xml':          'subtitle',
}

STREAM_INF_RE = re.compile(r'^#EXT-X-STREAM-INF:', re.I)
# Plan Supremo — marca de bucket emitida por generateChannelEntry
PUB_TIER_RE = re.compile(r'^#EXT-X-APE:.*\bPUBLICATION-TIER=([ABC])\b', re.I)


def normalize_ct(value: str) -> str:
    return str(value or '').split(';')[0].strip().lower()


def role_from_url(url: str) -> str:
    """Infiere el rol esperado a partir de la extensión de la URL."""
    path = str(url or '').lower().split('?')[0]
    if path.endswith('.m3u8'): return 'playlist_hls'
    if path.endswith('.mpd'):  return 'playlist_dash'
    if path.endswith('.ts'):   return 'segment_ts'
    if path.endswith('.m4s') or path.endswith('.mp4'): return 'segment_cmaf'
    return 'unknown'


def mime_matches_url_role(content_type: str, url: str) -> bool:
    """True si Content-Type real matchea el rol esperado por la extensión."""
    expected = role_from_url(url)
    if expected == 'unknown':
        return False
    ct_norm = normalize_ct(content_type)
    actual_role = MIME_ROLE_TABLE.get(ct_norm)
    return actual_role == expected


def is_canonical_url(url: str) -> bool:
    """True si el query string está con keys ordenadas alfabéticamente (idempotencia)."""
    try:
        q = urlparse(str(url or '')).query
        if not q:
            return True
        pairs = parse_qsl(q, keep_blank_values=True)
        keys = [k for k, _ in pairs]
        return keys == sorted(keys)
    except Exception:
        return False


def extract_urls(text: str) -> List[str]:
    urls = []
    lines = text.splitlines()
    for idx, line in enumerate(lines[:-1]):
        if STREAM_INF_RE.match(line.strip()):
            candidate = lines[idx + 1].strip()
            if candidate and not candidate.startswith('#'):
                urls.append(candidate)
    return urls


def count_publication_tiers(text: str) -> dict:
    """Cuenta canales por bucket A/B/C escaneando marcas #EXT-X-APE:PUBLICATION-TIER=X."""
    counts = {'A': 0, 'B': 0, 'C': 0}
    for line in text.splitlines():
        m = PUB_TIER_RE.match(line.strip())
        if m:
            tier = m.group(1).upper()
            if tier in counts:
                counts[tier] += 1
    return counts


def probe(session: requests.Session, url: str, timeout: int) -> dict:
    try:
        response = session.get(url, timeout=timeout, allow_redirects=True, stream=True)
        status = response.status_code
        content_type = response.headers.get('Content-Type', '')
        final_url = response.url
        response.close()
        return {'url': url, 'status': status, 'content_type': content_type, 'final_url': final_url}
    except requests.RequestException as exc:
        return {'url': url, 'status': 0, 'content_type': '', 'final_url': '', 'error': str(exc)}


DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebAppManager',
    'Referer': 'https://www.netflix.com/',
    'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
    'Connection': 'keep-alive',
}


def run_gate(m3u8_text: str, sample_size: int = 300, timeout: int = 15,
             min_ok200: float = 0.99, max_405: int = 0, min_hls: float = 0.90,
             max_407_ratio: float = 0.01,
             min_mime_match: float = 1.0,
             min_hls_predominance: float = 0.90,
             min_canonical: float = 1.0) -> dict:
    urls = extract_urls(m3u8_text)
    if not urls:
        return {
            'error': 'no_stream_inf_urls',
            'sample_size': 0,
            'total_urls': 0,
            'published': False,
            'decision': 'block',
            'decision_reasons': ['no_stream_inf_urls'],
            'checked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }

    # Canonicalization ratio — calculado sobre TODAS las URLs emitidas, no solo el sample
    canonical_violations = []
    canonical_ok = 0
    for u in urls:
        if is_canonical_url(u):
            canonical_ok += 1
        elif len(canonical_violations) < 10:
            canonical_violations.append({'url': u, 'issue': 'keys_unsorted'})
    canonical_ratio = canonical_ok / len(urls)

    # Plan Supremo — tier_A_ratio / tier_B_ratio / tier_C_ratio
    tier_counts = count_publication_tiers(m3u8_text)
    tier_total = sum(tier_counts.values())
    tier_A_ratio = (tier_counts['A'] / tier_total) if tier_total else 0.0
    tier_B_ratio = (tier_counts['B'] / tier_total) if tier_total else 0.0
    tier_C_ratio = (tier_counts['C'] / tier_total) if tier_total else 0.0

    sample = urls if len(urls) <= sample_size else random.sample(urls, sample_size)
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    results = [probe(session, url, timeout) for url in sample]
    session.close()

    size = len(results)
    ok200 = sum(1 for row in results if row['status'] == 200) / size
    bad405 = sum(1 for row in results if row['status'] == 405)
    bad407 = sum(1 for row in results if row['status'] == 407)
    bad407_ratio = bad407 / size
    hls_ratio = sum(1 for row in results if normalize_ct(row['content_type']) in HLS_CONTENT_TYPES) / size

    # Etapa 4: nuevos ratios
    # mime_match_ratio: sobre URLs con status 200, cuántas tienen Content-Type acorde a extensión
    ok200_rows = [r for r in results if r['status'] == 200]
    mime_match_count = sum(1 for r in ok200_rows if mime_matches_url_role(r['content_type'], r['url']))
    mime_match_ratio = (mime_match_count / len(ok200_rows)) if ok200_rows else 0.0

    # hls_predominance_ratio: % de URLs del sample que terminan en .m3u8 Y responden con MIME HLS
    hls_predominance_count = 0
    for r in results:
        url_path = str(r['url'] or '').lower().split('?')[0]
        if url_path.endswith('.m3u8') and normalize_ct(r['content_type']) in HLS_CONTENT_TYPES:
            hls_predominance_count += 1
    hls_predominance_ratio = hls_predominance_count / size

    # Decision logic (doctrina del .md "Criterios de aceptación")
    decision_reasons = []
    # BLOCK tier — hard stops
    block_triggers = []
    if bad405 > max_405:
        block_triggers.append(f'bad405_count={bad405}>max_405={max_405}')
    if mime_match_ratio < min_mime_match:
        block_triggers.append(f'mime_match_ratio={mime_match_ratio:.4f}<min_mime_match={min_mime_match}')
    if canonical_ratio < min_canonical:
        block_triggers.append(f'canonical_ratio={canonical_ratio:.4f}<min_canonical={min_canonical}')

    # PUBLISH tier — soft criteria
    publish_failures = []
    if ok200 < min_ok200:
        publish_failures.append(f'ok200_ratio={ok200:.4f}<min_ok200={min_ok200}')
    if bad407_ratio > max_407_ratio:
        publish_failures.append(f'bad407_ratio={bad407_ratio:.4f}>max_407_ratio={max_407_ratio}')
    if hls_ratio < min_hls:
        publish_failures.append(f'hls_ratio={hls_ratio:.4f}<min_hls={min_hls}')
    if hls_predominance_ratio < min_hls_predominance:
        publish_failures.append(f'hls_predominance_ratio={hls_predominance_ratio:.4f}<min_hls_predominance={min_hls_predominance}')

    if block_triggers:
        decision = 'block'
        decision_reasons = block_triggers
    elif publish_failures:
        decision = 'reclassify'
        decision_reasons = publish_failures + ['all_critical_met_but_soft_failures']
    else:
        decision = 'publish'
        decision_reasons = ['all_thresholds_met']

    # Backward compat: `published` True solo si decision == 'publish'
    thresholds_met = (decision == 'publish')

    return {
        'total_urls': len(urls),
        'sample_size': size,
        'ok200_ratio': round(ok200, 6),
        'bad405_count': bad405,
        'bad407_count': bad407,
        'bad407_ratio': round(bad407_ratio, 6),
        'hls_ratio': round(hls_ratio, 6),
        'mime_match_count': mime_match_count,
        'mime_match_ratio': round(mime_match_ratio, 6),
        'hls_predominance_ratio': round(hls_predominance_ratio, 6),
        'canonical_ratio': round(canonical_ratio, 6),
        'canonical_violations': canonical_violations,
        'tier_counts': tier_counts,
        'tier_A_ratio': round(tier_A_ratio, 6),
        'tier_B_ratio': round(tier_B_ratio, 6),
        'tier_C_ratio': round(tier_C_ratio, 6),
        'thresholds': {
            'min_ok200': min_ok200,
            'max_405': max_405,
            'max_407_ratio': max_407_ratio,
            'min_hls': min_hls,
            'min_mime_match': min_mime_match,
            'min_hls_predominance': min_hls_predominance,
            'min_canonical': min_canonical,
        },
        'published': thresholds_met,
        'decision': decision,
        'decision_reasons': decision_reasons,
        'checked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'results': results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Gate de publicación post-emisión para listas M3U8')
    parser.add_argument('--input', required=True, help='Lista emitida .m3u8')
    parser.add_argument('--sample-size', type=int, default=300)
    parser.add_argument('--timeout', type=int, default=15)
    parser.add_argument('--min-ok200', type=float, default=0.99)
    parser.add_argument('--max-405', type=int, default=0)
    parser.add_argument('--max-407-ratio', type=float, default=0.01)
    parser.add_argument('--min-hls', type=float, default=0.90)
    parser.add_argument('--min-mime-match', type=float, default=1.0,
                        help='Etapa 4: umbral de match MIME-declarado vs MIME-real (default 1.0 = 100%)')
    parser.add_argument('--min-hls-predominance', type=float, default=0.90,
                        help='Etapa 4: umbral de predominio HLS (URLs .m3u8 que responden HLS real)')
    parser.add_argument('--min-canonical', type=float, default=1.0,
                        help='Etapa 4: umbral de URLs canónicas (keys de query ordenadas alfabéticamente)')
    parser.add_argument('--out', required=True)
    parser.add_argument('--strict', action='store_true',
                        help='Si se especifica, exitcode=1 cuando decision != publish. Por defecto: report-only.')
    args = parser.parse_args()

    text = Path(args.input).read_text(encoding='utf-8', errors='replace')
    verdict = run_gate(
        text,
        sample_size=args.sample_size,
        timeout=args.timeout,
        min_ok200=args.min_ok200,
        max_405=args.max_405,
        min_hls=args.min_hls,
        max_407_ratio=args.max_407_ratio,
        min_mime_match=args.min_mime_match,
        min_hls_predominance=args.min_hls_predominance,
        min_canonical=args.min_canonical,
    )

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(verdict, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    summary_keys = ['total_urls', 'sample_size', 'ok200_ratio', 'bad405_count',
                    'bad407_count', 'bad407_ratio', 'hls_ratio',
                    'mime_match_ratio', 'hls_predominance_ratio', 'canonical_ratio',
                    'tier_A_ratio', 'tier_B_ratio', 'tier_C_ratio',
                    'decision', 'published']
    print(json.dumps({k: verdict.get(k) for k in summary_keys}, ensure_ascii=False))

    if args.strict and not verdict.get('published', False):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
