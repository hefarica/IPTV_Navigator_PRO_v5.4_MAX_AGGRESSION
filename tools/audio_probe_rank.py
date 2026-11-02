#!/usr/bin/env python3
"""Read-only audio track analyzer/ranker for HLS URLs.

Classifies codec/channels/sample rate and recommends:
  passthrough | aac_lc_2ch | no_audio

Usage:
  python3 tools/audio_probe_rank.py <url> [url...]
"""
import json
import subprocess
import sys

UA = 'VLC/3.0.19 LibVLC/3.0.19'
RANK = {
    'truehd': 100, 'dts': 95, 'eac3': 90, 'ac3': 85,
    'aac': 80, 'mp3': 70, 'opus': 60, 'flac': 95,
}


def probe(url):
    cmd = [
        'ffprobe', '-v', 'error', '-user_agent', UA,
        '-show_entries', 'stream=index,codec_type,codec_name,channels,sample_rate,bit_rate',
        '-of', 'json', '-timeout', '15000000', url,
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=45)
        data = json.loads(out.decode('utf-8', 'replace'))
    except Exception as e:
        return {'url': url, 'status': 'probe_error', 'error': str(e), 'tracks': []}
    tracks = []
    for s in data.get('streams', []):
        if s.get('codec_type') != 'audio':
            continue
        codec = (s.get('codec_name') or '').lower()
        channels = int(s.get('channels') or 0)
        rate = int(s.get('sample_rate') or 0)
        valid = channels > 0 and rate > 0
        tracks.append({
            'codec': codec,
            'channels': channels,
            'sample_rate': rate,
            'bit_rate': s.get('bit_rate'),
            'valid': valid,
            'rank': RANK.get(codec, 0) if valid else 0,
        })
    tracks.sort(key=lambda t: (t['valid'], t['rank']), reverse=True)
    best = tracks[0] if tracks else None
    if not best or not best['valid']:
        mode = 'no_audio' if not tracks else 'aac_lc_2ch'
    elif best['codec'] in ('eac3', 'ac3', 'aac', 'mp3'):
        mode = 'passthrough'
    else:
        mode = 'aac_lc_2ch'
    return {
        'url': url,
        'status': 'ok',
        'tracks': tracks,
        'best': best,
        'recommended_mode': mode,
    }


def main(urls):
    result = {'policy': 'passthrough_safe', 'results': [probe(u) for u in urls]}
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1:]))
