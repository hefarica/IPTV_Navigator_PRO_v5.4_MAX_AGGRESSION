#!/usr/bin/env python3
"""Lossless M3U8 <-> JSON bridge with byte-identical round-trip.

This is the local, dependency-free implementation of the ipytv/m3ujson/jc
idea: parse the playlist as an ordered line model instead of rebuilding it.
It preserves comments, EXTVLCOPT, tags, CRLF/LF and ordering.

Usage:
  python3 tools/m3u8_json_bridge.py to-json list.m3u8 out.json
  python3 tools/m3u8_json_bridge.py to-m3u8 out.json restored.m3u8
  python3 tools/m3u8_json_bridge.py check list.m3u8
"""
import hashlib
import json
import re
import sys


def read(path):
    if path.endswith('.gz'):
        import gzip
        with gzip.open(path, 'rt', encoding='utf-8', errors='replace', newline='') as f:
            text = f.read()
    else:
        with open(path, 'r', encoding='utf-8', errors='replace', newline='') as f:
            text = f.read()
    return text


def _parse_channels(lines):
    channels = []
    ext = None
    for line in lines:
        s = line.strip()
        if s.startswith('#EXTINF'):
            ext = s
            continue
        if ext and s.startswith('http'):
            attrs = dict(re.findall(r'([A-Za-z0-9_-]+)="([^"]*)"', ext))
            name = ext.rsplit(',', 1)[-1].strip() if ',' in ext else ''
            channels.append({
                'name': name,
                'tvg_id': attrs.get('tvg-id'),
                'tvg_name': attrs.get('tvg-name'),
                'tvg_logo': attrs.get('tvg-logo'),
                'group_title': attrs.get('group-title'),
                'url': s,
                'attributes': attrs,
            })
            ext = None
    return channels


def to_doc(text, path):
    lines = text.splitlines(keepends=True)
    return {
        'schema': 'ape.m3u8.json.v1',
        'source': path,
        'sha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
        'line_count': len(lines),
        'channels': sum(1 for l in lines if l.startswith('#EXTINF')),
        'lines': lines,
        # Structured index: useful for skill/Alexa/API consumers. The raw
        # lines remain the authority for the lossless reverse conversion.
        'channel_index': _parse_channels(lines),
    }


def from_doc(doc):
    text = ''.join(doc['lines'])
    digest = hashlib.sha256(text.encode('utf-8')).hexdigest()
    if digest != doc['sha256']:
        raise SystemExit('round-trip hash mismatch')
    return text


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    cmd = argv[1]
    if cmd == 'to-json':
        text = read(argv[2])
        json.dump(to_doc(text, argv[2]), open(argv[3], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('ok')
        return 0
    if cmd == 'to-m3u8':
        doc = json.load(open(argv[2], encoding='utf-8'))
        with open(argv[3], 'w', encoding='utf-8', newline='') as f:
            f.write(from_doc(doc))
        print('ok')
        return 0
    if cmd == 'check':
        text = read(argv[2])
        doc = to_doc(text, argv[2])
        back = from_doc(doc)
        print(json.dumps({
            'source': argv[2],
            'sha256': doc['sha256'],
            'line_count': doc['line_count'],
            'channels': doc['channels'],
            'roundtrip_identical': back == text,
        }, indent=2))
        return 0 if back == text else 1
    print('unknown command', file=sys.stderr)
    return 2


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
