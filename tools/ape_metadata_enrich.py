#!/usr/bin/env python3
"""Deterministically attach channel/EPG/TMDB metadata to bridge JSON.

Input metadata is caller-supplied; no network, scraping or fabricated IDs.
Usage: ape_metadata_enrich.py bridge.json metadata.json out.json
metadata.json may be { "<url>": {...} } or { "urls": { ... } }.
"""
import hashlib
import json
import sys


def main(bridge_path, meta_path, out_path):
    bridge = json.load(open(bridge_path, encoding='utf-8'))
    meta = json.load(open(meta_path, encoding='utf-8'))
    if isinstance(meta.get('urls'), dict):
        meta = meta['urls']
    out = dict(bridge)
    channels = []
    known = 0
    for ch in bridge.get('channel_index', []):
        h = hashlib.sha256(str(ch.get('url', '')).encode()).hexdigest()
        m = meta.get(ch.get('url')) or meta.get(h) or {}
        item = dict(ch)
        item['metadata'] = {
            'tvg_id': m.get('tvg_id', ch.get('tvg_id')),
            'tvg_logo': m.get('tvg_logo', ch.get('tvg_logo')),
            'epg': m.get('epg', 'unknown'),
            'tmdb_id': m.get('tmdb_id', 'unknown'),
            'poster': m.get('poster', 'unknown'),
            'overview': m.get('overview', 'unknown'),
            'genre': m.get('genre', 'unknown'),
            'cast': m.get('cast', 'unknown'),
            'source': 'provided' if m else 'channel-index',
        }
        if m:
            known += 1
        channels.append(item)
    out['channel_index'] = channels
    out['metadata_summary'] = {'provided': known, 'fallback': len(channels) - known, 'total': len(channels)}
    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(json.dumps({'channels': len(channels), **out['metadata_summary'], 'output': out_path}, indent=2))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
