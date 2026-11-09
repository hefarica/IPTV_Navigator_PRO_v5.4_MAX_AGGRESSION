#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arranca una sesion JIT y muestra su recibo medido (manual REA §10)."""
import json
import subprocess
import sys
import time
import urllib.request

B = "http://127.0.0.1:3099"
CH = sys.argv[1] if len(sys.argv) > 1 else "1"


def get(url, timeout=120):
    return urllib.request.urlopen(url, timeout=timeout).read().decode("utf-8", "replace")


def main():
    print("  servicio: %s" % subprocess.run(["systemctl", "is-active", "ape-jit"],
                                           capture_output=True, text=True).stdout.strip())
    # secuencia que hace un player real
    for label, url in (
        ("master", B + "/go/" + CH),
        ("media", B + "/live/" + CH + "/media_0.m3u8"),
    ):
        try:
            body = get(url, 90)
            print("    %-6s OK  %d B" % (label, len(body)))
            if label == "media":
                segs = [l for l in body.split("\n") if l and not l.startswith("#")]
                if segs:
                    try:
                        get(B + "/live/" + CH + "/" + segs[0], 120)
                        print("    seg    OK")
                    except Exception as e:
                        print("    seg    fallo: %s" % e)
        except Exception as e:
            print("    %-6s fallo: %s" % (label, e))
    time.sleep(10)

    d = json.loads(get(B + "/image/receipt?channel=" + CH))
    v = d.get("video_measured") or {}
    a = d.get("audio_measured") or {}
    r = d.get("recipe") or {}
    print()
    print("  === RECIBO canal %s ===" % CH)
    print("  status   : %s" % d.get("status"))
    print("  live     : %s" % json.dumps(d.get("live")))
    print("  run_id   : %s | perfil %s" % (d.get("run_id"), d.get("profile_requested")))
    print("  ffmpeg   : pid %s via %s" % ((d.get("ffmpeg") or {}).get("pid"),
                                          (d.get("ffmpeg") or {}).get("matched_by")))
    print("  receta   : pasos=%s denoise=%s sharpen=%s upscale=%s pq=%s crf=%s" % (
        r.get("steps"), r.get("denoise"), r.get("sharpen"),
        r.get("upscale_filter"), r.get("tonemap_pq"), r.get("crf")))
    print("  declared : %s" % json.dumps(d.get("declared")))
    print("  medido   : %sx%s %s %s L%s %s | %s %s" % (
        v.get("width"), v.get("height"), v.get("codec"), v.get("profile"),
        v.get("level"), v.get("pix_fmt"), v.get("color_transfer"), v.get("fps")))
    print("  audio    : %s %sch %s" % (a.get("codec"), a.get("channels"), a.get("channel_layout")))
    print("  VEREDICTO: %s — %s" % (d.get("status"), d.get("reason")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
