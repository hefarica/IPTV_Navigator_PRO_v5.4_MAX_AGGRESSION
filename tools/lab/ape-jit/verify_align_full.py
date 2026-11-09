#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prueba la alineacion COMPLETA: todos los campos, cascada y apply."""
import json
import subprocess
import sys

B = "https://iptv-ape.duckdns.org"


def post(path, payload, t=30):
    o = subprocess.run(["curl", "-s", "--max-time", str(t), "-X", "POST",
                        "-H", "Content-Type: application/json", "-d", json.dumps(payload), B + path],
                       capture_output=True, text=True)
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta: " + path)
    return json.loads(o.stdout)


def main():
    print()
    print("  " + "=" * 96)
    print("   ALINEACION COMPLETA — todos los campos, con cascada")
    print("  " + "=" * 96)

    for mode, ow, oh in [("real", 3840, 2160), ("emulado", 5760, 3240)]:
        print()
        print("  ---- P0 alineado con 720p@30 -> %dx%d %s ----" % (ow, oh, mode.upper()))
        a = post("/jit/image/profile/align", {
            "profile": "P0", "inW": 1280, "inH": 720, "inFps": 30,
            "outW": ow, "outH": oh, "player": "onn-4k", "mode": mode})
        if not a.get("ok"):
            print("  ERROR:", a.get("error"))
            continue
        print("  campos totales : %s" % format(a["totalFields"], ","))
        print("  propuestos     : %s" % format(a["proposed"], ","))
        print("  sin tocar      : %s" % format(a["unchanged"], ","))
        print("  EN CASCADA     : %s" % format(a["cascadeCount"], ","))
        print()
        print("  %-24s %-7s %s" % ("SECCION", "CAMPOS", "CAMBIAN"))
        print("  " + "-" * 48)
        for s in a["sections"]:
            print("  %-24s %-7s %s" % (s["section"], s["fields"], s["changed"]))
        print()
        # ejemplos de cascada
        cas = [d for d in a["diffs"] if d["cascade"]][:6]
        if cas:
            print("  EJEMPLOS DE CASCADA (se transforma cada nivel):")
            for d in cas:
                b = str(d["before"])
                af = str(d["after"])
                if len(b) > 34:
                    b = b[:33] + "~"
                if len(af) > 34:
                    af = af[:33] + "~"
                print("   %-34s %-36s -> %s" % (d["path"][-34:], b, af))
        print()
        # apply
        ap = post("/jit/image/profile/align/apply", {"gestorProfile": a.get("gestorProfile") or {}, "diffs": a["diffs"]})
        # el endpoint necesita el perfil; lo pedimos de nuevo con el del gestor embebido
        if not ap.get("ok"):
            # pedir el perfil crudo y reaplicar
            o = subprocess.run(["curl", "-s", "--max-time", "20", B + "/jit/image/gestor/profile/P0"],
                               capture_output=True, text=True)
            if o.stdout.strip():
                try:
                    gp = json.loads(o.stdout)
                    if gp.get("ok") and gp.get("profile"):
                        ap = post("/jit/image/profile/align/apply",
                                  {"gestorProfile": gp["profile"], "diffs": a["diffs"]})
                except Exception:
                    pass
        print("  APPLY: %s" % json.dumps({k: ap.get(k) for k in ("ok", "applied", "failed")}, ensure_ascii=False)[:120])

    print()
    print("  " + "=" * 96)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)
