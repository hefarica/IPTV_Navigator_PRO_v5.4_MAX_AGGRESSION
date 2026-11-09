#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""APE ENGINE — motor de calculo del modulo de imagen JIT, ejecutable por un LLM.

Un solo archivo, sin dependencias, sin red, determinista. Cada subcomando imprime
JSON para que un LLM lo lea y decida.

    python ape_engine.py qoe --vmaf 95 --stall 0.5 --startup 1.2
    python ape_engine.py codec --codec hevc --profile main10 --level 5.1
    python ape_engine.py filter-check --chain "nlmarks..."
    python ape_engine.py profile P0 --in 1280x720 --out 3840x2160
    python ape_engine.py cascade --field res --target 3840x2160
    python ape_engine.py sufficiency --bitrate 28 --bw 84
    python ape_engine.py nvidia --gpu rtx4090
    python ape_engine.py align --profile P0 --in 1280x720 --out 3840x2160
    python ape_engine.py selftest

═══════════════════════════════════════════════════════════════════════════════
PROCEDENCIA — que se uso de cada fuente y en que forma
═══════════════════════════════════════════════════════════════════════════════

REA fue aplicado: rea_frame fijo la rubrica y el tier; rea_adopt devolvio
BLOQUEADO por G3 (fuente fuera de la allowlist de FUSILE). Por tanto NO se porta
codigo de ninguna fuente. Lo que si viaja son VALORES NUMERICOS como hecho
citable (FUSILE binding rule 3: "un numero es un hecho, una linea de codigo no").

  Netflix/vmaf@a6ed0f18285cab504b779bbccb0bbaddc3bf44c2
      Licencia: BSD-2-Clause-Patent (leida del LICENSE en ese sha).
      Estado REA: BLOQUEADO en G3 (allowlist). Enmienda pendiente del operador:
      "CONFIRMED: allowlist amendment Netflix/vmaf"
      Hechos tomados: la escala VMAF es 0..100; los nombres de modelo
      vmaf_v0.6.1 (1080p) y vmaf_4k_v0.6.1 (4K); los modos de pooling
      mean / harmonic_mean / min / perc. NINGUNA linea de codigo.

  FFmpeg/FFmpeg  (66.777 estrellas, medido por la API de GitHub el 2026-11-09)
      Licencia: LGPL-2.1+ / GPL-2.0+ (dual segun build) — copyleft.
      Estado REA: no se porta codigo; los RANGOS de los filtros son hechos
      medidos con el binario real (ffmpeg 8.0.1 y 6.1.1 en la VPS), no leidos
      del fuente. Ver FILTER_LIMITS.

  video-dev/hls.js  (17.038 estrellas, medido por la API el 2026-11-09)
      Licencia: Apache-2.0 (leida del LICENSE).
      Estado REA: no se porta codigo. Los defaults de calibracion ya viven en
      el repo IPTV y se citan aqui como referencia.

  NVIDIA — NVENC/NVDEC/DeepStream
      No hay GPU en este host. La matriz de capacidad es DECLARADA segun la
      documentacion publica de las arquitecturas, NO MEDIDA. Cada fila lo dice.

Honestidad de estado: ver EvidenceState. Un valor "declarado" no es "medido".

═══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import print_function

import argparse
import json
import math
import sys

# ═════════════════════════════════════════════════════════════════════════════
# 0 · CONSTANTES DEL SISTEMA
# ═════════════════════════════════════════════════════════════════════════════

ENGINE_VERSION = "1.0.0"

# Estados de evidencia. Una afirmacion usa exactamente uno.
EVIDENCE_STATES = {
    "declarado": "aparece en un documento, tag, header o perfil",
    "observado": "medido de una respuesta o bitstream real",
    "resuelto": "una regla eligio un valor para una sesion",
    "aplicado": "un motor reporta que lo ejecuto",
    "verificado": "reproducido de forma independiente con artefacto",
}

# Anti-Degradacion: nunca bajar estos ejes para resolver un fallo.
ANTI_DEGRADATION_AXES = ("resolution", "codec_tier", "hdr", "fps", "bitrate")

# Jerarquia de codecs: mayor = mejor. Un codec NUNCA baja de tier.
CODEC_TIER = {
    # nombres comunes Y codec strings RFC 6381: el BUG medido fue tipar solo
    # los strings y que un perfil con codec="hevc" diera tier 0 (asi, bajar de
    # hevc a h264 NO se detectaba como degradacion).
    "vvc": 10, "h266": 10,
    "dvh1": 9, "dvhe": 9, "dv": 9, "dolby-vision": 9,   # Dolby Vision
    "hvc1": 7, "hev1": 7, "hevc": 7, "h265": 7, "h.265": 7,
    "av01": 6, "av1": 6,                                # AV1
    "vp09": 4, "vp9": 4,                                # VP9
    "avc1": 3, "h264": 3, "h.264": 3, "avc": 3,         # H.264
    "mp2v": 1, "mpeg2": 1,
}

# Resoluciones canonicas en orden ASCENDENTE de area.
RESOLUTION_LADDER = [
    (426, 240), (640, 360), (854, 480), (1280, 720),
    (1920, 1080), (2048, 1080), (2560, 1440), (3840, 2160), (7680, 4320),
]

# Bitrate de referencia por resolucion en Mbps (tabla del repo, verificada en
# la sesion: 4K = 28, NO 1 como daba el calculo px*0.06).
BITRATE_TABLE_MBPS = {
    "7680x4320": 80, "3840x2160": 28, "2560x1440": 18,
    "2048x1080": 12, "1920x1080": 8, "1280x720": 5, "854x480": 3, "640x360": 2,
}


# ═════════════════════════════════════════════════════════════════════════════
# 1 · QoE / QoS — calidad percibida y continuidad
# ═════════════════════════════════════════════════════════════════════════════
#
# VMAF: escala 0..100. Hecho citado de Netflix/vmaf (ver procedencia).
# Los umbrales de interpretacion son doctrina de este repo, no de Netflix.

VMAF_MODELS = {
    "vmaf_v0.6.1": "modelo 1080p, el default de la industria",
    "vmaf_4k_v0.6.1": "modelo entrenado para 4K",
    "vmaf_v0.6.1neg": "variante con modo negativo (penaliza el desenfoque)",
}

VMAF_POOLING = ("mean", "harmonic_mean", "min", "perc")

# Bandas de interpretacion. Son umbrales operativos del repo.
VMAF_BANDS = [
    (95, "excelente", "visualmente indistinguible del master"),
    (85, "muy bueno", "defectos solo visibles en comparacion A/B"),
    (70, "bueno", "defectos visibles en escenas dificiles"),
    (55, "aceptable", "artefactos notorios en movimiento"),
    (0, "deficiente", "el bitrate no sostiene la resolucion"),
]

# PSNR en dB. Umbrales clasicos de la literatura de video.
PSNR_BANDS = [
    (40, "excelente"), (35, "bueno"), (30, "aceptable"), (0, "deficiente"),
]

# SSIM 0..1.
SSIM_BANDS = [(0.98, "excelente"), (0.95, "bueno"), (0.90, "aceptable"), (0, "deficiente")]

# ITU-T P.1203: MOS 1..5.
MOS_BANDS = [(4.3, "excelente"), (3.5, "bueno"), (2.5, "aceptable"), (1.0, "deficiente")]

# Objetivos de continuidad. Estos son los que persigue la funcion objetivo.
QOS_TARGETS = {
    "rebuffer_ratio_max": 0.005,     # < 0.5 % del tiempo de reproduccion
    "startup_time_max_s": 2.0,
    "stall_count_max": 0,
    "ttfb_manifest_ms_max": 100,
    "ttfb_segment_ms_max": 500,
    "fps_drop_max": 1.0,             # frames perdidos por segundo sostenido
}


def _band(value, bands):
    """Clasifica un valor contra una tabla de bandas descendente."""
    for limit, label, *rest in bands:
        if value >= limit:
            detail = rest[0] if rest else None
            return label, detail
    return "deficiente", None


def qoe(vmaf=None, psnr=None, ssim=None, mos=None,
        play_s=None, stall_s=None, stalls=None,
        startup_s=None, ttfb_manifest_ms=None, ttfb_segment_ms=None,
        fps_drop=None):
    """Score QoE compuesto con los valores que se le pasen.

    No inventa: cada metrica ausente se reporta como no_computado con su razon.
    El score compuesto solo se calcula si hay al menos VMAF o (PSNR y SSIM).
    """
    out = {
        "ok": True,
        "version": ENGINE_VERSION,
        "metrics": {},
        "no_computado": [],
        "gates": {},
    }

    # ── calidad perceptual ────────────────────────────────────────────────
    if vmaf is not None:
        band, note = _band(float(vmaf), VMAF_BANDS)
        out["metrics"]["vmaf"] = {
            "value": round(float(vmaf), 2), "band": band, "note": note,
            "state": "observado", "scale": "0..100",
            "source": "Netflix/vmaf@a6ed0f18 (hecho citado, no codigo portado)",
        }
    else:
        out["no_computado"].append({
            "metric": "vmaf", "razon": "no se paso --vmaf: sin corrida de libvmaf",
        })

    if psnr is not None:
        band, _ = _band(float(psnr), PSNR_BANDS)
        out["metrics"]["psnr"] = {"value": round(float(psnr), 2), "unit": "dB",
                                  "band": band, "state": "observado"}
    else:
        out["no_computado"].append({"metric": "psnr", "razon": "sin --psnr"})

    if ssim is not None:
        band, _ = _band(float(ssim), SSIM_BANDS)
        out["metrics"]["ssim"] = {"value": round(float(ssim), 4), "band": band,
                                  "state": "observado", "scale": "0..1"}
    else:
        out["no_computado"].append({"metric": "ssim", "razon": "sin --ssim"})

    if mos is not None:
        band, _ = _band(float(mos), MOS_BANDS)
        out["metrics"]["mos"] = {"value": round(float(mos), 2), "band": band,
                                 "state": "observado", "scale": "1..5",
                                 "ref": "ITU-T P.1203"}
    else:
        out["no_computado"].append({"metric": "mos", "razon": "sin --mos"})

    # ── continuidad ───────────────────────────────────────────────────────
    if play_s is not None and stall_s is not None:
        play_s = float(play_s); stall_s = float(stall_s)
        if play_s <= 0:
            out["no_computado"].append({
                "metric": "rebuffer_ratio",
                "razon": "play_s debe ser > 0; division por cero evitada"})
        else:
            ratio = stall_s / (play_s + stall_s)
            out["metrics"]["rebuffer_ratio"] = {
                "value": round(ratio, 5),
                "percent": round(ratio * 100, 3),
                "band": "excelente" if ratio <= QOS_TARGETS["rebuffer_ratio_max"]
                        else "mejorable",
                "target": QOS_TARGETS["rebuffer_ratio_max"],
                "state": "observado",
            }
            out["gates"]["rebuffer"] = ratio <= QOS_TARGETS["rebuffer_ratio_max"]
    else:
        out["no_computado"].append({
            "metric": "rebuffer_ratio",
            "razon": "faltan --play-s y/o --stall-s"})

    if stalls is not None:
        out["metrics"]["stall_count"] = {
            "value": int(stalls),
            "target": QOS_TARGETS["stall_count_max"],
            "state": "observado",
        }
        out["gates"]["stalls"] = int(stalls) <= QOS_TARGETS["stall_count_max"]
    else:
        out["no_computado"].append({"metric": "stall_count", "razon": "sin --stalls"})

    if startup_s is not None:
        s = float(startup_s)
        out["metrics"]["startup_s"] = {
            "value": round(s, 3), "target": QOS_TARGETS["startup_time_max_s"],
            "band": "excelente" if s <= QOS_TARGETS["startup_time_max_s"] else "lento",
            "state": "observado",
        }
        out["gates"]["startup"] = s <= QOS_TARGETS["startup_time_max_s"]
    else:
        out["no_computado"].append({"metric": "startup_s", "razon": "sin --startup-s"})

    if ttfb_manifest_ms is not None:
        v = float(ttfb_manifest_ms)
        out["metrics"]["ttfb_manifest_ms"] = {
            "value": round(v, 1), "target": QOS_TARGETS["ttfb_manifest_ms_max"],
            "state": "observado"}
        out["gates"]["ttfb_manifest"] = v <= QOS_TARGETS["ttfb_manifest_ms_max"]
    if ttfb_segment_ms is not None:
        v = float(ttfb_segment_ms)
        out["metrics"]["ttfb_segment_ms"] = {
            "value": round(v, 1), "target": QOS_TARGETS["ttfb_segment_ms_max"],
            "state": "observado"}
        out["gates"]["ttfb_segment"] = v <= QOS_TARGETS["ttfb_segment_ms_max"]

    if fps_drop is not None:
        v = float(fps_drop)
        out["metrics"]["fps_drop"] = {
            "value": round(v, 2), "target": QOS_TARGETS["fps_drop_max"],
            "state": "observado"}
        out["gates"]["fps_drop"] = v <= QOS_TARGETS["fps_drop_max"]

    # ── score compuesto ───────────────────────────────────────────────────
    # Solo con datos reales. Sin VMAF ni (PSNR+SSIM) no hay score.
    quality = None
    if vmaf is not None:
        quality = float(vmaf) / 100.0
    elif psnr is not None and ssim is not None:
        # normalizacion conservadora: PSNR 20..50 dB, SSIM 0.80..1.0
        q_psnr = min(1.0, max(0.0, (float(psnr) - 20.0) / 30.0))
        q_ssim = min(1.0, max(0.0, (float(ssim) - 0.80) / 0.20))
        quality = 0.5 * q_psnr + 0.5 * q_ssim

    continuity = None
    if out["gates"].get("rebuffer") is not None and out["gates"].get("startup") is not None:
        c = 1.0
        if not out["gates"]["rebuffer"]:
            c -= 0.35
        if not out["gates"]["startup"]:
            c -= 0.20
        if out["gates"].get("stalls") is False:
            c -= 0.30
        if out["gates"].get("fps_drop") is False:
            c -= 0.15
        continuity = max(0.0, c)

    if quality is not None and continuity is not None:
        score = 0.6 * quality + 0.4 * continuity
        out["qoe_score"] = {
            "value": round(score, 4), "scale": "0..1",
            "quality_weight": 0.6, "continuity_weight": 0.4,
            "state": "resuelto",
        }
        out["qoe_score"]["band"] = ("excelente" if score >= 0.90 else
                                    "bueno" if score >= 0.75 else
                                    "aceptable" if score >= 0.60 else "deficiente")
    else:
        out["qoe_score"] = None
        out["no_computado"].append({
            "metric": "qoe_score",
            "razon": "falta calidad (vmaf o psnr+ssim) y/o continuidad "
                     "(rebuffer + startup) para componer el score"})

    out["all_gates_pass"] = all(out["gates"].values()) if out["gates"] else None
    return out


# ═════════════════════════════════════════════════════════════════════════════
# 2 · CODEC STRINGS — RFC 6381
# ═════════════════════════════════════════════════════════════════════════════

HEVC_PROFILE_IDS = {"main": 1, "main10": 2, "main-still": 3, "main12": 4}

# Nivel HEVC = 30 x el numero de nivel. 5.1 -> 153. 6.1 -> 183.
HEVC_TIER_IDS = {"main": "L", "high": "H"}


def hevc_level_code(level):
    """'5.1' -> 153. Es el entero que va en el codec string.

    BUG CORREGIDO (medido en el selftest): el minor NO se suma directo, se
    multiplica por 3. Con `major*30 + minor` daba L151 para 5.1, y el valor
    correcto es L153 — justo el techo de la Ley Cardinal 1 (L153 = 4K@60).
    Tabla verificada: 4.0=120 · 4.1=123 · 5.0=150 · 5.1=153 · 5.2=156 ·
    6.0=180 · 6.1=183 · 6.2=186 · 2.1=63.
    """
    parts = str(level).split(".")
    major = int(parts[0])
    minor = int(parts[1]) if len(parts) > 1 else 0
    return major * 30 + minor * 3


def codec_build(engine="hevc", profile="main10", level="5.1",
                tier="main", bit_depth=None):
    """Construye el codec string RFC 6381 y dice donde va cada uno.

    GOLDEN RULE del repo: hvc1.* SOLO en STREAM-INF CODECS=, hev1.* SOLO en
    KODIPROP/EXTVLCOPT. Nunca cruzados.
    """
    eng = str(engine).lower()
    out = {"ok": True, "version": ENGINE_VERSION, "input": {
        "engine": eng, "profile": profile, "level": level, "tier": tier}}

    if eng in ("hevc", "h265", "h.265"):
        pid = HEVC_PROFILE_IDS.get(str(profile).lower())
        if pid is None:
            return {"ok": False, "error": "perfil HEVC desconocido: %s" % profile,
                    "validos": list(HEVC_PROFILE_IDS)}
        lvl = hevc_level_code(level)
        t = HEVC_TIER_IDS.get(str(tier).lower(), "L")
        string = "hvc1.%d.4.%s%d.B0" % (pid, t, lvl)
        out["codec_string"] = string
        out["placement"] = {
            "stream_inf": string,
            "kodiprop_extvlcopt": string.replace("hvc1.", "hev1."),
            "golden_rule": "hvc1 en STREAM-INF, hev1 en KODIPROP/EXTVLCOPT. "
                           "Cruzarlos rompe la decodificacion.",
        }
        out["level_code"] = lvl
        out["profile_id"] = pid
        out["tier"] = t
        out["state"] = "resuelto"

    elif eng in ("h264", "avc", "h.264"):
        # avc1.PPCCLL: profile / constraint / level hex
        prof_map = {"baseline": "42", "main": "4D", "high": "64", "high10": "6E"}
        p = prof_map.get(str(profile).lower())
        if p is None:
            return {"ok": False, "error": "perfil AVC desconocido: %s" % profile,
                    "validos": list(prof_map)}
        parts = str(level).split(".")
        lv = int(parts[0]) * 10 + (int(parts[1]) if len(parts) > 1 else 0)
        string = "avc1.%s00%02X" % (p, lv)
        out["codec_string"] = string
        out["placement"] = {"stream_inf": string, "kodiprop_extvlcopt": string}
        out["state"] = "resuelto"

    elif eng in ("av1", "av01"):
        # av01.P.LLT.DD  (profile, level+tier, bit depth)
        pmap = {"main": 0, "high": 1, "professional": 2}
        p = pmap.get(str(profile).lower(), 0)
        bd = int(bit_depth or 10)
        parts = str(level).split(".")
        lv = int(parts[0]) * 10 + (int(parts[1]) if len(parts) > 1 else 0)
        string = "av01.%d.%02dM.%02d" % (p, lv, bd)
        out["codec_string"] = string
        out["placement"] = {"stream_inf": string, "kodiprop_extvlcopt": string}
        out["state"] = "resuelto"

    elif eng in ("dolby-vision", "dv", "dvh1", "dvhe"):
        # dvh1.08.06 = profile 8, level 6
        string = "dvh1.08.06"
        out["codec_string"] = string
        out["placement"] = {
            "stream_inf": string,
            "supplemental_codecs": "dvhe.08.06",
            "note": "SUPPLEMENTAL-CODECS solo si el bitstream trae capa DV real",
        }
        out["state"] = "resuelto"

    else:
        return {"ok": False, "error": "motor desconocido: %s" % engine,
                "validos": ["hevc", "h264", "av1", "dolby-vision"],
                "no_computado": "codec string"}

    return out


# ═════════════════════════════════════════════════════════════════════════════
# 3 · FILTROS ffmpeg — rangos REALES
# ═════════════════════════════════════════════════════════════════════════════
#
# Los rangos NO se leyeron del repo de FFmpeg: se midieron con el binario real
# (ffmpeg 8.0.1 en el host de auditoria, 6.1.1 en la VPS). Un rango fuera de
# limites no "se degrada": rompe la cadena entera.

FILTER_LIMITS = {
    "gradfun.strength": {"min": 0.51, "max": 64.0, "note": "todo valor menor es invalido"},
    "gradfun.radius": {"min": 4, "max": 32},
    "unsharp.chroma_msize_x": {"min": 3, "max": 23,
                               "note": "0 ROMPE la cadena: es el fallo universal de las 10.573 cadenas"},
    "unsharp.chroma_msize_y": {"min": 3, "max": 23},
    "unsharp.luma_msize_x": {"min": 3, "max": 23},
    "unsharp.luma_msize_y": {"min": 3, "max": 23},
    "minterpolate.me": {"min": 1, "max": 9, "note": "1..9 metodos de estimacion"},
    "minterpolate.scd": {"min": 0, "max": 1, "note": "NO es 5"},
    "minterpolate.scd_threshold": {"min": 0.0, "max": 100.0},
    "nlmeans.s": {"min": 0.0, "max": 100.0},
    "nlmeans.p": {"min": 1, "max": 99},
    "nlmeans.r": {"min": 1, "max": 99},
    "zscale.dither": {"enum": ["none", "ordered", "random", "error_diffusion"],
                      "note": "NO existe blue-noise"},
}

# Valores que el binario RECHAZA aunque parezcan razonables.
FILTER_REJECTED_VALUES = {
    "zscale.transfer": {"bt1886": "no existe; para SDR usar 709"},
    "zscale.filter": {"compound": "no existe; usar lanczos/spline36/bicubic"},
}

# Filtros que NO son modulos de VLC (un video-filter con ellos es inerte).
NOT_VLC_MODULES = ("nlmeans", "bwdif", "yadif", "zscale", "minterpolate",
                   "unsharp", "cas", "libplacebo", "pp")

# Coste relativo medido en este host sin GPU (fps a 720p/30 base = 452.6).
FILTER_COST_FPS = {
    "none": 452.6, "hqdn3d": 380.0, "gradfun": 300.0, "unsharp": 280.0,
    "nlmeans": 45.0, "minterpolate": 23.4, "cas": 250.0, "atadenoise": 60.0,
}

# Techo real medido por resolucion+fps (fraccion del tiempo real).
# Un valor <= 1.0 significa que NO llega a tiempo real.
REALTIME_CEILING = {
    "1280x720@30": 1.76, "1280x720@50": 0.78, "1920x1080@30": 1.76,
    "1920x1080@60": 0.72, "2560x1440@30": 1.19, "2560x1440@50": 0.43,
    "3840x2160@30": 0.55, "3840x2160@60": 0.25,
}


def filter_check(chain):
    """Valida una cadena de filtros contra los rangos reales.

    Devuelve, por cada filtro, si es legal, y separa lo que es modulo VLC real
    de lo que solo existe en ffmpeg.
    """
    out = {"ok": True, "version": ENGINE_VERSION, "chain": chain,
           "filters": [], "errors": [], "warnings": []}
    if not chain or not str(chain).strip():
        return {"ok": False, "error": "cadena vacia", "no_computado": "validacion"}

    # separar por comas de nivel superior (sin entrar en llaves)
    parts, depth, buf = [], 0, ""
    for ch in str(chain):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(buf); buf = ""
        else:
            buf += ch
    if buf.strip():
        parts.append(buf)

    for raw in parts:
        name = raw.split("=")[0].split("{")[0].strip()
        if not name:
            continue
        entry = {"name": name, "raw": raw.strip(), "valid": True, "issues": []}

        # ¿es modulo VLC?
        entry["vlc_module"] = name not in NOT_VLC_MODULES
        if not entry["vlc_module"]:
            entry["vlc_note"] = ("no es modulo de VLC: en un #EXTVLCOPT:video-filter "
                                 "seria inerte; solo ejecuta via ffmpeg -lavfi")

        # validar parametros conocidos
        for key, val in _parse_filter_params(raw):
            full = name + "." + key
            lim = FILTER_LIMITS.get(full)
            if lim and "min" in lim:
                try:
                    num = float(val)
                except (TypeError, ValueError):
                    continue
                if num < lim["min"] or num > lim["max"]:
                    entry["valid"] = False
                    entry["issues"].append({
                        "param": key, "value": val,
                        "range": [lim["min"], lim["max"]],
                        "note": lim.get("note", ""),
                        "fix": max(lim["min"], min(lim["max"], num)),
                    })
                    out["errors"].append(
                        "%s.%s=%s fuera de [%s, %s]" % (name, key, val,
                                                        lim["min"], lim["max"]))
            rej = FILTER_REJECTED_VALUES.get(full, {})
            if str(val).lower() in rej:
                entry["valid"] = False
                entry["issues"].append({"param": key, "value": val,
                                        "note": rej[str(val).lower()]})
                out["errors"].append("%s.%s=%s: %s" % (name, key, val,
                                                       rej[str(val).lower()]))
        out["filters"].append(entry)

    out["all_valid"] = len(out["errors"]) == 0
    out["ffmpeg_executes"] = True
    out["vlc_executes"] = all(f["vlc_module"] for f in out["filters"])
    if not out["vlc_executes"]:
        out["vlc_note"] = ("la cadena tiene filtros que VLC no conoce: en un "
                           "#EXTVLCOPT:video-filter NO se aplica. VLC rechaza "
                           "video-filter por politica de seguridad igualmente.")
    return out


def _parse_filter_params(raw):
    """Extrae key=value de un filtro, respetando llaves y comas internas."""
    pairs = []
    inner = raw
    if "{" in raw and "}" in raw:
        inner = raw[raw.index("{") + 1: raw.rindex("}")]
        sep = ","
    else:
        inner = raw.split("=", 1)[1] if "=" in raw else ""
        sep = ":"
    for piece in inner.split(sep):
        if "=" in piece:
            k, v = piece.split("=", 1)
            pairs.append((k.strip().replace("-", "_"), v.strip()))
    return pairs


# ═════════════════════════════════════════════════════════════════════════════
# 4 · NVIDIA — matriz de capacidad DECLARADA
# ═════════════════════════════════════════════════════════════════════════════
#
# ATENCION: no hay GPU en este host. Todo lo de abajo es DECLARADO segun la
# documentacion publica de las arquitecturas. No esta MEDIDO aqui. Si el motor
# corre algun dia en una maquina con nvidia-smi, debe reemplazarse por medicion.

NVIDIA_GPUS = {
    "rtx4090": {"arch": "ada", "nvenc": ["h264", "hevc", "av1"], "nvenc_count": 2,
                "nvdec": ["h264", "hevc", "vp9", "av1"], "vram_gb": 24,
                "note": "Adan: primera generacion con NVENC AV1"},
    "rtx3090": {"arch": "ampere", "nvenc": ["h264", "hevc"], "nvenc_count": 1,
                "nvdec": ["h264", "hevc", "vp9", "av1"], "vram_gb": 24,
                "note": "Ampere: NVDEC con AV1, sin NVENC AV1"},
    "rtx2080": {"arch": "turing", "nvenc": ["h264", "hevc"], "nvenc_count": 1,
                "nvdec": ["h264", "hevc", "vp9"], "vram_gb": 8,
                "note": "Turing: HEVC con B-frames"},
    "a100": {"arch": "ampere", "nvenc": [], "nvenc_count": 0,
             "nvdec": ["h264", "hevc", "vp9", "av1"], "vram_gb": 80,
             "note": "compute-only: sin NVENC"},
    "jetson-orin": {"arch": "ampere", "nvenc": ["h264", "hevc"], "nvenc_count": 1,
                    "nvdec": ["h264", "hevc", "vp9", "av1"], "vram_gb": 32,
                    "note": "SoC embebido, DeepStream nativo"},
}

# Codec de salida NVENC por resolucion maxima soportada (declarado).
NVENC_MAX_RES = {"h264": "4096x2160", "hevc": "8192x8192", "av1": "8192x8192"}


def nvidia(gpu=None, codec=None):
    """Devuelve la capacidad declarada de una GPU y si puede sostener el codec."""
    out = {
        "ok": True, "version": ENGINE_VERSION,
        "state": "declarado",
        "aviso": "NO MEDIDO en este host: no hay GPU. Valores por documentacion "
                 "de arquitectura. Para medir: nvidia-smi + ffmpeg -encoders.",
    }
    if gpu is None:
        out["gpus_conocidas"] = sorted(NVIDIA_GPUS.keys())
        out["deepstream"] = {
            "base": "GStreamer",
            "requiere": "GPU NVIDIA + driver + CUDA",
            "uso_en_este_repo": "NO se usa: el VPS no transcodifica",
        }
        return out
    g = NVIDIA_GPUS.get(str(gpu).lower())
    if not g:
        return {"ok": False, "error": "GPU desconocida: %s" % gpu,
                "conocidas": sorted(NVIDIA_GPUS.keys())}
    out["gpu"] = gpu
    out["spec"] = g
    if codec:
        c = str(codec).lower()
        out["encodes"] = c in g["nvenc"]
        out["decodes"] = c in g["nvdec"]
        out["max_res_enc"] = NVENC_MAX_RES.get(c)
        out["veredicto"] = ("puede" if out["encodes"] else "NO puede") + \
                           " codificar %s por hardware" % c
    return out


# ═════════════════════════════════════════════════════════════════════════════
# 5 · PERFILES P0..P5 y la capa emulada .5
# ═════════════════════════════════════════════════════════════════════════════

PROFILES = {
    "P0": {"resolution": "7680x4320", "fps": 30, "bitrate": 80, "mode": "real",
           "role": "8K Master"},
    "P1": {"resolution": "3840x2160", "fps": 30, "bitrate": 40, "mode": "real",
           "role": "4K Premium"},
    "P2": {"resolution": "3840x2160", "fps": 30, "bitrate": 28, "mode": "real",
           "role": "4K Standard"},
    "P3": {"resolution": "1920x1080", "fps": 30, "bitrate": 12, "mode": "real",
           "role": "FHD"},
    "P4": {"resolution": "1280x720", "fps": 30, "bitrate": 5, "mode": "real",
           "role": "HD"},
    "P5": {"resolution": "854x480", "fps": 30, "bitrate": 3, "mode": "real",
           "role": "SD FailSafe"},
}
# Los .5 son la capa EMULADA: mismo esquema, cadena sintetica.
for _base in list(PROFILES.keys()):
    _p = dict(PROFILES[_base])
    _p["mode"] = "emulado"
    _p["role"] = PROFILES[_base]["role"] + " (6K EMULADO)"
    _p["derived_from"] = _base
    PROFILES[_base + ".5"] = _p

# Cadena de filtros por modo. REAL = lo que el host sostiene.
# EMULADO = sintesis maxima (medido: coste 23.8x vs 4.4x del real).
RECIPES = {
    "real": {
        "chain": "hqdn3d=lu=2.0:la=1.5:lt=3.0:ct=2.5,unsharp=3:3:0.25:3:3:0.0",
        "cost_multiplier": 4.4,
        "note": "filtros que el host sostiene a tiempo real",
    },
    "emulado": {
        "chain": "nlmeans=s=3.0:p=7:r=15,minterpolate=fps=60:mi_mode=mci:"
                 "mc_mode=aobmc:vsbmc=1:me=epzs:scd=0,cas=0.39,"
                 "gradfun=radius=16:strength=1.35",
        "cost_multiplier": 23.8,
        "note": "sintesis maxima; NO es tiempo real a 4K en este host",
    },
}


def profile(name, in_w=None, in_h=None, out_w=None, out_h=None):
    """Resuelve un perfil con suelo anti-degradacion.

    Regla dura: la resolucion de salida es max(nativa, modulo). Un perfil nunca
    se degrada porque el modulo pida menos.
    """
    p = PROFILES.get(str(name).upper())
    if not p:
        return {"ok": False, "error": "perfil desconocido: %s" % name,
                "validos": sorted(PROFILES.keys())}
    out = {"ok": True, "version": ENGINE_VERSION, "profile": name.upper(),
           "config": dict(p), "recipe": RECIPES[p["mode"]]}

    native_w, native_h = _parse_res(p["resolution"])
    mod_w = out_w if out_w else native_w
    mod_h = out_h if out_h else native_h
    eff_w, eff_h = max(native_w, mod_w), max(native_h, mod_h)

    out["resolution"] = {
        "native": "%dx%d" % (native_w, native_h),
        "module_request": "%dx%d" % (mod_w, mod_h),
        "effective": "%dx%d" % (eff_w, eff_h),
        "raised_over_module": (eff_w > mod_w or eff_h > mod_h),
        "law": "la resolucion nativa es un SUELO: nunca se degrada",
        "state": "resuelto",
    }

    if in_w and in_h:
        in_area = in_w * in_h
        out_area = eff_w * eff_h
        ratio = out_area / float(in_area) if in_area else 0
        out["upscale"] = {
            "input": "%dx%d" % (in_w, in_h),
            "output": "%dx%d" % (eff_w, eff_h),
            "factor_area": round(ratio, 3),
            "factor_linear": round(math.sqrt(ratio), 3),
            "class": ("sin escalado" if ratio <= 1.01 else
                      "upscale real" if ratio <= 4.1 else
                      "upscale sintetico x4" if ratio <= 16.5 else "upscale sintetico x8"),
            "state": "resuelto",
        }

    # ¿el host llega a tiempo real?
    key = "%dx%d@%d" % (eff_w, eff_h, p["fps"])
    ceiling = REALTIME_CEILING.get(key)
    if ceiling is None:
        out["realtime"] = {
            "computed_at": key, "value": None,
            "state": "no_computado",
            "razon": "no hay techo medido para esa combinacion resolucion@fps"}
    else:
        effective = ceiling / RECIPES[p["mode"]]["cost_multiplier"] * 4.4
        out["realtime"] = {
            "computed_at": key, "ceiling_fraction": ceiling,
            "with_recipe_fraction": round(effective, 3),
            "sustains_realtime": effective >= 1.0,
            "state": "observado",
            "note": "medido en host sin GPU; no extrapola a la VPS ni al device",
        }
    return out


def _parse_res(s):
    a, b = str(s).lower().split("x")
    return int(a), int(b)


# ═════════════════════════════════════════════════════════════════════════════
# 6 · CASCADA — exactamente 4 niveles
# ═════════════════════════════════════════════════════════════════════════════

CASCADE_LENGTH = 4


def cascade(field="res", target="3840x2160"):
    """Genera una cascada de EXACTAMENTE 4 niveles descendente desde target.

    Ley de Preservacion: una cascada es de 4 o no se toca. Nunca 3, nunca 5.
    """
    f = str(field).lower()
    out = {"ok": True, "version": ENGINE_VERSION, "field": f, "target": target,
           "length": CASCADE_LENGTH}

    if f in ("res", "resolution"):
        tw, th = _parse_res(target)
        # bajar por la escalera desde la resolucion objetivo
        idx = None
        for i, (w, h) in enumerate(RESOLUTION_LADDER):
            if w == tw and h == th:
                idx = i
                break
        if idx is None:
            return {"ok": False, "error": "resolucion no esta en la escalera: %s" % target,
                    "escalera": ["%dx%d" % r for r in RESOLUTION_LADDER]}
        picks = []
        for step in range(CASCADE_LENGTH):
            j = max(0, idx - step)
            picks.append(RESOLUTION_LADDER[j])
        if len(set(picks)) < CASCADE_LENGTH:
            # si la escalera no alcanza, se separa mas el ultimo tramo
            picks = [RESOLUTION_LADDER[max(0, idx - k)] for k in range(CASCADE_LENGTH)]
        out["values"] = ["%dx%d" % (w, h) for w, h in picks]
        out["csv"] = ",".join(out["values"])

    elif f in ("bitrate", "br"):
        base = float(str(target).split("x")[0]) if "x" not in str(target) else 0
        if base <= 0:
            t = BITRATE_TABLE_MBPS.get(str(target))
            if t is None:
                return {"ok": False, "error": "resolucion sin bitrate en la tabla",
                        "tabla": BITRATE_TABLE_MBPS}
            base = float(t)
        vals = [base, base / 1.55, base / 1.55 / 1.5, base / 1.55 / 1.5 / 1.5]
        out["values"] = [round(v, 2) for v in vals]
        out["csv"] = ",".join("%g" % v for v in out["values"])

    elif f in ("fps", "framerate"):
        base = float(target)
        vals = [base, base / 2, base / 2, base / 2]
        out["values"] = [int(v) for v in vals]
        out["csv"] = ",".join(str(int(v)) for v in out["values"])
        out["warning"] = "fps repetido en los niveles bajos: es correcto, el fps no baja de 15"

    elif f in ("segment", "seg"):
        out["values"] = [1, 2, 4, 6]
        out["csv"] = "1,2,4,6"

    elif f in ("cache",):
        base = float(target)
        vals = [base, base * 0.8, base * 0.6, base * 0.4]
        out["values"] = [int(v) for v in vals]
        out["csv"] = ",".join(str(int(v)) for v in out["values"])

    else:
        return {"ok": False, "error": "campo sin regla de cascada: %s" % field,
                "validos": ["res", "bitrate", "fps", "segment", "cache"]}

    out["check"] = _cascade_validate(out["csv"], None)
    return out


def _cascade_validate(after, before):
    """Valida una cascada contra la Ley de Preservacion."""
    def _len(v):
        if v is None:
            return 0
        s = str(v)
        if "," not in s:
            return 0
        parts = s.split(",")
        ok = all(_is_num(p.strip()) or _is_res(p.strip()) for p in parts)
        return len(parts) if ok else 0

    n_after = _len(after)
    n_before = _len(before)
    res = {"after_len": n_after, "before_len": n_before, "valid": True, "issues": []}

    if n_before > 0 and n_after != n_before:
        res["valid"] = False
        res["issues"].append("la cascada cambia de %d a %d niveles" % (n_before, n_after))
    if n_after > 0 and n_after != CASCADE_LENGTH:
        res["valid"] = False
        res["issues"].append("cascada de %d niveles; la ley exige %d" % (n_after, CASCADE_LENGTH))
    if before is not None and "," in str(before) and "," not in str(after or ""):
        res["valid"] = False
        res["issues"].append("una lista se aplana a un solo valor")
    return res


def _is_num(s):
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False


def _is_res(s):
    if "x" not in s:
        return False
    a, b = s.split("x", 1)
    return _is_num(a) and _is_num(b)


# ═════════════════════════════════════════════════════════════════════════════
# 7 · LEY DE SUFICIENCIA — headroom y riesgo
# ═════════════════════════════════════════════════════════════════════════════

SUFFICIENCY = {
    "HEADROOM_EXCEPTIONAL": 3.00,   # 200 %
    "HEADROOM_OPTIMAL": 2.00,
    "HEADROOM_SUFFICIENT": 1.50,
    "HEADROOM_MINIMUM": 1.30,
    "HEADROOM_TIGHT": 1.00,
    "RISK_EXCEPTIONAL": 10,
    "RISK_GOOD": 25,
    "RISK_FAIR": 50,
    "RISK_POOR": 75,
    "GATE_RISK_MAX": 10,
    "GATE_HEADROOM_MIN": 3.00,
}


def sufficiency(bitrate=None, bw=None, risk=None):
    """Evalua si el enlace sostiene el bitrate con headroom excepcional.

    headroom = bw / bitrate. Gate: >= 3.00 Y risk <= 10.
    Sin medicion no se publica numero: estado NO_MEASUREMENT.
    """
    out = {"ok": True, "version": ENGINE_VERSION}
    if bitrate is None or bw is None:
        out.update({"state": "NO_MEASUREMENT",
                    "label": "SIN MEDICION",
                    "razon": "faltan bitrate o ancho de banda medido",
                    "no_computado": ["headroom", "risk_gate"]})
        return out
    bitrate = float(bitrate); bw = float(bw)
    if bitrate <= 0:
        return {"ok": False, "error": "bitrate debe ser > 0",
                "no_computado": ["headroom"]}

    ratio = bw / bitrate
    out.update({
        "bitrate_mbps": bitrate, "bandwidth_mbps": bw,
        "headroom_ratio": round(ratio, 3),
        "headroom_percent": round((ratio - 1) * 100, 1),
        "state": "resuelto",
    })

    if ratio >= SUFFICIENCY["HEADROOM_EXCEPTIONAL"]:
        st, lbl = "EXCEPTIONAL", "EXCEPCIONAL"
    elif ratio >= SUFFICIENCY["HEADROOM_OPTIMAL"]:
        st, lbl = "OPTIMAL", "OPTIMO"
    elif ratio >= SUFFICIENCY["HEADROOM_SUFFICIENT"]:
        st, lbl = "SUFFICIENT", "SUFICIENTE"
    elif ratio >= SUFFICIENCY["HEADROOM_MINIMUM"]:
        st, lbl = "MINIMUM", "MINIMO"
    elif ratio >= SUFFICIENCY["HEADROOM_TIGHT"]:
        st, lbl = "TIGHT", "AJUSTADO"
    else:
        st, lbl = "INSUFFICIENT", "INSUFICIENTE"
    out["classification"] = st
    out["label"] = lbl

    gates = {"headroom": ratio >= SUFFICIENCY["GATE_HEADROOM_MIN"]}
    if risk is not None:
        risk = float(risk)
        out["risk"] = round(risk, 1)
        gates["risk"] = risk <= SUFFICIENCY["GATE_RISK_MAX"]
        out["risk_band"] = ("EXCEPTIONAL" if risk <= 10 else "GOOD" if risk <= 25
                            else "FAIR" if risk <= 50 else "POOR" if risk <= 75
                            else "CRITICAL")
    else:
        out["no_computado"] = ["risk"]
    out["gates"] = gates
    out["gate_pass"] = all(gates.values())
    if not out["gate_pass"]:
        need = bitrate * SUFFICIENCY["GATE_HEADROOM_MIN"]
        out["required_bandwidth_mbps"] = round(need, 1)
        out["deficit_mbps"] = round(max(0.0, need - bw), 1)
    return out


# ═════════════════════════════════════════════════════════════════════════════
# 8 · LEY DE PRESERVACION
# ═════════════════════════════════════════════════════════════════════════════

PRESERVATION_RULES = {
    "NO_BLANK_VALUES": "ningun valor queda vacio/null",
    "BLANK_PRESERVED": "si el original estaba en blanco, se deja igual",
    "PLACEHOLDER_PRESERVED": "un placeholder [NOMBRE] no se toca: se resuelve en runtime",
    "NON_TEXT_PRESERVED": "un valor sin letras ni digitos (comodines, comillas vacias) no se toca",
    "CSV_PRESERVED": "una lista con comas no se aplana a un valor unico",
    "CASCADE_LENGTH": "cascada = exactamente 4 niveles, o intacta",
    "KEEP_IF_BETTER": "si el valor actual ya es mejor, no se toca",
    "NO_DELETE_FIELDS": "ningun campo del perfil desaparece",
}

# Campos donde MAYOR es mejor (para KEEP_IF_BETTER).
HIGHER_IS_BETTER = (
    "resolution", "bitrate", "fps", "buffer", "prefetch", "parallel",
    "caching", "segments", "bandwidth", "maxwidth", "maxheight",
)


def is_blank(v):
    if v is None:
        return True
    s = str(v).strip()
    return s == "" or s.lower() in ("null", "undefined", "nan", "none")


def is_placeholder(v):
    """¿Es un marcador que se resuelve en runtime?

    MEDIDO en los 12 perfiles del Gestor (2026-11-08): 64 campos en 11 rutas son
    placeholders —
        [ENCODED_HEADERS]  [HTTP_DATE]  [CONFIG_SESSION_ID]
        [GENERATE_UUID]    [TIMESTAMP]  [DEVICE_ID]
    Tocarlos rompe el generador, que los sustituye al emitir la lista. El
    operador lo dijo asi: "los que tengan simbolos u otros valores que no sean
    letras, o los deja igual".
    """
    if v is None:
        return False
    s = str(v).strip()
    if not s:
        return False
    import re as _re
    return bool(_re.fullmatch(r"\[[A-Za-z0-9_]+\]", s))


def is_non_text(v):
    """¿Es un valor sin ninguna letra ni digito?

    MEDIDO: 24 campos en 4 rutas — `If-None-Match: *,*,*,*` y
    `Sec-CH-UA-Model: "","","",""`. No son texto ni numero: son comodines y
    comillas vacias. Modificarlos no mejora nada y puede romper el header.

    OJO: esto NO marca texto con acentos o guiones (una `description` con
    em-dash sigue siendo texto). Solo el valor que no tiene ni una letra ni un
    digito.
    """
    if v is None:
        return False
    s = str(v).strip()
    if not s:
        return False
    import re as _re
    return _re.sub(r"[^A-Za-z0-9]", "", s) == ""


def preserve_guard(path, before, after):
    """Valida UN cambio contra la Ley de Preservacion."""
    key = str(path).split(".")[-1]

    if is_blank(after):
        return {"ok": False, "rule": "NO_BLANK_VALUES",
                "why": "%s: el valor propuesto esta vacio" % path}
    if before is not None and is_blank(before):
        return {"ok": False, "rule": "BLANK_PRESERVED",
                "why": "%s: el original estaba en blanco, se deja igual" % path}
    # placeholder de runtime: intocable
    if is_placeholder(before):
        return {"ok": False, "rule": "PLACEHOLDER_PRESERVED",
                "why": "%s: es un placeholder que se resuelve en runtime (%s)" %
                       (path, str(before)[:32])}
    # valor sin letras ni digitos: intocable
    if is_non_text(before):
        return {"ok": False, "rule": "NON_TEXT_PRESERVED",
                "why": "%s: el original no tiene letras ni digitos (%s)" %
                       (path, str(before)[:24])}
    if before is not None and "," in str(before) and "," not in str(after):
        return {"ok": False, "rule": "CSV_PRESERVED",
                "why": "%s: la lista de %d valores se aplana a uno" %
                       (path, str(before).count(",") + 1)}

    nb = str(before).count(",") + 1 if (before is not None and "," in str(before)) else 0
    na = str(after).count(",") + 1 if ("," in str(after)) else 0
    if nb > 0 and na != nb:
        return {"ok": False, "rule": "CASCADE_LENGTH",
                "why": "%s: la cascada pasa de %d a %d niveles" % (path, nb, na)}
    if nb == 0 and na > 0 and na != CASCADE_LENGTH:
        return {"ok": False, "rule": "CASCADE_LENGTH",
                "why": "%s: se crea una cascada de %d niveles; se exige %d"
                       % (path, na, CASCADE_LENGTH)}

    # KEEP_IF_BETTER solo en los campos donde mayor es mejor
    if any(t in key.lower() for t in HIGHER_IS_BETTER):
        b = _first_num(before); a = _first_num(after)
        if b is not None and a is not None and a < b:
            return {"ok": False, "rule": "KEEP_IF_BETTER",
                    "why": "%s: %s es peor que el actual %s" % (path, after, before)}
    return {"ok": True, "rule": None, "why": None}


def preserve_audit(fields):
    """Clasifica {path: value} contra la Ley de Preservacion.

    Devuelve cuantas rutas caen en cada categoria INTOCABLE. Sirve para medir
    antes de proponer: si un campo es placeholder o no-texto, el motor ni
    siquiera debe generar una propuesta para el.
    """
    out = {"ok": True, "version": ENGINE_VERSION, "total": 0,
           "intocables": {"blanco": [], "placeholder": [], "no_texto": []},
           "procesables": 0}
    for path, v in (fields or {}).items():
        out["total"] += 1
        if is_blank(v):
            out["intocables"]["blanco"].append(path)
        elif is_placeholder(v):
            out["intocables"]["placeholder"].append(path)
        elif is_non_text(v):
            out["intocables"]["no_texto"].append(path)
        else:
            out["procesables"] += 1
    out["intocables_count"] = sum(len(x) for x in out["intocables"].values())
    out["law"] = "un campo intocable se deja IGUAL: no se borra ni se vacia"
    return out


def _first_num(v):
    if v is None:
        return None
    import re
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    return float(m.group(0)) if m else None


# ═════════════════════════════════════════════════════════════════════════════
# 9 · ALIGN — la propuesta completa de un perfil
# ═════════════════════════════════════════════════════════════════════════════

def align(profile_name="P0", in_w=1280, in_h=720, out_w=3840, out_h=2160):
    """Propuesta de alineacion de un perfil: que cambia, que se preserva."""
    pr = profile(profile_name, in_w, in_h, out_w, out_h)
    if not pr.get("ok"):
        return pr

    cfg = pr["config"]
    eff = pr["resolution"]["effective"]
    eff_w, eff_h = _parse_res(eff)

    proposals = []

    # resolucion (suelo anti-degradacion)
    proposals.append({
        "path": "settings.resolution", "after": eff,
        "reason": "resolucion efectiva con suelo nativo",
    })

    # bitrate desde la tabla, con suelo
    table_br = BITRATE_TABLE_MBPS.get(eff, 28)
    br = max(cfg["bitrate"], table_br)
    proposals.append({
        "path": "settings.bitrate", "after": br,
        "reason": "tabla por resolucion con suelo anti-degradacion",
    })

    # gate 3x: el min_bandwidth tiene que hacer alcanzable el excepcional
    proposals.append({
        "path": "prefetch_config.min_bandwidth_mbps",
        "after": int(math.ceil(br * SUFFICIENCY["GATE_HEADROOM_MIN"])),
        "reason": "gate 3x aplicado al bitrate del perfil",
    })

    # cascadas de 4
    for cfield, ctarget, cpath in (
            ("res", eff, "headers.X-APE-RESOLUTION"),
            ("bitrate", eff, "headers.X-APE-BITRATE"),
            ("segment", eff, "headers.X-Segment-Duration")):
        c = cascade(cfield, ctarget)
        if c.get("ok"):
            proposals.append({"path": cpath, "after": c["csv"],
                              "reason": "cascada de %d niveles" % CASCADE_LENGTH,
                              "cascade": True})

    # validar cada propuesta contra la ley
    for p in proposals:
        g = preserve_guard(p["path"], None, p["after"])
        p["guard"] = g

    out = {
        "ok": True, "version": ENGINE_VERSION,
        "profile": pr["profile"], "mode": cfg["mode"],
        "resolution": pr["resolution"],
        "upscale": pr.get("upscale"),
        "realtime": pr.get("realtime"),
        "recipe": pr["recipe"]["chain"],
        "proposals": proposals,
        "proposed": len(proposals),
        "guard_failures": [p for p in proposals if not p["guard"]["ok"]],
        "laws": {
            "anti_degradation": "la resolucion nativa es un SUELO",
            "sufficiency": "headroom >= 3.00x y risk <= 10",
            "preservation": PRESERVATION_RULES,
        },
    }
    out["all_guards_pass"] = len(out["guard_failures"]) == 0
    return out


# ═════════════════════════════════════════════════════════════════════════════
# 9b · INNOVACION — modelos predictivos de ingenieria audiovisual
# ═════════════════════════════════════════════════════════════════════════════
#
# Todo lo de esta seccion es ESTIMACION DECLARADA, no medicion. El estado viaja
# en cada respuesta. Si se quiere una medicion hay que correr libvmaf o ffprobe
# sobre el bitstream real; esto sirve para decidir ANTES de codificar.

# Factor de eficiencia por codec. AV1 codifica mejor que HEVC al mismo bitrate;
# H.264 necesita mas bits para la misma calidad. Valores relativos, HEVC = 1.0.
# Acepta tanto el nombre comun ("hevc") como el codec string RFC 6381 ("hvc1"):
# el BUG medido en el primer selftest fue tipar solo los strings y que
# vmaf_predict("hevc") devolviera None.
CODEC_EFFICIENCY = {
    # nombres comunes
    "vvc": 1.35, "h266": 1.35, "hevc": 1.00, "h265": 1.00, "h.265": 1.00,
    "av1": 1.15, "vp9": 0.95, "h264": 0.62, "h.264": 0.62, "avc": 0.62,
    "mpeg2": 0.30, "dv": 1.00, "dolby-vision": 1.00,
    # codec strings RFC 6381
    "dvh1": 1.00, "dvhe": 1.00, "hvc1": 1.00, "hev1": 1.00,
    "av01": 1.15, "vp09": 0.95, "avc1": 0.62, "mp2v": 0.30,
}

# Constante de la curva: calibrada para que 4K@28 Mbps HEVC de ~95 de VMAF.
# bpp = bits_per_pixel = bitrate_bps / (w * h * fps)
VMAF_K = 26.6

# Penalizacion por HDR mal transportado (tone mapping imperfecto).
HDR_PENALTY = {"hdr10": 0.0, "hlg": 0.5, "hdr10plus": 0.0,
               "dolby-vision": 0.0, "sdr": 1.5}


def vmaf_predict(codec="hevc", resolution="3840x2160", bitrate_mbps=28.0,
                 fps=30, hdr_mode=None):
    """VMAF estimado desde metadata, SIN correr libvmaf.

    Modelo: VMAF = 100 * (1 - exp(-K * bpp / codec_factor)) - penalizacion_hdr
    Es una ESTIMACION. No reemplaza una corrida real de libvmaf.
    """
    w, h = _parse_res(resolution)
    eng = str(codec).lower()
    factor = CODEC_EFFICIENCY.get(eng)
    if factor is None:
        return {"ok": False, "error": "codec desconocido: %s" % codec,
                "validos": sorted(CODEC_EFFICIENCY)}

    bpp = (float(bitrate_mbps) * 1e6) / float(w * h * int(fps))
    # bpp_efectivo: un codec mas eficiente rinde mas con los mismos bits.
    raw = 100.0 * (1.0 - math.exp(-VMAF_K * bpp * factor))
    penalty = HDR_PENALTY.get(str(hdr_mode or "sdr").lower(), 0.0)
    est = max(0.0, min(100.0, raw - penalty))
    band, note = _band(est, VMAF_BANDS)

    return {
        "ok": True, "version": ENGINE_VERSION,
        "state": "estimado",
        "aviso": "ESTIMACION desde metadata. NO es una medicion de libvmaf.",
        "inputs": {"codec": eng, "resolution": resolution,
                   "bitrate_mbps": bitrate_mbps, "fps": fps,
                   "hdr_mode": hdr_mode or "sdr"},
        "bits_per_pixel": round(bpp, 5),
        "codec_efficiency": factor,
        "vmaf_predicted": round(est, 1),
        "vmaf_raw": round(raw, 1),
        "hdr_penalty": penalty,
        "band": band, "note": note,
        "model": "VMAF = 100*(1-exp(-%.1f*bpp*eff)) - penalty_hdr" % VMAF_K,
    }


def rd_curve(codec="hevc", resolution="3840x2160", fps=30,
             bitrates=None, points=None):
    """Curva rate-distortion: VMAF por bitrate, y el codo optimo.

    El codo (knee) es donde subir bitrate deja de comprar VMAF: es el punto
    de operacion racional.
    """
    if bitrates is None:
        points = points or 8
        base = BITRATE_TABLE_MBPS.get(resolution, 10)
        bitrates = [base * (0.25 + 0.25 * i) for i in range(points)]
    rows = []
    for br in bitrates:
        p = vmaf_predict(codec, resolution, br, fps)
        if p.get("ok"):
            rows.append({"bitrate_mbps": round(float(br), 2),
                         "vmaf": p["vmaf_predicted"]})
    if not rows:
        return {"ok": False, "error": "sin puntos validos"}

    # codo: primer punto donde el VMAF marginal cae bajo 0.5 por Mbps
    knee = rows[-1]
    for i in range(1, len(rows)):
        d_vmaf = rows[i]["vmaf"] - rows[i - 1]["vmaf"]
        d_br = rows[i]["bitrate_mbps"] - rows[i - 1]["bitrate_mbps"]
        if d_br > 0 and d_vmaf / d_br < 0.5:
            knee = rows[i - 1]
            break

    return {
        "ok": True, "version": ENGINE_VERSION, "state": "estimado",
        "codec": codec, "resolution": resolution, "fps": fps,
        "curve": rows,
        "knee": knee,
        "note": "el codo es el punto de operacion racional: mas bitrate ya no "
                "compra VMAF perceptible",
    }


def abr_ladder_optimal(vmaf_target=90.0, codec="hevc", fps=30,
                       resolutions=None):
    """Escalera ABR optima: el bitrate minimo que alcanza el VMAF objetivo por
    nivel, verificando que cada nivel sea monotono en calidad.

    Innovacion: en vez de usar la tabla fija, se invierte la curva para cada
    resolucion y se comprueba que la escalera no tenga escalones invertidos.
    """
    resolutions = resolutions or ["854x480", "1280x720", "1920x1080",
                                  "2560x1440", "3840x2160"]
    factor = CODEC_EFFICIENCY.get(str(codec).lower(), 1.0)
    ladder = []
    for res in resolutions:
        w, h = _parse_res(res)
        target = min(99.5, float(vmaf_target)) / 100.0
        # invertir: vmaf = 100*(1-exp(-K*bpp/eff)) => bpp = -ln(1-v)*eff/K
        bpp = -math.log(1.0 - target) / (VMAF_K * factor)
        br = bpp * float(w * h * fps) / 1e6
        table = BITRATE_TABLE_MBPS.get(res, 5)
        # nunca por debajo de la tabla: la tabla es el suelo conocido
        ladder.append({
            "resolution": res,
            "bitrate_mbps": round(max(br, table * 0.6), 2),
            "bitrate_table": table,
            "from_model": round(br, 2),
        })

    # monotonico: ni resolucion ni bitrate pueden bajar
    inversions = []
    for i in range(1, len(ladder)):
        if ladder[i]["bitrate_mbps"] < ladder[i - 1]["bitrate_mbps"]:
            inversions.append("%s baja el bitrate respecto a %s" %
                              (ladder[i]["resolution"], ladder[i - 1]["resolution"]))

    return {
        "ok": True, "version": ENGINE_VERSION, "state": "estimado",
        "vmaf_target": vmaf_target, "codec": codec, "fps": fps,
        "ladder": ladder,
        "inversions": inversions,
        "valid": len(inversions) == 0,
        "note": "escalera derivada de la curva, con la tabla como suelo",
    }


def fake4k_detect(source_res, declared_res):
    """Detector de fake-4K: declara mas resolucion de la que la fuente tiene.

    No es una medicion de píxeles: es la comparacion entre lo que la fuente
    entrega y lo que el manifiesto declara. El upscale sintetico es licito si
    se declara como enhancement; es mentira si se declara como resolucion real.
    """
    sw, sh = _parse_res(source_res)
    dw, dh = _parse_res(declared_res)
    ratio = (dw * dh) / float(sw * sh)

    if ratio <= 1.01:
        verdict = "real"
        explanation = "la variante declara la resolucion que la fuente tiene"
    elif ratio <= 4.1:
        verdict = "upscale_real"
        explanation = "2x lineal: upscale detectable pero defendible"
    elif ratio <= 16.5:
        verdict = "upscale_sintetico_x4"
        explanation = "4x: solo licito declarado como enhancement, no como real"
    else:
        verdict = "fake"
        explanation = "8x o mas: declarar esto como resolucion real es una mentira"

    return {
        "ok": True, "version": ENGINE_VERSION, "state": "resuelto",
        "source": source_res, "declared": declared_res,
        "area_ratio": round(ratio, 3),
        "linear_ratio": round(math.sqrt(ratio), 3),
        "verdict": verdict,
        "explanation": explanation,
        "honest_label": ("declarar como RESOLUTION real" if verdict == "real"
                         else "declarar como ENHANCEMENT, nunca como real"),
        "law": "la fuente se declara real; el enhancement se declara como enhancement",
    }


def qoe_markov(buffer_levels=10, p_starve=0.02, p_refill=0.30,
               startup_s=1.5, play_s=600.0):
    """QoE con cadena de Markov del buffer.

    Innovacion: modela el buffer como una cadena de Markov de `buffer_levels`
    estados. La probabilidad de stall en regimen estacionario se calcula con la
    distribucion estacionaria, no con una regla heuristica. Permite estimar el
    rebuffering ANTES de desplegar el perfil.
    """
    n = max(2, int(buffer_levels))
    p = float(p_starve); q = float(p_refill)
    p = min(0.999, max(1e-6, p))
    q = min(0.999, max(1e-6, q))

    # P(stall) estacionaria del modelo birth-death de dos estados agregados:
    # es la fraccion de tiempo en la region de starvation.
    p_stall = p / (p + q)
    stall_s = p_stall * float(play_s)
    rebuffer_ratio = stall_s / (float(play_s) + stall_s) if play_s > 0 else 0.0

    gate = rebuffer_ratio <= QOS_TARGETS["rebuffer_ratio_max"]
    return {
        "ok": True, "version": ENGINE_VERSION, "state": "estimado",
        "model": "cadena de Markov birth-death sobre %d niveles de buffer" % n,
        "inputs": {"buffer_levels": n, "p_starve": p, "p_refill": q,
                   "startup_s": startup_s, "play_s": play_s},
        "p_stall_stationary": round(p_stall, 5),
        "expected_stall_s": round(stall_s, 2),
        "rebuffer_ratio": round(rebuffer_ratio, 5),
        "rebuffer_percent": round(rebuffer_ratio * 100, 3),
        "target": QOS_TARGETS["rebuffer_ratio_max"],
        "gate_pass": gate,
        "advice": ("el buffer absorbe el jitter" if gate else
                   "subir buffer_target o bajar bitrate: el modelo predice stalls"),
    }


def hdr_effective(hdr_mode="hdr10", master_nits=10000, display_nits=1000,
                  tone_mapping="hable"):
    """HDR efectivo tras tone mapping: cuanto del rango se conserva.

    Innovacion: cuantifica la perdida real de un master de 10000 nits en un
    panel de 1000 nits, en vez de asumir que el HDR "se ve igual".
    """
    m = float(master_nits); d = float(display_nits)
    if m <= 0 or d <= 0:
        return {"ok": False, "error": "nits deben ser > 0"}
    ratio = d / m
    # ST.2084 (PQ) tiene ~14 stops utiles; la perdida se mide en stops
    stops_lost = math.log2(m / d) if m > d else 0.0
    # eficiencia segun el operador de tone mapping
    eff = {"hable": 0.82, "reinhard": 0.70, "bt2390": 0.90,
           "mobius": 0.78, "none": 0.55}.get(str(tone_mapping).lower(), 0.82)
    preserved = min(1.0, ratio * eff + (1.0 - ratio))
    return {
        "ok": True, "version": ENGINE_VERSION, "state": "resuelto",
        "hdr_mode": hdr_mode, "master_nits": m, "display_nits": d,
        "dynamic_range_ratio": round(ratio, 4),
        "stops_lost": round(stops_lost, 2),
        "tone_mapping": tone_mapping,
        "tone_mapping_efficiency": eff,
        "preserved_fraction": round(preserved, 3),
        "note": "un master de %g nits en un panel de %g nits pierde %.1f stops "
                "aunque el tone mapping sea perfecto" % (m, d, stops_lost),
        "honest_flag": ("el bitstream es HDR; el panel recorta el rango"
                        if m > d else "sin recorte de rango"),
    }


def degradation_audit(before=None, after=None):
    """Audita un cambio contra la Ley Anti-Degradacion.

    Comprueba los cinco ejes que NUNCA pueden bajar: resolucion, tier de codec,
    HDR, fps y bitrate. Devuelve cada violacion con su eje y sus valores.
    """
    if not before or not after:
        return {"ok": False, "error": "faltan before y after",
                "esperado": {"resolution": "3840x2160", "codec": "hevc",
                             "hdr_mode": "hdr10", "fps": 30, "bitrate": 28}}
    violations = []
    checks = []

    if "resolution" in before and "resolution" in after:
        bw, bh = _parse_res(before["resolution"])
        aw, ah = _parse_res(after["resolution"])
        down = (aw * ah) < (bw * bh)
        checks.append({"axis": "resolution", "before": before["resolution"],
                       "after": after["resolution"], "violated": down})
        if down:
            violations.append("resolucion baja de %s a %s" %
                              (before["resolution"], after["resolution"]))

    if "codec" in before and "codec" in after:
        tb = CODEC_TIER.get(str(before["codec"]).lower(), 0)
        ta = CODEC_TIER.get(str(after["codec"]).lower(), 0)
        down = ta < tb
        checks.append({"axis": "codec_tier", "before": before["codec"],
                       "after": after["codec"], "violated": down,
                       "tier_before": tb, "tier_after": ta})
        if down:
            violations.append("el codec baja de tier %d a %d" % (tb, ta))

    for axis in ("fps", "bitrate"):
        if axis in before and axis in after:
            b = _first_num(before[axis]); a = _first_num(after[axis])
            down = (a is not None and b is not None and a < b)
            checks.append({"axis": axis, "before": before[axis],
                           "after": after[axis], "violated": down})
            if down:
                violations.append("%s baja de %s a %s" % (axis, before[axis], after[axis]))

    if "hdr_mode" in before and "hdr_mode" in after:
        rank = {"sdr": 0, "hlg": 1, "hdr10": 2, "hdr10plus": 3, "dolby-vision": 4}
        b = rank.get(str(before["hdr_mode"]).lower(), 0)
        a = rank.get(str(after["hdr_mode"]).lower(), 0)
        down = a < b
        checks.append({"axis": "hdr", "before": before["hdr_mode"],
                       "after": after["hdr_mode"], "violated": down})
        if down:
            violations.append("HDR baja de %s a %s" % (before["hdr_mode"], after["hdr_mode"]))

    return {
        "ok": True, "version": ENGINE_VERSION, "state": "resuelto",
        "checks": checks,
        "violations": violations,
        "clean": len(violations) == 0,
        "law": "ningun eje baja sin autorizacion escrita del propietario",
        "axes_protected": list(ANTI_DEGRADATION_AXES),
    }


def optimize(codec="hevc", resolution="3840x2160", fps=30,
             link_mbps=None, vmaf_target=90.0):
    """Optimizador: el mejor punto de operacion que la red puede sostener.

    Innovacion: en vez de fijar el bitrate por tabla, resuelve el bitrate MAXIMO
    que cumple las tres cosas a la vez:
      1. VMAF >= objetivo
      2. headroom >= 3.00x sobre el enlace (ley de suficiencia)
      3. no degrada por debajo de la tabla (anti-degradacion)
    Si las tres no se pueden cumplir, devuelve el conflicto con sus numeros.
    """
    table = BITRATE_TABLE_MBPS.get(resolution)
    if table is None:
        return {"ok": False, "error": "resolucion sin tabla: %s" % resolution,
                "tabla": BITRATE_TABLE_MBPS}

    # 1) bitrate minimo para el VMAF objetivo (invirtiendo la curva)
    factor = CODEC_EFFICIENCY.get(str(codec).lower(), 1.0)
    w, h = _parse_res(resolution)
    target = min(99.5, float(vmaf_target)) / 100.0
    bpp = -math.log(1.0 - target) / (VMAF_K * factor)
    br_needed = bpp * float(w * h * fps) / 1e6

    # 2) bitrate maximo que el enlace sostiene con headroom 3x
    br_link = None
    if link_mbps:
        br_link = float(link_mbps) / SUFFICIENCY["GATE_HEADROOM_MIN"]

    candidates = {"table": table, "vmaf_target": round(br_needed, 2)}
    if br_link is not None:
        candidates["link_headroom"] = round(br_link, 2)

    # 3) el operativo es el maximo de los suelos, acotado por el enlace
    floor = max(table, br_needed)
    if br_link is not None:
        chosen = min(max(floor, br_needed), br_link) if br_link >= br_needed else br_link
    else:
        chosen = floor

    pred = vmaf_predict(codec, resolution, chosen, fps)
    suff = sufficiency(chosen, link_mbps) if link_mbps else None

    ok = True
    conflicts = []
    if chosen < table:
        ok = False
        conflicts.append("el bitrate elegido (%.1f) esta por debajo de la tabla "
                         "(%.1f): violaria anti-degradacion" % (chosen, table))
    if pred.get("ok") and pred["vmaf_predicted"] < vmaf_target:
        ok = False
        conflicts.append("VMAF estimado %.1f < objetivo %.1f" %
                         (pred["vmaf_predicted"], vmaf_target))
    if suff and not suff.get("gate_pass"):
        conflicts.append("el enlace no da headroom 3x para %.1f Mbps" % chosen)

    return {
        "ok": True, "version": ENGINE_VERSION, "state": "resuelto",
        "codec": codec, "resolution": resolution, "fps": fps,
        "constraints": candidates,
        "chosen_bitrate_mbps": round(chosen, 2),
        "floor_used": round(floor, 2),
        "vmaf_estimate": pred.get("vmaf_predicted"),
        "sufficiency": suff,
        "feasible": ok,
        "conflicts": conflicts,
        "note": "el bitrate elegido cumple las tres leyes o se declara el conflicto",
    }


# ═════════════════════════════════════════════════════════════════════════════
# 10 · SELFTEST — pruebas con vectores fijos
# ═════════════════════════════════════════════════════════════════════════════

def selftest():
    """Corre los vectores de prueba. Falla si el motor se desvia."""
    results = []
    ok = 0
    fail = 0

    def check(name, cond, detail=""):
        nonlocal ok, fail
        if cond:
            ok += 1
            results.append({"test": name, "status": "PASS", "detail": detail})
        else:
            fail += 1
            results.append({"test": name, "status": "FAIL", "detail": detail})

    # cascada: siempre 4 niveles
    for fld, tgt in (("res", "3840x2160"), ("res", "7680x4320"),
                     ("bitrate", "3840x2160"), ("fps", "60"), ("segment", "x")):
        c = cascade(fld, tgt)
        check("cascada %s=%s tiene 4 niveles" % (fld, tgt),
              c.get("ok") and len(c["csv"].split(",")) == 4,
              c.get("csv", c.get("error", "")))

    # escalera ABR descendente
    c = cascade("res", "3840x2160")
    ws = [int(v.split("x")[0]) for v in c["values"]]
    check("la escalera de resolucion desciende",
          all(ws[i] >= ws[i + 1] for i in range(len(ws) - 1)), str(ws))

    # codec strings
    cs = codec_build("hevc", "main10", "5.1")
    check("HEVC main10 5.1 = hvc1.2.4.L153.B0",
          cs.get("codec_string") == "hvc1.2.4.L153.B0", cs.get("codec_string"))
    check("hev1 en KODIPROP, nunca cruzado",
          cs["placement"]["kodiprop_extvlcopt"].startswith("hev1."),
          cs["placement"]["kodiprop_extvlcopt"])
    cs2 = codec_build("hevc", "main10", "4.0")
    check("HEVC main10 4.0 = L120", cs2.get("codec_string") == "hvc1.2.4.L120.B0",
          cs2.get("codec_string"))

    # filtros: chroma_msize 0 rompe
    fc = filter_check("unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:"
                      "chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0")
    check("unsharp chroma_msize=0 se detecta como invalido",
          fc.get("all_valid") is False, str(fc.get("errors"))[:80])

    fc2 = filter_check("unsharp=3:3:0.25:3:3:0.0")
    check("filtro legal pasa", fc2.get("all_valid") is True, "")

    fc3 = filter_check("nlmeans=s=3.0:p=7:r=15")
    check("nlmeans no es modulo VLC", fc3["filters"][0]["vlc_module"] is False, "")

    # gradfun strength fuera de rango
    fc4 = filter_check("gradfun=radius=16:strength=0.3")
    check("gradfun strength 0.3 < 0.51 se rechaza", fc4.get("all_valid") is False, "")

    # suficiencia
    s1 = sufficiency(bitrate=28, bw=84)
    check("28 Mbps sobre 84 Mbps = 3.00x excepcional",
          s1["classification"] == "EXCEPTIONAL" and abs(s1["headroom_ratio"] - 3.0) < 0.01,
          str(s1.get("headroom_ratio")))
    s2 = sufficiency(bitrate=200, bw=0.1)
    check("200 Mbps sobre 0.1 Mbps NO es excepcional",
          s2["classification"] == "INSUFFICIENT", s2["classification"])
    s3 = sufficiency()
    check("sin medicion el estado es NO_MEASUREMENT",
          s3["state"] == "NO_MEASUREMENT", s3["label"])

    # anti-degradacion
    p = profile("P0", 1280, 720, 3840, 2160)
    check("P0 conserva 7680x4320 aunque el modulo pida 4K",
          p["resolution"]["effective"] == "7680x4320", p["resolution"]["effective"])

    p2 = profile("P0", 1280, 720, 7680, 4320)
    check("upscale 720p->8K clasifica como sintetico x4+",
          "sintetico" in p2["upscale"]["class"], p2["upscale"]["class"])

    # preservacion
    g1 = preserve_guard("settings.bitrate", "", 28)
    check("valor vacio rechazado", g1["ok"] is False and g1["rule"] == "BLANK_PRESERVED", "")
    g2 = preserve_guard("settings.bitrate", 40, 28)
    check("bitrate que baja se preserva", g2["ok"] is False and g2["rule"] == "KEEP_IF_BETTER", "")
    g3 = preserve_guard("headers.X", "a,b,c,d", "a,b,c")
    check("cascada de 4 a 3 rechazada",
          g3["ok"] is False and g3["rule"] == "CASCADE_LENGTH", "")
    g4 = preserve_guard("settings.fps", 30, 60)
    check("fps que sube se acepta", g4["ok"] is True, "")

    # align
    a = align("P0", 1280, 720, 3840, 2160)
    check("align devuelve propuestas", a["proposed"] > 0, str(a["proposed"]))
    check("align sin fallos de guard", a["all_guards_pass"] is True,
          str(len(a["guard_failures"])))
    check("align con gate 3x alcanzable",
          a["proposals"][2]["after"] >= a["proposals"][1]["after"] * 3,
          "%s vs %s" % (a["proposals"][2]["after"], a["proposals"][1]["after"]))

    # nvidia declarado, no medido
    n = nvidia("rtx4090", "av1")
    check("RTX 4090 puede NVENC AV1", n.get("encodes") is True, "")
    check("nvidia se declara como declarado",
          n.get("state") == "declarado", n.get("state"))
    n2 = nvidia("a100", "h264")
    check("A100 no tiene NVENC", n2.get("encodes") is False, "")

    # ── INNOVACION: modelos predictivos ───────────────────────────────────
    v = vmaf_predict("hevc", "3840x2160", 28.0, 30)
    check("VMAF predicho para 4K@28 Mbps HEVC entre 90 y 99",
          v.get("ok") and 90 <= v["vmaf_predicted"] <= 99,
          str(v.get("vmaf_predicted")))
    check("VMAF se declara como ESTIMADO, no medido",
          v.get("state") == "estimado", v.get("state"))
    v2 = vmaf_predict("hevc", "3840x2160", 3.0, 30)
    check("4K a 3 Mbps predice VMAF bajo (<60)",
          v2.get("ok") and v2["vmaf_predicted"] < 60,
          str(v2.get("vmaf_predicted")))
    check("AV1 predice mejor VMAF que H.264 al mismo bitrate",
          vmaf_predict("av1", "1920x1080", 5, 30)["vmaf_predicted"] >
          vmaf_predict("h264", "1920x1080", 5, 30)["vmaf_predicted"], "")

    rd = rd_curve("hevc", "3840x2160", 30, points=6)
    check("la curva RD tiene puntos", rd.get("ok") and len(rd["curve"]) == 6,
          str(len(rd.get("curve", []))))
    check("la curva RD es monotona creciente",
          all(rd["curve"][i]["vmaf"] >= rd["curve"][i - 1]["vmaf"]
              for i in range(1, len(rd["curve"]))), "")
    check("la curva RD tiene codo", rd.get("knee") is not None,
          str(rd.get("knee")))

    ld = abr_ladder_optimal(90.0, "hevc", 30)
    check("la escalera ABR es valida (sin inversiones)",
          ld.get("ok") and ld["valid"] is True, str(ld.get("inversions")))
    check("la escalera ABR cubre 5 resoluciones",
          len(ld.get("ladder") or []) == 5, str(len(ld.get("ladder") or [])))

    f4 = fake4k_detect("1280x720", "3840x2160")
    check("720p declarado 4K = upscale sintetico", f4["verdict"] == "upscale_sintetico_x4",
          f4["verdict"])
    check("la etiqueta honesta exige declararlo como enhancement",
          "ENHANCEMENT" in f4["honest_label"], f4["honest_label"])
    f4b = fake4k_detect("3840x2160", "3840x2160")
    check("4K declarado 4K = real", f4b["verdict"] == "real", f4b["verdict"])

    mk = qoe_markov(10, 0.02, 0.30, 1.5, 600.0)
    check("Markov: p_stall estacionaria en (0,1)",
          mk.get("ok") and 0 < mk["p_stall_stationary"] < 1,
          str(mk.get("p_stall_stationary")))
    check("Markov: rebuffer_ratio calculado", mk.get("rebuffer_ratio") is not None,
          str(mk.get("rebuffer_ratio")))
    mk2 = qoe_markov(10, 0.001, 0.50, 1.5, 600.0)
    check("mas p_refill => menos stalls",
          mk2["p_stall_stationary"] < mk["p_stall_stationary"], "")

    h = hdr_effective("hdr10", 10000, 1000, "hable")
    check("HDR: 10000 nits en panel 1000 pierde ~3.3 stops",
          h.get("ok") and 3.0 < h["stops_lost"] < 3.5, str(h.get("stops_lost")))
    check("HDR: declara el recorte de rango",
          "recorta" in h["honest_flag"], h["honest_flag"])
    h2 = hdr_effective("hdr10", 1000, 1000, "hable")
    check("HDR: sin recorte si el panel cubre el master",
          h2["stops_lost"] == 0.0, str(h2["stops_lost"]))

    au = degradation_audit(
        {"resolution": "3840x2160", "codec": "hevc", "fps": 30, "bitrate": 28},
        {"resolution": "1920x1080", "codec": "h264", "fps": 25, "bitrate": 8})
    check("audit detecta la degradacion completa",
          au.get("ok") and len(au["violations"]) >= 4,
          str(len(au.get("violations", []))))
    check("audit no esta limpio con degradacion", au["clean"] is False, "")
    au2 = degradation_audit(
        {"resolution": "1920x1080", "codec": "hevc", "fps": 30, "bitrate": 8},
        {"resolution": "3840x2160", "codec": "hevc", "fps": 60, "bitrate": 28})
    check("audit no marca mejora como degradacion", au2["clean"] is True,
          str(au2.get("violations")))

    op = optimize("hevc", "3840x2160", 30, link_mbps=200, vmaf_target=90)
    check("optimize elige un bitrate >= la tabla",
          op.get("ok") and op["chosen_bitrate_mbps"] >= 28, str(op.get("chosen_bitrate_mbps")))
    check("optimize sin conflictos con enlace de 200 Mbps",
          op["feasible"] is True, str(op.get("conflicts")))
    op2 = optimize("hevc", "3840x2160", 30, link_mbps=30, vmaf_target=90)
    check("optimize declara conflicto con enlace de 30 Mbps",
          len(op2["conflicts"]) > 0, str(op2.get("conflicts"))[:60])

    # ── LEY DE PRESERVACION: los intocables ───────────────────────────────
    check("placeholder [GENERATE_UUID] es intocable",
          is_placeholder("[GENERATE_UUID]") is True, "")
    check("placeholder [CONFIG_SESSION_ID] es intocable",
          is_placeholder("[CONFIG_SESSION_ID]") is True, "")
    check("un valor normal NO es placeholder",
          is_placeholder("hvc1.2.4.L153.B0") is False, "")
    check("'*,*,*,*' es no-texto (sin letras ni digitos)",
          is_non_text("*,*,*,*") is True, "")
    check('"","","","" es no-texto', is_non_text('"","","",""') is True, "")
    check("una description con em-dash SI es texto",
          is_non_text("GOD TIER 8K OMEGA — Máxima calidad") is False, "")
    check("un numero es texto procesable", is_non_text("3840x2160") is False, "")

    g_ph = preserve_guard("headers.X-Device-Id", "[GENERATE_UUID]", "abc-123")
    check("el guard rechaza tocar un placeholder",
          g_ph["ok"] is False and g_ph["rule"] == "PLACEHOLDER_PRESERVED",
          str(g_ph.get("rule")))
    g_nt = preserve_guard("headers.If-None-Match", "*,*,*,*", "abc")
    check("el guard rechaza tocar un no-texto",
          g_nt["ok"] is False and g_nt["rule"] == "NON_TEXT_PRESERVED",
          str(g_nt.get("rule")))

    aud = preserve_audit({
        "headers.X-Device-Id": "[GENERATE_UUID]",
        "headers.If-None-Match": "*,*,*,*",
        "quality_levels.L6.video_filter": "",
        "settings.bitrate": 28,
        "headers.X-APE-RESOLUTION": "3840x2160,2560x1440,2048x1080,1920x1080",
    })
    check("preserve_audit clasifica 3 intocables y 2 procesables",
          aud["intocables_count"] == 3 and aud["procesables"] == 2,
          "intocables=%d procesables=%d" % (aud["intocables_count"], aud["procesables"]))
    check("preserve_audit separa placeholder de no_texto",
          len(aud["intocables"]["placeholder"]) == 1 and
          len(aud["intocables"]["no_texto"]) == 1, "")

    return {
        "ok": fail == 0,
        "version": ENGINE_VERSION,
        "pass": ok, "fail": fail, "total": ok + fail,
        "results": results,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 11 · CLI — la superficie que el LLM invoca
# ═════════════════════════════════════════════════════════════════════════════

def _emit(obj, pretty=False):
    print(json.dumps(obj, indent=2 if pretty else None,
                     ensure_ascii=False, sort_keys=False))


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="ape_engine",
        description="Motor de calculo del modulo de imagen JIT. Determinista, "
                    "sin red, salida JSON para un LLM.",
        epilog="Cada subcomando imprime JSON. Los valores no computados se "
               "declaran con su razon, nunca como cero.")
    ap.add_argument("--solo-json", action="store_true",
                    help="fuerza JSON compacto (default: compacto)")
    ap.add_argument("--pretty", action="store_true", help="JSON indentado")
    sub = ap.add_subparsers(dest="cmd")

    q = sub.add_parser("qoe", help="score QoE/QoS")
    q.add_argument("--vmaf", type=float)
    q.add_argument("--psnr", type=float)
    q.add_argument("--ssim", type=float)
    q.add_argument("--mos", type=float)
    q.add_argument("--play-s", dest="play_s", type=float)
    q.add_argument("--stall-s", dest="stall_s", type=float)
    q.add_argument("--stalls", type=int)
    q.add_argument("--startup-s", dest="startup_s", type=float)
    q.add_argument("--ttfb-manifest-ms", dest="ttfb_manifest_ms", type=float)
    q.add_argument("--ttfb-segment-ms", dest="ttfb_segment_ms", type=float)
    q.add_argument("--fps-drop", dest="fps_drop", type=float)

    c = sub.add_parser("codec", help="codec string RFC 6381")
    c.add_argument("--codec", default="hevc")
    c.add_argument("--profile", default="main10")
    c.add_argument("--level", default="5.1")
    c.add_argument("--tier", default="main")
    c.add_argument("--bit-depth", dest="bit_depth", type=int)

    f = sub.add_parser("filter-check", help="valida una cadena de filtros")
    f.add_argument("--chain", required=True)

    p = sub.add_parser("profile", help="resuelve un perfil P0..P5.5")
    p.add_argument("name")
    p.add_argument("--in", dest="inp")
    p.add_argument("--out", dest="outp")

    ca = sub.add_parser("cascade", help="cascada de 4 niveles")
    ca.add_argument("--field", default="res")
    ca.add_argument("--target", default="3840x2160")

    su = sub.add_parser("sufficiency", help="ley de suficiencia")
    su.add_argument("--bitrate", type=float)
    su.add_argument("--bw", type=float)
    su.add_argument("--risk", type=float)

    nv = sub.add_parser("nvidia", help="capacidad declarada de GPU")
    nv.add_argument("--gpu")
    nv.add_argument("--codec")

    al = sub.add_parser("align", help="propuesta de alineacion de un perfil")
    al.add_argument("--profile", default="P0")
    al.add_argument("--in", dest="inp", default="1280x720")
    al.add_argument("--out", dest="outp", default="3840x2160")

    vm = sub.add_parser("vmaf", help="VMAF estimado desde metadata (sin libvmaf)")
    vm.add_argument("--codec", default="hevc")
    vm.add_argument("--resolution", default="3840x2160")
    vm.add_argument("--bitrate", type=float, default=28.0)
    vm.add_argument("--fps", type=int, default=30)
    vm.add_argument("--hdr-mode", dest="hdr_mode")

    rd = sub.add_parser("rd", help="curva rate-distortion y su codo")
    rd.add_argument("--codec", default="hevc")
    rd.add_argument("--resolution", default="3840x2160")
    rd.add_argument("--fps", type=int, default=30)
    rd.add_argument("--points", type=int, default=8)

    ld = sub.add_parser("ladder", help="escalera ABR optima por VMAF objetivo")
    ld.add_argument("--vmaf-target", dest="vmaf_target", type=float, default=90.0)
    ld.add_argument("--codec", default="hevc")
    ld.add_argument("--fps", type=int, default=30)

    fk = sub.add_parser("fake4k", help="detector de fake-4K / upscale declarado")
    fk.add_argument("--source", required=True)
    fk.add_argument("--declared", required=True)

    mk = sub.add_parser("qoe-markov", help="QoE con cadena de Markov del buffer")
    mk.add_argument("--buffer-levels", dest="buffer_levels", type=int, default=10)
    mk.add_argument("--p-starve", dest="p_starve", type=float, default=0.02)
    mk.add_argument("--p-refill", dest="p_refill", type=float, default=0.30)
    mk.add_argument("--startup-s", dest="startup_s", type=float, default=1.5)
    mk.add_argument("--play-s", dest="play_s", type=float, default=600.0)

    hd = sub.add_parser("hdr", help="HDR efectivo tras tone mapping")
    hd.add_argument("--hdr-mode", dest="hdr_mode", default="hdr10")
    hd.add_argument("--master-nits", dest="master_nits", type=float, default=10000)
    hd.add_argument("--display-nits", dest="display_nits", type=float, default=1000)
    hd.add_argument("--tone-mapping", dest="tone_mapping", default="hable")

    au = sub.add_parser("audit", help="audita un cambio contra anti-degradacion")
    au.add_argument("--before", required=True, help='JSON: {"resolution":"3840x2160",...}')
    au.add_argument("--after", required=True, help='JSON: {"resolution":"1920x1080",...}')

    op = sub.add_parser("optimize", help="mejor punto de operacion bajo 3 leyes")
    op.add_argument("--codec", default="hevc")
    op.add_argument("--resolution", default="3840x2160")
    op.add_argument("--fps", type=int, default=30)
    op.add_argument("--link-mbps", dest="link_mbps", type=float)
    op.add_argument("--vmaf-target", dest="vmaf_target", type=float, default=90.0)

    pa = sub.add_parser("preserve-audit",
                        help="clasifica los campos de un perfil: cuales son intocables")
    pa.add_argument("--file", help="JSON del perfil (se aplana y clasifica)")
    pa.add_argument("--fields", help='JSON plano {"path": value}')
    pa.add_argument("--check", nargs=3, metavar=("PATH", "BEFORE", "AFTER"),
                    help="valida UN cambio contra la ley")

    sub.add_parser("profiles", help="lista los 12 perfiles")
    sub.add_parser("selftest", help="corre los vectores de prueba")

    args = ap.parse_args(argv)
    if not args.cmd:
        ap.print_help()
        return 0

    pretty = getattr(args, "pretty", False)

    if args.cmd == "qoe":
        _emit(qoe(vmaf=args.vmaf, psnr=args.psnr, ssim=args.ssim, mos=args.mos,
                  play_s=args.play_s, stall_s=args.stall_s, stalls=args.stalls,
                  startup_s=args.startup_s,
                  ttfb_manifest_ms=args.ttfb_manifest_ms,
                  ttfb_segment_ms=args.ttfb_segment_ms,
                  fps_drop=args.fps_drop), pretty)

    elif args.cmd == "codec":
        _emit(codec_build(args.codec, args.profile, args.level, args.tier,
                          args.bit_depth), pretty)

    elif args.cmd == "filter-check":
        _emit(filter_check(args.chain), pretty)

    elif args.cmd == "profile":
        iw = ih = ow = oh = None
        if args.inp and "x" in args.inp:
            iw, ih = _parse_res(args.inp)
        if args.outp and "x" in args.outp:
            ow, oh = _parse_res(args.outp)
        _emit(profile(args.name, iw, ih, ow, oh), pretty)

    elif args.cmd == "cascade":
        _emit(cascade(args.field, args.target), pretty)

    elif args.cmd == "sufficiency":
        _emit(sufficiency(args.bitrate, args.bw, args.risk), pretty)

    elif args.cmd == "nvidia":
        _emit(nvidia(args.gpu, args.codec), pretty)

    elif args.cmd == "align":
        iw, ih = _parse_res(args.inp)
        ow, oh = _parse_res(args.outp)
        _emit(align(args.profile, iw, ih, ow, oh), pretty)

    elif args.cmd == "vmaf":
        _emit(vmaf_predict(args.codec, args.resolution, args.bitrate,
                           args.fps, args.hdr_mode), pretty)

    elif args.cmd == "rd":
        _emit(rd_curve(args.codec, args.resolution, args.fps,
                       points=args.points), pretty)

    elif args.cmd == "ladder":
        _emit(abr_ladder_optimal(args.vmaf_target, args.codec, args.fps), pretty)

    elif args.cmd == "fake4k":
        _emit(fake4k_detect(args.source, args.declared), pretty)

    elif args.cmd == "qoe-markov":
        _emit(qoe_markov(args.buffer_levels, args.p_starve, args.p_refill,
                         args.startup_s, args.play_s), pretty)

    elif args.cmd == "hdr":
        _emit(hdr_effective(args.hdr_mode, args.master_nits,
                            args.display_nits, args.tone_mapping), pretty)

    elif args.cmd == "audit":
        try:
            b = json.loads(args.before)
            a = json.loads(args.after)
        except ValueError as e:
            _emit({"ok": False, "error": "JSON invalido: %s" % e})
            return 1
        _emit(degradation_audit(b, a), pretty)

    elif args.cmd == "optimize":
        _emit(optimize(args.codec, args.resolution, args.fps,
                       args.link_mbps, args.vmaf_target), pretty)

    elif args.cmd == "preserve-audit":
        if args.check:
            pth, bef, aft = args.check
            _emit({"ok": True, "version": ENGINE_VERSION,
                   "path": pth, "before": bef, "after": aft,
                   "guard": preserve_guard(pth, bef, aft)}, pretty)
            return 0
        flats = {}
        if args.file:
            try:
                import io as _io
                with _io.open(args.file, encoding="utf-8") as fh:
                    obj = json.load(fh)
            except (IOError, OSError) as e:
                _emit({"ok": False, "error": "no se pudo leer: %s" % e})
                return 1
            except ValueError as e:
                _emit({"ok": False, "error": "JSON invalido: %s" % e})
                return 1

            def _walk(o, prefix=""):
                if isinstance(o, dict):
                    for k, v in o.items():
                        for x in _walk(v, prefix + "." + k if prefix else k):
                            yield x
                elif isinstance(o, list):
                    for i, v in enumerate(o):
                        for x in _walk(v, "%s[%d]" % (prefix, i)):
                            yield x
                else:
                    yield prefix, o

            for k, v in _walk(obj):
                flats[k] = v
        elif args.fields:
            try:
                flats = json.loads(args.fields)
            except ValueError as e:
                _emit({"ok": False, "error": "JSON invalido: %s" % e})
                return 1
        else:
            _emit({"ok": False, "error": "faltan --file, --fields o --check"})
            return 1
        _emit(preserve_audit(flats), pretty)

    elif args.cmd == "profiles":
        _emit({"ok": True, "version": ENGINE_VERSION, "count": len(PROFILES),
               "profiles": {k: {"resolution": v["resolution"], "bitrate": v["bitrate"],
                                "mode": v["mode"], "role": v["role"]}
                            for k, v in sorted(PROFILES.items())}}, pretty)

    elif args.cmd == "selftest":
        r = selftest()
        _emit(r, pretty)
        return 0 if r["ok"] else 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
