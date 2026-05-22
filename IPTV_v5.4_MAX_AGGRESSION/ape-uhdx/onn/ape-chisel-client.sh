#!/system/bin/sh
# APE UHDX — chisel reverse tunnel client (ONN 4K)
# Creates: VPS 127.0.0.1:5556 → ONN 127.0.0.1:5555 (ADB)
# Deployed to: /data/local/tmp/ape-chisel-client.sh

CHISEL=/data/local/tmp/chisel
LOCK=/data/local/tmp/ape-chisel.lock
LOG=/data/local/tmp/ape-chisel.log
VPS_HOST=178.156.147.234
VPS_PORT=7341
AUTH=ape:ape-uhdx-1dbe89bd59e51f0de35a

is_alive() {
    [ -f "$LOCK" ] || return 1
    p=$(cat "$LOCK" 2>/dev/null)
    [ -n "$p" ] && kill -0 "$p" 2>/dev/null
}

cmd_status() {
    if is_alive; then
        p=$(cat "$LOCK" 2>/dev/null)
        echo "alive pid=$p"
    else
        echo "dead"
    fi
}

cmd_stop() {
    if [ -f "$LOCK" ]; then
        p=$(cat "$LOCK" 2>/dev/null)
        if [ -n "$p" ]; then
            kill -9 "$p" 2>/dev/null
        fi
        rm -f "$LOCK"
    fi
    echo "stopped"
}

cmd_daemon() {
    if is_alive; then
        p=$(cat "$LOCK" 2>/dev/null)
        echo "already alive pid=$p"
        return 0
    fi
    rm -f "$LOCK"
    nohup "$CHISEL" client \
        --auth "$AUTH" \
        "http://$VPS_HOST:$VPS_PORT" \
        "R:5556:127.0.0.1:5555" \
        </dev/null >>"$LOG" 2>&1 &
    echo $! > "$LOCK"
    sleep 2
    if is_alive; then
        p=$(cat "$LOCK" 2>/dev/null)
        echo "started pid=$p"
    else
        echo "failed"
        return 1
    fi
}

case "${1:-status}" in
    status) cmd_status ;;
    stop)   cmd_stop ;;
    daemon) cmd_daemon ;;
    *)
        echo "Usage: $0 {status|daemon|stop}"
        exit 1
        ;;
esac
