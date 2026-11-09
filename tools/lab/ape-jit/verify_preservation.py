#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verifica las INVARIANTES DE CIERRE de la Ley de Preservacion sobre el apply real.

Comprueba que, tras alinear los 12 perfiles:
  - ningun campo desaparece
  - ninguna cascada cambia de numero de niveles
  - ningun valor que no estaba en blanco queda en blanco
"""
import json
import os
import subprocess
import tempfile

B = "https://iptv-ape.duckdns.org"


def post(path, payload):
    fd, tmp = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)
    try:
        o = subprocess.run(
            ["curl", "-s", "--max-time", "240", "-X", "POST",
             "-H", "Content-Type: application/json",
             "--data-binary", "@" + tmp, B + path],
            capture_output=True, text=True)
    finally:
        os.unlink(tmp)
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta: " + path + " stderr=" + o.stderr[:200])
    return json.loads(o.stdout)


def main():
    print()
    print("  " + "=" * 78)
    print("   INVARIANTES DE CIERRE — Ley de Preservacion sobre el apply real")
    print("  " + "=" * 78)

    a = post("/jit/image/profile/align-all", {
        "inW": 1280, "inH": 720, "inFps": 30,
        "outW": 3840, "outH": 2160, "player": "onn-4k", "mode": "real"})

    payload = {"profiles": {}}
    for pid, p in (a.get("profiles") or {}).items():
        if p.get("gestorProfile") and p.get("diffs"):
            payload["profiles"][pid] = {"gestorProfile": p["gestorProfile"], "diffs": p["diffs"]}

    if not payload["profiles"]:
        print("  No hay diffs que aplicar.")
        return 1

    ap = post("/jit/image/profile/align-all/apply", payload)
    t = ap.get("totals") or {}
    print()
    print("  APPLY: %d perfiles | %s aplicados | %s fallos | violaciones: %s" % (
        t.get("profiles"), format(t.get("applied") or 0, ","),
        t.get("failed") or 0, t.get("violations") or 0))
    print()
    print("  %-6s %-9s %-15s %-15s %-15s %s" % (
        "PERFIL", "CAMPOS", "SIN PERDIDA", "CASCADAS", "SIN BLANCOS", "OK"))
    print("  " + "-" * 74)

    allok = True
    for pid in sorted((ap.get("profiles") or {}), key=lambda x: (x.replace(".5", ""), x)):
        p = ap["profiles"][pid]
        inv = p.get("invariants") or {}
        fl = inv.get("noFieldLost") or {}
        ci = inv.get("cascadesIntact") or {}
        nb = inv.get("noBlanks") or {}
        ok = inv.get("ok")
        if not ok:
            allok = False
        print("  %-6s %-9s %-15s %-15s %-15s %s" % (
            pid, p.get("totalFields") or "-",
            "OK" if fl.get("ok") else "PERDIO %d" % (fl.get("total") or 0),
            "OK" if ci.get("ok") else "ROTA %d" % (ci.get("total") or 0),
            "OK" if nb.get("ok") else "VACIO %d" % (nb.get("total") or 0),
            "SI" if ok else "NO"))

    print()
    print("  INVARIANTES GLOBALES: %s" % ("TODAS OK" if allok else "HAY VIOLACIONES"))
    print()

    # detalle de cualquier violacion
    if not allok:
        for pid in (ap.get("profiles") or {}):
            inv = (ap["profiles"][pid].get("invariants") or {})
            for k, lbl in (("noFieldLost", "campos perdidos"),
                           ("cascadesIntact", "cascadas rotas"),
                           ("noBlanks", "valores vaciados")):
                v = inv.get(k) or {}
                if not v.get("ok"):
                    print("  %s / %s: %s" % (pid, lbl, str(v)[:200]))

    # anti-degradacion
    p0 = (ap.get("profiles") or {}).get("P0") or {}
    st = ((p0.get("profile") or {}).get("settings") or {})
    print("  P0 resolution: %s   bitrate: %s" % (st.get("resolution"), st.get("bitrate")))
    print()
    return 0 if allok else 1


if __name__ == "__main__":
    raise SystemExit(main())
