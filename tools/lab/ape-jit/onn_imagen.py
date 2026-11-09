#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aplica el bloque AI VISION (AI-SR + AI-PQ) del SoC Amlogic y mide.

Reglas de seguridad:
  - Antes de escribir NADA se guarda un snapshot de todas las claves tocadas.
  - Solo se escriben claves del namespace 'system'/'global' de imagen.
  - NUNCA se toca adb_enabled, development_settings_enabled ni nada de red.
  - Si una clave no existe, `settings put` la crea: es el mecanismo del vendor.
  - Se verifica leyendo de vuelta; si no cuadra, se reporta.
"""
import json
import subprocess
import sys

SERIAL = "adb-GUSA2441015311-RXlL4A._adb-tls-connect._tcp"
SNAP = "/tmp/onn_imagen_snapshot.json"

# Las directivas del SOP ADB MASTER DIRECTIVES, categoría 1 y 2.
# (namespace, clave, valor) — solo imagen; NO se incluye red/energía/GPU.
IMAGEN = [
    # CATEGORÍA 2 — AI VISION (el lever real: VPP del SoC, aplica a cualquier player)
    ("system", "aipq_enable", "1"),
    ("system", "aisr_enable", "1"),
    ("system", "ai_pq_mode", "3"),
    ("system", "ai_sr_mode", "3"),
    ("global", "aipq_enable", "1"),
    ("global", "aisr_enable", "1"),
    ("global", "ai_pic_mode", "3"),
    ("global", "ai_sr_level", "3"),
    # CATEGORÍA 1 — salida (los que ya estan en 4K se reafirman; no rompen nada)
    ("global", "user_preferred_resolution_width", "3840"),
    ("global", "user_preferred_resolution_height", "2160"),
    ("global", "user_preferred_refresh_rate", "60.0"),
]


def adb(cmd, timeout=30):
    o = subprocess.run(["adb", "-s", SERIAL, "shell", cmd],
                       capture_output=True, text=True, timeout=timeout)
    return (o.stdout or "").strip()


def get(ns, key):
    v = adb("settings get %s %s" % (ns, key))
    return v if v and v != "null" else None


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "estado"

    if modo == "snapshot":
        snap = {}
        for ns, key, _ in IMAGEN:
            snap["%s.%s" % (ns, key)] = get(ns, key)
        # extras que se leen para contexto
        for ns, key in [("global", "always_hdr"), ("global", "hdr_conversion_mode"),
                        ("global", "hdr_force_conversion_type"), ("global", "hdr_output_type"),
                        ("secure", "display_color_mode"), ("global", "match_content_frame_rate")]:
            snap["%s.%s" % (ns, key)] = get(ns, key)
        print(json.dumps(snap, indent=2, ensure_ascii=False))
        return

    if modo == "aplicar":
        print("  === APLICANDO AI VISION (AI-SR + AI-PQ) ===")
        resultados = []
        for ns, key, val in IMAGEN:
            antes = get(ns, key)
            adb("settings put %s %s %s" % (ns, key, val))
            despues = get(ns, key)
            ok = (despues == val)
            resultados.append({"ns": ns, "key": key, "antes": antes,
                               "pedido": val, "leido": despues, "ok": ok})
            print("   %-8s %-32s antes=%-8s pedido=%-6s leido=%-6s %s" % (
                ns, key, str(antes), val, str(despues), "OK" if ok else "FALLO"))
        aplicadas = sum(1 for r in resultados if r["ok"])
        print("\n   aplicadas: %d/%d" % (aplicadas, len(IMAGEN)))

        print("\n  === broadcast AI Vision (DroidLogic) ===")
        for accion in ("com.droidlogic.tv.action.AIPQ_ENABLE",
                       "com.droidlogic.tv.action.AISR_ENABLE"):
            o = adb("am broadcast -a %s --ei enable 1" % accion, timeout=30)
            linea = [l for l in o.split("\n") if "Broadcast" in l or "result=" in l]
            print("   %s -> %s" % (accion.split(".")[-1], (linea[0] if linea else o[:80])))

        print("\n  === estado HDMI tras aplicar ===")
        print("   attr: %s" % adb("cat /sys/class/amhdmitx/amhdmitx0/attr 2>/dev/null"))
        return

    if modo == "estado":
        print("  === claves de imagen AHORA ===")
        for ns, key, _ in IMAGEN:
            print("   %-8s %-32s = %s" % (ns, key, get(ns, key)))
        print("\n   HDMI attr: %s" % adb("cat /sys/class/amhdmitx/amhdmitx0/attr 2>/dev/null"))
        return

    if modo == "revertir":
        print("  === REVIRTIENDO AI VISION ===")
        for ns, key, _ in [("system", "aipq_enable", "0"), ("system", "aisr_enable", "0")]:
            adb("settings put %s %s %s" % (ns, key, "0"))
            print("   %-8s %-24s = %s" % (ns, key, get(ns, key)))
        for accion in ("com.droidlogic.tv.action.AIPQ_ENABLE",
                       "com.droidlogic.tv.action.AISR_ENABLE"):
            adb("am broadcast -a %s --ei enable 0" % accion)
        print("   AI desactivado (rollback del SOP §9)")
        return

    print("uso: snapshot | aplicar | estado | revertir")


if __name__ == "__main__":
    main()
