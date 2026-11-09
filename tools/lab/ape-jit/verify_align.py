#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prueba la alineacion con el Gestor de Perfiles y la key en caliente."""
import json
import subprocess
import sys

B = "https://iptv-ape.duckdns.org"


def get(path, t=25):
    o = subprocess.run(["curl", "-s", "--max-time", str(t), B + path], capture_output=True, text=True)
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta: " + path)
    return json.loads(o.stdout)


def post(path, payload, t=30):
    o = subprocess.run(["curl", "-s", "--max-time", str(t), "-X", "POST",
                        "-H", "Content-Type: application/json", "-d", json.dumps(payload), B + path],
                       capture_output=True, text=True)
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta: " + path)
    return json.loads(o.stdout)


def main():
    print()
    print("  " + "=" * 92)
    print("   ALINEACION GESTOR DE PERFILES <-> MODULO DE IMAGEN")
    print("  " + "=" * 92)

    # 1. los perfiles del gestor
    g = get("/jit/image/gestor/profiles")
    print()
    print("  PERFILES DEL GESTOR que el motor conoce: %d" % g["count"])
    print("  %-6s %-24s %-7s %-8s %s" % ("ID", "NOMBRE", "LEVEL", "CAMPOS", "SECCIONES"))
    print("  " + "-" * 86)
    for p in g["profiles"]:
        print("  %-6s %-24s %-7s %-8s %s" % (
            p["id"], (p["name"] or "")[:24], p["level"], format(p["fields"], ","),
            ",".join(p["sections"])[:36]))

    # 2. alinear P0 (8K) contra lo que pida el modulo
    print()
    print("  " + "=" * 92)
    print("   ALINEAR P0 (gestor) con 720p@30 -> 4K REAL en ONN 4K")
    print("  " + "=" * 92)
    a = post("/jit/image/profile/align", {
        "profile": "P0", "inW": 1280, "inH": 720, "inFps": 30,
        "outW": 3840, "outH": 2160, "player": "onn-4k", "mode": "real"})
    print()
    print("  perfil          : %s" % a["profile"])
    print("  modo            : %s" % a["mode"].upper())
    print("  campos totales  : %s" % format(a["totalFields"], ","))
    print("  propuestos      : %s" % a["proposed"])
    print("  sin tocar       : %s" % format(a["unchanged"], ","))
    print("  AVISO           : %s" % a["note"][:84])
    print()
    print("  %-36s %-22s %-22s" % ("CAMPO", "ANTES", "DESPUES"))
    print("  " + "-" * 84)
    for d in a["diffs"][:20]:
        b = str(d["before"])
        af = str(d["after"])
        if len(b) > 20:
            b = b[:19] + "~"
        if len(a) > 20:
            af = af[:19] + "~"
        print("  %-36s %-22s %-22s" % (d["path"], b, af))
    if len(a["diffs"]) > 20:
        print("  ... y %d mas" % (len(a["diffs"]) - 20))
    print()
    print("  RAZONES (muestra):")
    for d in a["diffs"][:6]:
        print("   %-32s %s" % (d["path"], d["reason"][:52]))

    # 3. comparar con EMULADO
    print()
    print("  " + "=" * 92)
    print("   EL MISMO P0, ahora 720p@30 -> 6K EMULADO")
    print("  " + "=" * 92)
    e = post("/jit/image/profile/align", {
        "profile": "P0", "inW": 1280, "inH": 720, "inFps": 30,
        "outW": 5760, "outH": 3240, "player": "onn-4k", "mode": "emulado"})
    print()
    print("  propuestos: %d  (REAL era %d)" % (e["proposed"], a["proposed"]))
    print()
    for d in e["diffs"][:12]:
        b = str(d["before"])[:19]
        af = str(d["after"])[:19]
        print("  %-36s %-22s %-22s" % (d["path"], b, af))

    # 4. la key en caliente
    print()
    print("  " + "=" * 92)
    print("   KEY DEL LLM: guardar en caliente (sin reiniciar)")
    print("  " + "=" * 92)
    r = post("/jit/image/llm-key", {"key": "sk-test-invalid-key-demo-12345"})
    print("  guardar (clave de prueba): %s" % json.dumps(r, ensure_ascii=False))
    st = get("/jit/image/llm-status")
    print("  configured tras guardar  : %s" % st["configured"])
    # probar que el LLM responde (y falla limpio con una key invalida)
    t = post("/jit/image/optimize-llm", {
        "inW": 1280, "inH": 720, "inFps": 30, "outW": 3840, "outH": 2160,
        "player": "onn-4k", "mode": "real"}, t=45)
    print("  optimize-llm con key mala : used=%s error=%s" % (
        t.get("llm", {}).get("used"), str(t.get("llm", {}).get("error"))[:64]))
    print("  -> gano el determinista   : %s" % (t.get("llm", {}).get("source")))
    # limpiar
    c = post("/jit/image/llm-key", {"clear": True})
    print("  limpiar key              : %s" % json.dumps(c, ensure_ascii=False))
    print()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)
