#!/usr/bin/env python3.11
"""
APE PEP ULTIMATE v5.3 — FUSION DEFINITIVA
Fusiona v5.1 (anti-freeze calibrado) + v5.2 (LCEVC 3 fases completo)
con estructura VLC-compatible garantizada.

REGLA ESTRUCTURAL INVIOLABLE (por qué v5.1 reproduce y v5.2 no):
  #EXTINF        ← VLC empieza a leer aquí
  #EXTHTTP       ← VLC carga los headers HTTP
  #EXTVLCOPT×N   ← VLC aplica opciones de reproducción
  #KODIPROP×N    ← Kodi/ExoPlayer aplican sus opciones
  #EXT-X-APE-*×N ← Todos los tags APE (VLC los ignora, OTT los usa)
  #EXT-X-STREAM-INF ← VLC toma la URL de la línea siguiente
  URL            ← La URL del canal

NUNCA poner #EXT-X-STREAM-INF ANTES de #EXTINF (rompe VLC).
"""

import re
import json
from datetime import datetime

SOURCE = '/home/ubuntu/upload/APE_PEP_ULTIMATE_v5.1_ANTI_FREEZE.m3u8'
OUTPUT = '/home/ubuntu/work_v5/APE_PEP_ULTIMATE_v5.3_FUSION.m3u8'

# ─── Perfiles P0-P5 fusionados: v5.1 anti-freeze + v5.2 LCEVC completo ───────
PROFILES = {
    'P0': {
        # Identidad
        'name': 'ULTRA_EXTREME_8K', 'resolution': '3840x2160',
        'fps': 120, 'bitrate_kbps': 80000, 'bandwidth': 100000000,
        'codec_str': 'hvc1.2.4.L186.B0,mp4a.40.2',
        'hdr_profile': 'hdr10,dolby_vision,hlg',
        # Anti-freeze v5.1 calibrado
        'network_cache': 15000, 'live_cache': 15000, 'file_cache': 51000,
        'clock_jitter': 1500, 'clock_synchro': 1,
        'reconnect_timeout': 5, 'reconnect_max': 200, 'reconnect_delay': 50,
        'connection_timeout': '2500,3500,6000', 'read_timeout': '6000,9000,12000',
        'retry_count': '10,12,15', 'retry_delay': '120,200,350',
        'prefetch_segments': '10,15,20', 'prefetch_parallel': '4,6,8',
        'initial_bitrate': 80000000, 'compression_level': 0,
        'kodi_live_delay': 51, 'exoplayer_buffer_min': 51000,
        'manifest_refresh': 51000,
        'buffer_target': 60000, 'buffer_min': 15000, 'buffer_max': 200000,
        # QoS/QoE
        'qos_dscp': 'EF', 'qoe_score': '5.0', 'vqs_score': 95,
        # LCEVC v5.2 completo
        'lcevc_enabled': True, 'lcevc_state': 'ACTIVE',
        'lcevc_standard': 'MPEG-5-PART-2', 'lcevc_profile': 'MAIN_4_2_2',
        'lcevc_scale_factor': '2x', 'lcevc_player_required': '0',
        'lcevc_base_codec': 'AV1', 'lcevc_base_layer_scale': '0.25',
        'lcevc_base_bitrate_ratio': '0.60', 'lcevc_enh_bitrate_ratio': '0.40',
        'lcevc_l1_block': '4X4', 'lcevc_l1_deblock': '1',
        'lcevc_l1_precision': '10BIT', 'lcevc_l1_temporal': '1',
        'lcevc_l2_block': '2X2', 'lcevc_l2_temporal': '1',
        'lcevc_l2_precision': '10BIT', 'lcevc_l2_upscale': 'LANCZOS4',
        'lcevc_transport': 'SEI_NAL', 'lcevc_transport_fb1': 'WEBM_METADATA',
        'lcevc_transport_fb2': 'MPEG_TS_PID', 'lcevc_mpeg_ts_pid': '0x1FFF',
        'lcevc_sei_nal_type': '4', 'lcevc_webm_track_id': '3',
        'lcevc_parallel_blocks': '1', 'lcevc_parallel_threads': '16',
        'lcevc_decode_order': 'L1_THEN_L2', 'lcevc_hw_accel': 'PREFERRED',
        'lcevc_sw_fallback': '1', 'lcevc_mode': 'SEI_METADATA',
        'lcevc_fallback': 'BASE_ONLY',
        # Hydra/Telchemy
        'hydra_stealth': 'enabled', 'hydra_ua_rotation': 'enabled',
        'hydra_fp_masking': 'enabled',
        'telchemy_vstq': 'enabled', 'telchemy_vsmq': 'enabled',
        'telchemy_tr101290': 'enabled', 'telchemy_qoe_target': '5.0',
    },
    'P1': {
        'name': '4K_SUPREME_60FPS', 'resolution': '3840x2160',
        'fps': 60, 'bitrate_kbps': 26900, 'bandwidth': 26900000,
        'codec_str': 'hvc1.1.6.L150.B0,mp4a.40.2',
        'hdr_profile': 'hdr10,hlg',
        'network_cache': 15000, 'live_cache': 15000, 'file_cache': 51000,
        'clock_jitter': 1500, 'clock_synchro': 1,
        'reconnect_timeout': 5, 'reconnect_max': 200, 'reconnect_delay': 50,
        'connection_timeout': '2500,3500,6000', 'read_timeout': '6000,9000,12000',
        'retry_count': '10,12,15', 'retry_delay': '120,200,350',
        'prefetch_segments': '10,15,20', 'prefetch_parallel': '4,6,8',
        'initial_bitrate': 26900000, 'compression_level': 0,
        'kodi_live_delay': 51, 'exoplayer_buffer_min': 51000,
        'manifest_refresh': 51000,
        'buffer_target': 60000, 'buffer_min': 15000, 'buffer_max': 200000,
        'qos_dscp': 'EF', 'qoe_score': '5.0', 'vqs_score': 95,
        'lcevc_enabled': True, 'lcevc_state': 'ACTIVE',
        'lcevc_standard': 'MPEG-5-PART-2', 'lcevc_profile': 'MAIN_4_2_0',
        'lcevc_scale_factor': '2x', 'lcevc_player_required': '0',
        'lcevc_base_codec': 'HEVC', 'lcevc_base_layer_scale': '0.25',
        'lcevc_base_bitrate_ratio': '0.55', 'lcevc_enh_bitrate_ratio': '0.45',
        'lcevc_l1_block': '4X4', 'lcevc_l1_deblock': '1',
        'lcevc_l1_precision': '10BIT', 'lcevc_l1_temporal': '1',
        'lcevc_l2_block': '2X2', 'lcevc_l2_temporal': '1',
        'lcevc_l2_precision': '10BIT', 'lcevc_l2_upscale': 'LANCZOS3',
        'lcevc_transport': 'SEI_NAL', 'lcevc_transport_fb1': 'WEBM_METADATA',
        'lcevc_transport_fb2': 'MPEG_TS_PID', 'lcevc_mpeg_ts_pid': '0x1FFE',
        'lcevc_sei_nal_type': '4', 'lcevc_webm_track_id': '3',
        'lcevc_parallel_blocks': '1', 'lcevc_parallel_threads': '12',
        'lcevc_decode_order': 'L1_THEN_L2', 'lcevc_hw_accel': 'PREFERRED',
        'lcevc_sw_fallback': '1', 'lcevc_mode': 'SEI_METADATA',
        'lcevc_fallback': 'BASE_ONLY',
        'hydra_stealth': 'enabled', 'hydra_ua_rotation': 'enabled',
        'hydra_fp_masking': 'enabled',
        'telchemy_vstq': 'enabled', 'telchemy_vsmq': 'enabled',
        'telchemy_tr101290': 'enabled', 'telchemy_qoe_target': '5.0',
    },
    'P2': {
        'name': '4K_EXTREME', 'resolution': '3840x2160',
        'fps': 30, 'bitrate_kbps': 15000, 'bandwidth': 15000000,
        'codec_str': 'hvc1.2.4.L150.B0,mp4a.40.2',
        'hdr_profile': 'hdr10',
        'network_cache': 15000, 'live_cache': 15000, 'file_cache': 51000,
        'clock_jitter': 1500, 'clock_synchro': 1,
        'reconnect_timeout': 5, 'reconnect_max': 200, 'reconnect_delay': 100,
        'connection_timeout': '3500,5000,8000', 'read_timeout': '8000,12000,15000',
        'retry_count': '8,10,12', 'retry_delay': '150,250,400',
        'prefetch_segments': '10,15,20', 'prefetch_parallel': '4,6,8',
        'initial_bitrate': 15000000, 'compression_level': 0,
        'kodi_live_delay': 51, 'exoplayer_buffer_min': 51000,
        'manifest_refresh': 51000,
        'buffer_target': 45000, 'buffer_min': 15000, 'buffer_max': 150000,
        'qos_dscp': 'EF', 'qoe_score': '4.8', 'vqs_score': 90,
        'lcevc_enabled': True, 'lcevc_state': 'SIGNAL_ONLY',
        'lcevc_standard': 'MPEG-5-PART-2', 'lcevc_profile': 'MAIN_4_2_0',
        'lcevc_scale_factor': '2x', 'lcevc_player_required': '0',
        'lcevc_base_codec': 'HEVC', 'lcevc_base_layer_scale': '0.25',
        'lcevc_base_bitrate_ratio': '0.65', 'lcevc_enh_bitrate_ratio': '0.35',
        'lcevc_l1_block': '4X4', 'lcevc_l1_deblock': '1',
        'lcevc_l1_precision': '10BIT', 'lcevc_l1_temporal': '1',
        'lcevc_l2_block': '2X2', 'lcevc_l2_temporal': '0',
        'lcevc_l2_precision': '10BIT', 'lcevc_l2_upscale': 'BILINEAR',
        'lcevc_transport': 'SEI_NAL', 'lcevc_transport_fb1': 'MPEG_TS_PID',
        'lcevc_transport_fb2': 'WEBM_METADATA', 'lcevc_mpeg_ts_pid': '0x1FFD',
        'lcevc_sei_nal_type': '4', 'lcevc_webm_track_id': '3',
        'lcevc_parallel_blocks': '1', 'lcevc_parallel_threads': '8',
        'lcevc_decode_order': 'L1_THEN_L2', 'lcevc_hw_accel': 'OPTIONAL',
        'lcevc_sw_fallback': '1', 'lcevc_mode': 'SEI_METADATA',
        'lcevc_fallback': 'BASE_ONLY',
        'hydra_stealth': 'enabled', 'hydra_ua_rotation': 'enabled',
        'hydra_fp_masking': 'enabled',
        'telchemy_vstq': 'enabled', 'telchemy_vsmq': 'enabled',
        'telchemy_tr101290': 'enabled', 'telchemy_qoe_target': '4.8',
    },
    'P3': {
        'name': 'FHD_ADVANCED', 'resolution': '1920x1080',
        'fps': 60, 'bitrate_kbps': 8000, 'bandwidth': 8000000,
        'codec_str': 'hvc1.1.6.L123.B0,mp4a.40.2',
        'hdr_profile': '',
        'network_cache': 15000, 'live_cache': 15000, 'file_cache': 51000,
        'clock_jitter': 1500, 'clock_synchro': 1,
        'reconnect_timeout': 5, 'reconnect_max': 200, 'reconnect_delay': 100,
        'connection_timeout': '3500,5000,8000', 'read_timeout': '8000,12000,15000',
        'retry_count': '8,10,12', 'retry_delay': '150,250,400',
        'prefetch_segments': '10,15,20', 'prefetch_parallel': '4,6,8',
        'initial_bitrate': 8000000, 'compression_level': 0,
        'kodi_live_delay': 51, 'exoplayer_buffer_min': 51000,
        'manifest_refresh': 51000,
        'buffer_target': 40000, 'buffer_min': 15000, 'buffer_max': 120000,
        'qos_dscp': 'AF41', 'qoe_score': '4.5', 'vqs_score': 85,
        'lcevc_enabled': True, 'lcevc_state': 'SIGNAL_ONLY',
        'lcevc_standard': 'MPEG-5-PART-2', 'lcevc_profile': 'MAIN_4_2_0',
        'lcevc_scale_factor': '2x', 'lcevc_player_required': '0',
        'lcevc_base_codec': 'HEVC', 'lcevc_base_layer_scale': '0.25',
        'lcevc_base_bitrate_ratio': '0.70', 'lcevc_enh_bitrate_ratio': '0.30',
        'lcevc_l1_block': '4X4', 'lcevc_l1_deblock': '1',
        'lcevc_l1_precision': '8BIT', 'lcevc_l1_temporal': '1',
        'lcevc_l2_block': '4X4', 'lcevc_l2_temporal': '0',
        'lcevc_l2_precision': '8BIT', 'lcevc_l2_upscale': 'BILINEAR',
        'lcevc_transport': 'SEI_NAL', 'lcevc_transport_fb1': 'MPEG_TS_PID',
        'lcevc_transport_fb2': 'WEBM_METADATA', 'lcevc_mpeg_ts_pid': '0x1FFC',
        'lcevc_sei_nal_type': '4', 'lcevc_webm_track_id': '3',
        'lcevc_parallel_blocks': '1', 'lcevc_parallel_threads': '6',
        'lcevc_decode_order': 'L1_THEN_L2', 'lcevc_hw_accel': 'OPTIONAL',
        'lcevc_sw_fallback': '1', 'lcevc_mode': 'SEI_METADATA',
        'lcevc_fallback': 'BASE_ONLY',
        'hydra_stealth': 'enabled', 'hydra_ua_rotation': 'enabled',
        'hydra_fp_masking': 'enabled',
        'telchemy_vstq': 'enabled', 'telchemy_vsmq': 'enabled',
        'telchemy_tr101290': 'enabled', 'telchemy_qoe_target': '4.5',
    },
    'P4': {
        'name': 'HD_STABLE', 'resolution': '1280x720',
        'fps': 30, 'bitrate_kbps': 4500, 'bandwidth': 4500000,
        'codec_str': 'avc1.640020,mp4a.40.2',
        'hdr_profile': '',
        'network_cache': 15000, 'live_cache': 15000, 'file_cache': 51000,
        'clock_jitter': 1500, 'clock_synchro': 1,
        'reconnect_timeout': 5, 'reconnect_max': 200, 'reconnect_delay': 200,
        'connection_timeout': '5000,8000,12000', 'read_timeout': '10000,15000,20000',
        'retry_count': '6,8,10', 'retry_delay': '200,350,500',
        'prefetch_segments': '10,15,20', 'prefetch_parallel': '3,4,6',
        'initial_bitrate': 4500000, 'compression_level': 0,
        'kodi_live_delay': 51, 'exoplayer_buffer_min': 51000,
        'manifest_refresh': 51000,
        'buffer_target': 35000, 'buffer_min': 15000, 'buffer_max': 100000,
        'qos_dscp': 'AF31', 'qoe_score': '4.0', 'vqs_score': 75,
        'lcevc_enabled': False, 'lcevc_state': 'DISABLED',
        'lcevc_fallback': 'BASE_ONLY', 'lcevc_player_required': '0',
        'hydra_stealth': 'enabled', 'hydra_ua_rotation': 'enabled',
        'hydra_fp_masking': 'enabled',
        'telchemy_vstq': 'enabled', 'telchemy_vsmq': 'enabled',
        'telchemy_tr101290': 'enabled', 'telchemy_qoe_target': '4.0',
    },
    'P5': {
        'name': 'SD_FAILSAFE', 'resolution': '854x480',
        'fps': 25, 'bitrate_kbps': 1500, 'bandwidth': 1500000,
        'codec_str': 'avc1.42001e,mp4a.40.2',
        'hdr_profile': '',
        'network_cache': 15000, 'live_cache': 15000, 'file_cache': 51000,
        'clock_jitter': 1500, 'clock_synchro': 1,
        'reconnect_timeout': 5, 'reconnect_max': 200, 'reconnect_delay': 200,
        'connection_timeout': '6000,10000,15000', 'read_timeout': '12000,18000,25000',
        'retry_count': '5,6,8', 'retry_delay': '250,400,600',
        'prefetch_segments': '10,15,20', 'prefetch_parallel': '2,3,4',
        'initial_bitrate': 1500000, 'compression_level': 0,
        'kodi_live_delay': 51, 'exoplayer_buffer_min': 51000,
        'manifest_refresh': 51000,
        'buffer_target': 30000, 'buffer_min': 15000, 'buffer_max': 80000,
        'qos_dscp': 'BE', 'qoe_score': '3.5', 'vqs_score': 60,
        'lcevc_enabled': False, 'lcevc_state': 'DISABLED',
        'lcevc_fallback': 'BASE_ONLY', 'lcevc_player_required': '0',
        'hydra_stealth': 'enabled', 'hydra_ua_rotation': 'enabled',
        'hydra_fp_masking': 'enabled',
        'telchemy_vstq': 'enabled', 'telchemy_vsmq': 'enabled',
        'telchemy_tr101290': 'enabled', 'telchemy_qoe_target': '3.5',
    },
}

def detect_profile(name, group):
    n = (name + ' ' + group).upper()
    if any(x in n for x in ['8K', 'UHD8K', '7680', '4320']):
        return 'P0'
    if any(x in n for x in ['4K', 'UHD', '2160', 'UHD4K', '4K60', 'ULTRA HD', 'ULTRA-HD']):
        return 'P1'
    if any(x in n for x in ['4K30', '4KEXTREME']):
        return 'P2'
    if any(x in n for x in ['FHD', '1080', 'FULLHD', 'FULL HD', 'FULL-HD']):
        return 'P3'
    if any(x in n for x in ['HD', '720']):
        return 'P4'
    return 'P3'  # Default conservador

def build_exthttp(p, ch_name, ch_id, server_url):
    """Construye el bloque #EXTHTTP con todos los headers de v5.1 + LCEVC de v5.2."""
    h = {
        # ── Headers HTTP estándar ──
        "User-Agent": f"Mozilla/5.0 (APE-NAVIGATOR; {p['name']}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/vnd.apple.mpegurl, application/x-mpegURL, video/mp2t, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Keep-Alive": "timeout=120, max=100",
        "DNT": "0",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        # C8 (2026-05-11) — eliminado Range:bytes=0- (m3u8 no es byte-rangeable).
        # Ver memoria feedback_exthttp_traps.md trampa #9.
        # "Range": "bytes=0-",
        "Origin": "https://iptv-ape.duckdns.org",
        "Referer": "https://iptv-ape.duckdns.org/",
        "X-Requested-With": "XMLHttpRequest",
        "X-App-Version": "APE_9.1_ULTIMATE_HDR",
        # ── Buffer anti-freeze v5.1 ──
        "X-Buffer-Size": "100000",
        "X-Buffer-Target": str(p['buffer_target']),
        "X-Buffer-Min": str(p['buffer_min']),
        "X-Buffer-Max": str(p['buffer_max']),
        "X-Network-Caching": str(p['network_cache']),
        "X-Live-Caching": str(p['live_cache']),
        "X-File-Caching": str(p['file_cache']),
        "X-Buffer-Strategy": "ultra-aggressive",
        "X-Buffer-Underrun-Strategy": "aggressive-refill",
        # ── Reconexión anti-freeze v5.1 ──
        "X-Initial-Bitrate": str(p['initial_bitrate']),
        "X-Bandwidth-Preference": "unlimited",
        "X-BW-Estimation-Window": "10",
        "X-BW-Confidence-Threshold": "0.95",
        "X-BW-Smooth-Factor": "0.05",
        "X-Retry-Count": p['retry_count'],
        "X-Retry-Delay-Ms": p['retry_delay'],
        "X-Connection-Timeout-Ms": p['connection_timeout'],
        "X-Read-Timeout-Ms": p['read_timeout'],
        "X-Reconnect-On-Error": "true,immediate,adaptive",
        "X-Max-Reconnect-Attempts": "40",
        "X-Reconnect-Delay-Ms": str(p['reconnect_delay']),
        "X-Seamless-Failover": "true-ultra",
        # ── Prefetch ──
        "X-Prefetch-Segments": p['prefetch_segments'],
        "X-Parallel-Segments": p['prefetch_parallel'],
        "X-Segment-Preload": "true",
        "X-Concurrent-Downloads": p['prefetch_parallel'],
        # ── Monitoreo de red ──
        "X-Packet-Loss-Monitor": "enabled,aggressive",
        "X-RTT-Monitoring": "enabled,aggressive",
        "X-Congestion-Detect": "enabled,aggressive-extreme",
        "X-ExoPlayer-Buffer-Min": str(p['exoplayer_buffer_min']),
        "X-Manifest-Refresh": str(p['manifest_refresh']),
        "X-KODI-LIVE-DELAY": str(p['kodi_live_delay']),
        # ── APE ──
        "X-APE-STRATEGY": "ultra-aggressive",
        "X-APE-Prefetch-Segments": "20",
        "X-APE-Quality-Threshold": "0.99",
        "X-APE-Version": "18.2",
        "X-APE-Profile": "P1" if p['name'] == '4K_SUPREME_60FPS' else list(PROFILES.keys())[[v['name'] for v in PROFILES.values()].index(p['name'])],
        "X-APE-QoE": p['qoe_score'],
        "X-APE-Guardian": "enabled",
        "X-APE-DNA-Version": "18.2",
        "X-APE-DNA-Fields": "124",
        "X-APE-DNA-Sync": "bidirectional",
        "X-QoS-DSCP": p['qos_dscp'],
        "X-QoS-Priority": "high",
        # ── Guardian ──
        "X-APE-Guardian-Enabled": "true",
        "X-APE-Guardian-State": "ONLINE",
        "X-APE-Guardian-Fallback-Level": "3",
        "X-APE-Guardian-Memory": "enabled",
        "X-APE-Guardian-Continuity": "guaranteed",
        # ── Resiliencia ──
        "X-APE-Resilience-Strategy": "proactive_failover",
        "X-APE-Resilience-Chain": "7-levels",
        "X-APE-Resilience-Circuit-Breaker": "enabled",
        "X-APE-Resilience-Max-Retries": "3",
        "X-APE-Resilience-Retry-Backoff": "exponential",
        "X-APE-Resilience-Silent-Reconnect": "enabled",
        # ── Telchemy ──
        "X-APE-Telchemy-VSTQ": p['telchemy_vstq'],
        "X-APE-Telchemy-VSMQ": p['telchemy_vsmq'],
        "X-APE-Telchemy-TR101290": p['telchemy_tr101290'],
        "X-APE-Telchemy-QoE-Target": p['telchemy_qoe_target'],
        # ── Hydra Stealth ──
        "X-APE-Hydra-Stealth": p['hydra_stealth'],
        "X-APE-Hydra-UA-Rotation": p['hydra_ua_rotation'],
        "X-APE-Hydra-Fingerprint-Masking": p['hydra_fp_masking'],
        # ── LCEVC v5.2 en EXTHTTP ──
        "X-LCEVC-Enabled": "true" if p['lcevc_enabled'] else "false",
        "X-LCEVC-State": p['lcevc_state'],
        "X-LCEVC-Standard": "MPEG-5-PART-2",
        "X-LCEVC-Enhancement": "mpeg5-part2",
        "X-LCEVC-Scale-Factor": p.get('lcevc_scale_factor', 'N/A'),
    }
    return '#EXTHTTP:' + json.dumps(h, separators=(',', ':'))

def build_extvlcopt(p):
    """Fusión de EXTVLCOPT: v5.1 (color, HDR, user-agent) + v5.2 (hw, deinterlace)."""
    opts = [
        f'network-caching={p["network_cache"]}',
        'http-reconnect=true',
        'http-continuous=true',
        f'clock-jitter={p["clock_jitter"]}',
        f'clock-synchro={p["clock_synchro"]}',
        f'live-caching={p["live_cache"]}',
        f'file-caching={p["file_cache"]}',
        f'http-user-agent=Mozilla/5.0 (APE-NAVIGATOR; {p["name"]}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'http-referer=auto',
        'http-forward-cookies=true',
        'http-max-retries=40',
        'http-timeout=10000',
        # Color/HDR de v5.1
        'video-color-space=BT2020',
        'video-transfer-function=SMPTE-ST2084',
        'video-color-primaries=BT2020',
        'video-color-range=limited',
        'tone-mapping=auto',
        'hdr-output-mode=auto',
        'sharpen-sigma=0.02',
        'contrast=1.05',
        'brightness=1.0',
        'saturation=1.1',
        'gamma=1.0',
        # Hardware/deinterlace de v5.2
        'avcodec-hw=any',
        'avcodec-threads=0',
        f'sout-mux-caching={p["live_cache"]}',
        'input-timeshift-granularity=50',
        'ts-seek-percent=0',
        'video-filter=deinterlace',
        'deinterlace-mode=yadif2x',
        'video-title-show=0',
        'fullscreen=1',
        'no-video-title-show',
        'hue=0',
    ]
    return [f'#EXTVLCOPT:{o}' for o in opts]

def build_kodiprop(p, profile_key):
    """KODIPROP con stream_headers completo."""
    sh = (
        f'User-Agent=Mozilla/5.0 (APE-NAVIGATOR; {p["name"]}) AppleWebKit/537.36'
        f'&X-APE-Profile={profile_key}'
        f'&X-LCEVC-State={p["lcevc_state"]}'
        f'&X-LCEVC-Compat=UNIVERSAL'
        f'&X-Buffer-Min={p["buffer_min"]}'
        f'&X-Clock-Jitter={p["clock_jitter"]}'
    )
    return [
        '#KODIPROP:inputstream=inputstream.adaptive',
        '#KODIPROP:inputstream.adaptive.manifest_type=hls',
        '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive',
        f'#KODIPROP:inputstream.adaptive.stream_headers={{"User-Agent":"Mozilla/5.0 (APE-NAVIGATOR; {p["name"]}) AppleWebKit/537.36","X-APE-Profile":"{profile_key}","X-LCEVC-State":"{p["lcevc_state"]}","X-Buffer-Min":"{p["buffer_min"]}","X-Clock-Jitter":"{p["clock_jitter"]}","X-Clock-Synchro":"{p["clock_synchro"]}"}}',
        f'#KODIPROP:inputstream.adaptive.live_delay={p["kodi_live_delay"]}',
    ]

def build_ape_tags(p, profile_key, ch, ch_id, server_url, ts):
    """Todos los tags #EXT-X-APE-* de v5.1 + los 30 tags LCEVC de v5.2."""
    tags = [
        # ── Identidad del canal (v5.1) ──
        f'#EXT-X-APE-VERSION:18.2',
        f'#EXT-X-APE-PROFILE:{profile_key}',
        f'#EXT-X-APE-CHANNEL-KEY:{ch_id}',
        f'#EXT-X-APE-STREAM-ID:{ch_id}',
        f'#EXT-X-APE-SERVER:{server_url}',
        f'#EXT-X-APE-CODEC:{p["codec_str"]}',
        f'#EXT-X-APE-RESOLUTION:{p["resolution"]}',
        f'#EXT-X-APE-FRAME-RATE:{p["fps"]}',
        f'#EXT-X-APE-BITRATE:{p["bitrate_kbps"]}kbps',
        f'#EXT-X-APE-HDR-PROFILE:{p["hdr_profile"]}' if p['hdr_profile'] else '#EXT-X-APE-HDR-PROFILE:sdr',
        # ── LCEVC básico v5.1 ──
        f'#EXT-X-APE-LCEVC-ENABLED:{"true" if p["lcevc_enabled"] else "false"}',
        f'#EXT-X-APE-LCEVC-STATE:{p["lcevc_state"]}',
        f'#EXT-X-APE-LCEVC-BASE-CODEC:{p.get("lcevc_base_codec", "N/A")}',
        f'#EXT-X-APE-LCEVC-ENHANCEMENT:mpeg5-part2',
        f'#EXT-X-APE-LCEVC-SCALE-FACTOR:{p.get("lcevc_scale_factor", "N/A")}',
        # ── QoE/QoS (v5.1) ──
        f'#EXT-X-APE-AI-SR-ENABLED:false',
        f'#EXT-X-APE-QOE-SCORE:{p["qoe_score"]}',
        f'#EXT-X-APE-QOS-DSCP:{p["qos_dscp"]}',
        f'#EXT-X-APE-QOS-BITRATE:{p["bitrate_kbps"]}kbps',
        f'#EXT-X-APE-QOS-PRIORITY:high',
        f'#EXT-X-APE-VQS-SCORE:{p["vqs_score"]}',
        # ── Buffer (v5.1) ──
        f'#EXT-X-APE-BUFFER-TARGET:{p["buffer_target"] // 1000}s',
        f'#EXT-X-APE-BUFFER-MIN:{p["buffer_min"] // 1000}s',
        f'#EXT-X-APE-BUFFER-MAX:{p["buffer_max"] // 1000}s',
        f'#EXT-X-APE-PREBUFFER:{p["buffer_min"] // 1000}s',
        # ── Guardian (v5.1) ──
        f'#EXT-X-APE-GUARDIAN-ENABLED:true',
        f'#EXT-X-APE-GUARDIAN-STATE:ONLINE',
        f'#EXT-X-APE-GUARDIAN-FALLBACK-LEVEL:3',
        f'#EXT-X-APE-GUARDIAN-MEMORY:enabled',
        f'#EXT-X-APE-GUARDIAN-CONTINUITY:guaranteed',
        # ── Resiliencia (v5.1) ──
        f'#EXT-X-APE-RESILIENCE-STRATEGY:proactive_failover',
        f'#EXT-X-APE-RESILIENCE-CHAIN:7-levels',
        f'#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:enabled',
        f'#EXT-X-APE-RESILIENCE-MAX-RETRIES:3',
        f'#EXT-X-APE-RESILIENCE-RETRY-BACKOFF:exponential',
        f'#EXT-X-APE-RESILIENCE-SILENT-RECONNECT:enabled',
        # ── Cadena de degradación (v5.1 + v5.2) ──
        f'#EXT-X-APE-DEGRADATION-LEVEL-1:CMAF+HEVC+LCEVC',
        f'#EXT-X-APE-DEGRADATION-LEVEL-2:HLS/fMP4+HEVC+LCEVC',
        f'#EXT-X-APE-DEGRADATION-LEVEL-3:HLS/fMP4+H.264',
        f'#EXT-X-APE-DEGRADATION-LEVEL-4:HLS/TS+H.264',
        f'#EXT-X-APE-DEGRADATION-LEVEL-5:HLS/TS+Baseline',
        f'#EXT-X-APE-DEGRADATION-LEVEL-6:TS-Direct',
        f'#EXT-X-APE-DEGRADATION-LEVEL-7:HTTP-Redirect',
        # ── Telchemy (v5.1) ──
        f'#EXT-X-APE-TELCHEMY-VSTQ:{p["telchemy_vstq"]}',
        f'#EXT-X-APE-TELCHEMY-VSMQ:{p["telchemy_vsmq"]}',
        f'#EXT-X-APE-TELCHEMY-TR101290:{p["telchemy_tr101290"]}',
        f'#EXT-X-APE-TELCHEMY-QOE-TARGET:{p["telchemy_qoe_target"]}',
        # ── Hydra (v5.1) ──
        f'#EXT-X-APE-HYDRA-STEALTH:{p["hydra_stealth"]}',
        f'#EXT-X-APE-HYDRA-UA-ROTATION:{p["hydra_ua_rotation"]}',
        f'#EXT-X-APE-HYDRA-FINGERPRINT-MASKING:{p["hydra_fp_masking"]}',
        # ── DNA (v5.1) ──
        f'#EXT-X-APE-DNA-VERSION:18.2',
        f'#EXT-X-APE-DNA-FIELDS:124',
        f'#EXT-X-APE-DNA-SYNC:bidirectional',
        f'#EXT-X-APE-DNA-MAP-SOURCE:channels_map_v5.3_FUSION',
        f'#EXT-X-APE-DNA-HASH:{ch_id}-{profile_key}-{ts}',
        # ── Anti-freeze (v5.1 + v5.2) ──
        f'#EXT-X-APE-ANTI-FREEZE:clock-jitter={p["clock_jitter"]},clock-synchro={p["clock_synchro"]},net-cache={p["network_cache"]},buf-min={p["buffer_min"]},prefetch={p["prefetch_segments"]},reconnect-backoff={p["reconnect_delay"]}ms',
        f'#EXT-X-APE-CLOCK-JITTER:{p["clock_jitter"]}',
        f'#EXT-X-APE-CLOCK-SYNCHRO:{p["clock_synchro"]}',
        f'#EXT-X-APE-NETWORK-CACHE:{p["network_cache"]}',
        f'#EXT-X-APE-LIVE-CACHE:{p["live_cache"]}',
        f'#EXT-X-APE-RECONNECT-MAX:{p["reconnect_max"]}',
        f'#EXT-X-APE-RETRY-COUNT:{p["retry_count"]}',
        f'#EXT-X-APE-PREFETCH-SEGMENTS:{p["prefetch_segments"]}',
        # ── CMAF/fMP4 (v5.2) ──
        f'#EXT-X-APE-CMAF:ENABLED',
        f'#EXT-X-APE-FMP4:ENABLED',
        f'#EXT-X-APE-HDR10:{"ENABLED" if "hdr10" in p["hdr_profile"] else "DISABLED"}',
        f'#EXT-X-APE-DOLBY-VISION:{"ENABLED" if "dolby_vision" in p["hdr_profile"] else "DISABLED"}',
        f'#EXT-X-APE-ATMOS:{"ENABLED" if profile_key in ["P0","P1"] else "DISABLED"}',
    ]

    # ── LCEVC 3 fases completo (v5.2) ──
    if p['lcevc_enabled']:
        tags += [
            f'#EXT-X-APE-LCEVC-STANDARD:{p["lcevc_standard"]}',
            f'#EXT-X-APE-LCEVC-PROFILE:{p["lcevc_profile"]}',
            f'#EXT-X-APE-LCEVC-PLAYER-REQUIRED:{p["lcevc_player_required"]}',
            f'#EXT-X-APE-LCEVC-FALLBACK:{p["lcevc_fallback"]}',
            f'#EXT-X-APE-LCEVC-BASE-LAYER-SCALE:{p["lcevc_base_layer_scale"]}',
            f'#EXT-X-APE-LCEVC-BASE-BITRATE-RATIO:{p["lcevc_base_bitrate_ratio"]}',
            f'#EXT-X-APE-LCEVC-ENHANCEMENT-BITRATE-RATIO:{p["lcevc_enh_bitrate_ratio"]}',
            f'#EXT-X-APE-LCEVC-L1-ENABLED:1',
            f'#EXT-X-APE-LCEVC-L1-TRANSFORM-BLOCK:{p["lcevc_l1_block"]}',
            f'#EXT-X-APE-LCEVC-L1-DEBLOCK-FILTER:{p["lcevc_l1_deblock"]}',
            f'#EXT-X-APE-LCEVC-L1-RESIDUAL-PRECISION:{p["lcevc_l1_precision"]}',
            f'#EXT-X-APE-LCEVC-L1-TEMPORAL-PREDICTION:{p["lcevc_l1_temporal"]}',
            f'#EXT-X-APE-LCEVC-L2-ENABLED:1',
            f'#EXT-X-APE-LCEVC-L2-TRANSFORM-BLOCK:{p["lcevc_l2_block"]}',
            f'#EXT-X-APE-LCEVC-L2-TEMPORAL-PREDICTION:{p["lcevc_l2_temporal"]}',
            f'#EXT-X-APE-LCEVC-L2-RESIDUAL-PRECISION:{p["lcevc_l2_precision"]}',
            f'#EXT-X-APE-LCEVC-L2-UPSCALE-FILTER:{p["lcevc_l2_upscale"]}',
            f'#EXT-X-APE-LCEVC-MODE:{p["lcevc_mode"]}',
            f'#EXT-X-APE-LCEVC-TRANSPORT-PRIMARY:{p["lcevc_transport"]}',
            f'#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-1:{p["lcevc_transport_fb1"]}',
            f'#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-2:{p["lcevc_transport_fb2"]}',
            f'#EXT-X-APE-LCEVC-SEI-NAL-TYPE:{p["lcevc_sei_nal_type"]}',
            f'#EXT-X-APE-LCEVC-MPEG-TS-PID:{p["lcevc_mpeg_ts_pid"]}',
            f'#EXT-X-APE-LCEVC-WEBM-TRACK-ID:{p["lcevc_webm_track_id"]}',
            f'#EXT-X-APE-LCEVC-PARALLEL-BLOCKS:{p["lcevc_parallel_blocks"]}',
            f'#EXT-X-APE-LCEVC-PARALLEL-THREADS:{p["lcevc_parallel_threads"]}',
            f'#EXT-X-APE-LCEVC-DECODE-ORDER:{p["lcevc_decode_order"]}',
            f'#EXT-X-APE-LCEVC-HW-ACCELERATION:{p["lcevc_hw_accel"]}',
            f'#EXT-X-APE-LCEVC-SW-FALLBACK:{p["lcevc_sw_fallback"]}',
            f'#EXT-X-APE-LCEVC-COMPAT:UNIVERSAL',
            f'#EXT-X-APE-LCEVC-GRACEFUL-DEGRADATION:BASE_CODEC_PASSTHROUGH',
        ]
    else:
        tags += [
            f'#EXT-X-APE-LCEVC-STANDARD:MPEG-5-PART-2',
            f'#EXT-X-APE-LCEVC-PLAYER-REQUIRED:{p["lcevc_player_required"]}',
            f'#EXT-X-APE-LCEVC-FALLBACK:{p["lcevc_fallback"]}',
            f'#EXT-X-APE-LCEVC-COMPAT:UNIVERSAL',
            f'#EXT-X-APE-LCEVC-GRACEFUL-DEGRADATION:BASE_CODEC_PASSTHROUGH',
        ]

    return tags

def build_channel(ch, ch_id, profile_key, ts):
    """
    Construye un canal completo con la estructura VLC-compatible:
    #EXTINF → #EXTHTTP → #EXTVLCOPT×N → #KODIPROP×N → #EXT-X-APE-*×N → #EXT-X-STREAM-INF → URL
    """
    p = PROFILES[profile_key]
    name = ch['name']
    group = ch['group']
    logo = ch['logo']
    url = ch['url']

    # Extraer servidor base de la URL
    m = re.match(r'(https?://[^/]+)', url)
    server_url = m.group(1) if m else url[:50]

    # #EXTINF
    extinf = (
        f'#EXTINF:-1 tvg-id="{ch_id}" tvg-name="{name}" tvg-logo="{logo}" '
        f'group-title="{group}" tvg-chno="{ch_id}" tvg-shift="0" '
        f'catchup="default" catchup-days="7" catchup-source="{{MediaUrl}}" '
        f'radio="false" tvg-rec="1" aspect-ratio="16:9" audio-track="default" '
        f'subtitle-track="none" is-adult="0" ape-profile="{profile_key}" '
        f'ape-version="18.2" ape-dna="{ch_id}-{profile_key}-{ts}",{name}'
    )

    # #EXTHTTP
    exthttp = build_exthttp(p, name, ch_id, server_url)

    # #EXTVLCOPT
    vlcopts = build_extvlcopt(p)

    # #KODIPROP
    kodiprops = build_kodiprop(p, profile_key)

    # #EXT-X-APE-* (v5.1 + LCEVC v5.2)
    ape_tags = build_ape_tags(p, profile_key, ch, ch_id, server_url, ts)

    # #EXT-X-STREAM-INF (SIEMPRE AL FINAL, justo antes de la URL)
    stream_inf = (
        f'#EXT-X-STREAM-INF:BANDWIDTH={p["bandwidth"]},'
        f'RESOLUTION={p["resolution"]},'
        f'CODECS="{p["codec_str"]}",'
        f'FRAME-RATE={p["fps"]},'
        f'HDCP-LEVEL=NONE'
    )

    lines = [extinf, exthttp] + vlcopts + kodiprops + ape_tags + [stream_inf, url]
    return '\n'.join(lines)

# ─── Parsear lista fuente ─────────────────────────────────────────────────────
print(f"Leyendo lista fuente: {SOURCE}")
with open(SOURCE, 'r', encoding='utf-8', errors='replace') as f:
    raw = f.readlines()

channels = []
i = 0
while i < len(raw):
    line = raw[i].strip()
    if line.startswith('#EXTINF'):
        name_m = re.search(r',(.+)$', line)
        name = name_m.group(1).strip() if name_m else 'Unknown'
        group_m = re.search(r'group-title="([^"]*)"', line)
        group = group_m.group(1) if group_m else 'General'
        logo_m = re.search(r'tvg-logo="([^"]*)"', line)
        logo = logo_m.group(1) if logo_m else ''
        # Buscar URL (saltar directivas intermedias)
        j = i + 1
        url = ''
        while j < len(raw):
            c = raw[j].strip()
            if c and not c.startswith('#'):
                url = c
                break
            j += 1
        if url:
            channels.append({'name': name, 'group': group, 'logo': logo, 'url': url})
        i = j + 1
    else:
        i += 1

print(f"Canales extraídos: {len(channels)}")

# ─── Generar lista fusionada ──────────────────────────────────────────────────
ts_now = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
ts_iso = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

header = f"""#EXTM3U x-tvg-url="" x-ape-version="18.2" x-ape-build="v5.3-FUSION-VLC-COMPATIBLE" x-ape-date="{ts_iso}"
#EXT-X-APE-HEADER:IPTV-Navigator-PRO-v5.3-FUSION
#EXT-X-APE-GENERATED:{ts_iso}
#EXT-X-APE-TOTAL-CHANNELS:{len(channels)}
#EXT-X-APE-TOTAL-SERVERS:3
#EXT-X-APE-INTERDEPENDENCY:lista-channel_map-bidirectional
#EXT-X-APE-GUARDIAN:enabled
#EXT-X-APE-RESILIENCE:7-level-graceful-degradation
#EXT-X-APE-LCEVC:3-phase-mpeg5-part2-full-injection
#EXT-X-APE-LCEVC-PHASES:BASE-LAYER+L1-RESIDUALS+L2-RESIDUALS+SEI-NAL+WEBM+MPEG-TS-PID+PARALLEL-2x2-4x4
#EXT-X-APE-QOS:dscp-ef-af41
#EXT-X-APE-QOE:mos-target-5.0
#EXT-X-APE-TELCHEMY:vstq-vsmq-tr101290
#EXT-X-APE-HYDRA-STEALTH:enabled
#EXT-X-APE-DNA-FIELDS:124
#EXT-X-APE-PLAYERS:40-universal
#EXT-X-APE-DEGRADATION-CHAIN:CMAF+HEVC+LCEVC->HLS/fMP4+HEVC+LCEVC->HLS/fMP4+H264->HLS/TS+H264->HLS/TS+Baseline->TS-Direct->HTTP-Redirect
#EXT-X-APE-PARADIGM:PLAYER-ENSLAVEMENT-PROTOCOL-V5.3-FUSION
#EXT-X-APE-PROFILES:P0-ULTRA_EXTREME,P1-4K_SUPREME,P2-4K_EXTREME,P3-FHD_ADVANCED,P4-HD_STABLE,P5-SD_FAILSAFE
#EXT-X-APE-ANTI-FREEZE:clock-jitter=1500,clock-synchro=1,net-cache=15000,buf-min=15000,prefetch=10-20,reconnect-backoff=50-200ms
#EXT-X-APE-VLC-COMPAT:ESTRUCTURA-EXTINF-EXTHTTP-VLCOPT-KODIPROP-APE-STREAMINF-URL"""

profile_counts = {k: 0 for k in PROFILES}
output_parts = [header, '']

for idx, ch in enumerate(channels):
    pk = detect_profile(ch['name'], ch['group'])
    profile_counts[pk] += 1
    block = build_channel(ch, idx + 1, pk, ts_now)
    output_parts.append(block)
    output_parts.append('')

output = '\n'.join(output_parts)

with open(OUTPUT, 'w', encoding='utf-8') as f:
    f.write(output)

size_mb = len(output.encode('utf-8')) / (1024 * 1024)
print(f"\n✅ Lista fusionada: {OUTPUT}")
print(f"   Canales: {len(channels)}")
print(f"   Tamaño: {size_mb:.1f} MB")
print(f"\n   Distribución de perfiles:")
for pk, count in profile_counts.items():
    pct = count / len(channels) * 100 if channels else 0
    print(f"   {pk} ({PROFILES[pk]['name']}): {count} canales ({pct:.1f}%)")

# Verificación de estructura VLC
print(f"\n   Verificando estructura VLC-compatible:")
import re as re2
order_ok = True
for m in re2.finditer(r'(#EXTINF[^\n]*\n)(.*?)(#EXT-X-STREAM-INF[^\n]*\n)([^\n]+)', output, re2.DOTALL):
    between = m.group(2)
    if '#EXT-X-STREAM-INF' in between:
        order_ok = False
        break
print(f"   {'✅' if order_ok else '❌'} EXT-X-STREAM-INF siempre después de EXTINF")

# Verificar tags fusionados
checks = [
    ('#EXT-X-APE-LCEVC-L1-ENABLED:1', 'LCEVC L1 inyectado'),
    ('#EXT-X-APE-LCEVC-L2-ENABLED:1', 'LCEVC L2 inyectado'),
    ('#EXT-X-APE-LCEVC-TRANSPORT-PRIMARY:', 'LCEVC Transport inyectado'),
    ('#EXT-X-APE-LCEVC-PARALLEL-THREADS:', 'LCEVC Parallelization inyectado'),
    ('#EXT-X-APE-LCEVC-COMPAT:UNIVERSAL', 'LCEVC Compat Universal'),
    ('#EXT-X-APE-GUARDIAN-ENABLED:true', 'Guardian v5.1'),
    ('#EXT-X-APE-RESILIENCE-STRATEGY:', 'Resiliencia v5.1'),
    ('#EXT-X-APE-TELCHEMY-VSTQ:', 'Telchemy v5.1'),
    ('#EXT-X-APE-HYDRA-STEALTH:', 'Hydra Stealth v5.1'),
    ('#EXT-X-APE-ANTI-FREEZE:', 'Anti-freeze v5.1'),
    ('#EXTVLCOPT:clock-jitter=1500', 'clock-jitter=1500 anti-freeze'),
    ('#EXTVLCOPT:clock-synchro=1', 'clock-synchro=1 anti-freeze'),
    ('#EXTVLCOPT:avcodec-hw=any', 'avcodec-hw v5.2'),
    ('#EXTVLCOPT:video-color-space=BT2020', 'color-space BT2020 v5.1'),
]
for tag, desc in checks:
    count = output.count(tag)
    print(f"   {'✅' if count > 0 else '❌'} {desc}: {count} ocurrencias")
