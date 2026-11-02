#!/usr/bin/env python3
"""Create the AUDIO_CRYSTAL variant without removing any source line.

Policy:
  - audio: analyze, best-track preference, audio-only downgrade allowed
  - video: never downscale; remux 2K/4K Crystal UHD
  - original channel URLs and all original metadata stay intact
"""
import gzip
import os
import sys

HEADER = [
    '#EXT-X-APE-AUDIO-POLICY:BEST_TRACK;AUDIO_DOWNGRADE_ALLOWED;VIDEO_DOWNSCALE_FORBIDDEN',
    '#EXT-X-APE-AUDIO-ANALYSIS:ON',
    '#EXT-X-APE-AUDIO-PRIORITY:TRUEHD>DTS-X>EAC3>AC3>AAC>MP3',
    '#EXT-X-APE-AUDIO-FALLBACK:TRUEHD>DTS-X>EAC3>AC3>AAC>MP3',
    '#EXT-X-APE-AUDIO-DOWNGRADE:ALLOWED;TARGET=AAC_LC_2CH;MAX=256k;SCOPE=AUDIO_ONLY',
    '#EXT-X-APE-AUDIO-MAP:1312008=SOURCE_INVALID_FALLBACK_FHD_AAC_2CH;1172226=AAC_LC_2CH',
    '#EXT-X-APE-VIDEO-POLICY:NO_DOWNSCALE;REMUX_ONLY;TRANSCODE_FORBIDDEN',
    '#EXT-X-APE-VIDEO-REMUX:2K_CRYSTAL_UHD,4K_CRYSTAL_UHD;NO_DOWNSCALE',
    '#EXT-X-APE-4K-START:DIRECT_CDN;NO_JIT;FAST_ZAPPING',
    '#EXT-X-APE-ORIGINAL-CHANNELS:PRESERVED',
]

STATUS = {
    'tvg-id="1312008"': '#EXT-X-APE-AUDIO-STATUS:SOURCE_INVALID;FALLBACK=FHD_AAC_2CH;VIDEO=4K_REMUX',
    'tvg-id="1172226"': '#EXT-X-APE-AUDIO-STATUS:VALID;AAC_LC_2CH;VIDEO=4K_REMUX',
}


def main(src, outgz, stub):
    tmp = outgz + '.tmp'
    inserted = False
    channels = 0
    with gzip.open(src, 'rt', encoding='utf-8', errors='replace') as f, \
            gzip.open(tmp, 'wt', encoding='utf-8', newline='') as dst:
        for line in f:
            if not inserted and line.startswith('#EXTM3U'):
                dst.write(line.rstrip('\n') + '\n')
                for h in HEADER:
                    dst.write(h + '\n')
                inserted = True
                continue
            dst.write(line)
            if line.startswith('#EXTINF'):
                channels += 1
                for key, status in STATUS.items():
                    if key in line:
                        dst.write(status + '\n')
                        break
    if not inserted:
        raise SystemExit('missing #EXTM3U')
    os.replace(tmp, outgz)
    with open(stub, 'w', encoding='utf-8') as f:
        f.write('#EXTM3U\n')
    os.chmod(outgz, 0o644)
    os.chmod(stub, 0o644)
    return channels


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print('usage: build_audio_crystal_list.py <src.m3u8.gz> <out.m3u8.gz> <out.m3u8>', file=sys.stderr)
        raise SystemExit(2)
    print('channels=%d' % main(sys.argv[1], sys.argv[2], sys.argv[3]))
