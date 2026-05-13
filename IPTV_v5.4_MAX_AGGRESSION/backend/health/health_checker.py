#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from urllib.parse import urlparse

import requests


HLS_CONTENT_TYPES = {
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'application/mpegurl',
    'audio/mpegurl',
    'audio/x-mpegurl',
}


def load_json(path: Path):
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write('\n')


def normalize_ct(value: str) -> str:
    return str(value or '').split(';')[0].strip().lower()


def is_hls_ct(value: str) -> bool:
    return normalize_ct(value) in HLS_CONTENT_TYPES


def probe_once(session: requests.Session, url: str, timeout: int, headers: dict) -> dict:
    start = time.perf_counter()
    try:
        response = session.get(url, timeout=timeout, headers=headers, allow_redirects=True, stream=True)
        latency_ms = int((time.perf_counter() - start) * 1000)
        content_type = response.headers.get('Content-Type', '')
        final_url = response.url
        status = response.status_code
        try:
            response.close()
        except Exception:
            pass
        return {
            'status': status,
            'url': url,
            'final_url': final_url,
            'final_host': urlparse(final_url).hostname or '',
            'content_type': content_type,
            'latency_ms': latency_ms,
            'error': ''
        }
    except requests.RequestException as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {
            'status': 0,
            'url': url,
            'final_url': '',
            'final_host': '',
            'content_type': '',
            'latency_ms': latency_ms,
            'error': str(exc)
        }


def probe_with_saturation_retry(session: requests.Session, url: str, timeout: int, headers: dict) -> dict:
    result = probe_once(session, url, timeout, headers)
    if result['status'] == 503:
        time.sleep(2 + random.random() * 3)
        result = probe_once(session, url, timeout, headers)
    return result


def build_candidates(cfg: dict, catalog_dir: Path) -> List[dict]:
    tivi_catalog = load_json(catalog_dir / 'tivi_catalog.json')
    kytv_catalog = load_json(catalog_dir / 'kytv_hls_catalog.json')
    tivi_base = cfg['tivi']['base_url'].rstrip('/')
    tivi_user = cfg['tivi']['username']
    tivi_pass = cfg['tivi']['password']
    kytv_base = cfg['kytv']['base_url'].rstrip('/')
    kytv_user = cfg['kytv']['username']
    kytv_pass = cfg['kytv']['password']

    candidates = []
    seen = set()
    for row in tivi_catalog:
        sid = str(row['stream_id'])
        url = f"{tivi_base}/live/{tivi_user}/{tivi_pass}/{sid}.m3u8"
        key = ('tivi-ott', sid, url)
        if key in seen:
            continue
        seen.add(key)
        candidates.append({'stream_id': sid, 'name': row.get('name', ''), 'source': 'tivi-ott', 'url': url})

    for row in kytv_catalog:
        sid = str(row['stream_id'])
        url = row.get('url') or f"{kytv_base}/{kytv_user}/{kytv_pass}/{sid}.m3u8"
        key = ('ky-tv-hls', sid, url)
        if key in seen:
            continue
        seen.add(key)
        candidates.append({'stream_id': sid, 'name': row.get('name', ''), 'source': 'ky-tv-hls', 'url': url})

    return candidates


def init_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS probes (
            stream_id TEXT,
            source TEXT,
            url TEXT PRIMARY KEY,
            status INTEGER,
            final_url TEXT,
            final_host TEXT,
            content_type TEXT,
            latency_ms INTEGER,
            checked_at TEXT,
            error TEXT
        )
        '''
    )
    conn.commit()
    return conn


def persist_probe(conn: sqlite3.Connection, row: dict) -> None:
    conn.execute(
        '''
        INSERT INTO probes (stream_id, source, url, status, final_url, final_host, content_type, latency_ms, checked_at, error)
        VALUES (:stream_id, :source, :url, :status, :final_url, :final_host, :content_type, :latency_ms, :checked_at, :error)
        ON CONFLICT(url) DO UPDATE SET
            status=excluded.status,
            final_url=excluded.final_url,
            final_host=excluded.final_host,
            content_type=excluded.content_type,
            latency_ms=excluded.latency_ms,
            checked_at=excluded.checked_at,
            error=excluded.error
        ''',
        row,
    )


def choose_best(entries: List[dict], prefer_host_order: List[str]) -> dict | None:
    if not entries:
        return None
    preference = {host: index for index, host in enumerate(prefer_host_order)}
    def sort_key(entry):
        host_rank = preference.get(entry.get('host', ''), 999)
        latency = entry.get('latency_ms', 999999)
        return (host_rank, latency)
    return sorted(entries, key=sort_key)[0]


def main() -> None:
    parser = argparse.ArgumentParser(description='Health-check HLS y generación de admitted.json')
    parser.add_argument('--config', required=True)
    parser.add_argument('--catalog-dir', required=True)
    parser.add_argument('--out-dir', required=True)
    parser.add_argument('--db', required=True)
    args = parser.parse_args()

    cfg = load_json(Path(args.config))
    catalog_dir = Path(args.catalog_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    conn = init_db(Path(args.db))

    headers = cfg.get('headers', {})
    timeout = int(cfg.get('timeouts', {}).get('probe', 15))
    max_workers = int(cfg.get('concurrency', {}).get('global', 8))
    prefer_host_order = cfg.get('publication', {}).get('prefer_host_order', ['line.tivi-ott.net', 'ky-tv.cc'])

    candidates = build_candidates(cfg, catalog_dir)
    session = requests.Session()

    report_rows: List[dict] = []
    admitted_pool: Dict[str, List[dict]] = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(probe_with_saturation_retry, session, item['url'], timeout, headers): item
            for item in candidates
        }
        for future in as_completed(future_map):
            item = future_map[future]
            result = future.result()
            row = {
                'stream_id': item['stream_id'],
                'name': item.get('name', ''),
                'source': item['source'],
                'url': item['url'],
                'status': result['status'],
                'final_url': result['final_url'],
                'final_host': result['final_host'],
                'content_type': result['content_type'],
                'latency_ms': result['latency_ms'],
                'checked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'error': result['error'],
            }
            report_rows.append(row)
            persist_probe(conn, row)
            if row['status'] == 200 and is_hls_ct(row['content_type']):
                host = urlparse(row['final_url'] or row['url']).hostname or urlparse(row['url']).hostname or ''
                admitted_pool.setdefault(row['stream_id'], []).append({
                    'stream_id': row['stream_id'],
                    'name': row['name'],
                    'host': host,
                    'url': row['final_url'] or row['url'],
                    'content_type': row['content_type'],
                    'latency_ms': row['latency_ms'],
                    'source': row['source'],
                    'checked_at': row['checked_at'],
                })

    conn.commit()
    conn.close()
    session.close()

    admitted = {}
    for stream_id, entries in admitted_pool.items():
        best = choose_best(entries, prefer_host_order)
        if best:
            admitted[str(stream_id)] = best

    summary = {
        'candidates': len(candidates),
        'report_rows': len(report_rows),
        'admitted': len(admitted),
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }

    write_json(out_dir / 'health_report.json', report_rows)
    write_json(out_dir / 'admitted.json', admitted)
    write_json(out_dir / 'health_summary.json', summary)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
