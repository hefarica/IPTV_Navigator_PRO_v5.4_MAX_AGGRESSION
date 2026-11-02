#!/usr/bin/env python3
"""Round-trip M3U8 -> JSON -> M3U8 identity test."""
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import m3u8_json_bridge as b


def main():
    text = (
        '#EXTM3U\n'
        '#EXTINF:-1 tvg-id="1" tvg-name="CH" tvg-logo="https://cdn/logo.png" '
        'group-title="TEST",CH\n'
        'https://host/live/1.m3u8\n'
        '#EXTVLCOPT:network-caching=1500\n'
        '#EXTINF:-1 tvg-id="2" group-title="TEST",CH2\n'
        'https://host/live/2.m3u8\n'
    )
    doc = b.to_doc(text, 'fixture.m3u8')
    back = b.from_doc(doc)
    ok = back == text and len(doc['channel_index']) == 2
    ok = ok and doc['channel_index'][0]['tvg_id'] == '1'
    ok = ok and doc['channel_index'][0]['group_title'] == 'TEST'
    ok = ok and doc['channel_index'][1]['url'] == 'https://host/live/2.m3u8'
    print(json.dumps({
        'ok': ok,
        'identical': back == text,
        'channels': len(doc['channel_index']),
        'sha256': doc['sha256'],
    }, indent=2))
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
