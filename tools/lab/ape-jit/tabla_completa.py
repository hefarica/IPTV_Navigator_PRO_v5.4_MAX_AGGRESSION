#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tabla COMPLETA de reglas: resolucion, fps, codec, modo, encoder, filtros y empaquetado."""
import json
import subprocess
import sys

B = "https://iptv-ape.duckdns.org"
W = 124
D = "=" * W


def get(path, t=25):
    o = subprocess.run(["curl", "-s", "--max-time", str(t), B + path], capture_output=True, text=True)
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta: " + path)
    return json.loads(o.stdout)


def main():
    d = get("/jit/image/rules")
    rows = d["rules"]
    print()
    print("  " + "#" * (W - 4))
    print("  #  TABLA DE REGLAS COMPLETA — todos los campos del panel")
    print("  " + "#" * (W - 4))
    print()

    # ── BLOQUE 1: resolucion, fps, codec, modo ──
    print("  " + D)
    print("   1. RESOLUCION Y CODEC")
    print("  " + D)
    print("   %-18s %-9s %-6s %-10s %-6s %-6s %-9s %-16s %-8s" % (
        "REGLA", "ENTRADA", "fps", "SALIDA", "fps", "CODEC", "RECETA", "DITHER", "MODO"))
    print("   " + "-" * (W - 6))
    for r in rows:
        print("   %-18s %-9s %-6s %-10s %-6s %-6s %-9s %-16s %-8s" % (
            r["id"][:18], r["input"], r.get("inFps") or "-",
            "%dx%d" % (r["outW"], r["outH"]), r.get("outFps") or "same",
            r["codec"], r["recipe"], r.get("dither") or "-",
            (r.get("mode") or "real").upper()))
    print()

    # ── BLOQUE 2: encoder ──
    print("  " + D)
    print("   2. ENCODER (por regla, editable)")
    print("  " + D)
    print("   %-18s %-12s %-5s %-10s %-8s" % ("REGLA", "PRESET x265", "CRF", "AUDIO", "THREADS"))
    print("   " + "-" * 60)
    for r in rows:
        print("   %-18s %-12s %-5s %-10s %-8s" % (
            r["id"][:18], r.get("preset"), r.get("crf"), r.get("audio"), r.get("x265_threads")))
    print()

    # ── BLOQUE 3: filtros ──
    print("  " + D)
    print("   3. FILTROS VIVOS (por regla) — los 6 parametros de la imagen")
    print("  " + D)
    print("   %-18s %-7s %-7s %-7s %-7s %-7s %-6s %-5s" % (
        "REGLA", "hq_ls", "hq_cs", "hq_lt", "hq_ct", "us_amt", "us_msz", "at_s"))
    print("   " + "-" * 76)
    for r in rows:
        h = r.get("hqdn3d") or {}
        u = r.get("unsharp") or {}
        a = r.get("atadenoise") or {}
        print("   %-18s %-7s %-7s %-7s %-7s %-7s %-6s %-5s" % (
            r["id"][:18], h.get("luma_spatial"), h.get("chroma_spatial"),
            h.get("luma_tmp"), h.get("chroma_tmp"),
            u.get("luma_amount"), u.get("luma_msize"), a.get("s")))
    print()

    # ── BLOQUE 4: empaquetado ──
    print("  " + D)
    print("   4. EMPAQUETADO (por regla) — afecta al arranque del player")
    print("  " + D)
    print("   %-18s %-8s %-8s %-8s %-8s" % ("REGLA", "SEG(s)", "WINDOW", "EXTRA", "GOP(s)"))
    print("   " + "-" * 56)
    for r in rows:
        print("   %-18s %-8s %-8s %-8s %-8s" % (
            r["id"][:18], r.get("seg_duration"), r.get("window_size"),
            r.get("extra_window_size"), r.get("gop_seconds")))
    print()

    # ── RESUMEN ──
    real = sum(1 for r in rows if (r.get("mode") or "real") == "real")
    emul = len(rows) - real
    print("  " + D)
    print("   %d reglas  ·  REAL: %d  ·  EMULADO: %d  ·  bandas: %s" % (
        d["count"], real, emul, ", ".join(d["byInput"].keys())))
    print("  " + D)
    print()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)
