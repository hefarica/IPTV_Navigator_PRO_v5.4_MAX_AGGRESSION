#!/usr/bin/env python3
"""
Build a compact zapping playlist from an APE M3U8.

Keeps:
  - #EXTINF metadata
  - exactly one channel URL
  - safe #EXTVLCOPT headers
  - #EXT-X-APE-CRYSTAL-UHD display hint

Drops:
  - inert per-channel metadata that makes the list 10M+ lines
  - duplicate/global HLS URLs between channel blocks

Never changes video resolution, codec, HDR, bitrate or source URL.
Startup cache is capped at 6000 ms instead of 72000 ms.
"""
import gzip
import os
import sys


def flush(dst, extinf, opts, crystal, url):
    if not extinf or not url:
        return 0
    clean = []
    seen = set()
    for opt in opts:
        opt = opt.strip()
        if opt.startswith('#EXTVLCOPT:network-caching='):
            continue
        if opt.startswith('#EXTVLCOPT:network-timeout='):
            opt = '#EXTVLCOPT:network-timeout=15000'
        if opt in seen:
            continue
        seen.add(opt)
        clean.append(opt)
    clean.insert(0, '#EXTVLCOPT:network-caching=6000')
    if '#EXTVLCOPT:network-reconnect=true' not in clean:
        clean.append('#EXTVLCOPT:network-reconnect=true')
    dst.write(extinf)
    for c in crystal:
        dst.write(c + '\n')
    for opt in clean:
        dst.write(opt + '\n')
    dst.write(url + '\n')
    return 1


def main(src, outgz, stub):
    tmp = outgz + '.tmp'
    count = 0
    extinf = None
    opts = []
    crystal = []
    url = None
    header = None

    with gzip.open(src, 'rt', encoding='utf-8', errors='replace') as f, \
            gzip.open(tmp, 'wt', encoding='utf-8', newline='') as dst:
        for line in f:
            if extinf is None and not line.startswith('#EXTINF'):
                if header is None and line.startswith('#EXTM3U'):
                    header = line.rstrip('\n')
                continue
            if line.startswith('#EXTINF'):
                count += flush(dst, extinf, opts, crystal, url)
                extinf = line
                opts = []
                crystal = []
                url = None
                continue
            if extinf is None:
                continue
            if line.startswith('http') and url is None:
                url = line.strip()
            elif line.startswith('#EXTVLCOPT:'):
                opts.append(line.strip())
            elif line.startswith('#EXT-X-APE-CRYSTAL-UHD'):
                crystal.append(line.strip())
        count += flush(dst, extinf, opts, crystal, url)

    os.replace(tmp, outgz)
    with open(stub, 'w', encoding='utf-8') as f:
        f.write('#EXTM3U\n')
    # Ensure the M3U header is present once.
    tmp2 = outgz + '.tmp2'
    with gzip.open(outgz, 'rt', encoding='utf-8', errors='replace') as f, \
            gzip.open(tmp2, 'wt', encoding='utf-8', newline='') as dst:
        first = f.readline()
        if not first.startswith('#EXTM3U'):
            dst.write((header or '#EXTM3U') + '\n')
        dst.write(first)
        for line in f:
            dst.write(line)
    os.replace(tmp2, outgz)
    os.chmod(outgz, 0o644)
    os.chmod(stub, 0o644)
    return count


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print('usage: build_fast_zapping_list.py <src.m3u8.gz> <out.m3u8.gz> <out.m3u8>', file=sys.stderr)
        raise SystemExit(2)
    n = main(sys.argv[1], sys.argv[2], sys.argv[3])
    print('channels=%d' % n)
