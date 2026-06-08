#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
APE — Python Visual Lab Engine (laboratorio de análisis/scoring/calibración).

REGLA MADRE: NO reprocesa video, NO descarga segmentos, NO reencodea, NO altera
el stream, NO inventa HDR/4K. Analiza SOLO metadata/telemetría/manifests/logs
livianos y produce scores + riesgos + perfil recomendado + reglas para el motor
Rust (producción determinista). stdlib-only (json, sys).

Uso:
    echo '{"telemetry_json":{...},"capabilities_json":{...},
           "m3u8_analysis_json":{...},"qoe_history_json":{...}}' \
        | python3 visual_lab_engine.py
"""
import json
import sys


def _clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


def analyze(payload):
    tel = payload.get("telemetry_json", {}) or {}
    cap = payload.get("capabilities_json", {}) or {}
    mv = payload.get("m3u8_analysis_json", {}) or {}
    qoe = payload.get("qoe_history_json", {}) or {}

    codec = str(tel.get("codec_video", "unknown")).lower()
    hw = bool(tel.get("hardware_decode", False))
    buf = str(tel.get("buffer_state", "unknown")).lower()
    dropped = int(tel.get("dropped_frames", 0) or 0)
    judder = bool(tel.get("judder", False))
    has_4k = bool(mv.get("has_4k", False))
    has_hevc = bool(mv.get("has_hevc", False))
    has_hdr = bool(mv.get("has_hdr", False))
    net = str(qoe.get("network_score", qoe.get("score", "unknown"))).lower()
    sr = bool(cap.get("super_resolution_available", False))
    tv_h = _height(cap.get("tv_resolution_max", "0"))

    # ── Scores perceptuales esperados (0-100) ──
    clarity = 40
    if has_4k:
        clarity += 30
    if codec in ("hevc", "av1"):
        clarity += 15
    if sr or tv_h >= 2160:
        clarity += 10
    if not hw:
        clarity -= 20
    clarity = _clamp(clarity)

    color = 50 + (20 if has_hdr else 0) + (10 if codec in ("hevc", "av1") else 0)
    color = _clamp(color)

    motion = 60
    if judder:
        motion -= 35
    if dropped > 30:
        motion -= 25
    motion = _clamp(motion)

    # ── Riesgos ──
    blur_risk = "high" if (not hw or clarity < 45) else ("medium" if clarity < 70 else "low")
    judder_risk = "high" if judder else ("medium" if dropped > 30 else "low")
    rebuffer_risk = "high" if buf in ("rebuffer", "low") or net == "low" else (
        "medium" if net == "medium" else "low")
    artifact_risk = "high" if (has_4k and not hw) else ("medium" if clarity > 85 else "low")

    visual_score = _clamp(int(0.45 * clarity + 0.30 * motion + 0.25 * color))

    # ── Perfil recomendado (alineado a las reglas del motor Rust) ──
    if codec == "unknown" or mv.get("status") == "FAILED" or not tel.get("foreground_package"):
        rec = "TRUTHFUL_SOURCE_SAFE"
    elif net == "low":
        rec = "LOW_LATENCY_SAFE"
    elif dropped > 30 or (codec == "hevc" and not hw) or buf in ("rebuffer", "low"):
        rec = "STABLE_1080P_PREMIUM"
    elif has_4k and hw and buf == "ok" and dropped == 0 and not judder and net == "high" and tv_h >= 2160:
        rec = "CRYSTAL_UHD_EXTREME"
    elif codec in ("hevc", "av1") and hw:
        rec = "CRYSTAL_UHD_SAFE"
    elif sr or tv_h >= 2160:
        rec = "PERCEPTUAL_4K_BALANCED"
    else:
        rec = "TRUTHFUL_SOURCE_SAFE"

    # ── Reglas para alimentar/recalibrar el motor Rust (no auto-aplicadas) ──
    rule_updates = []
    if judder_risk == "high":
        rule_updates.append({"rule": "memc_policy", "value": "avoid_due_to_judder",
                             "reason": "judder_risk alto"})
    if blur_risk == "high":
        rule_updates.append({"rule": "sharpness_policy", "value": "adaptive_safe",
                             "reason": "blur_risk alto: preservar textura, no over-denoise"})
    if rebuffer_risk == "high":
        rule_updates.append({"rule": "anti_rebuffer_policy", "value": "aggressive",
                             "reason": "rebuffer_risk alto"})
    if has_4k and not hw:
        rule_updates.append({"rule": "no_fake_4k", "value": True,
                             "reason": "4K en fuente pero sin HW decode → no forzar"})

    return {
        "visual_score": visual_score,
        "clarity_score": clarity,
        "color_score": color,
        "motion_score": motion,
        "artifact_risk": artifact_risk,
        "blur_risk": blur_risk,
        "judder_risk": judder_risk,
        "rebuffer_risk": rebuffer_risk,
        "recommended_profile": rec,
        "rule_updates": rule_updates,
        "reason": "lab heuristic: clarity=%d motion=%d color=%d -> %s" % (clarity, motion, color, rec),
        "_doc": "OBSERVE/CALIBRATION ONLY. Production = deterministic Rust engine. No video reprocessing.",
    }


def _height(res):
    s = str(res)
    if "x" in s:
        s = s.split("x")[-1]
    s = s.replace("p", "").strip()
    try:
        return int(s)
    except ValueError:
        return 0


def main():
    # Salida portable: stdout UTF-8 (Linux VPS) + JSON ASCII-safe (Windows cp1252).
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except Exception:
        payload = {}
    print(json.dumps(analyze(payload), ensure_ascii=True))


if __name__ == "__main__":
    main()
