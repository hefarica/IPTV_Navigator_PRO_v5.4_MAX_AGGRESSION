#!/usr/bin/env python3
"""Alexa resolver determinism test."""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    with tempfile.TemporaryDirectory() as td:
        catalog = os.path.join(td, 'channels.json')
        json.dump({'channels': [
            {'name': 'CNN International', 'stream': 'https://host/cnn.m3u8'},
            {'name': 'ESPN', 'stream': 'https://host/espn.m3u8'},
        ]}, open(catalog, 'w'))
        cmd = [sys.executable, os.path.join(ROOT, 'tools', 'ape_alexa_resolver.py'), catalog]
        a = json.loads(subprocess.check_output(cmd + ['pon cnn']))
        b = json.loads(subprocess.check_output(cmd + ['pon cnn']))
        ok = a['matched'] and a['channel']['name'] == 'CNN International' and a == b
        print(json.dumps({'ok': ok, 'channel': a.get('channel'), 'deterministic': a == b}, indent=2))
        return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
