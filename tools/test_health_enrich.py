#!/usr/bin/env python3
"""Dependency-free health-enrichment test."""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    with tempfile.TemporaryDirectory() as td:
        bridge = os.path.join(td, 'bridge.json')
        health = os.path.join(td, 'health.json')
        out = os.path.join(td, 'out.json')
        json.dump({
            'schema': 'ape.m3u8.json.v1',
            'sha256': '0' * 64,
            'line_count': 2,
            'channels': 1,
            'lines': ['#EXTM3U\n', '#EXTINF:-1,CH\n', 'https://host/live/1.m3u8\n'],
            'channel_index': [{'name': 'CH', 'url': 'https://host/live/1.m3u8', 'attributes': {}}],
        }, open(bridge, 'w'))
        json.dump({'urls': {'https://host/live/1.m3u8': {
            'status': 'online', 'uptime': '99.9%', 'bitrate': 8000000, 'codec': 'hevc', 'latency': 120
        }}}, open(health, 'w'))
        subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'ape_health_enrich.py'), bridge, health, out], check=True)
        d = json.load(open(out))
        h = d['channel_index'][0]['health']
        ok = d['health_summary'] == {'known': 1, 'unknown': 0, 'total': 1} and h['status'] == 'online' and h['source'] == 'provided'
        print(json.dumps({'ok': ok, 'health': h, 'summary': d['health_summary']}, indent=2))
        return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
