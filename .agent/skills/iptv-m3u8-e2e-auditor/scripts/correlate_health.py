#!/usr/bin/env python3
import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path


def load_probe_map(path: Path):
    probe = {}
    with path.open('r', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            probe[row['url']] = row
    return probe


def split_pipe(value: str):
    return [x for x in (value or '').split('|') if x]


def main():
    if len(sys.argv) < 4:
        raise SystemExit('Usage: correlate_health.py <channel_structural_summary.csv> <probe_results.csv> <output_dir>')

    channels_csv = Path(sys.argv[1])
    probe_csv = Path(sys.argv[2])
    root = Path(sys.argv[3])
    root.mkdir(parents=True, exist_ok=True)

    probe = load_probe_map(probe_csv)
    channel_rows = []
    host_counter = Counter()
    group_counter = Counter()
    classification_counter = Counter()

    with channels_csv.open('r', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            hosts = split_pipe(row.get('hosts', ''))
            channel_classifications = []
            supporting_statuses = []
            supporting_visible = []

            # reconstruct url membership from analysis_channels.json if not present is overkill;
            # treat single-host/channel summary as channel-level structural wrapper.
            # classification remains best-effort using host-level aggregation from probe file.
            for host in hosts:
                host_counter[host] += 1

            row_out = {
                'channel_index': row.get('channel_index', ''),
                'name': row.get('name', ''),
                'group': row.get('group', ''),
                'hosts': row.get('hosts', ''),
                'profiles_declared': row.get('profiles_declared', ''),
                'publication_tiers': row.get('publication_tiers', ''),
                'admission_sources': row.get('admission_sources', ''),
                'health_classification': 'unknown',
                'final_statuses_seen': '',
                'visible_statuses_seen': ''
            }

            # channel-level best effort: scan all probe rows whose host belongs to this channel
            seen_urls = 0
            for url, probe_row in probe.items():
                final_host = probe_row.get('final_host', '')
                url_host = ''
                try:
                    url_host = url.split('/')[2].lower()
                except Exception:
                    url_host = ''
                if url_host in hosts or final_host in hosts:
                    seen_urls += 1
                    channel_classifications.append(probe_row.get('classification', ''))
                    supporting_statuses.append(probe_row.get('final_status', ''))
                    supporting_visible.append(probe_row.get('visible_status', ''))

            if channel_classifications:
                bucket = Counter(channel_classifications).most_common(1)[0][0]
                row_out['health_classification'] = bucket
                row_out['final_statuses_seen'] = '|'.join(sorted({x for x in supporting_statuses if x}))
                row_out['visible_statuses_seen'] = '|'.join(sorted({x for x in supporting_visible if x}))
                classification_counter[bucket] += 1
            else:
                classification_counter['unknown'] += 1

            group_counter[row_out['group']] += 1
            channel_rows.append(row_out)

    with (root / 'channel_health_summary.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(channel_rows[0].keys()))
        writer.writeheader()
        writer.writerows(channel_rows)

    with (root / 'host_health_summary.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['host', 'channel_occurrences'])
        for host, count in host_counter.most_common():
            writer.writerow([host, count])

    with (root / 'group_health_summary.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['group', 'channel_count'])
        for group, count in group_counter.most_common():
            writer.writerow([group, count])

    summary = {
        'channel_classification_counts': dict(classification_counter),
        'groups': dict(group_counter),
        'hosts': dict(host_counter.most_common(20))
    }
    (root / 'correlation_summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
