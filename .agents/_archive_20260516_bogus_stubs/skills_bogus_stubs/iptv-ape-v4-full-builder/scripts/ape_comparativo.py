#!/usr/bin/env python3
"""
Genera cuadro comparativo ANTES vs DESPUÉS del Artifact Killer
con mejora porcentual o cualitativa por cada campo.
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# DATOS: campo, valor_antes, valor_después, mejora_%, categoría
# ─────────────────────────────────────────────────────────────────────────────
rows = [
    # ── DEBLOCKING ──────────────────────────────────────────────────────────
    ("LCEVC-DEBLOCK-ALPHA",       "-2",          "-4",              "+100%",  "Deblocking"),
    ("LCEVC-DEBLOCK-BETA",        "-2",          "-4",              "+100%",  "Deblocking"),
    ("AK-DEBLOCK-HEVC-BETA",      "AUSENTE",     "-4",              "NUEVO",  "Deblocking"),
    ("AK-DEBLOCK-HEVC-TC",        "AUSENTE",     "-4",              "NUEVO",  "Deblocking"),
    ("AK-DEBLOCK-AV1-LEVEL",      "AUSENTE",     "63 (máx)",        "NUEVO",  "Deblocking"),
    ("AK-DEBLOCK-AV1-SHARPNESS",  "AUSENTE",     "0 (óptimo)",      "NUEVO",  "Deblocking"),
    ("AK-DEBLOCK-FILTER",         "AUSENTE",     "STRONG_INLOOP\n+POSTPROCESS", "NUEVO", "Deblocking"),

    # ── RUIDO / DENOISING ────────────────────────────────────────────────────
    ("X-Detail-Noise-Threshold",  "0.02",        "0.003",           "+567%",  "Denoising"),
    ("AK-NOISE-ALGORITHM",        "NLMEANS\n+HQDN3D", "NLMEANS\n+HQDN3D\n+BILATERAL", "+50%", "Denoising"),
    ("AK-NOISE-EDGE-PROTECT",     "AUSENTE",     "true",            "NUEVO",  "Denoising"),
    ("AK-NOISE-MOTION-COMP.",     "AUSENTE",     "true",            "NUEVO",  "Denoising"),
    ("AK-NOISE-MULTIFRAME",       "AUSENTE",     "true",            "NUEVO",  "Denoising"),
    ("VNOVA-DENOISE-LEVEL",       "AUSENTE",     "ULTRA_CLEAN",     "NUEVO",  "Denoising"),
    ("VNOVA-DENOISE-ALGORITHM",   "AUSENTE",     "NLMEANS_TEMPORAL\n_ULTRA", "NUEVO", "Denoising"),

    # ── NITIDEZ / SHARPENING ─────────────────────────────────────────────────
    ("X-Detail-Sharpen-Sigma",    "0.03",        "0.65",            "+2067%", "Sharpening"),
    ("VNOVA-SHARPENING-STRENGTH", "AUSENTE",     "9/10",            "NUEVO",  "Sharpening"),
    ("VNOVA-SHARPENING-ALGO",     "AUSENTE",     "UNSHARP_MASK\n_ADAPTIVE", "NUEVO", "Sharpening"),
    ("VNOVA-TEXTURE-ENH.",        "AUSENTE",     "NEURAL_TEXTURE\n_V3", "NUEVO", "Sharpening"),
    ("AK-SHARPEN-ANTI-HALO",      "AUSENTE",     "true",            "NUEVO",  "Sharpening"),
    ("AK-SHARPEN-ANTI-RINGING",   "AUSENTE",     "true",            "NUEVO",  "Sharpening"),

    # ── GRANO / ARTEFACTOS ARTIFICIALES ─────────────────────────────────────
    ("LCEVC-GRAIN-SYNTHESIS",     "true",        "false",           "ELIMINADO", "Grano"),
    ("X-HDR-Film-Grain-Synthesis","neural-mpeg\n-standard", "disabled", "ELIMINADO", "Grano"),
    ("LCEVC-COLOR-HALLUCINATION", "MILD",        "NONE",            "ELIMINADO", "Grano"),
    ("LCEVC-BG-DEGRADATION",      "AGGRESSIVE",  "NONE",            "ELIMINADO", "Grano"),

    # ── COMPRESIÓN / BITRATE ─────────────────────────────────────────────────
    ("RATE-CONTROL",              "VBR_CONSTRAINED", "CRF=0",       "ILIMITADO", "Compresión"),
    ("AK-COMPRESSION-LEVEL",      "1",           "0",               "LOSSLESS", "Compresión"),
    ("AK-LOSSLESS-MODE",          "AUSENTE",     "NEAR_LOSSLESS",   "NUEVO",  "Compresión"),
    ("AK-BITRATE-FLOOR",          "AUSENTE",     "UNLIMITED",       "NUEVO",  "Compresión"),
    ("AK-VBV-STRICT",             "AUSENTE",     "false",           "NUEVO",  "Compresión"),

    # ── IA / SUPER RESOLUCIÓN ────────────────────────────────────────────────
    ("AI-SR-SCALE",               "2x",          "4x",              "+100%",  "IA / SR"),
    ("AI-SR-PRECISION",           "FP16",        "FP32",            "+100%\nprecisión", "IA / SR"),
    ("AI-SR-MODEL",               "ESRGAN-4x\n+RealESRGAN", "ESRGAN-4x\n+RealESRGAN\n+HAT-L", "+1 modelo", "IA / SR"),
    ("AI-SR-TILE-SIZE",           "256",         "512",             "+100%",  "IA / SR"),
    ("AI-SR-OVERLAP",             "32",          "64",              "+100%",  "IA / SR"),
    ("LCEVC-COMPUTE-PRECISION",   "INT8",        "FP32",            "+400%\nprecisión", "IA / SR"),
    ("LCEVC-NEURAL-UPSCALE",      "ESRGAN-4x",   "HAT-L-4x",       "MEJOR\nMODELO", "IA / SR"),

    # ── CALIDAD OBJETIVO ─────────────────────────────────────────────────────
    ("VMAF-TARGET",               "95.0",        "99.0",            "+4.2%",  "QoE"),
    ("AI-VMAF-TARGET",            "95",          "99",              "+4.2%",  "QoE"),
    ("VQS-SCORE",                 "95",          "99",              "+4.2%",  "QoE"),
    ("AK-SSIM-TARGET",            "AUSENTE",     "0.999",           "NUEVO",  "QoE"),
    ("AK-PSNR-TARGET",            "AUSENTE",     "60 dB",           "NUEVO",  "QoE"),
    ("AK-PERCEPTUAL-QUALITY",     "SSIM+VMAF",   "SSIM+VMAF\n+LPIPS", "+1 métrica", "QoE"),

    # ── PIPELINE ─────────────────────────────────────────────────────────────
    ("PROCESSING-PIPELINE",       "DECODE,ITM,\nLCEVC,AI,RENDER", "DECODE,DEBLOCK,\nDENOISE,DERING,\nITM,LCEVC,AI-SR,\nAI-DENOISE,\nSHARPEN,RENDER", "+5 etapas", "Pipeline"),
    ("VNOVA-DERING-STRENGTH",     "AUSENTE",     "10 (máx)",        "NUEVO",  "Pipeline"),
    ("AK-BANDING-REDUCTION",      "AUSENTE",     "MAXIMUM",         "NUEVO",  "Pipeline"),
    ("AK-CONTOURING-REDUCTION",   "AUSENTE",     "MAXIMUM",         "NUEVO",  "Pipeline"),
    ("AK-SKIP-FRAMES",            "AUSENTE",     "NEVER",           "NUEVO",  "Pipeline"),
    ("AK-DROP-FRAMES",            "AUSENTE",     "NEVER",           "NUEVO",  "Pipeline"),
]

# ─────────────────────────────────────────────────────────────────────────────
# COLORES POR CATEGORÍA
# ─────────────────────────────────────────────────────────────────────────────
cat_colors = {
    "Deblocking":  "#1a6faf",
    "Denoising":   "#2e8b57",
    "Sharpening":  "#8b4513",
    "Grano":       "#8b0000",
    "Compresión":  "#4b0082",
    "IA / SR":     "#b8860b",
    "QoE":         "#006666",
    "Pipeline":    "#333333",
}

mejora_colors = {
    "NUEVO":     "#27ae60",
    "ELIMINADO": "#c0392b",
    "ILIMITADO": "#8e44ad",
    "LOSSLESS":  "#8e44ad",
    "MEJOR\nMODELO": "#e67e22",
}

def mejora_color(m):
    for k, c in mejora_colors.items():
        if k in m:
            return c
    if "%" in m or "+" in m:
        return "#2980b9"
    return "#7f8c8d"

# ─────────────────────────────────────────────────────────────────────────────
# FIGURA
# ─────────────────────────────────────────────────────────────────────────────
n = len(rows)
fig_h = max(24, n * 0.52 + 3)
fig, ax = plt.subplots(figsize=(18, fig_h))
ax.axis('off')

# Título
fig.patch.set_facecolor('#0d1117')
ax.set_facecolor('#0d1117')

ax.text(0.5, 1.0, 'APE ARTIFACT KILLER — Cuadro Comparativo Antes / Después',
        transform=ax.transAxes, ha='center', va='top',
        fontsize=15, fontweight='bold', color='white',
        fontfamily='monospace')
ax.text(0.5, 0.975, 'Cada campo auditado con su valor original, valor corregido y mejora cuantificada',
        transform=ax.transAxes, ha='center', va='top',
        fontsize=9, color='#aaaaaa', fontfamily='monospace')

# Cabeceras de columna
col_x    = [0.01, 0.22, 0.39, 0.56, 0.73, 0.89]
col_w    = [0.20, 0.16, 0.16, 0.16, 0.15, 0.10]
headers  = ["CAMPO", "CATEGORÍA", "VALOR ANTES", "VALOR DESPUÉS", "MEJORA", "TIPO"]
row_h    = 0.96 / (n + 1.5)
y_start  = 0.955

for ci, (hdr, cx) in enumerate(zip(headers, col_x)):
    ax.text(cx + 0.005, y_start - row_h * 0.3, hdr,
            transform=ax.transAxes, ha='left', va='center',
            fontsize=8.5, fontweight='bold', color='#e0e0e0',
            fontfamily='monospace')

# Línea separadora de cabecera
line_y = y_start - row_h * 0.7
ax.plot([0.01, 0.99], [line_y, line_y], color='#444444', linewidth=1,
        transform=ax.transAxes, zorder=5)

# Filas
prev_cat = None
for ri, (campo, antes, despues, mejora, cat) in enumerate(rows):
    y = y_start - row_h * (ri + 1.2)
    bg = '#161b22' if ri % 2 == 0 else '#0d1117'

    # Fondo de fila
    rect = mpatches.FancyBboxPatch(
        (0.005, y - row_h * 0.45), 0.99, row_h * 0.9,
        boxstyle="round,pad=0.002", linewidth=0,
        facecolor=bg, transform=ax.transAxes, zorder=0
    )
    ax.add_patch(rect)

    # Separador de categoría
    if cat != prev_cat:
        sep_y = y + row_h * 0.5
        ax.plot([0.01, 0.99], [sep_y, sep_y],
                color=cat_colors.get(cat, '#555'), linewidth=0.8,
                linestyle='--', transform=ax.transAxes, alpha=0.6, zorder=5)
        prev_cat = cat

    # Campo (col 0)
    ax.text(col_x[0] + 0.005, y, campo,
            transform=ax.transAxes, ha='left', va='center',
            fontsize=7.5, color='#c9d1d9', fontfamily='monospace')

    # Categoría (col 1) — badge de color
    cat_c = cat_colors.get(cat, '#555')
    badge = mpatches.FancyBboxPatch(
        (col_x[1], y - row_h * 0.35), col_w[1] * 0.9, row_h * 0.7,
        boxstyle="round,pad=0.003", linewidth=0,
        facecolor=cat_c + '33', edgecolor=cat_c,
        transform=ax.transAxes, zorder=1
    )
    ax.add_patch(badge)
    ax.text(col_x[1] + col_w[1] * 0.45, y, cat,
            transform=ax.transAxes, ha='center', va='center',
            fontsize=7, color=cat_c, fontweight='bold', fontfamily='monospace')

    # Valor antes (col 2) — rojo si es débil/ausente
    antes_color = '#ff6b6b' if 'AUSENTE' in antes else '#e0a070'
    ax.text(col_x[2] + 0.005, y, antes,
            transform=ax.transAxes, ha='left', va='center',
            fontsize=7.5, color=antes_color, fontfamily='monospace')

    # Valor después (col 3) — verde
    ax.text(col_x[3] + 0.005, y, despues,
            transform=ax.transAxes, ha='left', va='center',
            fontsize=7.5, color='#56d364', fontfamily='monospace')

    # Mejora (col 4) — badge
    mc = mejora_color(mejora)
    mbadge = mpatches.FancyBboxPatch(
        (col_x[4], y - row_h * 0.35), col_w[4] * 0.9, row_h * 0.7,
        boxstyle="round,pad=0.003", linewidth=0,
        facecolor=mc + '33', edgecolor=mc,
        transform=ax.transAxes, zorder=1
    )
    ax.add_patch(mbadge)
    ax.text(col_x[4] + col_w[4] * 0.45, y, mejora,
            transform=ax.transAxes, ha='center', va='center',
            fontsize=7, color=mc, fontweight='bold', fontfamily='monospace')

    # Tipo (col 5)
    tipo = "CORREGIDO" if 'AUSENTE' not in antes else "NUEVO"
    tipo_c = '#f0883e' if tipo == 'CORREGIDO' else '#27ae60'
    ax.text(col_x[5] + 0.005, y, tipo,
            transform=ax.transAxes, ha='left', va='center',
            fontsize=7, color=tipo_c, fontweight='bold', fontfamily='monospace')

# Leyenda inferior
leyenda_items = [
    (mpatches.Patch(facecolor='#ff6b6b33', edgecolor='#ff6b6b'), "Valor débil/ausente"),
    (mpatches.Patch(facecolor='#56d36433', edgecolor='#56d364'), "Valor corregido"),
    (mpatches.Patch(facecolor='#27ae6033', edgecolor='#27ae60'), "Campo nuevo inyectado"),
    (mpatches.Patch(facecolor='#c0392b33', edgecolor='#c0392b'), "Elemento eliminado"),
    (mpatches.Patch(facecolor='#2980b933', edgecolor='#2980b9'), "Mejora cuantificada"),
]
handles = [h for h, _ in leyenda_items]
labels  = [l for _, l in leyenda_items]
legend = ax.legend(handles, labels, loc='lower center',
                   bbox_to_anchor=(0.5, -0.01),
                   ncol=5, frameon=True,
                   facecolor='#161b22', edgecolor='#444444',
                   labelcolor='#c9d1d9', fontsize=8)

# Estadísticas resumen
total_corr = sum(1 for r in rows if 'AUSENTE' not in r[1])
total_new  = sum(1 for r in rows if 'AUSENTE' in r[1])
ax.text(0.01, 0.005,
        f"Total campos corregidos: {total_corr}  |  Campos nuevos inyectados: {total_new}  |  "
        f"Total cambios: {len(rows)}  |  Canales afectados: 4,143",
        transform=ax.transAxes, ha='left', va='bottom',
        fontsize=8, color='#8b949e', fontfamily='monospace')

plt.tight_layout(pad=0.5)
out = '/home/ubuntu/comparativo_artifact_killer.png'
plt.savefig(out, dpi=150, bbox_inches='tight',
            facecolor='#0d1117', edgecolor='none')
plt.close()
print(f"Guardado: {out}")
print(f"Filas: {len(rows)} | Corregidos: {total_corr} | Nuevos: {total_new}")
