#!/usr/bin/env python3
"""Validate the bridge JSON without third-party dependencies."""
import json
import re
import sys

HEX = re.compile(r'^[a-f0-9]{64}$')
URL = re.compile(r'^https?://')


def main(path):
    d = json.load(open(path, encoding='utf-8'))
    errs = []
    for key in ('schema', 'sha256', 'line_count', 'channels', 'lines', 'channel_index'):
        if key not in d:
            errs.append('missing ' + key)
    if d.get('schema') != 'ape.m3u8.json.v1':
        errs.append('bad schema')
    if not HEX.match(str(d.get('sha256', ''))):
        errs.append('bad sha256')
    if not isinstance(d.get('line_count'), int) or d.get('line_count', 0) < 1:
        errs.append('bad line_count')
    if not isinstance(d.get('lines'), list):
        errs.append('bad lines')
    idx = d.get('channel_index')
    if not isinstance(idx, list):
        errs.append('bad channel_index')
    else:
        if len(idx) != d.get('channels'):
            errs.append('channel count/index mismatch')
        for n, c in enumerate(idx):
            if not c.get('name'):
                errs.append(f'channel[{n}] missing name')
            if not URL.match(str(c.get('url', ''))):
                errs.append(f'channel[{n}] bad url')
            if not isinstance(c.get('attributes'), dict):
                errs.append(f'channel[{n}] bad attributes')
    print(json.dumps({
        'ok': not errs,
        'schema': d.get('schema'),
        'channels': d.get('channels'),
        'errors': errs[:20],
    }, indent=2))
    return 0 if not errs else 1


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('usage: validate_m3u8_json.py <bridge.json>', file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
