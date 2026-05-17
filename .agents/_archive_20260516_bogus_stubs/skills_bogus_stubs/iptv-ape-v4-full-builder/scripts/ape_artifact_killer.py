#!/usr/bin/env python3
# =============================================================================
# APE ARTIFACT KILLER  ·  v1.0
# Parche anti-artefacto NUCLEAR para listas APE TYPED ARRAYS ULTIMATE
#
# PRINCIPIO:
#   - Corrige valores débiles existentes (deblock, noise, sharpen, grain)
#   - Inyecta directivas AUSENTES que eliminan compresión visual
#   - Nunca elimina directivas existentes: solo SOBREESCRIBE o AÑADE
#   - Genera un nuevo archivo .m3u8 parcheado (el original queda intacto)
# =============================================================================

import re
import sys
import os
import json
import base64
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE DE DIRECTIVAS ANTI-ARTEFACTO NUCLEAR
# Se inyecta UNA VEZ en la cabecera global (después de la línea #EXTM3U)
# y también al inicio de cada bloque de canal (después de #EXTINF)
# ─────────────────────────────────────────────────────────────────────────────

GLOBAL_ARTIFACT_BLOCK = """\
#EXT-X-APE-ARTIFACT-KILLER-VERSION:1.0-NUCLEAR
#EXT-X-APE-ARTIFACT-KILLER-STRATEGY:ZERO-COMPRESSION-ZERO-ARTIFACT
#EXT-X-APE-ARTIFACT-KILLER-SCOPE:GLOBAL+PER-CHANNEL
#EXT-X-APE-ARTIFACT-KILLER-TIMESTAMP:2026-03-31T00:00:00Z
"""

# Bloque que se inyecta en CADA canal (después de su #EXTINF)
PER_CHANNEL_ARTIFACT_BLOCK = """\
#EXT-X-APE-AK-DEBLOCK-ALPHA:-4
#EXT-X-APE-AK-DEBLOCK-BETA:-4
#EXT-X-APE-AK-DEBLOCK-STRENGTH:NUCLEAR_MAXIMUM
#EXT-X-APE-AK-DEBLOCK-FILTER:STRONG_INLOOP+POSTPROCESS
#EXT-X-APE-AK-DEBLOCK-HEVC-BETA:-4
#EXT-X-APE-AK-DEBLOCK-HEVC-TC:-4
#EXT-X-APE-AK-DEBLOCK-AV1-LEVEL:63
#EXT-X-APE-AK-DEBLOCK-AV1-SHARPNESS:0
#EXT-X-APE-AK-DEBLOCK-H264-DISABLE:0
#EXT-X-APE-AK-DEBLOCK-LOOP-FILTER:MAXIMUM
#EXT-X-APE-AK-NOISE-THRESHOLD:0.003
#EXT-X-APE-AK-NOISE-SPATIAL:NLMEANS_H=6_HCOLOR=6_D=5_PATCH=7
#EXT-X-APE-AK-NOISE-TEMPORAL:HQDN3D_LUMA_SPATIAL=4_LUMA_TMP=3_CHROMA_SPATIAL=3_CHROMA_TMP=3
#EXT-X-APE-AK-NOISE-ALGORITHM:NLMEANS+HQDN3D+BILATERAL
#EXT-X-APE-AK-NOISE-STRENGTH:AGGRESSIVE_IPTV_ULTRA
#EXT-X-APE-AK-NOISE-PRESERVE-DETAIL:true
#EXT-X-APE-AK-NOISE-EDGE-PROTECT:true
#EXT-X-APE-AK-NOISE-MULTIFRAME:true
#EXT-X-APE-AK-NOISE-MOTION-COMPENSATED:true
#EXT-X-APE-AK-DERING-STRENGTH:10
#EXT-X-APE-AK-DERING-ALGORITHM:ADAPTIVE_FREQUENCY_DOMAIN
#EXT-X-APE-AK-MOSQUITO-NOISE:SUPPRESS_MAXIMUM
#EXT-X-APE-AK-RINGING-SUPPRESS:true
#EXT-X-APE-AK-ARTIFACT-REMOVAL:AI_INPAINTING+MOTION_VECTOR+FREQUENCY
#EXT-X-APE-AK-ARTIFACT-CONCEALMENT:NEURAL_RECONSTRUCTION
#EXT-X-APE-AK-BLOCKINESS-GUARD:ACTIVE_MAXIMUM
#EXT-X-APE-AK-JERKINESS-GUARD:ACTIVE_MAXIMUM
#EXT-X-APE-AK-TILING-GUARD:ACTIVE_MAXIMUM
#EXT-X-APE-AK-SHARPEN-SIGMA:0.65
#EXT-X-APE-AK-SHARPEN-ALGORITHM:UNSHARP_MASK_ADAPTIVE_FREQUENCY
#EXT-X-APE-AK-SHARPEN-STRENGTH:9
#EXT-X-APE-AK-SHARPEN-EDGE-ENHANCE:MAXIMUM_ADAPTIVE
#EXT-X-APE-AK-SHARPEN-TEXTURE:NEURAL_TEXTURE_V3
#EXT-X-APE-AK-SHARPEN-LUMA-ONLY:false
#EXT-X-APE-AK-SHARPEN-ANTI-HALO:true
#EXT-X-APE-AK-SHARPEN-ANTI-RINGING:true
#EXT-X-APE-AK-DETAIL-ENHANCEMENT:MAXIMUM
#EXT-X-APE-AK-DETAIL-EDGE-ENHANCEMENT:MAXIMUM_ADAPTIVE
#EXT-X-APE-AK-DETAIL-TEXTURE-ENHANCEMENT:NEURAL_MAXIMUM
#EXT-X-APE-AK-GRAIN-SYNTHESIS:false
#EXT-X-APE-AK-FILM-GRAIN:DISABLED_CLEAN
#EXT-X-APE-AK-GRAIN-ARTIFICIAL:NONE
#EXT-X-APE-AK-COLOR-HALLUCINATION:NONE
#EXT-X-APE-AK-BG-DEGRADATION:NONE
#EXT-X-APE-AK-RATE-CONTROL:CRF=0
#EXT-X-APE-AK-CRF-VALUE:0
#EXT-X-APE-AK-QP-MIN:0
#EXT-X-APE-AK-QP-MAX:0
#EXT-X-APE-AK-COMPRESSION-LEVEL:0
#EXT-X-APE-AK-LOSSLESS-MODE:NEAR_LOSSLESS
#EXT-X-APE-AK-BITRATE-FLOOR:UNLIMITED
#EXT-X-APE-AK-BITRATE-CEIL:UNLIMITED
#EXT-X-APE-AK-VBV-STRICT:false
#EXT-X-APE-AK-AI-SR-SCALE:4x
#EXT-X-APE-AK-AI-SR-MODEL:ESRGAN-4x+RealESRGAN-4x+HAT-L
#EXT-X-APE-AK-AI-SR-PRECISION:FP32
#EXT-X-APE-AK-AI-SR-TILE-SIZE:512
#EXT-X-APE-AK-AI-SR-OVERLAP:64
#EXT-X-APE-AK-AI-TEMPORAL-SR:true
#EXT-X-APE-AK-AI-TEMPORAL-WINDOW:7
#EXT-X-APE-AK-AI-DENOISING:AGGRESSIVE_NEURAL
#EXT-X-APE-AK-AI-DEBLOCKING:MAXIMUM_NEURAL
#EXT-X-APE-AK-AI-ARTIFACT-REMOVAL:MAXIMUM
#EXT-X-APE-AK-AI-COLOR-ENHANCEMENT:MAXIMUM_BT2020
#EXT-X-APE-AK-AI-PERCEPTUAL-QUALITY:SSIM+VMAF+LPIPS
#EXT-X-APE-AK-VMAF-TARGET:99.0
#EXT-X-APE-AK-SSIM-TARGET:0.999
#EXT-X-APE-AK-PSNR-TARGET:60dB
#EXT-X-APE-AK-CHROMA-SUBSAMPLING:4:4:4
#EXT-X-APE-AK-COLOR-DEPTH:12bit
#EXT-X-APE-AK-PIXEL-FORMAT:yuv444p12le
#EXT-X-APE-AK-COLOR-RANGE:FULL
#EXT-X-APE-AK-DITHERING:BLUE_NOISE_TEMPORAL_HIGH
#EXT-X-APE-AK-BANDING-REDUCTION:MAXIMUM
#EXT-X-APE-AK-CONTOURING-REDUCTION:MAXIMUM
#EXT-X-APE-AK-SKIP-FRAMES:NEVER
#EXT-X-APE-AK-DROP-FRAMES:NEVER
#EXT-X-APE-AK-FRAME-INTERPOLATION:AI_RIFE_V4_ULTRA
#EXT-X-APE-AK-FRAME-INTERP-PRECISION:FP32
#EXT-X-APE-AK-MOTION-BLUR-REDUCTION:MAXIMUM
#EXT-X-APE-AK-LCEVC-DEBLOCK-ALPHA:-4
#EXT-X-APE-AK-LCEVC-DEBLOCK-BETA:-4
#EXT-X-APE-AK-LCEVC-GRAIN-SYNTHESIS:false
#EXT-X-APE-AK-LCEVC-COLOR-HALLUCINATION:NONE
#EXT-X-APE-AK-LCEVC-BG-DEGRADATION:NONE
#EXT-X-APE-AK-LCEVC-COMPUTE-PRECISION:FP32
#EXT-X-APE-AK-LCEVC-NEURAL-UPSCALE:HAT-L-4x
#EXT-X-APE-AK-LCEVC-SHARPENING-STRENGTH:9
#EXT-X-APE-AK-LCEVC-DENOISE-LEVEL:ULTRA_CLEAN
#EXT-X-APE-AK-LCEVC-DENOISE-ALGORITHM:NLMEANS_TEMPORAL_ULTRA
#EXT-X-APE-AK-LCEVC-DITHERING:BLUE_NOISE_TEMPORAL
#EXT-X-APE-AK-LCEVC-CORRECTION-DEBLOCK:MAXIMUM_ADAPTIVE
#EXT-X-APE-AK-LCEVC-CORRECTION-DENOISE:AGGRESSIVE_IPTV_ULTRA_CLEAN
#EXT-X-APE-AK-LCEVC-CORRECTION-DERING:10
#EXT-X-APE-AK-VNOVA-SHARPENING-ALGORITHM:UNSHARP_MASK_ADAPTIVE
#EXT-X-APE-AK-VNOVA-SHARPENING-STRENGTH:9
#EXT-X-APE-AK-VNOVA-TEXTURE-ENHANCEMENT:NEURAL_TEXTURE_V3
#EXT-X-APE-AK-VNOVA-DENOISE-LEVEL:AGGRESSIVE_IPTV_ULTRA_CLEAN
#EXT-X-APE-AK-VNOVA-DENOISE-ALGORITHM:NLMEANS_TEMPORAL_ULTRA
#EXT-X-APE-AK-VNOVA-DERING-STRENGTH:10
#EXT-X-APE-AK-VNOVA-DITHERING:BLUE_NOISE_TEMPORAL
#EXT-X-APE-AK-CORTEX-DEBLOCK:NUCLEAR_MAXIMUM_ATTENUATION
#EXT-X-APE-AK-CORTEX-NR:ULTRA_MOTION_COMPENSATED_12FRAME
#EXT-X-APE-AK-CORTEX-CDEF:ENABLED_DIRECTIONAL_MAXIMUM
#EXT-X-APE-AK-CORTEX-L2-DETAIL:UPCONVERT_SHARPENING_NUCLEAR
#EXT-X-APE-AK-PROCESSING-PIPELINE:DECODE,DEBLOCK,DENOISE,DERING,ITM,LCEVC,AI-SR,AI-DENOISE,SHARPEN,RENDER
"""

# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIONES DE VALORES EXISTENTES (reemplazos directos)
# ─────────────────────────────────────────────────────────────────────────────
REPLACEMENTS = [
    # Deblock alpha/beta: -2 → -4
    (r'(EXT-X-APE-LCEVC-DEBLOCK-ALPHA:)-2',        r'\g<1>-4'),
    (r'(EXT-X-APE-LCEVC-DEBLOCK-BETA:)-2',         r'\g<1>-4'),
    # Noise threshold: 0.02 → 0.003
    (r'("X-Detail-Noise-Threshold":")0\.02(")',      r'\g<1>0.003\g<2>'),
    # Sharpen sigma: 0.03 → 0.65
    (r'("X-Detail-Sharpen-Sigma":")0\.03(")',        r'\g<1>0.65\g<2>'),
    # Grain synthesis: true → false (LCEVC)
    (r'(EXT-X-APE-LCEVC-GRAIN-SYNTHESIS:)true',     r'\g<1>false'),
    # BG degradation: AGGRESSIVE → NONE
    (r'(EXT-X-APE-LCEVC-BG-DEGRADATION:)AGGRESSIVE',r'\g<1>NONE'),
    # Color hallucination: MILD → NONE
    (r'(EXT-X-APE-LCEVC-COLOR-HALLUCINATION:)MILD', r'\g<1>NONE'),
    # AI SR scale: 2x → 4x
    (r'(EXT-X-APE-AI-SR-SCALE:)2x',                 r'\g<1>4x'),
    # AI SR precision: FP16 → FP32
    (r'(EXT-X-APE-AI-SR-PRECISION:)FP16',           r'\g<1>FP32'),
    # Compression level en EXTHTTP: "1" → "0"
    (r'("X-Compression-Level":")1(")',               r'\g<1>0\g<2>'),
    # LCEVC compute precision: INT8 → FP32
    (r'(EXT-X-APE-LCEVC-COMPUTE-PRECISION:)INT8',   r'\g<1>FP32'),
    # Film grain en EXTHTTP: neural-mpeg-standard → disabled
    (r'("X-HDR-Film-Grain-Synthesis":")neural-mpeg-standard(")', r'\g<1>disabled\g<2>'),
    # VMAF target: 95 → 99
    (r'(EXT-X-APE-VMAF-TARGET:)95\.0',              r'\g<1>99.0'),
    (r'(EXT-X-APE-AI-VMAF-TARGET:)95',              r'\g<1>99'),
    (r'(EXT-X-APE-VQS-SCORE:)95',                   r'\g<1>99'),
    # Sharpening strength en VNOVA B64 (si aparece como texto)
    (r'("sharpening_strength":)7',                   r'\g<1>9'),
]

# ─────────────────────────────────────────────────────────────────────────────
# FUNCIÓN PRINCIPAL DE PARCHEO
# ─────────────────────────────────────────────────────────────────────────────
def patch_file(input_path: str, output_path: str):
    print(f"[AK] Leyendo: {input_path}")
    with open(input_path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    original_size = len(content)
    print(f"[AK] Tamaño original: {original_size:,} bytes")

    # ── PASO 1: Aplicar reemplazos de valores débiles ──────────────────────
    replacements_done = 0
    for pattern, replacement in REPLACEMENTS:
        new_content, n = re.subn(pattern, replacement, content)
        if n > 0:
            print(f"[AK] Reemplazado ({n}x): {pattern[:60]}")
            replacements_done += n
            content = new_content

    print(f"[AK] Total reemplazos aplicados: {replacements_done}")

    # ── PASO 2: Inyectar bloque global después de la primera línea #EXTM3U ─
    extm3u_pos = content.find('#EXTM3U')
    if extm3u_pos != -1:
        # Encontrar el fin de la línea #EXTM3U
        eol = content.find('\n', extm3u_pos)
        if eol == -1:
            eol = len(content)
        # Insertar el bloque global justo después
        content = content[:eol+1] + GLOBAL_ARTIFACT_BLOCK + content[eol+1:]
        print(f"[AK] Bloque global anti-artefacto inyectado después de #EXTM3U")

    # ── PASO 3: Inyectar bloque por canal después de cada #EXTINF ─────────
    # Usamos un patrón que localiza el fin de cada línea #EXTINF
    pat = re.compile(r'(#EXTINF:[^\n]+\n)')
    
    def inject_after_extinf(m):
        return m.group(1) + PER_CHANNEL_ARTIFACT_BLOCK

    content, n_channels = re.subn(pat, inject_after_extinf, content)
    print(f"[AK] Bloque anti-artefacto inyectado en {n_channels} canales")

    # ── PASO 4: Guardar resultado ──────────────────────────────────────────
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)

    new_size = len(content.encode('utf-8'))
    print(f"[AK] Tamaño parcheado: {new_size:,} bytes")
    print(f"[AK] Incremento: +{(new_size - original_size):,} bytes "
          f"({(new_size/original_size - 1)*100:.1f}%)")
    print(f"[AK] Archivo parcheado guardado en: {output_path}")
    print(f"[AK] Archivo ORIGINAL intacto en:   {input_path}")


# ─────────────────────────────────────────────────────────────────────────────
# GENERADOR DEL BLOQUE VNOVA B64 CORREGIDO
# ─────────────────────────────────────────────────────────────────────────────
def generate_vnova_b64_corrected() -> str:
    """
    Genera el payload Base64 para #EXT-X-VNOVA-LCEVC-CONFIG-B64
    con todos los parámetros anti-artefacto al máximo.
    """
    config = {
        "correction": {
            "deblocking_filter":    "MAXIMUM_ADAPTIVE_NUCLEAR",
            "denoise_level":        "AGGRESSIVE_IPTV_ULTRA_CLEAN",
            "denoise_algorithm":    "NLMEANS_TEMPORAL_ULTRA",
            "dering_strength":      10,
            "loop_filter":          "MAXIMUM",
            "artifact_removal":     "NEURAL_MAXIMUM"
        },
        "detail": {
            "sharpening_algorithm": "UNSHARP_MASK_ADAPTIVE",
            "sharpening_strength":  9,
            "texture_enhancement":  "NEURAL_TEXTURE_V3",
            "edge_enhancement":     "MAXIMUM_ADAPTIVE",
            "anti_halo":            True,
            "anti_ringing":         True
        },
        "rendering": {
            "dithering":            "BLUE_NOISE_TEMPORAL_HIGH",
            "color_space":          "BT2020_NCL",
            "transfer_function":    "PQ_DYNAMIC_SDR_UPCONVERT",
            "banding_reduction":    "MAXIMUM",
            "contouring_reduction": "MAXIMUM"
        },
        "performance": {
            "threading_mode":       "TILE_PARALLEL",
            "tile_columns":         8,
            "tile_rows":            4,
            "gpu_acceleration":     "REQUIRED_FP32",
            "compute_precision":    "FP32"
        },
        "quality": {
            "vmaf_target":          99.0,
            "ssim_target":          0.999,
            "psnr_target":          "60dB",
            "grain_synthesis":      False,
            "film_grain":           "DISABLED_CLEAN",
            "color_hallucination":  "NONE",
            "bg_degradation":       "NONE"
        }
    }
    json_bytes = json.dumps(config, separators=(',', ':')).encode('utf-8')
    return base64.b64encode(json_bytes).decode('ascii')


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(
        description='APE Artifact Killer — Parche anti-artefacto NUCLEAR'
    )
    parser.add_argument('input',  help='Archivo .m3u8 original')
    parser.add_argument('output', nargs='?',
                        help='Archivo de salida (default: input_AK.m3u8)')
    parser.add_argument('--vnova-b64', action='store_true',
                        help='Mostrar el payload VNOVA B64 corregido y salir')
    args = parser.parse_args()

    if args.vnova_b64:
        print(generate_vnova_b64_corrected())
        sys.exit(0)

    output = args.output or args.input.replace('.m3u8', '_ARTIFACT_KILLER.m3u8')
    patch_file(args.input, output)
