#!/usr/bin/env bash
# ape-visual-emulate.sh <session-id> — canary visual 4K de UN canal (FASE 1).
#
# GATE: no arranca sin `ara-skill check --for-canary` (además del ExecStartPre
# del unit). Salida aislada en /var/lib/ara/canary/<id>/; NO toca /lists/,
# /sync, /ara ni el catálogo global.
#
# Cadena (orden exacto): deblock → dering → yuv444p → Lanczos(3840x2160)
#   → grain → unsharp → eq → yuv420p
# `dering` no existe en ffmpeg 6.1 Ubuntu: se implementa con smartblur
# (edge-aware) y se declara como limitación; no se finge el filtro literal.
#
# Límites reales: 5 fps muestreados (no vivo 25/30), CPUQuota=40%, MemoryMax=1G,
# RuntimeMaxSec=300. Si no hay 4K o falla la cadena => exit != 0 (FAIL honesto).
set -euo pipefail

SESSION="${1:-}"
[ -n "$SESSION" ] || { echo "uso: $0 <session-id>" >&2; exit 2; }
[[ "$SESSION" =~ ^[A-Za-z0-9._-]{1,32}$ ]] || { echo "session-id inválido" >&2; exit 2; }
START_TS="$(date +%s)"

source /etc/ara/canary/env.common 2>/dev/null || true
SOURCE="${CANARY_SOURCE_URL:-}"
OUT="${CANARY_OUT_DIR:-/var/lib/ara/canary/$SESSION}"
SECONDS_OUT="${CANARY_SECONDS:-6}"
FPS="${CANARY_FPS:-5}"
TIMEOUT="${CANARY_TIMEOUT:-300}"

[ -n "$SOURCE" ] || { echo "CANARY_FAIL: falta CANARY_SOURCE_URL" >&2; exit 3; }
case "$SOURCE" in
  http://*|https://*) ;;
  *) echo "CANARY_FAIL: source no http(s)" >&2; exit 3 ;;
esac
[[ "$SOURCE" != *[[:space:]]* ]] || { echo "CANARY_FAIL: source con espacios" >&2; exit 3; }

# Gate obligatorio: si falta cualquier skill, NO se arranca.
/usr/local/bin/ara-skill check --for-canary >/dev/null || {
  echo "CANARY_FAIL: ara-skill check --for-canary" >&2
  exit 78
}
CGROUP="$(awk -F: '$1==0{print $3}' /proc/self/cgroup 2>/dev/null | head -1)"
START_USAGE="$(awk '/usage_usec/{print $2}' "/sys/fs/cgroup${CGROUP}/cpu.stat" 2>/dev/null || echo 0)"

mkdir -p "$OUT"
chmod 0750 "$OUT" 2>/dev/null || true
rm -f "$OUT"/*.ts "$OUT"/*.m3u8 2>/dev/null || true
umask 027

# BUCLE CERRADO: el canary MIDE la senal, la REPORTA al JIT y EJECUTA la cadena
# que el JIT devuelve segun su tabla de reglas ENTRADA -> SALIDA. Si el JIT no
# responde se usa la cadena legacy Y SE DECLARA: no se finge haber validado.
MODO="CANARY-LEGACY"
FILTERS=""
REGLA="-" ; PAYLOAD="" ; RESP=""
SIG=""
if command -v ffprobe >/dev/null 2>&1; then
  SIG="$(timeout 30 ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate,codec_name,field_order,bit_rate,color_transfer -of json "$SOURCE" 2>/dev/null || true)"
fi
if [ -n "$SIG" ]; then
  PAYLOAD="$(printf '%s' "$SIG" | CH="$SESSION" python3 -c 'import json,os,sys
try:
    st=(json.load(sys.stdin).get("streams") or [{}])[0]
except Exception:
    sys.exit(1)
w=int(st.get("width") or 0); h=int(st.get("height") or 0)
if not w or not h: sys.exit(1)
fr=str(st.get("avg_frame_rate") or "0/1")
try:
    n,d=fr.split("/"); fps=round(float(n)/float(d)) if float(d) else 0
except Exception:
    fps=0
fo=str(st.get("field_order") or "").lower()
ct=st.get("color_transfer")
br=st.get("bit_rate")
try: bk=round(float(br)/1000) if br else None
except Exception: bk=None
print(json.dumps({"channel":os.environ.get("CH",""),"width":w,"height":h,"fps":fps,"codec":st.get("codec_name"),"bitrate_kbps":bk,"interlaced":fo not in ("","progressive","unknown"),"color":{"transfer":ct,"unknown":not bool(ct)}}))' 2>/dev/null || true)"
fi
if [ -n "$PAYLOAD" ]; then
  RESP="$(curl -s --max-time 8 -X POST -H 'Content-Type: application/json' -d "$PAYLOAD" http://127.0.0.1:3099/jit/signal 2>/dev/null || true)"
fi
if [ -n "$RESP" ]; then
  FILTERS="$(printf '%s' "$RESP" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(0)
if d.get("ok") and d.get("chain_4k_test"):
    sys.stdout.write(d["chain_4k_test"])' 2>/dev/null || true)"
  REGLA="$(printf '%s' "$RESP" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(0)
sys.stdout.write("%s|%s|%s" % (d.get("rule_id") or "-", d.get("band") or "-", "exacta" if d.get("rule_exact") else "declarada"))' 2>/dev/null || true)"
fi
if [ -n "$FILTERS" ]; then
  MODO="JIT-REGLA ($REGLA)"
else
  DERING="smartblur=lr=1.5:ls=-0.5"
  FILTERS="deblock,${DERING},format=yuv444p,scale=3840:2160:flags=lanczos,noise=alls=8:allf=t,unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.05:brightness=0.02:saturation=1.05,format=yuv420p"
  MODO="CANARY-LEGACY (sin /jit/signal: NO se valido la regla real, se declara)"
fi

echo "canary session=$SESSION fps=$FPS seconds=$SECONDS_OUT modo=$MODO"
echo "canary filtros=$FILTERS"
timeout "$TIMEOUT" ffmpeg -hide_banner -nostdin -loglevel error \
  -i "$SOURCE" \
  -t "$SECONDS_OUT" -r "$FPS" -an \
  -vf "$FILTERS" \
  -c:v libx265 -preset ultrafast -tune zerolatency \
  -x265-params pools=1:frame-threads=1:keyint=48:min-keyint=48:scenecut=0:bframes=0:rc-lookahead=0 \
  -b:v 25M -maxrate 32M -bufsize 64M \
  -g 48 -keyint_min 48 -sc_threshold 0 \
  -f hls -hls_time 3 -hls_list_size 20 \
  -hls_flags independent_segments+delete_segments \
  "$OUT/out.m3u8" || { echo "CANARY_FAIL: ffmpeg" >&2; exit 4; }

SEG="$(ls -1t "$OUT"/*.ts 2>/dev/null | head -1 || true)"
[ -n "$SEG" ] || { echo "CANARY_FAIL: sin segmento" >&2; exit 5; }
WH="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$SEG" 2>/dev/null | head -1)"
[ "$WH" = "3840x2160" ] || { echo "CANARY_FAIL: segmento ${WH:-?} != 3840x2160" >&2; exit 6; }

END_TS="$(date +%s)"
WALL="$((END_TS - START_TS))"
END_USAGE="$(awk '/usage_usec/{print $2}' "/sys/fs/cgroup${CGROUP}/cpu.stat" 2>/dev/null || echo 0)"
USAGE="$((END_USAGE - START_USAGE))"
CPU_PCT="$(awk -v u="${USAGE:-0}" -v w="$WALL" 'BEGIN{if (w>0) printf "%.2f", u/10000.0/w; else printf "null"}')"
printf '{"session":"%s","segment":"%s","width":3840,"height":2160,"fps":%s,"seconds":%s,"cpu_seconds":%.2f,"wall_seconds":%s,"cpu_pct_avg":%s,"filters":"deblock,dering(smartblur),yuv444p,lanczos,grain,unsharp,eq,yuv420p"}\n' \
  "$SESSION" "$(basename "$SEG")" "$FPS" "$SECONDS_OUT" "$(awk -v u="${USAGE:-0}" 'BEGIN{printf "%.2f", u/1000000}')" "$WALL" "$CPU_PCT" > "$OUT/status.json"
# Declarar en el recibo QUE se valido: sin esto no se puede auditar si la prueba
# corrio la regla del JIT o la cadena legacy.
SES="$SESSION" MODE="$MODO" FLT="$FILTERS" OUTF="$OUT/status.json" python3 -c 'import json,os
p=os.environ["OUTF"]
try:
    d=json.load(open(p))
except Exception:
    d={}
d["mode"]=os.environ.get("MODE","")
d["filters"]=os.environ.get("FLT","")
d["validates"]=("jit_rule" if str(d.get("mode","")).startswith("JIT-REGLA") else "canary_legacy")
json.dump(d, open(p,"w"), indent=2)' 2>/dev/null || true
echo "CANARY_OK: $SEG 3840x2160 fps=$FPS cpu_pct=${CPU_PCT}% wall=${WALL}s"
exit 0
