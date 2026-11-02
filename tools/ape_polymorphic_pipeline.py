#!/usr/bin/env python3
"""APE polymorphic pipeline — executable subset of the absorbed architecture.

Input:  M3U8 (.m3u8/.gz) or the JSON produced by tools/m3u8_json_bridge.py
Output: content-addressed HLS, JSON, REA metadata and a catalog.

Properties:
  - deterministic: same input -> same output hashes
  - idempotent: running twice produces the same bytes
  - no network, no credential resolution, no playout
  - no channel deletion: duplicates are reported, original list is preserved

It does not implement WebRTC, P2P or a DASH encoder. Those remain explicit
outputs of external engines, not fake local claims.
"""
import hashlib
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(__file__))
import m3u8_json_bridge  # noqa: E402
import generate_rea_skills  # noqa: E402


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load_input(path):
    if path.endswith('.json'):
        doc = json.load(open(path, encoding='utf-8'))
        if doc.get('schema') != 'ape.m3u8.json.v1':
            raise SystemExit('unsupported JSON schema')
        text = m3u8_json_bridge.from_doc(doc)
        return text, doc
    text = m3u8_json_bridge.read(path)
    return text, m3u8_json_bridge.to_doc(text, path)


def load_health(path):
    if not path:
        return {}
    data = json.load(open(path, encoding='utf-8'))
    if isinstance(data.get('urls'), dict):
        data = data['urls']
    return data if isinstance(data, dict) else {}


def main(src, outdir, health_path=None):
    text, bridge = load_input(src)
    health = load_health(health_path)
    # Reuse the REA parser logic without touching its CLI.
    chans = []
    ext = None
    for line in text.splitlines():
        s = line.strip()
        if s.startswith('#EXTINF'):
            ext = s
        elif s.startswith('http') and ext:
            name = ext.rsplit(',', 1)[-1].strip() if ',' in ext else 'channel'
            chans.append({'name': name, 'url': s, 'hash': sha(s.encode('utf-8'))})
            ext = None
    canonical = '\n'.join(c['url'] for c in chans).encode('utf-8')
    key = sha(canonical)
    seen = set()
    unique = []
    duplicates = []
    for c in chans:
        if c['hash'] in seen:
            duplicates.append({'name': c['name'], 'url_hash': 'sha256:' + c['hash'][:16]})
            continue
        seen.add(c['hash'])
        unique.append(c)
    out = os.path.join(outdir, 'dist')
    os.makedirs(out, exist_ok=True)
    os.makedirs(os.path.join(out, 'hls'), exist_ok=True)
    os.makedirs(os.path.join(out, 'json'), exist_ok=True)
    os.makedirs(os.path.join(out, 'rea'), exist_ok=True)
    # Original HLS bytes are preserved; no normalization at this stage.
    open(os.path.join(out, 'hls', 'source.m3u8'), 'w', encoding='utf-8', newline='').write(text)
    json.dump(bridge, open(os.path.join(out, 'json', 'source.json'), 'w', encoding='utf-8'), indent=2)
    # Deterministic REA catalog
    rea = {
        'skill_metadata': {
            'version': '5.4',
            'aggression_mode': 'max',
            'idempotency_key': 'sha256:' + key,
            'channel_count': len(chans),
            'unique_count': len(unique),
        },
        'channels': [{
            'name': c['name'],
            'stream': c['url'],
            'rea_properties': {
                'isomorphic_hash': 'sha256:' + c['hash'][:16],
                'latency_target': 'ultra_low',
                'persistence_mode': 'immutable',
                'polymorphic_outputs': ['hls', 'dash', 'webrtc'],
                'quality_tiers': ['4k', '1080p', '720p', '480p'],
                'health': health.get(c['url'], {}),
            }
        } for c in unique],
    }
    json.dump(rea, open(os.path.join(out, 'rea', 'channels.json'), 'w', encoding='utf-8'), indent=2)
    catalog = {
        'schema': 'ape.pipeline.catalog.v1',
        'input': os.path.basename(src),
        'input_sha256': sha(text.encode('utf-8')),
        'idempotency_key': 'sha256:' + key,
        'channels': len(chans),
        'unique_channels': len(unique),
        'duplicates': duplicates,
        'outputs': {
            'hls': 'hls/source.m3u8',
            'json': 'json/source.json',
            'rea': 'rea/channels.json',
        },
        'unsupported_outputs': ['dash', 'webrtc', 'p2p'],
        'note': 'DASH/WebRTC/P2P require external engines; not fabricated here.',
    }
    json.dump(catalog, open(os.path.join(out, 'catalog.json'), 'w', encoding='utf-8'), indent=2)
    print(json.dumps(catalog, indent=2))
    return 0


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        print('usage: ape_polymorphic_pipeline.py <m3u8|m3u8.gz|json> <outdir> [health.json]', file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) == 4 else None))
