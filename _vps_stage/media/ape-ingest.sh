#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# APE INGEST WORKER — una conexión upstream, remux puro, ventana en tmpfs
# ═════════════════════════════════════════════════════════════════════════════
# Fichero:   _vps_stage/media/ape-ingest.sh   (STAGING; no se instala en prod
#            hasta que V1/R1 validen; unit: _vps_stage/media/ape-ingest@.service)
# Versión:   1.0.0
# Depende:   bash ≥5, ffmpeg/ffprobe 6.1 (medido en W1 §1.1), coreutils, curl
#            (opcional: sólo si se activa el plano loopback), socat|nc|python3
#            (protocolo UDS con el supervisor; socat medido en el VPS).
#
# QUÉ ES
#   El proceso de INGESTA de UNA sesión: lanza UN ffmpeg con `-c copy` que lee
#   el HLS del proveedor (URL ya resuelta por el supervisor, con su ticket 302)
#   y escribe una ventana deslizante HLS en tmpfs:
#
#       <window-root>/<key>/<gen>/index.m3u8          ← playlist (8 entradas)
#       <window-root>/<key>/<gen>/segNNNNN.ts         ← segmentos MPEG-TS
#
#   El coordinador nginx de I1 sirve esa ventana por /mf/<key>/<gen>/... y es
#   el ÚNICO que atiende clientes. Este proceso no habla con clientes.
#
# QUÉ NO ES (contrato duro)
#   * NO se autospawnea ni se autogestiona: lo lanza el SUPERVISOR (t9), que es
#     la única autoridad de lifecycle, de `gen` y del relay al coordinador
#     (decisión del capitán, Q-A: una sola fuente de estado).
#   * NO resuelve credenciales ni URLs: las recibe por entorno o fichero 0640.
#     Nunca por argv propio (argv es visible en `ps`).
#   * NO recodifica vídeo: `-c copy` (o `-c:v copy` si el audio se transcode).
#     Sólo se transcodifica AUDIO y sólo si el códec no es estándar en
#     MPEG-TS/HLS (decisión documentada en §AUDIO).
#   * NO publica por HTTP al coordinador por defecto: el supervisor hace el
#     relay (`POST /mf/ctl?op=publish|heartbeat|close`). El plano loopback
#     queda como herramienta de test (`--with-coordinator`).
#   * NO abre una segunda conexión upstream "de comprobación": el audio se
#     verifica con ffprobe LOCAL sobre el primer segmento ya escrito.
#
# TRAZABILIDAD DEL CONTRATO (t4 / I2)
#   1) Un solo ffmpeg por sesión; 2º arranque rechazado con código ≠ 0
#        → acquire_lock() flock(2) por key → exit 3 · count_live_workers()
#   2) Remux puro `-c copy`; sólo audio si el contenedor lo exige
#        → build_argv() · audio_decision_pre() · audio_decision_post()
#   3) Salida /mf/<key>/<gen>/, ventana 8 segmentos / 80 MiB, delete_segments
#        → normalize_out() · HLS_FLAGS · HLS_LIST_SIZE · WINDOW_MAX_BYTES ·
#          enforce_window_cap() (poda; si no baja → rotación)
#   4) Ticket 302/TTL 30–60 s → renovar ≤20–25 s o reiniciar con gen NUEVA y
#      fencing de la anterior
#        → watchdog de progreso (STALL_TIMEOUT 10..25) · rotate() · fence_gen()
#   5) User-Agent obligatorio en el fetch (W1: curl/… → 461; Mozilla → 302)
#        → UA no vacío + `-user_agent` en ffmpeg
#   6) Límites: MemoryMax 180M, timeout de arranque, limpieza de generaciones
#        → unit · STARTUP_TIMEOUT (worker) · cleanup_old_gens() · guarda de
#          espacio libre · MAX_SESSIONS local.
#   7) Reinicio: lo hace el SUPERVISOR (t9) con backoff y gen++; la unidad NO
#      reintenta (`Restart=no`, contrato I5) para no reejecutar con el mismo
#      spec. flock + gen-reuse refuse garantizan que nunca hay dos escritores.
#      (sd_notify está implementado y medido —positivo/negativo— y sigue
#      disponible si una unidad usa Type=notify+WatchdogSec; la unidad de t9
#      usa Type=simple con timeout de 45 s en el supervisor.)
#
# AUTORIDAD Y PROTOCOLO (UDS con el supervisor; 1 línea por conexión)
#   → PUBLISH <key> <gen> state=<starting|live|backoff|stopping> [seq=<n>]
#   → HEARTBEAT <key> <gen> [seq=<n>]
#   → RESTART <key> <gen> reason=<stall|ticket|upstream|mux|startup|window_overflow|eof|exit>
#   → FAIL <key> <gen> reason=<r>
#   → PING -
#   ← OK gen=<n> [state=<s>] [seq=<n>] | PONG | ERR code=<token> [reason=<txt>]
#   Fencing:  ERR code=stale_generation ⇒ salimos 21 SIN escribir ni un byte.
#   Sin RESTART: ERR code=unsupported|bad_op ⇒ FAIL + exit 75 (respawn gen++).
#   Socket:   $MF_SUP_SOCK (def. /run/mediafanout/mf.sock; el supervisor
#             escucha también el alias /run/mediafanout/supervisor.sock de I1).
#
# ARRANQUE — ORDEN EXACTO (fix B1/t12)
#   1) args/spec/URL validados localmente (nada de red ni fs todavía);
#   2) flock(2) por key (2º arranque → exit 3) + techo local de sesiones;
#   3) directorio de la ventana preparado (tmpfs, política de gen reutilizada);
#   4) READY=1 por systemd-notify  ← ANTES DE CUALQUIER UDS. Con Type=notify,
#      `systemctl start` retorna aquí y NO se queda esperando a un supervisor
#      ocupado (era el síntoma B1: READY solo se enviaba al publicar live);
#   5) PUBLISH state=starting TOLERANTE: 5 intentos con backoff
#      0/0,2/0,4/0,8/1,6 s y presupuesto duro de 4,0 s (timeout por intento
#      recortado al restante). Solo sale 20 si se agotan; NUNCA al primer
#      timeout de 0,4 s. `stale_generation` corta en el acto → exit 21;
#   6) ya con gen autorizada: limpieza de generaciones viejas, floor de seq,
#      política de audio, spawn de ffmpeg y live.
#   Fencing intacto: si el gen es stale (o el supervisor no responde), se
#   descarta el directorio recién creado (vacío) y no queda NADA en la ventana.
#   Hook de test: MF_TEST_TRACE=<fichero> registra la traza de orden
#   notify/sup (sin la variable no hace nada; no se usa en producción).
#
# TICKET 302 / TTL (W1 §3.4)
#   El supervisor resuelve la URL y la deja en el spec; ffmpeg sigue el 302 de
#   forma nativa y RELEE el playlist del CDN cada segmento (~6 s), lo que
#   renueva el ticket de forma deslizante (medido: vivo a 120 s releyendo
#   ≤30 s; 509 tras 65 s idle). El worker NO hace un fetch propio del playlist:
#   sería una SEGUNDA conexión upstream y rompería el invariante single-flight.
#   Si aun así no hay progreso (509/407/461/5xx/EOF) durante STALL_TIMEOUT
#   (20 s por defecto, tope 25 s < TTL mínimo 30 s) → mata ffmpeg, fence de la
#   generación y RESTART con gen nueva; classify_failure() etiqueta el motivo
#   (ticket|upstream|mux|stall|startup|eof).
#
# AUDIO (decisión documentada)
#   MPEG-TS/HLS admite de forma estándar y universal: aac, mp3, mp2, ac3, eac3.
#   Cualquier otro códec de audio (opus, flac, vorbis, alac, pcm_*, dts…), aunque
#   ffmpeg 6.1 sepa empaquetarlo en TS (verificado en el VPS), NO es
#   reproducible en TiviMate/VLC/OTT/ExoPlayer/Safari. Política:
#     1. Si el supervisor ya conoce el códec (MF_SRC_AUDIO_CODEC) y no es
#        estándar → nace con `-c:v copy -c:a aac -b:a 160k` (cero intentos).
#     2. Si no lo conoce → `-c copy` y, ANTES de publicar `live` (nadie ha visto
#        la playlist), ffprobe LOCAL del primer segmento: si el audio no es
#        estándar se reinicia ESA MISMA generación (aún sin publicar) con audio
#        AAC. El vídeo sigue en copy: nunca se recodifica (probado en
#        --selftest-remux comparando el ES de vídeo byte a byte).
#     3. Si ffmpeg muere con error de muxer de audio → mismo reintento.
#   Nunca hay una ruta que añada `-c:v <encoder>` (el selftest lo comprueba).
#
# FENCING / GENERACIONES
#   `gen` lo asigna SIEMPRE el supervisor (persistido + 1 en cada spawn). Aquí:
#     * antes de crear NADA se valida el gen (PUBLISH starting); stale → 21;
#     * si el directorio de su gen ya tiene contenido → exit 21: el supervisor
#       debe bumpear gen (nunca dos escritores en la misma generación).
#       Override de emergencia: MF_GEN_REUSE=takeover;
#     * al rotar: mata ffmpeg, renombra el dir viejo a .fenced.<pid> (atómico)
#       y lo borra; pide RESTART y arranca con la gen nueva.
#
# LÍMITES (medidos en W1 §5 y §6.6)
#   MemoryMax=180M · CPUQuota=60% · TasksMax=64 · LimitNOFILE=4096 (unit t9)
#   Ventana 8 segmentos / 80 MiB · MAX_SESSIONS 12 (local; el supervisor manda)
#   MIN_FREE_BYTES 96 MiB antes de arrancar.
#   Ventana por defecto: /dev/shm/mf/<key>/<gen>/ (ruta de FICHEROS que manda el
#   supervisor en MF_OUT; también se acepta /run/mediafanout/... — la raíz se
#   deriva de la propia ruta). Nombre de playlist: index.m3u8; segmentos
#   segNNNNN.ts (cumple [A-Za-z0-9][A-Za-z0-9._-]{0,63}); sin subdirectorios.
#
# CÓDIGOS DE SALIDA
#   0   parada limpia (fin de --max-runtime, SIGTERM, --on-eof stop)
#   2   error de uso/configuración
#   3   lock ocupado: ya hay otra ingesta viva para esta key (NO reintentar)
#   4   ruta de salida inválida (no es <root>/<key>/<gen>)
#   10  upstream agotado tras RETRY_MAX rotaciones
#   12  sin espacio en tmpfs (MIN_FREE_BYTES)
#   13  MAX_SESSIONS alcanzado (límite local; el supervisor manda)
#   14  timeout de arranque sin primer segmento
#   20  supervisor inaccesible (no se escribe nada)
#   21  generación stale / dir de gen ya existente: FENCED (no escribe nada)
#   75  rotación imposible (supervisor sin RESTART) → que respawnee él
#
# CREDENCIALES
#   La URL del proveedor (usuario/password/ticket) entra SÓLO por
#   MF_UPSTREAM_URL o --url-file (0640). Nunca se registra: los logs la
#   redactan (redact_url) y `--print-argv` también. ffmpeg 6.1 no permite leer
#   la URL de un fichero, así que el argv de ffmpeg SÍ la contiene: se mitiga
#   ejecutando el unit como usuario sin privilegios (mediafanout) con
#   ProtectProc=invisible, y sin volcarla jamás a journal.
#
# USO
#   ape-ingest.sh --instance <key16>            # lo lanza el supervisor
#   ape-ingest.sh --key <k> --gen 7 --out /mf/<k>/7/ --url-file <spec>.url
#   ape-ingest.sh --print-argv …                # argv de ffmpeg (URL redactada)
#   ape-ingest.sh --probe-lock --key …          # 0 libre / 3 ocupado
#   ape-ingest.sh --cleanup --instance <key>    # borra gens viejas (ExecStopPost)
#   ape-ingest.sh --selftest                    # batería offline (sin red)
#   ape-ingest.sh --selftest-remux              # + remux REAL (ffmpeg local)
# ═════════════════════════════════════════════════════════════════════════════

set -u
set -o pipefail
export LC_ALL=C
umask 0022

VERSION="1.0.1"
SELF="$0"

# ── 0. parámetros: entorno primero (EnvironmentFile del supervisor) ──────────
INSTANCE="${MF_INSTANCE:-}"
KEY="${MF_KEY:-}"
GEN="${MF_GEN:-}"
OUT_ARG="${MF_OUT:-}"
PROVIDER="${MF_PROVIDER:-}"
CHANNEL="${MF_CHANNEL:-}"
URL_FILE="${MF_URL_FILE:-}"
URL="${MF_UPSTREAM_URL:-}"

WINDOW_ROOT="${MF_WINDOW_ROOT:-/dev/shm/mf}"
# F4 (t7): el lock vive en un directorio FIJO del supervisor, fuera del window
# root: dos ventanas raíz distintas para la misma key deben chocar igual.
LOCK_ROOT="/run/mediafanout/locks"
LOCK_DIR="${MF_LOCK_DIR:-}"
STATE_DIR="${MF_STATE_DIR:-}"
SUP_SOCK="${MF_SUP_SOCK:-/run/mediafanout/mf.sock}"
SUP_ALIAS_SOCK="/run/mediafanout/supervisor.sock"
NO_SUP=0

# Q-A (capitán, 2026-10-25): el supervisor es el ÚNICO relay al coordinador.
# El worker NO publica por HTTP salvo en tests (`--with-coordinator`).
NO_COORD=1
COORD_URL="${MF_COORD_URL:-http://127.0.0.1:8090}"
CTL_TOKEN="${MF_CTL_TOKEN:-}"

UA="${MF_UA:-Mozilla/5.0 (Linux; Android 14; SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36}"
HLS_TIME_CFG="${MF_HLS_TIME:-auto}"
SRC_SEG_DUR="${MF_SRC_SEG_DUR:-}"
HLS_LIST_SIZE="${MF_HLS_LIST_SIZE:-8}"
WINDOW_MAX_BYTES="${MF_WINDOW_MAX_BYTES:-83886080}"        # 80 MiB
MIN_FREE_BYTES="${MF_MIN_FREE_BYTES:-100663296}"           # 96 MiB
MAX_SESSIONS="${MF_MAX_SESSIONS:-12}"
STALL_TIMEOUT="${MF_STALL_TIMEOUT:-20}"                    # 10..25 (TTL 30-60 s)
STARTUP_TIMEOUT="${MF_STARTUP_TIMEOUT:-20}"
HEARTBEAT_S="${MF_HEARTBEAT_S:-5}"
SUP_GRACE_S="${MF_SUP_GRACE_S:-30}"
RW_TIMEOUT_MS="${MF_RW_TIMEOUT_MS:-15000}"
LIVE_START_INDEX="${MF_LIVE_START_INDEX:--1}"
RETRY_MAX="${MF_RETRY_MAX:-3}"
RETRY_BASE="${MF_RETRY_BASE:-1}"
MAX_RUNTIME="${MF_MAX_RUNTIME:-0}"
ON_EOF="${MF_ON_EOF:-rotate}"                              # rotate|stop
AUDIO_POLICY="${MF_AUDIO_POLICY:-auto}"                    # auto|copy|aac
AUDIO_BITRATE="${MF_AUDIO_BITRATE:-160k}"
SRC_AUDIO_CODEC="${MF_SRC_AUDIO_CODEC:-}"
FFMPEG_BIN="${MF_FFMPEG:-ffmpeg}"
FFPROBE_BIN="${MF_FFPROBE:-ffprobe}"
FF_LOGLEVEL="${MF_FFMPEG_LOGLEVEL:-warning}"
KEEP_WINDOW=0
KEEP_LOGS=0                                                # --keep-logs (F1)
OWN_GEN=0                                                  # --own-gen (F2)
GEN_REUSE="${MF_GEN_REUSE:-refuse}"                        # refuse|takeover
CLEAN_ON_STOP="${MF_CLEAN_ON_STOP:-1}"
SUP_TOKEN="${MF_SUP_TOKEN:-}"
PROGRESS_PERIOD="${MF_PROGRESS_PERIOD:-2}"
# F5 (t7): la cota/poda cubre .ts/.m4s/.mp4/.aac (no sólo seg*.ts)
MEDIA_EXTS="${MF_MEDIA_EXTS:-ts m4s mp4 aac}"
# F2 (t7): janitor de tmpfs — edad y presupuesto total
JANITOR_AGE="${MF_JANITOR_AGE:-300}"
JANITOR_BUDGET_BYTES="${MF_JANITOR_BUDGET_BYTES:-0}"        # 0 = 80% del tmpfs

# Estado runtime
OUT=""
OUT_SUBDIR=""
LOCK_FILE=""
URL_LOCK_FILE=""
PROGRESS_FILE=""
FF_LOG=""
FF_ERR_FIFO=""
FF_REDACT_PID=""
FF_PID=""
FF_STARTED=0
SESSION_START=0
MON_RC=0
PL_SEQ=0
PL_COUNT=0
PROG_OUT_US=0
PROG_SIZE=0
PROG_END=0
ARGV=()
HLS_TIME=6
HLS_FLAGS="delete_segments+append_list+omit_endlist+temp_file+independent_segments"
SEQ_FLOOR=0
LAST_SEQ=0
FF_PROGRESS_LAST=0
AUDIO_TRANSCODE=0
AUDIO_CHECKED=0
AUDIO_RETRY_DONE=0
CONSEC_FAIL=0
STOP=0
TRAP_DONE=0
SUP_TOOL=""
SUP_TMO="0.4"          # timeout por llamada UDS (s); adaptativo en el 1er publish
SUP_LAST_OK=0
COORD_WARN_TS=0
READY_SENT=0           # READY=1 emitido (Type=notify) antes de cualquier UDS
CREATED_OUT=0          # el dir de ESTA gen lo creó este worker (para deshacerlo)
PREPARED=0             # prepare_dirs ejecutado (sólo entonces poseemos la gen)

# Modos
SELFTEST=0
SELFTEST_REMUX=0
PRINT_ARGV=0
PROBE_LOCK=0
CLEANUP_ONLY=0
TMPDIR_OVERRIDE=""
VERBOSE=0

# ── 1. utilidades base ───────────────────────────────────────────────────────
ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }

log() { # level msg
    local lvl="$1"; shift
    printf '%s %s %s[%d]: %s\n' "$(ts)" "$lvl" "ape-ingest" "$$" "$*" >&2
}
logi() { log INFO "$*"; }
logw() { log WARN "$*"; }
loge() { log ERROR "$*"; }
logd() { [ "$VERBOSE" -eq 1 ] && log DEBUG "$*" || true; }

# Traza de orden para el selftest (sólo si MF_TEST_TRACE está definido): permite
# demostrar que READY=1 sale ANTES del primer PUBLISH por UDS. Sin la variable
# no hace nada (no abre ficheros en producción).
_trace() {
    [ -n "${MF_TEST_TRACE:-}" ] || return 0
    printf '%s %s\n' "$(date +%s%N)" "$*" >>"$MF_TEST_TRACE" 2>/dev/null || true
}

# Reloj monótono en microsegundos para acotar los reintentos del 1er publish.
# EPOCHREALTIME es un builtin de bash ≥5 (sin fork); fallback a date.
_now_us() {
    local t="${EPOCHREALTIME:-}"
    if [ -n "$t" ]; then
        printf '%s' "${t//[.,]/}"
    else
        date +%s%6N 2>/dev/null || printf '0'
    fi
}

_remaining_s() { # µs restantes → "1.234" (segundos con 3 decimales)
    local us="${1:-0}"
    [ "$us" -lt 0 ] && us=0
    printf '%d.%03d' $(( us / 1000000 )) $(( (us % 1000000) / 1000 ))
}

die() { # code msg...
    local code="$1"; shift
    loge "$*"
    exit "$code"
}

is_uint() { [[ ${1:-} =~ ^[0-9]+$ ]]; }

clamp() { # val min max → eco
    local v="$1" lo="$2" hi="$3"
    [ "$v" -lt "$lo" ] && v="$lo"
    [ "$v" -gt "$hi" ] && v="$hi"
    printf '%s' "$v"
}

strip_cr() { printf '%s' "${1//$'\r'/}"; }

redact_url() { # nunca imprime credenciales
    local u="${1:-}" scheme rest authority
    case "$u" in
        *://*) scheme="${u%%://*}"; rest="${u#*://}" ;;
        *) printf '%s' "<redacted>"; return 0 ;;
    esac
    authority="${rest%%/*}"
    authority="${authority##*@}"                  # fuera user:pass@
    if [ "$rest" = "$authority" ]; then
        printf '%s://%s' "$scheme" "$authority"
    else
        printf '%s://%s/<redacted>' "$scheme" "$authority"
    fi
}

url_host() { # host:puerto sin credenciales (para logs)
    local u="${1:-}" rest
    case "$u" in *://*) rest="${u#*://}" ;; *) printf '%s' "?"; return 0 ;; esac
    rest="${rest%%/*}"; rest="${rest##*@}"
    printf '%s' "$rest"
}

argv_quoted() { # argv con la URL redactada (para logs/diagnóstico)
    local a quoted=""
    for a in "${ARGV[@]}"; do
        [ "$a" = "$URL" ] && a=$(redact_url "$URL")
        quoted+="$(printf '%q' "$a") "
    done
    printf '%s' "$quoted"
}

# ── 2. clave de sesión: MISMA función que I1 key_of() (ape_session.lua) ──────
#   key = hex32(lane1) .. hex32(lane2) sobre "\0" .. "proveedor|canal".
#   Replicado bit a bit y verificado contra 5 vectores generados por el módulo
#   Lua real (ver --selftest). El supervisor pasa la key ya calculada; esto es
#   redundancia para --provider/--channel y para el selftest.
_MF_MOD=2147483647
_byte_of() { LC_ALL=C printf '%d' "'$1"; }

_hash_lane() { # str seed prime
    local s="$1" seed="$2" prime="$3" h i c
    h=$(( seed % _MF_MOD ))
    for (( i=0; i<${#s}; i++ )); do
        c=${s:i:1}
        h=$(( (h * prime + $(_byte_of "$c")) % _MF_MOD ))
    done
    printf '%d' "$h"
}

_sha_i() { printf '%08x' $(( $1 % 4294967296 )); }

_mf_norm_pair() { # provider channel → "p|c" (rc≠0 si inválido)
    local p c x
    p=$(printf '%s' "${1:-}" | tr 'A-Z' 'a-z')
    p="${p#"${p%%[![:space:]]*}"}"; p="${p%"${p##*[![:space:]]}"}"
    p="${p#*://}"
    p="${p%%/*}"
    case "$p" in *:80) p="${p%:80}" ;; *:443) p="${p%:443}" ;; esac
    p="${p%.}"
    c="${2:-}"
    c="${c//[[:space:]]/}"
    c="${c%%\?*}"; c="${c%%#*}"
    c="${c##*/}"
    for x in .m3u8 .M3U8 .m3u .M3U .ts .TS; do c="${c%$x}"; done
    [ -n "$p" ] && [ -n "$c" ] || return 1
    [ "${#p}" -le 190 ] && [ "${#c}" -le 64 ] || return 1
    [[ $p =~ ^[A-Za-z0-9._:-]+$ ]] || return 1
    [[ $c =~ ^[A-Za-z0-9._-]+$ ]] || return 1
    printf '%s|%s' "$p" "$c"
}

_mf_key_of() { # provider channel → 16 hex
    local idem s h1 h2 i c
    idem=$(_mf_norm_pair "$1" "$2") || return 1
    s=$'\0'"$idem"
    # primer byte NUL: h = seed*prime % MOD (sumar 0 no cambia nada)
    h1=$(( ( (2166136261 % _MF_MOD) * 131 ) % _MF_MOD ))
    h2=$(( ( (2246822519 % _MF_MOD) * 65599 ) % _MF_MOD ))
    for (( i=0; i<${#s}; i++ )); do
        c=${s:i:1}
        [ -z "$c" ] && continue
        h1=$(( (h1 * 131 + $(_byte_of "$c")) % _MF_MOD ))
        h2=$(( (h2 * 65599 + $(_byte_of "$c")) % _MF_MOD ))
    done
    printf '%s%s' "$(_sha_i "$h1")" "$(_sha_i "$h2")"
}

valid_key() { [[ ${1:-} =~ ^[0-9a-f]{16}$ ]]; }

# ── 3. notificaciones systemd (Type=notify + WatchdogSec) ────────────────────
#   bash no habla sd_notify por sí solo: se usa systemd-notify (presente en
#   systemd 255, medido en el VPS). Si el helper no existiera, se intenta un
#   datagrama AF_UNIX con socat. Sin NOTIFY_SOCKET (ejecución manual) no-op.
notify_now() {
    _trace "notify $*"
    [ -n "${NOTIFY_SOCKET:-}" ] || return 0
    if command -v systemd-notify >/dev/null 2>&1; then
        systemd-notify --no-block "$@" >/dev/null 2>&1 || true
        return 0
    fi
    case "${NOTIFY_SOCKET}" in
        @*) return 0 ;;
    esac
    if command -v socat >/dev/null 2>&1; then
        local msg="" a
        for a in "$@"; do
            case "$a" in
                WATCHDOG=1) msg+="WATCHDOG=1"$'\n' ;;
                --ready) msg+="READY=1"$'\n' ;;
                --stopping) msg+="STOPPING=1"$'\n' ;;
                --status=*) msg+="STATUS=${a#--status=}"$'\n' ;;
            esac
        done
        [ -n "$msg" ] && printf '%s' "$msg" | socat - UNIX-SENDTO:"$NOTIFY_SOCKET" >/dev/null 2>&1 || true
    fi
    return 0
}
notify_ready() {
    # READY=1 TEMPRANO (fix B1/t12): se emite en cuanto el gen está validado
    # localmente y el directorio de la ventana está preparado, ANTES de
    # cualquier PUBLISH por UDS. Así `systemctl start` (Type=notify) no se
    # queda esperando a un supervisor ocupado.
    notify_now --ready --status="ready gen=${GEN} (dir listo; validando gen con el supervisor)"
    READY_SENT=1
    logi "sd_notify READY gen=${GEN} (temprano, antes del publish UDS)"
}
notify_status() { notify_now --status="$1"; }
notify_watchdog() { notify_now WATCHDOG=1; }
notify_stopping() { notify_now --stopping --status="stopping gen=${GEN}"; }

# ── 4. argumentos ────────────────────────────────────────────────────────────
usage() {
    cat <<'USAGE'
ape-ingest.sh — worker de ingesta media-fanout (1 ffmpeg, remux, ventana tmpfs)

SESIÓN (el supervisor es la autoridad; una de estas formas):
  --instance <key16>            toma MF_KEY/MF_GEN/MF_OUT/... del entorno
  --key <key16> --gen <n> [--out /mf/<key>/<gen>/]
  --provider <p> --channel <c>  calcula la key igual que el coordinador

ENTRADA (credenciales SIEMPRE fuera de argv):
  --url-file <ruta 0640>        primera línea = URL del proveedor
  (o variable de entorno MF_UPSTREAM_URL)

LÍMITES / VENTANA:
  --window-root <dir>           def. /dev/shm/mf (tmpfs de la ventana)
  --hls-time <s|auto>           def. auto (MF_SRC_SEG_DUR; si no, 6)
  --hls-list-size <n>           def. 8 (4..12)
  --window-max-bytes <n>        def. 83886080 (80 MiB)
  --min-free-bytes <n>          def. 100663296 (96 MiB)
  --stall-timeout <s>           def. 20 (10..25; TTL del ticket 30-60 s)
  --startup-timeout <s>         def. 20
  --heartbeat <s>               def. 5
  --max-runtime <s>             0 = sin límite (tests/ops)
  --retry-max <n>               rotaciones antes de fallar (def. 3)
  --on-eof rotate|stop          def. rotate (stop para ficheros/tests)
  --audio-policy auto|copy|aac  def. auto (ver §AUDIO del header)
  --media-exts "ts m4s mp4 aac" extensiones de segmento que cuentan para la
                                cota/poda (F5: no sólo seg*.ts)
  --janitor-age <s>             antigüedad para barrer sesiones sin worker (300)
  --janitor-budget-bytes <n>    presupuesto total de la ventana (0 = 80% tmpfs)
  --lock-dir <dir>              SÓLO tests (canónico fijo: /run/mediafanout/locks;
                                otro valor exige MF_TEST_ALLOW_LOCK_DIR=1)
  --ffmpeg <bin> --ffprobe <bin>

AUTORIDAD:
  --sup-sock <ruta>             def. /run/mediafanout/mf.sock
  --no-supervisor               sólo tests/ops (NO usar en producción)
  --with-coordinator            activa el plano HTTP loopback (sólo tests:
                                por defecto el supervisor es el relay, Q-A)
  --coordinator <url>           def. http://127.0.0.1:8090
  --keep-window                 no borrar la ventana al fallar (debug)
  --keep-logs                   no borrar el stderr redactado de ffmpeg (F1)

MODOS:
  --print-argv                  imprime el argv de ffmpeg (URL redactada) y sale
  --probe-lock                  prueba el lock de la key: 0 libre / 3 ocupado
  --cleanup                     barre gens viejas/huérfanas de la key y sale
  --own-gen                     con --cleanup: si el flock está libre, borra
                                TAMBIÉN la generación vigente de la key (F2)
  --selftest                    batería offline (lock, argv, ventana, fencing)
  --selftest-remux              añade remux real con ffmpeg local (lento)
  --tmpdir <dir>                directorio de trabajo de los selftests
  --verbose -h --help -V --version
USAGE
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --instance) INSTANCE="${2:-}"; shift 2 ;;
            --key) KEY="${2:-}"; shift 2 ;;
            --gen) GEN="${2:-}"; shift 2 ;;
            --out) OUT_ARG="${2:-}"; shift 2 ;;
            --provider) PROVIDER="${2:-}"; shift 2 ;;
            --channel) CHANNEL="${2:-}"; shift 2 ;;
            --url-file) URL_FILE="${2:-}"; shift 2 ;;
            --window-root) WINDOW_ROOT="${2:-}"; shift 2 ;;
            --lock-dir) LOCK_DIR="${2:-}"; shift 2 ;;
            --state-dir) STATE_DIR="${2:-}"; shift 2 ;;
            --hls-time) HLS_TIME_CFG="${2:-}"; shift 2 ;;
            --hls-list-size) HLS_LIST_SIZE="${2:-}"; shift 2 ;;
            --window-max-bytes) WINDOW_MAX_BYTES="${2:-}"; shift 2 ;;
            --min-free-bytes) MIN_FREE_BYTES="${2:-}"; shift 2 ;;
            --max-sessions) MAX_SESSIONS="${2:-}"; shift 2 ;;
            --stall-timeout) STALL_TIMEOUT="${2:-}"; shift 2 ;;
            --startup-timeout) STARTUP_TIMEOUT="${2:-}"; shift 2 ;;
            --heartbeat) HEARTBEAT_S="${2:-}"; shift 2 ;;
            --sup-grace) SUP_GRACE_S="${2:-}"; shift 2 ;;
            --rw-timeout-ms) RW_TIMEOUT_MS="${2:-}"; shift 2 ;;
            --live-start-index) LIVE_START_INDEX="${2:-}"; shift 2 ;;
            --retry-max) RETRY_MAX="${2:-}"; shift 2 ;;
            --max-runtime) MAX_RUNTIME="${2:-}"; shift 2 ;;
            --on-eof) ON_EOF="${2:-}"; shift 2 ;;
            --audio-policy) AUDIO_POLICY="${2:-}"; shift 2 ;;
            --audio-bitrate) AUDIO_BITRATE="${2:-}"; shift 2 ;;
            --ffmpeg) FFMPEG_BIN="${2:-}"; shift 2 ;;
            --ffprobe) FFPROBE_BIN="${2:-}"; shift 2 ;;
            --ffmpeg-loglevel) FF_LOGLEVEL="${2:-}"; shift 2 ;;
            --sup-sock) SUP_SOCK="${2:-}"; shift 2 ;;
            --sup-token) SUP_TOKEN="${2:-}"; shift 2 ;;
            --no-supervisor) NO_SUP=1; shift ;;
            --coordinator) COORD_URL="${2:-}"; shift 2 ;;
            --with-coordinator) NO_COORD=0; shift ;;
            --no-coordinator) NO_COORD=1; shift ;;
            --keep-window) KEEP_WINDOW=1; shift ;;
            --keep-logs) KEEP_LOGS=1; shift ;;
            --own-gen) OWN_GEN=1; shift ;;
            --media-exts) MEDIA_EXTS="${2:-}"; shift 2 ;;
            --janitor-age) JANITOR_AGE="${2:-}"; shift 2 ;;
            --janitor-budget-bytes) JANITOR_BUDGET_BYTES="${2:-}"; shift 2 ;;
            --gen-reuse) GEN_REUSE="${2:-}"; shift 2 ;;
            --clean-on-stop) CLEAN_ON_STOP="${2:-}"; shift 2 ;;
            --print-argv|--dry-run) PRINT_ARGV=1; shift ;;
            --probe-lock) PROBE_LOCK=1; shift ;;
            --cleanup) CLEANUP_ONLY=1; shift ;;
            --selftest) SELFTEST=1; shift ;;
            --selftest-remux) SELFTEST=1; SELFTEST_REMUX=1; shift ;;
            --tmpdir) TMPDIR_OVERRIDE="${2:-}"; shift 2 ;;
            --verbose) VERBOSE=1; shift ;;
            -h|--help) usage; exit 0 ;;
            -V|--version) printf '%s\n' "$VERSION"; exit 0 ;;
            *) die 2 "argumento desconocido: $1 (--help)" ;;
        esac
    done
}

# ── 5. resolución de sesión y validación ─────────────────────────────────────
resolve_key_only() {
    [ -n "$INSTANCE" ] && [ -z "$KEY" ] && valid_key "$INSTANCE" && KEY="$INSTANCE"
    if [ -z "$KEY" ] && [ -n "$PROVIDER" ] && [ -n "$CHANNEL" ]; then
        KEY=$(_mf_key_of "$PROVIDER" "$CHANNEL") || die 2 "provider/channel inválidos"
        logi "key derivada key=${KEY}"
    fi
    [ -n "$KEY" ] || die 2 "falta --key/--instance (o --provider+--channel)"
    KEY="${KEY,,}"
    valid_key "$KEY" || die 2 "key inválida (16 hex): '$KEY'"
}

resolve_session() {
    resolve_key_only
    is_uint "${GEN:-}" || die 2 "falta --gen (entero ≥1; lo asigna el supervisor)"
    GEN=$((10#$GEN))
    [ "$GEN" -ge 1 ] || die 2 "--gen debe ser ≥1"
    [[ $GEN =~ ^[1-9][0-9]{0,9}$ ]] || die 2 "--gen fuera de rango"
    case "$GEN_REUSE" in refuse|takeover) ;; *) die 2 "--gen-reuse refuse|takeover" ;; esac
    case "$AUDIO_POLICY" in auto|copy|aac) ;; *) die 2 "--audio-policy auto|copy|aac" ;; esac
    case "$ON_EOF" in rotate|stop) ;; *) die 2 "--on-eof rotate|stop" ;; esac
}

validate_limits() {
    is_uint "$HLS_LIST_SIZE" || die 2 "--hls-list-size entero"
    HLS_LIST_SIZE=$(clamp "$((10#$HLS_LIST_SIZE))" 4 12)
    is_uint "$WINDOW_MAX_BYTES" || die 2 "--window-max-bytes entero"
    WINDOW_MAX_BYTES=$((10#$WINDOW_MAX_BYTES))
    [ "$WINDOW_MAX_BYTES" -ge 16777216 ] || die 2 "--window-max-bytes ≥16 MiB"
    [ "$WINDOW_MAX_BYTES" -le 536870912 ] || die 2 "--window-max-bytes ≤512 MiB"
    is_uint "$MIN_FREE_BYTES" || die 2 "--min-free-bytes entero"
    MIN_FREE_BYTES=$((10#$MIN_FREE_BYTES))
    is_uint "$MAX_SESSIONS" || die 2 "--max-sessions entero"
    MAX_SESSIONS=$(clamp "$((10#$MAX_SESSIONS))" 1 16)
    is_uint "$STALL_TIMEOUT" || die 2 "--stall-timeout entero"
    STALL_TIMEOUT=$((10#$STALL_TIMEOUT))
    if [ "$STALL_TIMEOUT" -lt 10 ] || [ "$STALL_TIMEOUT" -gt 25 ]; then
        die 2 "--stall-timeout en 10..25 s (TTL del ticket: 30-60 s)"
    fi
    is_uint "$STARTUP_TIMEOUT" || die 2 "--startup-timeout entero"
    STARTUP_TIMEOUT=$(clamp "$((10#$STARTUP_TIMEOUT))" 5 120)
    is_uint "$HEARTBEAT_S" || die 2 "--heartbeat entero"
    HEARTBEAT_S=$(clamp "$((10#$HEARTBEAT_S))" 2 15)
    is_uint "$SUP_GRACE_S" || die 2 "--sup-grace entero"
    SUP_GRACE_S=$(clamp "$((10#$SUP_GRACE_S))" 5 120)
    is_uint "$RW_TIMEOUT_MS" || die 2 "--rw-timeout-ms entero"
    RW_TIMEOUT_MS=$(clamp "$((10#$RW_TIMEOUT_MS))" 5000 60000)
    is_uint "$RETRY_MAX" || die 2 "--retry-max entero"
    RETRY_MAX=$(clamp "$((10#$RETRY_MAX))" 0 10)
    is_uint "$MAX_RUNTIME" || die 2 "--max-runtime entero"
    MAX_RUNTIME=$((10#$MAX_RUNTIME))
    is_uint "$PROGRESS_PERIOD" || die 2 "MF_PROGRESS_PERIOD entero"
    PROGRESS_PERIOD=$(clamp "$((10#$PROGRESS_PERIOD))" 1 10)
    is_uint "${LIVE_START_INDEX#-}" || die 2 "--live-start-index entero"
    [ -n "$UA" ] || die 2 "MF_UA vacío: W1 midió 461 con UA de curl; se exige UA de player"
    case "$UA" in *$'\n'*|*$'\r'*) die 2 "UA con control de línea" ;; esac
    [[ $WINDOW_ROOT = /* ]] || die 2 "--window-root debe ser absoluto"
    case "$WINDOW_ROOT" in *..*) die 2 "--window-root con '..'" ;; esac
    WINDOW_ROOT="${WINDOW_ROOT%/}"
    # F5: extensiones de medios para la cota/poda (ts m4s mp4 aac)
    local _e _n=0
    for _e in $MEDIA_EXTS; do
        [[ $_e =~ ^[A-Za-z0-9]{1,5}$ ]] || die 2 "--media-exts: '$MEDIA_EXTS'"
        _n=$((_n + 1))
    done
    [ "$_n" -ge 1 ] || die 2 "--media-exts vacío"
    # F2: janitor
    is_uint "$JANITOR_AGE" || die 2 "--janitor-age entero (s)"
    JANITOR_AGE=$((10#$JANITOR_AGE))
    is_uint "$JANITOR_BUDGET_BYTES" || die 2 "--janitor-budget-bytes entero"
    JANITOR_BUDGET_BYTES=$((10#$JANITOR_BUDGET_BYTES))
}

resolve_hls_time() {
    local v="$SRC_SEG_DUR"
    case "$HLS_TIME_CFG" in
        auto)
            if is_uint "$v" && [ "$((10#$v))" -ge 2 ] && [ "$((10#$v))" -le 12 ]; then
                HLS_TIME=$((10#$v))
            else
                HLS_TIME=6      # W1 §3.3: segmentos de origen ~6 s
            fi
            ;;
        *)
            is_uint "$HLS_TIME_CFG" || die 2 "--hls-time entero o 'auto'"
            HLS_TIME=$((10#$HLS_TIME_CFG))
            ;;
    esac
    HLS_TIME=$(clamp "$HLS_TIME" 2 12)
}

load_url() {
    if [ -z "$URL" ] && [ -n "$URL_FILE" ]; then
        [ -r "$URL_FILE" ] || die 2 "no puedo leer --url-file (¿0640 mediafanout?)"
        URL=$(head -n1 -- "$URL_FILE" 2>/dev/null)
        URL=$(strip_cr "$URL")
    fi
    if [ -z "$URL" ]; then
        if [ "$PRINT_ARGV" -eq 1 ]; then
            URL="http://placeholder.invalid/live.m3u8"
            return 0
        fi
        die 2 "falta la URL: MF_UPSTREAM_URL o --url-file (nunca por argv)"
    fi
    case "$URL" in
        http://*|https://*|file://*) ;;
        *) die 2 "URL con esquema no permitido (http/https/file)" ;;
    esac
    case "$URL" in *$'\n'*|*$'\r'*|*' '*) die 2 "URL con espacios/control" ;; esac
    [ "${#URL}" -le 4096 ] || die 2 "URL demasiado larga"
}

normalize_out() { # valida --out; fija OUT_SUBDIR (key | key/4k) y WINDOW_ROOT
    local rel="" root="$WINDOW_ROOT"
    case "${OUT_ARG:-}" in
        "") rel="$KEY/$GEN" ;;
        /mf/*) rel="${OUT_ARG#/mf/}"; rel="${rel%/}" ;;
        "$root"/*) rel="${OUT_ARG#"$root"/}"; rel="${rel%/}" ;;
        /*)
            # Ruta de FICHEROS (contrato t9: MF_OUT=/dev/shm/mf/<key>/<gen>/).
            # Si no cuelga del window root configurado, la raíz se deriva de la
            # propia ruta (el sufijo debe ser exactamente key/gen): el worker no
            # depende de que --window-root coincida con el default.
            case "$OUT_ARG" in *..*) die 4 "--out con '..'" ;; esac
            rel="${OUT_ARG%/}"
            local prefix=""
            case "$rel" in
                */"$KEY/$GEN") prefix="${rel%/"$KEY/$GEN"}" ;;
                */"$KEY/4k/$GEN") prefix="${rel%/"$KEY/4k/$GEN"}" ;;
                *) die 4 "--out debe terminar en /$KEY/$GEN (o /$KEY/4k/$GEN): '$OUT_ARG'" ;;
            esac
            prefix="${prefix%/}"
            [ -n "$prefix" ] || die 4 "--out sin raíz de ventana: '$OUT_ARG'"
            [[ $prefix = /* ]] || die 4 "--out no absoluto: '$OUT_ARG'"
            WINDOW_ROOT="$prefix"
            rel="${rel#"$WINDOW_ROOT"/}"
            ;;
        *) rel="${OUT_ARG%/}" ;;
    esac
    case "$rel" in *..*) die 4 "--out con '..'" ;; esac
    case "$rel" in
        "$KEY/$GEN") OUT_SUBDIR="$KEY" ;;
        "$KEY/4k/$GEN") OUT_SUBDIR="$KEY/4k" ;;
        *) die 4 "--out debe ser <root>/$KEY/$GEN (o /mf/$KEY/$GEN/)" ;;
    esac
    OUT="$WINDOW_ROOT/$OUT_SUBDIR/$GEN"
}

resolve_lock_dir() {
    # F4 (t7): el lock es del SUPERVISOR, no de la ventana. Un lock por window
    # root permitía dos ingestas de la misma key con roots distintos. El path
    # canónico es fijo; cualquier override sólo se acepta en tests.
    local want="${LOCK_DIR:-}"
    if [ -z "$want" ] || [ "$want" = "$LOCK_ROOT" ]; then
        LOCK_DIR="$LOCK_ROOT"
        return 0
    fi
    if [ "${MF_TEST_ALLOW_LOCK_DIR:-0}" = "1" ]; then
        logw "lock dir de test: '$want' (MF_TEST_ALLOW_LOCK_DIR=1)"
        LOCK_DIR="${want%/}"
        return 0
    fi
    die 2 "lock dir no permitido: '$want' (canónico fijo: $LOCK_ROOT; override sólo con MF_TEST_ALLOW_LOCK_DIR=1)"
}

url_fingerprint() { # URL → 16 hex SIN credenciales/tokens (F4: dedup por URL)
    local u="${1:-}" scheme rest host path
    case "$u" in *://*) scheme="${u%%://*}"; rest="${u#*://}" ;; *) return 1 ;; esac
    [ -n "$scheme" ] || return 1
    rest="${rest%%#*}"
    rest="${rest%%\?*}"                 # fuera query (tokens)
    host="${rest%%/*}"
    host="${host##*@}"                  # fuera userinfo
    host="${host,,}"
    path=""
    case "$rest" in */*) path="/${rest#*/}" ;; esac
    path="${path%/}"
    [ -n "$host" ] || return 1
    printf '%s%s' "$host" "$path" | md5sum | awk '{ print substr($1, 1, 16) }'
}

acquire_url_lock() {
    # Segundo flock, por URL normalizada: dos keys DISTINTAS que resuelven la
    # misma URL no pueden abrir dos conexiones upstream (aunque el supervisor
    # ya deduplica por idem, esto es defensa en profundidad del worker).
    [ "$NO_SUP" -eq 1 ] && [ -z "${URL:-}" ] && return 0
    local fp
    fp=$(url_fingerprint "${URL:-}") || { logw "URL no normalizable: sin dedup por URL"; return 0; }
    URL_LOCK_FILE="$LOCK_DIR/url-$fp.lock"
    exec 8>>"$URL_LOCK_FILE" || { logw "no puedo abrir el lock de URL"; URL_LOCK_FILE=""; return 0; }
    if ! flock -n 8; then
        exec 8>&-
        URL_LOCK_FILE=""
        die 3 "upstream duplicado: otra sesión ya ingesta la MISMA URL normalizada (dedup URL)"
    fi
    printf 'pid=%d key=%s gen=%s\n' "$$" "$KEY" "$GEN" >&8 2>/dev/null || true
    logi "lock de URL adquirido (dedup por URL normalizada, sin credenciales)"
}

key_lock_held() { # key → 0 si hay un worker vivo con el flock de esa key
    local k="${1:-}" f
    valid_key "$k" || return 1
    f="$LOCK_DIR/$k.lock"
    [ -e "$f" ] || return 1
    flock -n "$f" -c true 2>/dev/null && return 1
    return 0
}

# F2/t18: el borrado debe ejecutarse CON el flock de la key tomado (no vale
# mirar y soltar: entre la comprobación y el rm -rf puede arrancar un worker).
# lock_try_hold abre el lock en el fd 7 y lo mantiene hasta lock_release_hold.
lock_try_hold() { # key → 0 = lock adquirido (fd 7) · 1 = ocupado / no válido
    local k="${1:-}" f
    valid_key "$k" || return 1
    mkdir -p -- "$LOCK_DIR" 2>/dev/null || return 1
    f="$LOCK_DIR/$k.lock"
    { exec 7>>"$f"; } 2>/dev/null || return 1
    if flock -n 7 2>/dev/null; then return 0; fi
    { exec 7>&-; } 2>/dev/null || true
    return 1
}

lock_release_hold() {
    { exec 7>&-; } 2>/dev/null || true
}

set_paths() {
    normalize_out
    resolve_lock_dir
    STATE_DIR="${STATE_DIR:-$WINDOW_ROOT/state}"
    LOCK_FILE="$LOCK_DIR/$KEY.lock"
    URL_LOCK_FILE=""
    PROGRESS_FILE="$STATE_DIR/$KEY-$GEN.progress"
    FF_LOG="$STATE_DIR/$KEY-$GEN.ffmpeg.log"
    FF_ERR_FIFO="$STATE_DIR/$KEY-$GEN.stderr.fifo"
}

# ── 6. lock single-writer (garantía local de "un solo ffmpeg") ──────────────
acquire_lock() {
    mkdir -p -- "$LOCK_DIR" 2>/dev/null || die 2 "no puedo crear $LOCK_DIR"
    exec 9>>"$LOCK_FILE" || die 2 "no puedo abrir el lock $LOCK_FILE"
    flock -n 9 || die 3 "lock ocupado: ya hay otra ingesta viva para $KEY (exit 3)"
    printf 'pid=%d gen=%s started=%s\n' "$$" "$GEN" "$(ts)" >&9 2>/dev/null || true
    logi "lock adquirido $LOCK_FILE (single-writer, fijo del supervisor)"
    acquire_url_lock
}

probe_lock() { # 0 libre / 3 ocupado
    mkdir -p -- "$LOCK_DIR" 2>/dev/null || exit 2
    if ( exec 9>>"$LOCK_FILE" && flock -n 9 ) 2>/dev/null; then exit 0; fi
    exit 3
}

count_live_workers() { # locks de KEY tomados AHORA (ignora url-*.lock)
    local n=0 f b
    shopt -s nullglob
    for f in "$LOCK_DIR"/*.lock; do
        b="${f##*/}"
        valid_key "${b%.lock}" || continue
        if ! flock -n "$f" -c true 2>/dev/null; then n=$((n + 1)); fi
    done
    shopt -u nullglob
    printf '%s' "$n"
}

# ── 7. supervisor (autoridad): protocolo UDS de una línea ────────────────────
detect_sup_tool() {
    if [ "$NO_SUP" -eq 1 ]; then SUP_TOOL="none"; return 0; fi
    if command -v socat >/dev/null 2>&1; then SUP_TOOL="socat"
    elif command -v nc >/dev/null 2>&1; then SUP_TOOL="nc"
    elif command -v python3 >/dev/null 2>&1; then SUP_TOOL="python3"
    else die 20 "sin cliente UDS (socat/nc/python3): no puedo validar gen"
    fi
    if [ ! -S "$SUP_SOCK" ] && [ -S "$SUP_ALIAS_SOCK" ]; then
        logw "supervisor: '$SUP_SOCK' no existe; uso el alias '$SUP_ALIAS_SOCK'"
        SUP_SOCK="$SUP_ALIAS_SOCK"
    fi
    SUP_LAST_OK=$SECONDS
}

sup_call() { # op [args...] → imprime la línea de respuesta; rc0 si hay respuesta
    [ "$NO_SUP" -eq 1 ] && return 2
    local line="$1" reply="" a tmo="${SUP_TMO:-0.4}"
    shift
    for a in "$@"; do line="$line $a"; done
    [ -n "$SUP_TOKEN" ] && line="$line token=$SUP_TOKEN"
    _trace "sup $line"
    case "$SUP_TOOL" in
        socat)
            reply=$(timeout "$tmo" socat -T"$tmo" - UNIX-CONNECT:"$SUP_SOCK" <<<"$line" 2>/dev/null | head -n1)
            ;;
        nc)
            reply=$(timeout "$tmo" nc -U -N -w 1 "$SUP_SOCK" <<<"$line" 2>/dev/null | head -n1)
            ;;
        python3)
            reply=$(timeout "$tmo" python3 -c '
import socket,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.settimeout(0.4)
s.connect(sys.argv[1]); s.sendall((sys.stdin.readline()).encode())
print(s.makefile("r",encoding="utf-8",errors="replace").readline().strip())
' "$SUP_SOCK" <<<"$line" 2>/dev/null)
            ;;
        *) return 2 ;;
    esac
    reply=$(strip_cr "$reply")
    [ -n "$reply" ] || return 1
    printf '%s' "$reply"
    SUP_LAST_OK=$SECONDS
    return 0
}

sup_parse_gen() { printf '%s' "${1:-}" | sed -n 's/.*gen=\([0-9][0-9]*\).*/\1/p' | head -n1; }
sup_parse_code() { printf '%s' "${1:-}" | sed -n 's/.*code=\([A-Za-z0-9_:-]*\).*/\1/p' | head -n1; }
sup_is_ok() { case "${1:-}" in OK*) return 0 ;; esac; return 1; }
sup_is_stale() {
    case "$(sup_parse_code "${1:-}")" in
        stale_generation|unknown_gen|fenced|bad_gen|gen_mismatch) return 0 ;;
    esac
    return 1
}

sup_publish() { # state [seq] → 0 ok · 1 no · 2 stale
    [ "$NO_SUP" -eq 1 ] && return 0
    local state="$1" seq="${2:-}" rep
    local args=(PUBLISH "$KEY" "$GEN" "state=$state")
    [ -n "$seq" ] && args+=("seq=$seq")
    rep=$(sup_call "${args[@]}") || return 1
    sup_is_ok "$rep" && return 0
    if sup_is_stale "$rep"; then loge "supervisor: FENCED ($rep) gen=$GEN"; return 2; fi
    logw "supervisor PUBLISH rechazado: $rep"
    return 1
}

sup_publish_first() { # state [seq] → 0 ok · 2 stale · 20 agotado (fix B1/t12)
    # El supervisor puede estar OCUPADO justo cuando el worker arranca (t9 está
    # sirviendo otro OPEN/seed). No se puede morir al primer timeout de 0,4 s:
    # 5 intentos con backoff 0/0,2/0,4/0,8/1,6 s (espera total 3,0 s) y un
    # presupuesto DURO de 4,0 s medido con reloj monótono. El timeout de cada
    # intento se recorta al presupuesto restante, así nunca se pasa de 4 s.
    #   stale_generation  → 2 (fencing inmediato: no se reintenta un gen muerto)
    #   sin respuesta ×5  → 20
    [ "$NO_SUP" -eq 1 ] && return 0
    local state="$1" seq="${2:-}"
    local delays_ms=(0 200 400 800 1600)     # backoff 0/0,2/0,4/0,8/1,6 (3,0 s)
    local start deadline now rem rc i saved_tmo="$SUP_TMO" delay_us tmo_us
    start=$(_now_us)
    deadline=$(( start + 4000000 ))          # presupuesto duro de 4,0 s
    for i in 0 1 2 3 4; do
        now=$(_now_us)
        rem=$(( deadline - now ))
        if [ "$i" -gt 0 ]; then
            delay_us=$(( ${delays_ms[$i]} * 1000 ))
            [ "$delay_us" -gt "$rem" ] && delay_us="$rem"
            [ "$delay_us" -gt 0 ] && sleep "$(_remaining_s "$delay_us")"
            now=$(_now_us)
            rem=$(( deadline - now ))
        fi
        if [ "$rem" -lt 120000 ]; then
            logw "PUBLISH $state: presupuesto agotado tras ${i} intento(s)"
            break
        fi
        tmo_us=$rem
        [ "$tmo_us" -gt 400000 ] && tmo_us=400000
        SUP_TMO=$(_remaining_s "$tmo_us")
        rc=0
        sup_publish "$state" "$seq" || rc=$?
        if [ "$rc" -eq 0 ]; then SUP_TMO="$saved_tmo"; return 0; fi
        if [ "$rc" -eq 2 ]; then SUP_TMO="$saved_tmo"; return 2; fi
        if [ "$i" -lt 4 ]; then
            logw "PUBLISH $state: sin respuesta del supervisor (intento $((i + 1))/5, $(_remaining_s $((deadline - $(_now_us))))s de presupuesto)"
        fi
    done
    SUP_TMO="$saved_tmo"
    return 20
}

sup_heartbeat() { # seq → 0 ok · 1 no · 2 stale
    [ "$NO_SUP" -eq 1 ] && return 0
    local rep
    rep=$(sup_call HEARTBEAT "$KEY" "$GEN" "seq=$1") || return 1
    sup_is_ok "$rep" && return 0
    sup_is_stale "$rep" && return 2
    return 1
}

sup_restart() { # reason → imprime gen nueva; 0 ok · 3 stale · 4 unsupported · 5 no
    [ "$NO_SUP" -eq 1 ] && return 5
    local rep code newgen
    rep=$(sup_call RESTART "$KEY" "$GEN" "reason=$1") || return 5
    if sup_is_ok "$rep"; then
        newgen=$(sup_parse_gen "$rep")
        [ -n "$newgen" ] || return 5
        if [ "$newgen" -le "$GEN" ]; then
            loge "supervisor RESTART no avanzó gen ($rep); actual=$GEN"
            return 4
        fi
        printf '%s' "$newgen"
        return 0
    fi
    code=$(sup_parse_code "$rep")
    case "$code" in
        stale_generation|unknown_gen|fenced|bad_gen) return 3 ;;
        unsupported|bad_op|unknown_op|not_implemented) return 4 ;;
    esac
    logw "supervisor RESTART rechazado: $rep"
    return 5
}

sup_fail() { # reason
    [ "$NO_SUP" -eq 1 ] && return 0
    local rep
    rep=$(sup_call FAIL "$KEY" "$GEN" "reason=$1") || return 0
    logi "supervisor FAIL gen=$GEN reason=$1 → $rep"
}

require_gen_authorized() {
    # Autoridad (UDS). Puede llamarse DESPUÉS de READY=1 (fix B1/t12): el
    # supervisor puede estar ocupado; se reintenta hasta 4 s. Fencing intacto:
    #   stale_generation → 21 sin dejar NADA en la ventana (se descarta el dir)
    #   sin respuesta    → 20 tras agotar reintentos (nunca al primer timeout)
    if [ "$NO_SUP" -eq 1 ]; then
        logw "sin supervisor (--no-supervisor): validación de gen OMITIDA (sólo tests)"
        return 0
    fi
    local rc=0
    logi "validando gen $GEN con el supervisor (reintentos acotados ≤4 s)"
    sup_publish_first starting 0 || rc=$?
    case "$rc" in
        0) logi "gen autorizada por el supervisor gen=$GEN"; return 0 ;;
        2)
            discard_prepared_gen
            die 21 "generación stale/fenced: no queda nada escrito (gen=$GEN)"
            ;;
        *)
            discard_prepared_gen
            die 20 "supervisor inaccesible tras 4 s de reintentos (gen=$GEN)"
            ;;
    esac
}

discard_prepared_gen() {
    # Deshace el directorio de ventana creado para READY antes de la validación
    # de gen. Sólo borra si está VACÍO (nunca se escribió vídeo en él); si algo
    # hubiera dentro, se aplica el fencing normal. --keep-window lo respeta.
    [ "$KEEP_WINDOW" -eq 1 ] && return 0
    [ -d "$OUT" ] || return 0
    if [ -z "$(ls -A -- "$OUT" 2>/dev/null)" ]; then
        rmdir -- "$OUT" 2>/dev/null || true
        logi "dir de gen $GEN descartado (vacío, sin publicar)"
    else
        fence_gen
    fi
}

# ── 8. coordinador loopback (SOLO tests; Q-A: el relay es del supervisor) ────
coord_call() { # op query ; deja COORD_STATUS/COORD_BODY
    [ "$NO_COORD" -eq 1 ] && return 2
    command -v curl >/dev/null 2>&1 || return 2
    local url body hdr=()
    url="${COORD_URL%/}/mf/ctl?op=$1&key=${KEY}&gen=${GEN}${2:-}"
    [ -n "$CTL_TOKEN" ] && hdr=(-H "X-MF-Ctl: $CTL_TOKEN")
    body=$(curl -sS --max-time 1 "${hdr[@]}" "$url" -w $'\n%{http_code}' 2>/dev/null) || {
        COORD_STATUS=0; COORD_BODY=""; return 1
    }
    COORD_STATUS="${body##*$'\n'}"
    COORD_BODY="${body%$'\n'*}"
    return 0
}

coord_reason() { printf '%s' "${COORD_BODY:-}" | sed -n 's/^err //p' | head -n1; }

coord_state_gen() {
    coord_call inspect || return 0
    [ "${COORD_STATUS:-0}" = "200" ] || return 0
    printf '%s' "${COORD_BODY:-}" | sed -n 's/.*gen=\([0-9][0-9]*\).*/\1/p' | head -n1
}

coord_publish() { # state [seq] → 0 ok · 2 fenced · 1 best-effort
    [ "$NO_COORD" -eq 1 ] && return 0
    local state="$1" seq="${2:-}" q="&state=$state"
    [ -n "$seq" ] && q="$q&seq=$seq"
    if ! coord_call publish "$q"; then
        if [ $((SECONDS - COORD_WARN_TS)) -ge 30 ]; then
            logw "coordinador inaccesible en $COORD_URL (sigo; reintento cada 5 s)"
            COORD_WARN_TS=$SECONDS
        fi
        return 1
    fi
    case "$COORD_STATUS" in
        200) return 0 ;;
        409)
            local why cg; why=$(coord_reason)
            if [ "$why" = "stale_generation" ]; then
                cg=$(coord_state_gen)
                if [ -n "$cg" ] && [ "$cg" -gt "$GEN" ]; then
                    loge "coordinador por DELANTE (gen=$cg > $GEN): FENCED"
                    return 2
                fi
                return 1
            fi
            logw "coordinador publish gen=$GEN state=$state: $why"
            return 1
            ;;
        503) return 1 ;;
        *) logw "coordinador HTTP $COORD_STATUS"; return 1 ;;
    esac
}

coord_bootstrap() {
    [ "$NO_COORD" -eq 1 ] && return 0
    local s=""
    if coord_call inspect && [ "${COORD_STATUS:-0}" = "200" ]; then
        s=$(printf '%s' "${COORD_BODY:-}" | sed -n 's/.*seq=\([0-9][0-9]*\).*/\1/p' | head -n1)
    fi
    [ -n "$s" ] && SEQ_FLOOR="$s" && logi "coordinator seq floor=$SEQ_FLOOR"
    return 0
}

# ── 9. audio: política y decisión (sólo audio; vídeo SIEMPRE copy) ──────────
TS_AUDIO_OK=" aac mp3 mp2 ac3 eac3 "
audio_ok() { case "$TS_AUDIO_OK" in *" ${1:-} "*) return 0 ;; esac; return 1; }

audio_decision_pre() {
    if [ "$AUDIO_POLICY" = "aac" ]; then AUDIO_TRANSCODE=1; return 0; fi
    if [ "$AUDIO_POLICY" = "copy" ]; then AUDIO_TRANSCODE=0; return 0; fi
    if [ -n "$SRC_AUDIO_CODEC" ]; then
        if audio_ok "$SRC_AUDIO_CODEC"; then
            AUDIO_TRANSCODE=0
            logi "audio source='$SRC_AUDIO_CODEC' estándar en MPEG-TS → copy"
        else
            AUDIO_TRANSCODE=1
            logw "audio source='$SRC_AUDIO_CODEC' NO estándar en MPEG-TS → sólo audio a AAC (vídeo copy)"
        fi
    fi
}

first_segment_name() {
    [ -r "$OUT/index.m3u8" ] || return 1
    awk '!/^#/ && NF { print; exit }' "$OUT/index.m3u8" 2>/dev/null
}

probe_audio_codec() { # file → codec_name (LOCAL, sin red)
    local f="$1"
    [ -n "$f" ] && [ -e "$f" ] || return 1
    command -v "$FFPROBE_BIN" >/dev/null 2>&1 || return 1
    timeout 5 "$FFPROBE_BIN" -v error -select_streams a:0 \
        -show_entries stream=codec_name -of csv=p=0 -- "$f" 2>/dev/null | head -n1 | tr -d '\r'
}

audio_decision_post() { # 0 ok · 3 abortar · 4 reintentar con AAC (misma gen)
    [ "$AUDIO_CHECKED" -eq 1 ] && return 0
    [ "$AUDIO_TRANSCODE" -eq 1 ] && { AUDIO_CHECKED=1; return 0; }
    [ "$AUDIO_POLICY" = "copy" ] && { AUDIO_CHECKED=1; return 0; }
    local seg ac
    seg=$(first_segment_name) || { AUDIO_CHECKED=1; return 0; }
    ac=$(probe_audio_codec "$OUT/$seg") || { AUDIO_CHECKED=1; return 0; }
    AUDIO_CHECKED=1
    [ -z "$ac" ] && return 0
    if audio_ok "$ac"; then
        logi "audio verificado en salida: '$ac' (copy)"
        return 0
    fi
    if [ "$AUDIO_RETRY_DONE" -eq 1 ]; then
        loge "audio '$ac' sigue sin ser estándar tras transcodificar; aborto"
        return 3
    fi
    logw "audio '$ac' no estándar en MPEG-TS/HLS → reinicio SÓLO audio a AAC (vídeo copy)"
    AUDIO_TRANSCODE=1
    AUDIO_RETRY_DONE=1
    return 4
}

# ── 10. argv de ffmpeg (única ruta que produce el comando) ──────────────────
build_argv() {
    ARGV=(
        "$FFMPEG_BIN" -hide_banner -nostdin -loglevel "$FF_LOGLEVEL"
        -progress "$PROGRESS_FILE" -stats_period "$PROGRESS_PERIOD"
        -fflags +discardcorrupt
        -user_agent "$UA"
        -rw_timeout "$((RW_TIMEOUT_MS * 1000))"
        -reconnect 1 -reconnect_streamed 1 -reconnect_on_network_error 1
        -reconnect_on_http_error "429,500,502,503,504,509"
        -reconnect_delay_max 3
        -live_start_index "$LIVE_START_INDEX"
        -http_persistent 0
        -seg_max_retry 2
        -i "$URL"
        -map 0:v:0? -map 0:a:0? -sn -dn
    )
    if [ "$AUDIO_TRANSCODE" -eq 1 ]; then
        ARGV+=( -c:v copy -c:a aac -b:a "$AUDIO_BITRATE" )
    else
        ARGV+=( -c copy )
    fi
    ARGV+=(
        -f hls
        -hls_time "$HLS_TIME"
        -hls_list_size "$HLS_LIST_SIZE"
        -hls_delete_threshold 1
        -hls_flags "$HLS_FLAGS"
        -hls_segment_filename "seg%05d.ts"
        "index.m3u8"
    )
}

print_argv() {
    build_argv
    printf 'ARGV: %s\n' "$(argv_quoted)"
    printf 'VARS: key=%s gen=%s out=%s hls_time=%s list=%s window_max=%s audio=%s\n' \
        "$KEY" "$GEN" "$OUT" "$HLS_TIME" "$HLS_LIST_SIZE" "$WINDOW_MAX_BYTES" \
        "$([ "$AUDIO_TRANSCODE" -eq 1 ] && echo aac || echo copy)"
}

# ── 11. lectura de la ventana ───────────────────────────────────────────────
playlist_info() {
    PL_SEQ=0; PL_COUNT=0
    [ -r "$OUT/index.m3u8" ] || return 1
    local out
    out=$(awk '
        /^#EXT-X-MEDIA-SEQUENCE:/ { sub(/^#EXT-X-MEDIA-SEQUENCE:/, ""); seq = $0 + 0 }
        !/^#/ && NF { n++ }
        END { printf "%d %d", seq + 0, n + 0 }
    ' "$OUT/index.m3u8" 2>/dev/null)
    PL_SEQ="${out%% *}"; PL_COUNT="${out##* }"
    is_uint "$PL_SEQ" || PL_SEQ=0
    is_uint "$PL_COUNT" || PL_COUNT=0
    return 0
}

playlist_listed() { awk '!/^#/ && NF { print }' "$OUT/index.m3u8" 2>/dev/null; }

read_progress() {
    PROG_OUT_US=0; PROG_SIZE=0; PROG_END=0
    [ -r "$PROGRESS_FILE" ] || return 1
    local u=0 s=0 e=0
    read -r u s e < <(awk -F= '
        /^out_time_us=/ { u = $2 + 0 }
        /^total_size=/ { s = $2 + 0 }
        /^progress=end/ { e = 1 }
        END { printf "%d %d %d", u + 0, s + 0, e + 0 }
    ' "$PROGRESS_FILE" 2>/dev/null)
    PROG_OUT_US="${u:-0}"; PROG_SIZE="${s:-0}"; PROG_END="${e:-0}"
    return 0
}

current_seq() {
    playlist_info || { printf '%s' "$LAST_SEQ"; return 0; }
    local s
    if [ "$PL_COUNT" -le 0 ]; then
        s="$LAST_SEQ"
    else
        s=$(( PL_SEQ + PL_COUNT - 1 ))
    fi
    [ "$s" -lt "$SEQ_FLOOR" ] && s="$SEQ_FLOOR"
    [ "$s" -lt "$LAST_SEQ" ] && s="$LAST_SEQ"
    printf '%s' "$s"
}

# ── 12. ventana: poda y cota dura (agnóstica a la extensión, F5) ────────────
file_size() { stat -c %s -- "$1" 2>/dev/null || printf '0'; }

media_files() { # medios de la ventana: seg*.<ext> + init.<ext> (F5)
    local ext f
    shopt -s nullglob
    for ext in $MEDIA_EXTS; do
        for f in "$OUT"/seg*."$ext" "$OUT"/init."$ext"; do printf '%s\n' "$f"; done
    done
    shopt -u nullglob
}

window_bytes() {
    local f total=0
    while IFS= read -r f; do total=$(( total + $(file_size "$f") )); done < <(media_files | sort)
    printf '%s' "$total"
}

enforce_window_cap() { # 0 = dentro de cota · 1 = irrecuperable → rotar
    local total=0 f n sz orphans=0
    local -A listed=()
    local files=()
    while IFS= read -r n; do [ -n "$n" ] && listed["$n"]=1; done < <(playlist_listed)
    while IFS= read -r f; do files+=("$f"); done < <(media_files | sort)

    for f in "${files[@]}"; do total=$(( total + $(file_size "$f") )); done

    if [ "$total" -gt "$WINDOW_MAX_BYTES" ]; then
        for f in "${files[@]}"; do
            n="${f##*/}"
            [ -n "${listed[$n]:-}" ] && continue
            sz=$(file_size "$f")
            rm -f -- "$f"
            total=$(( total - sz ))
            [ "$total" -le "$WINDOW_MAX_BYTES" ] && break
        done
    fi

    for f in "${files[@]}"; do
        [ -e "$f" ] || continue
        n="${f##*/}"
        [ -n "${listed[$n]:-}" ] || orphans=$((orphans + 1))
    done
    if [ "$orphans" -gt 2 ]; then
        for f in "${files[@]}"; do
            [ -e "$f" ] || continue
            n="${f##*/}"
            [ -n "${listed[$n]:-}" ] && continue
            rm -f -- "$f"; orphans=$((orphans - 1))
            [ "$orphans" -le 2 ] && break
        done
    fi

    find "$OUT" -maxdepth 1 -name '*.tmp' -mmin +1 -delete 2>/dev/null || true

    [ "$total" -gt "$WINDOW_MAX_BYTES" ] && return 1
    return 0
}

fence_gen() {
    drop_ff_log
    [ "$KEEP_WINDOW" -eq 1 ] && { logw "--keep-window: no borro $OUT"; return 0; }
    [ -d "$OUT" ] || return 0
    local tomb="$OUT.fenced.$$"
    if mv -T -- "$OUT" "$tomb" 2>/dev/null; then
        rm -rf -- "$tomb"
        logi "gen ${GEN} fenced y borrada ($OUT)"
    else
        rm -rf -- "$OUT" 2>/dev/null || true
        logw "no pude renombrar $OUT; borrado directo"
    fi
}

clean_gen_contents() { # reinicio dentro de la MISMA gen, aún sin publicar
    local f
    while IFS= read -r f; do rm -f -- "$f"; done < <(media_files)
    rm -f -- "$OUT"/index.m3u8 "$OUT"/*.tmp 2>/dev/null || true
}

cleanup_old_gens() {
    local base="$WINDOW_ROOT/${OUT_SUBDIR:-$KEY}" d name
    [ -d "$base" ] || return 0
    shopt -s nullglob
    for d in "$base"/*; do
        [ -d "$d" ] || continue
        name="${d##*/}"
        case "$name" in
            *.fenced.*) rm -rf -- "$d"; logi "cleanup: $d"; continue ;;
        esac
        if is_uint "$name" && [ "$((10#$name))" -lt "$GEN" ]; then
            mv -T -- "$d" "$d.fenced.$$" 2>/dev/null || true
            rm -rf -- "$d.fenced.$$" 2>/dev/null || true
            rm -f -- "$STATE_DIR/$KEY-$name".* 2>/dev/null || true
            logi "cleanup: gen $name (< $GEN) borrada"
        fi
    done
    shopt -u nullglob
    find "$base" -maxdepth 2 -name '*.tmp' -mmin +10 -delete 2>/dev/null || true
}

fs_size_bytes() { df -Pk -- "$1" 2>/dev/null | awk 'NR==2 { print $2 * 1024 }'; }

janitor_remove() { # dir de sesión → borra SÓLO con el flock de la key TOMADO
    local d="$1" key tomb
    [ -d "$d" ] || return 1
    key="${d##*/}"
    valid_key "$key" || return 1
    # F2/t18: mantener flock -n durante TODO el borrado. Entre "mirar si hay
    # worker" y el rm -rf puede arrancar uno; si no se adquiere, no se borra.
    if ! lock_try_hold "$key"; then
        logw "janitor: $key tiene worker vivo (flock ocupado); no borro $d"
        return 1
    fi
    if [ -d "$d" ]; then
        tomb="$d.fenced.$$"
        if mv -T -- "$d" "$tomb" 2>/dev/null; then
            rm -rf -- "$tomb"
        else
            rm -rf -- "$d" 2>/dev/null || true
        fi
        rm -f -- "$STATE_DIR/$key"-* 2>/dev/null || true
        logi "janitor: sesión huérfana borrada $d (flock de la key tomado)"
    fi
    lock_release_hold
    return 0
}

janitor() { # [age_s] [budget_bytes] — F2: barrido por edad y presupuesto total
    local root="${WINDOW_ROOT%/}" age="${1:-$JANITOR_AGE}" budget="${2:-$JANITOR_BUDGET_BYTES}"
    [ -d "$root" ] || return 0
    local now; now=$(date +%s)
    is_uint "$age" || age=300
    local budget_eff="$budget"
    if ! is_uint "$budget_eff" || [ "$budget_eff" -le 0 ]; then
        local fs; fs=$(fs_size_bytes "$root")
        if is_uint "$fs" && [ "$fs" -gt 0 ]; then budget_eff=$(( fs * 80 / 100 )); else budget_eff=0; fi
    fi
    local d key newest cand="" ts dir removed=0
    shopt -s nullglob
    for d in "$root"/*; do
        [ -d "$d" ] || continue
        key="${d##*/}"
        valid_key "$key" || continue
        key_lock_held "$key" && continue
        newest=$(find "$d" -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1)
        is_uint "$newest" || newest=$(stat -c %Y -- "$d" 2>/dev/null || echo 0)
        is_uint "$newest" || newest=0
        cand+="$newest|$d"$'\n'
    done
    shopt -u nullglob
    local sorted; sorted=$(printf '%s' "$cand" | sort -n)
    while IFS='|' read -r ts dir; do
        [ -n "${dir:-}" ] || continue
        if [ $((now - ts)) -ge "$age" ]; then
            janitor_remove "$dir" && removed=$((removed + 1))
        fi
    done <<<"$sorted"
    local total; total=$(du -sb -- "$root" 2>/dev/null | awk '{print $1}')
    is_uint "$total" || total=0
    if [ "$budget_eff" -gt 0 ] && [ "$total" -gt "$budget_eff" ]; then
        while IFS='|' read -r ts dir; do
            [ -n "${dir:-}" ] || continue
            [ "$total" -le "$budget_eff" ] && break
            [ -d "$dir" ] || continue
            key_lock_held "${dir##*/}" && continue
            local sz; sz=$(du -sb -- "$dir" 2>/dev/null | awk '{print $1}')
            is_uint "$sz" || sz=0
            janitor_remove "$dir" && total=$(( total - sz ))
        done <<<"$sorted"
    fi
    [ "$removed" -gt 0 ] && logi "janitor: $removed sesión(es) huérfana(s) borradas (age=${age}s budget=${budget_eff})"
    return 0
}

cleanup_own_key() { # --cleanup --own-gen (F2): borra la key con el flock TOMADO
    local base="$WINDOW_ROOT/${OUT_SUBDIR:-$KEY}" tomb
    # F2/t18: el flock se mantiene durante el borrado; si un worker (re)arranca
    # en paralelo, o lo tenemos nosotros (no borra) o lo tiene él (no borra).
    if ! lock_try_hold "$KEY"; then
        logw "cleanup --own-gen: $KEY tiene un worker VIVO (flock no adquirible); no borro nada"
        return 0
    fi
    if [ -d "$base" ]; then
        tomb="$base.fenced.$$"
        if mv -T -- "$base" "$tomb" 2>/dev/null; then
            rm -rf -- "$tomb"
        else
            rm -rf -- "$base" 2>/dev/null || true
        fi
        rm -f -- "$STATE_DIR/$KEY"-* 2>/dev/null || true
        logi "cleanup --own-gen: generación(es) de $KEY borradas (flock tomado)"
    else
        logi "cleanup --own-gen: nada que borrar ($base)"
    fi
    lock_release_hold
    return 0
}

free_bytes() {
    local avail
    avail=$(df -Pk -- "$WINDOW_ROOT" 2>/dev/null | awk 'NR==2 { print $4 }')
    is_uint "$avail" || { printf '0'; return 0; }
    printf '%s' $(( avail * 1024 ))
}

# ── 13. ffmpeg: arranque, supervisión, rotación ─────────────────────────────
# F1 (t7): el stderr de ffmpeg puede incluir la URL completa (con user:pass o
# ?token=) en mensajes de error. Se REDACTUA antes de escribirlo y el fichero
# queda 0600; además se borra en clean_stop/on_exit/rotate/fence salvo
# --keep-logs. La traza de test (MF_TEST_TRACE) no se ve afectada.
redact_ffmpeg_stderr() {
    sed -u -E \
        -e 's#([A-Za-z][A-Za-z0-9+.-]*://[^/[:space:]"]+)[^[:space:]"]*#\1/<redacted>#g' \
        -e 's#([A-Za-z][A-Za-z0-9+.-]*://)[^/@[:space:]"]+@#\1***:***@#g' \
        -e 's#((user|username|pass|password|passwd|pwd|token|ticket|auth|sig|signature|expires|key)[[:space:]]*[=:][[:space:]]*)[^[:space:]&",;]+#\1***#Ig'
}

start_redactor() {
    rm -f -- "$FF_ERR_FIFO" "$FF_LOG" 2>/dev/null || true
    mkfifo -m 0600 -- "$FF_ERR_FIFO" 2>/dev/null || die 2 "no puedo crear FIFO de stderr ($FF_ERR_FIFO)"
    install -m 0600 /dev/null "$FF_LOG" 2>/dev/null || : >"$FF_LOG"
    chmod 0600 -- "$FF_LOG" 2>/dev/null || true
    # El redactor NO hereda los fds de lock (8/9): si el worker muere por
    # SIGKILL, el redactor puede sobrevivir al EOF del FIFO sin retener locks.
    ( exec 8>&- 9>&-; redact_ffmpeg_stderr <"$FF_ERR_FIFO" >"$FF_LOG" ) &
    FF_REDACT_PID=$!
}

stop_redactor() {
    if [ -n "${FF_REDACT_PID:-}" ] && kill -0 "$FF_REDACT_PID" 2>/dev/null; then
        kill -TERM "$FF_REDACT_PID" 2>/dev/null || true
        local i=0
        while kill -0 "$FF_REDACT_PID" 2>/dev/null && [ "$i" -lt 30 ]; do
            sleep 0.05; i=$((i + 1))
        done
        kill -KILL "$FF_REDACT_PID" 2>/dev/null || true
    fi
    [ -n "${FF_REDACT_PID:-}" ] && wait "$FF_REDACT_PID" 2>/dev/null || true
    FF_REDACT_PID=""
    rm -f -- "${FF_ERR_FIFO:-}" 2>/dev/null || true
}

drop_ff_log() {
    [ "${KEEP_LOGS:-0}" = "1" ] && return 0
    rm -f -- "${FF_LOG:-}" "${FF_ERR_FIFO:-}" 2>/dev/null || true
}

kill_ffmpeg() {
    [ -n "${FF_PID:-}" ] || { stop_redactor; return 0; }
    # Hijos primero (p.ej. helpers del protocolo): si el padre muere antes, los
    # hijos quedan huérfanos y podrían retener fds del worker (incluido el lock).
    if command -v pkill >/dev/null 2>&1; then
        pkill -TERM -P "$FF_PID" 2>/dev/null || true
    fi
    if kill -0 "$FF_PID" 2>/dev/null; then
        kill -TERM "$FF_PID" 2>/dev/null || true
        local i=0
        while kill -0 "$FF_PID" 2>/dev/null && [ "$i" -lt 50 ]; do
            sleep 0.1; i=$((i + 1))
        done
        if kill -0 "$FF_PID" 2>/dev/null; then
            command -v pkill >/dev/null 2>&1 && pkill -KILL -P "$FF_PID" 2>/dev/null || true
            kill -KILL "$FF_PID" 2>/dev/null || true
            logw "ffmpeg no terminó con TERM en 5 s → SIGKILL"
        fi
    fi
    wait "$FF_PID" 2>/dev/null || true
    FF_PID=""
    stop_redactor   # el log queda completo (EOF del FIFO) antes de clasificar
}

start_ffmpeg() {
    build_argv
    rm -f -- "$PROGRESS_FILE" 2>/dev/null || true
    logd "argv: $(argv_quoted)"
    logi "spawn ffmpeg gen=$GEN hls_time=$HLS_TIME list=$HLS_LIST_SIZE audio=$([ "$AUDIO_TRANSCODE" -eq 1 ] && echo aac || echo copy) upstream=$(url_host "$URL")"
    start_redactor
    ( cd "$OUT" && exec "${ARGV[@]}" ) >/dev/null 2>"$FF_ERR_FIFO" &
    FF_PID=$!
    FF_STARTED=$SECONDS
    FF_PROGRESS_LAST=0
    logi "ffmpeg pid=$FF_PID (stderr redactado → ${FF_LOG##*/}, 0600)"
}

classify_failure() { # motivo para RESTART
    local txt=""
    [ -r "$FF_LOG" ] && txt=$(tail -n 60 -- "$FF_LOG" 2>/dev/null)
    case "$txt" in
        *"not supported in container"*|*"Could not find tag for codec"*|*"codec not currently supported in container"*)
            printf 'mux'; return 0 ;;
    esac
    case "$txt" in
        *509*|*461*|*407*|*403*|*401*|*Unauthorized*|*Forbidden*|*ticket*)
            printf 'ticket'; return 0 ;;
    esac
    case "$txt" in
        *404*|*"Not Found"*|*gone*)
            printf 'upstream'; return 0 ;;
    esac
    case "$txt" in
        *"Server returned 5"*|*503*|*502*|*500*|*"timed out"*|*"Connection refused"*|*"Connection reset"*|\
        *"Network is unreachable"*|*"Immediate exit requested"*|*"End of file"*|*EOF*)
            printf 'upstream'; return 0 ;;
    esac
    printf 'exit'
}

monitor_ffmpeg() {
    local live=0 last_change=$SECONDS last_hb=$SECONDS last_reap=$SECONDS
    MON_REASON=""
    MON_RC=0
    while :; do
        if [ "$STOP" -eq 1 ]; then MON_REASON="stopping"; return 0; fi
        if [ "$MAX_RUNTIME" -gt 0 ] && [ $((SECONDS - SESSION_START)) -ge "$MAX_RUNTIME" ]; then
            MON_REASON="max_runtime"; return 0
        fi
        playlist_info || true
        # La verificación de audio va ANTES de comprobar la vida de ffmpeg: con
        # fuentes cortas o un EOF rápido, ffmpeg puede terminar antes de que el
        # bucle lo vea, y la decisión "sólo audio" debe tomarse igual (nunca se
        # publica `live` antes de esta comprobación).
        if [ "$AUDIO_CHECKED" -eq 0 ] && [ "${PL_COUNT:-0}" -gt 0 ]; then
            local adrc=0
            audio_decision_post || adrc=$?
            if [ "$adrc" -eq 4 ]; then MON_REASON="audio_incompatible"; return 0; fi
            if [ "$adrc" -eq 3 ]; then MON_REASON="mux"; return 0; fi
        fi

        if ! kill -0 "$FF_PID" 2>/dev/null; then
            wait "$FF_PID" 2>/dev/null; MON_RC=$?
            MON_REASON="exited"
            return 0
        fi

        read_progress || true
        if [ "${PROG_OUT_US:-0}" -gt "$FF_PROGRESS_LAST" ]; then
            FF_PROGRESS_LAST=$PROG_OUT_US
            last_change=$SECONDS
        fi

        if [ "$live" -eq 0 ] && [ "${PL_COUNT:-0}" -gt 0 ]; then
            live=1
            LAST_SEQ=$(current_seq)
            local prc=0 crc=0
            sup_publish live "$LAST_SEQ" || prc=$?
            if [ "$prc" -eq 2 ]; then MON_REASON="fenced"; return 0; fi
            coord_publish live "$LAST_SEQ" || crc=$?
            if [ "$crc" -eq 2 ]; then MON_REASON="fenced"; return 0; fi
            notify_status "live gen=$GEN seq=$LAST_SEQ"
            logi "LIVE gen=$GEN seq=$LAST_SEQ window=$(window_bytes) B"
        fi

        if [ "$live" -eq 1 ]; then
            if [ $((SECONDS - last_hb)) -ge "$HEARTBEAT_S" ]; then
                last_hb=$SECONDS
                notify_watchdog
                local hrc=0
                sup_heartbeat "$LAST_SEQ" || hrc=$?
                if [ "$hrc" -eq 2 ]; then MON_REASON="fenced"; return 0; fi
                if [ "$hrc" -eq 1 ] && [ $((SECONDS - SUP_LAST_OK)) -gt "$SUP_GRACE_S" ]; then
                    loge "supervisor sin respuesta > ${SUP_GRACE_S}s: dejo de escribir"
                    MON_REASON="sup_lost"; return 0
                fi
                LAST_SEQ=$(current_seq)
                coord_publish live "$LAST_SEQ" || true
            fi
        else
            notify_watchdog
            if [ $((SECONDS - FF_STARTED)) -gt "$STARTUP_TIMEOUT" ]; then
                MON_REASON="startup_timeout"; return 0
            fi
        fi

        if [ $((SECONDS - last_reap)) -ge 2 ]; then
            last_reap=$SECONDS
            if ! enforce_window_cap; then MON_REASON="window_overflow"; return 0; fi
        fi

        if [ $((SECONDS - last_change)) -gt "$STALL_TIMEOUT" ]; then
            MON_REASON="stall"; return 0
        fi
        sleep 1
    done
}

set_new_gen() {
    GEN="$1"
    [[ $GEN =~ ^[1-9][0-9]{0,9}$ ]] || die 21 "gen inválida del supervisor: '$GEN'"
    OUT_ARG="/mf/$OUT_SUBDIR/$GEN/"
    OUT="$WINDOW_ROOT/$OUT_SUBDIR/$GEN"
    PROGRESS_FILE="$STATE_DIR/$KEY-$GEN.progress"
    FF_LOG="$STATE_DIR/$KEY-$GEN.ffmpeg.log"
    FF_ERR_FIFO="$STATE_DIR/$KEY-$GEN.stderr.fifo"
    AUDIO_CHECKED=0
    LAST_SEQ=0
    SEQ_FLOOR=0
    CREATED_OUT=0
}

prepare_dirs() {
    # Sólo prepara (sin destruir): raíces, presupuesto de tmpfs, política de
    # reutilización de gen y el directorio de ESTA generación. La limpieza de
    # generaciones viejas se hace DESPUÉS de validar el gen (cleanup_old_gens).
    mkdir -p -- "$WINDOW_ROOT" 2>/dev/null || die 2 "no puedo crear $WINDOW_ROOT"
    mkdir -p -- "$STATE_DIR" 2>/dev/null || die 2 "no puedo crear $STATE_DIR"
    # F1: el estado (progress + stderr redactado) no es legible por otros usuarios
    chmod 0700 -- "$STATE_DIR" 2>/dev/null || true
    local free; free=$(free_bytes)
    if [ "$free" -lt "$MIN_FREE_BYTES" ]; then
        die 12 "tmpfs sin espacio: libres=$free < MIN_FREE_BYTES=$MIN_FREE_BYTES (no escribo)"
    fi
    if [ -d "$OUT" ] && [ -n "$(ls -A -- "$OUT" 2>/dev/null)" ]; then
        case "$GEN_REUSE" in
            refuse)
                die 21 "el directorio de gen $GEN ya tiene contenido: el supervisor debe bumpear gen (MF_GEN_REUSE=takeover para forzar)"
                ;;
            takeover)
                logw "gen $GEN con contenido: takeover (borro la ventana anterior)"
                fence_gen
                ;;
        esac
    fi
    [ -d "$OUT" ] || CREATED_OUT=1
    mkdir -p -- "$OUT" || die 2 "no puedo crear $OUT"
    chmod 0755 -- "$OUT" 2>/dev/null || true
    logi "ventana preparada: $OUT (max ${WINDOW_MAX_BYTES} B / ${HLS_LIST_SIZE} segs, libre $(free_bytes) B)"
}

prepare_fs() { # prepare_dirs + limpieza de generaciones viejas (tras validar gen)
    prepare_dirs
    cleanup_old_gens
}

clean_stop() { # reason
    logi "parada limpia: $1"
    coord_publish stopping "$LAST_SEQ" || true
    sup_publish stopping "$LAST_SEQ" || true
    notify_stopping
    rm -f -- "$PROGRESS_FILE" 2>/dev/null || true
    if [ "$CLEAN_ON_STOP" = "1" ] && [ "$KEEP_WINDOW" -eq 0 ]; then fence_gen; fi
    drop_ff_log
}

rotate() { # reason → no vuelve si falla
    local reason="$1" newgen="" rc=0
    fence_gen
    rm -f -- "$PROGRESS_FILE" 2>/dev/null || true
    CONSEC_FAIL=$((CONSEC_FAIL + 1))
    if [ "$CONSEC_FAIL" -gt "$RETRY_MAX" ]; then
        loge "rotaciones agotadas ($CONSEC_FAIL > $RETRY_MAX): FAILED"
        sup_fail "$reason"
        exit 10
    fi
    local delay=$(( RETRY_BASE << (CONSEC_FAIL - 1) ))
    [ "$delay" -gt 15 ] && delay=15
    logi "rotación #$CONSEC_FAIL (motivo=$reason): espera ${delay}s y pido gen nueva"
    coord_publish backoff "$LAST_SEQ" || true
    sleep "$delay"
    newgen=$(sup_restart "$reason") || rc=$?
    case "$rc" in
        0) set_new_gen "$newgen"; logi "gen nueva autorizada: $GEN (motivo=$reason)" ;;
        3) die 21 "supervisor: FENCED al rotar (gen=$GEN)" ;;
        4)
            sup_fail "$reason"
            die 75 "el supervisor no soporta RESTART: que respawnee con gen++ (exit 75)"
            ;;
        *) die 20 "supervisor inaccesible al rotar; no sigo escribiendo" ;;
    esac
    prepare_fs
    local prc=0
    sup_publish starting "$LAST_SEQ" || prc=$?
    [ "$prc" -eq 2 ] && die 21 "fenced al publicar starting"
}

run_session() {
    SESSION_START=$SECONDS
    CONSEC_FAIL=0
    while :; do
        start_ffmpeg
        monitor_ffmpeg
        case "$MON_REASON" in
            max_runtime) kill_ffmpeg; clean_stop "max_runtime"; exit 0 ;;
            stopping) kill_ffmpeg; clean_stop "sigterm"; exit 0 ;;
            fenced) kill_ffmpeg; fence_gen; die 21 "FENCED por el supervisor (gen=$GEN)" ;;
            sup_lost) kill_ffmpeg; fence_gen; die 20 "supervisor perdido (grace ${SUP_GRACE_S}s)" ;;
            window_overflow)
                kill_ffmpeg
                loge "ventana > ${WINDOW_MAX_BYTES} B sin poder podar: roto (anti-buffer-infinito)"
                rotate window_overflow
                ;;
            audio_incompatible)
                kill_ffmpeg
                clean_gen_contents
                logw "reintento en la MISMA gen $GEN con audio AAC (vídeo copy, sin publicar)"
                ;;
            startup_timeout)
                kill_ffmpeg
                loge "sin primer segmento en ${STARTUP_TIMEOUT}s: roto"
                rotate startup
                ;;
            stall)
                kill_ffmpeg
                logw "sin progreso ${STALL_TIMEOUT}s (ticket/upstream): roto con gen nueva"
                rotate stall
                ;;
            exited)
                local why
                why=$(classify_failure)
                if [ "${MON_RC:-0}" -eq 0 ]; then
                    if [ "$ON_EOF" = "stop" ]; then
                        clean_stop "eof"; exit 0
                    fi
                    logw "ffmpeg terminó con 0 (fin de fuente): roto"
                    rotate eof
                else
                    loge "ffmpeg terminó rc=${MON_RC} (motivo=$why): roto"
                    if [ "$why" = "mux" ] && [ "$AUDIO_RETRY_DONE" -eq 0 ] && [ "$AUDIO_TRANSCODE" -eq 0 ]; then
                        fence_gen; clean_gen_contents
                        AUDIO_TRANSCODE=1; AUDIO_RETRY_DONE=1; AUDIO_CHECKED=1
                        logw "error de muxer de audio: reintento en la MISMA gen con AAC (vídeo copy)"
                        continue
                    fi
                    rotate "$why"
                fi
                ;;
            *) kill_ffmpeg; rotate "${MON_REASON:-exit}" ;;
        esac
    done
}

# ── 14. trampas y arranque ──────────────────────────────────────────────────
on_signal() { STOP=1; logi "señal $1: parada ordenada"; }

on_exit() {
    local rc=$?
    trap - EXIT
    [ "$TRAP_DONE" -eq 1 ] && exit "$rc"
    TRAP_DONE=1
    kill_ffmpeg                # también cierra el redactor de stderr (F1)
    rm -f -- "${PROGRESS_FILE:-}" 2>/dev/null || true
    if [ "$rc" -ne 0 ] && [ "${PREPARED:-0}" -eq 1 ] && [ "${KEEP_WINDOW:-0}" -eq 0 ]; then
        # F2: una salida no limpia no puede dejar la generación en tmpfs.
        logw "salida no limpia (rc=$rc): fence de la generación $GEN"
        fence_gen
    fi
    drop_ff_log
    [ "$rc" -ne 0 ] && logi "salida rc=$rc"
    exit "$rc"
}

main() {
    parse_args "$@"

    if [ "$SELFTEST" -eq 1 ]; then run_selftest; exit $?; fi

    if [ "$PROBE_LOCK" -eq 1 ]; then
        resolve_key_only
        resolve_lock_dir
        LOCK_FILE="$LOCK_DIR/$KEY.lock"
        probe_lock
    fi

    if [ "$CLEANUP_ONLY" -eq 1 ]; then
        resolve_key_only
        if is_uint "${GEN:-}" && [ "$((10#$GEN))" -ge 1 ]; then
            GEN=$((10#$GEN))
        else
            GEN=0
            OUT_ARG=""          # sin gen no se valida --out contra el spec
        fi
        set_paths               # normaliza + resolve_lock_dir + state paths
        drop_ff_log             # F1: el stderr de ffmpeg no sobrevive al cleanup
        [ "$OWN_GEN" -eq 1 ] && cleanup_own_key
        [ "$GEN" -ge 1 ] && cleanup_old_gens
        # F2: barrido global de sesiones SIN worker (edad + presupuesto tmpfs)
        janitor "$JANITOR_AGE" "$JANITOR_BUDGET_BYTES"
        find "$WINDOW_ROOT/$KEY" -maxdepth 1 -name '*.fenced.*' -exec rm -rf {} + 2>/dev/null || true
        exit 0
    fi

    resolve_session
    validate_limits
    resolve_hls_time
    load_url
    set_paths

    if [ "$PRINT_ARGV" -eq 1 ]; then
        detect_sup_tool
        audio_decision_pre
        build_argv
        print_argv
        exit 0
    fi

    command -v "$FFMPEG_BIN" >/dev/null 2>&1 || die 2 "ffmpeg no encontrado: $FFMPEG_BIN"
    [ "$STALL_TIMEOUT" -le 25 ] || die 2 "stall > 25 s (ticket TTL 30-60 s)"
    detect_sup_tool

    trap on_exit EXIT
    trap 'on_signal TERM' TERM
    trap 'on_signal INT' INT
    trap 'on_signal HUP' HUP

    logi "ape-ingest $VERSION key=$KEY gen=$GEN out=$OUT window_root=$WINDOW_ROOT"
    logi "upstream host=$(url_host "$URL") (credenciales fuera de argv/logs)"

    # 1) un solo escritor por key: local, rápido, sin UDS ni ventana propia
    acquire_lock
    local live
    live=$(count_live_workers)
    if [ "$live" -gt "$MAX_SESSIONS" ]; then
        loge "MAX_SESSIONS local alcanzado ($live > $MAX_SESSIONS)"
        exit 13
    fi

    # 2) directorio de la ventana preparado (spec validado localmente)
    prepare_dirs
    PREPARED=1

    # 3) READY=1 TEMPRANO (fix B1/t12): ANTES de cualquier PUBLISH por UDS, para
    #    que `systemctl start` con Type=notify no se quede esperando al supervisor.
    notify_ready

    # 4) autoridad con reintentos acotados (≤4 s); stale → exit 21 sin dejar
    #    nada escrito; supervisor caído → exit 20 tras agotar intentos.
    require_gen_authorized

    # 5) con el gen ya validado: janitor de tmpfs (F2), gens viejas, floor de
    #    seq y política de audio.
    janitor "$JANITOR_AGE" "$JANITOR_BUDGET_BYTES"
    cleanup_old_gens
    coord_bootstrap
    audio_decision_pre
    run_session
}

# ═════════════════════════════════════════════════════════════════════════════
# 15. AUTOTEST OFFLINE (`--selftest [--selftest-remux]`)
#     Sin red, sin proveedor, sin nginx: todo en un tmpdir.
#     - Supervisor falso en python3 con la state machine real del protocolo.
#     - ffmpeg/ffprobe REALES para el remux; stub para los flujos de lifecycle.
#     Exit 0 SÓLO si todas las aserciones pasan.
# ═════════════════════════════════════════════════════════════════════════════
ST_PASS=0
ST_FAIL=0
ST_TMP=""
ST_URL="http://example.invalid/live/stream.m3u8"
FAKE_SUP_PID=""

st_ok() { # name rc [detail]
    if [ "${2:-1}" -eq 0 ]; then
        ST_PASS=$((ST_PASS + 1)); printf 'SELFTEST PASS %s\n' "$1"
    else
        ST_FAIL=$((ST_FAIL + 1)); printf 'SELFTEST FAIL %s :: %s\n' "$1" "${3:-}"
    fi
}
st_eq() { [ "${2:-}" = "${3:-}" ]; st_ok "$1" $? "esperado='${3:-}' obtenido='${2:-}'"; }
st_ne() { [ "${2:-}" != "${3:-}" ]; st_ok "$1" $? "no debía ser '${3:-}' (obtenido='${2:-}')"; }
st_has() { case "${1:-}" in *"${2:-}"*) return 0 ;; esac; return 1; }
st_hasnot() { case "${1:-}" in *"${2:-}"*) return 1 ;; esac; return 0; }

st_write_fake_sup() { # dir
    cat > "$1/fake_sup.py" <<'PY'
#!/usr/bin/env python3
"""Supervisor falso (t9): state machine del protocolo worker⇄supervisor."""
import os, socket, sys, threading, time
sock_path, mode, log_path, gen0 = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
state = {"gen": gen0, "busy_until": 0.0}
lock = threading.Lock()
if os.path.exists(sock_path):
    os.unlink(sock_path)
srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
srv.bind(sock_path)
srv.listen(64)
logf = open(log_path, "a", buffering=1)

def handle(conn):
    data = b""
    try:
        conn.settimeout(2.0)
        while b"\n" not in data:
            chunk = conn.recv(512)
            if not chunk:
                break
            data += chunk
    except Exception:
        pass
    line = data.decode("utf-8", "replace").strip()
    with lock:
        logf.write(line + "\n")
    # Modo "busy-once": el supervisor está OCUPADO 1,5 s desde la primera
    # petición (simula un arranque en curso). Ninguna conexión recibe respuesta
    # antes de ese instante → el worker debe reintentar y sobrevivir.
    if mode == "busy-once":
        with lock:
            if state["busy_until"] == 0.0:
                state["busy_until"] = time.time() + 1.5
            wait = state["busy_until"] - time.time()
        if wait > 0:
            time.sleep(wait)
    parts = line.split()
    op = parts[0] if parts else ""
    resp = "ERR code=bad_request"
    if mode == "stale":
        resp = "ERR code=stale_generation"
    elif op == "PING":
        resp = "PONG"
    elif op in ("PUBLISH", "HEARTBEAT", "RESTART", "FAIL"):
        try:
            g = int(parts[2])
        except Exception:
            g = -1
        with lock:
            cur = state["gen"]
            if op == "RESTART":
                if mode == "unsupported":
                    resp = "ERR code=unsupported"
                elif g != cur:
                    resp = "ERR code=stale_generation"
                else:
                    state["gen"] = cur + 1
                    resp = "OK gen=%d state=starting" % state["gen"]
            elif op == "FAIL":
                resp = "OK gen=%d" % cur
            elif g == cur:
                resp = "OK gen=%d state=live seq=1" % cur
            elif g < cur:
                resp = "ERR code=stale_generation"
            else:
                resp = "ERR code=unknown_gen"
    try:
        conn.sendall((resp + "\n").encode())
    except Exception:
        pass
    try:
        conn.close()
    except Exception:
        pass

while True:
    try:
        c, _ = srv.accept()
    except Exception:
        break
    threading.Thread(target=handle, args=(c,), daemon=True).start()
PY
    chmod 0755 "$1/fake_sup.py"
}

st_write_stub_ffmpeg() { # path
    cat > "$1" <<'STUB'
#!/usr/bin/env bash
set -u
# Un ffmpeg real no hace fork: el doble de test NO debe heredar los fds de lock
# (8=URL, 9=key) ni dejarlos abiertos en sus hijos (sleep/truncate). Si los
# heredara, el flock seguiría "tomado" tras morir el worker y el cleanup se
# negaría a borrar → T26i flaky (1/3 medido por el capitán).
exec 8>&- 9>&-
echo "ARGV: $*" >> "${STUB_LOG:?}"
n=0
[ -f "${STUB_COUNT:?}" ] && n=$(cat "$STUB_COUNT")
n=$((n + 1))
echo "$n" > "$STUB_COUNT"
mode=$(cat "${STUB_MODE:?}" 2>/dev/null || echo ok)
if [ "$mode" = "fail-once" ] && [ "$n" -eq 1 ]; then
    echo "[hls @ 0x1] Error opening input: Server returned 503 Service Unavailable" >&2
    exit 1
fi
if [ "$mode" = "never" ]; then
    sleep 300
    exit 0
fi
if [ "$mode" = "leak-url" ]; then
    # F1/t7: simula el stderr de ffmpeg con la URL completa (user:pass + token)
    # y claves sueltas. El worker DEBE redactarlo antes de persistirlo.
    echo "[http @ 0x1] Opening 'http://mfuser:SUPERSECRET123@example.invalid/live/7.m3u8?token=SECRETTOKEN456'" >&2
    echo "[http @ 0x1] user=mfuser password=SUPERSECRET123" >&2
    echo "[hls @ 0x2] http://another:SUPERSECRET123@cdn.invalid/seg.ts?hdnts=SECRETTOKEN456" >&2
fi
if [ "$mode" = "stall-once" ] && [ "$n" -eq 1 ]; then
    # un segmento y silencio: el worker debe detectar stall y rotar generación
    truncate -s 1048576 "seg00000.ts"
    {
        echo '#EXTM3U'
        echo '#EXT-X-VERSION:6'
        echo '#EXT-X-TARGETDURATION:6'
        echo '#EXT-X-MEDIA-SEQUENCE:0'
        echo '#EXTINF:6.000000,'
        echo 'seg00000.ts'
    } > index.m3u8
    sleep 120
    exit 0
fi
i=0
while :; do
    truncate -s 1048576 "seg$(printf '%05d' "$i").ts"
    lo=0
    [ "$i" -ge 8 ] && lo=$((i - 7))
    {
        echo '#EXTM3U'
        echo '#EXT-X-VERSION:6'
        echo '#EXT-X-TARGETDURATION:6'
        echo "#EXT-X-MEDIA-SEQUENCE:$lo"
        echo '#EXT-X-INDEPENDENT-SEGMENTS'
        j=$lo
        while [ "$j" -le "$i" ]; do
            echo '#EXTINF:6.000000,'
            echo "seg$(printf '%05d' "$j").ts"
            j=$((j + 1))
        done
    } > index.m3u8
    i=$((i + 1))
    sleep 1
done
STUB
    chmod 0755 "$1"
}

st_start_fake_sup() { # sock log mode gen
    python3 "$ST_TMP/fake_sup.py" "$1" "$3" "$2" "$4" &
    FAKE_SUP_PID=$!
    local i=0
    while [ ! -S "$1" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
    [ -S "$1" ]
}

st_stop_fake_sup() {
    [ -n "${FAKE_SUP_PID:-}" ] || return 0
    kill -TERM "$FAKE_SUP_PID" 2>/dev/null || true
    wait "$FAKE_SUP_PID" 2>/dev/null || true
    FAKE_SUP_PID=""
}

st_run_worker() { # args... ; deja ST_WRC/ST_WOUT/ST_WERR
    local out="$ST_TMP/worker.out" err="$ST_TMP/worker.err"
    ST_WRC=0
    env MF_UPSTREAM_URL="${ST_ENV_URL:-$ST_URL}" \
        bash "$SELF" "$@" >"$out" 2>"$err" || ST_WRC=$?
    ST_WOUT=$(cat "$out" 2>/dev/null)
    ST_WERR=$(cat "$err" 2>/dev/null)
}

st_stub_env() { # prefix for the stub state files
    STUB_LOG="$ST_TMP/stub.log"; STUB_COUNT="$ST_TMP/stub.count"; STUB_MODE="$ST_TMP/stub.mode"
    export STUB_LOG STUB_COUNT STUB_MODE
}

st_wait_lock_free() { # key window_root → espera acotada a que no queden escritores
    local i=0
    while [ "$i" -lt 40 ]; do
        if bash "$SELF" --probe-lock --key "$1" --window-root "$2" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.1; i=$((i + 1))
    done
    return 1
}

run_selftest() {
    local start_ts=$SECONDS
    ST_TMP="${TMPDIR_OVERRIDE:-$(mktemp -d "${TMPDIR:-/tmp}/ape-ingest-selftest.XXXXXX")}"
    mkdir -p "$ST_TMP"
    printf 'SELFTEST tmp=%s\n' "$ST_TMP"
    export MF_UPSTREAM_URL="$ST_URL"
    # F4/t7: el lock canónico es /run/mediafanout/locks; los tests lo aíslan
    # con el override explícito (en producción cualquier otro path se rechaza).
    export MF_TEST_ALLOW_LOCK_DIR=1
    export MF_LOCK_DIR="$ST_TMP/locks"
    mkdir -p -- "$MF_LOCK_DIR"
    local key="7ac3cdf648ac4474"
    local root="$ST_TMP/win"

    # ── T01 key/charset ─────────────────────────────────────────────────────
    valid_key "$key"; st_ok "T01a key 16hex válida" $?
    valid_key "7AC3CDF648AC4474"; st_ne "T01b key mayúsculas rechazada" $? 0
    valid_key "7ac3cdf648ac447"; st_ne "T01c key 15 hex rechazada" $? 0
    valid_key "zzzzcdf648ac4474"; st_ne "T01d key no-hex rechazada" $? 0
    ( KEY=""; INSTANCE=""; PROVIDER=""; CHANNEL=""; resolve_key_only ) >/dev/null 2>&1
    st_eq "T01e sin key → error de uso (2)" "$?" "2"

    # ── T02 gen ─────────────────────────────────────────────────────────────
    is_uint "7"; st_ok "T02a gen entero" $?
    is_uint "-1"; st_ne "T02b gen negativo rechazado" $? 0
    is_uint "1;rm"; st_ne "T02c gen con metacaracteres rechazado" $? 0

    # ── T03 rutas de salida ─────────────────────────────────────────────────
    mkdir -p "$root"
    WINDOW_ROOT="$root"; KEY="$key"; GEN=7
    OUT_ARG="/mf/$key/7/"; normalize_out; st_eq "T03a /mf/<key>/<gen>/ normaliza" "$OUT" "$root/$key/7"
    OUT_ARG="$root/$key/7"; normalize_out; st_eq "T03b ruta absoluta bajo root" "$OUT" "$root/$key/7"
    OUT_ARG="$key/7"; normalize_out; st_eq "T03c ruta relativa bajo root" "$OUT" "$root/$key/7"
    OUT_ARG="/mf/$key/4k/7/"; normalize_out; st_eq "T03d variante 4k" "$OUT" "$root/$key/4k/7"
    ( OUT_ARG="/etc/passwd"; normalize_out ) >/dev/null 2>&1; st_ne "T03e fuera del root rechazado" $? 0
    ( OUT_ARG="/mf/$key/7/../8"; normalize_out ) >/dev/null 2>&1; st_ne "T03f traversal rechazado" $? 0
    ( OUT_ARG="/mf/0000000000000000/7/"; normalize_out ) >/dev/null 2>&1; st_ne "T03g key ajena rechazada" $? 0
    local saved_root="$WINDOW_ROOT"
    OUT_ARG="/dev/shm/mf/$key/7/"; WINDOW_ROOT="/tmp/otro-root"; normalize_out
    st_eq "T03h ruta de ficheros del supervisor (t9)" "$OUT" "/dev/shm/mf/$key/7"
    st_eq "T03h2 raíz derivada de la ruta" "$WINDOW_ROOT" "/dev/shm/mf"
    OUT_ARG="/run/mediafanout/$key/4k/7/"; WINDOW_ROOT="/tmp/otro-root"; normalize_out
    st_eq "T03h3 raíz alternativa (mount de I1)" "$OUT" "/run/mediafanout/$key/4k/7"
    WINDOW_ROOT="$saved_root"

    # ── T04 límites ─────────────────────────────────────────────────────────
    ( STALL_TIMEOUT=30; validate_limits ) >/dev/null 2>&1; st_ne "T04a stall 30 s rechazado" $? 0
    ( STALL_TIMEOUT=20; validate_limits ) >/dev/null 2>&1; st_ok "T04b stall 20 s aceptado" $?
    ( UA=""; validate_limits ) >/dev/null 2>&1; st_ne "T04c UA vacío rechazado" $? 0
    ( HLS_LIST_SIZE=99; validate_limits >/dev/null 2>&1; [ "$HLS_LIST_SIZE" = "12" ] ); st_ok "T04d list size clampeado a 12" $?

    # ── T05 key == Lua (5 vectores del módulo real) ─────────────────────────
    st_eq "T05a key line.tivi-ott.net|894968" "$(_mf_key_of line.tivi-ott.net 894968)" "7ac3cdf648ac4474"
    st_eq "T05b key line.tivi-ott.net|47" "$(_mf_key_of line.tivi-ott.net 47)" "4480f0ee7d98478e"
    st_eq "T05c key example.com|5" "$(_mf_key_of example.com 5)" "1dee76c918367533"
    st_eq "T05d host:80 + query" "$(_mf_key_of 'Line.Tivi-OTT.net:80' '007?x=1')" "0dfa3a8e2e0957d2"
    st_eq "T05e URL/path + .m3u8" "$(_mf_key_of 'http://host.example/path/' 'stream.m3u8')" "2f95766a4c28201d"

    # ── T06/T07 argv remux + audio ──────────────────────────────────────────
    WINDOW_ROOT="$root"; OUT_ARG="/mf/$key/7/"
    URL="http://example.invalid/user/s3cr3t/7.m3u8"; URL_FILE=""
    HLS_TIME_CFG="auto"; SRC_SEG_DUR="6"; resolve_hls_time
    AUDIO_POLICY=auto; SRC_AUDIO_CODEC=aac; AUDIO_TRANSCODE=0; AUDIO_CHECKED=0
    audio_decision_pre; set_paths; build_argv
    local q; q=$(printf '%q ' "${ARGV[@]}")
    st_has "$q" "-c copy"; st_ok "T06a argv '-c copy' (remux puro)" $? "$q"
    st_has "$q" "-hls_list_size 8"; st_ok "T06b ventana 8 entradas" $?
    st_has "$q" "-hls_time 6"; st_ok "T06c hls_time alineado al origen" $?
    st_has "$q" "delete_segments"; st_ok "T06d delete_segments" $?
    st_has "$q" "append_list"; st_ok "T06e append_list" $?
    st_has "$q" "omit_endlist"; st_ok "T06f omit_endlist" $?
    st_has "$q" "temp_file"; st_ok "T06g temp_file (playlist/segmento atómicos)" $?
    st_has "$q" "-user_agent"; st_ok "T06h -user_agent presente" $?
    st_has "$q" "seg%05d.ts"; st_ok "T06i segmentos relativos seg%05d.ts" $?
    st_has "$q" " index.m3u8"; st_ok "T06j playlist relativa index.m3u8" $?
    st_has "$q" "-progress"; st_ok "T06k -progress a fichero" $?
    st_hasnot "$q" "libx264"; st_ok "T06l sin libx264" $?
    st_hasnot "$q" "libx265"; st_ok "T06m sin libx265" $?
    st_hasnot "$q" "vaapi"; st_ok "T06n sin vaapi" $?
    st_hasnot "$q" "nvenc"; st_ok "T06o sin nvenc" $?
    st_hasnot "$q" "qsv"; st_ok "T06p sin qsv" $?
    st_has "$q" "-hls_delete_threshold 1"; st_ok "T06q cota de ficheros sin listar" $?
    SRC_AUDIO_CODEC=opus; AUDIO_TRANSCODE=0; audio_decision_pre
    st_eq "T07a opus → transcode SOLO audio" "$AUDIO_TRANSCODE" "1"
    build_argv; q=$(printf '%q ' "${ARGV[@]}")
    st_has "$q" "-c:a aac"; st_ok "T07b audio → -c:a aac" $?
    st_has "$q" "-c:v copy"; st_ok "T07c audio → -c:v copy (vídeo intacto)" $?
    st_hasnot "$q" "-c copy"; st_ok "T07d audio → sin '-c copy' global" $?
    SRC_AUDIO_CODEC=ac3; AUDIO_TRANSCODE=0; audio_decision_pre
    st_eq "T07e ac3 → copy" "$AUDIO_TRANSCODE" "0"

    # ── T08 lock single-writer ──────────────────────────────────────────────
    LOCK_DIR="$ST_TMP/locks"; LOCK_FILE="$LOCK_DIR/$key.lock"; mkdir -p "$LOCK_DIR"
    ( exec 9>>"$LOCK_FILE"; flock -n 9; sleep 2 ) &
    local holder=$!
    sleep 0.3
    st_run_worker --probe-lock --key "$key" --window-root "$root" --lock-dir "$LOCK_DIR"
    st_eq "T08a lock ocupado → exit 3" "$ST_WRC" "3"
    wait "$holder" 2>/dev/null || true
    sleep 0.2
    st_run_worker --probe-lock --key "$key" --window-root "$root" --lock-dir "$LOCK_DIR"
    st_eq "T08b lock libre → exit 0" "$ST_WRC" "0"

    # ── T09/T10 ventana acotada ─────────────────────────────────────────────
    local wdir="$root/$key/9" i
    mkdir -p "$wdir"
    for i in 0 1 2 3 4 5 6 7 8 9 10 11; do truncate -s 8388608 "$wdir/seg$(printf '%05d' "$i").ts"; done
    { echo '#EXTM3U'; echo '#EXT-X-TARGETDURATION:6'; echo '#EXT-X-MEDIA-SEQUENCE:4'
      for i in 4 5 6 7 8 9 10 11; do echo '#EXTINF:6.0,'; echo "seg$(printf '%05d' "$i").ts"; done; } > "$wdir/index.m3u8"
    OUT="$wdir"; WINDOW_MAX_BYTES=83886080
    enforce_window_cap; local erc=$?
    local after; after=$(window_bytes)
    st_eq "T09a poda de huérfanos" "$erc" "0"
    [ "$after" -le 83886080 ]; st_ok "T09b bytes tras poda ($after ≤ 83886080)" $?
    { [ -f "$wdir/seg00011.ts" ] && [ -f "$wdir/seg00004.ts" ]; }; st_ok "T09c segmentos listados intactos" $?
    [ ! -f "$wdir/seg00000.ts" ]; st_ok "T09d huérfanos viejos borrados" $?
    local w2="$root/$key/10"; mkdir -p "$w2"
    for i in 0 1 2 3 4 5 6 7 8 9; do truncate -s 9437184 "$w2/seg$(printf '%05d' "$i").ts"; done
    { echo '#EXTM3U'; echo '#EXT-X-TARGETDURATION:6'; echo '#EXT-X-MEDIA-SEQUENCE:0'
      for i in 0 1 2 3 4 5 6 7 8 9; do echo '#EXTINF:6.0,'; echo "seg$(printf '%05d' "$i").ts"; done; } > "$w2/index.m3u8"
    OUT="$w2"
    enforce_window_cap; st_eq "T10 ventana irrecuperable (>80 MiB) → rotar" "$?" "1"

    # ── T11 fencing: gen stale ⇒ no escribe nada ────────────────────────────
    st_write_fake_sup "$ST_TMP"; st_write_stub_ffmpeg "$ST_TMP/stub-ffmpeg"
    st_stub_env; : > "$STUB_LOG"; : > "$STUB_COUNT"; echo ok > "$STUB_MODE"
    local sock="$ST_TMP/stale.sock" slog="$ST_TMP/stale.log"
    : > "$slog"; st_start_fake_sup "$sock" "$slog" stale 7
    local wstale="$ST_TMP/win-stale"
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wstale" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 2
    st_eq "T11a gen stale → exit 21" "$ST_WRC" "21"
    [ ! -e "$wstale/$key/7" ]; st_ok "T11b no se creó NADA (fencing real)" $?
    [ ! -s "$STUB_LOG" ]; st_ok "T11c no se lanzó ffmpeg" $?
    st_stop_fake_sup

    # ── T12 lifecycle: publish live + heartbeats + parada limpia ────────────
    sock="$ST_TMP/ok.sock"; slog="$ST_TMP/ok.log"; : > "$slog"
    st_start_fake_sup "$sock" "$slog" ok 7
    local wok="$ST_TMP/win-ok"
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo ok > "$STUB_MODE"
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wok" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --heartbeat 2 --max-runtime 6
    st_eq "T12a parada limpia exit 0" "$ST_WRC" "0"
    grep -q 'PUBLISH .* state=live' "$slog"; st_ok "T12b PUBLISH state=live enviado" $?
    [ "$(grep -c '^HEARTBEAT' "$slog")" -ge 2 ]; st_ok "T12c ≥2 HEARTBEATs" $? "$(grep -c '^HEARTBEAT' "$slog")"
    grep -q 'state=stopping' "$slog"; st_ok "T12d aviso de parada (stopping)" $?
    st_has "$ST_WERR" "LIVE gen=7 seq="; st_ok "T12e log LIVE con seq" $? "$ST_WERR"
    [ ! -e "$wok/$key/7" ]; st_ok "T12f ventana limpiada al parar (tmpfs acotado)" $?
    st_wait_lock_free "$key" "$wok"; st_ok "T12f2 lock liberado tras la parada" $?
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo ok > "$STUB_MODE"
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wok" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --heartbeat 2 --max-runtime 4 \
        --clean-on-stop 0 --gen-reuse takeover
    st_eq "T12g segunda vida en la MISMA gen (takeover) exit 0" "$ST_WRC" "0"
    [ -f "$wok/$key/7/index.m3u8" ]; st_ok "T12h --clean-on-stop 0 conserva la ventana" $? "$ST_WERR"
    st_ok "T12i argv del stub con -c copy" "$(grep -m1 'ARGV:' "$STUB_LOG" | grep -q -- '-c copy' && echo 0 || echo 1)"
    st_ok "T12j argv del stub con las 3 flags del contrato" \
        "$(grep -m1 'ARGV:' "$STUB_LOG" | grep -q 'delete_segments+append_list+omit_endlist' && echo 0 || echo 1)"
    st_stop_fake_sup

    # ── T13 2º arranque para el mismo canal se NIEGA (exit≠0) ──────────────
    sock="$ST_TMP/dup.sock"; slog="$ST_TMP/dup.log"; : > "$slog"
    st_start_fake_sup "$sock" "$slog" ok 7
    local wdup="$ST_TMP/win-dup"
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo ok > "$STUB_MODE"
    bash "$SELF" --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wdup" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 8 \
        >"$ST_TMP/first.out" 2>"$ST_TMP/first.err" &
    local first=$!
    local i2=0
    while [ "$i2" -lt 50 ] && ! grep -q 'state=live' "$slog" 2>/dev/null; do sleep 0.2; i2=$((i2 + 1)); done
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wdup" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 2
    st_eq "T13a 2º arranque rechazado (exit 3)" "$ST_WRC" "3"
    st_eq "T13b un solo ffmpeg para la key" "$(grep -c 'ARGV:' "$STUB_LOG")" "1"
    wait "$first" 2>/dev/null || true
    st_stop_fake_sup

    # ── T14 rotación: fallo upstream ⇒ RESTART gen++ + fencing de la vieja ──
    sock="$ST_TMP/rot.sock"; slog="$ST_TMP/rot.log"; : > "$slog"
    st_start_fake_sup "$sock" "$slog" ok 7
    local wrot="$ST_TMP/win-rot"
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo fail-once > "$STUB_MODE"
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wrot" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --heartbeat 2 --max-runtime 10 \
        --clean-on-stop 0
    st_eq "T14a rotación y parada limpia exit 0" "$ST_WRC" "0"
    grep -q '^RESTART' "$slog"; st_ok "T14b RESTART enviado" $? "$(grep '^RESTART' "$slog" | head -1)"
    [ ! -d "$wrot/$key/7" ]; st_ok "T14c gen vieja 7 borrada (fenced)" $?
    [ -f "$wrot/$key/8/index.m3u8" ]; st_ok "T14d gen nueva 8 con ventana" $?
    grep -q '^PUBLISH .* 8 state=live' "$slog"; st_ok "T14e PUBLISH live con gen 8" $? "$(grep '^PUBLISH' "$slog" | tail -1)"
    st_stop_fake_sup

    # ── T15 supervisor sin RESTART ⇒ FAIL + exit 75 ─────────────────────────
    sock="$ST_TMP/nr.sock"; slog="$ST_TMP/nr.log"; : > "$slog"
    st_start_fake_sup "$sock" "$slog" unsupported 7
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo fail-once > "$STUB_MODE"
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$ST_TMP/win-nr" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 8
    st_eq "T15a sin RESTART → exit 75" "$ST_WRC" "75"
    grep -q '^FAIL' "$slog"; st_ok "T15b FAIL enviado al supervisor" $?
    st_stop_fake_sup

    # ── T16 arranque sin primer segmento ⇒ timeout y limpieza ──────────────
    sock="$ST_TMP/sto.sock"; slog="$ST_TMP/sto.log"; : > "$slog"
    st_start_fake_sup "$sock" "$slog" ok 7
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo never > "$STUB_MODE"
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$ST_TMP/win-sto" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --startup-timeout 2 \
        --max-runtime 8 --retry-max 0
    st_eq "T16a timeout de arranque → exit 10" "$ST_WRC" "10"
    [ ! -d "$ST_TMP/win-sto/$key/7" ]; st_ok "T16b ventana limpiada tras fallo" $?
    st_stop_fake_sup

    # ── T17 sin espacio ⇒ no escribe ────────────────────────────────────────
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$ST_TMP/win-nospace" \
        --no-supervisor --ffmpeg "$ST_TMP/stub-ffmpeg" \
        --min-free-bytes 1125899906842624 --max-runtime 2
    st_eq "T17a tmpfs insuficiente → exit 12" "$ST_WRC" "12"
    [ ! -e "$ST_TMP/win-nospace/$key/7" ]; st_ok "T17b no se creó la ventana" $?

    # ── T21 stall: ffmpeg vivo pero sin progreso ⇒ rotación con gen nueva ──
    sock="$ST_TMP/stall.sock"; slog="$ST_TMP/stall.log"; : > "$slog"
    st_start_fake_sup "$sock" "$slog" ok 7
    local wstall="$ST_TMP/win-stall"
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo stall-once > "$STUB_MODE"
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wstall" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --heartbeat 2 --stall-timeout 10 \
        --retry-max 1 --max-runtime 16 --clean-on-stop 0
    st_eq "T21a stall → rotación y parada limpia" "$ST_WRC" "0"
    grep -q '^RESTART .* reason=stall' "$slog"; st_ok "T21b RESTART reason=stall" $? "$(grep '^RESTART' "$slog" | head -1)"
    [ -f "$wstall/$key/8/index.m3u8" ]; st_ok "T21c gen nueva 8 sirviendo" $?
    st_has "$ST_WERR" "sin progreso 10s"; st_ok "T21d stall detectado a los 10 s (≤25 s)" $?
    st_stop_fake_sup

    # ── T22 unit systemd (si está junto al script) ─────────────────────────
    local unit; unit="$(dirname "$SELF")/ape-ingest@.service"
    if [ -r "$unit" ]; then
        grep -q 'MemoryMax=180M' "$unit"; st_ok "T22a MemoryMax=180M" $?
        grep -qE '^[[:space:]]*WatchdogSec=15' "$unit"; st_ok "T22b WatchdogSec=15 (medido funcional)" $?
        grep -qE '^[[:space:]]*Type=notify' "$unit"; st_ok "T22c Type=notify" $?
        grep -qE '^[[:space:]]*NotifyAccess=all' "$unit"; st_ok "T22d NotifyAccess=all (sd_notify vía helper)" $?
        grep -qE '^[[:space:]]*Restart=on-failure' "$unit"; st_ok "T22e Restart=on-failure (gate I2)" $?
        grep -q 'RestartPreventExitStatus=.* 21 ' "$unit" && grep -q 'SIGKILL' "$unit" \
            && grep -q 'RestartPreventExitStatus=.* 3 ' "$unit"
        st_ok "T22f prevent-status cubre 3/21/senales (systemd no reejecuta)" $?
        grep -q 'RestartPreventExitStatus=1 2 3 4 ' "$unit" && grep -q ' 126 127' "$unit"
        st_ok "T22f2 F3: códigos 1/126/127 cubiertos" $?
        # t18: comparar el conjunto COMPLETO (códigos + señales), no muestras
        local want_set got_set
        want_set=$(printf '%s\n' 1 2 3 4 10 12 13 14 20 21 75 126 127 \
            SIGTERM SIGINT SIGQUIT SIGILL SIGTRAP SIGABRT SIGBUS SIGFPE SIGKILL \
            SIGUSR1 SIGSEGV SIGUSR2 SIGPIPE SIGALRM SIGHUP SIGIO SIGPWR SIGSTKFLT \
            SIGXCPU SIGXFSZ SIGVTALRM SIGPROF SIGSYS | sort | tr '\n' ' ')
        got_set=$(sed -n 's/^[[:space:]]*RestartPreventExitStatus=//p' "$unit" \
            | tr ' ' '\n' | sed '/^$/d' | sort | tr '\n' ' ')
        st_eq "T22f3 F3: conjunto COMPLETO códigos+señales" "$got_set" "$want_set"
        grep -q 'StartLimitBurst=5' "$unit"; st_ok "T22f4 última red StartLimitBurst=5" $?
        grep -q 'MF_WINDOW_ROOT=/dev/shm/mf' "$unit"; st_ok "T22g ventana en /dev/shm/mf (t9)" $?
        grep -q 'ReadWritePaths=.*/dev/shm/mf' "$unit"; st_ok "T22h /dev/shm/mf escribible" $?
        grep -qE '^[[:space:]]*KillMode=mixed' "$unit"; st_ok "T22i KillMode=mixed (mata ffmpeg al parar)" $?
        grep -qE '^[[:space:]]*MemoryDenyWriteExecute=' "$unit"; st_ne "T22j sin MemoryDenyWriteExecute (compat ffmpeg)" $? 0
        grep -q 'ExecStopPost=.*--cleanup' "$unit"; st_ok "T22k limpieza de generaciones al parar" $?
        grep -q 'ExecStopPost=.*--own-gen' "$unit"; st_ok "T22l F2: --own-gen en ExecStopPost" $?
    else
        printf 'SELFTEST SKIP T22 unit no encontrado junto al script\n'
    fi

    # ── T23 REGRESIÓN B1/t12: supervisor OCUPADO 1,5 s al arrancar ──────────
    # El primer PUBLISH starting expiraba a 0,4 s y el worker moría con rc=20.
    # Ahora reintenta (0,2/0,4/0,8/1,6 s, ≤4 s), sobrevive y llega a live.
    sock="$ST_TMP/busy.sock"; slog="$ST_TMP/busy.log"; local trace="$ST_TMP/busy.trace"
    : > "$slog"; : > "$trace"
    st_start_fake_sup "$sock" "$slog" busy-once 7
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo ok > "$STUB_MODE"
    local wbusy="$ST_TMP/win-busy" tb=$SECONDS
    MF_TEST_TRACE="$trace" st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wbusy" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --heartbeat 2 --max-runtime 6 --clean-on-stop 0
    local dtb=$((SECONDS - tb))
    st_eq "T23a supervisor ocupado 1,5 s → el worker sobrevive (exit 0)" "$ST_WRC" "0"
    st_hasnot "$ST_WERR" "supervisor inaccesible"; st_ok "T23b sin 'supervisor inaccesible'" $? "$ST_WERR"
    grep -q 'PUBLISH .* state=live' "$slog"; st_ok "T23c llegó a live" $? "$(grep '^PUBLISH' "$slog" | head -3)"
    [ "$dtb" -le 12 ]; st_ok "T23d no se bloquea esperando al supervisor (${dtb}s)" $?
    local first_ev; first_ev=$(head -n1 "$trace" 2>/dev/null)
    case "$first_ev" in
        *"notify --ready"*) st_ok "T23e READY=1 es el PRIMER evento (antes de cualquier UDS)" 0 ;;
        *) st_ok "T23e READY=1 es el PRIMER evento (antes de cualquier UDS)" 1 "primero='$first_ev'" ;;
    esac
    local order; order=$(awk '/notify .*ready/{r=NR} /^[0-9]+ sup PUBLISH/{p=NR} END{ if (r>0 && p>0 && r<p) print "ok"; else print "bad r="r" p="p }' "$trace" 2>/dev/null)
    st_eq "T23f traza: READY antes del primer PUBLISH" "$order" "ok"
    st_has "$ST_WERR" "sin respuesta del supervisor"; st_ok "T23g se registraron los reintentos" $? "$(grep -m1 'sin respuesta' "$ST_WERR")"
    st_stop_fake_sup

    # ── T24 REGRESIÓN B1/t12: supervisor que NO responde nunca ─────────────
    # No se muere al primer timeout: agota reintentos (~3 s de backoff) y sale 20.
    local wnosup="$ST_TMP/win-nosup" t1=$SECONDS
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wnosup" \
        --sup-sock "$ST_TMP/no-existe.sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 2
    local dt1=$((SECONDS - t1))
    st_eq "T24a supervisor inexistente → rc=20 tras reintentos" "$ST_WRC" "20"
    { [ "$dt1" -ge 2 ] && [ "$dt1" -le 9 ]; }; st_ok "T24b reintentó antes de rendirse (${dt1}s ≥2 s)" $? "$dt1"
    [ ! -e "$wnosup/$key/7" ]; st_ok "T24c sin dejar directorio de generación" $?

    # ── T25 F1/t7: stderr de ffmpeg REDACTADO, 0600 y borrado al parar ─────
    sock="$ST_TMP/leak.sock"; slog="$ST_TMP/leak.log"; : > "$slog"
    st_start_fake_sup "$sock" "$slog" ok 7
    local wleak="$ST_TMP/win-leak" secret="SUPERSECRET123" tok="SECRETTOKEN456"
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo leak-url > "$STUB_MODE"
    ST_ENV_URL="http://mfuser:${secret}@example.invalid/live/7.m3u8?token=${tok}"
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wleak" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --heartbeat 2 --max-runtime 5 \
        --clean-on-stop 0 --keep-logs
    ST_ENV_URL=""
    st_eq "T25a corrida con fuga de URL (exit 0)" "$ST_WRC" "0"
    local leaklog="$wleak/state/$key-7.ffmpeg.log"
    [ -f "$leaklog" ]; st_ok "T25b log de stderr presente (--keep-logs)" $? "$ST_WERR"
    st_eq "T25c log 0600" "$(stat -c %a -- "$leaklog" 2>/dev/null)" "600"
    st_eq "T25d STATE_DIR 0700" "$(stat -c %a -- "$wleak/state" 2>/dev/null)" "700"
    grep -q "$secret" "$leaklog" 2>/dev/null; st_ne "T25e el log NO contiene la contraseña" $? 0
    grep -q "$tok" "$leaklog" 2>/dev/null; st_ne "T25f el log NO contiene el token" $? 0
    grep -q "mfuser" "$leaklog" 2>/dev/null; st_ne "T25g el log NO contiene el usuario" $? 0
    grep -q '<redacted>' "$leaklog" 2>/dev/null; st_ok "T25h el log sí muestra <redacted>" $?
    grep -rq "$secret" "$wleak" 2>/dev/null; st_ne "T25i ningún fichero del window root contiene la contraseña" $? 0
    local wleak2="$ST_TMP/win-leak2"
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo leak-url > "$STUB_MODE"
    ST_ENV_URL="http://mfuser:${secret}@example.invalid/live/7.m3u8?token=${tok}"
    st_run_worker --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wleak2" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --heartbeat 2 --max-runtime 4
    ST_ENV_URL=""
    [ ! -e "$wleak2/state/$key-7.ffmpeg.log" ]; st_ok "T25j log borrado tras parada normal (sin --keep-logs)" $?
    st_stop_fake_sup

    # ── T26 F2/t7: limpieza de la generación VIGENTE tras kill -9/watchdog ─
    sock="$ST_TMP/own.sock"; slog="$ST_TMP/own.log"; : > "$slog"
    st_start_fake_sup "$sock" "$slog" ok 7
    local wown="$ST_TMP/win-own"
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo ok > "$STUB_MODE"
    bash "$SELF" --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wown" \
        --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 60 \
        >"$ST_TMP/own.out" 2>"$ST_TMP/own.err" &
    local wpid=$!
    local i3=0
    while [ "$i3" -lt 80 ] && { [ ! -f "$wown/$key/7/index.m3u8" ] || ! grep -q 'state=live' "$slog" 2>/dev/null; }; do
        sleep 0.1; i3=$((i3 + 1))
    done
    [ -d "$wown/$key/7" ]; st_ok "T26a worker vivo con ventana" $?
    st_run_worker --cleanup --own-gen --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wown"
    st_eq "T26b cleanup --own-gen con worker VIVO: exit 0" "$ST_WRC" "0"
    [ -d "$wown/$key/7" ]; st_ok "T26c NO borra una sesión viva" $?
    st_has "$ST_WERR" "worker VIVO"; st_ok "T26d lo registra (flock tomado)" $? "$ST_WERR"
    pkill -9 -P "$wpid" 2>/dev/null || true
    kill -9 "$wpid" 2>/dev/null || true
    wait "$wpid" 2>/dev/null || true
    st_wait_lock_free "$key" "$wown"; st_ok "T26e flock liberado tras kill -9" $?
    [ -d "$wown/$key/7" ]; st_ok "T26f tras kill -9 la ventana queda (escenario de fuga)" $?
    st_run_worker --cleanup --own-gen --key "$key" --gen 7 --out "/mf/$key/7/" --window-root "$wown"
    st_eq "T26g cleanup --own-gen tras kill -9: exit 0" "$ST_WRC" "0"
    [ ! -e "$wown/$key/7" ]; st_ok "T26h generación vigente borrada (sin fuga de tmpfs)" $?
    # t18/F2b: N ciclos con ARRANQUE CONCURRENTE (worker + cleanup a la vez).
    # El flock se mantiene durante TODO el borrado, así que no puede perderse
    # una ventana viva; y una vez muerto el worker, el cleanup la elimina.
    # Determinista: N=5, 0 dirs exigidos en CADA iteración (antes era flaky 1/3).
    local it kk rpid2 cpid2 alive
    for it in 1 2 3 4 5; do
        kk=$(printf '%016x' $(( 0xbeef0000 + it )))
        : > "$STUB_LOG"; : > "$STUB_COUNT"; echo ok > "$STUB_MODE"
        MF_UPSTREAM_URL="$ST_URL" bash "$SELF" --key "$kk" --gen 7 --out "/mf/$kk/7/" \
            --window-root "$wown" --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" \
            --max-runtime 4 --clean-on-stop 0 >"$ST_TMP/cyc$it.out" 2>"$ST_TMP/cyc$it.err" &
        rpid2=$!
        bash "$SELF" --cleanup --own-gen --key "$kk" --gen 7 --out "/mf/$kk/7/" \
            --window-root "$wown" >"$ST_TMP/cycc$it.out" 2>"$ST_TMP/cycc$it.err" &
        cpid2=$!
        wait "$cpid2" 2>/dev/null || true
        alive=0; kill -0 "$rpid2" 2>/dev/null && alive=1
        wait "$rpid2" 2>/dev/null || true
        [ "$alive" -eq 1 ] && pkill -9 -P "$rpid2" 2>/dev/null || true
        # segundo cleanup (worker ya muerto): elimina la ventana que quedó
        st_run_worker --cleanup --own-gen --key "$kk" --gen 7 --out "/mf/$kk/7/" --window-root "$wown"
        st_eq "T26i.$it ciclo concurrente: 0 dirs de sesión" \
            "$(find "$wown" -maxdepth 1 -type d -name '[0-9a-f]*' | wc -l)" "0"
        pkill -9 -f "$ST_TMP/stub-ffmpeg" 2>/dev/null || true
        st_wait_lock_free "$kk" "$wown"
    done
    st_stop_fake_sup

    # ── T27 F4/t7: lock FIJO del supervisor + dedup por URL normalizada ────
    MF_TEST_ALLOW_LOCK_DIR=0 st_run_worker --probe-lock --key "$key" --lock-dir "/tmp/mf-lock-ajeno"
    st_eq "T27a lock dir no canónico rechazado (exit 2)" "$ST_WRC" "2"
    local uf1 uf2 uf3
    uf1=$(url_fingerprint "http://user:pass@Host.EXAMPLE:8080/live/u/p/7.m3u8?token=AAA")
    uf2=$(url_fingerprint "http://otro:zzz@host.example:8080/live/u/p/7.m3u8?token=BBB#frag")
    uf3=$(url_fingerprint "http://host.example:8080/live/u/p/8.m3u8")
    st_eq "T27b fingerprint ignora credenciales/query/host-case" "$uf1" "$uf2"
    st_ne "T27c fingerprint distingue path" "$uf1" "$uf3"
    case "$uf1" in *user*|*pass*|*AAA*|*"://"*) st_ok "T27d fingerprint sin secretos ni URL" 1 "$uf1" ;; *) st_ok "T27d fingerprint sin secretos ni URL" 0 ;; esac
    sock="$ST_TMP/dedup.sock"; slog="$ST_TMP/dedup.log"; : > "$slog"
    st_start_fake_sup "$sock" "$slog" ok 7
    local wA="$ST_TMP/win-dedupA" wB="$ST_TMP/win-dedupB" urlD="http://dedup:secret@example.invalid/live/u/p/9.m3u8?token=T"
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo ok > "$STUB_MODE"
    MF_UPSTREAM_URL="$urlD" bash "$SELF" --key 1111111111111111 --gen 7 --out "/mf/1111111111111111/7/" \
        --window-root "$wA" --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 30 \
        >"$ST_TMP/dedupA.out" 2>"$ST_TMP/dedupA.err" &
    local dpid=$!
    local i4=0
    while [ "$i4" -lt 80 ] && ! grep -q 'state=live' "$slog" 2>/dev/null; do sleep 0.1; i4=$((i4 + 1)); done
    ST_ENV_URL="$urlD" st_run_worker --key 2222222222222222 --gen 7 --out "/mf/2222222222222222/7/" \
        --window-root "$wB" --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 2
    st_eq "T27e otra key con la MISMA URL → exit 3 (dedup URL)" "$ST_WRC" "3"
    st_has "$ST_WERR" "upstream duplicado"; st_ok "T27f lo registra" $? "$ST_WERR"
    ST_ENV_URL="$urlD" st_run_worker --key 1111111111111111 --gen 7 --out "/mf/1111111111111111/7/" \
        --window-root "$wB" --sup-sock "$sock" --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 2
    st_eq "T27g misma key con OTRO window root → exit 3 (lock fijo)" "$ST_WRC" "3"
    pkill -9 -P "$dpid" 2>/dev/null || true
    kill -9 "$dpid" 2>/dev/null || true
    wait "$dpid" 2>/dev/null || true
    pkill -9 -f "$ST_TMP/stub-ffmpeg" 2>/dev/null || true
    st_wait_lock_free 1111111111111111 "$wA"
    ST_ENV_URL=""
    st_stop_fake_sup

    # ── T28 F5/t7: cota y poda con .m4s/.mp4 (no sólo seg*.ts) ─────────────
    local wm="$ST_TMP/win-m4s" i5
    mkdir -p "$wm/$key/9"
    for i5 in 0 1 2 3 4 5 6 7 8 9 10 11; do truncate -s 8388608 "$wm/$key/9/seg$(printf '%05d' "$i5").m4s"; done
    { echo '#EXTM3U'; echo '#EXT-X-TARGETDURATION:6'; echo '#EXT-X-MEDIA-SEQUENCE:4'
      for i5 in 4 5 6 7 8 9 10 11; do echo '#EXTINF:6.0,'; echo "seg$(printf '%05d' "$i5").m4s"; done; } > "$wm/$key/9/index.m3u8"
    OUT="$wm/$key/9"; MEDIA_EXTS="ts m4s mp4 aac"; WINDOW_MAX_BYTES=83886080
    st_eq "T28a window_bytes cuenta .m4s (96 MiB)" "$(window_bytes)" "100663296"
    enforce_window_cap; local rc28=$?
    local after28; after28=$(window_bytes)
    st_eq "T28b poda con .m4s ok" "$rc28" "0"
    [ "$after28" -le 83886080 ]; st_ok "T28c .m4s ≤80 MiB tras poda ($after28)" $?
    { [ -f "$wm/$key/9/seg00011.m4s" ] && [ -f "$wm/$key/9/seg00004.m4s" ]; }; st_ok "T28d listados intactos" $?
    [ ! -f "$wm/$key/9/seg00000.m4s" ]; st_ok "T28e huérfanos .m4s borrados" $?
    local wm2="$ST_TMP/win-m4s2"; mkdir -p "$wm2/$key/10"
    for i5 in 0 1 2 3 4 5 6 7 8 9; do truncate -s 9437184 "$wm2/$key/10/seg$(printf '%05d' "$i5").mp4"; done
    { echo '#EXTM3U'; echo '#EXT-X-TARGETDURATION:6'; echo '#EXT-X-MEDIA-SEQUENCE:0'
      for i5 in 0 1 2 3 4 5 6 7 8 9; do echo '#EXTINF:6.0,'; echo "seg$(printf '%05d' "$i5").mp4"; done; } > "$wm2/$key/10/index.m3u8"
    OUT="$wm2/$key/10"; enforce_window_cap; st_eq "T28f .mp4 irrecuperable (>80 MiB) → rotar" "$?" "1"

    # ── T29 F2/t7: janitor global de tmpfs (edad y presupuesto) ────────────
    local wj="$ST_TMP/win-jan" k1=1111111111111111 k2=2222222222222222
    mkdir -p "$wj/$k1/1" "$wj/$k2/3" "$wj/state"
    truncate -s 1048576 "$wj/$k1/1/seg00000.ts"
    truncate -s 1048576 "$wj/$k2/3/seg00000.ts"
    WINDOW_ROOT="$wj"; LOCK_DIR="$ST_TMP/locks"; STATE_DIR="$wj/state"
    mkdir -p "$LOCK_DIR"
    janitor 0 0
    st_eq "T29a janitor(age=0) borra sesiones huérfanas" \
        "$(find "$wj" -maxdepth 1 -type d -name '[0-9a-f]*' | wc -l)" "0"
    mkdir -p "$wj/$k1/1"; truncate -s 1048576 "$wj/$k1/1/seg00000.ts"
    ( exec 9>>"$LOCK_DIR/$k1.lock"; flock -n 9; sleep 2 ) &
    local holder29=$!
    sleep 0.2
    janitor 0 0
    [ -d "$wj/$k1/1" ]; st_ok "T29b janitor respeta sesiones con worker vivo" $?
    wait "$holder29" 2>/dev/null || true
    janitor 999999 1
    st_eq "T29c janitor(budget=1) borra por presupuesto" \
        "$(find "$wj" -maxdepth 1 -type d -name '[0-9a-f]*' | wc -l)" "0"

    # ── T30 t18: el borrado exige el flock TOMADO (no borra ventanas vivas) ──
    local kc=4444444444444444 wc30="$ST_TMP/win-clean"
    mkdir -p "$wc30/$kc/1" "$LOCK_DIR"
    truncate -s 1048576 "$wc30/$kc/1/seg00000.ts"
    ( exec 9>>"$LOCK_DIR/$kc.lock"; flock -n 9; sleep 4 ) &
    local hold30=$!
    sleep 0.3
    st_run_worker --cleanup --own-gen --key "$kc" --gen 1 --out "/mf/$kc/1/" --window-root "$wc30"
    st_eq "T30a cleanup con flock tomado: exit 0" "$ST_WRC" "0"
    [ -d "$wc30/$kc/1" ]; st_ok "T30b NO borra la ventana de un worker vivo" $?
    st_has "$ST_WERR" "worker VIVO"; st_ok "T30c lo registra (lock no adquirible)" $? "$ST_WERR"
    wait "$hold30" 2>/dev/null || true
    st_run_worker --cleanup --own-gen --key "$kc" --gen 1 --out "/mf/$kc/1/" --window-root "$wc30"
    [ ! -e "$wc30/$kc/1" ]; st_ok "T30d con el flock libre sí borra" $?
    # Carrera real: worker y cleanup arrancan a la vez sobre la misma key
    local kc2=5555555555555555 rrc=0 i30=0
    : > "$STUB_LOG"; : > "$STUB_COUNT"; echo ok > "$STUB_MODE"
    MF_UPSTREAM_URL="$ST_URL" bash "$SELF" --key "$kc2" --gen 7 --out "/mf/$kc2/7/" \
        --window-root "$wc30" --no-supervisor --ffmpeg "$ST_TMP/stub-ffmpeg" --max-runtime 8 \
        >"$ST_TMP/race.out" 2>"$ST_TMP/race.err" &
    local rpid=$!
    bash "$SELF" --cleanup --own-gen --key "$kc2" --gen 7 --out "/mf/$kc2/7/" --window-root "$wc30" \
        >"$ST_TMP/racec.out" 2>"$ST_TMP/racec.err" &
    local cpid=$!
    wait "$cpid" 2>/dev/null || true
    if kill -0 "$rpid" 2>/dev/null; then
        # el worker ganó el lock y está vivo: su ventana NO puede haberse
        # borrado. Esperar a que prepare el dir (el cleanup puede acabar antes).
        while [ "$i30" -lt 50 ] && [ ! -d "$wc30/$kc2/7" ] && kill -0 "$rpid" 2>/dev/null; do
            sleep 0.1; i30=$((i30 + 1))
        done
        [ -d "$wc30/$kc2/7" ]; st_ok "T30e carrera: worker vivo ⇒ su ventana intacta" $?
        kill -9 "$rpid" 2>/dev/null || true
        pkill -9 -P "$rpid" 2>/dev/null || true
    else
        wait "$rpid" 2>/dev/null
        rrc=$?
        st_eq "T30e carrera: cleanup tenía el lock ⇒ worker rechazado (exit 3)" "$rrc" "3"
    fi
    wait "$rpid" 2>/dev/null || true
    pkill -9 -f "$ST_TMP/stub-ffmpeg" 2>/dev/null || true
    st_wait_lock_free "$kc2" "$wc30"

    if [ "$SELFTEST_REMUX" -eq 1 ]; then st_remux_tests; fi

    # Higiene: ningún stub/redactor del test debe sobrevivir (retendría locks)
    pkill -9 -f "$ST_TMP/stub-ffmpeg" 2>/dev/null || true
    st_stop_fake_sup

    local dur=$((SECONDS - start_ts))
    printf 'SELFTEST SUMMARY pass=%d fail=%d duration=%ds tmp=%s\n' "$ST_PASS" "$ST_FAIL" "$dur" "$ST_TMP"
    if [ "$ST_FAIL" -eq 0 ]; then
        [ -z "$TMPDIR_OVERRIDE" ] && rm -rf -- "$ST_TMP"
        return 0
    fi
    printf 'SELFTEST FAILED: %d aserciones\n' "$ST_FAIL"
    return 1
}

st_remux_tests() {
    command -v "$FFMPEG_BIN" >/dev/null 2>&1 || { printf 'SELFTEST SKIP remux: sin ffmpeg\n'; return 0; }
    command -v "$FFPROBE_BIN" >/dev/null 2>&1 || { printf 'SELFTEST SKIP remux: sin ffprobe\n'; return 0; }
    local d="$ST_TMP/remux" key="7ac3cdf648ac4474" port=18797
    mkdir -p "$d/src"
    ( cd "$d/src" && "$FFMPEG_BIN" -hide_banner -nostdin -loglevel error \
        -f lavfi -i "testsrc2=size=320x240:rate=25" -f lavfi -i "sine=frequency=440:sample_rate=48000" \
        -t 12 -c:v libx264 -preset ultrafast -g 50 -c:a aac -b:a 96k \
        -f hls -hls_time 4 -hls_list_size 0 -hls_playlist_type event \
        -hls_segment_filename "src%03d.ts" src.m3u8 ) || {
        printf 'SELFTEST SKIP remux: no pude generar la fuente\n'; return 0
    }
    # "proveedor" local por HTTP loopback (las opciones http del argv son reales)
    python3 -m http.server "$port" --bind 127.0.0.1 --directory "$d/src" >/dev/null 2>&1 &
    local http_pid=$!
    local i=0
    while [ "$i" -lt 50 ] && ! curl -sS -o /dev/null --max-time 1 "http://127.0.0.1:$port/src.m3u8" 2>/dev/null; do
        sleep 0.1; i=$((i + 1))
    done
    local w="$d/win"
    ST_ENV_URL="http://127.0.0.1:$port/src.m3u8"
    st_run_worker --key "$key" --gen 1 --out "/mf/$key/1/" --window-root "$w" \
        --no-supervisor --clean-on-stop 0 --on-eof stop \
        --ffmpeg "$FFMPEG_BIN" --ffprobe "$FFPROBE_BIN" \
        --hls-time 4 --hls-list-size 8 --max-runtime 25 --stall-timeout 20
    kill -TERM "$http_pid" 2>/dev/null || true
    wait "$http_pid" 2>/dev/null || true
    ST_ENV_URL=""
    local out="$w/$key/1"
    [ -f "$out/index.m3u8" ]; st_ok "T19a remux produce index.m3u8 (rc=$ST_WRC)" $? "$ST_WERR"
    [ -n "$(ls -1 "$out"/seg*.ts 2>/dev/null | head -1)" ]; st_ok "T19b remux produce segmentos TS" $?
    local first vc ac
    first=$(awk '!/^#/ && NF { print; exit }' "$out/index.m3u8" 2>/dev/null)
    vc=$("$FFPROBE_BIN" -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$out/$first" 2>/dev/null | head -n1 | tr -d '\r')
    ac=$("$FFPROBE_BIN" -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$out/$first" 2>/dev/null | head -n1 | tr -d '\r')
    st_eq "T19c vídeo sigue h264 (sin recodificar)" "$vc" "h264"
    st_eq "T19d audio aac viaja en copy" "$ac" "aac"
    # Prueba fuerte: el ES de vídeo del primer segmento de salida debe ser
    # idéntico al de ALGÚN segmento de origen (remux puro, sin re-encode).
    local h2 hashes="" s h
    h2=$("$FFMPEG_BIN" -v error -i "$out/$first" -map 0:v:0 -c copy -f h264 - 2>/dev/null | md5sum | awk '{print $1}')
    for s in "$d/src"/src*.ts; do
        [ -e "$s" ] || continue
        h=$("$FFMPEG_BIN" -v error -i "$s" -map 0:v:0 -c copy -f h264 - 2>/dev/null | md5sum | awk '{print $1}')
        hashes+=" $h"
    done
    st_has "$hashes" "$h2"; st_ok "T19e ES de vídeo idéntico (remux puro, sin recodificar)" $? "hash=$h2 hashes=$hashes"
    grep -q 'EXT-X-ENDLIST' "$out/index.m3u8"; st_ne "T19f omit_endlist" $? 0
    grep -q 'EXT-X-INDEPENDENT-SEGMENTS' "$out/index.m3u8"; st_ok "T19g segmentos independientes" $?
    local n; n=$(awk '!/^#/ && NF' "$out/index.m3u8" | wc -l)
    [ "$n" -le 8 ]; st_ok "T19h ventana ≤8 entradas (n=$n)" $?
    OUT="$out"; [ "$(window_bytes)" -le 83886080 ]; st_ok "T19i ventana ≤80 MiB" $? "$(window_bytes)"

    # ── T20 audio NO estándar (opus) ⇒ transcodifica SÓLO audio, vídeo intacto ──
    local d2="$d/opus" port2=18798
    mkdir -p "$d2/src"
    ( cd "$d2/src" && "$FFMPEG_BIN" -hide_banner -nostdin -loglevel error \
        -f lavfi -i "testsrc2=size=320x240:rate=25" -f lavfi -i "sine=frequency=440:sample_rate=48000" \
        -t 8 -c:v libx264 -preset ultrafast -g 50 -c:a libopus -b:a 96k \
        -f hls -hls_time 4 -hls_list_size 0 -hls_playlist_type event \
        -hls_segment_filename "src%03d.ts" src.m3u8 ) || {
        printf 'SELFTEST SKIP remux-opus: no pude generar la fuente\n'; return 0
    }
    python3 -m http.server "$port2" --bind 127.0.0.1 --directory "$d2/src" >/dev/null 2>&1 &
    local http2=$!
    i=0
    while [ "$i" -lt 50 ] && ! curl -sS -o /dev/null --max-time 1 "http://127.0.0.1:$port2/src.m3u8" 2>/dev/null; do
        sleep 0.1; i=$((i + 1))
    done
    ST_ENV_URL="http://127.0.0.1:$port2/src.m3u8"
    st_run_worker --key "$key" --gen 2 --out "/mf/$key/2/" --window-root "$w" \
        --no-supervisor --clean-on-stop 0 --on-eof stop \
        --ffmpeg "$FFMPEG_BIN" --ffprobe "$FFPROBE_BIN" \
        --hls-time 4 --hls-list-size 8 --max-runtime 25 --stall-timeout 20
    kill -TERM "$http2" 2>/dev/null || true
    wait "$http2" 2>/dev/null || true
    ST_ENV_URL=""
    local out2="$w/$key/2" f2 vc2 ac2
    [ -f "$out2/index.m3u8" ]; st_ok "T20a remux con opus produce ventana (rc=$ST_WRC)" $? "$ST_WERR"
    f2=$(awk '!/^#/ && NF { print; exit }' "$out2/index.m3u8" 2>/dev/null)
    vc2=$("$FFPROBE_BIN" -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$out2/$f2" 2>/dev/null | head -n1 | tr -d '\r')
    ac2=$("$FFPROBE_BIN" -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$out2/$f2" 2>/dev/null | head -n1 | tr -d '\r')
    st_eq "T20b vídeo sigue h264 (nunca se recodifica)" "$vc2" "h264"
    st_eq "T20c audio opus → aac (sólo audio)" "$ac2" "aac"
    st_has "$ST_WERR" "no estándar en MPEG-TS/HLS"; st_ok "T20d decisión de audio registrada" $?
    st_has "$ST_WERR" "MISMA gen"; st_ok "T20e reinicio en la MISMA gen (aún sin publicar)" $?
    local h3 h4 hashes3="" s3
    h3=$("$FFMPEG_BIN" -v error -i "$out2/$f2" -map 0:v:0 -c copy -f h264 - 2>/dev/null | md5sum | awk '{print $1}')
    for s3 in "$d2/src"/src*.ts; do
        [ -e "$s3" ] || continue
        h4=$("$FFMPEG_BIN" -v error -i "$s3" -map 0:v:0 -c copy -f h264 - 2>/dev/null | md5sum | awk '{print $1}')
        hashes3+=" $h4"
    done
    st_has "$hashes3" "$h3"; st_ok "T20f ES de vídeo idéntico pese a transcodificar audio" $? "hash=$h3"
}

main "$@"
