#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Construye una lista de prueba con la metadata PRISMA y la publica en el VPS."""
import json
import subprocess
import urllib.request

B = "https://iptv-ape.duckdns.org"
OUT = "/var/www/html/ape-prisma-test.m3u8"


def get(url):
    return urllib.request.urlopen(url, timeout=60).read().decode("utf-8")


# 1. metadata PRISMA (los 12 planes + bloque plano por defecto)
emit = json.loads(get(B + "/jit/image/prisma/emit-all"))
print("  emit-all: defaultProfile=%s bytes=%s chunks=%s" %
      (emit.get("defaultProfile"), emit.get("bytes"), emit.get("chunks")))
flat = emit["json"]["fields"]["prisma"]
print("  bloque plano: glsl=%s car_denoise=%s upscale=%s" %
      (flat.get("glsl"), flat.get("car_denoise"), flat.get("upscale")))
glf = emit["json"]["fields"]["gl"]
print("  gl plano: sharpen=%s denoise=%s microcontrast=%s" %
      (glf.get("sharpen"), glf.get("denoise"), glf.get("microcontrast")))

# 2. canales reales del JIT
ch = json.loads(subprocess.run(
    "cat /opt/ape-jit/current/channels.json", shell=True,
    capture_output=True, text=True).stdout)
ids = sorted(ch.keys(), key=lambda x: int(x))[:3]
print("  canales de prueba: %s" % ids)

# 3. la lista: metadata PRISMA primero, luego canales con ape-profile
lines = ["#EXTM3U"]
lines += emit["lines"]
perfiles = ["P3", "P5", "P1"]
for i, cid in enumerate(ids):
    pid = perfiles[i % len(perfiles)]
    lines.append('#EXTINF:-1 tvg-id="%s" tvg-name="PRISMA Test %s" group-title="APE-TEST" '
                 'ape-profile="%s",Canal %s (%s)' % (cid, cid, pid, cid, pid))
    lines.append(ch[cid]["url"])

txt = "\n".join(lines) + "\n"
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(txt)
print("  lista escrita: %s (%d bytes, %d lineas)" % (OUT, len(txt), len(lines)))

# 4. comprobar que se sirve
code = subprocess.run(
    ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "30",
     B + "/ape-prisma-test.m3u8"], capture_output=True, text=True).stdout
print("  HTTP publico: %s" % code)
print("  URL para el device: %s/ape-prisma-test.m3u8" % B)
