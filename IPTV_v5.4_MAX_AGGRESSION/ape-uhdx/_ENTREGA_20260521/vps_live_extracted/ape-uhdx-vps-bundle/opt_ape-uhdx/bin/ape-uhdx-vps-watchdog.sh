#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# APE UHDX — VPS Ubuntu Watchdog (systemd timer, cada 1 min)
# Revive el daemon unico del ONN (ape-uhdx-sentinel.sh) via ADB desde el VPS.
# NO usa Windows Task Scheduler ni PowerShell (mandato del documento).
# Idempotente. No crea procesos duplicados (el lock del daemon lo garantiza).
# ═════════════════════════════════════════════════════════════════════════════
set -u

ENV_FILE="/etc/ape-uhdx/watchdog.env"
[ -r "$ENV_FILE" ] && . "$ENV_FILE"

# Defaults (sobre-escribibles por watchdog.env). NO hardcodear IP critica aqui.
ADB_BIN="${ADB_BIN:-/usr/bin/adb}"
ONN_ADDR="${ONN_ADDR:-}"                                  # ej: 10.200.0.3:5555  (IP del ONN para ADB desde el VPS)
DAEMON_LOCAL="${DAEMON_LOCAL:-/opt/ape-uhdx/onn/ape-uhdx-sentinel.sh}"
DAEMON_REMOTE="${DAEMON_REMOTE:-/data/local/tmp/ape-uhdx-sentinel.sh}"
REMOTE_LOCK="${REMOTE_LOCK:-/data/local/tmp/ape-uhdx-sentinel.lock}"
STATE_DIR="${STATE_DIR:-/var/www/ape-uhdx}"
STATE_FILE="$STATE_DIR/last-vps-watchdog.json"
LOG_FILE="${LOG_FILE:-/var/log/ape-uhdx-watchdog.log}"
ADB_TIMEOUT="${ADB_TIMEOUT:-8}"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE" 2>/dev/null; }
adb_sh() { timeout "$ADB_TIMEOUT" "$ADB_BIN" -s "$ONN_ADDR" shell "$@" 2>/dev/null | tr -d '\r'; }

write_state() {
    mkdir -p "$STATE_DIR" 2>/dev/null
    cat > "$STATE_FILE" 2>/dev/null <<EOF
{"watchdog":"ape-uhdx-vps","onn":"$ONN_ADDR","guardian":"$1","daemon_alive":$2,"remote_pid":"${3:-}","ts":"$(date -Iseconds)"}
EOF
    chmod 644 "$STATE_FILE" 2>/dev/null
}

# A. Validar dependencias.
for dep in "$ADB_BIN" curl timeout sha256sum; do
    command -v "$dep" >/dev/null 2>&1 || { log "DEP_MISSING: $dep"; }
done
[ -z "$ONN_ADDR" ] && { log "ABORT: ONN_ADDR vacio en $ENV_FILE (poner IP:puerto del ONN para ADB)"; write_state "no_config" false ""; exit 1; }

# B. Conectar al ONN por ADB en la direccion configurada (ONN_ADDR).
conn=$(timeout "$ADB_TIMEOUT" "$ADB_BIN" connect "$ONN_ADDR" 2>&1)
if ! echo "$conn" | grep -qiE "connected|already"; then
    log "ONN_OFFLINE: $ONN_ADDR ($conn)"
    write_state "onn_offline" false ""
    exit 0
fi

# C. PID/lock del daemon.
remote_pid=$(adb_sh "cat $REMOTE_LOCK 2>/dev/null" | tr -dc '0-9')
daemon_alive=false
if [ -n "$remote_pid" ]; then
    rc=$(adb_sh "kill -0 $remote_pid 2>/dev/null; echo \$?")
    [ "$rc" = "0" ] && daemon_alive=true
fi

if [ "$daemon_alive" = "true" ]; then
    log "OK: daemon vivo pid=$remote_pid"
    write_state "alive" true "$remote_pid"
    exit 0
fi

# D. Daemon muerto / ONN rebooteado -> re-push si cambio + relaunch limpio.
log "DEAD_OR_REBOOTED: relanzando daemon UHDX"

# Decommission legacy en el ONN (que no queden 3 peleando).
adb_sh 'for f in /data/local/tmp/ape-ram-guardian.lock /data/local/tmp/ape-sentinel.lock /data/local/tmp/ape-pq-guardian.lock; do [ -f "$f" ] && { p=$(cat "$f" 2>/dev/null); [ -n "$p" ] && { kill "$p" 2>/dev/null; sleep 1; kill -9 "$p" 2>/dev/null; }; rm -f "$f"; }; done'

# Re-push si el script no existe o cambio el hash.
need_push=0
exists=$(adb_sh "test -f $DAEMON_REMOTE; echo \$?")
if [ "$exists" != "0" ]; then
    need_push=1
elif [ -r "$DAEMON_LOCAL" ]; then
    local_h=$(sha256sum "$DAEMON_LOCAL" 2>/dev/null | awk '{print $1}')
    remote_h=$(adb_sh "sha256sum $DAEMON_REMOTE 2>/dev/null | cut -d' ' -f1")
    [ -n "$local_h" ] && [ -n "$remote_h" ] && [ "$local_h" != "$remote_h" ] && need_push=1
fi
if [ "$need_push" = "1" ] && [ -r "$DAEMON_LOCAL" ]; then
    log "PUSH: $DAEMON_LOCAL -> $DAEMON_REMOTE"
    timeout "$ADB_TIMEOUT" "$ADB_BIN" -s "$ONN_ADDR" push "$DAEMON_LOCAL" "$DAEMON_REMOTE" >/dev/null 2>&1
    adb_sh "chmod 755 $DAEMON_REMOTE"
fi

# H. Borrar lock stale + relanzar detached (no duplica: el daemon hace acquire_lock).
adb_sh "rm -f $REMOTE_LOCK"
adb_sh "nohup sh $DAEMON_REMOTE daemon >/dev/null 2>&1 &"
sleep 3

remote_pid=$(adb_sh "cat $REMOTE_LOCK 2>/dev/null" | tr -dc '0-9')
if [ -n "$remote_pid" ]; then
    rc=$(adb_sh "kill -0 $remote_pid 2>/dev/null; echo \$?")
    [ "$rc" = "0" ] && daemon_alive=true
fi

if [ "$daemon_alive" = "true" ]; then
    log "RESURRECTED: daemon pid=$remote_pid"
    write_state "resurrected" true "$remote_pid"
else
    log "FAILED: no se pudo relanzar el daemon"
    write_state "failed" false ""
fi
exit 0
