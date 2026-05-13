#!/usr/bin/env python3
"""
Sync channels_map.json profiles with the generator's determineProfile() logic.

Generator Logic (m3u8-typed-arrays-ultimate.js):
  - 8K → P0
  - 4K/UHD + (60FPS or SPORTS) → P1
  - 4K/UHD → P2
  - FHD/1080 → P3
  - HD/720 → P4
  - SD/480 → P5
  - Default → P3
"""
import json
import sys
import re

def determine_profile(name):
    """Mirror of JS determineProfile() — MUST stay in sync."""
    upper = (name or '').upper()

    if '8K' in upper:
        return 'P0'
    if '4K' in upper or 'UHD' in upper:
        if '60FPS' in upper or 'SPORTS' in upper:
            return 'P1'
        return 'P2'
    if 'FHD' in upper or '1080' in upper:
        return 'P3'
    if 'HD' in upper or '720' in upper:
        return 'P4'
    if 'SD' in upper or '480' in upper:
        return 'P5'

    return 'P3'  # Default FHD


def main():
    map_path = sys.argv[1] if len(sys.argv) > 1 else 'channels_map.json'

    with open(map_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    changes = 0
    profile_counts = {}

    for key, entry in data.items():
        if not isinstance(entry, dict):
            continue
        label = entry.get('label', '')
        old_profile = entry.get('profile', 'NONE')
        new_profile = determine_profile(label)

        if old_profile != new_profile:
            entry['profile'] = new_profile
            changes += 1

        profile_counts[new_profile] = profile_counts.get(new_profile, 0) + 1

    # Write updated map
    with open(map_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f'\n=== CHANNELS MAP PROFILE SYNC ===')
    print(f'Total entries: {len(data)}')
    print(f'Profiles changed: {changes}')
    print(f'\nProfile distribution:')
    for p in sorted(profile_counts.keys()):
        print(f'  {p}: {profile_counts[p]}')
    print(f'\nFile saved: {map_path}')


if __name__ == '__main__':
    main()
