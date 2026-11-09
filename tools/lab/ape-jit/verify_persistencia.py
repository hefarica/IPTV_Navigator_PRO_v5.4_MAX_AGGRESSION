#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ciclo de persistencia del Gestor: guardar -> reiniciar -> verificar -> restaurar.
No cambia la semantica de ningun perfil: guarda el estado actual tal cual."""
import json
import subprocess

B = "https://iptv-ape.duckdns.org/jit"


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


def get(path):
    o = subprocess.run(["curl", "-s", "--max-time", "90", B + path], capture_output=True, text=True)
    try:
        return json.loads(o.stdout)
    except ValueError:
        return {"_raw": o.stdout[:300]}


def post(path, obj, timeout="120"):
    import tempfile, os
    fd, tmp = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False)
    o = subprocess.run(
        ["curl", "-s", "--max-time", timeout, "-X", "POST",
         "-H", "Content-Type: application/json", "--data-binary", "@" + tmp, B + path],
        capture_output=True, text=True)
    os.unlink(tmp)
    try:
        return json.loads(o.stdout)
    except ValueError:
        return {"_raw": o.stdout[:400]}


print("=" * 68)
print("  1. ESTADO ANTES")
s0 = get("/image/gestor/state")
st = s0.get("state") or {}
print("     fuente      : %s" % st.get("source"))
print("     perfiles    : %s" % st.get("profiles"))
print("     campos      : %s" % st.get("fields"))
print("     bytes       : %s" % st.get("bytes"))
print("     backups     : %s" % st.get("backups"))
print("     journal     : %s" % st.get("journalEvents"))

print()
print("=" * 68)
print("  2. GUARDADO EXPLICITO (mismos perfiles, sin cambio semantico)")
profs = {}
g = get("/image/gestor/profiles")
for row in (g.get("profiles") or []):
    pid = row["id"]
    full = get("/image/gestor/profile/" + pid)
    if full.get("profile"):
        profs[pid] = full["profile"]
print("     perfiles enviados: %d" % len(profs))
r = post("/image/gestor/save", {"profiles": profs, "by": "test-persistencia",
                                "note": "round-trip de persistencia"})
print("     ok          : %s" % r.get("ok"))
print("     guardado en : %s" % r.get("savedAt"))
print("     bytes       : %s" % r.get("bytes"))
print("     backup      : %s" % (str(r.get("backup") or "").split("/")[-1]))
print("     espejo      : %s" % r.get("mirrored"))
if r.get("journal"):
    print("     journal     : %s" % json.dumps(r["journal"], ensure_ascii=False)[:150])

print()
print("=" * 68)
print("  3. ESTADO DESPUES DE GUARDAR")
s1 = get("/image/gestor/state")
st1 = s1.get("state") or {}
print("     fuente      : %s" % st1.get("source"))
print("     guardado    : %s" % st1.get("savedAt"))
print("     por         : %s" % st1.get("savedBy"))
print("     perfiles    : %s" % st1.get("profiles"))
print("     campos      : %s" % st1.get("fields"))
print("     bytes       : %s" % st1.get("bytes"))
print("     sha256      : %s..." % str(st1.get("sha256"))[:24])
print("     backups     : %s" % st1.get("backups"))
print("     journal     : %s" % st1.get("journalEvents"))

sha_antes = st1.get("sha256")

print()
print("=" * 68)
print("  4. REINICIO DEL SERVICIO")
print("     %s" % sh("systemctl restart ape-jit && sleep 5 && systemctl is-active ape-jit").strip())

print()
print("=" * 68)
print("  5. ESTADO TRAS REINICIO (la persistencia debe sobrevivir)")
s2 = get("/image/gestor/state")
st2 = s2.get("state") or {}
print("     fuente      : %s" % st2.get("source"))
print("     guardado    : %s" % st2.get("savedAt"))
print("     perfiles    : %s" % st2.get("profiles"))
print("     campos      : %s" % st2.get("fields"))
print("     sha256      : %s..." % str(st2.get("sha256"))[:24])
print("     sha igual?  : %s" % (st2.get("sha256") == sha_antes))

print()
print("     el motor LEE el store despues de reiniciar?")
for pid in ("P0", "P5"):
    f = get("/image/profile/%s/full?player=onn-4k&w=1280&h=720" % pid)
    L = f.get("load") or {}
    print("       %-3s -> %sx%s codec=%s source=%s" %
          (pid, L.get("outW"), L.get("outH"), L.get("codec"), L.get("source")))

print()
print("=" * 68)
print("  6. BACKUPS DISPONIBLES")
bk = get("/image/gestor/backups")
print("     dir: %s" % bk.get("dir"))
for b in (bk.get("backups") or [])[:5]:
    print("       %-34s %8s B  %s" % (b["name"], b["bytes"], b["at"]))

print()
print("=" * 68)
print("  7. JOURNAL")
jj = get("/image/gestor/journal?limit=6")
print("     eventos totales: %s" % jj.get("total"))
for e in (jj.get("events") or []):
    print("       %-14s %-22s ok=%s" % (e.get("event"), str(e.get("by"))[:22], e.get("ok", e.get("verify"))))

print()
print("=" * 68)
print("  8. PROPUESTAS DEL LLM PENDIENTES (no se pierden)")
pd = get("/image/gestor/pending")
print("     dir: %s" % pd.get("dir"))
print("     cuenta: %s" % pd.get("count"))
for p in (pd.get("pending") or [])[:6]:
    print("       %-10s %8s B  %s" % (p["profile"], p["bytes"], p["at"]))

print()
print("=" * 68)
print("  9. RESTAURAR EL ORIGINAL DESDE EL BACKUP")
orig = None
for b in (bk.get("backups") or []):
    if b["name"].startswith("json-original-"):
        orig = b["name"]
        break
if orig:
    rr = post("/image/gestor/restore", {"name": orig})
    print("     restaurado de: %s" % orig)
    print("     ok           : %s" % rr.get("ok"))
    s3 = get("/image/gestor/state")
    st3 = s3.get("state") or {}
    print("     perfiles     : %s" % st3.get("profiles"))
    print("     campos       : %s" % st3.get("fields"))
    print("     igual al inicio? %s" % (st3.get("fields") == st.get("fields")))
else:
    print("     no hay backup json-original-* (primera vez)")

print()
print("=" * 68)
print("  FIN")
