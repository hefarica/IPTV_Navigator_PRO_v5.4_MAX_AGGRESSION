#!/usr/bin/env python3
"""
playability_probe.py — Sample N URLs de la lista M3U8 y verifica conectividad.

Para cada URL probada:
  - HEAD/GET request con UA del manifest (Web0S Chrome 119)
  - Mide TTFB
  - Reporta status (200/302/403/404/timeout/error)
  - Agrupa por host upstream (tivigo.cc / line.tivi-ott.net / x1megaott)

Sample por defecto: 50 canales aleatorios (suficiente para estadística estable).

Usage:
    python playability_probe.py <ruta.m3u8> [--sample 50] [--timeout 8] [--out report.json]

Notas:
  - NO descarga el manifest completo, solo HEAD o primeros bytes
  - Respeta el UA del manifest (cliente real)
  - Concurrencia limitada para no levantar rate-limit del provider
"""
import json
import random
import re
import sys
import time
import urllib.request
import urllib.error
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse


DEFAULT_UA = ('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager')
DEFAULT_REFERER = 'https://www.netflix.com/'
DEFAULT_TIMEOUT = 8
DEFAULT_SAMPLE = 50
DEFAULT_CONCURRENCY = 6  # Conservador para no levantar rate-limit


def extract_urls(path: Path):
    """Extrae todas las URLs (líneas que empiezan con http/https) del manifest."""
    urls = []
    with path.open('r', encoding='utf-8', errors='replace') as fh:
        for line in fh:
            line = line.strip()
            if line.startswith('http://') or line.startswith('https://'):
                urls.append(line)
    return urls


def probe_url(url, ua, referer, timeout):
    """HEAD request a la URL. Retorna dict con status + ttfb."""
    result = {
        'url': url,
        'host': urlparse(url).hostname,
        'status': None,
        'ttfb_ms': None,
        'error': None,
        'redirected_to': None,
        'content_type': None,
    }
    headers = {
        'User-Agent': ua,
        'Referer': referer,
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate',
    }
    try:
        req = urllib.request.Request(url, headers=headers, method='HEAD')
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result['ttfb_ms'] = round((time.perf_counter() - t0) * 1000, 1)
            result['status'] = resp.status
            result['content_type'] = resp.headers.get('Content-Type', '')
            if resp.url != url:
                result['redirected_to'] = resp.url
    except urllib.error.HTTPError as e:
        result['status'] = e.code
        result['error'] = f'HTTP {e.code} {e.reason}'
        result['ttfb_ms'] = round((time.perf_counter() - t0) * 1000, 1)
    except urllib.error.URLError as e:
        result['error'] = f'URLError: {e.reason}'
    except (TimeoutError, OSError) as e:
        result['error'] = f'timeout/socket: {e}'
    except Exception as e:
        result['error'] = f'{type(e).__name__}: {e}'
    return result


def categorize(result):
    """Clasifica el result en bucket."""
    s = result['status']
    if s and 200 <= s < 300:
        return 'OK'
    if s and 300 <= s < 400:
        return 'REDIRECT'
    if s == 403:
        return 'BLOCKED-403'
    if s == 404:
        return 'NOTFOUND-404'
    if s == 429:
        return 'RATELIMIT-429'
    if s and 400 <= s < 500:
        return f'CLIENT-{s}'
    if s and 500 <= s < 600:
        return 'SERVER-5xx'
    if result['error'] and 'timeout' in result['error'].lower():
        return 'TIMEOUT'
    if result['error']:
        return 'ERROR'
    return 'UNKNOWN'


def probe_sample(urls, sample_size, ua, referer, timeout, concurrency):
    """Probe random sample con thread pool."""
    if sample_size > len(urls):
        sample_size = len(urls)
    sample = random.sample(urls, sample_size) if sample_size < len(urls) else list(urls)
    results = []
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        futures = {ex.submit(probe_url, u, ua, referer, timeout): u for u in sample}
        for fut in as_completed(futures):
            try:
                results.append(fut.result())
            except Exception as e:
                results.append({'url': futures[fut], 'error': str(e), 'status': None})
    return results


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        sys.exit(1)
    inp = Path(argv[1])
    if not inp.exists():
        print(f'ERROR: {inp} no existe')
        sys.exit(1)

    sample_size = DEFAULT_SAMPLE
    timeout = DEFAULT_TIMEOUT
    concurrency = DEFAULT_CONCURRENCY
    out = None
    ua = DEFAULT_UA

    if '--sample' in argv:
        sample_size = int(argv[argv.index('--sample') + 1])
    if '--timeout' in argv:
        timeout = int(argv[argv.index('--timeout') + 1])
    if '--concurrency' in argv:
        concurrency = int(argv[argv.index('--concurrency') + 1])
    if '--out' in argv:
        out = Path(argv[argv.index('--out') + 1])
    if '--ua' in argv:
        ua = argv[argv.index('--ua') + 1]

    print(f"=== Playability Probe — {inp.name} ===")
    print(f"Extracting URLs...")
    urls = extract_urls(inp)
    print(f"Total URLs in manifest: {len(urls):,}")
    print(f"Sample size: {sample_size} | Timeout: {timeout}s | Concurrency: {concurrency}")
    print(f"UA: {ua[:60]}...")
    print()
    print("Probing...")
    t_start = time.perf_counter()
    results = probe_sample(urls, sample_size, ua, DEFAULT_REFERER, timeout, concurrency)
    elapsed = time.perf_counter() - t_start

    # Categorize
    categories = Counter()
    by_host = defaultdict(lambda: Counter())
    ttfb_ok = []
    errors = []
    for r in results:
        cat = categorize(r)
        categories[cat] += 1
        by_host[r.get('host') or 'unknown'][cat] += 1
        if cat == 'OK' and r.get('ttfb_ms'):
            ttfb_ok.append(r['ttfb_ms'])
        if cat not in ('OK', 'REDIRECT'):
            errors.append({'url': r['url'][:120], 'cat': cat,
                          'status': r.get('status'), 'error': r.get('error')})

    n = len(results)
    pct_playable = (categories.get('OK', 0) + categories.get('REDIRECT', 0)) / n * 100 if n else 0
    p50 = sorted(ttfb_ok)[len(ttfb_ok)//2] if ttfb_ok else None
    p95 = sorted(ttfb_ok)[int(len(ttfb_ok)*0.95)] if len(ttfb_ok) >= 5 else None

    print(f"\n=== Results ({n} probes in {elapsed:.1f}s) ===")
    print(f"{'Category':<20}{'Count':>8}{'%':>8}")
    print("-" * 36)
    for cat, count in categories.most_common():
        pct = count / n * 100
        print(f"{cat:<20}{count:>8}{pct:>7.1f}%")
    print()
    print(f"Playable rate: {pct_playable:.1f}%")
    if ttfb_ok:
        print(f"TTFB (OK only): p50={p50}ms p95={p95}ms")
    print()

    print("=== Per-host breakdown ===")
    print(f"{'Host':<35}{'Total':>8}{'OK':>6}{'403':>6}{'TIMEOUT':>9}")
    print("-" * 64)
    for host, cats in sorted(by_host.items(), key=lambda x: -sum(x[1].values())):
        total = sum(cats.values())
        ok = cats.get('OK', 0) + cats.get('REDIRECT', 0)
        blocked = cats.get('BLOCKED-403', 0)
        timeout_ = cats.get('TIMEOUT', 0)
        print(f"{host[:34]:<35}{total:>8}{ok:>6}{blocked:>6}{timeout_:>9}")

    if errors:
        print(f"\n=== First 5 errors ===")
        for e in errors[:5]:
            print(f"  [{e['cat']:<14}] {e['url']}")

    report = {
        'manifest': str(inp),
        'total_urls': len(urls),
        'sample_size': n,
        'elapsed_sec': round(elapsed, 1),
        'pct_playable': round(pct_playable, 1),
        'categories': dict(categories),
        'ttfb_ok_p50_ms': p50,
        'ttfb_ok_p95_ms': p95,
        'by_host': {h: dict(c) for h, c in by_host.items()},
        'errors_sample': errors[:20],
    }

    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(f"\nReport saved to {out}")

    # Exit code based on playability
    if pct_playable >= 90:
        sys.exit(0)
    if pct_playable >= 70:
        sys.exit(1)
    sys.exit(2)


if __name__ == '__main__':
    main(sys.argv)
