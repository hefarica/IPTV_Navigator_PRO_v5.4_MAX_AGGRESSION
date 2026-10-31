#!/usr/bin/env python3
"""Bench real de los 12 perfiles; no usa jq, no arranca canary."""
import glob
import json
import os
import re
import resource
import subprocess
import sys
import time

profiles = sorted(glob.glob("/etc/ara/profiles/crystal_*.json"))
if len(profiles) != 12:
    print(f"profiles={len(profiles)} esperado 12", file=sys.stderr)
    sys.exit(1)

rows = []
for path in profiles:
    p = json.load(open(path))
    w, h = map(int, p["out"].split("x"))
    br = int(p["bitrate_mbps"])
    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin", "-threads", "3",
        "-t", "0.5", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=0.5",
        "-vf", f"format=yuv420p10le,scale={w}:{h}:flags=lanczos",
        "-c:v", "libx265", "-preset", "ultrafast", "-tune", "zerolatency",
        "-x265-params", "bframes=0:rc-lookahead=0:keyint=48:min-keyint=48:scenecut=0",
        "-b:v", f"{br}M", "-an", "-progress", "pipe:1", "-y", f"/tmp/bench_{p['id']}.mkv",
    ]
    t0 = time.time()
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = proc.communicate(timeout=300)
    wall = max(time.time() - t0, 0.001)
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu_pct = ((after.ru_utime - before.ru_utime) + (after.ru_stime - before.ru_stime)) / wall * 100.0
    fps = 0.0
    for line in out.splitlines():
        if line.startswith("fps="):
            try:
                fps = float(line.split("=", 1)[1])
            except ValueError:
                pass
    rows.append({
        "id": p["id"], "out": p["out"], "fps": round(fps, 1),
        "cpu_pct": round(cpu_pct, 1), "rc": proc.returncode,
        "err": err[-200:].replace("\n", " ")
    })

print(f"{'profile':20} {'out':12} {'fps':>6} {'cpu%':>6} {'rc':>3}")
for r in rows:
    print(f"{r['id']:20} {r['out']:12} {r['fps']:6.1f} {r['cpu_pct']:6.1f} {r['rc']:3}")
print("\nJSON=" + json.dumps(rows, ensure_ascii=False))
