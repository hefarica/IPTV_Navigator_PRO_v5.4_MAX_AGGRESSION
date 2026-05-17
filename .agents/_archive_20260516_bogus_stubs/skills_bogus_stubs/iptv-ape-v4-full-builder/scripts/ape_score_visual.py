#!/usr/bin/env python3
"""
Extrae y puntúa todos los parámetros de calidad visual de la lista APE.
Cada ítem se evalúa en una escala de 0-10 con su peso relativo.
"""

import re
import json
import base64

FILE = "/home/ubuntu/upload/APE_TYPED_ARRAYS_ULTIMATE_20260331(1).m3u8"

# Leer las primeras 800 líneas (cabecera global + primer canal completo)
lines = []
with open(FILE, 'r', encoding='utf-8', errors='replace') as f:
    for i, line in enumerate(f):
        if i >= 800:
            break
        lines.append(line.rstrip('\n'))

text = '\n'.join(lines)

# ─────────────────────────────────────────────────────────────────────────────
# FUNCIÓN DE EXTRACCIÓN
# ─────────────────────────────────────────────────────────────────────────────
def get(pattern, default='N/A'):
    m = re.search(pattern, text)
    return m.group(1).strip() if m else default

def has(pattern):
    return bool(re.search(pattern, text, re.IGNORECASE))

# ─────────────────────────────────────────────────────────────────────────────
# EXTRACCIÓN DE PARÁMETROS
# ─────────────────────────────────────────────────────────────────────────────
params = {}

# --- RESOLUCIÓN Y BITRATE ---
params['resolution']        = get(r'EXT-X-APE-RESOLUTION:(\S+)')
params['bitrate_kbps']      = get(r'EXT-X-APE-BITRATE:(\S+)')
params['frame_rate']        = get(r'EXT-X-APE-FRAME-RATE:(\S+)')
params['abr_ladder']        = get(r'EXT-X-APE-ABR-LADDER:(.+)')
params['max_resolution']    = get(r'"X-Max-Resolution":"([^"]+)"')
params['max_bitrate']       = get(r'"X-Max-Bitrate":"([^"]+)"')
params['fps_declared']      = get(r'"X-FPS":"([^"]+)"')
params['frame_rates_all']   = get(r'"X-Frame-Rates":"([^"]+)"')

# --- CÓDECS ---
params['codec_ape']         = get(r'EXT-X-APE-CODEC:(\S+)')
params['codec_priority']    = get(r'EXT-X-APE-CODEC-PRIORITY:(.+)')
params['av1_fallback']      = get(r'EXT-X-APE-AV1-FALLBACK-CHAIN:(.+)')
params['vvc_profile']       = get(r'EXT-X-APE-VVC-PROFILE:(\S+)')
params['vvc_level']         = get(r'EXT-X-APE-VVC-LEVEL:(\S+)')
params['vvc_efficiency']    = get(r'EXT-X-APE-VVC-EFFICIENCY:(\S+)')
params['hevc_level_cascade']= get(r'EXT-X-APE-HEVC-LEVEL-CASCADE:(.+)')
params['pixel_format']      = get(r'"X-HDR-Pixel-Format":"([^"]+)"')
params['color_depth']       = get(r'EXT-X-APE-QUANTUM-COLOR-DEPTH:(\S+)')
params['chroma']            = get(r'EXT-X-APE-QUANTUM-CHROMA-SUBSAMPLING:(\S+)')

# --- HDR ---
params['hdr_chain']         = get(r'EXT-X-APE-HDR-CHAIN:(.+)')
params['hdr_peak_lum']      = get(r'EXT-X-APE-HDR-PEAK-LUMINANCE:(\S+)')
params['hdr_min_lum']       = get(r'EXT-X-APE-HDR-MIN-LUMINANCE:(\S+)')
params['hdr_max_cll']       = get(r'EXT-X-APE-HDR-MAX-CLL:(\S+)')
params['hdr_gamut']         = get(r'EXT-X-APE-HDR-GAMUT:(.+)')
params['hdr_dci_p3']        = get(r'EXT-X-APE-HDR-DCI-P3-COVERAGE:(\S+)')
params['hdr_bt2020']        = get(r'EXT-X-APE-HDR-BT2020-COVERAGE:(\S+)')
params['dolby_vision']      = get(r'EXT-X-APE-HDR-DOLBY-VISION-PROFILE:(\S+)')
params['hdr10plus_ver']     = get(r'EXT-X-APE-HDR-10PLUS-VERSION:(\S+)')
params['hlg_compat']        = get(r'EXT-X-APE-HDR-HLG-COMPAT:(\S+)')
params['tone_mapping']      = get(r'EXT-X-APE-HDR-TONE-MAPPING:(\S+)')
params['filmmaker_mode']    = get(r'EXT-X-APE-HDR-FILMMAKER-MODE:(\S+)')
params['hdr_vivid']         = get(r'EXT-X-APE-HDR-VIVID-ENABLED:(\S+)')
params['hdr_ref_white']     = get(r'EXT-X-APE-HDR-REFERENCE-WHITE:(\S+)')

# --- LCEVC ---
params['lcevc_standard']    = get(r'EXT-X-APE-LCEVC-STANDARD:(\S+)')
params['lcevc_phase4']      = get(r'EXT-X-APE-LCEVC-PHASE-4-ENABLED:(\S+)')
params['lcevc_phase3']      = get(r'EXT-X-APE-LCEVC-PHASE-3-ENABLED:(\S+)')
params['lcevc_scale']       = get(r'EXT-X-APE-LCEVC-SCALE-FACTOR:(\S+)')
params['lcevc_neural']      = get(r'EXT-X-APE-LCEVC-NEURAL-UPSCALE:(\S+)')
params['lcevc_l1_block']    = get(r'EXT-X-APE-LCEVC-L1-TRANSFORM-BLOCK:(\S+)')
params['lcevc_l2_upscale']  = get(r'EXT-X-APE-LCEVC-L2-UPSCALE-FILTER:(\S+)')
params['lcevc_grain']       = get(r'EXT-X-APE-LCEVC-GRAIN-SYNTHESIS:(\S+)')
params['lcevc_dither']      = get(r'EXT-X-APE-LCEVC-SPATIAL-DITHERING:(\S+)')
params['lcevc_roi']         = get(r'EXT-X-APE-LCEVC-ROI-PROCESSING:(\S+)')
params['lcevc_roi_targets'] = get(r'EXT-X-APE-LCEVC-ROI-TARGETS:(.+)')
params['lcevc_seg']         = get(r'EXT-X-APE-LCEVC-SEMANTIC-SEGMENTATION:(\S+)')
params['lcevc_rate_ctrl']   = get(r'EXT-X-APE-LCEVC-RATE-CONTROL:(\S+)')
params['lcevc_b_frames']    = get(r'EXT-X-APE-LCEVC-B-FRAMES:(\S+)')
params['lcevc_ref_frames']  = get(r'EXT-X-APE-LCEVC-REF-FRAMES:(\S+)')
params['lcevc_lookahead']   = get(r'EXT-X-APE-LCEVC-LOOKAHEAD:(\S+)')
params['lcevc_hw_accel']    = get(r'EXT-X-APE-LCEVC-HW-ACCELERATION:(\S+)')
params['lcevc_sdk_ver']     = get(r'EXT-X-APE-LCEVC-SDK-VERSION:(\S+)')

# --- AI / SUPER RESOLUTION ---
params['ai_sr_model']       = get(r'EXT-X-APE-AI-SR-MODEL:(.+)')
params['ai_sr_scale']       = get(r'EXT-X-APE-AI-SR-SCALE:(\S+)')
params['ai_sr_precision']   = get(r'EXT-X-APE-AI-SR-PRECISION:(\S+)')
params['ai_temporal_sr']    = get(r'EXT-X-APE-AI-TEMPORAL-SR:(\S+)')
params['ai_denoising']      = get(r'EXT-X-APE-AI-DENOISING:(\S+)')
params['ai_deblocking']     = get(r'EXT-X-APE-AI-DEBLOCKING:(\S+)')
params['ai_artifact_rem']   = get(r'EXT-X-APE-AI-ARTIFACT-REMOVAL:(\S+)')
params['ai_frame_interp']   = get(r'EXT-X-APE-AI-FRAME-INTERPOLATION:(\S+)')
params['ai_color_enh']      = get(r'EXT-X-APE-AI-COLOR-ENHANCEMENT:(\S+)')
params['ai_sharpening']     = get(r'EXT-X-APE-AI-SHARPENING:(\S+)')
params['ai_hdr_upconv']     = get(r'EXT-X-APE-AI-HDR-UPCONVERT:(\S+)')
params['ai_vmaf_target']    = get(r'EXT-X-APE-AI-VMAF-TARGET:(\S+)')
params['ai_content_aware']  = get(r'EXT-X-APE-AI-CONTENT-AWARE-ENCODING:(\S+)')
params['ai_perceptual']     = get(r'EXT-X-APE-AI-PERCEPTUAL-QUALITY:(\S+)')
params['frame_interp_mode'] = get(r'EXT-X-APE-FRAME-INTERPOLATION:(.+)')

# --- ENCODER ---
params['encoder_engine']    = get(r'EXT-X-APE-ENCODER-ENGINE:(\S+)')
params['encoder_preset']    = get(r'EXT-X-APE-ENCODER-PRESET:(\S+)')
params['rate_control']      = get(r'EXT-X-APE-RATE-CONTROL:(\S+)')
params['gop_size']          = get(r'EXT-X-APE-GOP-SIZE:(\S+)')
params['b_frames']          = get(r'EXT-X-APE-B-FRAMES:(\S+)')
params['lookahead']         = get(r'EXT-X-APE-LOOKAHEAD:(\S+)')
params['aq_mode']           = get(r'EXT-X-APE-AQ-MODE:(\S+)')
params['vmaf_target']       = get(r'EXT-X-APE-VMAF-TARGET:(\S+)')
params['vqs_score']         = get(r'EXT-X-APE-VQS-SCORE:(\S+)')
params['qoe_score']         = get(r'EXT-X-APE-QOE-SCORE:(\S+)')
params['denoise_algo']      = get(r'EXT-X-APE-DENOISE-ALGORITHM:(\S+)')
params['deblock_strength']  = get(r'EXT-X-APE-DEBLOCK-STRENGTH:(\S+)')
params['scaler_algo']       = get(r'EXT-X-APE-SCALER-ALGORITHM:(\S+)')
params['gpu_filter_chain']  = get(r'EXT-X-APE-GPU-FILTER-CHAIN:(.+)')
params['processing_pipeline']= get(r'EXT-X-APE-PROCESSING-PIPELINE-ORDER:(.+)')

# --- CORTEX ---
params['cortex_state']      = get(r'EXT-X-CORTEX-OMEGA-STATE:(\S+)')
params['cortex_ai_seg']     = get(r'EXT-X-CORTEX-AI-SEMANTIC-SEGMENTATION:(\S+)')
params['cortex_nr']         = get(r'EXT-X-CORTEX-AI-MULTIFRAME-NR:(\S+)')
params['cortex_av1_cdef']   = get(r'EXT-X-CORTEX-AV1-CDEF:(\S+)')
params['cortex_lcevc_l2']   = get(r'EXT-X-CORTEX-LCEVC-L2-DETAIL:(\S+)')

# --- TELCHEMY ---
params['telchemy_vstq']     = get(r'EXT-X-TELCHEMY-TVQM:VSTQ=(\d+)')
params['telchemy_vsmq']     = get(r'EXT-X-TELCHEMY-TVQM:VSTQ=\d+,VSMQ=(\d+)')
params['telchemy_epsnr']    = get(r'EPSNR=(\d+)')

# ─────────────────────────────────────────────────────────────────────────────
# SISTEMA DE CALIFICACIÓN
# ─────────────────────────────────────────────────────────────────────────────
print(json.dumps(params, indent=2, ensure_ascii=False))
