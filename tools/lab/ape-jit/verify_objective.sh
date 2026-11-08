#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Valida contra ffmpeg REAL las cadenas de la funcion objetivo, en ambos modos."""
import json
import subprocess
import sys

B = "https://iptv-ape.duckdns.org"
OK = 0
BAD = 0


def opt(iw, ih, ifps, ow, oh, player, mode):
    url = "%s/jit/image/optimize?inW=%d&inH=%d&inFps=%d&outW=%d&outH=%d&player=%s&mode=%s" % (
        B, iw, ih, ifps, ow, oh, player, mode)
    o = subprocess.run(["curl", "-s", "--max-time", "25", url], capture_output=True, text=True)
    return json.loads(o.stdout)


def check(label, iw, ih, ifps, ow, oh, player, mode):
    global OK, BAD
    r = opt(iw, ih, ifps, ow, oh, player, mode)
    chain = r["chain"]
    p = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error",
         "-f", "lavfi", "-i", "testsrc2=s=%dx%d:d=0.3" % (iw, ih),
         "-vf", chain, "-frames:v", "3", "-f", "null", "-"],
        capture_output=True, text=True)
    if p.returncode == 0:
        print("  OK    %-40s (%dx%d@%d -> %dx%d, %s)" % (label, iw, ih, ifps, ow, oh, mode))
        OK += 1
    else:
        err = (p.stderr or "").replace("\n", " ")[:110]
        print("  FALLA %-40s -> %s" % (label, err))
        BAD += 1


def main():
    print()
    print("  " + "=" * 88)
    print("   VALIDACION ffmpeg REAL de las cadenas de la funcion objetivo")
    print("  " + "=" * 88)
    casos = [
        ("720p30->1080p", 1280, 720, 30, 1920, 1080, "onn-4k"),
        ("720p30->4K", 1280, 720, 30, 3840, 2160, "onn-4k"),
        ("720p60->1080p", 1280, 720, 60, 1920, 1080, "onn-4k"),
        ("1080p30->4K", 1920, 1080, 30, 3840, 2160, "onn-4k"),
        ("4K60->4K", 3840, 2160, 60, 3840, 2160, "shield-tv"),
        ("480p30->1080p", 854, 480, 30, 1920, 1080, "onn-4k"),
    ]
    for label, iw, ih, ifps, ow, oh, pl in casos:
        for mode in ["real", "emulado"]:
            check(label, iw, ih, ifps, ow, oh, pl, mode)
    print()
    print("  aceptadas: %d   rechazadas: %d" % (OK, BAD))
    print()
    return 0 if BAD == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
