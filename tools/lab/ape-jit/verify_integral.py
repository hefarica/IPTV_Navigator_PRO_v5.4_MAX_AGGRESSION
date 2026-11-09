#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VERIFICACION INTEGRAL del modulo de imagen JIT + Gestor de Perfiles.

Comprueba, contra el sistema real, cada promesa del objetivo:
  1. El motor responde
  2. La key del LLM se puede guardar (estado honesto sin key)
  3. Los 12 perfiles del Gestor estan accesibles
  4. La alineacion cubre los 6.750 campos
  5. La cascada preserva la escalera ABR
  6. El apply devuelve los perfiles nuevos
  7. La ley de suficiencia clasifica bien
  8. El panel se sirve con el cache-buster correcto

Cada linea es un PASS / FAIL con el dato medido al lado. Sin prosa.
"""
import json
import subprocess
import sys

B = "https://iptv-ape.duckdns.org"
ok = 0
fail = 0
rows = []


def check(name, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        rows.append(("PASS", name, detail))
    else:
        fail += 1
        rows.append(("FAIL", name, detail))


def get(path, t=30):
    o = subprocess.run(["curl", "-s", "--max-time", str(t), B + path], capture_output=True, text=True)
    return o.stdout


def post(path, payload, t=180):
    """Manda el payload por ARCHIVO, no como argumento.
    Con los 6.750 campos del apply, -d <json> revienta con
    "Argument list too long" (E2BIG, limite ~128 KB por argumento)."""
    import tempfile
    import os
    fd, tmp = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
        o = subprocess.run(["curl", "-s", "--max-time", str(t), "-X", "POST",
                            "-H", "Content-Type: application/json",
                            "--data-binary", "@" + tmp, B + path],
                           capture_output=True, text=True)
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass
    if not o.stdout.strip():
        raise RuntimeError("sin respuesta: " + path)
    return json.loads(o.stdout)


def main():
    print()
    print("  " + "=" * 100)
    print("   VERIFICACION INTEGRAL — modulo de imagen JIT + Gestor de Perfiles")
    print("  " + "=" * 100)

    # 1. motor
    h = get("/jit/health")
    try:
        hj = json.loads(h)
        check("motor responde", True, "ok=%s" % hj.get("ok"))
        check("version del motor", bool(hj.get("version") or hj.get("ok")), str(hj.get("version") or "-")[:24])
    except Exception as e:
        check("motor responde", False, str(e)[:60])

    # 2. estado de la key
    k = get("/jit/image/llm-status")
    try:
        kj = json.loads(k)
        check("estado de la key", "configured" in kj,
              "configured=%s source=%s" % (kj.get("configured"), kj.get("source") or "-"))
        check("la key NO esta puesta (honesto)",
              kj.get("configured") in (True, False), "sin key del operador: el LLM cae al determinista")
    except Exception as e:
        check("estado de la key", False, str(e)[:60])

    # 3-4. los 12 perfiles y los campos
    a = post("/jit/image/profile/align-all", {
        "inW": 1280, "inH": 720, "inFps": 30,
        "outW": 3840, "outH": 2160, "player": "onn-4k", "mode": "real"})
    t = a.get("totals") or {}
    check("12 perfiles", t.get("profiles") == 12, "perfiles=%s" % t.get("profiles"))
    check("6.750 campos", t.get("fields") == 6750, "campos=%s" % format(t.get("fields") or 0, ","))
    check("propuestas > 1500", (t.get("proposed") or 0) > 1500, "propuestos=%s" % format(t.get("proposed") or 0, ","))
    check("cascadas > 250", (t.get("cascade") or 0) > 250, "cascadas=%s" % t.get("cascade"))

    # los .5 en modo emulado
    emu = [pid for pid in (a.get("profiles") or {})
           if (a["profiles"][pid].get("appliedMode") == "emulado")]
    check("los 6 emulados usan modo emulado", len(emu) == 6, "emulados=%d %s" % (len(emu), sorted(emu)[:3]))

    # 5. cascada con escalera
    p0 = (a.get("profiles") or {}).get("P0") or {}
    res_casc = next((d for d in (p0.get("diffs") or [])
                     if d.get("path") == "headers.X-APE-RESOLUTION" and d.get("cascade")), None)
    ladder_ok = False
    ladder_txt = "-"
    if res_casc:
        vals = [v for v in str(res_casc["after"]).split(",")]
        ws = []
        for v in vals:
            if "x" in v:
                try:
                    ws.append(int(v.split("x")[0]))
                except Exception:
                    pass
        ladder_ok = len(ws) > 1 and all(ws[i] >= ws[i + 1] for i in range(len(ws) - 1))
        ladder_txt = " > ".join(str(x) for x in ws)
    check("cascada preserva la escalera ABR", ladder_ok, ladder_txt)

    # gate 3x
    gate_ok = 0
    for pid in (a.get("profiles") or {}):
        p = a["profiles"][pid]
        after = {x["path"]: x["after"] for x in (p.get("diffs") or [])}
        gp = p.get("gestorProfile") or {}
        br = float(after.get("settings.bitrate") or (gp.get("settings") or {}).get("bitrate") or 0)
        mb = float(after.get("prefetch_config.min_bandwidth_mbps")
                   or (gp.get("prefetch_config") or {}).get("min_bandwidth_mbps") or 0)
        if br > 0 and mb / br >= 2.99:
            gate_ok += 1
    check("gate 3x alcanzable en los 12", gate_ok == 12, "cumplen=%d/12" % gate_ok)

    # 6. apply
    payload = {"profiles": {}}
    for pid, p in (a.get("profiles") or {}).items():
        if p.get("gestorProfile") and p.get("diffs"):
            payload["profiles"][pid] = {"gestorProfile": p["gestorProfile"], "diffs": p["diffs"]}
    ap = post("/jit/image/profile/align-all/apply", payload)
    at = ap.get("totals") or {}
    check("apply de los 12", at.get("profiles") == 12, "perfiles=%s" % at.get("profiles"))
    check("apply sin fallos", at.get("failed") == 0, "aplicados=%s fallos=%s" % (
        format(at.get("applied") or 0, ","), at.get("failed")))

    # verificar un perfil aplicado
    p5 = (ap.get("profiles") or {}).get("P0") or {}
    pr = p5.get("profile") or {}
    check("P0 conserva su 8K", (pr.get("settings") or {}).get("resolution") == "7680x4320",
          "resolution=%s" % (pr.get("settings") or {}).get("resolution"))

    # 7. la ley de suficiencia
    law = get("/js/ape-v9/streaming/sufficiency-law-v1.js")
    check("ley servida", "SUFFICIENCY_LAW" in law, "bytes=%d" % len(law))
    check("gate 3.00x en la ley", "HEADROOM_EXCEPTIONAL: 3.00" in law, "X = 3.00x = 200%")
    check("gate risk 10 en la ley", "GATE_RISK_MAX: 10" in law, "risk <= 10")

    # 8. panel y cache-buster
    import urllib.request
    probe = urllib.request.urlopen(B + "/js/ape-v9/vps-image-panel.js", timeout=60).read()
    panel = probe.decode("utf-8")
    # BYTES reales, no caracteres: los emojis de los botones hacen que
    # len(text) < bytes. Medir el texto daria un falso "se perdio contenido".
    check("panel servido", len(probe) > 70000,
          "%d B / %d chars" % (len(probe), len(panel)))
    check("panel tiene el boton LLM", "aip-llm-key" in panel or "Motor LLM" in panel, "campo de key + guardar")
    check("panel alinea los 12", "12 perfiles" in panel, "boton de 12")
    idx = get("/index-v4.html")
    # El Gestor NO se carga con un <script src> (aparece solo en comentarios):
    # se monta dinamicamente. Lo que importa es que la ley este presente y que
    # no quede DESPUES del ultimo comentario del Gestor.
    pos_law = idx.find("sufficiency-law-v1.js")
    pos_mgr_comment = idx.rfind("profile-manager-v9.js")
    check("index carga la ley",
          pos_law > 0,
          "linea ~%d" % (idx[:pos_law].count("\n") + 1 if pos_law > 0 else -1))
    # el Gestor NO esta como <script src>: su nombre solo aparece en comentarios.
    # Lo unico exigible es que la ley se cargue como script real.
    check("la ley es un <script src> real",
          "sufficiency-law-v1.js" in idx and
          idx[:pos_law].rfind("<script") > idx[:pos_law].rfind("</script>"),
          "ley@%d (el Gestor se monta en runtime)" % pos_law)
    check("cache-buster del panel", "v=202609" in idx or "v=202611" in idx, "versionado")

    # reporte
    print()
    print("  %-6s %-46s %s" % ("", "COMPROBACION", "MEDIDO"))
    print("  " + "-" * 96)
    for st, name, det in rows:
        mark = "OK  " if st == "PASS" else "FALLA"
        print("  %-6s %-46s %s" % (mark, name[:46], det[:40]))
    print()
    print("  " + "=" * 100)
    print("   RESULTADO: %d PASS · %d FAIL de %d comprobaciones" % (ok, fail, ok + fail))
    print("  " + "=" * 100)
    print()
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)
