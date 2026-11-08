#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DISENO GRAFICO de la tabla de reglas, tal como quedara en el panel.
Muestra el auto por campo y el boton de fila, con datos REALES del motor.
"""
import json
import subprocess
import sys

B = "https://iptv-ape.duckdns.org"
W = 110
D = "=" * W


def get(path, t=25):
    o = subprocess.run(["curl", "-s", "--max-time", str(t), B + path], capture_output=True, text=True)
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta: " + path)
    return json.loads(o.stdout)


def post(path, payload, t=25):
    o = subprocess.run(["curl", "-s", "--max-time", str(t), "-X", "POST",
                        "-H", "Content-Type: application/json", "-d", json.dumps(payload), B + path],
                       capture_output=True, text=True)
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta: " + path)
    return json.loads(o.stdout)


def main():
    print()
    print("  " + "#" * (W - 4))
    print("  #  TABLA DE REGLAS  ·  ENTRADA -> SALIDA  ·  DISENO DEL PANEL")
    print("  " + "#" * (W - 4))
    print()
    print("  Cada fila es MANUAL. Cada campo tiene (A) de auto. Al final de la fila,")
    print("  el boton [*] rellena TODA la fila con la configuracion optima.")
    print()

    rules = get("/jit/image/rules")

    # ── LA TABLA ──
    print("  " + D)
    print("   ENTRADA           SALIDA            FPS          CODEC   RECETA     DITHER            ")
    print("   res       fps     res        fps    entra sale   (A)     (A)        (A)          [*]  ")
    print("  " + "-" * (W - 4))
    last = None
    for r in rules["rules"]:
        inp = r["input"] if r["input"] != last else ""
        last = r["input"]
        infps = str(r.get("inFps") or "-")
        outfps = str(r.get("outFps") or "same")
        print("   %-9s %-6s %-10s %-6s %-5s %-5s %-7s %-10s %-12s [ * ]" % (
            inp, infps, "%dx%d" % (r["outW"], r["outH"]), "", infps, outfps,
            r["codec"], r["recipe"], r.get("dither") or "-"))
        if last != r["input"]:
            pass
    print("  " + D)
    print("   [ * ] = pulsar rellena la fila con la configuracion optima (auto)")
    print("   (A)   = el campo tiene su propio boton de auto")
    print()

    # ── EL AUTO, campo por campo, con datos reales ──
    print("  " + D)
    print("   QUE HACE EL BOTON [*] — ejemplo real: 720p@30  ->  2560x1440")
    print("  " + D)
    a = post("/jit/image/rules/auto", {
        "inW": 1280, "inH": 720, "inFps": 30, "outW": 2560, "outH": 1440, "player": "onn-4k"})
    print()
    print("   ratio de escalado: %.2fx en area" % a["areaRatio"])
    print()
    print("   CAMPO      VALOR OPTIMO        POR QUE")
    print("   " + "-" * 74)
    for k in ["codec", "recipe", "outFps", "dither"]:
        f = a["fields"][k]
        v = str(f.get("value"))
        if k == "outFps" and f.get("op"):
            v += " (" + f["op"] + ")"
        print("   %-10s %-20s %s" % (k, v, f["reason"][:52]))
    print()
    if a.get("hostCost"):
        h = a["hostCost"]
        verdict = "VIABLE" if h["viable"] else "NO VIABLE EN ESTE HOST"
        print("   coste relativo estimado: %.2fx  ->  %.2fx tiempo real  ->  %s" % (
            h["relative"], h["estimatedRatio"], verdict))
    for w in a.get("warnings", []):
        print("   AVISO: " + w[:96])
    for i in a.get("impossible", []):
        print("   IMPOSIBLE: " + i[:92])
    print()

    # ── CASOS QUE EL AUTO RECHAZA ──
    print("  " + D)
    print("   CONFIGURACIONES IMPOSIBLES QUE EL AUTO NO PROPONE")
    print("  " + D)
    casos = [
        ("720p@30 -> 6K en ONN 4K", 1280, 720, 30, 5760, 3240, "onn-4k"),
        ("720p@30 -> 4K en Firestick Lite", 1280, 720, 30, 3840, 2160, "firestick-lite"),
        ("4K@60 -> 8K en este host", 3840, 2160, 60, 7680, 4320, "shield-tv"),
    ]
    for title, iw, ih, ifps, ow, oh, pl in casos:
        print()
        print("   " + title)
        r = post("/jit/image/rules/auto", {"inW": iw, "inH": ih, "inFps": ifps,
                                           "outW": ow, "outH": oh, "player": pl})
        print("     auto propone : codec=%s recipe=%s fps=%s" % (
            r["fields"]["codec"]["value"], r["fields"]["recipe"]["value"],
            r["fields"]["outFps"].get("value")))
        if r.get("hostCost"):
            print("     coste        : %.2fx -> %.2fx tiempo real" % (
                r["hostCost"]["relative"], r["hostCost"]["estimatedRatio"]))
        for i in r.get("impossible", []):
            print("     IMPOSIBLE    : " + i[:88])
        for w in r.get("warnings", []):
            print("     AVISO        : " + w[:88])
    print()
    print("  " + D)
    print("   Datos leidos del motor en vivo.")
    print("  " + D)
    print()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)
