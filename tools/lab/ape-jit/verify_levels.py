#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verifica la alineacion de L1-L7, el LLM y el apply completo."""
import json
import subprocess
import sys

B = "https://iptv-ape.duckdns.org"


def post(path, payload, t=60):
    o = subprocess.run(["curl", "-s", "--max-time", str(t), "-X", "POST",
                        "-H", "Content-Type: application/json", "-d", json.dumps(payload), B + path],
                       capture_output=True, text=True)
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta: " + path)
    return json.loads(o.stdout)


def main():
    print()
    print("  " + "=" * 96)
    print("   ALINEACION CON NIVELES L1-L7")
    print("  " + "=" * 96)

    a = post("/jit/image/profile/align", {
        "profile": "P0", "inW": 1280, "inH": 720, "inFps": 30,
        "outW": 3840, "outH": 2160, "player": "onn-4k", "mode": "real"})
    if not a.get("ok"):
        print("  ERROR:", a.get("error"))
        return 1

    print()
    print("  campos totales : %s" % format(a["totalFields"], ","))
    print("  propuestos     : %s" % format(a["proposed"], ","))
    print("  en cascada     : %s" % format(a["cascadeCount"], ","))
    print()
    print("  %-22s %-7s %s" % ("SECCION", "CAMPOS", "CAMBIAN"))
    print("  " + "-" * 46)
    for s in a["sections"]:
        print("  %-22s %-7s %s" % (s["section"], s["fields"], s["changed"]))

    # L1-L7
    print()
    print("  ESCALERA L1-L7 alineada:")
    print("  %-6s %-14s %-12s %s" % ("NIVEL", "RESOLUCION", "BITRATE", "HDR"))
    print("  " + "-" * 44)
    qld = [d for d in a["diffs"] if d["path"].startswith("quality_levels.L")]
    for d in qld:
        af = d["after"] or {}
        print("  %-6s %-14s %-12s %s" % (d["path"].split(".")[-1],
              af.get("resolution"), af.get("bitrate_mbps"), af.get("hdr")))

    # validar que la escalera DESCIENDE
    print()
    res = []
    for d in qld:
        r = (d["after"] or {}).get("resolution", "")
        if "x" in r:
            w = int(r.split("x")[0])
            res.append(w)
    ok = all(res[i] >= res[i+1] for i in range(len(res)-1)) if len(res) > 1 else False
    print("  escalera desciende: %s  (%s)" % ("SI" if ok else "NO", " > ".join(str(x) for x in res)))

    # LLM (sin key -> determinista)
    print()
    print("  " + "=" * 96)
    print("   ALINEACION CON LLM (sin key: debe caer al determinista)")
    print("  " + "=" * 96)
    l = post("/jit/image/profile/align-llm", {
        "profile": "P0", "inW": 1280, "inH": 720, "inFps": 30,
        "outW": 3840, "outH": 2160, "player": "onn-4k", "mode": "real"})
    print()
    print("  ok       :", l.get("ok"))
    print("  llm      :", json.dumps(l.get("llm"), ensure_ascii=False)[:130])
    print("  propuestos:", l.get("proposed"))

    # apply de la version con niveles
    print()
    print("  " + "=" * 96)
    print("   APPLY CON NIVELES")
    print("  " + "=" * 96)
    ap = post("/jit/image/profile/align/apply", {
        "gestorProfile": a.get("gestorProfile"), "diffs": a["diffs"]})
    print()
    print("  aplicados:", ap.get("applied"), "| fallos:", len(ap.get("failed") or []))
    p = ap.get("profile") or {}
    ql = p.get("quality_levels") or {}
    print()
    print("  VERIFICACION del perfil resultante:")
    print("   settings.resolution:", (p.get("settings") or {}).get("resolution"))
    for k in ["L1", "L3", "L7"]:
        lv = ql.get(k) or {}
        print("   %s: %s @ %s Mbps, %s" % (k, lv.get("resolution"), lv.get("bitrate_mbps"), lv.get("hdr")))
    print()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)
