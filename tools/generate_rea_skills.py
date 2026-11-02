#!/usr/bin/env python3
"""Generate REA/Alexa skill metadata from an M3U8 without third-party deps.

Output is deterministic for the same input:
  - skill_metadata.idempotency_key = SHA-256 of canonical channel list
  - channels[].rea_properties.isomorphic_hash = SHA-256(channel URL)
  - interaction_model.json for a voice skill

It does not execute the playlist, resolve credentials, or call the network.
"""
import hashlib
import json
import os
import sys


def parse(path):
    if path.endswith('.gz'):
        import gzip
        fh = gzip.open(path, 'rt', encoding='utf-8', errors='replace', newline='')
    else:
        fh = open(path, 'r', encoding='utf-8', errors='replace', newline='')
    channels = []
    ext = None
    with fh as f:
        for line in f:
            s = line.strip()
            if s.startswith('#EXTINF'):
                ext = s
            elif s.startswith('http') and ext:
                name = ext.rsplit(',', 1)[-1].strip() if ',' in ext else ''
                channels.append({
                    'name': name or 'channel',
                    'stream': s,
                    'extinf': ext,
                    'isomorphic_hash': hashlib.sha256(s.encode('utf-8')).hexdigest(),
                })
                ext = None
    return channels


def main(src, outdir):
    channels = parse(src)
    canonical = '\n'.join(c['stream'] for c in channels).encode('utf-8')
    key = hashlib.sha256(canonical).hexdigest()
    os.makedirs(outdir, exist_ok=True)
    skill = {
        'skill_metadata': {
            'version': '5.4',
            'aggression_mode': 'max',
            'idempotency_key': 'sha256:' + key,
            'channel_count': len(channels),
        },
        'channels': [
            {
                'name': c['name'],
                'stream': c['stream'],
                'rea_properties': {
                    'isomorphic_hash': 'sha256:' + c['isomorphic_hash'][:16],
                    'latency_target': 'ultra_low',
                    'persistence_mode': 'immutable',
                    'polymorphic_outputs': ['hls', 'dash', 'webrtc'],
                    'quality_tiers': ['4k', '1080p', '720p', '480p'],
                },
            } for c in channels
        ],
    }
    with open(os.path.join(outdir, 'channels.json'), 'w', encoding='utf-8') as f:
        json.dump(skill, f, ensure_ascii=False, indent=2)
    interaction = {
        'interactionModel': {
            'languageModel': {
                'invocationName': 'ape iptv',
                'intents': [{
                    'name': 'PlayChannelIntent',
                    'slots': [{'name': 'channel', 'type': 'AMAZON.SearchQuery'}],
                    'samples': ['pon {channel}', 'reproduce {channel}', 'abre {channel}'],
                }],
            }
        }
    }
    with open(os.path.join(outdir, 'alexa_interaction_model.json'), 'w', encoding='utf-8') as f:
        json.dump(interaction, f, ensure_ascii=False, indent=2)
    print(json.dumps({
        'channels': len(channels),
        'idempotency_key': 'sha256:' + key,
        'output': outdir,
    }, indent=2))
    return 0


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('usage: generate_rea_skills.py <list.m3u8|.gz> <outdir>', file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
