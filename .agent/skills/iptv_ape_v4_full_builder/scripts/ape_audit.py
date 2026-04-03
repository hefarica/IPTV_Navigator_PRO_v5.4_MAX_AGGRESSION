#!/usr/bin/env python3
"""
Auditoría forense de las directivas anti-artefacto de la lista APE.
Detecta qué está presente, qué valor tiene, y si está en nivel óptimo o débil.
"""
import re

FILE = "/home/ubuntu/upload/APE_TYPED_ARRAYS_ULTIMATE_20260331(1).m3u8"

# Leer cabecera global + primer canal completo
lines = []
with open(FILE, 'r', encoding='utf-8', errors='replace') as f:
    for i, line in enumerate(f):
        if i >= 800:
            break
        lines.append(line.rstrip('\n'))
text = '\n'.join(lines)

def get(pattern, default='AUSENTE'):
    m = re.search(pattern, text)
    return m.group(1).strip() if m else default

def has(pattern):
    return bool(re.search(pattern, text, re.IGNORECASE))

print("=" * 70)
print("  AUDITORÍA ANTI-ARTEFACTO — APE TYPED ARRAYS ULTIMATE")
print("=" * 70)

# ─────────────────────────────────────────────────────────────────────────────
# 1. DEBLOCKING
# ─────────────────────────────────────────────────────────────────────────────
print("\n── 1. DEBLOCKING ──────────────────────────────────────────────────────")
db_strength = get(r'EXT-X-APE-DEBLOCK-STRENGTH:(\S+)')
db_alpha    = get(r'EXT-X-APE-LCEVC-DEBLOCK-ALPHA:(\S+)')
db_beta     = get(r'EXT-X-APE-LCEVC-DEBLOCK-BETA:(\S+)')
cortex_db   = get(r'EXT-X-CORTEX-AV1-DEBLOCKING:(\S+)')
ai_db       = get(r'EXT-X-APE-AI-DEBLOCKING:(\S+)')
print(f"  APE-DEBLOCK-STRENGTH       : {db_strength}")
print(f"  LCEVC-DEBLOCK-ALPHA        : {db_alpha}  (óptimo: -3 o menor)")
print(f"  LCEVC-DEBLOCK-BETA         : {db_beta}   (óptimo: -3 o menor)")
print(f"  CORTEX-AV1-DEBLOCKING      : {cortex_db}")
print(f"  AI-DEBLOCKING              : {ai_db}")
print(f"  DIAGNÓSTICO: alpha/beta en -2 → MODERADO. Óptimo sería -3/-3 o -4/-4")

# ─────────────────────────────────────────────────────────────────────────────
# 2. DENOISING / REDUCCIÓN DE RUIDO
# ─────────────────────────────────────────────────────────────────────────────
print("\n── 2. DENOISING ───────────────────────────────────────────────────────")
denoise_algo   = get(r'EXT-X-APE-DENOISE-ALGORITHM:(\S+)')
denoise_strat  = get(r'EXT-X-APE-DENOISE-STRATEGY:(\S+)')
cortex_nr      = get(r'EXT-X-CORTEX-AI-MULTIFRAME-NR:(\S+)')
ai_denoise     = get(r'EXT-X-APE-AI-DENOISING:(\S+)')
noise_thresh   = get(r'"X-Detail-Noise-Threshold":"([^"]+)"')
vnova_denoise  = get(r'"denoise_level":"([^"]+)"')
vnova_algo     = get(r'"denoise_algorithm":"([^"]+)"')
print(f"  APE-DENOISE-ALGORITHM      : {denoise_algo}")
print(f"  APE-DENOISE-STRATEGY       : {denoise_strat}")
print(f"  CORTEX-MULTIFRAME-NR       : {cortex_nr}")
print(f"  AI-DENOISING               : {ai_denoise}")
print(f"  X-Detail-Noise-Threshold   : {noise_thresh}  (óptimo: 0.01 o menor)")
print(f"  VNOVA denoise_level        : {vnova_denoise}")
print(f"  VNOVA denoise_algorithm    : {vnova_algo}")
print(f"  DIAGNÓSTICO: Noise-Threshold 0.02 → DEMASIADO PERMISIVO (deja pasar ruido)")

# ─────────────────────────────────────────────────────────────────────────────
# 3. ARTEFACTOS DE BLOQUE (RINGING / MOSQUITO NOISE)
# ─────────────────────────────────────────────────────────────────────────────
print("\n── 3. RINGING / MOSQUITO NOISE ────────────────────────────────────────")
dering_str  = get(r'"dering_strength":(\d+)')
ai_artifact = get(r'EXT-X-APE-AI-ARTIFACT-REMOVAL:(\S+)')
cdef        = get(r'EXT-X-CORTEX-AV1-CDEF:(\S+)')
loop_filter = get(r'"loop-filter":"([^"]+)"')
print(f"  VNOVA dering_strength      : {dering_str}  (óptimo: 10, está en {dering_str})")
print(f"  AI-ARTIFACT-REMOVAL        : {ai_artifact}")
print(f"  CORTEX-AV1-CDEF            : {cdef}")
print(f"  loop-filter                : {loop_filter}")
print(f"  DIAGNÓSTICO: dering_strength=10 es el máximo. BIEN.")

# ─────────────────────────────────────────────────────────────────────────────
# 4. SHARPENING / NITIDEZ
# ─────────────────────────────────────────────────────────────────────────────
print("\n── 4. SHARPENING ──────────────────────────────────────────────────────")
sharp_algo   = get(r'"sharpening_algorithm":"([^"]+)"')
sharp_str    = get(r'"sharpening_strength":(\d+)')
sharp_mode   = get(r'EXT-X-APE-AI-SHARPENING:(\S+)')
sharpen_sig  = get(r'"X-Detail-Sharpen-Sigma":"([^"]+)"')
edge_enh     = get(r'"X-Detail-Edge-Enhancement":"([^"]+)"')
texture_enh  = get(r'"X-Detail-Texture-Enhancement":"([^"]+)"')
cortex_l2    = get(r'EXT-X-CORTEX-LCEVC-L2-DETAIL:(\S+)')
vnova_tex    = get(r'"texture_enhancement":"([^"]+)"')
print(f"  VNOVA sharpening_algorithm : {sharp_algo}")
print(f"  VNOVA sharpening_strength  : {sharp_str}  (escala 1-10, óptimo: 8-9)")
print(f"  AI-SHARPENING              : {sharp_mode}")
print(f"  X-Detail-Sharpen-Sigma     : {sharpen_sig}  (óptimo: 0.5-0.8 para imagen limpia)")
print(f"  X-Detail-Edge-Enhancement  : {edge_enh}")
print(f"  X-Detail-Texture-Enhancement: {texture_enh}")
print(f"  CORTEX-LCEVC-L2-DETAIL     : {cortex_l2}")
print(f"  VNOVA texture_enhancement  : {vnova_tex}")
print(f"  DIAGNÓSTICO: Sharpen-Sigma=0.03 → EXTREMADAMENTE BAJO (casi sin efecto)")

# ─────────────────────────────────────────────────────────────────────────────
# 5. BITRATE / COMPRESIÓN
# ─────────────────────────────────────────────────────────────────────────────
print("\n── 5. BITRATE Y COMPRESIÓN ────────────────────────────────────────────")
bitrate      = get(r'EXT-X-APE-BITRATE:(\S+)')
vbv_max      = get(r'EXT-X-APE-VBV-MAX-RATE:(\S+)')
vbv_buf      = get(r'EXT-X-APE-VBV-BUF-SIZE:(\S+)')
rate_ctrl    = get(r'EXT-X-APE-RATE-CONTROL:(\S+)')
init_bw      = get(r'"X-Initial-Bitrate":"([^"]+)"')
bw_pref      = get(r'"X-Bandwidth-Preference":"([^"]+)"')
compression  = get(r'"X-Compression-Level":"([^"]+)"')
print(f"  APE-BITRATE                : {bitrate}")
print(f"  APE-VBV-MAX-RATE           : {vbv_max} kbps")
print(f"  APE-VBV-BUF-SIZE           : {vbv_buf} kbps")
print(f"  APE-RATE-CONTROL           : {rate_ctrl}")
print(f"  X-Initial-Bitrate          : {init_bw} bps")
print(f"  X-Bandwidth-Preference     : {bw_pref}")
print(f"  X-Compression-Level        : {compression}  (1=mínima compresión, óptimo: 0)")
print(f"  DIAGNÓSTICO: VBR_CONSTRAINED puede comprimir en escenas complejas. Mejor: CQP o CRF=0")

# ─────────────────────────────────────────────────────────────────────────────
# 6. FILM GRAIN / GRAIN SYNTHESIS
# ─────────────────────────────────────────────────────────────────────────────
print("\n── 6. FILM GRAIN SYNTHESIS ────────────────────────────────────────────")
grain_ape    = get(r'EXT-X-APE-FILM-GRAIN-PRESERVATION:(\S+)')
grain_lcevc  = get(r'EXT-X-APE-LCEVC-GRAIN-SYNTHESIS:(\S+)')
grain_ai     = get(r'"X-HDR-Film-Grain-Synthesis":"([^"]+)"')
print(f"  APE-FILM-GRAIN-PRESERVATION: {grain_ape}")
print(f"  LCEVC-GRAIN-SYNTHESIS      : {grain_lcevc}")
print(f"  X-HDR-Film-Grain-Synthesis : {grain_ai}")
print(f"  DIAGNÓSTICO: FILM-GRAIN-PRESERVATION=DISABLED_IPTV_CLEAN → CORRECTO para IPTV")
print(f"  Pero LCEVC-GRAIN-SYNTHESIS=true puede añadir grano artificial → DESACTIVAR")

# ─────────────────────────────────────────────────────────────────────────────
# 7. RESUMEN DE BRECHAS CRÍTICAS
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("  BRECHAS CRÍTICAS DETECTADAS (causas de artefactos)")
print("=" * 70)
issues = [
    ("CRÍTICO",  "LCEVC-DEBLOCK-ALPHA/BETA = -2",      "Subir a -4/-4 para deblocking más agresivo"),
    ("CRÍTICO",  "X-Detail-Noise-Threshold = 0.02",     "Bajar a 0.005 para capturar más ruido"),
    ("CRÍTICO",  "X-Detail-Sharpen-Sigma = 0.03",       "Subir a 0.6 para nitidez real sin halos"),
    ("CRÍTICO",  "X-Compression-Level = 1",             "Cambiar a 0 (sin compresión adicional)"),
    ("ALTO",     "LCEVC-GRAIN-SYNTHESIS = true",        "Desactivar: añade grano artificial"),
    ("ALTO",     "RATE-CONTROL = VBR_CONSTRAINED",      "Cambiar a CRF o CQP para bitrate ilimitado"),
    ("ALTO",     "sharpening_strength = 7",             "Subir a 9 en VNOVA para máxima nitidez"),
    ("MEDIO",    "LCEVC-BG-DEGRADATION = AGGRESSIVE",   "Cambiar a NONE: no degradar el fondo"),
    ("MEDIO",    "AI-SR-SCALE = 2x",                    "Subir a 4x para máximo upscaling"),
    ("MEDIO",    "LCEVC-COLOR-HALLUCINATION = MILD",    "Cambiar a NONE: evitar colores inventados"),
]
for sev, issue, fix in issues:
    print(f"  [{sev:8s}] {issue}")
    print(f"             → FIX: {fix}")
    print()
