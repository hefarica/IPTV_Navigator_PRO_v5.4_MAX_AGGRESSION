#!/usr/bin/env python3
"""Dependency-free metadata-enrichment test."""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    with tempfile.TemporaryDirectory() as td:
        bridge = os.path.join(td, 'bridge.json')
        meta = os.path.join(td, 'meta.json')
        out = os.path.join(td, 'out.json')
        url = 'https://host/live/1.m3u8'
        json.dump({
            'schema': 'ape.m3u8.json.v1', 'sha256': '0' * 64, 'line_count': 2,
            'channels': 1, 'lines': ['#EXTM3U\n', f'#EXTINF:-1,CH\n{url}\n'],
            'channel_index': [{'name': 'CH', 'url': url, 'attributes': {}}],
        }, open(bridge, 'w'))
        json.dump({url: {'tvg_id': 'cnn.intl', 'tvg_logo': 'https://cdn/cnn.png',
                        'epg': 'https://epg/cnn.xml', 'tmdb_id': 123,
                        'poster': 'https://cdn/p.jpg', 'overview': 'News',
                        'genre': 'News', 'cast': 'A'}}, open(meta, 'w'))
        subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'ape_metadata_enrich.py'), bridge, meta, out], check=True)
        d = json.load(open(out))
        m = d['channel_index'][0]['metadata']
        ok = d['metadata_summary'] == {'provided': 1, 'fallback': 0, 'total': 1} and m['tvg_id'] == 'cnn.intl' and m['tmdb_id'] == 123
        print(json.dumps({'ok': ok, 'metadata': m, 'summary': d['metadata_summary']}, indent=2))
        return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
