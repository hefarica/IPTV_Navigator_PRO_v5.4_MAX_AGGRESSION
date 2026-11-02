#!/usr/bin/env python3
"""Pipeline idempotence + dedupe test."""
import hashlib
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYLIST = (
    '#EXTM3U\n'
    '#EXTINF:-1 tvg-id="1" group-title="TEST",CH\n'
    'https://host/live/1.m3u8\n'
    '#EXTINF:-1 tvg-id="1" group-title="TEST",CH duplicate\n'
    'https://host/live/1.m3u8\n'
)


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def main():
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 'list.m3u8')
        open(src, 'w').write(PLAYLIST)
        out1 = os.path.join(td, 'out1')
        out2 = os.path.join(td, 'out2')
        cmd = [sys.executable, os.path.join(ROOT, 'tools', 'ape_polymorphic_pipeline.py')]
        subprocess.run(cmd + [src, out1], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(cmd + [src, out2], check=True, stdout=subprocess.DEVNULL)
        c1 = os.path.join(out1, 'dist', 'catalog.json')
        c2 = os.path.join(out2, 'dist', 'catalog.json')
        catalog = json.load(open(c1))
        ok = sha(c1) == sha(c2)
        ok = ok and catalog['channels'] == 2 and catalog['unique_channels'] == 1
        ok = ok and len(catalog['duplicates']) == 1
        print(json.dumps({
            'ok': ok,
            'channels': catalog['channels'],
            'unique': catalog['unique_channels'],
            'duplicates': len(catalog['duplicates']),
            'catalog_sha256': sha(c1),
            'second_run_same_hash': sha(c1) == sha(c2),
        }, indent=2))
        return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
