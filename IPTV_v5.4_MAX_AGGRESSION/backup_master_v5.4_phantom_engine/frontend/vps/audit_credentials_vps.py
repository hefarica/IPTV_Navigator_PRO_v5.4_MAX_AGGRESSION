#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════════╗
║         IPTV Navigator PRO — VPS Credential Audit (Server-Side)         ║
║                     Version 1.0 — 2026-02-22                            ║
╚═══════════════════════════════════════════════════════════════════════════╝

Runs on VPS. Reads ORIGINS from resolve.php and audits the latest M3U8 list.
Called by audit.php after channels_map.json upload.

OUTPUT: JSON to stdout (consumed by PHP).
"""

import re
import sys
import json
import os
import glob
from collections import defaultdict

# ── Paths ──
RESOLVE_PHP  = '/var/www/html/resolve.php'
LISTS_DIR    = '/var/www/iptv-ape/lists'
REPORT_PATH  = '/var/www/html/audit_report.json'

# ── Extract ORIGINS from resolve.php ──
def extract_origins(php_path: str) -> dict:
    """Parse the ORIGINS array from resolve.php."""
    origins = {}
    try:
        with open(php_path, 'r') as f:
            content = f.read()
        # Match lines like: ['host', 'user', 'pass'],
        matches = re.findall(
            r"\['([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\]",
            content
        )
        for host, user, pw in matches:
            origins[host] = {'user': user, 'pass': pw}
    except Exception as e:
        print(json.dumps({'error': f'Cannot read resolve.php: {e}'}))
        sys.exit(1)
    return origins


# ── Find latest M3U8 ──
def find_latest_m3u8(lists_dir: str) -> str:
    """Find the most recently modified .m3u8 in lists_dir."""
    files = glob.glob(os.path.join(lists_dir, '*.m3u8'))
    if not files:
        return None
    return max(files, key=os.path.getmtime)


# ── Parse M3U8 ──
URL_PATTERN = re.compile(r'https?://([^/]+)/live/([^/]+)/([^/]+)/(\d+)\.m3u8')
EXTINF_PATTERN = re.compile(r'#EXTINF:-1\s+.*?tvg-name="([^"]*)"')
ORIGIN_PATTERN = re.compile(r'#EXTATTRFROMURL:.*?origin=([^&\s]+)')

def parse_m3u8(filepath: str) -> list:
    channels = []
    name = None
    resolver_origin = None
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            m = EXTINF_PATTERN.search(line)
            if m:
                name = m.group(1)
                continue
            m = ORIGIN_PATTERN.search(line)
            if m:
                resolver_origin = m.group(1)
                continue
            m = URL_PATTERN.search(line)
            if m:
                channels.append({
                    'name': name or f'Unknown ({m.group(4)})',
                    'host': m.group(1),
                    'user': m.group(2),
                    'pass': m.group(3),
                    'stream_id': m.group(4),
                    'resolver_origin': resolver_origin or m.group(1),
                })
                name = None
                resolver_origin = None
    return channels


# ── Audit ──
def audit(channels: list, origins: dict) -> dict:
    results = {
        'total_channels': len(channels),
        'hosts': {},
        'credential_mismatches': [],
        'missing_origins': [],
        'status': 'OK',
    }

    # Host summary
    host_creds = defaultdict(lambda: defaultdict(int))
    for ch in channels:
        host_creds[ch['host']][f"{ch['user']}:{ch['pass']}"] += 1
    results['hosts'] = {
        h: [{'account': k.split(':')[0], 'count': v} for k, v in c.items()]
        for h, c in host_creds.items()
    }

    # Check mismatches
    for ch in channels:
        ro = ch['resolver_origin']
        match = None
        for rhost, rcreds in origins.items():
            if rhost == ro or rhost.split(':')[0] == ro.split(':')[0]:
                match = rcreds
                break
        if match is None:
            continue
        if ch['user'] != match['user'] or ch['pass'] != match['pass']:
            results['credential_mismatches'].append({
                'channel': ch['name'],
                'stream_id': ch['stream_id'],
                'host': ch['host'],
                'list_user': ch['user'],
                'resolver_user': match['user'],
            })

    # Missing origins
    all_hosts = set(ch['resolver_origin'] for ch in channels)
    for h in all_hosts:
        found = any(
            rh == h or rh.split(':')[0] == h.split(':')[0]
            for rh in origins
        )
        if not found:
            results['missing_origins'].append(h)

    if results['credential_mismatches'] or results['missing_origins']:
        results['status'] = 'ISSUES_FOUND'

    return results


def main():
    # 1. Extract origins from resolve.php
    origins = extract_origins(RESOLVE_PHP)
    if not origins:
        print(json.dumps({'error': 'No origins found in resolve.php'}))
        sys.exit(1)

    # 2. Find latest M3U8
    m3u8_path = sys.argv[1] if len(sys.argv) > 1 else find_latest_m3u8(LISTS_DIR)
    if not m3u8_path or not os.path.isfile(m3u8_path):
        print(json.dumps({'error': 'No M3U8 file found', 'searched': LISTS_DIR}))
        sys.exit(1)

    # 3. Parse & audit
    channels = parse_m3u8(m3u8_path)
    results = audit(channels, origins)
    results['m3u8_file'] = os.path.basename(m3u8_path)
    results['origins_registry'] = {k: v['user'] for k, v in origins.items()}

    # 4. Save report
    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # 5. Output to stdout (for PHP)
    print(json.dumps(results, ensure_ascii=False))


if __name__ == '__main__':
    main()
