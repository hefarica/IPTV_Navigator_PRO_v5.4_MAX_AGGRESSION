#!/usr/bin/env python3
"""Verifica toda la lista enriquecida sin guardarla de nuevo ni mostrar URLs."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
from auditar_y_ampliar import blocks, patch_block, HEADER_TAG, LEGACY_TAG, OUTPUT_TAG, PREMIUM_TAG


def restore_block(block):
    result = []
    skip = False
    for line in block:
        if line.startswith((HEADER_TAG, OUTPUT_TAG, PREMIUM_TAG)):
            continue
        if line.startswith(LEGACY_TAG):
            payload = line.split(':', 1)[1].strip()
            obj = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            result.append(obj['line'] + obj.get('eol', '\n'))
            skip = True
            continue
        if skip:
            skip = False
            continue
        if line.startswith('#EXT-X-APE-AUDIT-UNVERIFIED-STREAM-INF:'):
            line = '#EXT-X-STREAM-INF:' + line.split(':', 1)[1]
        if line.startswith('#EXT-X-APE-FFMPEG-FILTER-REQUEST:'):
            line = '#EXTVLCOPT:video-filter=' + line.split(':', 1)[1]
        result.append(line)
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('patched', type=Path)
    ap.add_argument('--audit-json', type=Path, required=True)
    ap.add_argument('--output-json', type=Path, required=True)
    args = ap.parse_args()
    record = json.loads(args.audit_json.read_text())
    recovered = hashlib.sha256()
    channels = 0
    for block in blocks(args.patched):
        assert patch_block(block) == block, 'Parche no idempotente.'
        if block[0].startswith('#EXTINF:'):
            channels += 1
        for line in restore_block(block):
            recovered.update(line.encode())
        if channels and channels % 2000 == 0:
            print(f'Verificados {channels} canales', flush=True)
    expected = record['before']['sha256_uncompressed_text']
    assert recovered.hexdigest() == expected, 'No se recupera el texto original exacto.'
    assert channels == record['before']['channels']
    result = {
        'all_channels_checked': channels,
        'idempotent_all_blocks': True,
        'exact_original_text_recoverable': True,
        'restored_original_sha256': recovered.hexdigest(),
        'uri_sequence_unchanged': record['preservation_checks']['uri_sequence_unchanged'],
    }
    args.output_json.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
