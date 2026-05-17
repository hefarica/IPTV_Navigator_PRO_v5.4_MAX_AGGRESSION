#!/usr/bin/env python3
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import parse_qs, urlparse

EXTINF_NAME_RE = re.compile(r',([^,][^\n\r]*)$')
ATTR_RE = re.compile(r'([A-Za-z0-9\-]+)="([^"]*)"')
PROFILE_DECL_RE = re.compile(r'ape-profile\s*=\s*"([^"]+)"', re.IGNORECASE)
APE_META_RE = re.compile(r'([A-Z\-]+)=([^;]+)')
HTTP_JSON_PROFILE_RE = re.compile(r'"X-APE-Profile"\s*:\s*"([^"]+)"', re.IGNORECASE)


def parse_extinf(line: str):
    attrs = dict(ATTR_RE.findall(line))
    m = EXTINF_NAME_RE.search(line.rstrip())
    name = m.group(1).strip() if m else ''
    return attrs, name


def get_host(url: str) -> str:
    try:
        return (urlparse(url).netloc or '').lower()
    except Exception:
        return ''


def get_path(url: str) -> str:
    try:
        return urlparse(url).path or ''
    except Exception:
        return ''


def get_profile_from_url(url: str) -> str:
    try:
        q = parse_qs(urlparse(url).query)
    except Exception:
        return ''
    for key in ('profile', 'ape_profile', 'ape-profile'):
        vals = q.get(key)
        if vals:
            return vals[0]
    return ''


def main():
    if len(sys.argv) < 3:
        raise SystemExit('Usage: analyze_playlist.py <playlist.m3u8> <output_dir>')

    m3u = Path(sys.argv[1])
    root = Path(sys.argv[2])
    root.mkdir(parents=True, exist_ok=True)

    total_lines = 0
    directive_counter = Counter()
    host_counter = Counter()
    url_counter = Counter()
    profile_decl_counter = Counter()
    profile_url_counter = Counter()
    expected_status_counter = Counter()
    publication_tier_counter = Counter()
    admission_source_counter = Counter()
    group_counter = Counter()

    channel_rows = []
    unique_url_rows = {}
    current = None
    global_header_lines = 0
    global_profiles_declared = []

    def finalize_current():
        if not current:
            return
        urls = current['urls']
        current['url_count'] = len(urls)
        current['unique_url_count'] = len(set(urls))
        current['hosts'] = sorted({get_host(u) for u in urls if get_host(u)})
        current['profiles_url'] = sorted({p for p in current['profiles_url'] if p})
        current['profiles_declared'] = sorted({p for p in current['profiles_declared'] if p})
        current['expected_statuses'] = sorted({s for s in current['expected_statuses'] if s})
        current['publication_tiers'] = sorted({t for t in current['publication_tiers'] if t})
        current['admission_sources'] = sorted({s for s in current['admission_sources'] if s})
        channel_rows.append(current.copy())

    with m3u.open('r', encoding='utf-8', errors='replace') as f:
        for raw in f:
            total_lines += 1
            stripped = raw.strip()
            if not stripped:
                continue

            if stripped.startswith('#'):
                tag = stripped.split(':', 1)[0]
                directive_counter[tag] += 1

                if current is None:
                    global_header_lines += 1
                    if tag == '#EXT-X-APE-PROFILES':
                        payload = stripped.split(':', 1)[1] if ':' in stripped else ''
                        global_profiles_declared = [p.split('-')[0] for p in payload.split(',') if p]

                if tag == '#EXTINF':
                    finalize_current()
                    attrs, name = parse_extinf(stripped)
                    group = attrs.get('group-title', '')
                    group_counter[group] += 1
                    profile_m = PROFILE_DECL_RE.search(stripped)
                    profile_decl = profile_m.group(1) if profile_m else attrs.get('ape-profile', '')
                    if profile_decl:
                        profile_decl_counter[profile_decl] += 1
                    current = {
                        'channel_index': len(channel_rows) + 1,
                        'name': name,
                        'group': group,
                        'tvg_id': attrs.get('tvg-id', ''),
                        'tvg_name': attrs.get('tvg-name', ''),
                        'profiles_declared': [profile_decl] if profile_decl else [],
                        'profiles_url': [],
                        'expected_statuses': [],
                        'publication_tiers': [],
                        'admission_sources': [],
                        'urls': [],
                    }
                    continue

                if current is not None and tag == '#EXT-X-APE':
                    payload = stripped.split(':', 1)[1] if ':' in stripped else ''
                    meta = dict(APE_META_RE.findall(payload))
                    if meta.get('EXPECTED-STATUS'):
                        current['expected_statuses'].append(meta['EXPECTED-STATUS'])
                        expected_status_counter[meta['EXPECTED-STATUS']] += 1
                    if meta.get('PUBLICATION-TIER'):
                        current['publication_tiers'].append(meta['PUBLICATION-TIER'])
                        publication_tier_counter[meta['PUBLICATION-TIER']] += 1
                    if meta.get('ADMISSION-SOURCE'):
                        current['admission_sources'].append(meta['ADMISSION-SOURCE'])
                        admission_source_counter[meta['ADMISSION-SOURCE']] += 1

                if current is not None and tag == '#EXTHTTP':
                    m = HTTP_JSON_PROFILE_RE.search(stripped)
                    if m:
                        current['profiles_declared'].append(m.group(1))
                        profile_decl_counter[m.group(1)] += 1
                continue

            url = stripped
            url_counter[url] += 1
            host = get_host(url)
            path = get_path(url)
            purl = get_profile_from_url(url)
            if host:
                host_counter[host] += 1
            if purl:
                profile_url_counter[purl] += 1

            if current is not None:
                current['urls'].append(url)
                if purl:
                    current['profiles_url'].append(purl)

            if url not in unique_url_rows:
                unique_url_rows[url] = {
                    'url': url,
                    'host': host,
                    'path': path,
                    'profile_in_url': purl,
                    'occurrences': 0,
                }
            unique_url_rows[url]['occurrences'] += 1

    finalize_current()

    summary = {
        'file': str(m3u),
        'total_lines': total_lines,
        'global_header_lines_before_first_channel': global_header_lines,
        'channels_detected': len(channel_rows),
        'unique_urls': len(unique_url_rows),
        'total_url_occurrences': sum(url_counter.values()),
        'global_profiles_declared': global_profiles_declared,
        'top_directives': directive_counter.most_common(50),
        'top_hosts': host_counter.most_common(20),
        'top_groups': group_counter.most_common(20),
        'declared_profile_counts': profile_decl_counter.most_common(),
        'url_profile_counts': profile_url_counter.most_common(),
        'expected_status_counts': expected_status_counter.most_common(),
        'publication_tier_counts': publication_tier_counter.most_common(),
        'admission_source_counts': admission_source_counter.most_common(),
        'channels_with_urls': sum(1 for r in channel_rows if r['url_count'] > 0),
        'channels_without_urls': sum(1 for r in channel_rows if r['url_count'] == 0),
        'channels_with_repeated_same_url_only': sum(1 for r in channel_rows if r['url_count'] > 0 and r['unique_url_count'] == 1),
    }

    (root / 'analysis_summary_pretty.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    (root / 'analysis_channels.json').write_text(json.dumps(channel_rows, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    with (root / 'unique_urls.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['url', 'host', 'path', 'profile_in_url', 'occurrences'])
        writer.writeheader()
        for row in unique_url_rows.values():
            writer.writerow(row)

    with (root / 'channel_structural_summary.csv').open('w', newline='', encoding='utf-8') as f:
        fields = [
            'channel_index', 'name', 'group', 'tvg_id', 'tvg_name', 'url_count', 'unique_url_count',
            'hosts', 'profiles_declared', 'profiles_url', 'expected_statuses', 'publication_tiers', 'admission_sources'
        ]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in channel_rows:
            out = {k: row.get(k, '') for k in fields}
            for key in ('hosts', 'profiles_declared', 'profiles_url', 'expected_statuses', 'publication_tiers', 'admission_sources'):
                out[key] = '|'.join(row.get(key, []))
            writer.writerow(out)

    with (root / 'directive_counts.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['directive', 'count'])
        for tag, count in directive_counter.most_common():
            writer.writerow([tag, count])

    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
