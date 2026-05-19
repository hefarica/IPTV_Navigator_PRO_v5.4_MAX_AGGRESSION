#!/usr/bin/env python3
"""
Synthesize LAB_CALIBRATED_BULLETPROOF_<ts>.json — v2 (anabolic enrichment)

v1 just merged base + old enrichment. v2 ALSO enriches each profile's settings
with the doctrine-defined quality fields that LAB was missing:
  · codec_chain_video / _video_family / _player_pref / _audio / _hdr (11-tier)
  · video_range, transfer_characteristics, matrix_coefficients (CICP)
  · target_framerate, nits_target, vmaf_target
  · bandwidth_floor / _target / _max
  · max_aggression flag for the most aggressive paths

Result: LAB is SSOT-complete, JS hardcoded fallbacks become dead code in
practice, and the BULLETPROOF carries every doctrine attribute end-to-end.
"""

import json
import os
from datetime import datetime
from pathlib import Path

DOWNLOADS = Path(os.environ.get('USERPROFILE', r'C:\Users\HFRC')) / 'Downloads'

BASE_NEW = DOWNLOADS / 'LAB_CALIBRATED_20260519_103942.json'
BULLETPROOF_OLD = DOWNLOADS / 'LAB_CALIBRATED_BULLETPROOF_20260511_195900.json'

now = datetime.now()
ts_str = now.strftime('%Y%m%d_%H%M%S')
OUTPUT = DOWNLOADS / f'LAB_CALIBRATED_BULLETPROOF_{ts_str}.json'

# ─── CLAUDE.md doctrine — per-profile quality SSOT ──────────────────────────
# Per CLAUDE.md "Bitrate Fallback por Resolución" + "Codec Ladder" + memory
# reference_lab_sync_stage15_prisma_directives.
# Each profile has a max-image target tier.
PROFILE_DOCTRINE = {
    'P0': {  # 8K HDR PREMIUM
        'hdr_mode':                 'HDR10',
        'video_range':              'PQ',
        'color_primaries':          9,        # BT.2020 (CICP code)
        'transfer_characteristics': 16,       # SMPTE ST.2084 / PQ
        'matrix_coefficients':      9,        # BT.2020 non-constant
        'codec_primary':            'HEVC',
        'codec_string':             'hvc1.2.4.L153.B0,ec-3',
        'resolution':               '7680x4320',
        'target_framerate':         '60FPS',
        'nits_target':              4000,
        'vmaf_target':              95,
        'bandwidth_floor':          15000000,   # 15 Mbps floor
        'bandwidth_target':         60000000,   # 60 Mbps target (8K AVERAGE-BANDWIDTH)
        'bandwidth_max':            80000000,   # 80 Mbps cap (8K BANDWIDTH)
        'avg_bandwidth_ratio':      0.75,
    },
    'P1': {  # 4K HDR
        'hdr_mode':                 'HDR10',
        'video_range':              'PQ',
        'color_primaries':          9,
        'transfer_characteristics': 16,
        'matrix_coefficients':      9,
        'codec_primary':            'HEVC',
        'codec_string':             'hvc1.2.4.L153.B0,ec-3',
        'resolution':               '3840x2160',
        'target_framerate':         '60FPS',
        'nits_target':              1500,
        'vmaf_target':              93,
        'bandwidth_floor':          12000000,
        'bandwidth_target':         22000000,
        'bandwidth_max':            28000000,
        'avg_bandwidth_ratio':      0.78,
    },
    'P2': {  # 4K HDR (lower tier) / QHD
        'hdr_mode':                 'HDR10',
        'video_range':              'PQ',
        'color_primaries':          9,
        'transfer_characteristics': 16,
        'matrix_coefficients':      9,
        'codec_primary':            'HEVC',
        'codec_string':             'hvc1.2.4.L150.B0,ec-3',
        'resolution':               '3840x2160',
        'target_framerate':         '30FPS',
        'nits_target':              1000,
        'vmaf_target':              91,
        'bandwidth_floor':          8000000,
        'bandwidth_target':         12000000,
        'bandwidth_max':            16000000,
        'avg_bandwidth_ratio':      0.78,
    },
    'P3': {  # FHD 60fps SDR (baseline universal)
        'hdr_mode':                 'SDR',
        'video_range':              'SDR',
        'color_primaries':          None,
        'transfer_characteristics': None,
        'matrix_coefficients':      None,
        'codec_primary':            'HEVC',
        'codec_string':             'hvc1.2.4.L120.B0,mp4a.40.2',
        'resolution':               '1920x1080',
        'target_framerate':         '60FPS',
        'nits_target':              400,
        'vmaf_target':              88,
        'bandwidth_floor':          5000000,
        'bandwidth_target':         9000000,
        'bandwidth_max':            12000000,
        'avg_bandwidth_ratio':      0.78,
    },
    'P4': {  # FHD 30fps SDR / HD
        'hdr_mode':                 'SDR',
        'video_range':              'SDR',
        'color_primaries':          None,
        'transfer_characteristics': None,
        'matrix_coefficients':      None,
        'codec_primary':            'AVC',
        'codec_string':             'avc1.640028,mp4a.40.2',
        'resolution':               '1920x1080',
        'target_framerate':         '30FPS',
        'nits_target':              100,
        'vmaf_target':              82,
        'bandwidth_floor':          3000000,
        'bandwidth_target':         6500000,
        'bandwidth_max':            9000000,
        'avg_bandwidth_ratio':      0.78,
    },
    'P5': {  # HD universal compat — last resort
        'hdr_mode':                 'SDR',
        'video_range':              'SDR',
        'color_primaries':          None,
        'transfer_characteristics': None,
        'matrix_coefficients':      None,
        'codec_primary':            'AVC',
        'codec_string':             'avc1.42E01E,mp4a.40.2',
        'resolution':               '1280x720',
        'target_framerate':         '30FPS',
        'nits_target':              100,
        'vmaf_target':              75,
        'bandwidth_floor':          1500000,
        'bandwidth_target':         4000000,
        'bandwidth_max':            5500000,
        'avg_bandwidth_ratio':      0.78,
    },
}

# ─── 11-tier HEVC cascade per ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md ───
CODEC_CHAINS = {
    'codec_chain_video_family': (
        'HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L4.1>'
        'HEVC-MAIN10-L4.0>HEVC-MAIN10-L3.1>HEVC-MAIN-L5.1>HEVC-MAIN-L5.0>'
        'HEVC-MAIN-L4.0>HEVC-MAIN-L3.1>H264-HIGH'
    ),
    'codec_chain_video': (
        'hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.B0,hvc1.2.4.L123.B0,'
        'hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,hvc1.1.6.L153.B0,hvc1.1.6.L150.B0,'
        'hvc1.1.6.L120.B0,hvc1.1.6.L93.B0,avc1.640028'
    ),
    'codec_chain_audio':       'ec-3,ac-3,mp4a.40.2,mp4a.40.5',
    'codec_chain_hdr':         'hdr10,hlg,sdr',
    'codec_chain_player_pref': 'hvc1,hev1,h265,avc1,h264',
}


def enrich_profile_settings(profile_id: str, settings: dict) -> dict:
    """Merge doctrine defaults into a profile's settings WITHOUT clobbering
    existing LAB values (LAB SSOT wins per iptv-lab-ssot-no-clamp doctrine)."""
    doctrine = PROFILE_DOCTRINE.get(profile_id, {})
    enriched = dict(settings)
    fields_added = []
    for k, v in doctrine.items():
        if k not in enriched or enriched[k] in (None, '', 'null'):
            if v is not None:
                enriched[k] = v
                fields_added.append(k)
    for k, v in CODEC_CHAINS.items():
        if k not in enriched or enriched[k] in (None, '', 'null'):
            enriched[k] = v
            fields_added.append(k)
    return enriched, fields_added


def main():
    print(f'Reading base: {BASE_NEW}')
    with open(BASE_NEW, encoding='utf-8-sig') as f:
        base = json.load(f)

    print(f'Reading old BULLETPROOF: {BULLETPROOF_OLD}')
    with open(BULLETPROOF_OLD, encoding='utf-8-sig') as f:
        old_bp = json.load(f)

    out = dict(base)
    out['lab_schema_variant'] = old_bp.get('lab_schema_variant', 'bulletproof_v2.3_anabolic')
    out['lab_version'] = f'omega_v1_bulletproof_{now.strftime("%Y%m%d")}'
    out['exported_at'] = now.strftime('%Y-%m-%dT%H:%M:%S')

    # Copy enrichment blocks from old BULLETPROOF
    ENRICHMENT_KEYS = ('omega_gap_plan', 'bulletproof', 'meta_per_profile', 'prisma_lab_sync_v20')
    for k in ENRICHMENT_KEYS:
        if k in old_bp:
            out[k] = old_bp[k]

    # ── ANABOLIC ENRICHMENT: complete each profile's settings per doctrine ──
    enrichment_report = {}
    for pid in ('P0', 'P1', 'P2', 'P3', 'P4', 'P5'):
        p = out['profiles_calibrated'].get(pid, {})
        if 'settings' not in p:
            p['settings'] = {}
        enriched, added = enrich_profile_settings(pid, p['settings'])
        p['settings'] = enriched
        enrichment_report[pid] = {
            'fields_added_count': len(added),
            'fields_added':       added,
            'settings_total':     len(enriched),
        }
        print(f'  {pid}: added {len(added)} doctrine fields (settings now {len(enriched)})')

    # Add player_target placeholder
    pm = out.setdefault('placeholders_map', {})
    pm['{config.player_target}'] = {
        'source': '7_NIVEL_3_CHANNEL.player_target',
        'description': (
            'Player overlay target enum (VLC/KODI/TIVIMATE/OTT_NAV). '
            'Empty = default heuristic via LabConfigLoader::playerTargetForChannel.'
        ),
        'enum':         ['VLC', 'KODI', 'TIVIMATE', 'OTT_NAV', ''],
        'default':      '',
        'added_at':     now.strftime('%Y-%m-%dT%H:%M:%S'),
        'doctrine_ref': '.agents/artifacts/ARTIFACT_FASE1_PROFUNDO_DESTRIPE.md',
    }

    # Sprint 2026-05-18..19 metadata + anabolic enrichment trail
    out['sprint_2026_05_18_19'] = {
        'generator_fixes': {
            'R-1_VIDEO_RANGE_gated_on_probe':       '3fd36c3',
            'D-1_TYPE_1_hardcoded_neutralized':     '3fd36c3',
            'Agent_F_E2E_SSOT_build_stream_inf':    '19d6f27',
            '11_tier_HEVC_cascade':                 '19d6f27',
        },
        'resolver_fixes': {
            'G-1_HDR10_CICP_trifecta_emission':     '36aa057',
            'G-2_HDCP_propagation':                 '36aa057',
            'G-3_STABLE_VARIANT_ID':                '36aa057',
        },
        'cache_bust_bumped':                        '2d4c8d7',
        'lab_additions': {
            'player_target_column_sheet7':         'col 7 row 5, validation =lst_PlayerTargets',
            'sheet_98_VALIDATIONS_created':         'enum VLC|KODI|TIVIMATE|OTT_NAV',
            'sheet_32_PLACEHOLDERS_MAP_row_69':     '{config.player_target} added',
            'named_range_lst_PlayerTargets':        "='98_VALIDATIONS'!$B$2:$B$6",
        },
        'anabolic_enrichment': enrichment_report,
        'smoke_invariants_active': [
            'H-1 no TYPE-1 substring',
            'H-2 no SUPPLEMENTAL-CODECS hardcoded',
            'H-3 VIDEO-RANGE=PQ requires probe evidence',
            'H-4 PQ/HLG STREAM-INF requires CICP trifecta',
        ],
    }

    # Recompute meta_per_profile to reflect anabolic enrichment
    out['meta_per_profile'] = {
        **out.get('meta_per_profile', {}),
        'anabolic_enriched_at': now.strftime('%Y-%m-%dT%H:%M:%S'),
        'anabolic_enricher':    'synthesize_bulletproof_v2.py',
        'doctrine_ref':         'CLAUDE.md + ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md',
        'profiles_total_settings': sum(len(out['profiles_calibrated'][p].get('settings', {})) for p in 'P0 P1 P2 P3 P4 P5'.split()),
    }

    # Write output
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    size = os.path.getsize(OUTPUT)
    print()
    print(f'Wrote: {OUTPUT}')
    print(f'Size:  {size} bytes ({size/1024:.1f} KB)')
    print(f'Total top-level keys: {len(out)}')
    print(f'Total placeholders:   {len(pm)}')


if __name__ == '__main__':
    main()
