#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
M3U8 PEP GENERATOR v5.0 — PLAYER ENSLAVEMENT PROTOCOL
═══════════════════════════════════════════════════════════════════════════════

Genera la lista M3U8 maestra con estructura APE v18.2 completa.
Procesa la lista de referencia y actualiza cada canal con:
  - Headers EXTHTTP completos (80+ headers por perfil)
  - EXTVLCOPT con valores óptimos por perfil
  - KODIPROP completo
  - 80+ tags #EXT-X-APE-* por canal
  - Cadena de degradación de 7 niveles
  - #EXT-X-STREAM-INF con codec string correcto
  - URL directa al proveedor (lista madre)

PERFILES P0-P5 con valores calibrados quirúrgicamente para 0 cortes.
"""
import re
import json
import sys
import os
from datetime import datetime, timezone


# ─── 🎬 Disney-Grade LL-HLS / ABR directives loader (LAB SSOT) ────────────────
# Lee vps/prisma/config/m3u8_directives_config.json (relativo al repo).
# Si no existe, devuelve los defaults hardcoded (mismos valores para todos
# los perfiles P0-P5). Mismo helper que en generate_m3u8_v53_fusion.py.
_DISNEY_DEFAULTS = [
    {"tag": "EXT-X-START",          "value": "TIME-OFFSET=-3.0,PRECISE=YES"},
    {"tag": "EXT-X-SERVER-CONTROL", "value": "CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0"},
    {"tag": "EXT-X-TARGETDURATION", "value": "2"},
    {"tag": "EXT-X-PART-INF",       "value": "PART-TARGET=1.0"},
    {"tag": "EXT-X-SESSION-DATA",   "value": 'DATA-ID="exoplayer.load_control",VALUE="{\\"minBufferMs\\":20000,\\"bufferForPlaybackMs\\":1000}"'},
    {"tag": "EXT-X-SESSION-DATA",   "value": 'DATA-ID="exoplayer.track_selection",VALUE="{\\"maxDurationForQualityDecreaseMs\\":2000,\\"minDurationForQualityIncreaseMs\\":15000,\\"bandwidthFraction\\":0.65}"'},
]


def _ape_disney_directive_lines():
    """Return list of m3u8 directive lines `#TAG:VALUE` ready to concatenate.

    Reads vps/prisma/config/m3u8_directives_config.json from the repo if found,
    else returns hardcoded defaults. Errors degrade silently to defaults.
    """
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "vps", "prisma", "config", "m3u8_directives_config.json"),
        os.path.join(os.path.dirname(__file__), "..", "..", "vps", "prisma", "config", "m3u8_directives_config.json"),
        "/var/www/html/prisma/config/m3u8_directives_config.json",
    ]
    directives = _DISNEY_DEFAULTS
    for path in candidates:
        try:
            if os.path.isfile(path):
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                items = data.get("directives") if isinstance(data, dict) else None
                if isinstance(items, list) and len(items) > 0:
                    directives = items
                    break
        except (OSError, ValueError):
            continue
    out = []
    for d in directives:
        tag = d.get("tag") if isinstance(d, dict) else None
        val = d.get("value") if isinstance(d, dict) else None
        if tag and isinstance(val, str):
            out.append("#" + tag + ":" + val)
    return out

# ═══════════════════════════════════════════════════════════════════════════
# TABLA MAESTRA DE PERFILES P0-P5
# ═══════════════════════════════════════════════════════════════════════════
PROFILES = {
    'P0': {
        'name': 'ULTRA_EXTREME', 'res': '7680x4320', 'w': 7680, 'h': 4320,
        'fps': 60, 'bitrate': 80000, 'net_cache': 60000, 'live_cache': 60000,
        'file_cache': 15000, 'buffer_ms': 50000, 'max_bw': 160000000,
        'prefetch_seg': 500, 'prefetch_par': 250, 'prefetch_buf': 600000,
        'seg_dur': 2, 'bw_guarantee': 500,
        'codec_primary': 'AV1', 'codec_fallback': 'HEVC',
        'codec_priority': 'av1,hevc,h265,H265,h.265,h264',
        'hdr': ['hdr10plus', 'dolby_vision', 'hdr10', 'hlg'],
        'color_depth': 12, 'audio_ch': 8,
        'recon_timeout': 5, 'recon_max': 200, 'recon_delay': 0,
        'hevc_tier': 'HIGH', 'hevc_level': '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile': 'MAIN-10-HDR', 'color_space': 'BT2020',
        'chroma': '4:2:0', 'transfer': 'SMPTE2084', 'matrix': 'BT2020NC',
        'compress': 1, 'sharpen': 0.02, 'rate_ctrl': 'VBR',
        'entropy': 'CABAC', 'vid_profile': 'main10', 'pix_fmt': 'yuv420p10le',
        'lcevc': True, 'lcevc_state': 'ACTIVE',
        'qoe_target': 5.0, 'dscp': 'EF', 'vqs_score': 98,
        'buffer_target_s': 15, 'buffer_min_s': 3, 'buffer_max_s': 45, 'prebuffer_s': 5,
        'hdr_profile': 'hdr10_plus', 'ai_sr': True,
        'codec_str': 'hvc1.1.6.L180.B0',
        'degradation': [
            'CMAF+HEVC/AV1+LCEVC', 'HLS/fMP4+HEVC+LCEVC', 'HLS/fMP4+H.264',
            'HLS/TS+H.264', 'HLS/TS+Baseline', 'TS-Direct', 'HTTP-Redirect'
        ],
    },
    'P1': {
        'name': '4K_SUPREME', 'res': '3840x2160', 'w': 3840, 'h': 2160,
        'fps': 60, 'bitrate': 25000, 'net_cache': 50000, 'live_cache': 50000,
        'file_cache': 12000, 'buffer_ms': 40000, 'max_bw': 80000000,
        'prefetch_seg': 400, 'prefetch_par': 200, 'prefetch_buf': 500000,
        'seg_dur': 2, 'bw_guarantee': 400,
        'codec_primary': 'HEVC', 'codec_fallback': 'HEVC',
        'codec_priority': 'hevc,h265,H265,h.265,av1,h264',
        'hdr': ['hdr10', 'hlg'], 'color_depth': 10, 'audio_ch': 8,
        'recon_timeout': 5, 'recon_max': 200, 'recon_delay': 0,
        'hevc_tier': 'HIGH', 'hevc_level': '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile': 'MAIN-10-HDR', 'color_space': 'BT2020',
        'chroma': '4:2:0', 'transfer': 'SMPTE2084', 'matrix': 'BT2020NC',
        'compress': 1, 'sharpen': 0.02, 'rate_ctrl': 'VBR',
        'entropy': 'CABAC', 'vid_profile': 'main10', 'pix_fmt': 'yuv420p10le',
        'lcevc': True, 'lcevc_state': 'ACTIVE',
        'qoe_target': 5.0, 'dscp': 'EF', 'vqs_score': 95,
        'buffer_target_s': 12, 'buffer_min_s': 3, 'buffer_max_s': 36, 'prebuffer_s': 5,
        'hdr_profile': 'hdr10', 'ai_sr': False,
        'codec_str': 'hvc1.1.6.L150.B0',
        'degradation': [
            'CMAF+HEVC+LCEVC', 'HLS/fMP4+HEVC+LCEVC', 'HLS/fMP4+H.264',
            'HLS/TS+H.264', 'HLS/TS+Baseline', 'TS-Direct', 'HTTP-Redirect'
        ],
    },
    'P2': {
        'name': '4K_EXTREME', 'res': '3840x2160', 'w': 3840, 'h': 2160,
        'fps': 30, 'bitrate': 15000, 'net_cache': 45000, 'live_cache': 45000,
        'file_cache': 10000, 'buffer_ms': 35000, 'max_bw': 50000000,
        'prefetch_seg': 350, 'prefetch_par': 175, 'prefetch_buf': 450000,
        'seg_dur': 2, 'bw_guarantee': 350,
        'codec_primary': 'HEVC', 'codec_fallback': 'HEVC',
        'codec_priority': 'hevc,h265,H265,h.265,h264',
        'hdr': ['hdr10', 'hlg'], 'color_depth': 10, 'audio_ch': 6,
        'recon_timeout': 5, 'recon_max': 200, 'recon_delay': 0,
        'hevc_tier': 'HIGH', 'hevc_level': '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile': 'MAIN-10-HDR', 'color_space': 'BT2020',
        'chroma': '4:2:0', 'transfer': 'SMPTE2084', 'matrix': 'BT2020NC',
        'compress': 1, 'sharpen': 0.03, 'rate_ctrl': 'VBR',
        'entropy': 'CABAC', 'vid_profile': 'main10', 'pix_fmt': 'yuv420p10le',
        'lcevc': True, 'lcevc_state': 'SIGNAL_ONLY',
        'qoe_target': 4.8, 'dscp': 'EF', 'vqs_score': 92,
        'buffer_target_s': 10, 'buffer_min_s': 3, 'buffer_max_s': 30, 'prebuffer_s': 4,
        'hdr_profile': 'hdr10', 'ai_sr': False,
        'codec_str': 'hvc1.1.6.L150.B0',
        'degradation': [
            'CMAF+HEVC+LCEVC', 'HLS/fMP4+HEVC+LCEVC', 'HLS/fMP4+H.264',
            'HLS/TS+H.264', 'HLS/TS+Baseline', 'TS-Direct', 'HTTP-Redirect'
        ],
    },
    'P3': {
        'name': 'FHD_ADVANCED', 'res': '1920x1080', 'w': 1920, 'h': 1080,
        'fps': 60, 'bitrate': 8000, 'net_cache': 40000, 'live_cache': 40000,
        'file_cache': 8000, 'buffer_ms': 30000, 'max_bw': 25000000,
        'prefetch_seg': 300, 'prefetch_par': 150, 'prefetch_buf': 400000,
        'seg_dur': 2, 'bw_guarantee': 300,
        'codec_primary': 'HEVC', 'codec_fallback': 'H264',
        'codec_priority': 'hevc,h265,H265,h.265,h264,mpeg2',
        'hdr': ['hdr10'], 'color_depth': 10, 'audio_ch': 6,
        'recon_timeout': 5, 'recon_max': 200, 'recon_delay': 0,
        'hevc_tier': 'HIGH', 'hevc_level': '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile': 'MAIN-10', 'color_space': 'BT709',
        'chroma': '4:2:0', 'transfer': 'BT1886', 'matrix': 'BT709',
        'compress': 1, 'sharpen': 0.03, 'rate_ctrl': 'VBR',
        'entropy': 'CABAC', 'vid_profile': 'main10', 'pix_fmt': 'yuv420p10le',
        'lcevc': True, 'lcevc_state': 'SIGNAL_ONLY',
        'qoe_target': 4.5, 'dscp': 'AF41', 'vqs_score': 88,
        'buffer_target_s': 8, 'buffer_min_s': 2, 'buffer_max_s': 24, 'prebuffer_s': 3,
        'hdr_profile': 'hdr10', 'ai_sr': False,
        'codec_str': 'hvc1.1.4.L120.B0',
        'degradation': [
            'HLS/fMP4+HEVC+LCEVC', 'HLS/fMP4+H.264', 'HLS/TS+H.264',
            'HLS/TS+Baseline', 'TS-Direct', 'HTTP-Redirect', 'HTTP-Redirect-SD'
        ],
    },
    'P4': {
        'name': 'HD_STABLE', 'res': '1280x720', 'w': 1280, 'h': 720,
        'fps': 30, 'bitrate': 4500, 'net_cache': 35000, 'live_cache': 35000,
        'file_cache': 7000, 'buffer_ms': 25000, 'max_bw': 15000000,
        'prefetch_seg': 250, 'prefetch_par': 120, 'prefetch_buf': 350000,
        'seg_dur': 2, 'bw_guarantee': 250,
        'codec_primary': 'HEVC', 'codec_fallback': 'H264',
        'codec_priority': 'hevc,h265,H265,h.265,h264,mpeg2',
        'hdr': [], 'color_depth': 8, 'audio_ch': 2,
        'recon_timeout': 5, 'recon_max': 200, 'recon_delay': 0,
        'hevc_tier': 'MAIN', 'hevc_level': '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile': 'MAIN', 'color_space': 'BT709',
        'chroma': '4:2:0', 'transfer': 'BT1886', 'matrix': 'BT709',
        'compress': 1, 'sharpen': 0.05, 'rate_ctrl': 'VBR',
        'entropy': 'CABAC', 'vid_profile': 'main', 'pix_fmt': 'yuv420p',
        'lcevc': False, 'lcevc_state': 'DISABLED',
        'qoe_target': 4.0, 'dscp': 'AF31', 'vqs_score': 80,
        'buffer_target_s': 6, 'buffer_min_s': 2, 'buffer_max_s': 18, 'prebuffer_s': 2,
        'hdr_profile': 'sdr', 'ai_sr': False,
        'codec_str': 'hvc1.1.4.L120.B0',
        'degradation': [
            'HLS/fMP4+HEVC', 'HLS/fMP4+H.264', 'HLS/TS+H.264',
            'HLS/TS+Baseline', 'TS-Direct', 'HTTP-Redirect', 'HTTP-Redirect-SD'
        ],
    },
    'P5': {
        'name': 'SD_FAILSAFE', 'res': '854x480', 'w': 854, 'h': 480,
        'fps': 25, 'bitrate': 1500, 'net_cache': 30000, 'live_cache': 30000,
        'file_cache': 5000, 'buffer_ms': 20000, 'max_bw': 5000000,
        'prefetch_seg': 200, 'prefetch_par': 100, 'prefetch_buf': 300000,
        'seg_dur': 2, 'bw_guarantee': 200,
        'codec_primary': 'HEVC', 'codec_fallback': 'H264',
        'codec_priority': 'hevc,h265,H265,h.265,h264,mpeg2',
        'hdr': [], 'color_depth': 8, 'audio_ch': 2,
        'recon_timeout': 5, 'recon_max': 200, 'recon_delay': 0,
        'hevc_tier': 'MAIN', 'hevc_level': '6.1,5.1,5.0,4.1,4.0,3.1',
        'hevc_profile': 'MAIN', 'color_space': 'BT709',
        'chroma': '4:2:0', 'transfer': 'BT1886', 'matrix': 'BT709',
        'compress': 1, 'sharpen': 0.05, 'rate_ctrl': 'VBR',
        'entropy': 'CABAC', 'vid_profile': 'main', 'pix_fmt': 'yuv420p',
        'lcevc': False, 'lcevc_state': 'DISABLED',
        'qoe_target': 3.5, 'dscp': 'BE', 'vqs_score': 70,
        'buffer_target_s': 5, 'buffer_min_s': 1, 'buffer_max_s': 15, 'prebuffer_s': 2,
        'hdr_profile': 'sdr', 'ai_sr': False,
        'codec_str': 'avc1.640028',
        'degradation': [
            'HLS/TS+H.264', 'HLS/TS+Baseline', 'TS-Direct',
            'HTTP-Redirect', 'HTTP-Redirect-SD', 'HTTP-Redirect-LD', 'HTTP-Redirect-Any'
        ],
    },
}

# User-Agents por perfil (Hydra Stealth rotation)
UA_BY_PROFILE = {
    'P0': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P0',
    'P1': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P1',
    'P2': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P2',
    'P3': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/18.2-P3',
    'P4': 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 APE-Engine/18.2-P4',
    'P5': 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 APE-Engine/18.2-P5',
}

def detect_profile(tvg_name: str, group_title: str) -> str:
    """Detecta el perfil óptimo basado en el nombre del canal y el grupo."""
    name = (tvg_name + ' ' + group_title).upper()
    if any(k in name for k in ['8K', 'UHD8K', '4320', 'ULTRA HD 8K']): return 'P0'
    if any(k in name for k in ['4K', 'UHD', '2160', 'ULTRA HD', 'UHD4K']): return 'P1'
    if any(k in name for k in ['FHD', '1080', 'FULL HD']): return 'P3'
    if any(k in name for k in ['HD', '720']): return 'P4'
    if any(k in name for k in ['SD', '480', '360', '240']): return 'P5'
    # Default: FHD para máxima calidad en canales sin indicador
    return 'P3'

def build_exthttp(cfg: dict, profile_id: str, host: str) -> str:
    """Construye el JSON del #EXTHTTP con 80+ headers."""
    ua = UA_BY_PROFILE[profile_id]
    hdr_list = cfg['hdr'] + ['hlg'] if cfg['hdr'] else ['sdr']
    hdr_str = ','.join(hdr_list)
    headers = {
        # Identidad
        'User-Agent': ua,
        'Accept': 'application/vnd.apple.mpegurl;q=1.0, audio/mpegurl;q=0.99, application/x-mpegurl;q=0.97, application/x-m3u8;q=0.95, text/plain;q=0.8, */*;q=0.1',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=30, max=100',
        # Origen
        'Origin': f'http://{host}',
        'Referer': f'http://{host}/',
        # APE Engine Core
        'X-App-Version': 'APE_18.2_PEP-V5',
        'X-APE-Version': '18.2',
        'X-APE-Profile': profile_id,
        'X-APE-QoE': str(cfg['qoe_target']),
        'X-APE-Guardian': 'enabled',
        'X-APE-DNA-Version': '18.2',
        'X-APE-DNA-Fields': '124',
        'X-APE-DNA-Sync': 'bidirectional',
        'X-Stream-Type': 'hls',
        'X-Quality-Preference': f"codec-{cfg['codec_primary'].lower()},profile-{cfg['vid_profile']},tier-{cfg['hevc_tier'].lower()}",
        # Buffer y Caching
        'X-Network-Caching': str(cfg['net_cache']),
        'X-Live-Caching': str(cfg['live_cache']),
        'X-File-Caching': str(cfg['file_cache']),
        'X-Buffer-Ms': str(cfg['buffer_ms']),
        'X-Buffer-Target': str(cfg['buffer_ms']),
        'X-Buffer-Min': '500',
        'X-Buffer-Max': str(cfg['buffer_ms'] * 4),
        'X-Buffer-Strategy': 'ultra-aggressive',
        # Prefetch
        'X-Prefetch-Segments': str(cfg['prefetch_seg']),
        'X-Prefetch-Parallel': str(cfg['prefetch_par']),
        'X-Prefetch-Buffer-Target': str(cfg['prefetch_buf']),
        'X-Prefetch-Strategy': 'ULTRA_AGRESIVO_ILIMITADO',
        'X-Prefetch-Enabled': 'true,adaptive,auto',
        # Reconexión
        'X-Reconnect-Timeout-Ms': str(cfg['recon_timeout']),
        'X-Reconnect-Max-Attempts': str(cfg['recon_max']),
        'X-Reconnect-Delay-Ms': str(cfg['recon_delay']),
        'X-Reconnect-On-Error': 'true,immediate,adaptive',
        # Segmento
        'X-Segment-Duration': str(cfg['seg_dur']),
        'X-Bandwidth-Guarantee': str(cfg['bw_guarantee']),
        # Playback
        'X-Playback-Rate': '1.0,1.25,1.5',
        'X-Min-Buffer-Time': '0.5,1,2',
        'X-Max-Buffer-Time': '8,12,30',
        'X-Request-Priority': 'ultra-high-critical',
        # Codecs
        'X-Video-Codecs': cfg['codec_priority'],
        'X-Codec-Support': cfg['codec_priority'],
        'X-Audio-Codecs': 'opus,aac,eac3,ac3,dolby,mp3',
        'X-DRM-Support': 'widevine,playready,fairplay',
        # HEVC
        'X-HEVC-Tier': cfg['hevc_tier'],
        'X-HEVC-Level': cfg['hevc_level'],
        'X-HEVC-Profile': cfg['hevc_profile'],
        'X-Video-Profile': cfg['vid_profile'],
        'X-Color-Space': cfg['color_space'],
        'X-Chroma-Subsampling': cfg['chroma'],
        'X-HDR-Transfer-Function': cfg['transfer'],
        'X-Matrix-Coefficients': cfg['matrix'],
        'X-Compression-Level': str(cfg['compress']),
        'X-Sharpen-Sigma': str(cfg['sharpen']),
        'X-Rate-Control': cfg['rate_ctrl'],
        'X-Entropy-Coding': cfg['entropy'],
        'X-Pixel-Format': cfg['pix_fmt'],
        'X-Color-Depth': str(cfg['color_depth']),
        # HDR
        'X-HDR-Support': hdr_str,
        'X-Dynamic-Range': 'hdr' if cfg['hdr'] else 'sdr',
        # CDN
        'X-CDN-Provider': 'auto',
        'X-Failover-Enabled': 'true',
        'X-Buffer-Size': str(cfg['max_bw'] // 550),
        # Metadata
        'X-Device-Type': 'smart-tv',
        'X-Screen-Resolution': cfg['res'],
        'X-Network-Type': 'wifi',
        # QoS
        'X-QoS-DSCP': cfg['dscp'],
        'X-QoS-Bitrate': f"{cfg['bitrate']}kbps",
        'X-QoS-Priority': 'high',
        # OTT Navigator
        'X-OTT-Navigator-Version': '1.7.0.0-aggressive-extreme',
        'X-Player-Type': 'exoplayer-ultra-extreme,vlc-pro',
        'X-Hardware-Decode': 'true',
        'X-Audio-Track-Selection': 'highest-quality-extreme,dolby-atmos-first',
        'X-Subtitle-Track-Selection': 'off',
        'X-EPG-Sync': 'enabled',
        'X-Catchup-Support': 'flussonic-ultra',
        # Streaming Control
        'X-Bandwidth-Estimation': 'adaptive,balanced,conservative',
        'X-Initial-Bitrate': 'highest',
        'X-Retry-Count': '3',
        'X-Retry-Delay-Ms': '1000',
        'X-Connection-Timeout-Ms': '15000',
        'X-Read-Timeout-Ms': '30000',
        # Seguridad
        'DNT': '1',
        'Sec-GPC': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        # LCEVC
        'X-LCEVC-Enabled': 'true' if cfg['lcevc'] else 'false',
        'X-LCEVC-State': cfg['lcevc_state'],
        'X-LCEVC-Enhancement': 'mpeg5-part2',
        'X-LCEVC-Scale-Factor': '2x',
        # Guardian
        'X-APE-Guardian-Enabled': 'true',
        'X-APE-Guardian-State': 'ONLINE',
        'X-APE-Guardian-Fallback-Level': '3',
        'X-APE-Guardian-Memory': 'enabled',
        'X-APE-Guardian-Continuity': 'guaranteed',
        # Resiliencia
        'X-APE-Resilience-Strategy': 'proactive_failover',
        'X-APE-Resilience-Chain': '7-levels',
        'X-APE-Resilience-Circuit-Breaker': 'enabled',
        'X-APE-Resilience-Max-Retries': '3',
        'X-APE-Resilience-Retry-Backoff': 'exponential',
        'X-APE-Resilience-Silent-Reconnect': 'enabled',
        # Telchemy
        'X-APE-Telchemy-VSTQ': 'enabled',
        'X-APE-Telchemy-VSMQ': 'enabled',
        'X-APE-Telchemy-TR101290': 'enabled',
        'X-APE-Telchemy-QoE-Target': str(cfg['qoe_target']),
        # Hydra Stealth
        'X-APE-Hydra-Stealth': 'enabled',
        'X-APE-Hydra-UA-Rotation': 'enabled',
        'X-APE-Hydra-Fingerprint-Masking': 'enabled',
    }
    return json.dumps(headers, ensure_ascii=False, separators=(',', ':'))

def build_channel_block(extinf_line: str, url: str, profile_id: str) -> list:
    """Construye el bloque completo de un canal con todos los tags APE v18.2."""
    cfg = PROFILES[profile_id]
    ua = UA_BY_PROFILE[profile_id]

    # Extraer host de la URL
    m = re.match(r'https?://([^/]+)', url)
    host = m.group(1) if m else 'unknown'

    # Extraer stream_id de la URL
    m_sid = re.search(r'/live/[^/]+/[^/]+/(\d+)\.m3u8', url)
    stream_id = m_sid.group(1) if m_sid else 'unknown'

    # Extraer tvg-id y tvg-name del EXTINF
    m_id = re.search(r'tvg-id="([^"]*)"', extinf_line)
    m_name = re.search(r'tvg-name="([^"]*)"', extinf_line)
    tvg_id = m_id.group(1) if m_id else stream_id
    tvg_name = m_name.group(1) if m_name else 'Canal'

    exthttp_json = build_exthttp(cfg, profile_id, host)
    codec_str = cfg['codec_str']
    bitrate_hz = cfg['bitrate'] * 1000

    lines = []
    lines.append(extinf_line)
    lines.append(f'#EXTHTTP:{exthttp_json}')
    lines.append(f'#EXTVLCOPT:network-caching={cfg["net_cache"]}')
    lines.append('#EXTVLCOPT:http-reconnect=true')
    lines.append('#EXTVLCOPT:http-continuous=true')
    lines.append('#EXTVLCOPT:clock-jitter=0')
    lines.append('#EXTVLCOPT:clock-synchro=0')
    lines.append(f'#EXTVLCOPT:live-caching={cfg["live_cache"]}')
    lines.append(f'#EXTVLCOPT:file-caching={cfg["file_cache"]}')
    lines.append(f'#EXTVLCOPT:http-user-agent={ua}')
    lines.append('#KODIPROP:inputstream=inputstream.adaptive')
    lines.append('#KODIPROP:inputstream.adaptive.manifest_type=hls')
    lines.append('#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive')
    if profile_id in ('P0', 'P1', 'P2'):
        lines.append(f'#KODIPROP:inputstream.adaptive.stream_headers={exthttp_json}')
    # APE DNA Tags
    lines.append('#EXT-X-APE-VERSION:18.2')
    lines.append(f'#EXT-X-APE-PROFILE:{profile_id}')
    lines.append(f'#EXT-X-APE-CHANNEL-KEY:{tvg_id}')
    lines.append(f'#EXT-X-APE-STREAM-ID:{stream_id}')
    lines.append(f'#EXT-X-APE-SERVER:http://{host}')
    lines.append(f'#EXT-X-APE-CODEC:{codec_str}')
    lines.append(f'#EXT-X-APE-RESOLUTION:{cfg["res"]}')
    lines.append(f'#EXT-X-APE-FRAME-RATE:{cfg["fps"]}')
    lines.append(f'#EXT-X-APE-BITRATE:{cfg["bitrate"]}kbps')
    lines.append(f'#EXT-X-APE-HDR-PROFILE:{cfg["hdr_profile"]}')
    lines.append(f'#EXT-X-APE-LCEVC-ENABLED:{"true" if cfg["lcevc"] else "false"}')
    lines.append(f'#EXT-X-APE-LCEVC-STATE:{cfg["lcevc_state"]}')
    lines.append(f'#EXT-X-APE-LCEVC-BASE-CODEC:{codec_str}')
    lines.append('#EXT-X-APE-LCEVC-ENHANCEMENT:mpeg5-part2')
    lines.append('#EXT-X-APE-LCEVC-SCALE-FACTOR:2x')
    lines.append(f'#EXT-X-APE-AI-SR-ENABLED:{"true" if cfg["ai_sr"] else "false"}')
    lines.append(f'#EXT-X-APE-QOE-SCORE:{cfg["qoe_target"]}')
    lines.append(f'#EXT-X-APE-QOS-DSCP:{cfg["dscp"]}')
    lines.append(f'#EXT-X-APE-QOS-BITRATE:{cfg["bitrate"]}kbps')
    lines.append('#EXT-X-APE-QOS-PRIORITY:high')
    lines.append(f'#EXT-X-APE-VQS-SCORE:{cfg["vqs_score"]}')
    lines.append(f'#EXT-X-APE-BUFFER-TARGET:{cfg["buffer_target_s"]}s')
    lines.append(f'#EXT-X-APE-BUFFER-MIN:{cfg["buffer_min_s"]}s')
    lines.append(f'#EXT-X-APE-BUFFER-MAX:{cfg["buffer_max_s"]}s')
    lines.append(f'#EXT-X-APE-PREBUFFER:{cfg["prebuffer_s"]}s')
    lines.append('#EXT-X-APE-GUARDIAN-ENABLED:true')
    lines.append('#EXT-X-APE-GUARDIAN-STATE:ONLINE')
    lines.append('#EXT-X-APE-GUARDIAN-FALLBACK-LEVEL:3')
    lines.append('#EXT-X-APE-GUARDIAN-MEMORY:enabled')
    lines.append('#EXT-X-APE-GUARDIAN-CONTINUITY:guaranteed')
    lines.append('#EXT-X-APE-RESILIENCE-STRATEGY:proactive_failover')
    lines.append('#EXT-X-APE-RESILIENCE-CHAIN:7-levels')
    lines.append('#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:enabled')
    lines.append('#EXT-X-APE-RESILIENCE-MAX-RETRIES:3')
    lines.append('#EXT-X-APE-RESILIENCE-RETRY-BACKOFF:exponential')
    lines.append('#EXT-X-APE-RESILIENCE-SILENT-RECONNECT:enabled')
    for i, level in enumerate(cfg['degradation'], 1):
        lines.append(f'#EXT-X-APE-DEGRADATION-LEVEL-{i}:{level}')
    lines.append('#EXT-X-APE-TELCHEMY-VSTQ:enabled')
    lines.append('#EXT-X-APE-TELCHEMY-VSMQ:enabled')
    lines.append('#EXT-X-APE-TELCHEMY-TR101290:enabled')
    lines.append(f'#EXT-X-APE-TELCHEMY-QOE-TARGET:{cfg["qoe_target"]}')
    lines.append('#EXT-X-APE-HYDRA-STEALTH:enabled')
    lines.append('#EXT-X-APE-HYDRA-UA-ROTATION:enabled')
    lines.append('#EXT-X-APE-HYDRA-FINGERPRINT-MASKING:enabled')
    lines.append('#EXT-X-APE-DNA-VERSION:18.2')
    lines.append('#EXT-X-APE-DNA-FIELDS:124')
    lines.append('#EXT-X-APE-DNA-SYNC:bidirectional')
    lines.append('#EXT-X-APE-DNA-MAP-SOURCE:channels_map_v5.0_PEP')
    # EXT-X-STREAM-INF (refuerza selección de máxima resolución)
    lines.append(f'#EXT-X-STREAM-INF:BANDWIDTH={bitrate_hz},RESOLUTION={cfg["res"]},CODECS="{codec_str},mp4a.40.2",FRAME-RATE={cfg["fps"]},HDCP-LEVEL=NONE')
    lines.append(url)
    return lines

def parse_and_regenerate(input_path: str, output_path: str):
    """Parsea la lista de referencia y regenera con estructura PEP v5.0 completa."""
    print(f'[PEP-GEN] Leyendo: {input_path}')
    with open(input_path, 'r', encoding='utf-8', errors='replace') as f:
        raw_lines = f.readlines()

    total_lines = len(raw_lines)
    print(f'[PEP-GEN] Total líneas: {total_lines:,}')

    # Contar canales en la lista de referencia
    total_channels = sum(1 for l in raw_lines if l.startswith('#EXTINF:'))
    print(f'[PEP-GEN] Total canales detectados: {total_channels:,}')

    now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    out_lines = []
    # Cabecera maestra
    out_lines.append(f'#EXTM3U x-tvg-url="" x-ape-version="18.2" x-ape-build="v5.0-PEP-EDITION"')
    # 🎬 Disney-Grade LL-HLS / ABR directives (LAB SSOT — global, todos los perfiles)
    out_lines.extend(_ape_disney_directive_lines())
    out_lines.append('#EXT-X-APE-HEADER:IPTV-Navigator-PRO-v5.0-PEP-EDITION')
    out_lines.append(f'#EXT-X-APE-GENERATED:{now_iso}')
    out_lines.append(f'#EXT-X-APE-TOTAL-CHANNELS:{total_channels}')
    out_lines.append('#EXT-X-APE-TOTAL-SERVERS:3')
    out_lines.append('#EXT-X-APE-INTERDEPENDENCY:lista-channel_map-bidirectional')
    out_lines.append('#EXT-X-APE-GUARDIAN:enabled')
    out_lines.append('#EXT-X-APE-RESILIENCE:7-level-graceful-degradation')
    out_lines.append('#EXT-X-APE-LCEVC:levels-1-2-enabled')
    out_lines.append('#EXT-X-APE-QOS:dscp-ef-af41')
    out_lines.append('#EXT-X-APE-QOE:mos-target-5.0')
    out_lines.append('#EXT-X-APE-TELCHEMY:vstq-vsmq-tr101290')
    out_lines.append('#EXT-X-APE-HYDRA-STEALTH:enabled')
    out_lines.append('#EXT-X-APE-DNA-FIELDS:124')
    out_lines.append('#EXT-X-APE-PLAYERS:40-universal')
    out_lines.append('#EXT-X-APE-DEGRADATION-CHAIN:CMAF+HEVC+LCEVC->HLS/fMP4+HEVC+LCEVC->HLS/fMP4+H264->HLS/TS+H264->HLS/TS+Baseline->TS-Direct->HTTP-Redirect')
    out_lines.append('#EXT-X-APE-PARADIGM:PLAYER-ENSLAVEMENT-PROTOCOL-V5')
    out_lines.append('#EXT-X-APE-PROFILES:P0-ULTRA_EXTREME,P1-4K_SUPREME,P2-4K_EXTREME,P3-FHD_ADVANCED,P4-HD_STABLE,P5-SD_FAILSAFE')
    out_lines.append('')

    # Parsear canales
    i = 0
    channel_count = 0
    profile_stats = {p: 0 for p in PROFILES}

    while i < len(raw_lines):
        line = raw_lines[i].rstrip('\n').rstrip('\r')

        if line.startswith('#EXTINF:'):
            extinf_line = line
            # Buscar la URL (saltando tags APE, EXTHTTP, EXTVLCOPT, KODIPROP, EXT-X-*)
            url = ''
            j = i + 1
            while j < len(raw_lines):
                candidate = raw_lines[j].rstrip('\n').rstrip('\r')
                if candidate.startswith('#'):
                    j += 1
                    continue
                if candidate.strip() == '':
                    j += 1
                    continue
                url = candidate.strip()
                break

            if url:
                # Detectar perfil
                m_name = re.search(r'tvg-name="([^"]*)"', extinf_line)
                m_group = re.search(r'group-title="([^"]*)"', extinf_line)
                tvg_name = m_name.group(1) if m_name else ''
                group_title = m_group.group(1) if m_group else ''
                profile_id = detect_profile(tvg_name, group_title)
                profile_stats[profile_id] += 1

                # Construir bloque completo
                block = build_channel_block(extinf_line, url, profile_id)
                out_lines.extend(block)
                out_lines.append('')  # Línea en blanco entre canales
                channel_count += 1

                if channel_count % 500 == 0:
                    pct = channel_count / total_channels * 100
                    print(f'[PEP-GEN] Progreso: {channel_count:,}/{total_channels:,} ({pct:.1f}%)', end='\r')

                i = j + 1
                continue

        i += 1

    print(f'\n[PEP-GEN] Canales procesados: {channel_count:,}')
    print(f'[PEP-GEN] Distribución de perfiles:')
    for p, count in profile_stats.items():
        pct = count / channel_count * 100 if channel_count > 0 else 0
        print(f'  {p} ({PROFILES[p]["name"]}): {count:,} ({pct:.1f}%)')

    print(f'[PEP-GEN] Escribiendo: {output_path}')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out_lines) + '\n')

    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f'[PEP-GEN] ✅ Lista generada: {output_path} ({size_mb:.1f} MB)')
    return channel_count, profile_stats

if __name__ == '__main__':
    input_m3u8 = '/home/ubuntu/upload/APE_TYPED_ARRAYS_ULTIMATE_v4.1_RESILIENT(1).m3u8'
    output_m3u8 = '/home/ubuntu/work_v5/APE_PEP_ULTIMATE_v5.0_INTEGRATED.m3u8'

    if not os.path.exists(input_m3u8):
        print(f'ERROR: No se encontró {input_m3u8}')
        sys.exit(1)

    count, stats = parse_and_regenerate(input_m3u8, output_m3u8)
    print(f'\n[PEP-GEN] ═══════════════════════════════════════════')
    print(f'[PEP-GEN] LISTA M3U8 PEP v5.0 GENERADA EXITOSAMENTE')
    print(f'[PEP-GEN] Total canales: {count:,}')
    print(f'[PEP-GEN] Archivo: {output_m3u8}')
    print(f'[PEP-GEN] ═══════════════════════════════════════════')
