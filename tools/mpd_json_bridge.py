#!/usr/bin/env python3
"""Lossless DASH MPD <-> JSON bridge.

Stores the original XML bytes as a hash-bound base64 payload and a small
inspectable index. The reverse conversion writes the same bytes.

Usage:
  python3 tools/mpd_json_bridge.py to-json in.mpd out.json
  python3 tools/mpd_json_bridge.py to-mpd in.json out.mpd
  python3 tools/mpd_json_bridge.py check in.mpd
"""
import base64
import hashlib
import json
import sys
import xml.etree.ElementTree as ET


def to_doc(path):
    raw = open(path, 'rb').read()
    root = ET.fromstring(raw)
    return {
        'schema': 'ape.dash.mpd.json.v1',
        'sha256': hashlib.sha256(raw).hexdigest(),
        'bytes': len(raw),
        'root': root.tag,
        'type': root.attrib.get('type'),
        'profiles': root.attrib.get('profiles'),
        'periods': len(root.findall('{*}Period')),
        'xml_base64': base64.b64encode(raw).decode('ascii'),
    }


def from_doc(doc):
    raw = base64.b64decode(doc['xml_base64'])
    if hashlib.sha256(raw).hexdigest() != doc['sha256']:
        raise SystemExit('sha256 mismatch')
    return raw


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    if argv[1] == 'to-json':
        doc = to_doc(argv[2])
        json.dump(doc, open(argv[3], 'w', encoding='utf-8'), indent=2)
        print(json.dumps({k: v for k, v in doc.items() if k != 'xml_base64'}, indent=2))
        return 0
    if argv[1] == 'to-mpd':
        raw = from_doc(json.load(open(argv[2], encoding='utf-8')))
        open(argv[3], 'wb').write(raw)
        print('ok')
        return 0
    if argv[1] == 'check':
        raw = open(argv[2], 'rb').read()
        doc = to_doc(argv[2])
        back = from_doc(doc)
        print(json.dumps({
            'sha256': doc['sha256'],
            'bytes': doc['bytes'],
            'periods': doc['periods'],
            'roundtrip_identical': back == raw,
        }, indent=2))
        return 0 if back == raw else 1
    print('unknown command', file=sys.stderr)
    return 2


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
