#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compara la funcion objetivo en REAL y EMULADO. Todos los campos, uno a uno."""
import json
import subprocess
import sys

B = "https://iptv-ape.duckdns.org"


def opt(iw, ih, ifps, ow, oh, player, mode):
    url = "%s/jit/image/optimize?inW=%d&inH=%d&inFps=%d&outW=%d&outH=%d&player=%s&mode=%s" % (
        B, iw, ih, ifps, ow, oh, player, mode)
    o = subprocess.run(["curl", "-s", "--max-time", "25", url], capture_output=True, text=True)
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta")
    return json.loads(o.stdout)


def show(title, iw, ih, ifps, ow, oh, player):
    print()
    print("=" * 96)
    print("  " + title)
    print("=" * 96)
    r = opt(iw, ih, ifps, ow, oh, player, "real")
    e = opt(iw, ih, ifps, ow, oh, player, "emulado")
    print("  entrada %dx%d@%d -> salida %dx%d (%.2fx area) | player %s" % (
        iw, ih, ifps, ow, oh, r["areaRatio"], player))
    print()
    print("  %-20s %-30s %-30s" % ("CAMPO", "REAL", "EMULADO"))
    print("  " + "-" * 84)

    diffs = 0
    for k in ["codec", "preset", "crf", "audio", "seg_duration", "window_size",
              "extra_window_size", "gop_seconds", "x265_threads"]:
        a, b = str(r["fields"][k]["value"]), str(e["fields"][k]["value"])
        mark = "  <>" if a != b else ""
        if a != b:
            diffs += 1
        print("  %-20s %-30s %-30s%s" % (k, a, b, mark))

    # filtros
    fr, fe = r["filters"], e["filters"]
    for name, key, on in [("nlmeans", "s", "enabled"), ("minterpolate", "outFps", "enabled"),
                          ("cas", "strength", "enabled"), ("gradfun", "strength", "enabled")]:
        a = ("ON " + str(fr[name][key])) if fr[name][on] else "OFF"
        b = ("ON " + str(fe[name][key])) if fe[name][on] else "OFF"
        mark = "  <>" if a != b else ""
        if a != b:
            diffs += 1
        print("  %-20s %-30s %-30s%s" % (name, a, b, mark))
    for name, key in [("hqdn3d", "luma_spatial"), ("unsharp", "luma_amount"), ("atadenoise", "s")]:
        a, b = str(fr[name][key]), str(fe[name][key])
        mark = "  <>" if a != b else ""
        if a != b:
            diffs += 1
        print("  %-20s %-30s %-30s%s" % (name + "." + key, a, b, mark))

    print()
    print("  coste: REAL %sx (%sx rt, %s)  |  EMULADO %sx (%sx rt, %s)" % (
        r["cost"]["relative"], r["cost"]["estimatedRatio"], "VIABLE" if r["cost"]["viable"] else "NO VIABLE",
        e["cost"]["relative"], e["cost"]["estimatedRatio"], "VIABLE" if e["cost"]["viable"] else "NO VIABLE"))
    print("  campos que cambian entre modos: %d" % diffs)
    print()
    print("  CADENA REAL    :")
    print("   " + r["chain"][:200])
    print("  CADENA EMULADA :")
    print("   " + e["chain"][:200])
    for w in e["warnings"][:2]:
        print("  AVISO: " + w[:92])


def main():
    print()
    print("  " + "#" * 92)
    print("  #  FUNCION OBJETIVO — REAL vs EMULADO")
    print("  #  Los mismos campos dan configuraciones distintas segun el modo")
    print("  #" * 1)
    show("CASO 1: 720p@30 -> 4K en ONN 4K", 1280, 720, 30, 3840, 2160, "onn-4k")
    show("CASO 2: 720p@60 -> 1080p en ONN 4K", 1280, 720, 60, 1920, 1080, "onn-4k")
    show("CASO 3: 4K@60 -> 4K en Shield (sin escalado)", 3840, 2160, 60, 3840, 2160, "shield-tv")
    print()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)
