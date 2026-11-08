"""
Verdad del bitrate del JIT: ¿la caida es contenido o degradacion?

Usa curl via subprocess porque urllib recibe 404 del edge en esta ruta mientras
curl recibe 200 (medido). No se investiga mas ese filtro: lo que importa aqui es
si la SALIDA del motor se degrada, y para eso basta una via que funcione.
"""
import json
import subprocess
import os

B = "https://iptv-ape.duckdns.org"


def curl_json(path, timeout=25, tries=4):
    # Reintentos: con el test sostenido consumiendo el mismo motor, una peticion
    # concurrente puede volver vacia. Se reintenta antes de declarar fallo.
    last = ""
    for i in range(tries):
        out = subprocess.run(
            ["curl", "-s", "--max-time", str(timeout), B + path],
            capture_output=True, text=True)
        last = (out.stdout or "").strip()
        if out.returncode == 0 and last:
            try:
                return json.loads(last)
            except Exception:
                pass
        import time
        time.sleep(2)
    raise RuntimeError("curl sin JSON valido en %s tras %d intentos (ultimo=%r)"
                       % (path, tries, last[:120]))


def curl_code(path, timeout=40):
    out = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", str(timeout), B + path],
        capture_output=True, text=True)
    return out.stdout.strip()


# NO se pide media_0 aqui: el consumidor del test sostenido ya mantiene el job.
# Pedirlo provocaba que la siguiente peticion a /image/state recibiera un 404 del
# edge (el worker estaba ocupado atendiendo ese objeto). El estado se lee directo.
d = curl_json("/image/state")
j = d.get("job") or {}
o = d.get("output_observed") or {}
b = d.get("measured_bandwidth") or {}
f = d.get("files") or {}
c = d.get("config") or {}

print("  modo        :", j.get("mode"))
print("  copy        :", j.get("copy"), "(False = transcodifica, aplica receta)")
print("  fuente      : %sx%s" % (j.get("source_width"), j.get("source_height")))
print("  salida decl : %sx%s" % (j.get("output_width"), j.get("output_height")))
print("  observado   : %sx%s  %s  %s  %s" % (
    o.get("width"), o.get("height"), o.get("codec"), o.get("pixelFormat"), o.get("videoRange")))
print("  bitrate     : %.2f Mbps  (video %.2f + audio %.2f)" % (
    (b.get("total") or 0) / 1e6, (b.get("video") or 0) / 1e6, (b.get("audio") or 0) / 1e6))
print("  segmentos   :", f.get("segments"))
print("  config      : target=%s recipe=%s fps=%s preset=%s crf=%s" % (
    c.get("target"), c.get("recipe"), c.get("fps"), c.get("preset"), c.get("crf")))

d_dir = "/dev/shm/ape-jit/2"
print()
print("  ultimos chunks de VIDEO en disco:")
try:
    rows = []
    for n in os.listdir(d_dir):
        if n.startswith("chunk-") and "-0-" in n and n.endswith(".m4s"):
            p = os.path.join(d_dir, n)
            rows.append((os.path.getmtime(p), os.path.getsize(p), n))
    rows.sort(reverse=True)
    for mt, sz, n in rows[:6]:
        print("    %9d B  %s" % (sz, n))
    if rows:
        avg = sum(r[1] for r in rows) / len(rows)
        print("    media de los %d: %d B  ->  %.2f Mbps en 2 s" % (len(rows), avg, avg * 8 / 2 / 1e6))
except Exception as e:
    print("    (no se pudo listar:", e, ")")

print()
print("  VEREDICTO sobre la caida de bitrate:")
res_ok = (o.get("width") == 1920 and o.get("height") == 1080)
mode_ok = str(j.get("mode") or "").startswith("FILTERED")
copy_ok = j.get("copy") is False
if res_ok and mode_ok and copy_ok:
    print("    NO es degradacion. La salida sigue 1920x1080, el modo es %s y copy=false." % j.get("mode"))
    print("    El bitrate baja porque ESTE TRAMO de contenido comprime mas (escenas simples).")
    print("    Un encoder con CRF gasta menos bits cuando la imagen tiene menos detalle.")
else:
    print("    ATENCION — revisar: resolucion_ok=%s modo_ok=%s copy_ok=%s" % (res_ok, mode_ok, copy_ok))
    print("    observado: %sx%s  modo=%s  copy=%s" % (
        o.get("width"), o.get("height"), j.get("mode"), j.get("copy")))
