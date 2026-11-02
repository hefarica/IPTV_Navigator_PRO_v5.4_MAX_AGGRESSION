#!/usr/bin/env python3
"""Deterministically attach health metadata to the bridge JSON.

Input:
  bridge.json        schema ape.m3u8.json.v1
  health.json        { "<sha256(url)>": {uptime,bitrate,codec,latency,...} }
                     or { "urls": { ... } }

Missing health data is emitted as "unknown". No probing, no network, no fake
availability or bitrate claims.

Usage:
  python3 tools/ape_health_enrich.py bridge.json health.json out.json
"""
import hashlib
import json
import sys


def main(bridge_path, health_path, out_path):
    bridge = json.load(open(bridge_path, encoding='utf-8'))
    health = json.load(open(health_path, encoding='utf-8'))
    if isinstance(health.get('urls'), dict):
        health = health['urls']
    out = dict(bridge)
    channels = []
    known = 0
    for ch in bridge.get('channel_index', []):
        h = health.get(ch.get('url')) or health.get(hashlib.sha256(str(ch.get('url', '')).encode()).hexdigest()) or {}
        item = dict(ch)
        item['health'] = {
            'status': h.get('status', 'unknown'),
            'uptime': h.get('uptime', 'unknown'),
            'bitrate': h.get('bitrate', 'unknown'),
            'codec': h.get('codec', 'unknown'),
            'latency': h.get('latency', 'unknown'),
            'source': 'provided' if h else 'unknown',
        }
        if h:
            known += 1
        channels.append(item)
    out['channel_index'] = channels
    out['health_summary'] = {'known': known, 'unknown': len(channels) - known, 'total': len(channels)}
    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(json.dumps({'channels': len(channels), **out['health_summary'], 'output': out_path}, indent=2))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
