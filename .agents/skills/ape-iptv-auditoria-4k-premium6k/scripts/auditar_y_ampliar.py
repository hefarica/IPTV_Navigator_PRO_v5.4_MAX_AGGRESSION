#!/usr/bin/env python3
"""Audita catálogos M3U y extiende REA con intenciones 4K/6K; no transcodifica.
No hace peticiones de red. No registra URLs ni accesos del proveedor.
"""
from __future__ import annotations
import argparse
import base64
import collections
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import parse_qs, urlsplit

VERSION = 'ape-4k-premium6k-intent/1'
PROFILES = [f'P{i}{suffix}' for suffix in ('', '.5') for i in range(6)]
HEADER_TAG = '#EXT-X-APE-AUDIT-POLICY:'
LEGACY_TAG = '#EXT-X-APE-AUDIT-ORIGINAL:'
OUTPUT_TAG = '#EXT-X-APE-OUTPUT-REQUEST:'
PREMIUM_TAG = '#EXT-X-APE-PREMIUM-REQUEST:'
ATTR_RE = re.compile(r'([\w.-]+)="([^"]*)"')
HLS_ATTR_RE = re.compile(r'([A-Z-]+)=((?:"[^"]*")|[^,]*)')


def encode(obj):
    return base64.urlsafe_b64encode(json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()).decode().rstrip('=')


def policy():
    common = {
        'preserve_source_truth': True,
        'preserve_existing_metadata': True,
        'inherit_existing_visual_tuning': True,
        'video_path': 'unchanged_existing_uri',
        'codec_selection': {
            'preferred_family': 'hevc', 'only_existing_verified_renditions': True,
            'within_hevc': 'highest_verified_quality_supported_by_device_and_network',
            'fallback': 'highest_verified_compatible_source',
            'do_not_transcode_by_headers': True,
            'no_claim_of_lossless': True,
        },
        'runtime_gate': {
            'requires_player_or_helper': True, 'verify_source_with': 'ffprobe_or_decoder',
            'verify_device_capabilities': True, 'never_forge_device_descriptor': True,
            'unsupported_output': 'report_blocked_do_not_label_as_4k_or_6k',
            'continuity_fallback': 'native_only_with_explicit_output_status',
            'preserve_higher_resolution_source': True,
        },
        'floor_lock': {'requested': True, 'resolution': '3840x2160', 'state': 'not_executed'},
        'virtual_4k': {'requested': True, 'resolution': '3840x2160', 'kind': 'upscaled_if_needed'},
        'hdr_intent': {'policy': 'preserve_verified_source', 'sdr_to_hdr': 'disabled_by_default',
                       'dolby_vision_synthesis': False},
        'APE_VISUAL_FIRST': {'default': 0, 'enabled_value': 1,
                            'scope': 'experimental_local_visual_tuning',
                            'override_source_hdr_metadata': False},
    }
    variants = {
        'standard_4k': {'label': '4K escalado si la fuente lo requiere', 'width': 3840,
                        'height': 2160, 'requested': True, 'executed': False,
                        'native_quality_claim': False},
        'premium_6k_simulated': {'label': 'Premium 6K simulada', 'width': 5760,
                               'height': 3240, 'requested': True, 'executed': False,
                               'native_quality_claim': False,
                               'processing': 'spatial_upscale_not_ai_superresolution'},
    }
    return {
        'schema': VERSION, 'extends': 'ape.rea-intent/1', 'deployment': 'not_installed',
        'active_default_variant': 'standard_4k', 'common': common,
        'profiles': {p: {'inherit_existing_profile': p, 'variants': variants} for p in PROFILES},
        'zapping': {
            'required': True, 'method': 'POST', 'url_change_method': 'PUT',
            'endpoint': None, 'endpoint_state': 'requires_existing_vps_route',
            'fields': ['channel_id', 'channel_name', 'content_type', 'codec_hint',
                       'timestamp', 'profile', 'variant', 'policy_schema'],
            'async_nonblocking': True, 'video_path_unchanged': True,
            'execution_state': 'requires_player_or_local_helper',
            'timestamp_format': 'RFC3339_UTC',
            'must_not_send_provider_credentials': True,
        },
    }


def open_text(path, mode='rt'):
    if str(path).endswith('.gz'):
        return gzip.open(path, mode, encoding='utf-8', newline='')
    return open(path, mode, encoding='utf-8', newline='')


def blocks(path):
    current = []
    with open_text(path) as f:
        for line in f:
            if line.startswith('#EXTINF:') and current:
                yield current
                current = []
            current.append(line)
        if current:
            yield current


def archive(line):
    content = line.rstrip('\r\n')
    return LEGACY_TAG + encode({'line': content, 'eol': line[len(content):]}) + '\n'


def extend_rea(old, profile):
    new = dict(old)
    new.update({
        'policyId': VERSION,
        'status': 'requested_only',
        'targetResolution': '3840x2160', 'targetWidth': 3840, 'targetHeight': 2160,
        'boxWidth': 3840, 'boxHeight': 2160,
        'mode': 'upscale_if_needed', 'enhancementRequested': True,
        'execution': 'not_verified', 'capacityGate': 'device_runtime',
        'outputPreference': 'preserve_verified_source',
    })
    new['outputPolicy'] = {
        'schema': VERSION, 'profile': profile, 'defaultVariant': 'standard_4k',
        'floorLock': '3840x2160', 'premiumRequested': True,
        'premiumResolution': '5760x3240', 'premiumKind': 'simulated_spatial_upscale',
        'preserveHigherSource': True, 'sourceTruthUnchanged': True,
        'inheritExistingVisualTuning': True, 'hdrPolicy': 'preserve_verified_source',
        'nativeResolutionClaim': False, 'executed': False,
    }
    return new


def patch_block(lines):
    if not lines or not lines[0].startswith('#EXTINF:'):
        return [line for line in lines if not line.startswith(HEADER_TAG)] + [HEADER_TAG + encode(policy()) + '\n']
    attrs = dict(ATTR_RE.findall(lines[0]))
    profile = attrs.get('ape-profile', 'runtime')
    already = any(line.startswith(OUTPUT_TAG) for line in lines)
    result = []
    for line in lines:
        if line.startswith((OUTPUT_TAG, PREMIUM_TAG)):
            continue
        new = line
        if line.startswith('#EXT-X-APE-REA:'):
            old = json.loads(line.split(':', 1)[1])
            new = '#EXT-X-APE-REA:' + json.dumps(extend_rea(old, profile), ensure_ascii=False, separators=(',', ':')) + '\n'
        elif line.startswith('#EXT-X-APE-UPSCALE:'):
            new = '#EXT-X-APE-UPSCALE:REQUESTED;TARGET=3840x2160;PREMIUM_TARGET=5760x3240;SOURCE=UNKNOWN;MODE=UPSCALE_IF_NEEDED;EXECUTOR=existing_player_or_helper;EXECUTED=0;PRESERVE_HIGHER_SOURCE=1\n'
        elif line.startswith('#EXT-X-APE-4K-PREMIUM:'):
            new = '#EXT-X-APE-4K-PREMIUM:REQUESTED;TARGET=3840x2160;SOURCE_NATIVE_CLAIM=0;CAPACITY_CHECK=RUNTIME;EXECUTED=0\n'
        elif line.startswith('#EXT-X-APE-CRYSTAL-6K:'):
            new = '#EXT-X-APE-CRYSTAL-6K:REQUESTED;TARGET=5760x3240;VARIANT=PREMIUM;CAPACITY_CHECK=RUNTIME;EXECUTED=0\n'
        elif line.startswith('#EXT-X-APE-CRYSTAL-6K-MODE:'):
            new = '#EXT-X-APE-CRYSTAL-6K-MODE:SIMULATED_SPATIAL_UPSCALE;SOURCE=unknown;NATIVE_CLAIM=0;EXECUTED=0\n'
        elif line.startswith('#EXT-X-STREAM-INF:'):
            # Esta lista es un catálogo IPTV, no un master HLS con variantes verificadas.
            # Conservar la declaración sin anunciar falsamente una variante HLS 6K/PQ.
            new = '#EXT-X-APE-AUDIT-UNVERIFIED-STREAM-INF:' + line.split(':', 1)[1]
        elif line.startswith('#EXTVLCOPT:video-filter='):
            # Sintaxis FFmpeg: conservar en metadata, no enviar como módulos VLC.
            new = '#EXT-X-APE-FFMPEG-FILTER-REQUEST:' + line.split('=', 1)[1]
        if new != line and not already and not line.startswith(('#EXT-X-STREAM-INF:', '#EXTVLCOPT:video-filter=')):
            result.append(archive(line))
        result.append(new)
    result.insert(1, OUTPUT_TAG + f'PROFILE={profile};VARIANT=standard_4k;TARGET=3840x2160;SOURCE_VERIFIED=0;EXECUTED=0\n')
    result.insert(2, PREMIUM_TAG + f'PROFILE={profile};VARIANT=premium_6k_simulated;TARGET=5760x3240;NATIVE_CLAIM=0;EXECUTED=0\n')
    return result


def audit(path, inventory=None):
    stats = {
        'schema': 'ape-audit/1', 'file_bytes': Path(path).stat().st_size,
        'channels': 0, 'uris': 0, 'source_resolution_verified': 0,
        'source_codec_verified': 0, 'source_hdr_verified': 0,
        'rea_present': 0, 'rea_null_target': 0, 'premium_requested': 0,
        'urls_with_full_metadata': 0, 'qoe_profile_mismatch': 0,
        'duplicate_channel_ids': 0, 'network_test_scope': 'none_in_this_script',
    }
    profiles = collections.Counter()
    tags = collections.Counter()
    device = collections.Counter()
    declarations = collections.Counter()
    cache = collections.Counter()
    mismatches = collections.Counter()
    duplicates = collections.Counter()
    ids = set()
    uri_hash = hashlib.sha256()
    input_hash = hashlib.sha256()
    output = open(inventory, 'w', encoding='utf-8') if inventory else None
    try:
        for block in blocks(path):
            for line in block:
                input_hash.update(line.encode())
                if line.startswith('#'):
                    tags[line.split(':', 1)[0].split(' ', 1)[0]] += 1
            if not block[0].startswith('#EXTINF:'):
                continue
            stats['channels'] += 1
            a = dict(ATTR_RE.findall(block[0]))
            channel_id = a.get('tvg-id', '')
            if channel_id:
                if channel_id in ids:
                    stats['duplicate_channel_ids'] += 1
                ids.add(channel_id)
            profile = a.get('ape-profile', 'unknown')
            profiles[profile] += 1
            per_keys = collections.Counter()
            row = {'channel_id': channel_id, 'profile': profile,
                   'source_resolution': None, 'source_codec': None,
                   'source_verified': False, 'output_requested': False,
                   'premium_requested': False, 'device_hint': None,
                   'url_contains_full_metadata': False, 'qoe_profile': None}
            for line in block[1:]:
                s = line.rstrip('\r\n')
                key = s.split(':', 1)[0]
                if s.startswith(('#EXTVLCOPT:', '#KODIPROP:')):
                    key = s.split('=', 1)[0]
                if key:
                    per_keys[key] += 1
                if s.startswith('#EXT-X-APE-RESOLUTION-VERIFIED:true'):
                    stats['source_resolution_verified'] += 1
                    row['source_verified'] = True
                if s.startswith('#EXT-X-APE-CODEC-VERIFIED:true'):
                    stats['source_codec_verified'] += 1
                if s.startswith('#EXT-X-APE-HDR-VERIFIED:true'):
                    stats['source_hdr_verified'] += 1
                if s.startswith('#EXT-X-APE-REA:'):
                    stats['rea_present'] += 1
                    rea = json.loads(s.split(':', 1)[1])
                    if rea.get('targetResolution') is None:
                        stats['rea_null_target'] += 1
                if s.startswith('#EXT-X-APE-QOE-CONTRACT:'):
                    qoe = json.loads(s.split(':', 1)[1])
                    row['qoe_profile'] = qoe.get('p')
                    if qoe.get('p') != profile:
                        stats['qoe_profile_mismatch'] += 1
                        mismatches[f'{profile}->{qoe.get("p")}'] += 1
                if s.startswith('#EXT-X-APE-CRYSTAL-6K:REQUESTED;'):
                    stats['premium_requested'] += 1
                    row['premium_requested'] = True
                if s.startswith(OUTPUT_TAG):
                    row['output_requested'] = True
                if s.startswith('#EXT-X-STREAM-INF:'):
                    attrs = dict(HLS_ATTR_RE.findall(s))
                    declarations[json.dumps(attrs, sort_keys=True)] += 1
                if s.startswith('#EXTVLCOPT:network-caching='):
                    cache[s.split('=', 1)[1]] += 1
                if s and not s.startswith('#'):
                    stats['uris'] += 1
                    uri_hash.update((s + '\n').encode())
                    u = urlsplit(s.split('|', 1)[0])
                    q = parse_qs(u.query)
                    full = any(k in q for k in ('ape_meta', 'ape_policy', 'metadata', 'idata', 'isession'))
                    if full:
                        stats['urls_with_full_metadata'] += 1
                        row['url_contains_full_metadata'] = True
                    if 'd' in q:
                        value = q['d'][0]
                        try:
                            d = json.loads(base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)))
                            device[json.dumps(d, sort_keys=True)] += 1
                            row['device_hint'] = d
                        except (ValueError, UnicodeError):
                            device['invalid'] += 1
            duplicates.update({k: 1 for k, v in per_keys.items() if v > 1 and k != LEGACY_TAG[:-1]})
            if output:
                output.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
    finally:
        if output:
            output.close()
    stats.update({
        'sha256_uncompressed_text': input_hash.hexdigest(),
        'uri_sequence_sha256': uri_hash.hexdigest(), 'profiles': dict(profiles),
        'tag_counts': dict(tags), 'device_descriptors': dict(device),
        'hls_unverified_declarations': dict(declarations),
        'network_caching_ms': dict(cache), 'qoe_profile_mismatches': dict(mismatches),
        'duplicate_metadata_keys_channels': dict(duplicates),
    })
    return stats


def patch(source, target):
    source = Path(source).resolve()
    target = Path(target).resolve()
    if source == target:
        raise ValueError('No sobrescribir el original: indique una salida distinta.')
    target.parent.mkdir(parents=True, exist_ok=True)
    # Salida atómica y permisos privados: el catálogo contiene URLs con credenciales.
    fd, temp = tempfile.mkstemp(dir=target.parent, prefix='.ape-', suffix='.tmp')
    os.close(fd)
    try:
        with open(temp, 'w', encoding='utf-8', newline='') as out:
            for block in blocks(source):
                out.writelines(patch_block(block))
        os.chmod(temp, 0o600)
        os.replace(temp, target)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('source', type=Path)
    ap.add_argument('--output', type=Path)
    ap.add_argument('--audit-json', type=Path, required=True)
    ap.add_argument('--inventory-jsonl', type=Path)
    ap.add_argument('--policy-json', type=Path)
    args = ap.parse_args()
    if not args.source.is_file():
        ap.error('Archivo de entrada inexistente.')
    before = audit(args.source, args.inventory_jsonl)
    record = {'before': before, 'implementation_state': 'metadata_only_not_deployed'}
    if args.output:
        patch(args.source, args.output)
        after = audit(args.output)
        if before['uri_sequence_sha256'] != after['uri_sequence_sha256']:
            raise RuntimeError('Se alteraron URLs: validación abortada.')
        if before['channels'] != after['channels']:
            raise RuntimeError('Se alteró el número de canales.')
        record['after'] = after
        record['preservation_checks'] = {
            'channel_count_unchanged': True, 'uri_sequence_unchanged': True,
            'original_not_overwritten': True,
            'source_verified_flags_not_forged': after['source_resolution_verified'] == before['source_resolution_verified'],
        }
    args.audit_json.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    if args.policy_json:
        args.policy_json.write_text(json.dumps(policy(), ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({
        'canales': before['channels'], 'perfiles_presentes': before['profiles'],
        'rea_sin_objetivo': before['rea_null_target'],
        'qoe_perfil_distinto': before['qoe_profile_mismatch'],
        'salida': str(args.output) if args.output else None,
        'estado': 'metadata_only_not_deployed',
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
