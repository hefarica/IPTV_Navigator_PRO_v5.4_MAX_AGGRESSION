#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mide nitidez real de la pantalla del ONN desde un screencap RAW (RGBA8888).

Metrica: varianza del Laplaciano (proxy estandar de nitidez/edge energy).
Si el VPP del SoC (AI-SR / AI-PQ) esta actuando, la energia de alta frecuencia
sube. Se mide SOLO la zona de video, no la barra de estado.

Uso:
  python onn_sharpness.py captura <archivo.raw> [--json]
"""
import json
import struct
import sys

import numpy as np


def load_raw(path):
    """screencap sin -p: w(4) h(4) format(4) + pixeles RGBA8888."""
    with open(path, "rb") as fh:
        buf = fh.read()
    if len(buf) < 16:
        raise ValueError("archivo demasiado corto")
    w, h, fmt = struct.unpack("<III", buf[:12])
    px = np.frombuffer(buf[12:12 + w * h * 4], dtype=np.uint8)
    if px.size != w * h * 4:
        raise ValueError("pixeles incompletos: %d de %d" % (px.size, w * h * 4))
    img = px.reshape(h, w, 4)
    return img[:, :, :3].astype(np.float32), w, h, fmt


def luma(rgb):
    # BT.709 luma, lo que percibe el ojo
    return (0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2])


def laplacian_var(g):
    """Kernel 4-vecinos. Varianza alta = mas detalle de borde."""
    k = (g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]) - 4.0 * g[1:-1, 1:-1]
    return float(np.var(k)), float(np.mean(np.abs(k)))


def medida(path, top_skip_frac=0.06):
    rgb, w, h, fmt = load_raw(path)
    y0 = int(h * top_skip_frac)          # saltar la barra de titulo
    crop = luma(rgb[y0:h, :])
    lap_var, lap_abs = laplacian_var(crop)
    # recorte central del 60% para evitar bordes de letterbox
    ch, cw = crop.shape
    cy0, cy1 = int(ch * 0.2), int(ch * 0.8)
    cx0, cx1 = int(cw * 0.2), int(cw * 0.8)
    core = crop[cy0:cy1, cx0:cx1]
    core_var, core_abs = laplacian_var(core)
    return {
        "archivo": path.split("/")[-1].split("\\")[-1],
        "w": w, "h": h, "fmt": fmt,
        "luma_media": round(float(np.mean(crop)), 2),
        "luma_std": round(float(np.std(crop)), 2),
        "lap_var_full": round(lap_var, 3),
        "lap_abs_full": round(lap_abs, 4),
        "lap_var_core": round(core_var, 3),
        "lap_abs_core": round(core_abs, 4),
    }


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] != "captura":
        print("uso: onn_sharpness.py captura <archivo.raw> [--json]")
        sys.exit(2)
    m = medida(sys.argv[2])
    if "--json" in sys.argv:
        print(json.dumps(m, ensure_ascii=False))
    else:
        print("  %-16s %sx%s fmt=%s" % (m["archivo"], m["w"], m["h"], m["fmt"]))
        print("    luma media      : %s" % m["luma_media"])
        print("    luma std        : %s" % m["luma_std"])
        print("    Laplaciano var  : %s  (full)   %s (centro)" % (m["lap_var_full"], m["lap_var_core"]))
        print("    Laplaciano |x|  : %s  (full)   %s (centro)" % (m["lap_abs_full"], m["lap_abs_core"]))
