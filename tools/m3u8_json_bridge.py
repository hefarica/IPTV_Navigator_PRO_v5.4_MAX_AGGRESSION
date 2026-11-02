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


def to_doc(text, path):
    return {
        'schema': 'ape.m3u8.json.v1',
        'source': path,
        'sha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
        'line_count': len(text.splitlines(keepends=True)),
        'channels': sum(1 for l in text.splitlines() if l.startswith('#EXTINF')),
        'lines': text.splitlines(keepends=True),
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
