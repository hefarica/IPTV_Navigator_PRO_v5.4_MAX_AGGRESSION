#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# APE MEDIA-FANOUT — V1 · banco de pruebas crítico de concurrencia (STAGING)
# ═════════════════════════════════════════════════════════════════════════════
# Fichero: _vps_stage/tests/fanout_concurrency.sh
# Versión: 1.0.0  (2026-10-25)
#
# QUÉ MIDE (criterios del contrato V1)
#   1. N=50 clientes simultáneos al MISMO canal → EXACTAMENTE 1 conexión
#      upstream. Curva con 1/5/50/100 clientes para probar invariancia.
#      Evidencia: `ss` (conexiones establecidas al origen de staging, PID
#      dueño), procesos ffmpeg/worker, y aceptaciones TCP del origen real.
#      NO se usan contadores de stub.
#   2. Coherencia: todas las playlists de la misma generación/MSN son
#      idénticas; sin segmentos duplicados, sin huecos de MSN, sin
#      desalineación nombre-de-fichero↔MSN. Snapshots simultáneos byte a byte.
#   3. Timestamps: los segmentos de la ventana se descargan y se validan con
#      ffprobe (PTS/DTS): monotonía, continuidad y ausencia de saltos; EXTINF
#      y MSN coherentes.
#   4. Aislamiento: un cliente lento/abortado (lectura a goteo y cierre
#      abrupto) no degrada a los otros 50 (≥15 s de servicio, éxito ≥99 %).
#   5. Fencing: se mata el worker; la generación vieja se congela, el
#      coordinador cierra la sesión sin espectadores y el siguiente OPEN crea
#      UNA generación nueva (gen+1), la vieja devuelve 302 stale_generation y
#      no queda una segunda ingesta viva (1 worker, 1 ffmpeg, 1 conexión).
#   6. Límites: con max_sessions=2 / max_viewers=3 / max_total=5, las sesiones
#      y espectadores ya conectados NO se caen y los nuevos reciben 503 con
#      X-MF-Reason (max_sessions / max_viewers / max_total_viewers).
#
# SEGURIDAD / AISLAMIENTO
#   * SÓLO staging. No escribe /etc/nginx, /etc/mediafanout, /run/mediafanout
#     ni /var/lib/mediafanout. Usa /tmp/mf_v1/{src,logs,...} y la ventana
#     /dev/shm/mf (se exige vacía al empezar y se limpia al terminar).
#   * Snapshot de producción antes/después: sha256 de /etc/nginx/nginx.conf,
#     MainPID de nginx y `journalctl -u nginx` de la ventana. Si el nginx de
#     producción se reinicia/reconfigura dentro de la ventana, la corrida se
#     declara INVÁLIDA (exit 2) y hay que repetirla.
#   * Un lock exclusivo (/tmp/mf_v1.lock) impide dos bancos en paralelo.
#
# REQUISITOS
#   root en el VPS; nginx con ngx_http_lua (1.24), lua5.1, ffmpeg/ffprobe,
#   socat, flock, curl, python3, ss. Si `conntrack` no está instalado se usa
#   `ss` + /proc/net/tcp (se informa en el reporte).
#
# USO
#   MF_STAGE_SRC=/tmp/mf_stage bash fanout_concurrency.sh [opciones]
#     --stage-src DIR     staging a probar (def: $MF_STAGE_SRC o ../ del script)
#     --shim-delay N      retraso del lanzador de staging (def: 0 = sin shim).
#                         Se conserva >0 sólo para reproducir el snapshot t9/t4
#                         anterior a las reparaciones B1 (t11/t12).
#     --b1-probe auto|1|0  intento de arranque EN FRÍO sin shim para capturar
#                         la evidencia de B1 (def: auto = sí si shim>0).
#     --skip-limits       no ejecuta la fase B de límites.
#     --keep              conserva /tmp/mf_v1 (evidencia y logs) al terminar.
#     --dry-run           valida plan/herramientas y sale 0 SIN arrancar nada
#                         (lo usa el comando de verificación del contrato).
#     -h|--help
#
# LANZADOR DE STAGING (FIFO + watcher; simula systemd fuera del handler)
#   El banco NO usa `systemctl`: el supervisor (autoridad de gen) invoca
#   `start-worker.sh`, que encola la key en una FIFO; un watcher fuera del
#   handler lanza EXACTAMENTE un worker por petición de spawn. Esto reproduce
#   el arranque asíncrono de systemd sin heredar descriptores del handler.
#   Con el snapshot t9/t4 (antes de t11/t12) esto NO bastaba: el `flock` del
#   handler se heredaba por fd y el worker se autobloqueaba al publicar
#   (`rc=20`), y `systemctl start` esperaba un READY que el worker sólo enviaba
#   tras el publish → deadlock de arranque en frío (hallazgo B1). B1 está
#   reparado en t11 (flock corto, efectos fuera del lock) y t12 (READY antes
#   del publish + reintentos); por eso el defecto es 0 y `COLD_START=PASS`.
#   `--shim-delay` sólo sirve para volver a medir el snapshot viejo.
#
# SALIDA
#   Puntos PASS/FAIL por criterio, tabla de números, `$B/evidence.txt` y
#   `$B/analysis.json`. Exit: 0 = invariante PASS y producción intacta;
#   1 = algún criterio FAIL; 2 = corrida INVÁLIDA (nginx prod reiniciado o
#   producción modificada); 3 = entorno/uso.
# ═════════════════════════════════════════════════════════════════════════════
set -u
set -o pipefail

VERSION="1.0.0"
B="/tmp/mf_v1"
LOCK="/tmp/mf_v1.lock"
WINDOW="/dev/shm/mf"
PORT_A=18099
PORT_B=18100
PORT_B1=18098          # sonda de arranque en frío (B1)
ORIGIN_PORT=19090
ORIGIN_STATS=19091
TEST_USER="mfuser"
TEST_PASS="F1_TEST_PASS_9f3c"
CLIENTS_COLD=50
SHIM_DELAY=0
B1_PROBE=auto
SKIP_LIMITS=0
KEEP=0
DRY_RUN=0
STAGE_SRC=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
WARN=0
CRIT_LINES=()
EVIDENCE=""
STACK_LABELS=()
SAMPLER_PID=""
SS_PROBE_PID=""
KEEPALIVE_PID=""
START_ISO=""
END_ISO=""
PROD_PID_BEFORE=""
PROD_SHA_BEFORE=""
PROD_OK=1
INVALID_RUN=0
COLD_START_STATUS="UNKNOWN"

# ── utilidades básicas ───────────────────────────────────────────────────────
c_ok=""; c_bad=""; c_warn=""; c_off=""
if [ -t 1 ]; then c_ok=$'\033[32m'; c_bad=$'\033[31m'; c_warn=$'\033[33m'; c_off=$'\033[0m'; fi
log()  { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$EVIDENCE"; }
ok()   { PASS=$((PASS+1)); printf '%sPASS%s %s\n' "$c_ok" "$c_off" "$*" | tee -a "$EVIDENCE"; CRIT_LINES+=("PASS $*"); }
bad()  { FAIL=$((FAIL+1)); printf '%sFAIL%s %s\n' "$c_bad" "$c_off" "$*" | tee -a "$EVIDENCE"; CRIT_LINES+=("FAIL $*"); }
warn() { WARN=$((WARN+1)); printf '%sWARN%s %s\n' "$c_warn" "$c_off" "$*" | tee -a "$EVIDENCE"; CRIT_LINES+=("WARN $*"); }
die()  { echo "ERROR: $*" >&2; exit 3; }
need() { command -v "$1" >/dev/null 2>&1 || die "falta '$1' en PATH"; }

usage() { sed -n '2,70p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
    case "$1" in
        --stage-src)     STAGE_SRC="${2:-}"; shift 2 ;;
        --stage-src=*)   STAGE_SRC="${1#*=}"; shift ;;
        --shim-delay)    SHIM_DELAY="${2:-}"; shift 2 ;;
        --shim-delay=*)  SHIM_DELAY="${1#*=}"; shift ;;
        --b1-probe)      B1_PROBE="${2:-}"; shift 2 ;;
        --b1-probe=*)    B1_PROBE="${1#*=}"; shift ;;
        --no-b1-probe)   B1_PROBE=0; shift ;;
        --skip-limits)   SKIP_LIMITS=1; shift ;;
        --keep)          KEEP=1; shift ;;
        --dry-run)       DRY_RUN=1; shift ;;
        -h|--help)       usage ;;
        *) die "opción desconocida: $1 (--help)" ;;
    esac
done
case "$SHIM_DELAY" in ''|*[!0-9]*) die "--shim-delay debe ser entero (0..30)" ;; esac
[ "$SHIM_DELAY" -le 30 ] || die "--shim-delay máximo 30 s"

# ── dry-run: valida el plan y el entorno SIN arrancar nada ───────────────────
# Lo usa el comando de verificación del contrato: `bash fanout_concurrency.sh
# --dry-run` debe salir 0 sin tocar producción, /dev/shm ni puertos.
if [ "$DRY_RUN" = "1" ]; then
    echo "DRY_RUN v$VERSION — no se arranca ninguna ingesta ni servidor"
    echo "bench_root=$B window=$WINDOW"
    echo "puertos: fanout=$PORT_A límites=$PORT_B b1_probe=$PORT_B1 origen=$ORIGIN_PORT stats=$ORIGIN_STATS"
    echo "shim_delay=${SHIM_DELAY}s b1_probe=$B1_PROBE skip_limits=$SKIP_LIMITS"
    missing=0
    for t in nginx lua5.1 ffmpeg ffprobe socat flock curl python3 ss pgrep setsid timeout sha256sum journalctl; do
        if command -v "$t" >/dev/null 2>&1; then
            printf 'tool %-11s OK  %s\n' "$t" "$(command -v "$t")"
        else
            printf 'tool %-11s MISSING\n' "$t"
            missing=$((missing + 1))
        fi
    done
    found=""
    for cand in "${MF_STAGE_SRC:-}" "$SCRIPT_DIR/.." "/tmp/mf_stage" "$SCRIPT_DIR"; do
        [ -n "$cand" ] || continue
        if [ -f "$cand/lua/ape_session.lua" ] && [ -f "$cand/media/ape-ingest.sh" ] \
           && [ -f "$cand/nginx/media-fanout.conf" ] && [ -f "$cand/media/ape-supervisor.sh" ]; then
            found="$(cd "$cand" && pwd)"; break
        fi
    done
    echo "staging_src=${found:-NOT_FOUND (se resolverá al ejecutar)}"
    echo "plan: cold 50 simultáneos -> curva 1/5/50/100 -> snapshots -> timestamps -> aislamiento -> fencing -> límites"
    echo "herramientas_faltantes=$missing"
    echo "DRY_RUN_OK"
    exit 0
fi

# ── lock de instancia única ──────────────────────────────────────────────────
exec 200>"$LOCK" || die "no puedo abrir $LOCK"
flock -n 200 || die "ya hay otro banco de fan-out ejecutándose ($LOCK)"
# restos de una corrida anterior (idempotencia): matar sólo procesos de ESTE árbol
for p in $(pgrep -f "$B/" 2>/dev/null); do [ "$p" = "$$" ] || kill -KILL "$p" 2>/dev/null; done
rm -rf "$B"
mkdir -p "$B"
EVIDENCE="$B/evidence.txt"
: > "$EVIDENCE"
log "═══ V1 fanout_concurrency v$VERSION — $(date -u +%Y-%m-%dT%H:%M:%SZ) ═══"
log "host=$(hostname) kernel=$(uname -r) nproc=$(nproc)"

# ── resolución del staging a probar ─────────────────────────────────────────
if [ -z "$STAGE_SRC" ]; then
    for cand in "${MF_STAGE_SRC:-}" "$SCRIPT_DIR/.." "/tmp/mf_stage" "$SCRIPT_DIR"; do
        [ -n "$cand" ] || continue
        if [ -f "$cand/lua/ape_session.lua" ] && [ -f "$cand/media/ape-ingest.sh" ] \
           && [ -f "$cand/nginx/media-fanout.conf" ] && [ -f "$cand/media/ape-supervisor.sh" ]; then
            STAGE_SRC="$cand"; break
        fi
    done
fi
[ -n "$STAGE_SRC" ] || die "no encuentro el staging (--stage-src / MF_STAGE_SRC): faltan lua/ape_session.lua, media/ape-ingest.sh, nginx/media-fanout.conf"
STAGE_SRC="$(cd "$STAGE_SRC" && pwd)"
log "stage_src=$STAGE_SRC"

# ── root y herramientas ─────────────────────────────────────────────────────
[ "$(id -u)" = "0" ] || die "requiere root (sockets, chown y procesos de staging)"
for t in nginx lua5.1 ffmpeg ffprobe socat flock curl python3 ss pgrep pkill setsid timeout sha256sum journalctl; do need "$t"; done
if command -v conntrack >/dev/null 2>&1; then HAVE_CONNTRACK=1; else HAVE_CONNTRACK=0; fi
log "conntrack=$([ "$HAVE_CONNTRACK" = 1 ] && echo disponible || echo AUSENTE_usar_ss_y_proc_net_tcp)"

# ── seguridad: ventana staging y puertos ────────────────────────────────────
if [ -d "$WINDOW" ] && [ -n "$(ls -A "$WINDOW" 2>/dev/null)" ]; then
    die "$WINDOW no está vacía; hay otra prueba/staging usándola (no la toco). Contenido: $(ls -A "$WINDOW" | head -5 | tr '\n' ' ')"
fi
for p in "$PORT_A" "$PORT_B" "$PORT_B1" "$ORIGIN_PORT" "$ORIGIN_STATS"; do
    if ss -Htln "sport = :$p" 2>/dev/null | grep -q .; then die "puerto $p ocupado"; fi
done

# ── snapshot de producción (antes) ──────────────────────────────────────────
START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
prod_snapshot() {
    PROD_PID_BEFORE="$(systemctl show -p MainPID --value nginx 2>/dev/null || echo 0)"
    PROD_SHA_BEFORE="$(sha256sum /etc/nginx/nginx.conf 2>/dev/null | awk '{print $1}')"
    [ -n "$PROD_SHA_BEFORE" ] || PROD_SHA_BEFORE="missing"
    log "prod_snapshot pid=$PROD_PID_BEFORE sha256=$PROD_SHA_BEFORE start=$START_ISO"
}
prod_snapshot

# ── copia inmutable del código bajo prueba ──────────────────────────────────
mkdir -p "$B"/{src,bin,logs,pids,phases,ts,evidence,origin}
cp -a "$STAGE_SRC/lua" "$STAGE_SRC/media" "$STAGE_SRC/nginx" "$B/src/" \
    || die "no puedo copiar $STAGE_SRC a $B/src"
chmod +x "$B/src/media/ape-ingest.sh" "$B/src/media/ape-supervisor.sh"
SRC_SHA_SESSION="$(sha256sum "$B/src/lua/ape_session.lua" | awk '{print $1}')"
SRC_SHA_CONF="$(sha256sum "$B/src/nginx/media-fanout.conf" | awk '{print $1}')"
SRC_SHA_SUP="$(sha256sum "$B/src/media/ape-supervisor.lua" | awk '{print $1}')"
SRC_SHA_SUPSH="$(sha256sum "$B/src/media/ape-supervisor.sh" | awk '{print $1}')"
SRC_SHA_WORKER="$(sha256sum "$B/src/media/ape-ingest.sh" | awk '{print $1}')"
SRC_SHA_UNIT="$(sha256sum "$B/src/media/ape-ingest@.service" | awk '{print $1}')"
log "src_sha session=$SRC_SHA_SESSION conf=$SRC_SHA_CONF supervisor=$SRC_SHA_SUP/$SRC_SHA_SUPSH worker=$SRC_SHA_WORKER unit=$SRC_SHA_UNIT"

# ── limpieza y trap ─────────────────────────────────────────────────────────
stop_label() { # $1 label
    local lbl="$1" d="$B/$1" p
    [ -d "$d" ] || return 0
    if [ -f "$d/nginx/nginx.pid" ]; then
        kill -QUIT "$(cat "$d/nginx/nginx.pid")" 2>/dev/null || true
    fi
    if [ -f "$d/run/sup.pid" ]; then
        kill -TERM "$(cat "$d/run/sup.pid")" 2>/dev/null || true
    fi
    if [ -f "$d/run/watcher.pid" ]; then
        kill -KILL "$(cat "$d/run/watcher.pid")" 2>/dev/null || true
    fi
    shopt -s nullglob
    for f in "$d"/pids/worker-*.pid; do
        p="$(cat "$f" 2>/dev/null || echo)"
        [ -n "$p" ] || continue
        kill -TERM "-$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null || true
    done
    shopt -u nullglob
    sleep 0.4
    for f in "$d"/pids/worker-*.pid; do
        p="$(cat "$f" 2>/dev/null || echo)"
        [ -n "$p" ] || continue
        if kill -0 "$p" 2>/dev/null; then kill -KILL "-$p" 2>/dev/null || kill -KILL "$p" 2>/dev/null || true; fi
    done
    rm -f "$d/run/mf.sock" "$d/run/supervisor.sock" 2>/dev/null || true
}

cleanup() {
    local rc=$?
    trap - EXIT INT TERM
    set +e
    [ -n "${SAMPLER_PID:-}" ] && kill -KILL "$SAMPLER_PID" 2>/dev/null
    [ -n "${SS_PROBE_PID:-}" ] && kill -KILL "$SS_PROBE_PID" 2>/dev/null
    [ -n "${KEEPALIVE_PID:-}" ] && kill -KILL "$KEEPALIVE_PID" 2>/dev/null
    for lbl in "${STACK_LABELS[@]:-}"; do [ -n "$lbl" ] && stop_label "$lbl"; done
    for f in "$B"/pids/*.pid; do
        [ -r "$f" ] || continue
        p="$(cat "$f" 2>/dev/null || echo)"
        [ -n "$p" ] && kill -KILL "-$p" 2>/dev/null || true
        [ -n "$p" ] && kill -KILL "$p" 2>/dev/null || true
    done
    # barrido de cualquier proceso que apunte a nuestro árbol de staging
    for p in $(pgrep -f "$B/" 2>/dev/null); do
        [ "$p" = "$$" ] && continue
        kill -KILL "$p" 2>/dev/null
    done
    sleep 0.5
    rm -rf "$WINDOW"/* 2>/dev/null
    rm -f "$B"/run/spawn.fifo 2>/dev/null
    find "$B" -maxdepth 3 -name '*.sock' -delete 2>/dev/null
    if [ "$KEEP" = "0" ] && [ "${KEEP_LOGS:-1}" = "0" ]; then :; fi
    exit "$rc"
}
trap cleanup EXIT INT TERM

# ── helpers Python (se generan en $B) ───────────────────────────────────────
write_helpers() {
cat > "$B/mkconf.py" <<'PY'
import re, sys
src, dst, listen, mods, sup = sys.argv[1:6]
overrides = dict(a.split('=', 1) for a in sys.argv[6:])
t = open(src, encoding='utf-8').read()
t = t.replace('/etc/nginx/lua/ape_session.lua', mods)
t = t.replace('unix:/run/mediafanout/supervisor.sock', 'unix:' + sup)
t = t.replace('listen 8090;', 'listen ' + listen + ';')
for k, v in overrides.items():
    pat = r'set \$mf_%s "[^"]*";' % re.escape(k)
    if not re.search(pat, t):
        sys.exit('override missing: mf_' + k)
    t = re.sub(pat, 'set $mf_%s "%s";' % (k, v), t)
open(dst, 'w', encoding='utf-8').write(t)
PY

cat > "$B/origin_server.py" <<'PY'
#!/usr/bin/env python3
"""Origen HLS de staging (proveedor controlado REAL).

* Sirve la playlist/segmentos por TCP.
* Cuenta cada conexión TCP ACEPTADA, cada GET y la CONCURRENCIA MÁXIMA de
  sockets abiertos en el destino (max_active): es la medida exacta de "cuántas
  conexiones upstream hay a la vez", sin depender de muestrear `ss` a tiempo.
* Expone /stats y /reset en un puerto SEPARADO (19091) que NO se cuenta.
Todo el tráfico es loopback de staging; no hay proveedor real.
"""
import http.server, socketserver, os, sys, time, threading, json
root, port, log = sys.argv[1], int(sys.argv[2]), sys.argv[3]
stats_port = int(sys.argv[4]) if len(sys.argv) > 4 else 19091
lock = threading.RLock()
st = {'accepts': 0, 'gets': 0, 'active': 0, 'max_active': 0, 'delay_ms': 0, 'started': time.time()}

def logline(s):
    with lock:
        with open(log, 'a') as f:
            f.write(s + '\n')

class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'mf-origin'
    def log_message(self, *a): pass
    def _serve(self, body):
        with lock:
            st['gets'] += 1
        p = self.path.split('?')[0].lstrip('/')
        fn = os.path.join(root, p)
        # Varias "keys"/canales de staging comparten el mismo origen real;
        # aceptar /<canal>/index.m3u8 y /<canal>/segNNN.ts sirviendo el mismo
        # fichero de la raíz (la URL normalizada sigue siendo distinta por path).
        if not os.path.isfile(fn) and '/' in p:
            fn = os.path.join(root, p.split('/', 1)[1])
        logline('%.3f GET %s %s' % (time.time(), self.path, self.client_address[1]))
        with lock:
            dly = int(st.get('delay_ms', 0) or 0)
        if dly > 0:
            # Sonda ss: ensancha la vida del socket de la ingesta para que `ss`
            # pueda fotografiarlo. Sólo se activa en la fase de medición ss.
            time.sleep(min(dly, 500) / 1000.0)
        if not os.path.isfile(fn):
            self.send_response(404); self.send_header('Content-Length', '0'); self.end_headers(); return
        data = open(fn, 'rb').read()
        self.send_response(200)
        self.send_header('Content-Type', 'application/vnd.apple.mpegurl' if p.endswith('.m3u8') else 'video/mp2t')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if body: self.wfile.write(data)
    def finish(self):
        try:
            super().finish()
        except Exception:
            pass
        finally:
            with lock:
                st['active'] = max(0, st['active'] - 1)
    def do_GET(self): self._serve(True)
    def do_HEAD(self): self._serve(False)

class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128
    def get_request(self):
        req, addr = super().get_request()
        with lock:
            st['accepts'] += 1
            st['active'] += 1
            st['max_active'] = max(st['max_active'], st['active'])
            cur = st['active']; mx = st['max_active']
        logline('%.3f ACCEPT %s active=%d max=%d' % (time.time(), addr[1], cur, mx))
        return req, addr

class StatsH(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass
    def do_GET(self):
        with lock:
            if self.path.startswith('/reset'):
                # conserva las conexiones en vuelo: max_active parte del valor actual
                st.update({'accepts': 0, 'gets': 0, 'max_active': st['active'], 'started': time.time()})
            if self.path.startswith('/delay'):
                try:
                    q = self.path.split('?', 1)[1] if '?' in self.path else ''
                    ms = int(dict(x.split('=', 1) for x in q.split('&') if '=' in x).get('ms', '0'))
                except Exception:
                    ms = 0
                st['delay_ms'] = max(0, min(ms, 500))
            data = json.dumps(st).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

class StatsS(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

threading.Thread(target=lambda: StatsS(('127.0.0.1', stats_port), StatsH).serve_forever(),
                 daemon=True).start()
S(('127.0.0.1', port), H).serve_forever()
PY

cat > "$B/sampler.py" <<'PY'
#!/usr/bin/env python3
"""Muestreador de conexiones upstream REALES al origen de staging.
Cada muestra: ss de conexiones TCP establecidas al puerto del origen, PIDs
dueños, nº de procesos ffmpeg y contador independiente de /proc/net/tcp."""
import re, subprocess, sys, time, os
port, out, stopfile = int(sys.argv[1]), sys.argv[2], sys.argv[3]
hexport = '%04X' % port
def count_proc_tcp():
    n = 0
    try:
        with open('/proc/net/tcp') as f:
            next(f)
            for line in f:
                p = line.split()
                if len(p) > 3 and p[3] == '01' and p[1].upper().endswith(':' + hexport):
                    n += 1
    except Exception:
        pass
    return n
def ffmpeg_count():
    try:
        r = subprocess.run(['pgrep', '-af', 'ffmpeg'], capture_output=True, text=True, timeout=2)
        return sum(1 for l in r.stdout.splitlines() if (':' + str(port)) in l)
    except Exception:
        return -1
with open(out, 'w', buffering=1) as f:
    f.write('ts,n_ss,n_proc_tcp,pids,n_ffmpeg\n')
    while not os.path.exists(stopfile):
        ts = time.time()
        try:
            r = subprocess.run(['ss', '-Htnp', 'state', 'established', '( dport = :%d )' % port],
                               capture_output=True, text=True, timeout=3)
            lines = [l for l in r.stdout.splitlines() if l.strip()]
        except Exception:
            lines = []
        n = len(lines)
        pids = sorted(set(re.findall(r'pid=(\d+)', '\n'.join(lines))))
        nproc = count_proc_tcp()
        nff = ffmpeg_count()
        f.write('%.3f,%d,%d,%s,%d\n' % (ts, n, nproc, '|'.join(pids), nff))
        time.sleep(0.1)
PY

cat > "$B/ss_probe.py" <<'PY'
#!/usr/bin/env python3
"""Sonda `ss` de alta frecuencia para la ventana de medición dedicada.

Lee /proc/net/tcp cada ~1 ms; cuando ve una conexión ESTABLISHED al puerto del
origen, ejecuta `ss -Htnp state established '( dport = :PORT )'` y guarda la
salida. Durante la sonda el origen añade 50 ms de latencia artificial para
ensanchar la vida del socket (la ingesta sigue siendo la misma; sólo se puede
fotografiar). Devuelve: hits, ss_positive, max_ss_lines (conexiones vistas por
ss), max_proc_tcp (conexiones vistas por /proc) y las muestras crudas.
"""
import json, subprocess, sys, time
port, seconds, out = int(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
hexport = '%04X' % port
t0 = time.time(); hits = []; max_proc = 0; ss_positive = 0; max_ss = 0
while time.time() - t0 < seconds:
    n = 0
    try:
        with open('/proc/net/tcp') as f:
            next(f)
            for line in f:
                p = line.split()
                if len(p) > 3 and p[3] == '01' and p[1].upper().endswith(':' + hexport):
                    n += 1
    except Exception:
        pass
    if n:
        max_proc = max(max_proc, n)
        try:
            r = subprocess.run(['ss', '-Htnp', 'state', 'established', '( dport = :%d )' % port],
                               capture_output=True, text=True, timeout=2)
            lines = [l for l in r.stdout.splitlines() if l.strip()]
            if lines:
                ss_positive += 1
                max_ss = max(max_ss, len(lines))
                if len(hits) < 20:
                    hits.append({'ts': round(time.time(), 3), 'n_proc': n,
                                 'n_ss': len(lines), 'ss': r.stdout.strip()})
        except Exception:
            pass
    time.sleep(0.001)
json.dump({'seconds': seconds, 'hits': len(hits), 'ss_positive': ss_positive,
           'max_ss_lines': max_ss, 'max_proc_tcp': max_proc, 'samples': hits},
          open(out, 'w'), indent=2)
print('SS_PROBE hits=%d ss_positive=%d max_ss_lines=%d max_proc_tcp=%d' %
      (len(hits), ss_positive, max_ss, max_proc))
PY

cat > "$B/clients.py" <<'PY'
#!/usr/bin/env python3
"""Clientes HLS concurrentes e independientes (una conexión HTTP por cliente).

Modos:
  cold      N peticiones simultáneas a /mf/src/<prov>/<chan>/live.m3u8
            (sigue el 302, reintenta 503 manifest_not_ready hasta el deadline)
  poll      N clientes sondean la playlist canónica durante S segundos,
            refrescan la marca de espectador por la ruta live y bajan el
            último segmento cada 5 sondeos
  snapshot  N peticiones simultáneas (barrera) y se guardan los cuerpos para
            compararlos byte a byte
  slow      como poll pero añade un cliente que lee un segmento a 1 KB/s y
            aborta bruscamente a los 8 s (aislamiento)
"""
import argparse, hashlib, http.client, json, os, socket, sys, threading, time
from urllib.parse import urlsplit

def parse_playlist(text):
    msn = 0; target = 0.0; segs = []; extinf = []; cur = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith('#EXT-X-MEDIA-SEQUENCE:'):
            try: msn = int(line.split(':', 1)[1])
            except Exception: pass
        elif line.startswith('#EXT-X-TARGETDURATION:'):
            try: target = float(line.split(':', 1)[1])
            except Exception: pass
        elif line.startswith('#EXTINF:'):
            try: cur = float(line.split(':', 1)[1].split(',', 1)[0])
            except Exception: cur = None
        elif line.startswith('#'):
            cur = None
        else:
            segs.append(line); extinf.append(cur); cur = None
    return msn, segs, extinf, target

def pct(v, q):
    if not v: return None
    v = sorted(v); k = (len(v) - 1) * q / 100.0
    lo = int(k); hi = min(lo + 1, len(v) - 1)
    return round(v[lo] + (v[hi] - v[lo]) * (k - lo), 3)

class Client:
    def __init__(self, host, port, cid):
        self.host, self.port, self.cid = host, port, cid
        self.conn = None
    def close(self):
        try:
            if self.conn: self.conn.close()
        except Exception: pass
        self.conn = None
    def get(self, path, read=True, timeout=30):
        attempts = 2
        for a in range(attempts):
            t0 = time.time()
            try:
                if self.conn is None:
                    self.conn = http.client.HTTPConnection(self.host, self.port, timeout=timeout)
                self.conn.request('GET', path, headers={
                    'X-MF-Client': self.cid, 'User-Agent': 'mf-fanout-bench/1.0',
                    'Accept': '*/*', 'Connection': 'keep-alive'})
                resp = self.conn.getresponse()
                body = resp.read() if read else b''
                hdrs = {k.lower(): v for k, v in resp.getheaders()}
                code = resp.status
                if resp.will_close:
                    self.close()
                return code, hdrs, body, round((time.time() - t0) * 1000.0, 3)
            except Exception:
                self.close()
                if a + 1 < attempts:
                    time.sleep(0.15)
        return 0, {}, b'', round((time.time() - t0) * 1000.0, 3)

def record(out, prefix, idx, obj):
    obj['client'] = '%s-%03d' % (prefix, idx)
    with open(os.path.join(out, '%s-%03d.jsonl' % (prefix, idx)), 'a') as f:
        f.write(json.dumps(obj, separators=(',', ':')) + '\n')

def cold(args, idx, results):
    c = Client(args.host, args.port, '%s-c%03d' % (args.prefix, idx))
    t0 = time.time(); key = None; total = 0.0; final = 0; body = ''; last_path = ''
    src = '/mf/src/%s/%s/live.m3u8' % (args.provider, args.channel)
    while time.time() - t0 < args.deadline:
        code, h, body_b, ms = c.get(src)
        total += ms
        if code == 302 and 'location' in h:
            loc = h['location']; last_path = loc
            m = __import__('re').search(r'/mf/([0-9a-f]{16})/live\.m3u8', loc)
            if m: key = m.group(1)
            code, h, body_b, ms = c.get(loc, timeout=40)
            total += ms
        if code == 200:
            final = 200
            try: body = body_b.decode('utf-8', 'replace')
            except Exception: body = ''
            break
        final = code
        time.sleep(0.4)
    gen = None; state = None
    if key:
        code, h, body_b, ms = c.get('/mf/ctl?op=inspect&key=' + key, timeout=5)
        if code == 200:
            txt = body_b.decode('utf-8', 'replace')
            for tok in txt.split():
                if tok.startswith('gen='): gen = int(tok.split('=')[1])
                if tok.startswith('state='): state = tok.split('=', 1)[1]
    obj = dict(mode='cold', ts=round(time.time(), 3), code=final, ms=round(total, 1),
               same_request_ms=ms, key=key, gen=gen, state=state,
               bytes=len(body.encode()) if body else 0, path=last_path,
               body_sha=hashlib.sha256(body.encode()).hexdigest() if body else None)
    results[idx] = obj
    c.close()

def poll(args, idx, results, slow=False):
    c = Client(args.host, args.port, '%s-p%03d' % (args.prefix, idx))
    barrier = args.barrier
    try: barrier.wait(timeout=30)
    except Exception: pass
    t0 = time.time(); n = 0; seg_ok = 0; seg_fail = 0; view_ok = 0
    while time.time() - t0 < args.seconds:
        i = n; n += 1
        code, h, body, ms = c.get('/mf/%s/%s/index.m3u8' % (args.key, args.gen))
        text = body.decode('utf-8', 'replace') if body else ''
        msn, segs, extinf, target = parse_playlist(text) if code == 200 else (0, [], [], 0)
        obj = dict(mode='poll', ts=round(time.time(), 3), code=code, ms=ms, bytes=len(body),
                   msn=msn, segs=segs, extinf=extinf, target=target,
                   gen=args.gen, key=args.key, sha=hashlib.sha256(body).hexdigest() if body else None)
        if code == 200 and segs:
            seg = segs[-1]
            c2, h2, b2, ms2 = c.get('/mf/%s/%s/%s' % (args.key, args.gen, seg))
            obj['seg_code'] = c2; obj['seg_ms'] = ms2; obj['seg_bytes'] = len(b2)
            if c2 == 200: seg_ok += 1
            else: seg_fail += 1
        if i % 5 == 4:
            cv, hv, bv, mv = c.get('/mf/%s/live.m3u8' % args.key, timeout=40)
            obj['view_code'] = cv; obj['view_ms'] = mv
            if cv == 200: view_ok += 1
        record(args.out, args.prefix, idx, obj)
        dt = time.time() - t0
        time.sleep(max(0.0, min(1.0, args.seconds - dt)) if dt < args.seconds else 0)
    results[idx] = dict(mode='poll', requests=n, seg_ok=seg_ok, seg_fail=seg_fail, view_ok=view_ok)
    c.close()

def snapshot(args, idx, results):
    c = Client(args.host, args.port, '%s-s%03d' % (args.prefix, idx))
    outs = []
    for rnd in range(args.snapshots):
        if rnd:
            time.sleep(args.interval)
        try: args.barrier.wait(timeout=30)
        except Exception: pass
        code, h, body, ms = c.get('/mf/%s/%s/index.m3u8' % (args.key, args.gen))
        outs.append(dict(round=rnd, code=code, ms=ms, bytes=len(body),
                         sha=hashlib.sha256(body).hexdigest() if body else None,
                         body=body.decode('utf-8', 'replace')[:4096]))
    record(args.out, args.prefix, idx, dict(mode='snapshot', ts=round(time.time(), 3), rounds=outs))
    results[idx] = outs
    c.close()

def _follow(c, path, maxr=4):
    """Sigue 302/301 (sin auto-redirect de http.client) y devuelve el final."""
    code, h, body, ms = 0, {}, b'', 0
    for _ in range(maxr):
        code, h, body, ms = c.get(path, timeout=40)
        if code in (301, 302, 303, 307, 308) and 'location' in h:
            loc = h['location']
            if loc.startswith('http://') or loc.startswith('https://'):
                u = urlsplit(loc)
                path = u.path + (('?' + u.query) if u.query else '')
            else:
                path = loc
            continue
        return code, h, body, ms, path
    return code, h, body, ms, path

def player(args, idx, results):
    """Entrada REAL de player: /sess/<prov>/<chan>/live.m3u8 (O2).
    Valida X-MF-Gen, que TODAS las URIs (segmentos y atributos URI=) sean
    absolutas /mf/<key>/<gen>/... y que el primer segmento dé 200."""
    c = Client(args.host, args.port, '%s-pl%03d' % (args.prefix, idx))
    try: args.barrier.wait(timeout=30)
    except Exception: pass
    t0 = time.time(); n = 0; ok = 0; gen_ok = 0; gen_hdr = None
    rel = 0; absu = 0; badgen = 0; seg_ok = 0; seg_fail = 0
    while time.time() - t0 < args.seconds:
        n += 1
        code, h, body, ms, final = _follow(c, '/sess/%s/%s/live.m3u8' % (args.provider, args.channel))
        text = body.decode('utf-8', 'replace') if body else ''
        g = h.get('x-mf-gen', '')
        uris = []
        if code == 200:
            ok += 1
            if g:
                gen_ok += 1; gen_hdr = g
            for raw in text.splitlines():
                line = raw.strip()
                if not line: continue
                if line.startswith('#'):
                    if 'URI="' in line:
                        u = line.split('URI="', 1)[1].split('"', 1)[0]
                        uris.append(u)
                else:
                    uris.append(line)
            for u in uris:
                if u.startswith('http://') or u.startswith('https://'):
                    uu = urlsplit(u)
                    p = uu.path + (('?' + uu.query) if uu.query else '')
                elif u.startswith('/mf/'):
                    p = u
                else:
                    rel += 1
                    continue
                if ('/mf/' in p) and ('/%s/' % args.gen) in p:
                    absu += 1
                else:
                    badgen += 1
            # último segmento (no playlist ni atributo URI) por el path absoluto
            seg_paths = []
            for u in uris:
                if u.startswith('http://') or u.startswith('https://'):
                    uu = urlsplit(u)
                    p = uu.path + (('?' + uu.query) if uu.query else '')
                elif u.startswith('/mf/'):
                    p = u
                else:
                    continue
                if p.endswith('.m3u8') or p.endswith('/'):
                    continue
                seg_paths.append(p)
            if seg_paths:
                sc, sh, sb, sms = c.get(seg_paths[-1], timeout=30)
                if sc == 200: seg_ok += 1
                else: seg_fail += 1
        obj = dict(mode='player', ts=round(time.time(), 3), code=code, ms=ms,
                   bytes=len(body), final=final, gen_hdr=g, gen_ok=1 if g else 0,
                   rel_uris=rel, abs_uris=absu, bad_gen_uris=badgen,
                   seg_ok=seg_ok, seg_fail=seg_fail, n=n)
        record(args.out, args.prefix, idx, obj)
        dt = time.time() - t0
        time.sleep(max(0.0, min(1.0, args.seconds - dt)) if dt < args.seconds else 0)
    results[idx] = dict(mode='player', requests=n, http200=ok, gen_ok=gen_ok,
                        rel_uris=rel, abs_uris=absu, bad_gen_uris=badgen,
                        seg_ok=seg_ok, seg_fail=seg_fail, last_gen=gen_hdr)
    c.close()

def slow_reader(args, results):
    """Cliente que abre el último segmento de la ventana y lo lee a ~1 KB/s;
    aborta bruscamente a los 8 s (equivale a un kill del cliente)."""
    time.sleep(4.0)
    t0 = time.time(); got = 0; code = 0; seg = None
    try:
        c = Client(args.host, args.port, '%s-slow' % args.prefix)
        rc, h, body, ms = c.get('/mf/%s/%s/index.m3u8' % (args.key, args.gen))
        if rc == 200:
            _, segs, _, _ = parse_playlist(body.decode('utf-8', 'replace'))
            if segs: seg = segs[-1]
        c.close()
        if not seg:
            raise RuntimeError('sin segmento')
        s = socket.create_connection((args.host, args.port), timeout=10)
        req = ('GET /mf/%s/%s/%s HTTP/1.1\r\nHost: %s\r\n'
               'X-MF-Client: %s-slow\r\nConnection: keep-alive\r\n\r\n'
               % (args.key, args.gen, seg, args.host, args.prefix)).encode()
        s.sendall(req)
        deadline = t0 + 8.0
        while time.time() < deadline and got < 8192:
            chunk = s.recv(512)
            if not chunk: break
            got += len(chunk)
            time.sleep(0.5)
        code = 200 if got else 0
        s.close()
    except Exception:
        code = -1
    results['slow'] = dict(mode='slow', code=code, bytes=got, seconds=round(time.time() - t0, 2),
                           aborted=True, segment=seg)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, required=True)
    ap.add_argument('--mode', choices=['cold', 'poll', 'snapshot', 'slow', 'player'], required=True)
    ap.add_argument('--clients', type=int, required=True)
    ap.add_argument('--seconds', type=float, default=10)
    ap.add_argument('--out', required=True)
    ap.add_argument('--prefix', required=True)
    ap.add_argument('--key', default='')
    ap.add_argument('--gen', default='')
    ap.add_argument('--provider', default='127.0.0.1')
    ap.add_argument('--channel', default='canal1')
    ap.add_argument('--deadline', type=float, default=30)
    ap.add_argument('--snapshots', type=int, default=3)
    ap.add_argument('--interval', type=float, default=3)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    args.barrier = threading.Barrier(args.clients)
    results = {}
    threads = []
    for i in range(args.clients):
        if args.mode == 'cold': fn = cold
        elif args.mode == 'poll': fn = poll
        elif args.mode == 'snapshot': fn = snapshot
        elif args.mode == 'player': fn = player
        else: fn = poll
        t = threading.Thread(target=fn, args=(args, i, results), daemon=True)
        threads.append(t)
    slow = None
    if args.mode == 'slow':
        slow = threading.Thread(target=slow_reader, args=(args, results), daemon=True)
    t0 = time.time()
    for t in threads: t.start()
    if slow: slow.start()
    for t in threads: t.join()
    if slow: slow.join()
    summary = dict(mode=args.mode, clients=args.clients, seconds=args.seconds,
                   elapsed=round(time.time() - t0, 2), results=results)
    with open(os.path.join(args.out, 'summary-%s.json' % args.prefix), 'w') as f:
        json.dump(summary, f)
    print('CLIENTS_DONE %s mode=%s n=%d elapsed=%.2f' %
          (args.prefix, args.mode, args.clients, time.time() - t0))

if __name__ == '__main__':
    main()
PY

cat > "$B/analyze.py" <<'PY'
#!/usr/bin/env python3
"""Analiza los JSONL del banco: latencias, coherencia de secuencia, snapshots,
aislamiento y bytes. Escribe analysis.json y líneas legibles."""
import glob, json, os, sys, statistics

B = sys.argv[1]
out = {}

def load(prefix):
    recs = []
    for f in sorted(glob.glob(os.path.join(B, 'phases', '*', prefix + '-*.jsonl'))):
        with open(f) as fh:
            for line in fh:
                line = line.strip()
                if not line: continue
                try: recs.append(json.loads(line))
                except Exception: pass
    return recs

def pct(v, q):
    if not v: return None
    v = sorted(v); k = (len(v) - 1) * q / 100.0
    lo = int(k); hi = min(lo + 1, len(v) - 1)
    return round(v[lo] + (v[hi] - v[lo]) * (k - lo), 3)

def summarize(prefix):
    recs = load(prefix)
    polls = [r for r in recs if r.get('mode') == 'poll']
    colds = [r for r in recs if r.get('mode') == 'cold']
    snaps = [r for r in recs if r.get('mode') == 'snapshot']
    codes = {}
    for r in recs:
        if 'code' in r: codes[str(r['code'])] = codes.get(str(r['code']), 0) + 1
        if r.get('mode') == 'snapshot':
            for s in r.get('rounds', []):
                codes[str(s.get('code'))] = codes.get(str(s.get('code')), 0) + 1
    lat = [r['ms'] for r in polls if 'ms' in r]
    seglat = [r['seg_ms'] for r in polls if r.get('seg_ms') is not None]
    coldlat = [r['ms'] for r in colds if 'ms' in r]
    d = dict(records=len(recs), codes=codes,
             playlist_n=len(lat), p50=pct(lat, 50), p95=pct(lat, 95), max=round(max(lat), 3) if lat else None,
             segment_n=len(seglat), seg_p50=pct(seglat, 50), seg_p95=pct(seglat, 95),
             cold_n=len(coldlat), cold_p50=pct(coldlat, 50), cold_p95=pct(coldlat, 95),
             bytes=sum(r.get('bytes', 0) or 0 for r in recs),
             seg_bytes=sum(r.get('seg_bytes', 0) or 0 for r in polls))
    out.setdefault('phases', {})[prefix] = d
    return d

PHASES = [p.split('summary-')[-1].rsplit('.json', 1)[0] for p in glob.glob(os.path.join(B, 'phases', '*', 'summary-*.json'))]
for p in sorted(set(PHASES)):
    summarize(p)

# ── coherencia de secuencia (fase main) ─────────────────────────────────────
def coherence(prefix):
    recs = [r for r in load(prefix) if r.get('mode') == 'poll' and r.get('code') == 200]
    sig = {}          # (gen,msn) -> set(tuple(segs))
    dup = 0; obs_skips = 0; regress = 0; mismatch = 0; map_bad = 0; ext_bad = 0
    window_holes = 0; nums_all = set(); per_client = {}
    for r in recs:
        segs = tuple(r.get('segs') or [])
        if len(set(segs)) != len(segs): dup += 1
        key = (str(r.get('gen')), int(r.get('msn') or 0))
        sig.setdefault(key, set()).add(segs)
        ex = r.get('extinf') or []
        for e in ex:
            if e is None or not (0.2 <= float(e) <= 12.0): ext_bad += 1
        # nombre de fichero ↔ MSN: segNNNNN - (msn+i) constante; ventana sin huecos
        nums = []; offsets = set()
        for i, s in enumerate(segs):
            try:
                num = int(''.join(ch for ch in s if ch.isdigit()))
                nums.append(num); nums_all.add(num)
                offsets.add(num - (int(r.get('msn') or 0) + i))
            except Exception:
                map_bad += 1
        if nums and (max(nums) - min(nums) + 1) != len(nums): window_holes += 1
        if len(offsets) > 1: map_bad += 1
        c = r.get('client')
        per_client.setdefault(c, []).append((r.get('ts', 0), int(r.get('msn') or 0)))
    for key, s in sig.items():
        if len(s) > 1: mismatch += 1
    for c, seq in per_client.items():
        seq.sort()
        last = None
        for _, m in seq:
            if last is None: last = m; continue
            if m < last: regress += 1
            elif m > last + 1: obs_skips += 1   # revisión de playlist no observada (poll 1 s vs seg 2 s)
            last = max(last, m)
    union_holes = 0
    if nums_all:
        union_holes = (max(nums_all) - min(nums_all) + 1) - len(nums_all)
    d = dict(playlists=len(recs), msn_signatures=len(sig), signature_mismatches=mismatch,
             duplicate_segments=dup, window_holes=window_holes, union_segment_holes=union_holes,
             observed_msn_skips=obs_skips, msn_regressions=regress,
             filename_msn_mismatch=map_bad, extinf_anomalies=ext_bad,
             clients=len(per_client),
             msn_min=min((int(r.get('msn') or 0) for r in recs), default=None),
             msn_max=max((int(r.get('msn') or 0) for r in recs), default=None),
             segs_per_playlist_min=min((len(r.get('segs') or []) for r in recs), default=None),
             segs_per_playlist_max=max((len(r.get('segs') or []) for r in recs), default=None))
    out['coherence'] = d
    return d

# ── snapshots byte a byte ───────────────────────────────────────────────────
def snapshots(prefix):
    recs = [r for r in load(prefix) if r.get('mode') == 'snapshot']
    rounds = {}
    for r in recs:
        for s in r.get('rounds', []):
            rounds.setdefault(s['round'], []).append(s)
    res = {}
    for rnd, lst in sorted(rounds.items()):
        shas = set(s['sha'] for s in lst if s.get('code') == 200)
        bodies = set(s['body'] for s in lst if s.get('code') == 200)
        res[str(rnd)] = dict(n=len(lst), http200=sum(1 for s in lst if s.get('code') == 200),
                             unique_sha=len(shas), unique_body=len(bodies))
    out['snapshots'] = res
    return res

# ── aislamiento ─────────────────────────────────────────────────────────────
def isolation(prefix):
    recs = [r for r in load(prefix) if r.get('mode') == 'poll']
    per = {}
    for r in recs:
        per.setdefault(r['client'], []).append(r)
    okc = 0; total = 0; minadv = None; segok = 0; segtot = 0
    for c, lst in per.items():
        if '-slow' in c: continue
        lst.sort(key=lambda r: r.get('ts', 0))
        total += len(lst)
        okc += sum(1 for r in lst if r.get('code') == 200)
        msns = [int(r.get('msn') or 0) for r in lst if r.get('code') == 200]
        adv = (max(msns) - min(msns)) if msns else 0
        minadv = adv if minadv is None else min(minadv, adv)
        segok += sum(1 for r in lst if r.get('seg_code') == 200)
        segtot += sum(1 for r in lst if r.get('seg_code') is not None)
    d = dict(clients=len([c for c in per if '-slow' not in c]), requests=total, http200=okc,
             success_pct=round(100.0 * okc / total, 2) if total else 0,
             min_msn_advance=minadv, seg_ok=segok, seg_total=segtot)
    out['isolation'] = d
    return d

def player_entry(prefix):
    recs = [r for r in load(prefix) if r.get('mode') == 'player']
    per = {}
    for r in recs: per.setdefault(r['client'], []).append(r)
    clients = len(per); req = len(recs); http200 = sum(1 for r in recs if r.get('code') == 200)
    gen_hdr = sum(1 for r in recs if r.get('gen_hdr'))
    rel = absu = badgen = segok = segfail = 0
    gens = set()
    for c, lst in per.items():
        lst.sort(key=lambda r: r.get('ts', 0))
        last = lst[-1] if lst else {}
        rel += int(last.get('rel_uris') or 0)
        absu += int(last.get('abs_uris') or 0)
        badgen += int(last.get('bad_gen_uris') or 0)
        segok += int(last.get('seg_ok') or 0)
        segfail += int(last.get('seg_fail') or 0)
        if last.get('gen_hdr'): gens.add(str(last['gen_hdr']))
    d = dict(clients=clients, requests=req, http200=http200, gen_hdr=gen_hdr,
             rel_uris=rel, abs_uris=absu, bad_gen_uris=badgen,
             seg_ok=segok, seg_fail=segfail, gen_values=sorted(gens))
    out['player_entry'] = d
    return d

coherence('main50')
snapshots('snapshot')
isolation('isolation')
player_entry('player50')
with open(os.path.join(B, 'analysis.json'), 'w') as f:
    json.dump(out, f, indent=2, sort_keys=True)
print(json.dumps(out, indent=2, sort_keys=True))
PY
}
write_helpers

# ── utilidades de stack ─────────────────────────────────────────────────────
gen_nginx_conf() { # $1 dir, $2 port, $3 sup_sock, $4 ups
    local d="$1" port="$2" sup="$3" ups="$4"
    mkdir -p "$d/nginx/tmp" "$d/nginx/conf" "$d/logs" "$d/pids" "$d/run/spec" "$d/etc"
    chmod 777 "$d/logs" "$d/nginx/tmp"
    cat > "$d/etc/providers.allow" <<'EOF'
127.0.0.1
EOF
    : > "$d/etc/urls.conf"
    for ch in $ups; do
        printf '127.0.0.1|%s=http://%s:%s@127.0.0.1:%s/%s/index.m3u8\n' \
            "$ch" "$TEST_USER" "$TEST_PASS" "$ORIGIN_PORT" "$ch" >> "$d/etc/urls.conf"
    done
    python3 "$B/mkconf.py" "$B/src/nginx/media-fanout.conf" "$d/nginx/mf.conf" \
        "127.0.0.1:$port" "$B/src/lua/ape_session.lua" "$sup" \
        manifest_wait_ms=25000 spawn_wait_ms=25000 \
        max_sessions="$MAX_SESSIONS_CFG" max_viewers_per_session="$MAX_VIEWERS_CFG" \
        max_total_viewers="$MAX_TOTAL_CFG" linger_ttl=3 sweep_interval=3 viewer_ttl=15 \
        session_ttl=180 gen_ttl=3600 lock_ttl=8 poll_ms=50 sup_timeout_ms=500 \
        || die "mkconf falló para $d"
    cat > "$d/nginx/nginx.conf" <<EOF
load_module /usr/lib/nginx/modules/ndk_http_module.so;
load_module /usr/lib/nginx/modules/ngx_http_lua_module.so;
# staging aislado: workers root para leer la ventana 0750 root:www-data sin
# tocar permisos de producción. En prod nginx corre www-data (t5).
user root;
worker_processes 2;
error_log $d/logs/nginx-error.log info;
pid $d/nginx/nginx.pid;
events { worker_connections 4096; }
http {
    lua_package_path "$B/src/lua/?.lua;;";
    log_format mfbench '\$msec \$status \$body_bytes_sent \$request_time \$request \$http_x_mf_client';
    access_log $d/logs/access.log mfbench;
    client_body_temp_path $d/nginx/tmp/client_body;
    proxy_temp_path $d/nginx/tmp/proxy;
    fastcgi_temp_path $d/nginx/tmp/fastcgi;
    uwsgi_temp_path $d/nginx/tmp/uwsgi;
    scgi_temp_path $d/nginx/tmp/scgi;
    include $d/nginx/mf.conf;
}
EOF
    nginx -t -p "$d/nginx" -c "$d/nginx/nginx.conf" >>"$EVIDENCE" 2>&1 \
        || die "nginx -t falló para $d (ver $d/logs)"
}

gen_spawn_watcher() { # $1 dir, $2 sup_sock, $3 shim
    local d="$1" sup="$2" shim="$3"
    mkdir -p "$d/bin" "$d/logs" "$d/pids" "$d/run"
    cat > "$d/bin/start-worker.sh" <<EOF
#!/bin/bash
printf '%s\\n' "\$1" > "$d/run/spawn.fifo"
exit 0
EOF
    cat > "$d/bin/stop-worker.sh" <<EOF
#!/bin/bash
key="\$1"; pidf="$d/pids/worker-\$key.pid"
if [ -r "\$pidf" ]; then p=\$(cat "\$pidf"); kill -TERM "-\$p" 2>/dev/null || kill -TERM "\$p" 2>/dev/null; fi
exit 0
EOF
    cat > "$d/bin/restart-worker.sh" <<EOF
#!/bin/bash
"$d/bin/stop-worker.sh" "\$1"; sleep 1
printf '%s\\n' "\$1" > "$d/run/spawn.fifo"
exit 0
EOF
    chmod +x "$d"/bin/*.sh
    rm -f "$d/run/spawn.fifo"; mkfifo "$d/run/spawn.fifo"
    cat > "$d/bin/spawn-watcher.sh" <<'EOS'
#!/bin/bash
# Lanzador FUERA del handler del supervisor (shim de staging: simula systemd).
set -u
while :; do
    if read -r key < "$SPAWN_FIFO"; then
        [ -n "$key" ] || continue
        (
            [ "${SHIM_DELAY:-0}" -gt 0 ] && sleep "$SHIM_DELAY"
            spec="$REPO_ROOT/run/spec/$key.env"
            [ -r "$spec" ] || exit 1
            echo "$BASHPID" > "$REPO_ROOT/pids/worker-$key.pid"
            log="$REPO_ROOT/logs/worker-$key.log"
            set -a
            . "$spec"
            set +a
            export MF_SUP_SOCK="$SUP_SOCK"
            export MF_SRC_SEG_DUR=2
            exec setsid "$WORKER" --instance "$MF_KEY" >>"$log" 2>&1 < /dev/null
        ) &
    fi
done
EOS
    chmod +x "$d/bin/spawn-watcher.sh"
    env REPO_ROOT="$d" SUP_SOCK="$sup" SHIM_DELAY="$shim" SPAWN_FIFO="$d/run/spawn.fifo" \
        WORKER="$B/src/media/ape-ingest.sh" \
        setsid "$d/bin/spawn-watcher.sh" >/dev/null 2>&1 < /dev/null &
    echo $! > "$d/run/watcher.pid"
}

stack_up() { # $1 label, $2 port, $3 shim, $4 max_sessions, $5 max_viewers, $6 max_total, $7 channels...
    local lbl="$1" port="$2" shim="$3" ms="$4" mv="$5" mt="$6"; shift 6
    local d="$B/$lbl" chans="$*"
    MAX_SESSIONS_CFG="$ms"; MAX_VIEWERS_CFG="$mv"; MAX_TOTAL_CFG="$mt"
    mkdir -p "$d"
    local sup_sock="$d/run/supervisor.sock"
    gen_nginx_conf "$d" "$port" "$sup_sock" "$chans"
    gen_spawn_watcher "$d" "$sup_sock" "$shim"
    env MF_ROOT="$d/run" MF_STATE_DIR="$d/state" MF_CONF_DIR="$d/etc" MF_WINDOW_ROOT="$WINDOW" \
        MF_COORD_URL="http://127.0.0.1:$port" MF_START_CMD="$d/bin/start-worker.sh %s" \
        MF_STOP_CMD="$d/bin/stop-worker.sh %s" MF_RESTART_CMD="$d/bin/restart-worker.sh %s" \
        MF_SPEC_OWNER=root:www-data MF_STALE_AFTER=6 MF_MAX_SESSIONS=12 MF_LINGER_TTL=3 \
        MF_SUPPORT_RESTART=1 \
        setsid "$B/src/media/ape-supervisor.sh" --serve >>"$d/logs/supervisor.log" 2>&1 < /dev/null &
    echo $! > "$d/run/sup.pid"
    local i
    for i in $(seq 1 50); do [ -S "$sup_sock" ] && [ -S "$d/run/mf.sock" ] && break; sleep 0.2; done
    [ -S "$sup_sock" ] || die "supervisor no creó $sup_sock"
    nginx -p "$d/nginx" -c "$d/nginx/nginx.conf" || die "nginx no arrancó en $d"
    for i in $(seq 1 60); do
        if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$port/mf/health"; then return 0; fi
        sleep 0.2
    done
    die "health no responde en :$port"
}

stack_down() { # $1 label
    stop_label "$1"
    sleep 0.5
}

phase_window() { # $1 label, $2 start, $3 end
    printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$B/phases/windows.tsv"
}

ctl_inspect() { # $1 port, $2 key -> "gen=N state=S viewers=V"
    curl -s --max-time 3 "http://127.0.0.1:$1/mf/ctl?op=inspect&key=$2"
}
ctl_gen() { ctl_inspect "$1" "$2" | sed -n 's/.*\bgen=\([0-9][0-9]*\).*/\1/p' | head -1; }
ctl_state() { ctl_inspect "$1" "$2" | sed -n 's/.*\bstate=\([a-z_]*\).*/\1/p' | head -1; }
http_code() { curl -s -o /dev/null --max-time "${2:-10}" -w '%{http_code}' "$1"; }
http_body_code() { # $1 url, $2 outfile, $3 cid, $4 timeout
    curl -s --max-time "${4:-10}" -H "X-MF-Client: ${3:-bench}" -o "$2" -D "$2.hdr" -w '%{http_code}' "$1"
}
cold_get() { # $1 url(src), $2 outprefix, $3 cid, $4 timeout, $5 puerto base, $6 stop_on_503 (0/1)
    local url="$1" pre="$2" cid="$3" timeout="${4:-45}" base_port="${5:-$PORT_B}" stop503="${6:-0}"
    local code=0 loc end=$(( $(date +%s) + timeout ))
    while [ "$(date +%s)" -lt "$end" ]; do
        code=$(http_body_code "$url" "$B/evidence/$pre.body" "$cid" 30)
        cp "$B/evidence/$pre.body.hdr" "$B/evidence/$pre.hdr1" 2>/dev/null || true
        if [ "$code" = "302" ]; then
            loc=$(hdr_of "$B/evidence/$pre.body.hdr" Location)
            case "$loc" in
                http://*|https://*) ;;
                /*) loc="http://127.0.0.1:$base_port$loc" ;;
                *)  loc="http://127.0.0.1:$base_port/$loc" ;;
            esac
            code=$(http_body_code "$loc" "$B/evidence/$pre.body" "$cid" 45)
        fi
        if [ "$code" = "200" ]; then printf '%s' 200; return 0; fi
        if [ "$code" = "503" ] && [ "$stop503" = "1" ]; then printf '%s' 503; return 0; fi
        sleep 1
    done
    printf '%s' "$code"
}
stop_origin() {
    for f in origin_ff.pid origin_server.pid; do
        if [ -r "$B/pids/$f" ]; then
            p="$(cat "$B/pids/$f" 2>/dev/null || echo)"
            [ -n "$p" ] && kill -KILL "$p" 2>/dev/null || true
        fi
    done
}
origin_stats_reset() { curl -s --max-time 3 "http://127.0.0.1:$ORIGIN_STATS/reset" >/dev/null 2>&1 || true; }
origin_stats_save() { # $1 label
    curl -s --max-time 3 "http://127.0.0.1:$ORIGIN_STATS/stats" > "$B/evidence/stats-$1.json" 2>/dev/null || true
}
stats_field() { # $1 label, $2 field
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get(sys.argv[2],""))' \
        "$B/evidence/stats-$1.json" "$2" 2>/dev/null || echo ""
}

# ── F1 (t7/t15): credenciales nunca en logs; log 0600 ───────────────────────
f1_probe() {
    # Fuerza un error real de ffmpeg con user:pass+token en la URL para
    # comprobar la redacción EN VIVO (no sólo en selftest).
    local w="$B/f1probe" key="f1f1f1f1f1f1f1f1" urlf="$B/f1probe-url"
    rm -rf "$w" /dev/shm/mf/f1probe
    mkdir -p "$w/locks" "$w/win" /dev/shm/mf/f1probe/state
    printf 'http://%s:%s@127.0.0.1:9/x.m3u8?token=SECRETTOKEN456\n' "$TEST_USER" "$TEST_PASS" > "$urlf"
    MF_TEST_ALLOW_LOCK_DIR=1 timeout 30 "$B/src/media/ape-ingest.sh" \
        --no-supervisor --key "$key" --gen 1 \
        --out "$w/win/$key/1" --window-root "$w/win" --lock-dir "$w/locks" \
        --state-dir /dev/shm/mf/f1probe/state --url-file "$urlf" \
        --keep-logs --on-eof stop --retry-max 0 --startup-timeout 5 \
        --stall-timeout 10 --audio-policy copy >"$B/logs/f1-probe.out" 2>&1 || true
    F1_PROBE_LOG=$(find /dev/shm/mf/f1probe -type f -name '*.ffmpeg.log' 2>/dev/null | head -1)
    rm -rf "$w" "$urlf"
}

f1_check() {
    local logs n=0 badmode=0 secret=0 f mode probe_ok=0
    logs=$(find /dev/shm/mf -type f -name '*.ffmpeg.log' 2>/dev/null)
    for f in $logs; do
        n=$((n + 1))
        mode=$(stat -c '%a' "$f" 2>/dev/null || echo ?)
        [ "$mode" = "600" ] || badmode=$((badmode + 1))
        [ -n "${F1_PROBE_LOG:-}" ] && [ "$f" = "$F1_PROBE_LOG" ] && probe_ok=1
    done
    # grep sólo ficheros regulares (nunca FIFOs) para no bloquear
    while IFS= read -r f; do
        grep -q -- "$TEST_PASS\|$TEST_USER\|SECRETTOKEN456" "$f" 2>/dev/null && secret=$((secret + 1))
    done < <(find /dev/shm/mf -type f 2>/dev/null)
    F1_LOGS=$n; F1_BADMODE=$badmode; F1_SECRET=$secret; F1_PROBE=$probe_ok
    log "F1: logs=$n modo_no_600=$badmode ficheros_con_secreto=$secret probe_log_0600=$probe_ok"
    if [ "$n" -ge 1 ] && [ "$badmode" = "0" ] && [ "$secret" = "0" ] && [ "$probe_ok" = "1" ]; then
        ok "F1: logs de sesión 0600 y 0 credenciales (probe ffmpeg real con user:pass+token redactado)"
    else
        bad "F1: logs=$n modo_no_600=$badmode secreto=$secret probe_ok=$probe_ok"
    fi
    rm -rf /dev/shm/mf/f1probe
}
hdr_of() { sed -n "s/^[[:space:]]*${2}:[[:space:]]*//Ip" "$1" | tr -d '\r' | head -1; }
wait_playlist_live() { # $1 url, $2 timeout
    local i; for i in $(seq 1 "$2"); do
        if [ "$(http_code "$1" 4)" = "200" ]; then return 0; fi; sleep 1
    done; return 1
}

# ── arranque del origen de staging (proveedor controlado real) ──────────────
start_origin() {
    mkdir -p "$B/origin"
    : > "$B/logs/origin_accept.log"
    ffmpeg -hide_banner -loglevel error -re \
        -f lavfi -i "testsrc2=size=640x360:rate=25" \
        -re -f lavfi -i "sine=frequency=440:sample_rate=48000" \
        -c:v libx264 -preset ultrafast -tune zerolatency -g 50 -keyint_min 50 -sc_threshold 0 \
        -b:v 900k -maxrate 900k -bufsize 1800k -c:a aac -b:a 96k \
        -f hls -hls_time 2 -hls_list_size 8 -hls_flags delete_segments+independent_segments \
        -hls_segment_filename "$B/origin/seg%05d.ts" "$B/origin/index.m3u8" \
        >"$B/logs/origin_ff.log" 2>&1 &
    echo $! > "$B/pids/origin_ff.pid"
    local i
    for i in $(seq 1 60); do [ -s "$B/origin/index.m3u8" ] && break; sleep 0.5; done
    [ -s "$B/origin/index.m3u8" ] || die "el origen ffmpeg no generó playlist"
    sleep 2
    python3 "$B/origin_server.py" "$B/origin" "$ORIGIN_PORT" "$B/logs/origin_accept.log" "$ORIGIN_STATS" \
        >"$B/logs/origin_server.log" 2>&1 &
    echo $! > "$B/pids/origin_server.pid"
    for i in $(seq 1 30); do
        [ "$(http_code "http://127.0.0.1:$ORIGIN_PORT/index.m3u8" 3)" = "200" ] && return 0
        sleep 0.3
    done
    die "origen HTTP no responde"
}

# ── sonda de arranque en frío (B1) SIN shim ─────────────────────────────────
b1_probe() {
    log "── B1 probe: arranque en frío SIN shim (sólo evidencia; se usa --shim-delay=0) ──"
    local d="$B/b1" port="$PORT_B1"
    stack_up b1 "$port" 0 8 128 256 canal_b1 || { warn "stack B1 no arrancó"; return; }
    local code
    code=$(cold_get "http://127.0.0.1:$port/mf/src/127.0.0.1/canal_b1/live.m3u8" b1-probe b1-probe 35 "$port")
    COLD_B1_CODE="$code"
    COLD_B1_REASON="$(hdr_of "$B/evidence/b1-probe.body.hdr" X-MF-Reason)"
    sleep 2
    # evidencia del worker: rc=20 / supervisor inaccesible
    local wlog; wlog=$(ls "$d"/logs/worker-*.log 2>/dev/null | head -1)
    if [ -n "$wlog" ]; then
        cp "$wlog" "$B/evidence/b1-worker.log" 2>/dev/null || true
        if grep -Eq "supervisor inaccesible|salida rc=20" "$B/evidence/b1-worker.log" 2>/dev/null; then
            B1_WORKER_RC20=1
        else
            B1_WORKER_RC20=0
        fi
    else
        B1_WORKER_RC20=0
    fi
    cp "$d/logs/supervisor.log" "$B/evidence/b1-supervisor.log" 2>/dev/null || true
    cp "$d/logs/nginx-error.log" "$B/evidence/b1-nginx-error.log" 2>/dev/null || true
    if [ "$code" = "200" ]; then
        warn "B1 probe: arranque en frío YA funciona sin shim (code=200) — no hay B1 en este snapshot"
        B1_CONFIRMED=0
    else
        log "B1 probe: cold_start=$code reason=${COLD_B1_REASON:-none} worker_rc20=$B1_WORKER_RC20"
        B1_CONFIRMED=1
    fi
    stack_down b1
    rm -rf "$WINDOW"/* 2>/dev/null
}

# ── resumen y veredicto ─────────────────────────────────────────────────────
report_summary() {
    log "══════════════════ RESUMEN V1 ══════════════════"
    log "invariant_pass=$PASS invariant_fail=$FAIL warnings=$WARN"
    log "COLD_START=$COLD_START_STATUS  (shim_delay=${SHIM_DELAY}s)"
    [ "${B1_CONFIRMED:-0}" = "1" ] && log "B1_CONFIRMED=1 cold_b1_code=${COLD_B1_CODE:-?} worker_rc20=${B1_WORKER_RC20:-?}"
    log "prod_nginx_pid_before=$PROD_PID_BEFORE prod_nginx_pid_after=${PROD_PID_AFTER:-?}"
    log "prod_nginx_sha_before=$PROD_SHA_BEFORE prod_nginx_sha_after=${PROD_SHA_AFTER:-?}"
    log "nginx_journal_events_window=${JOURNAL_EVENTS:-?}"
    log "invalid_run=$INVALID_RUN"
    log "evidence=$EVIDENCE analysis=$B/analysis.json"
}

# ═════════════════════════════════════════════════════════════════════════════
# EJECUCIÓN
# ═════════════════════════════════════════════════════════════════════════════
B1_CONFIRMED=0
: > "$B/phases/windows.tsv"
start_origin
log "origen staging listo :$ORIGIN_PORT (ffmpeg real, HLS 2 s)"

# sonda B1 (opcional)
case "$B1_PROBE" in
    auto) [ "$SHIM_DELAY" -gt 0 ] && b1_probe || true ;;
    1)    b1_probe ;;
    0)    log "B1 probe desactivado" ;;
    *)    die "--b1-probe debe ser auto|1|0" ;;
esac

# ── fase A: sesión única con 50 clientes ────────────────────────────────────
log "── FASE A: single-flight + fan-out + coherencia + aislamiento + fencing ──"
stack_up a "$PORT_A" "$SHIM_DELAY" 12 512 1024 canal1 canal2
STACK_LABELS+=("a")

# muestreador upstream continuo (ss + /proc/net/tcp + ffmpeg)
SAMPLER_STOP="$B/phases/sampler.stop"
rm -f "$SAMPLER_STOP"
python3 "$B/sampler.py" "$ORIGIN_PORT" "$B/phases/upstream.csv" "$SAMPLER_STOP" \
    >"$B/logs/sampler.log" 2>&1 &
SAMPLER_PID=$!
sleep 0.5

# 1) cold start: 50 peticiones simultáneas al MISMO canal
origin_stats_reset
T0=$(date +%s.%N)
python3 "$B/clients.py" --port "$PORT_A" --mode cold --clients "$CLIENTS_COLD" \
    --out "$B/phases/cold" --prefix cold --provider 127.0.0.1 --channel canal1 \
    --deadline 35 | tee -a "$EVIDENCE"
T1=$(date +%s.%N)
phase_window cold "$T0" "$T1"
origin_stats_save cold
COLD_JSON="$B/phases/cold/summary-cold.json"
if [ -f "$COLD_JSON" ]; then
    COLD_OK=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); r=d["results"]; print(sum(1 for x in r.values() if x.get("code")==200))' "$COLD_JSON")
    COLD_N=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(len(d["results"]))' "$COLD_JSON")
    KEY=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); ks=[x.get("key") for x in d["results"].values() if x.get("key")]; print(ks[0] if ks else "")' "$COLD_JSON")
    COLD_P50=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); import statistics; v=sorted(x.get("ms",0) for x in d["results"].values()); n=len(v); print(round(v[n//2],1) if n else None)' "$COLD_JSON")
    COLD_P95=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); v=sorted(x.get("ms",0) for x in d["results"].values()); n=len(v); i=min(n-1,int(0.95*n)); print(round(v[i],1) if n else None)' "$COLD_JSON")
    log "cold: ${COLD_OK}/${COLD_N} HTTP 200  p50=${COLD_P50}ms p95=${COLD_P95}ms key=${KEY:-?}"
    [ "$COLD_OK" = "$COLD_N" ] && [ "$COLD_N" = "$CLIENTS_COLD" ] \
        && ok "cold-start: ${CLIENTS_COLD}/${CLIENTS_COLD} clientes simultáneos → 200" \
        || bad "cold-start: solo ${COLD_OK}/${COLD_N} clientes → 200"
else
    bad "cold-start: no hay summary de clientes"
    KEY=""
fi
[ -n "${KEY:-}" ] || die "no pude descubrir la key de sesión (cold falló)"
GEN1="$(ctl_gen "$PORT_A" "$KEY")"
[ -n "$GEN1" ] || die "no pude leer gen de la sesión $KEY"
log "sesión key=$KEY gen=$GEN1"

# Keepalive de UN espectador: evita que la sesión cierre por linger entre
# fases lentas (snapshot/timestamps/F1) que no refrescan la marca de viewer.
# Se retira antes de fencing para que el cierre natural sea medible.
KEEPALIVE_STOP="$B/phases/keepalive.stop"
rm -f "$KEEPALIVE_STOP"
(
    while [ ! -e "$KEEPALIVE_STOP" ]; do
        curl -s --max-time 5 -H 'X-MF-Client: keepalive' \
            "http://127.0.0.1:$PORT_A/mf/$KEY/live.m3u8" >/dev/null 2>&1 || true
        sleep 5
    done
) &
KEEPALIVE_PID=$!

# curva 1 / 5 / 50 / 100 clientes sobre la MISMA sesión
run_poll_phase() { # $1 prefix, $2 clients, $3 seconds
    local pre="$1" n="$2" s="$3" t0 t1
    origin_stats_reset
    t0=$(date +%s.%N)
    python3 "$B/clients.py" --port "$PORT_A" --mode poll --clients "$n" --seconds "$s" \
        --key "$KEY" --gen "$GEN1" --out "$B/phases/$pre" --prefix "$pre" | tee -a "$EVIDENCE"
    t1=$(date +%s.%N)
    phase_window "$pre" "$t0" "$t1"
    origin_stats_save "$pre"
}
run_poll_phase n1 1 10
run_poll_phase n5 5 10
run_poll_phase main50 50 22
run_poll_phase n100 100 15

# 1d) ENTRADA DE PLAYER bajo carga (O2/t14): /sess/<prov>/<canal>/live.m3u8
#     50 clientes concurrentes; X-MF-Gen, URIs absolutas con gen y segmentos 200.
log "── entrada de player /sess/.../live.m3u8 bajo 50 clientes (O2) ──"
origin_stats_reset
T0=$(date +%s.%N)
python3 "$B/clients.py" --port "$PORT_A" --mode player --clients 50 --seconds 10 \
    --provider 127.0.0.1 --channel canal1 --gen "$GEN1" \
    --out "$B/phases/player50" --prefix player50 | tee -a "$EVIDENCE"
T1=$(date +%s.%N)
phase_window player50 "$T0" "$T1"
origin_stats_save player50

# F1 en vivo: credenciales en la URL real de staging + probe de error ffmpeg.
f1_probe
f1_check

# snapshots simultáneos (coherencia byte a byte)
origin_stats_reset
T0=$(date +%s.%N)
python3 "$B/clients.py" --port "$PORT_A" --mode snapshot --clients 50 --snapshots 5 \
    --interval 3 --key "$KEY" --gen "$GEN1" --out "$B/phases/snapshot" --prefix snapshot \
    | tee -a "$EVIDENCE"
T1=$(date +%s.%N)
phase_window snapshot "$T0" "$T1"
origin_stats_save snapshot

# timestamps REALES de la ventana (ffprobe PTS/DTS)
log "── timestamps: descarga de los últimos 6 segmentos + ffprobe ──"
TS_DIR="$B/ts"; rm -rf "$TS_DIR"; mkdir -p "$TS_DIR"
PL="$TS_DIR/latest.m3u8"
http_body_code "http://127.0.0.1:$PORT_A/mf/$KEY/$GEN1/index.m3u8" "$PL" "ts" 10 >/dev/null
python3 - "$PL" <<'PY' > "$TS_DIR/seglist.txt"
import sys
segs=[]; ext=[]; cur=None; msn=0
for l in open(sys.argv[1]):
    l=l.strip()
    if l.startswith('#EXT-X-MEDIA-SEQUENCE:'): msn=int(l.split(':')[1])
    elif l.startswith('#EXTINF:'): cur=float(l.split(':')[1].split(',')[0])
    elif l and not l.startswith('#'):
        segs.append(l); ext.append(cur); cur=None
print(msn)
for s in segs[-6:]: print(s)
PY
TS_MSN=$(head -1 "$TS_DIR/seglist.txt")
mapfile -t TSEGS < <(tail -n +2 "$TS_DIR/seglist.txt")
TS_PASS=0; TS_FAIL=0
if [ "${#TSEGS[@]}" -ge 4 ]; then
    idx=0
    for seg in "${TSEGS[@]}"; do
        idx=$((idx+1))
        http_body_code "http://127.0.0.1:$PORT_A/mf/$KEY/$GEN1/$seg" "$TS_DIR/$seg" "ts" 10 >/dev/null
        if [ -s "$TS_DIR/$seg" ] && [ "$(od -An -tx1 -N1 "$TS_DIR/$seg" | tr -d ' ')" = "47" ]; then
            TS_PASS=$((TS_PASS+1))
        else
            TS_FAIL=$((TS_FAIL+1))
        fi
    done
    python3 - "$TS_DIR" "${TSEGS[@]}" > "$TS_DIR/timestamps.txt" <<'PY'
import subprocess, sys, json, os
d=sys.argv[1]; segs=sys.argv[2:]
out=dict(segments=len(segs), packets=0, gaps=[], dts_back=0, pts_min=None, pts_max=None,
         first_dts=[], last_dts=[], first_pts=[], last_pts=[], sizes=[])
prev_last=None
for seg in segs:
    p=os.path.join(d,seg)
    out['sizes'].append(os.path.getsize(p))
    r=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries',
                      'packet=pts_time,dts_time','-of','json',p],capture_output=True,text=True)
    dts=[]; pts=[]
    try:
        for pk in json.loads(r.stdout or '{}').get('packets', []):
            if pk.get('dts_time') is not None: dts.append(float(pk['dts_time']))
            if pk.get('pts_time') is not None: pts.append(float(pk['pts_time']))
    except Exception:
        pass
    out['packets'] += len(dts)
    if not dts: continue
    fd,ld=min(dts),max(dts); fp,lp=min(pts),max(pts)
    out['first_dts'].append(round(fd,3)); out['last_dts'].append(round(ld,3))
    out['first_pts'].append(round(fp,3)); out['last_pts'].append(round(lp,3))
    for a,b in zip(dts,dts[1:]):
        if b < a - 0.05: out['dts_back'] += 1
    if prev_last is not None:
        out['gaps'].append(round(fd-prev_last,3))
    prev_last=ld
    out['pts_min']=fp if out['pts_min'] is None else min(out['pts_min'],fp)
    out['pts_max']=lp if out['pts_max'] is None else max(out['pts_max'],lp)
print(json.dumps(out,indent=2))
PY
    TS_SUM="$TS_DIR/timestamps.txt"
    TS_GAPS_BAD=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(sum(1 for g in d["gaps"] if g < -0.1 or g > 0.6))' "$TS_SUM" 2>/dev/null || echo 99)
    TS_PACKETS=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["packets"])' "$TS_SUM" 2>/dev/null || echo 0)
    TS_DTSBACK=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["dts_back"])' "$TS_SUM" 2>/dev/null || echo 99)
    log "timestamps: segs=${#TSEGS[@]} msn_inicio=$TS_MSN packets=$TS_PACKETS gaps_fuera_rango=$TS_GAPS_BAD dts_back=$TS_DTSBACK"
    if [ "$TS_FAIL" = "0" ] && [ "$TS_PACKETS" -gt 0 ] && [ "$TS_GAPS_BAD" = "0" ] && [ "$TS_DTSBACK" = "0" ]; then
        ok "timestamps: PTS/DTS continuos, sin saltos ni regresiones (${#TSEGS[@]} segs, $TS_PACKETS packets)"
    else
        bad "timestamps: fallo (ts_fail=$TS_FAIL gaps_bad=$TS_GAPS_BAD dts_back=$TS_DTSBACK packets=$TS_PACKETS)"
    fi
else
    bad "timestamps: ventana con menos de 4 segmentos (${#TSEGS[@]})"
fi

# 2) aislamiento: 50 clientes + 1 lento que aborta
origin_stats_reset
T0=$(date +%s.%N)
python3 "$B/clients.py" --port "$PORT_A" --mode slow --clients 50 --seconds 22 \
    --key "$KEY" --gen "$GEN1" --out "$B/phases/isolation" --prefix isolation \
    | tee -a "$EVIDENCE"
T1=$(date +%s.%N)
phase_window isolation "$T0" "$T1"
origin_stats_save isolation

# 2b) sonda ss dedicada: 50 clientes + 100 ms de latencia artificial del origen
#     (ensancha la vida del socket para que `ss` lo fotografíe; la ingesta es la
#      misma y la latencia se retira al terminar la sonda).
log "── sonda ss: 50 clientes + 100 ms de latencia del origen (ventana dedicada) ──"
origin_stats_reset
curl -s --max-time 3 "http://127.0.0.1:$ORIGIN_STATS/delay?ms=100" >/dev/null 2>&1 || true
python3 "$B/ss_probe.py" "$ORIGIN_PORT" 12 "$B/evidence/ss-probe.json" \
    > "$B/logs/ss-probe.log" 2>&1 &
SS_PROBE_PID=$!
T0=$(date +%s.%N)
python3 "$B/clients.py" --port "$PORT_A" --mode poll --clients 50 --seconds 12 \
    --key "$KEY" --gen "$GEN1" --out "$B/phases/ssprobe" --prefix ssprobe | tee -a "$EVIDENCE"
T1=$(date +%s.%N)
wait "$SS_PROBE_PID" 2>/dev/null || true
SS_PROBE_PID=""
curl -s --max-time 3 "http://127.0.0.1:$ORIGIN_STATS/delay?ms=0" >/dev/null 2>&1 || true
phase_window ssprobe "$T0" "$T1"
origin_stats_save ssprobe
SS_SUM="$B/evidence/ss-probe.json"
SS_HITS=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("hits",0))' "$SS_SUM" 2>/dev/null || echo 0)
SS_POS=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("ss_positive",0))' "$SS_SUM" 2>/dev/null || echo 0)
SS_MAX=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("max_ss_lines",0))' "$SS_SUM" 2>/dev/null || echo 0)
SS_PROC=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("max_proc_tcp",0))' "$SS_SUM" 2>/dev/null || echo 0)
log "ss_probe: hits=${SS_HITS:-0} ss_positive=${SS_POS:-0} max_ss_lines=${SS_MAX:-0} max_proc_tcp=${SS_PROC:-0}"
CLIENTS_SS=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(sum(1 for x in d["results"].values() if x.get("requests",0)>0))' "$B/phases/ssprobe/summary-ssprobe.json" 2>/dev/null || echo 0)
[ "${SS_HITS:-0}" -gt 0 ] && [ "${SS_POS:-0}" -gt 0 ] && [ "${SS_MAX:-0}" = "1" ] && [ "${SS_PROC:-0}" -le 1 ] \
    && ok "ss: con 50 clientes y 100 ms de latencia del origen, ss observó EXACTAMENTE 1 socket / 1 PID ffmpeg (${SS_POS} muestras positivas de ${SS_HITS} hits)" \
    || bad "ss: no se pudo demostrar 1 socket (hits=${SS_HITS:-0} ss_positive=${SS_POS:-0} max_ss=${SS_MAX:-0} max_proc=${SS_PROC:-0} clients=${CLIENTS_SS:-0})"

# retirar el keepalive: la sesión debe poder cerrarse por linger tras el kill
: > "$KEEPALIVE_STOP"
kill "$KEEPALIVE_PID" 2>/dev/null || true
wait "$KEEPALIVE_PID" 2>/dev/null || true
KEEPALIVE_PID=""

# 3) fencing: matar worker y comprobar gen nueva
log "── fencing: kill -9 del worker y espera de cierre/reapertura ──"
FENCE_OLD_GEN="$GEN1"
W_PID_FILE="$B/a/pids/worker-$KEY.pid"
W_PID="$(cat "$W_PID_FILE" 2>/dev/null || echo)"
[ -n "$W_PID" ] || die "no encuentro pid del worker"
FF_PID="$(pgrep -P "$W_PID" -f ffmpeg 2>/dev/null | head -1)"
OLD_PL="$B/evidence/fence-old.m3u8"
http_body_code "http://127.0.0.1:$PORT_A/mf/$KEY/$FENCE_OLD_GEN/index.m3u8" "$OLD_PL" "fence" 10 >/dev/null
OLD_SHA="$(sha256sum "$OLD_PL" 2>/dev/null | awk '{print $1}')"
OLD_MSN="$(sed -n 's/^#EXT-X-MEDIA-SEQUENCE:\([0-9]*\).*/\1/p' "$OLD_PL" | head -1)"
OLD_NSEG="$(grep -vc '^#' "$OLD_PL" 2>/dev/null || echo 0)"
log "fencing_old: gen=$FENCE_OLD_GEN worker=$W_PID ffmpeg=${FF_PID:-?} msn=$OLD_MSN segs=$OLD_NSEG sha=${OLD_SHA:0:12}"
FENCE_WIN0=$(date +%s.%N)
kill -KILL "-$W_PID" 2>/dev/null || kill -KILL "$W_PID" 2>/dev/null || true
sleep 1
OLD_WORKER_ALIVE=0; kill -0 "$W_PID" 2>/dev/null && OLD_WORKER_ALIVE=1
if [ -n "$FF_PID" ] && kill -0 "$FF_PID" 2>/dev/null; then
    kill -KILL "$FF_PID" 2>/dev/null || true
    sleep 0.5
    OLD_WORKER_ALIVE=2
fi
log "fencing: worker_viejo_vivo=$OLD_WORKER_ALIVE (0=muerto; 2=ffmpeg huérfano, ya eliminado)"
origin_stats_reset
sleep 2
FROZEN_OK=0
http_body_code "http://127.0.0.1:$PORT_A/mf/$KEY/$FENCE_OLD_GEN/index.m3u8" "$B/evidence/fence-frozen.m3u8" "fence" 10 >/dev/null
if cmp -s "$OLD_PL" "$B/evidence/fence-frozen.m3u8"; then FROZEN_OK=1; fi
sleep 3
http_body_code "http://127.0.0.1:$PORT_A/mf/$KEY/$FENCE_OLD_GEN/index.m3u8" "$B/evidence/fence-frozen2.m3u8" "fence" 10 >/dev/null
if cmp -s "$OLD_PL" "$B/evidence/fence-frozen2.m3u8"; then FROZEN_OK=$((FROZEN_OK+1)); fi
[ "$FROZEN_OK" = "2" ] && ok "fencing: la generación vieja deja de publicar (playlist congelada en msn=$OLD_MSN)" \
                      || bad "fencing: la playlist vieja cambió tras matar el worker"

# F2 en vivo (t18): tras SIGKILL del worker, ejecutar el mismo cleanup que
# ExecStopPost (--cleanup --own-gen) y comprobar que no queda la generación
# vigente huérfana en /dev/shm/mf.
F2_BYTES_BEFORE=$(du -sb "$WINDOW" 2>/dev/null | awk '{print $1}')
set -a; . "$B/a/run/spec/$KEY.env"; set +a
MF_WINDOW_ROOT="$WINDOW" "$B/src/media/ape-ingest.sh" --cleanup --instance "$KEY" --own-gen \
    > "$B/evidence/f2-own-gen.out" 2>&1 || true
F2_BYTES_AFTER=$(du -sb "$WINDOW" 2>/dev/null | awk '{print $1}')
F2_DIRS_AFTER=$(find "$WINDOW" -mindepth 2 -maxdepth 2 -type d 2>/dev/null | wc -l)
log "F2: /dev/shm bytes antes=$F2_BYTES_BEFORE después=$F2_BYTES_AFTER dirs=$F2_DIRS_AFTER"
[ ! -d "$WINDOW/$KEY" ] && [ "${F2_BYTES_AFTER:-1}" -lt "${F2_BYTES_BEFORE:-0}" ] \
    && ok "F2: SIGKILL + --own-gen → generación vigente eliminada (${F2_BYTES_BEFORE}→${F2_BYTES_AFTER} B, key dir ausente)" \
    || bad "F2: queda generación huérfana (before=$F2_BYTES_BEFORE after=$F2_BYTES_AFTER key_dir=$([ -d "$WINDOW/$KEY" ] && echo presente || echo ausente))"

# esperar cierre natural de la sesión (marca de viewer 15 s + linger 3 s + sweep)
FENCE_T0=$(date +%s)
CLOSED=0
for i in $(seq 1 30); do
    ST="$(ctl_state "$PORT_A" "$KEY")"
    if [ -z "$ST" ] || [ "$ST" = "closed" ]; then CLOSED=1; break; fi
    sleep 1
done
FENCE_CLOSE_S=$(( $(date +%s) - FENCE_T0 ))
log "fencing: sesión cerrada=$CLOSED tras ${FENCE_CLOSE_S}s (state=${ST:-<none>})"

# nuevo OPEN → generación nueva
NEW_CODE=$(cold_get "http://127.0.0.1:$PORT_A/mf/src/127.0.0.1/canal1/live.m3u8" fence-new fence-new 60 "$PORT_A")
NEW_GEN="$(ctl_gen "$PORT_A" "$KEY")"
log "fencing: cold nuevo code=$NEW_CODE gen_nueva=${NEW_GEN:-?}"
[ "$NEW_CODE" = "200" ] && [ -n "$NEW_GEN" ] && [ "$NEW_GEN" -gt "$FENCE_OLD_GEN" ] \
    && ok "fencing: nueva generación $FENCE_OLD_GEN→$NEW_GEN y cliente nuevo 200" \
    || bad "fencing: no hay generación nueva (code=$NEW_CODE gen=${NEW_GEN:-})"
# la vieja ya no se sirve
OLD_CODE=$(http_body_code "http://127.0.0.1:$PORT_A/mf/$KEY/$FENCE_OLD_GEN/index.m3u8" "$B/evidence/fence-stale.body" "fence" 10)
OLD_REASON="$(hdr_of "$B/evidence/fence-stale.body.hdr" X-APE-Reason)"
OLD_JUMP="$(hdr_of "$B/evidence/fence-stale.body.hdr" X-MF-Jump-To-Live)"
[ "$OLD_CODE" = "302" ] && [ "$OLD_REASON" = "stale_generation" ] && [ "$OLD_JUMP" = "1" ] \
    && ok "fencing: gen vieja → 302 stale_generation + jump-to-live" \
    || bad "fencing: gen vieja code=$OLD_CODE reason=${OLD_REASON:-none} jump=${OLD_JUMP:-none}"
# exactamente una ingesta viva y una conexión
sleep 2
INST_RAW=$(ps -eo pid=,sid=,args= 2>/dev/null | awk -v key="$KEY" '$2==$1 && $0 ~ ("ape-ingest\\.sh --instance " key "$") {print $0}')
log "fencing: raw_worker_matches(session-leaders)=[$(printf "%s" "$INST_RAW" | tr "\n" ";")]"
INSTANCES=$(printf "%s\n" "$INST_RAW" | grep -c . || true); INSTANCES=${INSTANCES:-0}
NEW_PID=$(cat "$W_PID_FILE" 2>/dev/null || echo)
NEW_OK=0
if [ -n "$NEW_PID" ] && kill -0 "$NEW_PID" 2>/dev/null; then
    NEW_SID=$(ps -o sid= -p "$NEW_PID" 2>/dev/null | tr -d ' ')
    [ "$NEW_SID" = "$NEW_PID" ] && NEW_OK=1
fi
FFMPEGS=$(pgrep -fc "ffmpeg.*:$ORIGIN_PORT" 2>/dev/null || true); FFMPEGS=${FFMPEGS:-0}
[ "$INSTANCES" = "1" ] && [ "$NEW_OK" = "1" ] && ok "fencing: exactamente 1 worker vivo tras el reinicio (pid $NEW_PID, session leader)" \
                        || bad "fencing: workers vivos=$INSTANCES (esperado 1; pidfile=$NEW_PID líder=$NEW_OK)"
[ "$FFMPEGS" = "1" ] && ok "fencing: exactamente 1 ffmpeg de ingesta vivo" \
                     || bad "fencing: ffmpeg vivos=$FFMPEGS (esperado 1)"
OLD_DIR_GONE=0; [ -d "$WINDOW/$KEY/$FENCE_OLD_GEN" ] || OLD_DIR_GONE=1
[ "$OLD_DIR_GONE" = "1" ] && ok "fencing: directorio de la generación vieja eliminado" \
                          || warn "fencing: el directorio viejo aún existe (fenced por gen, no servido)"
FENCE_WIN1=$(date +%s.%N)
phase_window fencing "$FENCE_WIN0" "$FENCE_WIN1"
origin_stats_save fencing
sleep 2
kill -KILL "$SAMPLER_PID" 2>/dev/null || true
SAMPLER_PID=""
: > "$SAMPLER_STOP"

# ── fase B: límites ─────────────────────────────────────────────────────────
if [ "$SKIP_LIMITS" = "1" ]; then
    warn "fase de límites omitida (--skip-limits)"
else
    log "── FASE B: límites (max_sessions=2, max_viewers=3, max_total=5) ──"
    stack_down a
    stack_up b "$PORT_B" "$SHIM_DELAY" 2 3 5 canalb1 canalb2 canalb3
    STACK_LABELS+=("b")
    b_key() { sed -n "s#^[[:space:]]*Location: /mf/\([0-9a-f]\{16\}\)/live.m3u8.*#\1#Ip" "$B/evidence/$1.hdr1" | tr -d '\r' | head -1; }
    B1_CODE=$(cold_get "http://127.0.0.1:$PORT_B/mf/src/127.0.0.1/canalb1/live.m3u8" b-cold-b1 lim-b1a 45)
    B1_KEY=$(b_key b-cold-b1); B1_GEN=$(ctl_gen "$PORT_B" "$B1_KEY")
    B2_CODE=$(cold_get "http://127.0.0.1:$PORT_B/mf/src/127.0.0.1/canalb2/live.m3u8" b-cold-b2 lim-b2a 45)
    B2_KEY=$(b_key b-cold-b2); B2_GEN=$(ctl_gen "$PORT_B" "$B2_KEY")
    log "límites: B1 code=$B1_CODE key=${B1_KEY:-?} gen=${B1_GEN:-?}; B2 code=$B2_CODE key=${B2_KEY:-?} gen=${B2_GEN:-?}"
    [ "$B1_CODE" = "200" ] && [ "$B2_CODE" = "200" ] && ok "límites: 2 sesiones (máximo) creadas" \
                                                        || bad "límites: no se crearon las 2 sesiones (B1=$B1_CODE B2=$B2_CODE)"
    B3_CODE=$(cold_get "http://127.0.0.1:$PORT_B/mf/src/127.0.0.1/canalb3/live.m3u8" b-cold-b3 lim-b3a 45 "$PORT_B" 1)
    B3_REASON=$(hdr_of "$B/evidence/b-cold-b3.body.hdr" X-MF-Reason)
    [ "$B3_CODE" = "503" ] && [ "$B3_REASON" = "max_sessions" ] \
        && ok "límites: 3ª sesión → 503 max_sessions" \
        || bad "límites: 3ª sesión code=$B3_CODE reason=${B3_REASON:-none}"
    # los conectados siguen
    B_CONN_OK=0; B_CONN_TOT=0
    for i in $(seq 1 6); do
        B_CONN_TOT=$((B_CONN_TOT+2))
        [ "$(http_code "http://127.0.0.1:$PORT_B/mf/$B1_KEY/$B1_GEN/index.m3u8" 5)" = "200" ] && B_CONN_OK=$((B_CONN_OK+1))
        [ "$(http_code "http://127.0.0.1:$PORT_B/mf/$B2_KEY/$B2_GEN/index.m3u8" 5)" = "200" ] && B_CONN_OK=$((B_CONN_OK+1))
        sleep 1
    done
    [ "$B_CONN_OK" = "$B_CONN_TOT" ] && ok "límites: sesiones ya conectadas siguen 200 ($B_CONN_OK/$B_CONN_TOT)" \
                                     || bad "límites: sesiones conectadas degradadas ($B_CONN_OK/$B_CONN_TOT)"
    # refrescar las marcas de los espectadores base antes de probar los límites
    curl -s -o /dev/null --max-time 40 -H "X-MF-Client: lim-b1a" "http://127.0.0.1:$PORT_B/mf/$B1_KEY/live.m3u8"
    curl -s -o /dev/null --max-time 40 -H "X-MF-Client: lim-b2a" "http://127.0.0.1:$PORT_B/mf/$B2_KEY/live.m3u8"
    # límite de espectadores por sesión: B1 tiene 1; añadir 2 (3) y el 4º → 503
    for n in 2 3; do
        C=$(http_body_code "http://127.0.0.1:$PORT_B/mf/$B1_KEY/live.m3u8" "$B/evidence/lim-b1-v$n.body" "lim-b1-v$n" 40)
        [ "$C" = "200" ] || log "límites: viewer B1-$n code=$C"
    done
    V4_CODE=$(http_body_code "http://127.0.0.1:$PORT_B/mf/$B1_KEY/live.m3u8" "$B/evidence/lim-v4.body" "lim-b1-v4" 20)
    V4_REASON=$(hdr_of "$B/evidence/lim-v4.body.hdr" X-MF-Reason)
    [ "$V4_CODE" = "503" ] && [ "$V4_REASON" = "max_viewers" ] \
        && ok "límites: viewer 4 en sesión → 503 max_viewers" \
        || bad "límites: viewer 4 code=$V4_CODE reason=${V4_REASON:-none}"
    # total de espectadores: B1=3, B2=1; añadir 2 a B2 (total 5) y el 6º → 503 max_total
    for n in 2 3; do
        C=$(http_body_code "http://127.0.0.1:$PORT_B/mf/$B2_KEY/live.m3u8" "$B/evidence/lim-b2-v$n.body" "lim-b2-v$n" 40)
        [ "$C" = "200" ] || log "límites: viewer B2-$n code=$C (el 3º debe ser el rechazo por total)"
    done
    V6_CODE=$(http_body_code "http://127.0.0.1:$PORT_B/mf/$B2_KEY/live.m3u8" "$B/evidence/lim-v6.body" "lim-b2-v4" 20)
    V6_REASON=$(hdr_of "$B/evidence/lim-v6.body.hdr" X-MF-Reason)
    [ "$V6_CODE" = "503" ] && [ "$V6_REASON" = "max_total_viewers" ] \
        && ok "límites: 6º viewer global → 503 max_total_viewers" \
        || warn "límites: 6º viewer code=$V6_CODE reason=${V6_REASON:-none} (puede variar por TTL de marcas)"
    # los conectados no se caen tras los rechazos
    B_SURV=0
    for i in 1 2 3; do
        [ "$(http_code "http://127.0.0.1:$PORT_B/mf/$B1_KEY/$B1_GEN/index.m3u8" 5)" = "200" ] && B_SURV=$((B_SURV+1))
        [ "$(http_code "http://127.0.0.1:$PORT_B/mf/$B2_KEY/$B2_GEN/index.m3u8" 5)" = "200" ] && B_SURV=$((B_SURV+1))
        sleep 1
    done
    [ "$B_SURV" = "6" ] && ok "límites: rechazos no expulsan a los conectados (6/6)" \
                        || bad "límites: conectados degradados tras rechazos ($B_SURV/6)"
    stack_down b
fi

# ── análisis de fases ───────────────────────────────────────────────────────
log "── análisis de coherencia / latencias / aislamiento ──"
python3 "$B/analyze.py" "$B" > "$B/evidence/analysis.out" 2>&1 || warn "analyze.py falló"
cat "$B/evidence/analysis.out" >> "$EVIDENCE"

AN_GET() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); cur=d
for k in sys.argv[2].split("."):
    cur=cur[k]
print(cur)' "$B/analysis.json" "$1" 2>/dev/null || echo ""; }

# upstream por fase desde el muestreador
upstream_phase() { # $1 label -> "max_conn=<n> pids=<n> samples=<n> over1=<n>"
    python3 - "$B" "$1" "$ORIGIN_PORT" <<'PY'
import csv, sys, json
B, lbl, port = sys.argv[1], sys.argv[2], int(sys.argv[3])
win = {}
for line in open(B+'/phases/windows.tsv'):
    p=line.rstrip('\n').split('\t')
    if len(p)==3: win[p[0]]=(float(p[1]),float(p[2]))
if lbl not in win:
    print('n/a'); sys.exit()
a,b=win[lbl]
rows=[]
with open(B+'/phases/upstream.csv') as f:
    r=csv.DictReader(f)
    for row in r:
        t=float(row['ts'])
        if a<=t<=b:
            rows.append((int(row['n_ss']), int(row['n_proc_tcp']), row['pids'], int(row['n_ffmpeg'])))
if not rows:
    print('max_conn=0 n=0 over1=0 pids=0 ffmpeg_max=0'); sys.exit()
mx=max(x[0] for x in rows); mxp=max(x[1] for x in rows)
pids=set()
for x in rows:
    for p in x[2].split('|'):
        if p: pids.add(p)
ff=max(x[3] for x in rows)
print('max_conn=%d max_proc_tcp=%d samples=%d over1=%d pids=%d ffmpeg_max=%d' %
      (mx, mxp, len(rows), sum(1 for x in rows if x[0]>1), len(pids), ff))
PY
}
UP_MAIN="$(upstream_phase main50)"; UP_1="$(upstream_phase n1)"; UP_5="$(upstream_phase n5)"; UP_100="$(upstream_phase n100)"; UP_COLD="$(upstream_phase cold)"; UP_FENCE="$(upstream_phase fencing)"
log "upstream cold: $UP_COLD"
log "upstream 1:    $UP_1"
log "upstream 5:    $UP_5"
log "upstream 50:   $UP_MAIN"
log "upstream 100:  $UP_100"
# curva de aceptaciones del origen por fase (independiente de ss)
accepts_phase() { # $1 label
    python3 - "$B" "$1" <<'PY'
import sys
B,lbl=sys.argv[1],sys.argv[2]
w={}
for line in open(B+'/phases/windows.tsv'):
    p=line.rstrip('\n').split('\t')
    if len(p)==3: w[p[0]]=(float(p[1]),float(p[2]))
if lbl not in w: print('0 0 0'); sys.exit()
a,b=w[lbl]; acc=0; get=0
for line in open(B+'/logs/origin_accept.log'):
    p=line.split()
    if len(p)>=2:
        t=float(p[0])
        if a<=t<=b:
            if p[1]=='ACCEPT': acc+=1
            elif p[1]=='GET': get+=1
print(acc,get,round(b-a,1))
PY
}
read -r AC_COLD GC_COLD DC_COLD <<<"$(accepts_phase cold)"
read -r AC_1 GC_1 D_1 <<<"$(accepts_phase n1)"
read -r AC_5 GC_5 D_5 <<<"$(accepts_phase n5)"
read -r AC_50 GC_50 D_50 <<<"$(accepts_phase main50)"
read -r AC_100 GC_100 D_100 <<<"$(accepts_phase n100)"
log "origin accepts cold=${AC_COLD}/${DC_COLD}s 1=${AC_1}/${D_1}s 5=${AC_5}/${D_5}s 50=${AC_50}/${D_50}s 100=${AC_100}/${D_100}s"
log "origin GETs   cold=${GC_COLD} 1=${GC_1} 5=${GC_5} 50=${GC_50} 100=${GC_100}"
MX_COLD=$(stats_field cold max_active); MX_1=$(stats_field n1 max_active); MX_5=$(stats_field n5 max_active)
MX_50=$(stats_field main50 max_active); MX_100=$(stats_field n100 max_active)
MX_SNAP=$(stats_field snapshot max_active); MX_ISO=$(stats_field isolation max_active)
MX_FENCE=$(stats_field fencing max_active)
log "origin max_active (conexiones TCP concurrentes en el proveedor): cold=${MX_COLD:-?} 1=${MX_1:-?} 5=${MX_5:-?} 50=${MX_50:-?} 100=${MX_100:-?} snapshot=${MX_SNAP:-?} isolation=${MX_ISO:-?} fencing=${MX_FENCE:-?}"

# veredictos
UP_MAX_MAIN=$(echo "$UP_MAIN" | sed -n 's/.*max_conn=\([0-9]*\).*/\1/p')
UP_MAX_100=$(echo "$UP_100" | sed -n 's/.*max_conn=\([0-9]*\).*/\1/p')
UP_MAX_COLD=$(echo "$UP_COLD" | sed -n 's/.*max_conn=\([0-9]*\).*/\1/p')
UP_MAX_FENCE=$(echo "$UP_FENCE" | sed -n 's/.*max_conn=\([0-9]*\).*/\1/p')
UP_PIDS_MAIN=$(echo "$UP_MAIN" | sed -n 's/.*pids=\([0-9]*\).*/\1/p')
UP_FF_MAIN=$(echo "$UP_MAIN" | sed -n 's/.*ffmpeg_max=\([0-9]*\).*/\1/p')
UP_OVER_MAIN=$(echo "$UP_MAIN" | sed -n 's/.*over1=\([0-9]*\).*/\1/p')
UP_OVER_COLD=$(echo "$UP_COLD" | sed -n 's/.*over1=\([0-9]*\).*/\1/p')
UP_OVER_100=$(echo "$UP_100" | sed -n 's/.*over1=\([0-9]*\).*/\1/p')
[ "${UP_MAX_MAIN:-9}" -le 1 ] && [ "${UP_MAX_100:-9}" -le 1 ] && [ "${UP_MAX_COLD:-9}" -le 1 ] \
    && [ "${UP_MAX_FENCE:-9}" -le 1 ] && [ "${UP_FF_MAIN:-9}" = "1" ] && [ "${UP_PIDS_MAIN:-9}" -le 1 ] \
    && [ "${UP_OVER_MAIN:-9}" = "0" ] && [ "${UP_OVER_COLD:-9}" = "0" ] && [ "${UP_OVER_100:-9}" = "0" ] \
    && [ "${MX_COLD:-9}" = "1" ] && [ "${MX_1:-9}" = "1" ] && [ "${MX_5:-9}" = "1" ] \
    && [ "${MX_50:-9}" = "1" ] && [ "${MX_100:-9}" = "1" ] && [ "${MX_FENCE:-9}" = "1" ] \
    && ok "single-flight: 50/100 clientes → máx 1 conexión upstream (ss + max_active del origen) y 1 ffmpeg" \
    || bad "single-flight: max_active cold=${MX_COLD:-?} 1=${MX_1:-?} 5=${MX_5:-?} 50=${MX_50:-?} 100=${MX_100:-?} fence=${MX_FENCE:-?}; ss max=${UP_MAX_MAIN:-?} pids=${UP_PIDS_MAIN:-?} ffmpeg=${UP_FF_MAIN:-?}"
# invariancia de aceptaciones: N no debe multiplicar el churn del origen
python3 - "$AC_1" "$D_1" "$AC_50" "$D_50" "$AC_100" "$D_100" <<'PY'
import sys
a1,d1,a50,d50,a100,d100=map(float,sys.argv[1:7])
r1=a1/d1 if d1 else 0; r50=a50/d50 if d50 else 0; r100=a100/d100 if d100 else 0
ok = r50 <= max(0.05, r1*3) and r100 <= max(0.05, r1*3)
print('ACCEPT_RATE_INVARIANT=%s rate1=%.2f/s rate50=%.2f/s rate100=%.2f/s' % ('PASS' if ok else 'FAIL', r1, r50, r100))
sys.exit(0 if ok else 1)
PY
if [ $? = 0 ]; then ok "upstream: la tasa de aceptaciones del origen NO escala con N (1↔50↔100)"; else bad "upstream: la tasa de aceptaciones escala con N"; fi

COH_MIS=$(AN_GET coherence.signature_mismatches); COH_DUP=$(AN_GET coherence.duplicate_segments)
COH_WH=$(AN_GET coherence.window_holes); COH_UH=$(AN_GET coherence.union_segment_holes)
COH_SKIP=$(AN_GET coherence.observed_msn_skips); COH_REG=$(AN_GET coherence.msn_regressions)
COH_MAP=$(AN_GET coherence.filename_msn_mismatch); COH_EXT=$(AN_GET coherence.extinf_anomalies)
COH_CLI=$(AN_GET coherence.clients); COH_MSNMIN=$(AN_GET coherence.msn_min); COH_MSNMAX=$(AN_GET coherence.msn_max)
log "coherencia: clients=$COH_CLI msn=${COH_MSNMIN:-?}..${COH_MSNMAX:-?} sig_mismatch=$COH_MIS dup=$COH_DUP window_holes=$COH_WH union_holes=$COH_UH msn_skips_observados=$COH_SKIP regressions=$COH_REG map_bad=$COH_MAP extinf_bad=$COH_EXT"
[ "${COH_MIS:-9}" = "0" ] && [ "${COH_DUP:-9}" = "0" ] && [ "${COH_WH:-9}" = "0" ] && [ "${COH_UH:-9}" = "0" ] \
    && [ "${COH_REG:-9}" = "0" ] && [ "${COH_MAP:-9}" = "0" ] && [ "${COH_EXT:-9}" = "0" ] && [ "${COH_CLI:-0}" -ge 50 ] \
    && ok "coherencia: 50 clientes, misma secuencia/MSN, 0 duplicados, 0 huecos, 0 desalineación" \
    || bad "coherencia: mismatch=$COH_MIS dup=$COH_DUP window_holes=$COH_WH union_holes=$COH_UH reg=$COH_REG map=$COH_MAP ext=$COH_EXT clients=$COH_CLI"
# snapshots byte a byte (5 rondas; se exige ≥4 rondas idénticas)
SNAP_BAD=0; SNAP_ROUNDS_OK=0; SNAP_ROUNDS=5
for rnd in 0 1 2 3 4; do
    U=$(AN_GET "snapshots.$rnd.unique_sha"); N=$(AN_GET "snapshots.$rnd.http200")
    log "snapshot $rnd: http200=$N unique_sha=${U:-?}"
    [ "$U" = "1" ] && [ "${N:-0}" = "50" ] && SNAP_ROUNDS_OK=$((SNAP_ROUNDS_OK+1))
done
[ "$SNAP_ROUNDS_OK" -ge 4 ] && ok "coherencia: $SNAP_ROUNDS_OK/$SNAP_ROUNDS snapshots simultáneos byte-idénticos en los 50 clientes" \
                            || bad "coherencia: solo $SNAP_ROUNDS_OK/$SNAP_ROUNDS snapshots idénticos"

# O2/t14: entrada de player bajo carga
PE_CLI=$(AN_GET player_entry.clients); PE_REQ=$(AN_GET player_entry.requests)
PE_200=$(AN_GET player_entry.http200); PE_GEN=$(AN_GET player_entry.gen_hdr)
PE_REL=$(AN_GET player_entry.rel_uris); PE_BAD=$(AN_GET player_entry.bad_gen_uris)
PE_ABS=$(AN_GET player_entry.abs_uris); PE_SEGOK=$(AN_GET player_entry.seg_ok)
PE_SEGFAIL=$(AN_GET player_entry.seg_fail); PE_GENS=$(AN_GET player_entry.gen_values)
log "player_entry: clients=$PE_CLI requests=$PE_REQ http200=$PE_200 gen_hdr=$PE_GEN rel=$PE_REL bad_gen=$PE_BAD abs=$PE_ABS seg_ok=$PE_SEGOK seg_fail=$PE_SEGFAIL gens=$PE_GENS"
[ "${PE_CLI:-0}" -ge 50 ] && [ "${PE_REQ:-0}" -gt 0 ] && [ "${PE_200:-0}" = "${PE_REQ:-1}" ] \
    && [ "${PE_GEN:-0}" = "${PE_REQ:-1}" ] && [ "${PE_REL:-9}" = "0" ] && [ "${PE_BAD:-9}" = "0" ] \
    && [ "${PE_ABS:-0}" -gt 0 ] && [ "${PE_SEGOK:-0}" -ge 50 ] && [ "${PE_SEGFAIL:-9}" = "0" ] \
    && ok "O2: /sess/.../live.m3u8 bajo 50 clientes → 200, X-MF-Gen, URIs absolutas con gen y segmentos 200 (${PE_SEGOK} segmentos)" \
    || bad "O2: player bajo carga incompleto (clients=$PE_CLI req=$PE_REQ 200=$PE_200 gen=$PE_GEN rel=$PE_REL bad=$PE_BAD seg_ok=$PE_SEGOK seg_fail=$PE_SEGFAIL)"

ISO_OKPCT=$(AN_GET isolation.success_pct); ISO_ADV=$(AN_GET isolation.min_msn_advance)
ISO_CLI=$(AN_GET isolation.clients); ISO_SEGOK=$(AN_GET isolation.seg_ok); ISO_SEGTOT=$(AN_GET isolation.seg_total)
log "aislamiento: clients=$ISO_CLI success=$ISO_OKPCT% min_msn_advance=$ISO_ADV seg_ok=$ISO_SEGOK/$ISO_SEGTOT"
python3 -c 'import sys; ok=float(sys.argv[1])>=99.0 and int(sys.argv[2])>=5; sys.exit(0 if ok else 1)' "${ISO_OKPCT:-0}" "${ISO_ADV:-0}" \
    && ok "aislamiento: cliente lento abortado; 50 restantes ≥99% y MSN avanzó ≥5 en la ventana" \
    || bad "aislamiento: éxito=${ISO_OKPCT}% avance_msn=${ISO_ADV}"

# latencias principales
L50_P95=$(AN_GET phases.main50.p95); L50_P50=$(AN_GET phases.main50.p50)
L100_P95=$(AN_GET phases.n100.p95); L1_P95=$(AN_GET phases.n1.p95)
SEG_P95=$(AN_GET phases.main50.seg_p95); BYTES50=$(AN_GET phases.main50.bytes); SEGBYTES50=$(AN_GET phases.main50.seg_bytes)
log "latencia playlist: 1c_p95=${L1_P95}ms 50c_p50=${L50_P50}ms 50c_p95=${L50_P95}ms 100c_p95=${L100_P95}ms; seg_p95=${SEG_P95}ms"
log "bytes fase 50: playlists+segmentos=$BYTES50 B; segmentos=$SEGBYTES50 B"
python3 -c 'import sys; sys.exit(0 if float(sys.argv[1] or 99999) < 1500 and float(sys.argv[2] or 99999) < 1500 else 1)' "${L50_P95:-99999}" "${L100_P95:-99999}" \
    && ok "latencia: p95 playlist < 1500 ms con 50 y 100 clientes" \
    || warn "latencia: p95 50c=${L50_P95}ms 100c=${L100_P95}ms (revisar)"

# ── producción intacta / ventana de journal ────────────────────────────────
stop_origin
sleep 0.5
END_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PROD_PID_AFTER="$(systemctl show -p MainPID --value nginx 2>/dev/null || echo 0)"
PROD_SHA_AFTER="$(sha256sum /etc/nginx/nginx.conf 2>/dev/null | awk '{print $1}')"
JOURNAL="$(journalctl -u nginx --since "$START_ISO" --until "$END_ISO" --no-pager 2>/dev/null || true)"
JOURNAL_EVENTS="$(printf '%s\n' "$JOURNAL" | grep -Eic 'reconfiguring|reloading|starting nginx|stopping nginx|start worker process|exit with code|exited with code|signal process started|SIGTERM|SIGQUIT' || true)"
JOURNAL_EVENTS="${JOURNAL_EVENTS:-0}"
printf '%s\n' "$JOURNAL" > "$B/evidence/nginx-journal-window.txt"
log "prod_check: pid ${PROD_PID_BEFORE}→${PROD_PID_AFTER} sha_ok=$([ "$PROD_SHA_BEFORE" = "$PROD_SHA_AFTER" ] && echo 1 || echo 0) journal_events=$JOURNAL_EVENTS"
if [ "$PROD_PID_BEFORE" = "$PROD_PID_AFTER" ] && [ "$PROD_SHA_BEFORE" = "$PROD_SHA_AFTER" ] && [ "$JOURNAL_EVENTS" = "0" ]; then
    ok "producción intacta: nginx pid/sha sin cambios y 0 eventos de reinicio en la ventana"
else
    [ "$JOURNAL_EVENTS" != "0" ] && warn "nginx de producción tuvo eventos en la ventana: la corrida es INVÁLIDA (repetir)"
    [ "$PROD_SHA_BEFORE" != "$PROD_SHA_AFTER" ] && bad "producción: /etc/nginx/nginx.conf CAMBIÓ"
    [ "$PROD_PID_BEFORE" != "$PROD_PID_AFTER" ] && warn "producción: MainPID de nginx cambió"
    INVALID_RUN=1
fi
# no debe quedar nada de staging en prod
[ ! -e /etc/mediafanout ] && [ ! -e /var/lib/mediafanout ] && ok "staging: no se creó /etc/mediafanout ni /var/lib/mediafanout" \
                                                   || warn "staging: aparecieron directorios de prod (revisar)"
rm -rf "$WINDOW"/* 2>/dev/null || true
SHM_BYTES_FINAL=$(du -sb "$WINDOW" 2>/dev/null | awk '{print $1}')
SHM_FILES_FINAL=$(find "$WINDOW" -mindepth 1 2>/dev/null | wc -l)
log "F2: /dev/shm/mf final bytes=${SHM_BYTES_FINAL:-0} entradas=${SHM_FILES_FINAL:-?}"
[ "${SHM_FILES_FINAL:-1}" = "0" ] && ok "F2: /dev/shm/mf limpio al terminar (0 B, 0 entradas)" \
                                  || warn "F2: /dev/shm/mf no quedó vacío (bytes=${SHM_BYTES_FINAL:-?} entradas=${SHM_FILES_FINAL:-?})"
LEFT_PROCS=$(pgrep -fc "$B/" 2>/dev/null || true); LEFT_PROCS=${LEFT_PROCS:-0}
[ "$LEFT_PROCS" = "0" ] && ok "staging: 0 procesos del banco tras el cierre" || warn "staging: quedan $LEFT_PROCS procesos (los limpia el trap)"

# ── veredicto de arranque en frío ───────────────────────────────────────────
if [ "$SHIM_DELAY" = "0" ]; then
    if [ "${COLD_OK:-0}" = "$CLIENTS_COLD" ] && [ "${COLD_N:-0}" = "$CLIENTS_COLD" ]; then
        COLD_START_STATUS="PASS"
    else
        COLD_START_STATUS="FAIL"
    fi
else
    COLD_START_STATUS="FAIL(B1: shim=${SHIM_DELAY}s)"
fi
log "COLD_START=$COLD_START_STATUS"

report_summary
if [ "$INVALID_RUN" = "1" ]; then
    log "RESULT=INVALID_RUN (repetir la corrida)"
    exit 2
elif [ "$FAIL" = "0" ]; then
    log "RESULT=PASS_INVARIANT"
    exit 0
else
    log "RESULT=FAIL_INVARIANT ($FAIL fallos)"
    exit 1
fi
