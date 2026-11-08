#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# ape-image — control del MÓDULO DE IMAGEN del JIT por SSH
#
# La UI de IPTV Navigator usa HTTP (/jit/image/*). Este CLI hace lo mismo desde
# una sesión SSH, para operar sin navegador y para verificar en el propio host.
#
# Uso:
#   bash ape-image.sh get                      # config efectiva
#   bash ape-image.sh state                    # estado VIVO del motor
#   bash ape-image.sh cap                      # capacidad medida + veredicto
#   bash ape-image.sh rec                      # aplicar la RECOMENDADA (FHD 25fps balanced)
#   bash ape-image.sh off                      # volver a defaults (source / none)
#   bash ape-image.sh set target=FHD_1080 recipe=balanced fps=25 preset=ultrafast crf=20
#   bash ape-image.sh set recipe=temporal target=QHD_1440
#   bash ape-image.sh set hqdn3d.luma_spatial=1.2 unsharp.luma_amount=0.4
#
# Parámetros aceptados en `set` (clave=valor, separados por espacios):
#   target   source|FHD_1080|QHD_1440|UHD_4K|DCI_2K
#   recipe   none|light|balanced|temporal|custom
#   fps      preserve|25|30|50|60
#   preset   ultrafast|superfast|veryfast|faster|fast|medium
#   codec    libx265|libx264|libsvtav1
#   crf      0..51
#   audio    preserve|aac|drop
#   seg_duration, window_size, extra_window_size, gop_seconds
#   hqdn3d.luma_spatial, hqdn3d.chroma_spatial, hqdn3d.luma_tmp, hqdn3d.chroma_tmp
#   unsharp.luma_amount, unsharp.luma_msize
#   atadenoise.s
# ═══════════════════════════════════════════════════════════════════════════

B="${APE_JIT_BASE:-https://iptv-ape.duckdns.org}"
API="$B/jit"

die() { echo "ERROR: $*" >&2; exit 1; }

need_curl() { command -v curl >/dev/null 2>&1 || die "curl no disponible"; }

jget() {  # jget <ruta> -> JSON crudo (con reintentos)
  local path="$1" i
  for i in 1 2 3 4; do
    local out
    out=$(curl -s --max-time 25 "$API$path" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s' "$out"; return 0; fi
    sleep 1
  done
  die "sin respuesta de $API$path"
}

# convierte las claves anidadas (hqdn3d.luma_spatial=1.2) a JSON
kv_to_json() {
  python3 - "$@" <<'PY'
import json, sys
out = {}
for arg in sys.argv[1:]:
    if "=" not in arg:
        sys.stderr.write("ignorado (sin '='): %s\n" % arg)
        continue
    k, v = arg.split("=", 1)
    if k.startswith(("target","recipe","fps","preset","codec","audio")):
        out[k] = v
    elif k in ("crf","seg_duration","window_size","extra_window_size","gop_seconds","x265_threads"):
        try: out[k] = int(v)
        except ValueError: out[k] = v
    elif "." in k:
        parent, child = k.split(".", 1)
        out.setdefault(parent, {})[child] = float(v)
    else:
        out[k] = v
print(json.dumps(out))
PY
}

post() {  # post <json>
  curl -s --max-time 30 -X POST -H 'Content-Type: application/json' -d "$1" "$API/image/config"
}

pretty() {
  if command -v python3 >/dev/null 2>&1; then python3 -m json.tool 2>/dev/null || cat; else cat; fi
}

cmd="${1:-get}"
shift || true

need_curl

case "$cmd" in
  get)
    jget "/image/config" | pretty
    ;;
  state)
    jget "/image/state" | python3 -c '
import json,sys
d=json.load(sys.stdin)
j=d.get("job") or {}
o=d.get("output_observed") or {}
b=d.get("measured_bandwidth") or {}
c=d.get("config") or {}
e=d.get("engine") or {}
f=d.get("files") or {}
if j:
    print("  trabajo    : canal=%s variante=%s pid=%s edad=%ss" % (j.get("channel"),j.get("variant"),j.get("pid"),j.get("age_s")))
    print("  modo       : %s   copy=%s %s" % (j.get("mode"), j.get("copy"), "(transcodifica)" if j.get("copy") is False else "(copia sin filtrar)"))
    print("  fuente     : %sx%s" % (j.get("source_width"), j.get("source_height")))
    print("  salida     : %sx%s (declarada)" % (j.get("output_width"), j.get("output_height")))
    if o:
        print("  observado  : %sx%s %s %s %s" % (o.get("width"),o.get("height"),o.get("codec"),o.get("pixelFormat"),o.get("videoRange")))
    if b:
        print("  bitrate    : %.2f Mbps (video %.2f + audio %.2f) en %ss" % (
            (b.get("total") or 0)/1e6,(b.get("video") or 0)/1e6,(b.get("audio") or 0)/1e6,b.get("window_s")))
    print("  ficheros   : %s segmentos" % f.get("segments"))
else:
    # idle_stop_s vive en config, no en engine. Si falta se declara NO COMPUTADO.
    idle = c.get("idle_stop_s")
    if idle in (None, "?", 0):
        print("  sin trabajo activo (IDLE_MS no reportado por el motor: NO COMPUTADO)")
    else:
        print("  sin trabajo activo (el motor apaga ffmpeg tras %ss sin peticiones)" % idle)
print("  config     : target=%s recipe=%s fps=%s codec=%s preset=%s crf=%s audio=%s" % (
    c.get("target"),c.get("recipe"),c.get("fps"),c.get("codec"),c.get("preset"),c.get("crf"),c.get("audio")))
print("  filtro     : %s" % (d.get("effective_filter") or "(sin filtros)"))
print("  motor      : domain=%s rea_executed=%s slot=%s" % (e.get("processing_domain"),e.get("rea_executed"),e.get("slot")))
'
    ;;
  cap)
    jget "/image/capacity" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  host: %s   margen exigido: %sx" % (d.get("host"), d.get("margin_required")))
print("  %-10s %-5s %-9s %8s %10s  %s" % ("destino","fps","receta","20s->","ritmo",""))
for r in d.get("rows",[]):
    v = r.get("realtime_ratio")
    tag = "VIABLE" if v and v >= 1.2 else ("AL LIMITE" if v and v >= 1.0 else "NO VIABLE")
    print("  %-10s %-5s %-9s %8ss %9sx  %s" % (r.get("target"),r.get("fps"),r.get("recipe"),r.get("seconds_for_20s"),v,tag))
print()
print("  %s" % d.get("verdict"))
'
    ;;
  rec)
    post '{"target":"FHD_1080","recipe":"balanced","fps":"25","preset":"ultrafast","crf":20,"audio":"preserve"}' | pretty
    ;;
  off)
    post '{"target":"source","recipe":"none","fps":"preserve"}' | pretty
    ;;
  set)
    [ $# -eq 0 ] && die "set necesita al menos un clave=valor"
    JSON=$(kv_to_json "$@") || die "no se pudo construir el JSON"
    echo "  enviando: $JSON"
    post "$JSON" | pretty
    ;;
  *)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
