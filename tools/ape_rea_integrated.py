#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Integración real de los módulos APE REA v1.2 con el ejecutor FFmpeg.

Los módulos se usan para lo que sí aportan: hash de ingesta (M01), perfil/tier
(M05), mapeo de opciones (M08), plan de módulos (M16) y evidencia
requested/resolved/applied (M15). M09/M10 describen la capa de planificación de
imagen; el procesamiento de píxeles y el recibo APPLIED_MEASURED los produce
`tools/ape_rea_executor.py` con FFmpeg. No se llama a M16.execute() como prueba
de éxito: su resultado no es un artefacto.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULES = Path(__file__).resolve().parent / "ape_rea_v1.2"
if str(MODULES) not in sys.path:
    sys.path.insert(0, str(MODULES))

from M01_Ingesta import M01Ingesta
from M05_Perfiles_P1_P3_P4 import M05Perfiles
from M08_Adaptadores import M08Adaptadores
from M15_Evidencia import M15Evidencia
from M16_Orquestador import OrquestadorSupremo


def main() -> int:
    parser = argparse.ArgumentParser(description="APE REA v1.2 + FFmpeg real")
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--duration", type=float, default=1.5)
    parser.add_argument("--profile", default="P3", choices=["P1", "P3", "P4"])
    parser.add_argument("--tier", default="T2", choices=["T0", "T1.5", "T2"])
    parser.add_argument("--codec", default="h264", choices=["h264", "hevc"])
    args = parser.parse_args()
    source = Path(args.source).resolve()
    out = Path(args.out).resolve()
    if out.exists():
        print(f"[FAIL] output ya existe: {out}", file=sys.stderr)
        return 1

    m01 = M01Ingesta()
    m05 = M05Perfiles()
    m08 = M08Adaptadores()
    m15 = M15Evidencia()
    orchestrator = OrquestadorSupremo()
    requested = {"source": str(source), "profile": args.profile, "tier": args.tier,
                 "codec": args.codec, "duration": args.duration}
    try:
        if not source.is_file():
            raise RuntimeError("source no existe")
        if not m05.validate(args.profile, args.tier):
            raise RuntimeError("perfil/tier no válido")
        ingest = m01.apply(str(source))
        profile = m05.apply(args.profile, args.tier)
        adapter = m08.apply(["ffmpeg-hw", "network-caching", "unknown-option"])
        # M09/M10: capa de planificación; no se usan para declarar píxeles.
        plan = {
            "modules": orchestrator.modules,
            "image_plan": ["M09 hqdn3d/yadif/unsharp (plan)", "M10 supersampling (plan)"],
            "pixel_engine": "tools/ape_rea_executor.py",
            "executed": False,
        }
        resolved = {"ingest": ingest, "profile": profile, "adapter": adapter, "plan": plan}
        # Ejecuta el verdadero motor de píxeles.
        cmd = [sys.executable, str(ROOT / "tools" / "ape_rea_executor.py"),
               "--source", str(source), "--out", str(out),
               "--duration", str(args.duration), "--codec", args.codec]
        proc = subprocess.run(cmd, text=True, capture_output=True)
        if proc.returncode != 0:
            receipt = {"result": "FAIL", "requested": requested, "resolved": resolved,
                       "applied": {"status": "NOT_APPLIED", "exit": proc.returncode,
                                   "stderr": proc.stderr[-4000:]}}
            out.mkdir(parents=True, exist_ok=True)
            (out / "integrated-receipt.json").write_text(
                json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(receipt, ensure_ascii=False), file=sys.stderr)
            return proc.returncode
        executor_receipt = json.loads((out / "receipt.json").read_text(encoding="utf-8"))
        applied = {
            "status": executor_receipt["applied"]["status"],
            "engine": executor_receipt["applied"]["engine"],
            "engine_sha256": executor_receipt["applied"]["engine_sha256"],
            "output": executor_receipt["output"],
            "source": executor_receipt["source"],
            "pixel_engine": "tools/ape_rea_executor.py",
            "executed": True,
        }
        m15.apply("M01->M05->M08->FFmpeg->M15", requested, resolved, applied)
        receipt = {
            "schema": "ape.rea.integrated.receipt.v1",
            "product": "APE_REA_V12_INTEGRATED",
            "version": "1.0.0",
            "requested": requested,
            "resolved": resolved,
            "applied": applied,
            "evidence": m15.receipts,
            "result": "PASS",
        }
        (out / "integrated-receipt.json").write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "receipt": str(out / "integrated-receipt.json"),
                          "output": applied["output"]}, ensure_ascii=False))
        return 0
    except Exception as exc:
        receipt = {"schema": "ape.rea.integrated.receipt.v1", "result": "FAIL",
                   "requested": requested, "error": str(exc),
                   "applied": {"status": "NOT_APPLIED"}}
        try:
            out.mkdir(parents=True, exist_ok=True)
            (out / "integrated-receipt.json").write_text(
                json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception:
            pass
        print(json.dumps(receipt, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
