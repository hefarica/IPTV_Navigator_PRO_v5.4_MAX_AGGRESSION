#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# APE CACHE-FIRST — banco de concurrencia REAL (50 clientes × 60 s)
# ═════════════════════════════════════════════════════════════════════════════
# Qué mide (criterios del contrato t46):
#   1. COALESCING        50 clientes pidiendo el MISMO segmento frío ⇒ 1 sola
#                        petición al origen (se cuenta EN EL ORIGEN, no en un stub)
#   2. CACHE HIT RATIO   tras warmup, contado desde $upstream_cache_status real
#   3. STALE              origen en 500 ⇒ el cliente recibe el segmento cacheado,
#                        y el origen se revalida en background
#   4. FAILOVER          502 en host1 ⇒ 200 desde host2; 403 en host1 ⇒ 403 al
#                        cliente (NO se reintenta: auth no es red)
#   5. PREFETCH + GAP    p95 de latencia de segmento y p95 del gap entre segmentos
#   6. AUTOPISTA         0 ngx.exit(503) en la ruta · 0 circuit breaker
#   7. CERO TRANSCODE    assert: si aparece ffmpeg/transcode en la config del edge,
#                        el banco FALLA (exit 1)
#
# CÓMO consigue un nginx de verdad sin root y sin tocar el VPS:
#   extrae los .deb de Ubuntu con `dpkg-deb -x` (sin instalar nada) y ejecuta el
#   binario con un prefijo en /tmp y puerto alto. Módulo ngx_http_lua incluido.
#
# ALCANCE / HONESTIDAD
#   · Corre en un sandbox local (WSL). NO despliega, NO toca el VPS.
#   · `nginx -t` del binario LOCAL sí se ejecuta y se reporta. El `nginx -t` del
#     VPS de producción sigue siendo [UNKNOWN]: no se ha tocado.
#
# USO
#   bash _vps_stage/tests/cache_first_bench.sh [-d SEGUNDOS] [-c CLIENTES] [--keep]
#   Variables: APE_NGX_BIN (binario nginx), APE_LUA_DIR (módulos del repo)
# ═════════════════════════════════════════════════════════════════════════════

set -uo pipefail

DURATION="${MF_DURATION:-60}"
CLIENTS="${MF_CLIENTS:-50}"
EDGE_PORT="${MF_EDGE_PORT:-18088}"
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    -d) DURATION="$2"; shift 2 ;;
    -c) CLIENTS="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "arg desconocido: $1" >&2; exit 2 ;;
  esac
done

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE_DIR="$(cd "$SELF_DIR/.." && pwd)"
NGINX_DIR="$STAGE_DIR/nginx"
LUA_DIR="${APE_LUA_DIR:-$STAGE_DIR/lua}"
CONF_SRC="$NGINX_DIR/cache-first-edge.conf"

W="/tmp/ape_cf"
PASS=0; FAIL=0; WARN=0
c_ok=$'\033[32m'; c_bad=$'\033[31m'; c_warn=$'\033[33m'; c_off=$'\033[0m'
ok()   { PASS=$((PASS+1)); printf '%sPASS%s %s\n' "$c_ok" "$c_off" "$*"; }
bad()  { FAIL=$((FAIL+1)); printf '%sFAIL%s %s\n' "$c_bad" "$c_off" "$*"; }
warn() { WARN=$((WARN+1)); printf '%sWARN%s %s\n' "$c_warn" "$c_off" "$*"; }
say()  { printf '  %s\n' "$*"; }
hr()   { printf '%s\n' "────────────────────────────────────────────────────────────"; }

cleanup() {
  [ -f "$W/nginx-prefix/logs/nginx.pid" ] && kill "$(cat "$W/nginx-prefix/logs/nginx.pid")" 2>/dev/null
  pkill -f "ape_origin.py" 2>/dev/null
  sleep 0.3
  rm -rf /dev/shm/ape_cf 2>/dev/null
  [ "$KEEP" -eq 1 ] || rm -rf "$W"
}
trap cleanup EXIT

hr; echo "APE CACHE-FIRST BENCH · ${CLIENTS} clientes × ${DURATION}s · puerto $EDGE_PORT"; hr

# ─────────────────────────────────────────────────────────────────────────────
# 0. nginx real (sin root)
# ─────────────────────────────────────────────────────────────────────────────
NGX="${APE_NGX_BIN:-/tmp/ngx/usr/sbin/nginx}"
NGX_LIB="/tmp/ngx/usr/lib/x86_64-linux-gnu"
NGX_MOD_DIR="/tmp/ngx/usr/lib/nginx/modules"
NGX_NDK="$NGX_MOD_DIR/ndk_http_module.so"
NGX_MOD="$NGX_MOD_DIR/ngx_http_lua_module.so"

if [ ! -x "$NGX" ]; then
  say "provisionando nginx + ngx_http_lua + ndk + luajit (apt-get download + dpkg-deb -x, SIN root)…"
  mkdir -p /tmp/ngxget && ( cd /tmp/ngxget \
    && apt-get download nginx libnginx-mod-http-lua libnginx-mod-http-ndk libluajit-5.1-2 \
                       lua-resty-core lua-resty-lrucache >/dev/null 2>&1 \
    && for d in *.deb; do dpkg-deb -x "$d" /tmp/ngx; done ) || {
      echo "No se pudo provisionar nginx (sin red o sin apt). Banco no ejecutable." >&2
      exit 3; }
fi
[ -x "$NGX" ] || { echo "nginx no disponible" >&2; exit 3; }
[ -f "$NGX_MOD" ] || { echo "falta ngx_http_lua_module.so" >&2; exit 3; }
export LD_LIBRARY_PATH="$NGX_LIB:${LD_LIBRARY_PATH:-}"
say "nginx: $("$NGX" -v 2>&1)"
say "lua  : $(basename "$NGX_MOD")"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Árbol de trabajo
# ─────────────────────────────────────────────────────────────────────────────
rm -rf "$W"; mkdir -p "$W"/{conf,logs,temp,origin} "$W/cache"
mkdir -p /dev/shm/ape_cf/seg /dev/shm/ape_cf/man
say "cache segmentos: /dev/shm/ape_cf/seg"
say "cache manifests: /dev/shm/ape_cf/man"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Orígenes (3 "hosts" del catálogo) — Python, cuentan peticiones y conexiones
# ─────────────────────────────────────────────────────────────────────────────
cat > "$W/origin/ape_origin.py" <<'PY'
import json, os, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]); NAME = sys.argv[2]
LOCK = threading.Lock()
STATS = {"requests": 0, "conns": 0, "by_path": {}}
MODE = {"code": 200}
WINDOW = {"base": 0}

SEG = b"X" * 65536  # 64 KiB por segmento

def manifest():
    b = WINDOW["base"]
    out = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:6",
           "#EXT-X-MEDIA-SEQUENCE:%d" % b]
    for i in range(6):
        out.append("#EXTINF:6.000,")
        out.append("seg%d.ts" % (b + i))
    return ("\n".join(out) + "\n").encode()

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def setup(self):
        super().setup()
        with LOCK: STATS["conns"] += 1
    def _count(self, p):
        with LOCK:
            STATS["requests"] += 1
            STATS["by_path"][p] = STATS["by_path"].get(p, 0) + 1
    def do_GET(self):
        u = urlparse(self.path); p = u.path
        q = parse_qs(u.query)
        if p == "/__ctl":
            code = int(q.get("code", ["200"])[0])
            with LOCK: MODE["code"] = code
            return self._json({"mode": code})
        if p == "/__stats":
            with LOCK: d = dict(STATS); d["by_path"] = dict(STATS["by_path"])
            return self._json(d)
        if p == "/__reset":
            with LOCK:
                STATS["requests"] = 0; STATS["conns"] = 0; STATS["by_path"] = {}
            return self._json({"reset": 1})
        if p == "/__advance":
            with LOCK: WINDOW["base"] += 1
            return self._json({"base": WINDOW["base"]})

        self._count(p)
        with LOCK: code = MODE["code"]
        if code != 200:
            body = b'{"err":%d}' % code
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body); return

        if p.endswith("index.m3u8"):
            body = manifest(); ctype = "application/vnd.apple.mpegurl"
        elif p.endswith(".ts") or p.endswith(".m4s"):
            body = SEG; ctype = "video/mp2t"
        else:
            body = b"ok"; ctype = "text/plain"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "max-age=2")
        self.end_headers(); self.wfile.write(body)
    def _json(self, o):
        b = json.dumps(o).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)

ThreadingHTTPServer.daemon_threads = True
ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
PY

ORIGIN_PORTS="19101 19102 19103"
i=0
for p in $ORIGIN_PORTS; do
  i=$((i+1))
  nohup python3 "$W/origin/ape_origin.py" "$p" "host$i" >/dev/null 2>&1 &
done
sleep 1.2
for p in $ORIGIN_PORTS; do
  curl -s -o /dev/null "http://127.0.0.1:$p/__stats" || { echo "origen $p no responde" >&2; exit 3; }
done
say "orígenes: 127.0.0.1:{19101,19102,19103} OK"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Config nginx: el ARTEFACTO REAL del repo, con rutas sustituidas
# ─────────────────────────────────────────────────────────────────────────────
[ -f "$CONF_SRC" ] || { echo "falta $CONF_SRC" >&2; exit 3; }

sed -e "s#__CACHE_SEG__#/dev/shm/ape_cf/seg#g" \
    -e "s#__CACHE_MAN__#/dev/shm/ape_cf/man#g" \
    -e "s#__ORIGIN_1__#127.0.0.1:19101#g" \
    -e "s#__ORIGIN_2__#127.0.0.1:19102#g" \
    -e "s#__ORIGIN_3__#127.0.0.1:19103#g" \
    -e "s#__EDGE_PORT__#$EDGE_PORT#g" \
    -e "s#__LOG_DIR__#$W/logs#g" \
    -e "s#/etc/nginx/lua/#$LUA_DIR/#g" \
    "$CONF_SRC" > "$W/conf/edge.conf"

cat > "$W/conf/mime.types" <<'MT'
types {
    text/plain      txt;
    application/vnd.apple.mpegurl m3u8;
    video/mp2t      ts;
    video/mp4       m4s mp4;
    application/octet-stream bin;
}
MT

cat > "$W/conf/nginx.conf" <<EOF
worker_processes 2;
daemon on;
pid $W/nginx-prefix/logs/nginx.pid;
error_log $W/logs/error.log warn;
load_module $NGX_NDK;
load_module $NGX_MOD;
events { worker_connections 4096; }
http {
    include $W/conf/mime.types;
    default_type application/octet-stream;
    access_log off;
    client_body_temp_path $W/temp/body;
    proxy_temp_path       $W/temp/proxy;
    fastcgi_temp_path     $W/temp/fastcgi;
    uwsgi_temp_path       $W/temp/uwsgi;
    scgi_temp_path        $W/temp/scgi;
    lua_package_path "$LUA_DIR/?.lua;/tmp/ngx/usr/share/lua/5.1/?.lua;;";
    # El paquete de Ubuntu separa lua-resty-core en su propio .deb; se provee
    # vía lua_package_path (arriba), así que no hace falta desactivar nada.
    include $W/conf/edge.conf;
}
EOF
mkdir -p "$W/nginx-prefix/logs"

say "nginx -t (binario LOCAL, no el del VPS)…"
if ! "$NGX" -t -p "$W/nginx-prefix" -c "$W/conf/nginx.conf" 2>"$W/logs/nginxt.log"; then
  sed 's/^/    /' "$W/logs/nginxt.log"
  bad "nginx -t LOCAL falla"
  exit 1
fi
ok "nginx -t LOCAL pasa (VPS = [UNKNOWN], no se ha tocado)"

# ── Assert de CERO TRANSCODE sobre el artefacto real ─────────────────────────
# Se eliminan comentarios antes de buscar: la prosa que documenta "sin ffmpeg"
# no debe hacer fallar el assert (ni pasar por buena una config que sí lo use).
EDGE_CODE=$( { sed 's/#.*//' "$CONF_SRC"
               sed 's/--.*//' "$LUA_DIR/ape_prefetch_next.lua"
               sed 's/--.*//' "$LUA_DIR/ape_edge_health.lua"; } 2>/dev/null )

if printf '%s\n' "$EDGE_CODE" | grep -Eqi 'ffmpeg|transcode|libx264|libx265'; then
  bad "CERO-TRANSCODE: aparece ffmpeg/transcode en el path del edge"
else
  ok "CERO-TRANSCODE: ni ffmpeg ni transcode en la config ni en los módulos del edge"
fi
# ── Assert de autopista: ningún ngx.exit(503) en la ruta ────────────────────
if printf '%s\n' "$EDGE_CODE" | grep -Eq 'ngx\.exit[[:space:]]*\([[:space:]]*503'; then
  bad "AUTOPISTA: hay ngx.exit(503) en la ruta"
else
  ok "AUTOPISTA: 0 ngx.exit(503) en la ruta del edge"
fi
if printf '%s\n' "$EDGE_CODE" | grep -Eqi 'limit_conn|limit_req|circuit'; then
  bad "AUTOPISTA: hay limit_conn/limit_req/circuit breaker en el artefacto"
else
  ok "AUTOPISTA: 0 limit_conn/limit_req/circuit breaker"
fi

"$NGX" -p "$W/nginx-prefix" -c "$W/conf/nginx.conf" || { bad "nginx no arranca"; exit 1; }
for _ in $(seq 1 40); do
  curl -s -o /dev/null "http://127.0.0.1:$EDGE_PORT/ape/health" && break
  sleep 0.15
done
sleep 0.4
curl -s "http://127.0.0.1:$EDGE_PORT/ape/health" > "$W/logs/health.json" 2>/dev/null
say "health: $(head -c 220 "$W/logs/health.json")"
if grep -q '"status":"ok"' "$W/logs/health.json" 2>/dev/null; then
  ok "health endpoint responde JSON válido con status=ok"
else
  bad "health endpoint no devuelve {\"status\":\"ok\"}"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. FASE A — COALESCING: 50 clientes al MISMO segmento frío
# ─────────────────────────────────────────────────────────────────────────────
hr; echo "FASE A · COALESCING ($CLIENTS clientes → 1 petición al origen)"; hr
curl -s "http://127.0.0.1:19101/__reset" >/dev/null
# Nombre NUEVO ⇒ primer acceso es MISS garantizado. NO se precalienta: si se
# precalentara, las 50 peticiones serían HIT y el test no probaría el coalescing.
COLD="seg777.ts"
before=$(curl -s http://127.0.0.1:19101/__stats | python3 -c 'import sys,json;print(json.load(sys.stdin)["by_path"].get("/live/seg777.ts",0))')
# xargs -P ya paraleliza y BLOQUEA hasta terminar: NO se pone en background.
# (un `wait` sin argumentos esperaría también a los 3 orígenes → cuelgue)
seq "$CLIENTS" | xargs -P "$CLIENTS" -I{} curl -s -o /dev/null --max-time 10 "http://127.0.0.1:$EDGE_PORT/live/$COLD"
after=$(curl -s http://127.0.0.1:19101/__stats | python3 -c 'import sys,json;print(json.load(sys.stdin)["by_path"].get("/live/seg777.ts",0))')
origin_hits=$((after - before))
say "peticiones al origen para $COLD durante $CLIENTS peticiones concurrentes: $origin_hits"
if [ "$origin_hits" -le 1 ]; then
  ok "COALESCING: $CLIENTS clientes ⇒ $origin_hits petición(es) al origen"
else
  bad "COALESCING: $CLIENTS clientes ⇒ $origin_hits peticiones al origen (esperado ≤1)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. FASE B — 50 clientes × DURACIÓN (steady state) + métricas
# ─────────────────────────────────────────────────────────────────────────────
hr; echo "FASE B · STEADY STATE (${CLIENTS} clientes × ${DURATION}s)"; hr
: > "$W/logs/access_b.log"
# redirige el access_log del segmento/manifest a un fichero parseable
# (el artefacto usa $LOG_DIR/access.log con log_format ape_cf)
: > "$W/logs/access.log"
curl -s "http://127.0.0.1:19101/__reset" >/dev/null

cat > "$W/origin/ape_client.py" <<'PY'
import json, sys, time, threading, http.client, statistics
EDGE=int(sys.argv[1]); DUR=int(sys.argv[2]); NC=int(sys.argv[3]); OUT=sys.argv[4]
PACE=float(sys.argv[5]); ADV=sys.argv[6].lower()=="1"
res={"lat":[], "gap":[], "gex":[], "err":0, "req":0}
lock=threading.Lock()
stop=time.time()+DUR

def worker(idx):
    lat=[]; gap=[]; gex=[]; err=0; req=0; last_end=None
    c=http.client.HTTPConnection("127.0.0.1", EDGE, timeout=10)
    while time.time()<stop:
        try:
            t0=time.time()
            c.request("GET","/live/index.m3u8")
            r=c.getresponse(); mf=r.read()
            if r.status!=200: err+=1; req+=1; continue
            segs=[l.decode() for l in mf.split(b"\n")
                  if l and not l.startswith(b"#") and (l.endswith(b".ts") or l.endswith(b".m4s"))]
            if not segs: time.sleep(0.2); continue
            seg=segs[-1]
            t1=time.time()
            c.request("GET","/live/"+seg)
            r2=c.getresponse(); b=r2.read()
            t2=time.time()
            req+=1
            if r2.status!=200 or len(b)!=65536: err+=1
            lat.append((t2-t1)*1000.0)
            if last_end is not None:
                g=(t1-last_end)*1000.0
                gap.append(g)
                gex.append(g - PACE*1000.0)   # retraso NETO sobre la cadencia prevista
            last_end=t2
        except Exception:
            err+=1
            try: c.close()
            except Exception: pass
            c=http.client.HTTPConnection("127.0.0.1", EDGE, timeout=10)
        if PACE>0: time.sleep(PACE)
    if ADV:
        try:
            c2=http.client.HTTPConnection("127.0.0.1", EDGE, timeout=5)
        except Exception: pass
    with lock:
        res["lat"].extend(lat); res["gap"].extend(gap); res["gex"].extend(gex)
        res["err"]+=err; res["req"]+=req

th=[threading.Thread(target=worker,args=(i,),daemon=True) for i in range(NC)]
for t in th: t.start()
for t in th: t.join()
def p95(v):
    if not v: return None
    v=sorted(v); k=max(0,int(round(0.95*(len(v)-1)))); return v[k]
out=dict(requests=res["req"], errors=res["err"],
         lat_n=len(res["lat"]), lat_p50=p95 and (sorted(res["lat"])[len(res["lat"])//2] if res["lat"] else None),
         lat_p95=p95(res["lat"]),
         gap_n=len(res["gap"]), gap_p95=p95(res["gap"]),
         gex_n=len(res["gex"]), gex_p95=p95(res["gex"]),
         lat_mean=(statistics.mean(res["lat"]) if res["lat"] else None))
open(OUT,"w").write(json.dumps(out))
print(json.dumps(out))
PY

PACE_MS="${MF_PACE_MS:-500}"
PACE_S=$(python3 -c "print($PACE_MS/1000.0)")
python3 "$W/origin/ape_client.py" "$EDGE_PORT" "$DURATION" "$CLIENTS" "$W/logs/client.json" "$PACE_S" 1 &
CLIENT_PID=$!
# avanza la ventana del manifest para que el borde vivo cambie (ejercita prefetch)
while kill -0 "$CLIENT_PID" 2>/dev/null; do
  curl -s "http://127.0.0.1:19101/__advance" >/dev/null
  sleep 2
done
wait "$CLIENT_PID"
CLIENT_OUT=$(cat "$W/logs/client.json" 2>/dev/null || echo '{}')
say "cliente: $CLIENT_OUT"

# ── Hit ratio desde $upstream_cache_status real ─────────────────────────────
HITR=$(awk '{for(i=1;i<=NF;i++) if($i ~ /^cs=/){s=substr($i,4); c[s]++} }
            END{ t=0; for(k in c) t+=c[k];
                 printf "%.4f %d %d %d %d\n", (t?c["HIT"]/t:0), c["HIT"], c["MISS"], c["STALE"], t }' \
       "$W/logs/access.log" 2>/dev/null)
set -- $HITR; HRATIO="${1:-0}"; HC="${2:-0}"; MC="${3:-0}"; SC="${4:-0}"; TC="${5:-0}"
say "cache: HIT=$HC MISS=$MC STALE=$SC TOTAL=$TC  hit_ratio=$HRATIO"
HITPCT=$(python3 -c "print(round(100*float('$HRATIO'),1))")
if python3 -c "import sys; sys.exit(0 if float('$HRATIO')>=0.80 else 1)"; then
  ok "CACHE: hit ratio ${HITPCT}% ≥ 80% tras warmup"
else
  warn "CACHE: hit ratio ${HITPCT}% < 80% (revisar TTL/espacio de cache)"
fi

# ── Conexiones/peticiones upstream por segmento ─────────────────────────────
UPSEG=$(curl -s http://127.0.0.1:19101/__stats | python3 -c '
import sys,json
d=json.load(sys.stdin); bp=d["by_path"]
segs={k:v for k,v in bp.items() if k.endswith(".ts")}
print(sum(segs.values()), len(segs), d["conns"])' 2>/dev/null)
set -- $UPSEG; TOT_UP="${1:-0}"; NSEG="${2:-0}"; NCONN="${3:-0}"
say "origen: peticiones de segmento=$TOT_UP sobre $NSEG segmentos distintos · conexiones TCP totales=$NCONN"
if [ "$NSEG" -gt 0 ] && [ "$TOT_UP" -le $((NSEG*2)) ]; then
  ok "UPSTREAM: $TOT_UP peticiones para $NSEG segmentos distintos (≈1 por segmento)"
else
  warn "UPSTREAM: $TOT_UP peticiones para $NSEG segmentos distintos"
fi

# ── Criterio: 0 MISS repetidos para el mismo segmento dentro de su TTL ──────
REPMISS=$(python3 - "$W/logs/access.log" <<'PY'
import sys, re, collections
c = collections.Counter()
for line in open(sys.argv[1], errors="ignore"):
    m = re.search(r'"GET (\S+) HTTP', line)
    if not m: continue
    uri = m.group(1)
    if not (uri.endswith(".ts") or uri.endswith(".m4s")): continue
    if " cs=MISS" in line: c[uri] += 1
mx = max(c.values()) if c else 0
print(mx, len(c))
PY
)
set -- $REPMISS; MAXMISS="${1:-0}"; NDIST="${2:-0}"
say "MISS por segmento distinto: maximo=$MAXMISS sobre $NDIST segmentos (TTL de cache)"
if [ "$MAXMISS" -le 1 ]; then
  ok "CACHE: ningún segmento se pidió 2 veces al origen dentro de su TTL (max MISS/segmento=$MAXMISS)"
else
  bad "CACHE: hay segmentos con $MAXMISS MISS (el TTL o el lock no están reteniendo)"
fi

# ── Criterio: el PREFETCH realmente dispara ────────────────────────────────
curl -s --max-time 3 "http://127.0.0.1:$EDGE_PORT/ape/health" > "$W/logs/health2.json" 2>/dev/null
PF=$(python3 -c "
import json
try:
    d=json.load(open('$W/logs/health2.json')); p=d.get('prefetch',{})
    print(p.get('fired',0), p.get('done',0), p.get('skipped',0))
except Exception:
    print(-1,-1,-1)" 2>/dev/null)
set -- $PF; PF_FIRED="${1:--1}"; PF_DONE="${2:--1}"; PF_SKIP="${3:--1}"
say "prefetch: fired=$PF_FIRED done=$PF_DONE skipped=$PF_SKIP"
if [ "$PF_FIRED" -gt 0 ]; then
  ok "PREFETCH: disparó $PF_FIRED veces (dedup saltó $PF_SKIP) y completó $PF_DONE"
else
  bad "PREFETCH: nunca disparó (fired=$PF_FIRED) ⇒ no está calentando nada"
fi

# ── Criterio: WATCHDOG real (health + auto-recuperación + rotación) ────────
WD="$NGINX_DIR/ape-edge-watchdog.sh"
LR="$NGINX_DIR/logrotate-ape-edge.conf"
if [ -f "$WD" ]; then
  if APE_PORT="$EDGE_PORT" APE_LOG_DIR="$W/logs" APE_NGX_BIN="$NGX" \
     APE_NGX_PREFIX="$W/nginx-prefix" APE_NGX_CONF="$W/conf/nginx.conf" \
     bash "$WD" --once >/dev/null 2>&1; then
    ok "WATCHDOG: --once contra el edge vivo devuelve salud OK (exit 0)"
  else
    bad "WATCHDOG: --once no ve el edge sano"
  fi
else
  bad "WATCHDOG: falta $WD"
fi
if [ -f "$LR" ] && grep -q 'copytruncate' "$LR" && grep -q 'ape-edge' "$LR"; then
  ok "WATCHDOG: logrotate-ape-edge.conf presente con copytruncate (no corta peticiones)"
else
  bad "WATCHDOG: falta o está incompleta la rotación de logs"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. FASE C — STALE: origen en 500, el cliente debe seguir viendo el segmento
# ─────────────────────────────────────────────────────────────────────────────
hr; echo "FASE C · STALE-WHILE-REVALIDATE (origen 500)"; hr

# C1 — segmento YA cacheado (TTL 10m) con el origen caído: el cliente no ve hueco
curl -s "http://127.0.0.1:$EDGE_PORT/live/seg555.ts" -o /dev/null   # calienta POR EL EDGE
curl -s "http://127.0.0.1:19101/__ctl?code=500" >/dev/null
sleep 0.3
STALE_CODE=$(curl -s -o "$W/logs/stale.bin" -w '%{http_code}' --max-time 8 "http://127.0.0.1:$EDGE_PORT/live/seg555.ts")
STALE_SZ=$(stat -c%s "$W/logs/stale.bin" 2>/dev/null || echo 0)
say "C1 origen=500 · segmento cacheado ⇒ cliente HTTP $STALE_CODE · bytes=$STALE_SZ"
if [ "$STALE_CODE" = "200" ] && [ "$STALE_SZ" -eq 65536 ]; then
  ok "STALE-C1: con el origen en 500 el cliente recibe el segmento (cache escuda)"
else
  bad "STALE-C1: el cliente recibió $STALE_CODE / $STALE_SZ B con el origen en 500"
fi

# C2 — manifest EXPIRADO (TTL 3s) con el origen en 500 ⇒ debe servirse el stale.
#      Es la prueba real de stale-while-revalidate: la entrada ya no es fresca.
curl -s "http://127.0.0.1:$EDGE_PORT/live/index.m3u8" -o /dev/null   # calienta manifest
sleep 4                                                             # > TTL 3s
SM_CODE=$(curl -s -o "$W/logs/sm.m3u8" -w '%{http_code}' --max-time 8 "http://127.0.0.1:$EDGE_PORT/live/index.m3u8")
SM_OK=$(grep -c '^#EXTM3U' "$W/logs/sm.m3u8" 2>/dev/null || echo 0)
say "C2 manifest expirado + origen 500 ⇒ HTTP $SM_CODE · #EXTM3U=$SM_OK"
if [ "$SM_CODE" = "200" ] && [ "$SM_OK" -ge 1 ]; then
  ok "STALE-C2: manifest expirado servido igualmente (stale, sin hueco)"
else
  bad "STALE-C2: manifest expirado devolvió $SM_CODE (hueco para el player)"
fi

# C3 — revalidación en background: origen recuperado ⇒ el manifest se refresca
curl -s "http://127.0.0.1:19101/__ctl?code=200" >/dev/null
sleep 4
curl -s "http://127.0.0.1:$EDGE_PORT/live/index.m3u8" -o /dev/null
BG=$(grep -c 'updating\|STALE\|background' "$W/logs/access.log" 2>/dev/null || echo 0)
[ "$BG" -ge 1 ] && ok "STALE-C3: revalidación/stale observada en el log ($BG líneas)" \
                || warn "STALE-C3: no se pudo confirmar la revalidación en background"

# ─────────────────────────────────────────────────────────────────────────────
# 7. FASE D — FAILOVER: 502 ⇒ reintenta en otro host · 403 ⇒ NO reintenta
# ─────────────────────────────────────────────────────────────────────────────
hr; echo "FASE D · FAILOVER (solo red, nunca auth)"; hr

set_all() { for p in 19101 19102 19103; do curl -s "http://127.0.0.1:$p/__ctl?code=$1" >/dev/null; done; }
count_path() {
  python3 - "$1" <<'PY'
import sys, urllib.request, json
p = sys.argv[1]; tot = 0
for port in (19101, 19102, 19103):
    try:
        d = json.load(urllib.request.urlopen("http://127.0.0.1:%d/__stats" % port, timeout=3))
        tot += d["by_path"].get(p, 0)
    except Exception:
        pass
print(tot)
PY
}

# D1 — 5xx SÍ se reintenta: 2 hosts caídos (502) y 1 sano ⇒ el cliente ve 200.
#      Determinista con tries=3: cualquier orden alcanza el host sano.
set_all 200
curl -s "http://127.0.0.1:19101/__ctl?code=502" >/dev/null
curl -s "http://127.0.0.1:19102/__ctl?code=502" >/dev/null
# 19103 queda en 200
D1_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$EDGE_PORT/fo/seg901.ts")
D1_N=$(count_path "/fo/seg901.ts")
say "D1 host1=502 host2=502 host3=200 ⇒ cliente HTTP $D1_CODE · peticiones al origen=$D1_N"
if [ "$D1_CODE" = "200" ] && [ "$D1_N" -ge 2 ]; then
  ok "FAILOVER-D1: 5xx provocó reintento ($D1_N intentos) y acabó en 200"
elif [ "$D1_CODE" = "200" ] && [ "$D1_N" -eq 1 ]; then
  warn "FAILOVER-D1: 200 al primer intento (el round-robin acertó el host sano): no prueba el reintento"
else
  bad "FAILOVER-D1: cliente $D1_CODE con $D1_N intentos (se esperaba 200 tras reintentar)"
fi

# D2 — 403 NO se reintenta: TODOS los hosts en 403 ⇒ el cliente ve 403 y el
#      origen recibe EXACTAMENTE 1 petición (si reintentara, serían 2-3).
set_all 403
D2_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$EDGE_PORT/fo/seg902.ts")
D2_N=$(count_path "/fo/seg902.ts")
say "D2 todos=403 ⇒ cliente HTTP $D2_CODE · peticiones al origen=$D2_N (esperado 1)"
if [ "$D2_CODE" = "403" ] && [ "$D2_N" -eq 1 ]; then
  ok "FAILOVER-D2: 403 al cliente y 1 sola petición ⇒ auth NO se reintenta"
elif [ "$D2_CODE" = "403" ] && [ "$D2_N" -gt 1 ]; then
  bad "FAILOVER-D2: 403 devuelto pero con $D2_N intentos ⇒ se está reintentando auth"
else
  bad "FAILOVER-D2: cliente $D2_CODE (se esperaba 403 sin reintento)"
fi

# D3 — 429 tampoco se reintenta (misma doctrina que 403)
set_all 429
D3_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$EDGE_PORT/fo/seg903.ts")
D3_N=$(count_path "/fo/seg903.ts")
say "D3 todos=429 ⇒ cliente HTTP $D3_CODE · peticiones al origen=$D3_N (esperado 1)"
if [ "$D3_CODE" = "429" ] && [ "$D3_N" -eq 1 ]; then
  ok "FAILOVER-D3: 429 al cliente y 1 sola petición ⇒ rate-limit NO se reintenta"
else
  bad "FAILOVER-D3: cliente $D3_CODE con $D3_N intentos"
fi
set_all 200

# ─────────────────────────────────────────────────────────────────────────────
# 8. INFORME
# ─────────────────────────────────────────────────────────────────────────────
hr; echo "INFORME"; hr
python3 - "$W/logs/client.json" "$DURATION" "$HRATIO" "$HC" "$MC" "$SC" "$TC" "$TOT_UP" "$NSEG" <<'PY'
import json, sys
(p, dur, hr, hc, mc, sc, tc, up, nseg) = sys.argv[1:10]
d = json.load(open(p))
rps = d["requests"]/float(dur)
print("  RPS .................. %.2f  (%d peticiones / %ss)" % (rps, d["requests"], dur))
print("  Clientes ............. %s" % sys.argv[0:0] if False else "")
print("  Errores cliente ...... %d" % d["errors"])
print("  Hit ratio cache ...... %.1f%%  (HIT %s / MISS %s / STALE %s de %s)" %
      (float(hr)*100, hc, mc, sc, tc))
print("  Upstream por segmento. %.2f  (%s peticiones / %s segmentos)" %
      ((float(up)/float(nseg)) if float(nseg) else 0.0, up, nseg))
print("  p95 latencia segmento  %s ms  (n=%d)" % (round(d["lat_p95"],2) if d["lat_p95"] is not None else "n/a", d["lat_n"]))
print("  p95 gap entre segmentos %s ms  (n=%d)" % (round(d["gap_p95"],2) if d["gap_p95"] is not None else "n/a", d["gap_n"]))
print("  p95 gap NETO .......... %s ms  (retraso sobre la cadencia prevista; n=%d)" %
      (round(d["gex_p95"],2) if d.get("gex_p95") is not None else "n/a", d.get("gex_n", 0)))
print("  media latencia ....... %s ms" % (round(d["lat_mean"],2) if d["lat_mean"] is not None else "n/a"))
PY

# ── Umbrales de continuidad ─────────────────────────────────────────────────
read -r P95LAT P95GEX < <(python3 -c "
import json
d=json.load(open('$W/logs/client.json'))
print(round(d['lat_p95'],2) if d.get('lat_p95') is not None else -1,
      round(d['gex_p95'],2) if d.get('gex_p95') is not None else -1)")
if python3 -c "import sys; sys.exit(0 if 0 <= float('$P95LAT') <= 100 else 1)"; then
  ok "LATENCIA: p95 de segmento ${P95LAT} ms ≤ 100 ms"
else
  bad "LATENCIA: p95 de segmento ${P95LAT} ms > 100 ms (riesgo de hueco)"
fi
if python3 -c "import sys; sys.exit(0 if float('$P95GEX') <= 100 else 1)"; then
  ok "GAP NETO: p95 ${P95GEX} ms ≤ 100 ms sobre la cadencia"
else
  warn "GAP NETO: p95 ${P95GEX} ms > 100 ms sobre la cadencia (revisar cache/prefetch)"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  printf '%sRESULTADO: PASS%s  (%d PASS · %d WARN · 0 FAIL)\n' "$c_ok" "$c_off" "$PASS" "$WARN"
  echo "NOTA: medición REAL sobre nginx $("$NGX" -v 2>&1 | awk '{print $3}') local (WSL)."
  echo "      El nginx del VPS de producción NO se ha tocado: su 'nginx -t' sigue [UNKNOWN]."
  exit 0
else
  printf '%sRESULTADO: FAIL%s  (%d PASS · %d WARN · %d FAIL)\n' "$c_bad" "$c_off" "$PASS" "$WARN" "$FAIL"
  exit 1
fi
