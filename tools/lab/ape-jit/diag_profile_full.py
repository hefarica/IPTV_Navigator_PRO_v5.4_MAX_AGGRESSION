#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Diagnostico del endpoint /image/profile/{pid}/full — el que alimenta el
modulo de imagen cuando cambias el select aip-b-profile."""
import json
import subprocess

B = "https://iptv-ape.duckdns.org/jit"


def get(path):
    o = subprocess.run(["curl", "-s", "--max-time", "40", B + path],
                       capture_output=True, text=True)
    return o.stdout


for pid in ("P0", "P1", "P2", "P4", "P5"):
    raw = get("/image/profile/%s/full?player=onn-4k&w=1280&h=720" % pid)
    print()
    print("  === %s ===" % pid)
    try:
        d = json.loads(raw)
    except ValueError:
        print("   NO ES JSON: %s" % raw[:200])
        continue
    print("   ok=%s  claves: %s" % (d.get("ok"), sorted(d.keys())))
    L = d.get("load")
    if not L:
        print("   SIN 'load'  -> el panel dice 'sin datos' y NO rellena nada")
        print("   respuesta: %s" % json.dumps(d, ensure_ascii=False)[:260])
        continue
    # que campos trae realmente
    keys = sorted(L.keys())
    print("   load trae %d claves: %s" % (len(keys), keys))
    interes = ["input", "outW", "outH", "outFps", "codec", "recipe", "dither",
               "mode", "preset", "crf", "audio", "gop_seconds", "seg_duration",
               "window_size", "extra_window_size", "x265_threads",
               "hqdn3d", "unsharp", "atadenoise"]
    faltan = [k for k in interes if k not in L]
    print("   FALTAN: %s" % (faltan or "ninguno"))
    # valores reales
    for k in ("input", "outW", "outH", "outFps", "codec", "recipe", "mode",
              "preset", "crf", "seg_duration", "hqdn3d", "unsharp", "atadenoise"):
        if k in L:
            print("     %-20s = %s" % (k, json.dumps(L[k], ensure_ascii=False)[:70]))
