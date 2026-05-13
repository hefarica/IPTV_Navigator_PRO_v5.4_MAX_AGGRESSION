#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List

import requests


M3U_ID_RE = re.compile(r'/([^/]+)/([^/]+)/(?P<stream_id>\d+)\.m3u8(?:\?|$)', re.I)


def load_config(path: Path) -> dict:
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)


def fetch_json(url: str, timeout: int = 20, headers: dict | None = None):
    response = requests.get(url, timeout=timeout, headers=headers or {})
    response.raise_for_status()
    return response.json()


def fetch_text(url: str, timeout: int = 40, headers: dict | None = None) -> str:
    response = requests.get(url, timeout=timeout, headers=headers or {})
    response.raise_for_status()
    return response.text


def refresh_tivi_catalog(cfg: dict) -> List[dict]:
    url = cfg['tivi']['player_api_url']
    payload = fetch_json(url, timeout=cfg.get('timeouts', {}).get('api', 20), headers=cfg.get('headers'))
    items = []
    for row in payload:
        stream_id = row.get('stream_id')
        if stream_id is None:
            continue
        items.append({
            'stream_id': str(stream_id),
            'name': row.get('name', ''),
            'source': 'tivi-ott',
            'category_id': row.get('category_id'),
            'tv_archive': row.get('tv_archive'),
        })
    return items


def refresh_kytv_catalog(cfg: dict) -> List[dict]:
    url = cfg['kytv']['playlist_hls_url']
    text = fetch_text(url, timeout=cfg.get('timeouts', {}).get('playlist', 40), headers=cfg.get('headers'))
    items = []
    current_name = ''
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith('#EXTINF:'):
            current_name = line.split(',', 1)[-1].strip() if ',' in line else ''
            continue
        if line.startswith('#'):
            continue
        match = M3U_ID_RE.search(line)
        if not match:
            continue
        items.append({
            'stream_id': match.group('stream_id'),
            'name': current_name,
            'source': 'ky-tv-hls',
            'url': line,
        })
    return items


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write('\n')


def main() -> None:
    parser = argparse.ArgumentParser(description='Refresca catálogos vivos de tivi-ott y ky-tv HLS.')
    parser.add_argument('--config', required=True, help='Ruta al config JSON')
    parser.add_argument('--out-dir', required=True, help='Directorio de salida')
    args = parser.parse_args()

    cfg = load_config(Path(args.config))
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    tivi_catalog = refresh_tivi_catalog(cfg)
    kytv_catalog = refresh_kytv_catalog(cfg)

    write_json(out_dir / 'tivi_catalog.json', tivi_catalog)
    write_json(out_dir / 'kytv_hls_catalog.json', kytv_catalog)

    summary = {
        'tivi_catalog_count': len(tivi_catalog),
        'kytv_hls_catalog_count': len(kytv_catalog),
        'out_dir': str(out_dir)
    }
    write_json(out_dir / 'catalog_summary.json', summary)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
