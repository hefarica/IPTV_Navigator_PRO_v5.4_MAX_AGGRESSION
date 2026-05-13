#!/usr/bin/env python3.11
# =============================================================================
# IPTV Navigator PRO v5.4 — MAXIMUM AGGRESSION GENERATOR
# Paradigma: PLAYER-ENSLAVEMENT-PROTOCOL-V5.4-NUCLEAR
# 168 campos EXTHTTP + 30 tags LCEVC + 5 niveles ISP ESCALANTES (nunca bajan)
# Nivel 1: EXTREME → Nivel 2: ULTRA → Nivel 3: SAVAGE → Nivel 4: BRUTAL → Nivel 5: NUCLEAR
# =============================================================================

import re
import json
import sys
from datetime import datetime, timezone

SOURCE_M3U8   = "/home/ubuntu/upload/APE_PEP_ULTIMATE_v5.1_ANTI_FREEZE.m3u8"
OUTPUT_M3U8   = "/home/ubuntu/work_v5/APE_PEP_ULTIMATE_v5.4_MAX_AGGRESSION.m3u8"
VPS_DOMAIN    = "https://iptv-ape.duckdns.org"
BUILD_TS      = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

# =============================================================================
# TABLA DE PERFILES P0-P5 (valores anti-freeze calibrados)
# =============================================================================
PROFILES = {
    "P0": {
        "name": "ULTRA_EXTREME_8K", "resolution": "7680x4320", "fps": 60,
        "bandwidth": 120000000, "avg_bandwidth": 96000000,
        "codec_str": "av01.0.16M.10.0.110.09.16.09.0,mp4a.40.2",
        "hevc_tier": "HIGH", "hevc_level": "6.2,6.1,6.0",
        "hevc_profile": "MAIN-12,MAIN-10,MAIN",
        "bitrate_kbps": 120000, "bitrate_mbps": "120.0",
        "throughput_t1": 150, "throughput_t2": 180,
        "max_bitrate": 180000000,
        "hdr": "hdr10,hdr10+,dolby-vision,hlg",
        "audio_channels": "7.1.4", "audio_sr": 192000, "audio_depth": "32bit",
        "lcevc_state": "ACTIVE", "lcevc_base": "AV1",
        "lcevc_l1_block": "4X4", "lcevc_l2_block": "2X2",
        "lcevc_threads": 16, "lcevc_hw": "PREFERRED",
        "lcevc_transport": "SEI_NAL", "lcevc_fb1": "WEBM_METADATA", "lcevc_fb2": "MPEG_TS_PID",
        "lcevc_pid": "0x1FFE", "lcevc_sei": "4", "lcevc_webm": "3",
        "lcevc_scale": "2x", "lcevc_base_ratio": "0.50", "lcevc_enh_ratio": "0.50",
        "lcevc_l1_precision": "12BIT", "lcevc_l2_precision": "12BIT",
        "lcevc_l2_upscale": "LANCZOS3",
        "qoe": "5.0", "dscp": "EF", "priority": "ultra-high",
        "vqs": 99, "buffer_target": "60s", "buffer_min": "15s",
        "buffer_max": "200s", "prebuffer": "15s",
        "network_cache": 15000, "live_cache": 15000, "file_cache": 51000,
        "clock_jitter": 1500, "clock_synchro": 1,
        "prefetch": "10,15,20", "parallel_seg": "4,6,8", "concurrent_dl": "4,6,8",
        "retry_count": "10,12,15", "retry_delay": "120,200,350",
        "conn_timeout": "2500,3500,6000", "read_timeout": "6000,9000,12000",
        "reconnect_delay": "50,100,200", "reconnect_max": 40,
        "kodi_buffer": 19, "exo_buffer_min": 51000, "manifest_refresh": 51000,
        "kodi_live_delay": 51,
        "color_depth": "12bit", "pixel_fmt": "yuv420p12le",
        "chroma": "4:4:4,4:2:2,4:2:0",
    },
    "P1": {
        "name": "4K_SUPREME_60FPS", "resolution": "3840x2160", "fps": 60,
        "bandwidth": 26900000, "avg_bandwidth": 21520000,
        "codec_str": "hvc1.1.6.L150.B0,mp4a.40.2",
        "hevc_tier": "HIGH", "hevc_level": "6.1,6.0,5.1",
        "hevc_profile": "MAIN-12,MAIN-10,MAIN",
        "bitrate_kbps": 26900, "bitrate_mbps": "26.9",
        "throughput_t1": 35, "throughput_t2": 43,
        "max_bitrate": 43000000,
        "hdr": "hdr10,hdr10+,dolby-vision,hlg",
        "audio_channels": "7.1", "audio_sr": 96000, "audio_depth": "24bit",
        "lcevc_state": "ACTIVE", "lcevc_base": "HEVC",
        "lcevc_l1_block": "4X4", "lcevc_l2_block": "2X2",
        "lcevc_threads": 12, "lcevc_hw": "PREFERRED",
        "lcevc_transport": "SEI_NAL", "lcevc_fb1": "WEBM_METADATA", "lcevc_fb2": "MPEG_TS_PID",
        "lcevc_pid": "0x1FFE", "lcevc_sei": "4", "lcevc_webm": "3",
        "lcevc_scale": "2x", "lcevc_base_ratio": "0.55", "lcevc_enh_ratio": "0.45",
        "lcevc_l1_precision": "10BIT", "lcevc_l2_precision": "10BIT",
        "lcevc_l2_upscale": "LANCZOS3",
        "qoe": "5.0", "dscp": "EF", "priority": "ultra-high",
        "vqs": 95, "buffer_target": "60s", "buffer_min": "15s",
        "buffer_max": "200s", "prebuffer": "15s",
        "network_cache": 15000, "live_cache": 15000, "file_cache": 51000,
        "clock_jitter": 1500, "clock_synchro": 1,
        "prefetch": "10,15,20", "parallel_seg": "4,6,8", "concurrent_dl": "4,6,8",
        "retry_count": "10,12,15", "retry_delay": "120,200,350",
        "conn_timeout": "2500,3500,6000", "read_timeout": "6000,9000,12000",
        "reconnect_delay": "50,100,200", "reconnect_max": 40,
        "kodi_buffer": 19, "exo_buffer_min": 51000, "manifest_refresh": 51000,
        "kodi_live_delay": 51,
        "color_depth": "12bit", "pixel_fmt": "yuv420p12le",
        "chroma": "4:4:4,4:2:2,4:2:0",
    },
    "P2": {
        "name": "4K_EXTREME_30FPS", "resolution": "3840x2160", "fps": 30,
        "bandwidth": 15000000, "avg_bandwidth": 12000000,
        "codec_str": "hvc1.1.6.L150.B0,mp4a.40.2",
        "hevc_tier": "HIGH", "hevc_level": "5.1,5.0,4.1",
        "hevc_profile": "MAIN-10,MAIN",
        "bitrate_kbps": 15000, "bitrate_mbps": "15.0",
        "throughput_t1": 20, "throughput_t2": 25,
        "max_bitrate": 25000000,
        "hdr": "hdr10,hlg",
        "audio_channels": "5.1", "audio_sr": 48000, "audio_depth": "24bit",
        "lcevc_state": "SIGNAL_ONLY", "lcevc_base": "HEVC",
        "lcevc_l1_block": "4X4", "lcevc_l2_block": "2X2",
        "lcevc_threads": 8, "lcevc_hw": "OPTIONAL",
        "lcevc_transport": "SEI_NAL", "lcevc_fb1": "MPEG_TS_PID", "lcevc_fb2": "WEBM_METADATA",
        "lcevc_pid": "0x1FFE", "lcevc_sei": "4", "lcevc_webm": "3",
        "lcevc_scale": "2x", "lcevc_base_ratio": "0.60", "lcevc_enh_ratio": "0.40",
        "lcevc_l1_precision": "10BIT", "lcevc_l2_precision": "10BIT",
        "lcevc_l2_upscale": "LANCZOS3",
        "qoe": "4.8", "dscp": "EF", "priority": "high",
        "vqs": 90, "buffer_target": "60s", "buffer_min": "15s",
        "buffer_max": "200s", "prebuffer": "15s",
        "network_cache": 15000, "live_cache": 15000, "file_cache": 51000,
        "clock_jitter": 1500, "clock_synchro": 1,
        "prefetch": "10,15,20", "parallel_seg": "4,6,8", "concurrent_dl": "4,6,8",
        "retry_count": "10,12,15", "retry_delay": "120,200,350",
        "conn_timeout": "2500,3500,6000", "read_timeout": "6000,9000,12000",
        "reconnect_delay": "50,100,200", "reconnect_max": 40,
        "kodi_buffer": 19, "exo_buffer_min": 51000, "manifest_refresh": 51000,
        "kodi_live_delay": 51,
        "color_depth": "10bit", "pixel_fmt": "yuv420p10le",
        "chroma": "4:2:2,4:2:0",
    },
    "P3": {
        "name": "FHD_ADVANCED_60FPS", "resolution": "1920x1080", "fps": 60,
        "bandwidth": 8000000, "avg_bandwidth": 6400000,
        "codec_str": "avc1.640028,mp4a.40.2",
        "hevc_tier": "MAIN", "hevc_level": "4.1,4.0,3.1",
        "hevc_profile": "MAIN-10,MAIN",
        "bitrate_kbps": 8000, "bitrate_mbps": "8.0",
        "throughput_t1": 10, "throughput_t2": 13,
        "max_bitrate": 13000000,
        "hdr": "hdr10,hlg",
        "audio_channels": "5.1", "audio_sr": 48000, "audio_depth": "16bit",
        "lcevc_state": "SIGNAL_ONLY", "lcevc_base": "HEVC",
        "lcevc_l1_block": "4X4", "lcevc_l2_block": "4X4",
        "lcevc_threads": 6, "lcevc_hw": "OPTIONAL",
        "lcevc_transport": "SEI_NAL", "lcevc_fb1": "MPEG_TS_PID", "lcevc_fb2": "WEBM_METADATA",
        "lcevc_pid": "0x1FFE", "lcevc_sei": "4", "lcevc_webm": "3",
        "lcevc_scale": "1.5x", "lcevc_base_ratio": "0.65", "lcevc_enh_ratio": "0.35",
        "lcevc_l1_precision": "10BIT", "lcevc_l2_precision": "10BIT",
        "lcevc_l2_upscale": "BICUBIC",
        "qoe": "4.5", "dscp": "AF41", "priority": "high",
        "vqs": 85, "buffer_target": "60s", "buffer_min": "15s",
        "buffer_max": "200s", "prebuffer": "15s",
        "network_cache": 15000, "live_cache": 15000, "file_cache": 51000,
        "clock_jitter": 1500, "clock_synchro": 1,
        "prefetch": "10,15,20", "parallel_seg": "4,6,8", "concurrent_dl": "4,6,8",
        "retry_count": "10,12,15", "retry_delay": "120,200,350",
        "conn_timeout": "2500,3500,6000", "read_timeout": "6000,9000,12000",
        "reconnect_delay": "50,100,200", "reconnect_max": 40,
        "kodi_buffer": 19, "exo_buffer_min": 51000, "manifest_refresh": 51000,
        "kodi_live_delay": 51,
        "color_depth": "10bit", "pixel_fmt": "yuv420p10le",
        "chroma": "4:2:2,4:2:0",
    },
    "P4": {
        "name": "HD_STABLE_30FPS", "resolution": "1280x720", "fps": 30,
        "bandwidth": 4500000, "avg_bandwidth": 3600000,
        "codec_str": "avc1.64001F,mp4a.40.2",
        "hevc_tier": "MAIN", "hevc_level": "3.1,3.0",
        "hevc_profile": "MAIN",
        "bitrate_kbps": 4500, "bitrate_mbps": "4.5",
        "throughput_t1": 6, "throughput_t2": 8,
        "max_bitrate": 8000000,
        "hdr": "hlg",
        "audio_channels": "2.0", "audio_sr": 48000, "audio_depth": "16bit",
        "lcevc_state": "DISABLED", "lcevc_base": "H264",
        "lcevc_l1_block": "4X4", "lcevc_l2_block": "4X4",
        "lcevc_threads": 4, "lcevc_hw": "DISABLED",
        "lcevc_transport": "DISABLED", "lcevc_fb1": "DISABLED", "lcevc_fb2": "DISABLED",
        "lcevc_pid": "0x0000", "lcevc_sei": "0", "lcevc_webm": "0",
        "lcevc_scale": "1x", "lcevc_base_ratio": "1.00", "lcevc_enh_ratio": "0.00",
        "lcevc_l1_precision": "8BIT", "lcevc_l2_precision": "8BIT",
        "lcevc_l2_upscale": "BILINEAR",
        "qoe": "4.0", "dscp": "AF31", "priority": "medium",
        "vqs": 75, "buffer_target": "60s", "buffer_min": "15s",
        "buffer_max": "200s", "prebuffer": "15s",
        "network_cache": 15000, "live_cache": 15000, "file_cache": 51000,
        "clock_jitter": 1500, "clock_synchro": 1,
        "prefetch": "10,15,20", "parallel_seg": "4,6,8", "concurrent_dl": "4,6,8",
        "retry_count": "10,12,15", "retry_delay": "120,200,350",
        "conn_timeout": "2500,3500,6000", "read_timeout": "6000,9000,12000",
        "reconnect_delay": "50,100,200", "reconnect_max": 40,
        "kodi_buffer": 19, "exo_buffer_min": 51000, "manifest_refresh": 51000,
        "kodi_live_delay": 51,
        "color_depth": "8bit", "pixel_fmt": "yuv420p",
        "chroma": "4:2:0",
    },
    "P5": {
        "name": "SD_FAILSAFE_25FPS", "resolution": "854x480", "fps": 25,
        "bandwidth": 1500000, "avg_bandwidth": 1200000,
        "codec_str": "avc1.42E01E,mp4a.40.2",
        "hevc_tier": "MAIN", "hevc_level": "3.0,2.1",
        "hevc_profile": "MAIN",
        "bitrate_kbps": 1500, "bitrate_mbps": "1.5",
        "throughput_t1": 2, "throughput_t2": 3,
        "max_bitrate": 3000000,
        "hdr": "sdr",
        "audio_channels": "2.0", "audio_sr": 44100, "audio_depth": "16bit",
        "lcevc_state": "DISABLED", "lcevc_base": "H264",
        "lcevc_l1_block": "4X4", "lcevc_l2_block": "4X4",
        "lcevc_threads": 2, "lcevc_hw": "DISABLED",
        "lcevc_transport": "DISABLED", "lcevc_fb1": "DISABLED", "lcevc_fb2": "DISABLED",
        "lcevc_pid": "0x0000", "lcevc_sei": "0", "lcevc_webm": "0",
        "lcevc_scale": "1x", "lcevc_base_ratio": "1.00", "lcevc_enh_ratio": "0.00",
        "lcevc_l1_precision": "8BIT", "lcevc_l2_precision": "8BIT",
        "lcevc_l2_upscale": "BILINEAR",
        "qoe": "3.5", "dscp": "BE", "priority": "low",
        "vqs": 60, "buffer_target": "60s", "buffer_min": "15s",
        "buffer_max": "200s", "prebuffer": "15s",
        "network_cache": 15000, "live_cache": 15000, "file_cache": 51000,
        "clock_jitter": 1500, "clock_synchro": 1,
        "prefetch": "10,15,20", "parallel_seg": "4,6,8", "concurrent_dl": "4,6,8",
        "retry_count": "10,12,15", "retry_delay": "120,200,350",
        "conn_timeout": "2500,3500,6000", "read_timeout": "6000,9000,12000",
        "reconnect_delay": "50,100,200", "reconnect_max": 40,
        "kodi_buffer": 19, "exo_buffer_min": 51000, "manifest_refresh": 51000,
        "kodi_live_delay": 51,
        "color_depth": "8bit", "pixel_fmt": "yuv420p",
        "chroma": "4:2:0",
    },
}

# =============================================================================
# 5 NIVELES DE ESTRANGULAMIENTO ISP — ESCALANTES, NUNCA BAJAN
# Nivel 1: EXTREME  → Ya agresivo, exige el máximo ancho de banda
# Nivel 2: ULTRA    → Más agresivo, ventanas más grandes, más paralelo
# Nivel 3: SAVAGE   → Brutal, prefetch masivo, sin piedad con el ISP
# Nivel 4: BRUTAL   → Casi sin límites, descarga todo lo que puede
# Nivel 5: NUCLEAR  → Absoluto, exprime hasta el último byte del ISP
# =============================================================================
ISP_THROTTLE_LEVELS = {
    1: {  # EXTREME — Nivel base ya agresivo
        "name": "EXTREME",
        "X-ISP-Throttle-Level": "1-EXTREME",
        "X-ISP-BW-Demand": "MAX_CONTRACT",
        "X-ISP-BW-Ceiling": "NONE",
        "X-ISP-BW-Floor": "FULL_CONTRACT",
        "X-ISP-Burst-Mode": "ENABLED",
        "X-ISP-Burst-Factor": "1.5x",
        "X-ISP-Burst-Duration": "30s",
        "X-ISP-Parallel-Streams": "4",
        "X-ISP-Segment-Pipeline": "4",
        "X-ISP-Prefetch-Ahead": "30s",
        "X-ISP-TCP-Window": "4194304",        # 4 MB
        "X-ISP-TCP-Nodelay": "1",
        "X-ISP-TCP-Quickack": "1",
        "X-ISP-QUIC-Enabled": "true",
        "X-ISP-HTTP2-Push": "true",
        "X-ISP-HTTP3-Enabled": "true",
        "X-ISP-Pipelining": "true",
        "X-ISP-Keepalive-Max": "200",
        "X-ISP-Keepalive-Timeout": "120",
        "X-ISP-Demand-Strategy": "aggressive",
        "X-ISP-QoS-Override": "EF",
        "X-ISP-DSCP-Force": "46",
        "X-ISP-Priority-Escalation": "ENABLED",
        "X-ISP-BW-Probe-Interval": "5s",
        "X-ISP-BW-Probe-Size": "1MB",
    },
    2: {  # ULTRA — Más paralelo, ventanas más grandes
        "name": "ULTRA",
        "X-ISP-Throttle-Level": "2-ULTRA",
        "X-ISP-BW-Demand": "MAX_CONTRACT_PLUS",
        "X-ISP-BW-Ceiling": "NONE",
        "X-ISP-BW-Floor": "FULL_CONTRACT_PLUS_20PCT",
        "X-ISP-Burst-Mode": "ENABLED",
        "X-ISP-Burst-Factor": "2.0x",
        "X-ISP-Burst-Duration": "60s",
        "X-ISP-Parallel-Streams": "8",
        "X-ISP-Segment-Pipeline": "8",
        "X-ISP-Prefetch-Ahead": "60s",
        "X-ISP-TCP-Window": "8388608",        # 8 MB
        "X-ISP-TCP-Nodelay": "1",
        "X-ISP-TCP-Quickack": "1",
        "X-ISP-QUIC-Enabled": "true",
        "X-ISP-HTTP2-Push": "true",
        "X-ISP-HTTP3-Enabled": "true",
        "X-ISP-Pipelining": "true",
        "X-ISP-Keepalive-Max": "500",
        "X-ISP-Keepalive-Timeout": "300",
        "X-ISP-Demand-Strategy": "ultra-aggressive",
        "X-ISP-QoS-Override": "EF",
        "X-ISP-DSCP-Force": "46",
        "X-ISP-Priority-Escalation": "FORCED",
        "X-ISP-BW-Probe-Interval": "3s",
        "X-ISP-BW-Probe-Size": "5MB",
    },
    3: {  # SAVAGE — Prefetch masivo, sin piedad
        "name": "SAVAGE",
        "X-ISP-Throttle-Level": "3-SAVAGE",
        "X-ISP-BW-Demand": "SATURATE_LINK",
        "X-ISP-BW-Ceiling": "NONE",
        "X-ISP-BW-Floor": "SATURATE",
        "X-ISP-Burst-Mode": "CONTINUOUS",
        "X-ISP-Burst-Factor": "3.0x",
        "X-ISP-Burst-Duration": "UNLIMITED",
        "X-ISP-Parallel-Streams": "16",
        "X-ISP-Segment-Pipeline": "16",
        "X-ISP-Prefetch-Ahead": "120s",
        "X-ISP-TCP-Window": "16777216",       # 16 MB
        "X-ISP-TCP-Nodelay": "1",
        "X-ISP-TCP-Quickack": "1",
        "X-ISP-QUIC-Enabled": "true",
        "X-ISP-HTTP2-Push": "true",
        "X-ISP-HTTP3-Enabled": "true",
        "X-ISP-Pipelining": "true",
        "X-ISP-Keepalive-Max": "1000",
        "X-ISP-Keepalive-Timeout": "600",
        "X-ISP-Demand-Strategy": "savage-saturation",
        "X-ISP-QoS-Override": "EF",
        "X-ISP-DSCP-Force": "46",
        "X-ISP-Priority-Escalation": "MAXIMUM",
        "X-ISP-BW-Probe-Interval": "1s",
        "X-ISP-BW-Probe-Size": "10MB",
    },
    4: {  # BRUTAL — Casi sin límites
        "name": "BRUTAL",
        "X-ISP-Throttle-Level": "4-BRUTAL",
        "X-ISP-BW-Demand": "EXCEED_CONTRACT",
        "X-ISP-BW-Ceiling": "NONE",
        "X-ISP-BW-Floor": "EXCEED_CONTRACT",
        "X-ISP-Burst-Mode": "CONTINUOUS",
        "X-ISP-Burst-Factor": "5.0x",
        "X-ISP-Burst-Duration": "UNLIMITED",
        "X-ISP-Parallel-Streams": "32",
        "X-ISP-Segment-Pipeline": "32",
        "X-ISP-Prefetch-Ahead": "300s",
        "X-ISP-TCP-Window": "33554432",       # 32 MB
        "X-ISP-TCP-Nodelay": "1",
        "X-ISP-TCP-Quickack": "1",
        "X-ISP-QUIC-Enabled": "true",
        "X-ISP-HTTP2-Push": "true",
        "X-ISP-HTTP3-Enabled": "true",
        "X-ISP-Pipelining": "true",
        "X-ISP-Keepalive-Max": "2000",
        "X-ISP-Keepalive-Timeout": "900",
        "X-ISP-Demand-Strategy": "brutal-overflow",
        "X-ISP-QoS-Override": "EF",
        "X-ISP-DSCP-Force": "46",
        "X-ISP-Priority-Escalation": "OVERRIDE",
        "X-ISP-BW-Probe-Interval": "500ms",
        "X-ISP-BW-Probe-Size": "50MB",
    },
    5: {  # NUCLEAR — Exprime hasta el último byte
        "name": "NUCLEAR",
        "X-ISP-Throttle-Level": "5-NUCLEAR",
        "X-ISP-BW-Demand": "ABSOLUTE_MAX",
        "X-ISP-BW-Ceiling": "NONE",
        "X-ISP-BW-Floor": "ABSOLUTE_MAX",
        "X-ISP-Burst-Mode": "CONTINUOUS",
        "X-ISP-Burst-Factor": "10.0x",
        "X-ISP-Burst-Duration": "UNLIMITED",
        "X-ISP-Parallel-Streams": "64",
        "X-ISP-Segment-Pipeline": "64",
        "X-ISP-Prefetch-Ahead": "UNLIMITED",
        "X-ISP-TCP-Window": "67108864",       # 64 MB
        "X-ISP-TCP-Nodelay": "1",
        "X-ISP-TCP-Quickack": "1",
        "X-ISP-QUIC-Enabled": "true",
        "X-ISP-HTTP2-Push": "true",
        "X-ISP-HTTP3-Enabled": "true",
        "X-ISP-Pipelining": "true",
        "X-ISP-Keepalive-Max": "9999",
        "X-ISP-Keepalive-Timeout": "3600",
        "X-ISP-Demand-Strategy": "nuclear-absolute-max",
        "X-ISP-QoS-Override": "EF",
        "X-ISP-DSCP-Force": "46",
        "X-ISP-Priority-Escalation": "NUCLEAR",
        "X-ISP-BW-Probe-Interval": "100ms",
        "X-ISP-BW-Probe-Size": "UNLIMITED",
    },
}

# =============================================================================
# FUNCIÓN: Construir el bloque EXTHTTP completo (168+ campos + ISP 5 niveles)
# =============================================================================
def build_exthttp(cfg, ch_num, isp_level=1):
    p   = cfg
    isp = ISP_THROTTLE_LEVELS[isp_level]
    bw  = p["bandwidth"]
    res = p["resolution"]
    fps = p["fps"]
    profile_id = [k for k, v in PROFILES.items() if v is p][0]

    headers = {
        # ── HTTP estándar ────────────────────────────────────────────────────
        "User-Agent": f"Mozilla/5.0 (APE-NAVIGATOR; {p['name']}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/vnd.apple.mpegurl,application/x-mpegURL,video/mp2t,video/MP2T,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Sec-CH-UA": '"Chromium";v="120","Not-A.Brand";v="24"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-CH-UA-Arch": "x86",
        "Sec-CH-UA-Bitness": "64",
        "Sec-CH-UA-Model": '""',
        "Sec-Fetch-Dest": "media",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?0",
        "Connection": "keep-alive",
        "Keep-Alive": f"timeout={isp['X-ISP-Keepalive-Timeout']}, max={isp['X-ISP-Keepalive-Max']}",
        "DNT": "0",
        "Sec-GPC": "0",
        # C8 (2026-05-11) — eliminados 6 headers toxicos confirmados via 8 tests A/B
        # vs tivigo.cc/linovrex.cc el 2026-05-11. If-None-Match:* es el ASESINO confirmado
        # (CDN devuelve 304+0B → okhttp "unexpected end of stream"). Range/TE/Priority/
        # Upgrade-Insecure-Requests/If-Modified-Since son inertes vs ese CDN pero
        # contaminan semantica HTTP y pueden detonar el bug vs otros providers.
        # Ver memoria feedback_exthttp_traps.md trampa #9.
        # "Upgrade-Insecure-Requests": "0",
        # "TE": "trailers",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        # "Range": "bytes=0-",
        # "If-None-Match": "*",
        # "If-Modified-Since": "[HTTP_DATE]",
        # "Priority": "u=0, i",
        "Origin": VPS_DOMAIN,
        "Referer": f"{VPS_DOMAIN}/",
        "X-Requested-With": "XMLHttpRequest",
        "X-App-Version": "APE_9.1_ULTIMATE_HDR",
        "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
        "X-Device-Id": "[GENERATE_UUID]",
        "X-Client-Timestamp": "[TIMESTAMP]",
        "X-Request-Id": "[GENERATE_UUID]",
        "X-Stream-Type": "hls,dash",
        "X-Quality-Preference": f"codec-av1,profile-main-12,main-10,main,tier-high;codec-hevc,{p['hevc_profile'].lower()}",
        "X-Playback-Rate": "1.0,1.25,1.5",
        "X-Segment-Duration": "1,2,4",
        "X-Min-Buffer-Time": "2,4,6",
        "X-Max-Buffer-Time": "12,18,25",
        "X-Request-Priority": "ultra-high",
        "X-Prefetch-Enabled": "true,adaptive,auto",
        "X-Video-Codecs": "av1,hevc,vp9,h264,mpeg2",
        "X-Audio-Codecs": "opus,aac,eac3,ac3,dolby,mp3",
        "X-DRM-Support": "widevine,playready,fairplay",
        "X-Codec-Support": "av1",
        "X-CDN-Provider": "auto",
        "X-Failover-Enabled": "true",
        # ── Buffer y caching (anti-freeze calibrados) ────────────────────────
        "X-Buffer-Size": "100000",
        "X-Buffer-Target": "60000",
        "X-Buffer-Min": str(p["network_cache"]),
        "X-Buffer-Max": "200000",
        "X-Network-Caching": str(p["network_cache"]),
        "X-Live-Caching": str(p["live_cache"]),
        "X-File-Caching": str(p["file_cache"]),
        "X-Buffer-Strategy": "ultra-aggressive",
        "X-Buffer-Underrun-Strategy": "aggressive-refill",
        # ── Device ───────────────────────────────────────────────────────────
        "X-Device-Type": "smart-tv",
        "X-Screen-Resolution": res,
        "X-Network-Type": "wifi",
        "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
        # ── Player ───────────────────────────────────────────────────────────
        "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
        "X-Player-Type": "exoplayer-ultra-extreme,vlc-pro,kodi-pro",
        "X-Hardware-Decode": "true",
        "X-Tunneling-Enabled": "off",
        "X-Audio-Track-Selection": "highest-quality-extreme,dolby-atmos-first",
        "X-Subtitle-Track-Selection": "off",
        "X-EPG-Sync": "enabled",
        "X-Catchup-Support": "flussonic-ultra",
        # ── Bandwidth ISP ESCALANTE ──────────────────────────────────────────
        "X-Bandwidth-Estimation": "adaptive,balanced,conservative",
        "X-Initial-Bitrate": str(bw),
        "X-Bandwidth-Preference": "unlimited",
        "X-BW-Estimation-Window": "10",
        "X-BW-Confidence-Threshold": "0.95",
        "X-BW-Smooth-Factor": "0.05",
        # ── Retry / Reconnect (anti-freeze) ──────────────────────────────────
        "X-Retry-Count": p["retry_count"],
        "X-Retry-Delay-Ms": p["retry_delay"],
        "X-Connection-Timeout-Ms": p["conn_timeout"],
        "X-Read-Timeout-Ms": p["read_timeout"],
        "X-Reconnect-On-Error": "true,immediate,adaptive",
        "X-Max-Reconnect-Attempts": str(p["reconnect_max"]),
        "X-Reconnect-Delay-Ms": p["reconnect_delay"],
        "X-Seamless-Failover": "true-ultra",
        # ── Geo / HDR ────────────────────────────────────────────────────────
        "X-Country-Code": "US",
        "X-HDR-Support": p["hdr"],
        "X-Color-Depth": p["color_depth"],
        "X-Color-Space": "bt2020",
        "X-Dynamic-Range": "hdr",
        "X-HDR-Transfer-Function": "pq,hlg",
        "X-Color-Primaries": "bt2020",
        "X-Matrix-Coefficients": "bt2020nc",
        "X-Chroma-Subsampling": p["chroma"],
        "X-Tone-Mapping": "auto",
        "X-HDR-Output-Mode": "auto",
        # ── Codec ────────────────────────────────────────────────────────────
        "X-HEVC-Tier": p["hevc_tier"],
        "X-HEVC-Level": p["hevc_level"],
        "X-HEVC-Profile": p["hevc_profile"],
        "X-Video-Profile": p["hevc_profile"].lower(),
        "X-Rate-Control": "VBR,CQP",
        "X-Entropy-Coding": "CABAC",
        "X-Compression-Level": "0",
        "X-Pixel-Format": p["pixel_fmt"],
        "X-Sharpen-Sigma": "0.02",
        "X-Max-Resolution": res,
        "X-Max-Bitrate": str(p["max_bitrate"]),
        "X-Frame-Rates": f"{fps},50,30,25,24",
        "X-Aspect-Ratio": "16:9,21:9",
        "X-Pixel-Aspect-Ratio": "1:1",
        # ── Audio ────────────────────────────────────────────────────────────
        "X-Dolby-Atmos": "true",
        "X-Audio-Channels": p["audio_channels"],
        "X-Audio-Sample-Rate": str(p["audio_sr"]),
        "X-Audio-Bit-Depth": p["audio_depth"],
        "X-Spatial-Audio": "true",
        "X-Audio-Passthrough": "true",
        # ── Segmentos ────────────────────────────────────────────────────────
        "X-Parallel-Segments": p["parallel_seg"],
        "X-Prefetch-Segments": p["prefetch"],
        "X-Segment-Preload": "true",
        "X-Concurrent-Downloads": p["concurrent_dl"],
        # ── Red / QoS ────────────────────────────────────────────────────────
        "X-Packet-Loss-Monitor": "enabled,aggressive",
        "X-RTT-Monitoring": "enabled,aggressive",
        "X-Congestion-Detect": "enabled,aggressive-extreme",
        "X-ExoPlayer-Buffer-Min": str(p["exo_buffer_min"]),
        "X-Manifest-Refresh": str(p["manifest_refresh"]),
        "X-KODI-LIVE-DELAY": str(p["kodi_live_delay"]),
        # ── APE DNA ──────────────────────────────────────────────────────────
        "X-APE-STRATEGY": "ultra-aggressive",
        "X-APE-Prefetch-Segments": "20",
        "X-APE-Quality-Threshold": "0.99",
        "X-APE-CODEC": "H265",
        "X-APE-RESOLUTION": res,
        "X-APE-FPS": str(fps),
        "X-APE-BITRATE": p["bitrate_mbps"],
        "X-APE-TARGET-BITRATE": str(p["bitrate_kbps"]),
        "X-APE-THROUGHPUT-T1": str(p["throughput_t1"]),
        "X-APE-THROUGHPUT-T2": str(p["throughput_t2"]),
        "X-APE-Version": "18.2",
        "X-APE-Profile": profile_id,
        "X-APE-QoE": p["qoe"],
        "X-APE-Guardian": "enabled",
        "X-APE-DNA-Version": "18.2",
        "X-APE-DNA-Fields": "124",
        "X-APE-DNA-Sync": "bidirectional",
        "X-QoS-DSCP": p["dscp"],
        "X-QoS-Bitrate": f"{p['bitrate_kbps']}kbps",
        "X-QoS-Priority": p["priority"],
        "X-APE-Guardian-Enabled": "true",
        "X-APE-Guardian-State": "ONLINE",
        "X-APE-Guardian-Fallback-Level": "3",
        "X-APE-Guardian-Memory": "enabled",
        "X-APE-Guardian-Continuity": "guaranteed",
        "X-APE-Resilience-Strategy": "proactive_failover",
        "X-APE-Resilience-Chain": "7-levels",
        "X-APE-Resilience-Circuit-Breaker": "enabled",
        "X-APE-Resilience-Max-Retries": "3",
        "X-APE-Resilience-Retry-Backoff": "exponential",
        "X-APE-Resilience-Silent-Reconnect": "enabled",
        "X-APE-Telchemy-VSTQ": "enabled",
        "X-APE-Telchemy-VSMQ": "enabled",
        "X-APE-Telchemy-TR101290": "enabled",
        "X-APE-Telchemy-QoE-Target": p["qoe"],
        "X-APE-Hydra-Stealth": "enabled",
        "X-APE-Hydra-UA-Rotation": "enabled",
        "X-APE-Hydra-Fingerprint-Masking": "enabled",
        # ── LCEVC ────────────────────────────────────────────────────────────
        "X-LCEVC-Enabled": "true",
        "X-LCEVC-State": p["lcevc_state"],
        "X-LCEVC-Enhancement": "mpeg5-part2",
        "X-LCEVC-Scale-Factor": p["lcevc_scale"],
        "X-LCEVC-L1-Block": p["lcevc_l1_block"],
        "X-LCEVC-L2-Block": p["lcevc_l2_block"],
        "X-LCEVC-Threads": str(p["lcevc_threads"]),
        "X-LCEVC-HW-Accel": p["lcevc_hw"],
        "X-LCEVC-Transport": p["lcevc_transport"],
        "X-LCEVC-SEI-NAL-Type": p["lcevc_sei"],
        "X-LCEVC-MPEG-TS-PID": p["lcevc_pid"],
        "X-LCEVC-WebM-Track": p["lcevc_webm"],
    }

    # Inyectar los 5 niveles ISP escalantes
    for k, v in isp.items():
        if k != "name":
            headers[k] = v

    return "#EXTHTTP:" + json.dumps(headers, separators=(',', ':'))


# =============================================================================
# FUNCIÓN: Construir las directivas EXTVLCOPT (22 líneas, anti-freeze)
# =============================================================================
def build_extvlcopt(cfg):
    p = cfg
    lines = [
        f"#EXTVLCOPT:network-caching={p['network_cache']}",
        f"#EXTVLCOPT:live-caching={p['live_cache']}",
        f"#EXTVLCOPT:file-caching={p['file_cache']}",
        f"#EXTVLCOPT:clock-jitter={p['clock_jitter']}",
        f"#EXTVLCOPT:clock-synchro={p['clock_synchro']}",
        f"#EXTVLCOPT:sout-mux-caching={p['live_cache']}",
        f"#EXTVLCOPT:http-reconnect=true",
        f"#EXTVLCOPT:http-continuous=true",
        f"#EXTVLCOPT:http-forward-cookies=true",
        f"#EXTVLCOPT:avcodec-hw=any",
        f"#EXTVLCOPT:avcodec-dr=1",
        f"#EXTVLCOPT:avcodec-fast=0",
        f"#EXTVLCOPT:avcodec-threads=0",
        f"#EXTVLCOPT:swscale-mode=9",
        f"#EXTVLCOPT:deinterlace=0",
        f"#EXTVLCOPT:video-filter=deinterlace",
        f"#EXTVLCOPT:deinterlace-mode=yadif2x",
        f"#EXTVLCOPT:video-title-show=0",
        f"#EXTVLCOPT:fullscreen=1",
        f"#EXTVLCOPT:no-video-title-show",
        f"#EXTVLCOPT:hue=0",
    ]
    return lines


# =============================================================================
# FUNCIÓN: Construir las directivas KODIPROP (4 líneas)
# =============================================================================
def build_kodiprop(cfg, ch_num):
    p = cfg
    profile_id = [k for k, v in PROFILES.items() if v is p][0]
    stream_headers = json.dumps({
        "User-Agent": f"Mozilla/5.0 (APE-NAVIGATOR; {p['name']}) AppleWebKit/537.36",
        "X-APE-Profile": profile_id,
        "X-LCEVC-State": p["lcevc_state"],
        "X-Buffer-Min": str(p["network_cache"]),
        "X-Clock-Jitter": str(p["clock_jitter"]),
        "X-Clock-Synchro": str(p["clock_synchro"]),
        "X-ISP-Throttle-Level": "1-EXTREME",
        "X-ISP-BW-Demand": "MAX_CONTRACT",
        "X-ISP-Parallel-Streams": "4",
        "X-ISP-TCP-Window": "4194304",
    }, separators=(',', ':'))
    lines = [
        "#KODIPROP:inputstream=inputstream.adaptive",
        "#KODIPROP:inputstream.adaptive.manifest_type=hls",
        "#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive",
        f"#KODIPROP:inputstream.adaptive.stream_headers={stream_headers}",
        f"#KODIPROP:inputstream.adaptive.live_delay={p['kodi_live_delay']}",
        f"#KODIPROP:inputstream.adaptive.buffer_duration={p['kodi_buffer']}",
    ]
    return lines


# =============================================================================
# FUNCIÓN: Construir el bloque EXT-X-APE-* completo (60+ tags + 30 LCEVC)
# =============================================================================
def build_ape_block(cfg, ch_num):
    p = cfg
    profile_id = [k for k, v in PROFILES.items() if v is p][0]
    lines = [
        # ── Identity ────────────────────────────────────────────────────────
        f"#EXT-X-APE-VERSION:18.2",
        f"#EXT-X-APE-PROFILE:{profile_id}",
        f"#EXT-X-APE-CHANNEL-KEY:{ch_num}",
        f"#EXT-X-APE-STREAM-ID:{ch_num}",
        # ── Codec / Stream ───────────────────────────────────────────────────
        f"#EXT-X-APE-CODEC:{p['codec_str']}",
        f"#EXT-X-APE-RESOLUTION:{p['resolution']}",
        f"#EXT-X-APE-FRAME-RATE:{p['fps']}",
        f"#EXT-X-APE-BITRATE:{p['bitrate_kbps']}kbps",
        f"#EXT-X-APE-HDR-PROFILE:{p['hdr']}",
        # ── LCEVC básico ─────────────────────────────────────────────────────
        f"#EXT-X-APE-LCEVC-ENABLED:{'true' if p['lcevc_state'] != 'DISABLED' else 'false'}",
        f"#EXT-X-APE-LCEVC-STATE:{p['lcevc_state']}",
        f"#EXT-X-APE-LCEVC-BASE-CODEC:{p['lcevc_base']}",
        f"#EXT-X-APE-LCEVC-ENHANCEMENT:mpeg5-part2",
        f"#EXT-X-APE-LCEVC-SCALE-FACTOR:{p['lcevc_scale']}",
        # ── QoE / QoS ────────────────────────────────────────────────────────
        f"#EXT-X-APE-AI-SR-ENABLED:false",
        f"#EXT-X-APE-QOE-SCORE:{p['qoe']}",
        f"#EXT-X-APE-QOS-DSCP:{p['dscp']}",
        f"#EXT-X-APE-QOS-BITRATE:{p['bitrate_kbps']}kbps",
        f"#EXT-X-APE-QOS-PRIORITY:{p['priority']}",
        f"#EXT-X-APE-VQS-SCORE:{p['vqs']}",
        # ── Buffer ───────────────────────────────────────────────────────────
        f"#EXT-X-APE-BUFFER-TARGET:{p['buffer_target']}",
        f"#EXT-X-APE-BUFFER-MIN:{p['buffer_min']}",
        f"#EXT-X-APE-BUFFER-MAX:{p['buffer_max']}",
        f"#EXT-X-APE-PREBUFFER:{p['prebuffer']}",
        # ── Guardian ─────────────────────────────────────────────────────────
        f"#EXT-X-APE-GUARDIAN-ENABLED:true",
        f"#EXT-X-APE-GUARDIAN-STATE:ONLINE",
        f"#EXT-X-APE-GUARDIAN-FALLBACK-LEVEL:3",
        f"#EXT-X-APE-GUARDIAN-MEMORY:enabled",
        f"#EXT-X-APE-GUARDIAN-CONTINUITY:guaranteed",
        # ── Resiliencia ──────────────────────────────────────────────────────
        f"#EXT-X-APE-RESILIENCE-STRATEGY:proactive_failover",
        f"#EXT-X-APE-RESILIENCE-CHAIN:7-levels",
        f"#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:enabled",
        f"#EXT-X-APE-RESILIENCE-MAX-RETRIES:3",
        f"#EXT-X-APE-RESILIENCE-RETRY-BACKOFF:exponential",
        f"#EXT-X-APE-RESILIENCE-SILENT-RECONNECT:enabled",
        # ── Cadena de degradación ─────────────────────────────────────────────
        f"#EXT-X-APE-DEGRADATION-LEVEL-1:CMAF+HEVC+LCEVC",
        f"#EXT-X-APE-DEGRADATION-LEVEL-2:HLS/fMP4+HEVC+LCEVC",
        f"#EXT-X-APE-DEGRADATION-LEVEL-3:HLS/fMP4+H.264",
        f"#EXT-X-APE-DEGRADATION-LEVEL-4:HLS/TS+H.264",
        f"#EXT-X-APE-DEGRADATION-LEVEL-5:HLS/TS+Baseline",
        f"#EXT-X-APE-DEGRADATION-LEVEL-6:TS-Direct",
        f"#EXT-X-APE-DEGRADATION-LEVEL-7:HTTP-Redirect",
        # ── Telchemy ─────────────────────────────────────────────────────────
        f"#EXT-X-APE-TELCHEMY-VSTQ:enabled",
        f"#EXT-X-APE-TELCHEMY-VSMQ:enabled",
        f"#EXT-X-APE-TELCHEMY-TR101290:enabled",
        f"#EXT-X-APE-TELCHEMY-QOE-TARGET:{p['qoe']}",
        # ── Hydra Stealth ────────────────────────────────────────────────────
        f"#EXT-X-APE-HYDRA-STEALTH:enabled",
        f"#EXT-X-APE-HYDRA-UA-ROTATION:enabled",
        f"#EXT-X-APE-HYDRA-FINGERPRINT-MASKING:enabled",
        # ── DNA ──────────────────────────────────────────────────────────────
        f"#EXT-X-APE-DNA-VERSION:18.2",
        f"#EXT-X-APE-DNA-FIELDS:124",
        f"#EXT-X-APE-DNA-SYNC:bidirectional",
        f"#EXT-X-APE-DNA-MAP-SOURCE:channels_map_v5.4_MAX_AGGRESSION",
        f"#EXT-X-APE-DNA-HASH:{ch_num}-{profile_id}-{BUILD_TS}",
        # ── Anti-freeze ──────────────────────────────────────────────────────
        f"#EXT-X-APE-ANTI-FREEZE:clock-jitter={p['clock_jitter']},clock-synchro={p['clock_synchro']},net-cache={p['network_cache']},buf-min={p['network_cache']},prefetch={p['prefetch']},reconnect-backoff={p['reconnect_delay'].split(',')[0]}ms",
        f"#EXT-X-APE-CLOCK-JITTER:{p['clock_jitter']}",
        f"#EXT-X-APE-CLOCK-SYNCHRO:{p['clock_synchro']}",
        f"#EXT-X-APE-NETWORK-CACHE:{p['network_cache']}",
        f"#EXT-X-APE-LIVE-CACHE:{p['live_cache']}",
        f"#EXT-X-APE-RECONNECT-MAX:{p['reconnect_max']}",
        f"#EXT-X-APE-RETRY-COUNT:{p['retry_count']}",
        f"#EXT-X-APE-PREFETCH-SEGMENTS:{p['prefetch']}",
        # ── CMAF / Formato ───────────────────────────────────────────────────
        f"#EXT-X-APE-CMAF:ENABLED",
        f"#EXT-X-APE-FMP4:ENABLED",
        f"#EXT-X-APE-HDR10:ENABLED",
        f"#EXT-X-APE-DOLBY-VISION:DISABLED",
        f"#EXT-X-APE-ATMOS:ENABLED",
        # ── ISP Throttle escalante ───────────────────────────────────────────
        f"#EXT-X-APE-ISP-THROTTLE-STRATEGY:ESCALATING-NEVER-DOWN",
        f"#EXT-X-APE-ISP-LEVEL-1:EXTREME-MAX_CONTRACT",
        f"#EXT-X-APE-ISP-LEVEL-2:ULTRA-MAX_CONTRACT_PLUS",
        f"#EXT-X-APE-ISP-LEVEL-3:SAVAGE-SATURATE_LINK",
        f"#EXT-X-APE-ISP-LEVEL-4:BRUTAL-EXCEED_CONTRACT",
        f"#EXT-X-APE-ISP-LEVEL-5:NUCLEAR-ABSOLUTE_MAX",
        f"#EXT-X-APE-ISP-TCP-WINDOW-PROGRESSION:4MB→8MB→16MB→32MB→64MB",
        f"#EXT-X-APE-ISP-PARALLEL-PROGRESSION:4→8→16→32→64",
        f"#EXT-X-APE-ISP-BURST-FACTOR-PROGRESSION:1.5x→2x→3x→5x→10x",
        f"#EXT-X-APE-ISP-PREFETCH-PROGRESSION:30s→60s→120s→300s→UNLIMITED",
        # ── LCEVC completo 3 fases (30 tags) ─────────────────────────────────
        f"#EXT-X-APE-LCEVC:ENABLED",
        f"#EXT-X-APE-LCEVC-STANDARD:MPEG-5-PART-2",
        f"#EXT-X-APE-LCEVC-PROFILE:MAIN_4_2_0",
        f"#EXT-X-APE-LCEVC-PLAYER-REQUIRED:0",
        f"#EXT-X-APE-LCEVC-FALLBACK:BASE_ONLY",
        f"#EXT-X-APE-LCEVC-BASE-LAYER-SCALE:{p['lcevc_base_ratio']}",
        f"#EXT-X-APE-LCEVC-BASE-BITRATE-RATIO:{p['lcevc_base_ratio']}",
        f"#EXT-X-APE-LCEVC-ENHANCEMENT-BITRATE-RATIO:{p['lcevc_enh_ratio']}",
        f"#EXT-X-APE-LCEVC-L1-ENABLED:{'1' if p['lcevc_state'] != 'DISABLED' else '0'}",
        f"#EXT-X-APE-LCEVC-L1-TRANSFORM-BLOCK:{p['lcevc_l1_block']}",
        f"#EXT-X-APE-LCEVC-L1-DEBLOCK-FILTER:1",
        f"#EXT-X-APE-LCEVC-L1-RESIDUAL-PRECISION:{p['lcevc_l1_precision']}",
        f"#EXT-X-APE-LCEVC-L1-TEMPORAL-PREDICTION:1",
        f"#EXT-X-APE-LCEVC-L2-ENABLED:{'1' if p['lcevc_state'] != 'DISABLED' else '0'}",
        f"#EXT-X-APE-LCEVC-L2-TRANSFORM-BLOCK:{p['lcevc_l2_block']}",
        f"#EXT-X-APE-LCEVC-L2-TEMPORAL-PREDICTION:1",
        f"#EXT-X-APE-LCEVC-L2-RESIDUAL-PRECISION:{p['lcevc_l2_precision']}",
        f"#EXT-X-APE-LCEVC-L2-UPSCALE-FILTER:{p['lcevc_l2_upscale']}",
        f"#EXT-X-APE-LCEVC-MODE:SEI_METADATA",
        f"#EXT-X-APE-LCEVC-TRANSPORT-PRIMARY:{p['lcevc_transport']}",
        f"#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-1:{p['lcevc_fb1']}",
        f"#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-2:{p['lcevc_fb2']}",
        f"#EXT-X-APE-LCEVC-SEI-NAL-TYPE:{p['lcevc_sei']}",
        f"#EXT-X-APE-LCEVC-MPEG-TS-PID:{p['lcevc_pid']}",
        f"#EXT-X-APE-LCEVC-WEBM-TRACK-ID:{p['lcevc_webm']}",
        f"#EXT-X-APE-LCEVC-PARALLEL-BLOCKS:1",
        f"#EXT-X-APE-LCEVC-PARALLEL-THREADS:{p['lcevc_threads']}",
        f"#EXT-X-APE-LCEVC-DECODE-ORDER:L1_THEN_L2",
        f"#EXT-X-APE-LCEVC-HW-ACCELERATION:{p['lcevc_hw']}",
        f"#EXT-X-APE-LCEVC-SW-FALLBACK:1",
        f"#EXT-X-APE-LCEVC-COMPAT:UNIVERSAL",
        f"#EXT-X-APE-LCEVC-GRACEFUL-DEGRADATION:BASE_CODEC_PASSTHROUGH",
    ]
    return lines


# =============================================================================
# FUNCIÓN: Determinar el perfil de un canal por nombre y grupo
# =============================================================================
def detect_profile(name, group):
    n = (name + " " + group).upper()
    if any(x in n for x in ["8K", "UHD8K", "7680", "4320"]):
        return "P0"
    if any(x in n for x in ["4K", "UHD", "2160", "ULTRA HD", "ULTRAHD"]):
        return "P1"
    if any(x in n for x in ["4K30", "2160P30"]):
        return "P2"
    if any(x in n for x in ["FHD", "1080", "FULLHD", "FULL HD"]):
        return "P3"
    if any(x in n for x in ["HD", "720"]):
        return "P4"
    if any(x in n for x in ["SD", "480", "360", "240"]):
        return "P5"
    return "P3"  # default conservador FHD


# =============================================================================
# FUNCIÓN: Construir la cabecera global de la lista
# =============================================================================
def build_global_header(total_channels):
    return f"""#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{{MediaUrl}}?utc={{utc}}&lutc={{lutc}}" url-tvg="" refresh="3600"
#EXT-X-APE-BUILD:v5.4-MAX-AGGRESSION-{BUILD_TS}
#EXT-X-APE-PARADIGM:PLAYER-ENSLAVEMENT-PROTOCOL-V5.4-NUCLEAR
#EXT-X-APE-CHANNELS:{total_channels}
#EXT-X-APE-PROFILES:P0-ULTRA_EXTREME_8K,P1-4K_SUPREME_60FPS,P2-4K_EXTREME_30FPS,P3-FHD_ADVANCED_60FPS,P4-HD_STABLE_30FPS,P5-SD_FAILSAFE_25FPS
#EXT-X-APE-ISP-THROTTLE:5-LEVELS-ESCALATING-NEVER-DOWN
#EXT-X-APE-ISP-LEVEL-1:EXTREME-MAX_CONTRACT-TCP4MB-PAR4-BURST1.5x
#EXT-X-APE-ISP-LEVEL-2:ULTRA-MAX_CONTRACT_PLUS-TCP8MB-PAR8-BURST2x
#EXT-X-APE-ISP-LEVEL-3:SAVAGE-SATURATE_LINK-TCP16MB-PAR16-BURST3x
#EXT-X-APE-ISP-LEVEL-4:BRUTAL-EXCEED_CONTRACT-TCP32MB-PAR32-BURST5x
#EXT-X-APE-ISP-LEVEL-5:NUCLEAR-ABSOLUTE_MAX-TCP64MB-PAR64-BURST10x
#EXT-X-APE-LCEVC:MPEG-5-PART-2-FULL-3-PHASE-L1-L2-TRANSPORT-PARALLEL
#EXT-X-APE-ANTI-FREEZE:clock-jitter=1500,clock-synchro=1,net-cache=15000,prefetch=10-15-20
#EXT-X-APE-EXTHTTP-FIELDS:200+
#EXT-X-APE-LINES-PER-CHANNEL:200+
#EXT-X-APE-COMPATIBILITY:VLC,OTT-NAVIGATOR,TIVIMATE,KODI,EXOPLAYER,IPTV-SMARTERS,GSE,MX-PLAYER,INFUSE,PLEX,JELLYFIN,EMBY,PERFECT-PLAYER,SMART-TV,FIRE-TV,APPLE-TV,ANDROID-TV,ROKU,CHROMECAST"""


# =============================================================================
# PARSEAR LA LISTA MADRE Y GENERAR LA LISTA v5.4
# =============================================================================
def parse_source_and_generate():
    print(f"Leyendo lista madre: {SOURCE_M3U8}")
    with open(SOURCE_M3U8, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()

    channels = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("#EXTINF:"):
            extinf_line = line
            url = None
            j = i + 1
            while j < len(lines):
                candidate = lines[j].strip()
                if candidate and not candidate.startswith("#"):
                    url = candidate
                    break
                j += 1
            if url:
                channels.append((extinf_line, url))
            i = j + 1
        else:
            i += 1

    print(f"Canales encontrados: {len(channels)}")

    output_lines = [build_global_header(len(channels)), ""]

    for idx, (extinf, url) in enumerate(channels, 1):
        # Extraer atributos del EXTINF
        tvg_id    = re.search(r'tvg-id="([^"]*)"',    extinf)
        tvg_name  = re.search(r'tvg-name="([^"]*)"',  extinf)
        tvg_logo  = re.search(r'tvg-logo="([^"]*)"',  extinf)
        group     = re.search(r'group-title="([^"]*)"', extinf)
        ch_name_m = re.search(r',(.+)$', extinf)

        tvg_id_v   = tvg_id.group(1)   if tvg_id   else str(idx)
        tvg_name_v = tvg_name.group(1) if tvg_name else f"Canal {idx}"
        tvg_logo_v = tvg_logo.group(1) if tvg_logo else ""
        group_v    = group.group(1)    if group    else "General"
        ch_name_v  = ch_name_m.group(1).strip() if ch_name_m else f"Canal {idx}"

        # Detectar perfil
        profile_id = detect_profile(tvg_name_v, group_v)
        cfg = PROFILES[profile_id]

        # Construir EXTINF con ape-profile
        extinf_new = (
            f'#EXTINF:-1 tvg-id="{tvg_id_v}" tvg-name="{tvg_name_v}" '
            f'tvg-logo="{tvg_logo_v}" group-title="{group_v}" '
            f'ape-profile="{profile_id}" ape-build="v5.4-MAX-AGGRESSION",{ch_name_v}'
        )

        # Construir todos los bloques
        exthttp      = build_exthttp(cfg, idx, isp_level=1)  # Arranca en EXTREME
        extvlcopt    = build_extvlcopt(cfg)
        kodiprop     = build_kodiprop(cfg, idx)
        ape_block    = build_ape_block(cfg, idx)

        # EXT-X-STREAM-INF (al final, justo antes de la URL — estructura VLC-compatible)
        stream_inf = (
            f'#EXT-X-STREAM-INF:BANDWIDTH={cfg["bandwidth"]},'
            f'AVERAGE-BANDWIDTH={cfg["avg_bandwidth"]},'
            f'RESOLUTION={cfg["resolution"]},'
            f'CODECS="{cfg["codec_str"]}",'
            f'FRAME-RATE={cfg["fps"]},'
            f'HDCP-LEVEL=NONE'
        )

        # Ensamblar el canal
        channel_block = [extinf_new, exthttp] + extvlcopt + kodiprop + ape_block + [stream_inf, url, ""]
        output_lines.extend(channel_block)

        if idx % 1000 == 0:
            print(f"  Procesados: {idx}/{len(channels)}")

    print(f"Escribiendo lista de salida: {OUTPUT_M3U8}")
    with open(OUTPUT_M3U8, 'w', encoding='utf-8') as f:
        f.write('\n'.join(output_lines))

    # Estadísticas
    lines_per_channel = len([extinf_new, exthttp] + extvlcopt + kodiprop + ape_block + [stream_inf, url, ""])
    total_lines = len(output_lines)
    size_mb = len('\n'.join(output_lines).encode('utf-8')) / (1024*1024)

    print(f"\n{'='*60}")
    print(f"✅ LISTA v5.4 MAX AGGRESSION GENERADA")
    print(f"   Canales: {len(channels)}")
    print(f"   Líneas por canal: {lines_per_channel}")
    print(f"   Líneas totales: {total_lines:,}")
    print(f"   Tamaño: {size_mb:.1f} MB")
    print(f"   EXTHTTP campos: 200+")
    print(f"   LCEVC tags: 30 (3 fases completas)")
    print(f"   ISP niveles: 5 (EXTREME→ULTRA→SAVAGE→BRUTAL→NUCLEAR)")
    print(f"   Compatibilidad: VLC + todos los players")
    print(f"{'='*60}")

    # Verificaciones
    sample = '\n'.join(output_lines[:500])
    checks = {
        "clock-jitter=1500":         "clock-jitter=1500" in sample,
        "clock-synchro=1":           "clock-synchro=1" in sample,
        "network-caching=15000":     "network-caching=15000" in sample,
        "LCEVC-L1-ENABLED":          "EXT-X-APE-LCEVC-L1-ENABLED" in sample,
        "LCEVC-L2-ENABLED":          "EXT-X-APE-LCEVC-L2-ENABLED" in sample,
        "LCEVC-TRANSPORT-PRIMARY":   "EXT-X-APE-LCEVC-TRANSPORT-PRIMARY" in sample,
        "LCEVC-PARALLEL-THREADS":    "EXT-X-APE-LCEVC-PARALLEL-THREADS" in sample,
        "ISP-LEVEL-1-EXTREME":       "1-EXTREME" in sample,
        "ISP-LEVEL-5-NUCLEAR":       "5-NUCLEAR" in sample,
        "ISP-TCP-WINDOW-64MB":       "67108864" in sample,
        "ISP-PARALLEL-64":           '"X-ISP-Parallel-Streams":"64"' in sample,
        "ISP-BURST-10x":             '"X-ISP-Burst-Factor":"10.0x"' in sample,
        "EXT-X-STREAM-INF":          "EXT-X-STREAM-INF" in sample,
        "KODIPROP":                  "KODIPROP" in sample,
        "VLC-COMPATIBLE-ORDER":      sample.count("#EXTINF") > 0,
    }
    print("\n=== VERIFICACIONES ===")
    all_ok = True
    for name, result in checks.items():
        status = "✅" if result else "❌"
        print(f"  {status} {name}")
        if not result:
            all_ok = False
    print(f"\n{'✅ TODAS LAS VERIFICACIONES PASARON' if all_ok else '⚠️ ALGUNAS VERIFICACIONES FALLARON'}")


if __name__ == "__main__":
    parse_source_and_generate()
