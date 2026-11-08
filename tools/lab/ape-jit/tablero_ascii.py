#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Render ASCII/ANSI del tablero REAL: matriz, cascada, fallback y players.
Todos los datos salen de los endpoints del motor. Nada se inventa.
"""
import json
import subprocess
import sys

B = "https://iptv-ape.duckdns.org"


def get(path, timeout=25):
    out = subprocess.run(["curl", "-s", "--max-time", str(timeout), B + path],
                         capture_output=True, text=True)
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError("sin respuesta en " + path)
    return json.loads(out.stdout)


def post(path, payload, timeout=25):
    out = subprocess.run(
        ["curl", "-s", "--max-time", str(timeout), "-X", "POST",
         "-H", "Content-Type: application/json",
         "-d", json.dumps(payload), B + path],
        capture_output=True, text=True)
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError("sin respuesta en " + path)
    return json.loads(out.stdout)


W = 96
D = "=" * W
S = "-" * W


def title(t):
    print()
    print(D)
    print("  " + t)
    print(D)


def row(cells, widths, marks=None):
    parts = []
    for i, c in enumerate(cells):
        s = str(c)
        w = widths[i]
        if len(s) > w:
            s = s[:w - 1] + "."
        parts.append(s.ljust(w) if i < len(cells) - 1 else s)
    line = "  " + " | ".join(parts)
    print(line)
    if marks:
        print("  " + "-+-".join("-" * widths[i] for i in range(len(cells))))


def main():
    print()
    print("  " + "#" * (W - 4))
    print("  #  MODULO DE IMAGEN - JIT APE  ·  TABLERO REAL")
    print("  #  Matriz · Cascada · Fallback · Players")
    print("  " + "#" * (W - 4))

    cfg = get("/jit/image/config")
    mtx = get("/jit/image/matrix")
    cas = get("/jit/image/cascade")
    gov = get("/jit/image/governance")

    # ── 1. MATRIZ ──
    title("1. MATRIZ EDITABLE — entrada -> SALIDA (12 perfiles)")
    widths = [7, 12, 11, 7, 12, 16]
    row(["PERFIL", "LAB DECLARA", "SALIDA", "MODO", "AREA px", "DITHER"], widths)
    row(["-" * 7, "-" * 12, "-" * 11, "-" * 7, "-" * 12, "-" * 16], widths)
    for r in mtx["rows"]:
        area = r["outW"] * r["outH"]
        row([r["profile"], r["labDeclared"] or "-",
             "%dx%d" % (r["outW"], r["outH"]), r["scaleMode"],
             format(area, ","), r["dither"]], widths)
    print()
    print("  Espacio de calculos: %s   campos editables: %s"
          % (format(mtx["spaceSize"], ","), ",".join(mtx["rows"][0]["editable"])))

    # ── 2. CASCADA ──
    title("2. CASCADA DE CODECS — 13 tiers con serial RFC 6381")
    widths = [5, 20, 20, 6, 16, 26]
    row(["TIER", "SERIAL hvc1", "SERIAL hev1", "NIVEL", "CAPACIDAD", "ROL"], widths)
    row(["-" * 5, "-" * 20, "-" * 20, "-" * 6, "-" * 16, "-" * 26], widths)
    for t in cas["tiers"]:
        row(["T%d" % t["tier"], t["hvc1"], t["hev1"], t["level"],
             "%dx%d@%d" % (t["maxW"], t["maxH"], t["maxFps"]), t["role"]], widths)
    print()
    print("  " + cas["goldenRule"])

    # ── 3. PLAYERS ──
    cat = get("/jit/image/catalog")
    title("3. PLAYERS — lo que cada decoder soporta (con su evidencia)")
    widths = [20, 12, 13, 22, 26]
    row(["PLAYER", "MAX RES", "HEVC/HDR", "CODECS", "EVIDENCIA"], widths)
    row(["-" * 20, "-" * 12, "-" * 13, "-" * 22, "-" * 26], widths)
    for p in cat["players"]:
        row([p["label"], "%dx%d" % (p["maxW"], p["maxH"]),
             "si" if p["main10"] else "NO",
             ",".join(p["codecs"]), p["evidence"][:26]], widths)

    # ── 4. FALLBACK ──
    title("4. FALLBACK resuelto — player x target")
    widths = [20, 13, 8, 22, 8]
    row(["PLAYER", "TARGET", "FPS", "TIER ELEGIDO", "SALTADOS"], widths)
    row(["-" * 20, "-" * 13, "-" * 8, "-" * 22, "-" * 8], widths)
    for p in ["onn-4k", "firestick-4k-max", "firestick-lite", "shield-tv", "generic"]:
        for t in ["FHD_1080", "UHD_4K", "K6_3240"]:
            try:
                f = post("/jit/image/fallback", {"player": p, "target": t, "fps": 25})
            except Exception:
                continue
            if not f.get("ok"):
                continue
            ch = ("T%d %s" % (f["chosen"]["tier"], f["chosen"]["serial"])) if f.get("chosen") else "-> " + f["fallbackToAvc"]["serial"]
            row([f["player"]["label"][:20], f["target"]["label"][:13], str(f["fps"]), ch,
                 "%d/%d" % (f.get("skipped", 0), len(f["trace"]))], widths)
        print()

    # ── 5. ELECCION COMPLETA: entrada -> salida -> codec -> player ──
    title("5. CONSTRUCTOR: ENTRADA (recibida) -> SALIDA (al TV) + CODEC + PLAYER")
    widths = [8, 12, 12, 13, 20, 18]
    row(["PERFIL", "ENTRADA", "SALIDA TV", "CODEC", "PLAYER", "RESULTADO"], widths)
    row(["-" * 8, "-" * 12, "-" * 12, "-" * 13, "-" * 20, "-" * 18], widths)
    casos = [
        ("P4", "1280x720", "FHD_1080", "hvc1", "onn-4k"),
        ("P4.5", "1280x720", "UHD_4K", "hvc1", "onn-4k"),
        ("P4.5", "1280x720", "K6_PQ", "hvc1", "onn-4k"),
        ("P1", "1920x1080", "UHD_4K", "avc1", "onn-4k"),
        ("P1", "1920x1080", "UHD_4K", "hvc1_8", "onn-4k"),
        ("P4.5", "1280x720", "K6_PQ", "hvc1", "firestick-lite"),
    ]
    for prof, inp, tgt, cod, ply in casos:
        w, h = inp.split("x")
        try:
            d = post("/jit/image/declare", {
                "profile": prof, "input": {"width": int(w), "height": int(h)},
                "target": tgt, "codec": cod, "player": ply, "recipe": "balanced"})
        except Exception:
            continue
        if not d.get("ok"):
            continue
        dd = d["declared"]
        res = "%dx%d" % (dd["target"]["width"], dd["target"]["height"])
        if dd["downgraded"]:
            res += " (DEGR)"
        if dd["impossible"]:
            res += " (!)"
        row([prof, inp, res, dd["codec"]["rfc"][:13], dd["player"]["label"][:20], res], widths)

    # ── 6. GOBIERNO ──
    title("6. GOBIERNO VPS -> PLAYER")
    print("  perfil por defecto : %s" % gov["defaultProfile"])
    print("  canales            : %s" % format(gov["count"], ","))
    print("  motores            : %s" % ", ".join(gov["engines"].keys()))
    print()
    print("  %s" % gov["mechanism"])
    print()
    widths = [8, 30, 8, 14, 10]
    row(["CANAL", "NOMBRE", "PERFIL", "SALIDA", "OVERRIDE"], widths)
    row(["-" * 8, "-" * 30, "-" * 8, "-" * 14, "-" * 10], widths)
    for c in gov["channels"][:8]:
        row([c["channel"], (c["name"] or "")[:30], c["profile"], c["target"] or "-",
             "si" if c["overridden"] else "no"], widths)
    print()
    # perfil AUTO por motor: lo que se pide vs lo que el decoder entrega
    print("  " + "-" * (W - 4))
    print("  PERFIL AUTO POR MOTOR  (lo pedido vs lo que el decoder aguanta)")
    print("  " + "-" * (W - 4))
    widths2 = [12, 16, 16, 13, 20]
    row(["MOTOR", "PERFIL PEDIDO", "PERFIL ENTREGADO", "PLAYER", "LIMITE DECODER"], widths2)
    row(["-" * 12, "-" * 16, "-" * 16, "-" * 13, "-" * 20], widths2)
    for eng in ["ott", "apk", "vlc", "kodi", "tivimate"]:
        try:
            h = subprocess.run(["curl", "-s", "--max-time", "60",
                                B + "/jit/image/lineup?engine=" + eng],
                               capture_output=True, text=True).stdout.split("\n")
        except Exception:
            continue
        hdr = h[1] if len(h) > 1 else ""
        def fld(k):
            for part in hdr.replace("#EXT-X-APE-GOVERNANCE:", "").split(";"):
                if part.startswith(k + "="):
                    return part.split("=", 1)[1]
            return "?"
        row([eng, fld("REQUESTED_DEFAULT"), fld("DEFAULT_PROFILE"),
             fld("PLAYER"), fld("MAX")], widths2)
    print()
    print("  canales totales gobernados: %s" % format(gov["count"], ","))

    print()
    print(D)
    print("  Datos leidos del motor en vivo. Nada inventado.")
    print(D)
    print()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)
