#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# APE SUPERVISOR — launcher (SOCAT + FLOCK CORTO) y puerta de entrada
# ═════════════════════════════════════════════════════════════════════════════
#   ./ape-supervisor.sh --serve      arranca los DOS sockets (systemd)
#   ./ape-supervisor.sh --handle     una conexión (lo invoca socat por cliente)
#   ./ape-supervisor.sh --selftest   autotest determinista (sin red)
#   ./ape-supervisor.sh --check      valida directorios/ficheros/permisos
#
# B1 (t11) — SECCIÓN CRÍTICA CORTA: el handler padre NO toma flock. Cada
# mutación de estado se delega a un hijo `lua --locked-state` que toma
# `flock -x` durante MILISEGUNDOS (gen+spec+registro). El start/stop/restart de
# la instancia y TODO el relay HTTP se ejecutan FUERA del lock, de modo que el
# worker recién arrancado puede publicar por UDS en el acto (<0,4 s) sin
# deadlock. El padre sigue atendiendo el socket mientras el hijo arranca.
#
# Dependencias: bash, socat, flock, lua5.1, curl (relay), util-linux. Todas
# presentes en el VPS; PROHIBIDO apt install o resty-lock/http.
#
# El script sólo:
#   * prepara directorios con owner correcto (mediafanout:www-data o fallback)
#   * escucha CANÓNICO /run/mediafanout/mf.sock y ALIAS supervisor.sock
#     (root:www-data 0660, unlink-early) con el MISMO handler
#   * exporta MF_LUA_BIN/MF_SELF/MF_LOCK_FILE para el lock corto del Lua
# ═════════════════════════════════════════════════════════════════════════════
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
LUA=${MF_LUA:-lua5.1}
ROOT=${MF_ROOT:-/run/mediafanout}
STATE=${MF_STATE_DIR:-/var/lib/mediafanout}
WINDOW=${MF_WINDOW_ROOT:-/dev/shm/mf}
CONF=${MF_CONF_DIR:-/etc/mediafanout}
OWNER=${MF_SPEC_OWNER:-mediafanout:www-data}
WINDOW_OWNER=${MF_WINDOW_OWNER:-mediafanout:www-data}
LOCK="$ROOT/state.lock"

log() { echo "ape-supervisor.sh: $*" >&2; }

# mkdir con owner/modo. Si el usuario configurado no existe, cae a root:www-data
# (el grupo www-data es el que necesita nginx para leer/escribir).
ensure_dir() {
    local path=$1 mode=$2 owner=$3
    mkdir -p "$path" || { log "no puedo crear $path"; return 1; }
    chmod "$mode" "$path" 2>/dev/null || true
    if ! chown "$owner" "$path" 2>/dev/null; then
        chown root:www-data "$path" 2>/dev/null || true
    fi
    return 0
}

require_root() {
    if [ "$(id -u)" != "0" ]; then
        log "--serve requiere root (sockets root:www-data y systemctl)"
        exit 1
    fi
}

case "${1:-}" in
    --serve)
        require_root
        ensure_dir "$ROOT" 0750 "$OWNER" || exit 1
        ensure_dir "$ROOT/spec" 0750 "$OWNER" || exit 1
        ensure_dir "$STATE/keys" 0750 "$OWNER" || exit 1
        ensure_dir "$WINDOW" 0750 "$WINDOW_OWNER" || exit 1
        touch "$LOCK" && chmod 0660 "$LOCK" && chgrp www-data "$LOCK" 2>/dev/null || true
        umask 007

        # El lock sólo protege la transacción corta de estado (lo toma el hijo
        # --locked-state). Aquí se exporta la ruta y el intérprete.
        export MF_LUA_BIN="$LUA" MF_SELF="$HERE/ape-supervisor.lua" MF_LOCK_FILE="$LOCK"

        log "serve root=$ROOT state=$STATE window=$WINDOW coord=${MF_COORD_URL:-http://127.0.0.1:8090}"
        # Dos bindings, mismo handler. Socat aplica mode/group al socket.
        socat UNIX-LISTEN:"$ROOT/mf.sock",fork,mode=0660,group=www-data,unlink-early,backlog=128 \
              EXEC:"$HERE/ape-supervisor.sh --handle" &
        PID_CANON=$!
        socat UNIX-LISTEN:"$ROOT/supervisor.sock",fork,mode=0660,group=www-data,unlink-early,backlog=128 \
              EXEC:"$HERE/ape-supervisor.sh --handle" &
        PID_ALIAS=$!

        cleanup() {
            kill "$PID_CANON" "$PID_ALIAS" 2>/dev/null || true
            wait 2>/dev/null || true
        }
        trap cleanup INT TERM EXIT
        # si cualquiera de los dos muere, se cae el servicio (systemd reinicia)
        wait -n "$PID_CANON" "$PID_ALIAS" 2>/dev/null || wait "$PID_CANON"
        cleanup
        exit 1
        ;;
    --handle)
        # B1: el padre NO toma flock. La transacción de estado la ejecuta un
        # hijo `--locked-state` con flock (ms). Start/stop/restart y relay HTTP
        # quedan fuera del lock; el worker puede publicar de inmediato.
        mkdir -p "$ROOT" 2>/dev/null || true
        IFS= read -r line || true
        # FAST-PATH de OPEN idempotente: si la sesión ya está viva (incluida la
        # reserva state=starting del ganador), responder desde bash sin arrancar
        # Lua. Así 20 OPEN concurrentes durante un start responden en pocos ms.
        fp_key=""
        if [[ "$line" =~ ^OPEN[[:space:]]+([0-9a-fA-F]{16})([[:space:]]|$) ]]; then
            fp_key="${BASH_REMATCH[1]}"
        fi
        if [ -n "$fp_key" ] && [ -f "$STATE/keys/$fp_key/state" ]; then
            fp_gen=""; fp_st=""; fp_seq=""; fp_upd=""
            while IFS='=' read -r fp_k fp_v; do
                case "$fp_k" in
                    gen)     fp_gen=$fp_v ;;
                    state)   fp_st=$fp_v ;;
                    seq)     fp_seq=$fp_v ;;
                    updated) fp_upd=$fp_v ;;
                esac
            done < "$STATE/keys/$fp_key/state"
            now_s=${EPOCHSECONDS:-0}
            if [ -n "$fp_gen" ] && [ -n "$fp_st" ] \
               && { [ "$fp_st" = "starting" ] || [ "$fp_st" = "live" ] || [ "$fp_st" = "backoff" ]; } \
               && [ $(( now_s - ${fp_upd:-0} )) -le "${MF_STALE_AFTER:-45}" ]; then
                printf 'OK gen=%s state=%s seq=%s caps=0 path=%s/%s/%s ttl=%s\n' \
                    "$fp_gen" "$fp_st" "${fp_seq:-0}" "$WINDOW" "$fp_key" "$fp_gen" "${MF_LINGER_TTL:-25}"
                exit 0
            fi
        fi
        exec "$LUA" "$HERE/ape-supervisor.lua" --handle <<< "$line"
        ;;
    --selftest)
        exec "$LUA" "$HERE/ape-supervisor.lua" --selftest
        ;;
    --check)
        fail=0
        for d in "$ROOT" "$ROOT/spec" "$STATE/keys" "$WINDOW" "$CONF"; do
            if [ -d "$d" ]; then
                printf 'OK  dir  %-40s %s\n' "$d" "$(stat -c '%a %U:%G' "$d" 2>/dev/null)"
            else
                printf 'MISS dir  %s\n' "$d"; fail=1
            fi
        done
        for f in "$CONF/providers.allow" "$CONF/urls.conf" "$ROOT/mf.sock" "$ROOT/supervisor.sock"; do
            if [ -e "$f" ]; then
                printf 'OK  file %-40s %s\n' "$f" "$(stat -c '%a %U:%G' "$f" 2>/dev/null)"
            else
                printf 'MISS file %s\n' "$f"; fail=1
            fi
        done
        exit "$fail"
        ;;
    *)
        echo "uso: $0 --serve | --handle | --selftest | --check" >&2
        exit 2
        ;;
esac
