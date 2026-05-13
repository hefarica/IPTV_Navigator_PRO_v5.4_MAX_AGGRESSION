#!/usr/bin/env python3
import csv
import json
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import requests

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    'Accept': '*/*',
    'Referer': 'https://www.netflix.com/'
}
TIMEOUT = (5, 12)
DEFAULT_WORKERS = 24


def classify(row):
    fs = str(row.get('final_status') or '')
    vs = str(row.get('visible_status') or '')
    ct = (row.get('final_content_type') or '').lower()
    body = (row.get('body_snippet') or '')
    redirects = int(row.get('redirect_count') or 0)
    if fs == '200' and ('mpegurl' in ct or '#EXTM3U' in body):
        return 'redirect_transition_hls' if redirects > 0 or vs.startswith('30') else 'direct_hls_200'
    if fs == '509' or vs == '509':
        return 'bandwidth_509'
    if fs == '503' or vs == '503':
        return 'origin_503'
    if fs == '407' or vs == '407':
        return 'subscription_407'
    if fs == '404' or vs == '404':
        return 'dead_404'
    if fs.startswith('30') or vs.startswith('30'):
        return 'redirect_non_hls'
    if not fs:
        return 'error'
    return f'other_{fs}'


def fetch(url):
    out = {
        'url': url,
        'visible_status': '',
        'final_status': '',
        'visible_content_type': '',
        'final_content_type': '',
        'redirect_count': 0,
        'final_url': '',
        'final_host': '',
        'elapsed_ms': '',
        'body_snippet': '',
        'error': ''
    }
    t0 = time.time()

    try:
        r0 = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=False, stream=True)
        out['visible_status'] = str(r0.status_code)
        out['visible_content_type'] = r0.headers.get('Content-Type', '')
        r0.close()
    except Exception as e:
        out['error'] = f'visible:{type(e).__name__}'

    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True, stream=True)
        out['final_status'] = str(r.status_code)
        out['final_content_type'] = r.headers.get('Content-Type', '')
        out['redirect_count'] = len(r.history)
        out['final_url'] = r.url
        try:
            out['final_host'] = (urlparse(r.url).netloc or '').lower()
        except Exception:
            out['final_host'] = ''
        try:
            chunk = next(r.iter_content(chunk_size=512, decode_unicode=True), '')
            out['body_snippet'] = (chunk or '')[:200].replace('\n', ' ').replace('\r', ' ')
        except Exception:
            pass
        r.close()
    except Exception as e:
        out['error'] += ('|' if out['error'] else '') + f'final:{type(e).__name__}'

    out['elapsed_ms'] = round((time.time() - t0) * 1000, 1)
    out['classification'] = classify(out)
    return out


def main():
    if len(sys.argv) < 3:
        raise SystemExit('Usage: probe_urls.py <unique_urls.csv> <output_dir> [max_workers]')

    input_csv = Path(sys.argv[1])
    root = Path(sys.argv[2])
    max_workers = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_WORKERS
    root.mkdir(parents=True, exist_ok=True)

    urls = []
    with input_csv.open('r', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            urls.append(row['url'])

    rows = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(fetch, url): url for url in urls}
        for i, fut in enumerate(as_completed(futures), 1):
            rows.append(fut.result())
            if i % 250 == 0:
                print(f'completed={i}/{len(urls)}', flush=True)

    rows.sort(key=lambda r: r['url'])

    out_csv = root / 'probe_results.csv'
    out_json = root / 'probe_summary.json'
    with out_csv.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    summary = {
        'urls_probed': len(rows),
        'classification_counts': dict(Counter(r['classification'] for r in rows)),
        'visible_status_counts': dict(Counter(r['visible_status'] for r in rows)),
        'final_status_counts': dict(Counter(r['final_status'] for r in rows)),
        'top_final_hosts': dict(Counter(r['final_host'] for r in rows if r['final_host']).most_common(20))
    }
    out_json.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
