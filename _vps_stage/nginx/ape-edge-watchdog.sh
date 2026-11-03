#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# APE EDGE WATCHDOG — continuidad 24/7 del motor cache-first
# ═════════════════════════════════════════════════════════════════════════════
# Qué vigila y qué hace:
#   1. HEALTH      consulta /ape/health (loopback) y exige {"status":"ok"}.
#   2. AUTO-HEAL   N fallos consecutivos ⇒ `nginx -s reload` (recuperación suave,
#                  no corta conexiones) y, si el reload no arregla, restart.
#   3. LOGS        rota access/error por tamaño (complementa a logrotate: si el
#                  operador no instaló logrotate, esto evita que el disco llene
#                  /dev/shm y tumbe la cache).
#   4. NO BLOQUEA  corre FUERA del path de petición. Nunca toca un cliente.
#                  Cero ngx.exit, cero limit_conn, cero circuit breaker.
#
# AUTOPISTA: este proceso jamás interviene en una reproducción en curso. Un
# reload de nginx es graceful: los workers viejos terminan sus respuestas y los
# nuevos atienden las siguientes. Ese es justo el patrón que la doctrina pide.
#
# USO
#   ape-edge-watchdog.sh --once            # una comprobación (tests/CI), exit 0/1
#   ape-edge-watchdog.sh                   # bucle continuo (systemd/timer)
#   Variables: APE_PORT (def 8088), APE_MAX_FAILS (3), APE_LOOP_SLEEP (15),
#              APE_LOG_DIR, APE_LOG_MAX_MB (64), APE_NGX_PREFIX, APE_NGX_CONF
# ═════════════════════════════════════════════════════════════════════════════
set -uo pipefail

PORT="${APE_PORT:-8088}"
MAX_FAILS="${APE_MAX_FAILS:-3}"
SLEEP_S="${APE_LOOP_SLEEP:-15}"
LOG_DIR="${APE_LOG_DIR:-/var/log/ape-edge}"
LOG_MAX_MB="${APE_LOG_MAX_MB:-64}"
NGX_PREFIX="${APE_NGX_PREFIX:-/etc/nginx}"
NGX_CONF="${APE_NGX_CONF:-/etc/nginx/nginx.conf}"
NGX_BIN="${APE_NGX_BIN:-nginx}"

ONCE=0
[ "${1:-}" = "--once" ] && ONCE=1

say() { printf '%s [ape-watchdog] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

health_ok() {
  local body
  body="$(curl -s --max-time 3 "http://127.0.0.1:${PORT}/ape/health" 2>/dev/null)" || return 1
  case "$body" in
    *'"status":"ok"'*) return 0 ;;
    *)                 return 1 ;;
  esac
}

rotate_logs() {
  [ -d "$LOG_DIR" ] || return 0
  local max=$(( LOG_MAX_MB * 1024 * 1024 ))
  local f
  for f in "$LOG_DIR"/*.log; do
    [ -f "$f" ] || continue
    local sz
    sz=$(stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "$sz" -gt "$max" ]; then
      mv -f "$f" "$f.$(date -u +%Y%m%dT%H%M%SZ)" 2>/dev/null || true
      say "log rotado: $f (${sz} B > ${LOG_MAX_MB} MB)"
    fi
  done
  # purga rotados de más de 7 días
  find "$LOG_DIR" -name '*.log.*' -mtime +7 -delete 2>/dev/null || true
}

reload_nginx() {
  say "recuperación: intentando reload suave"
  if [ -x "$NGX_BIN" ] || command -v "$NGX_BIN" >/dev/null 2>&1; then
    if "$NGX_BIN" -s reload -p "$NGX_PREFIX" -c "$NGX_CONF" 2>/dev/null; then
      say "reload OK"
      sleep 2
      health_ok && { say "salud restablecida tras reload"; return 0; }
    fi
  fi
  say "reload no bastó; intentando restart"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart nginx 2>/dev/null && sleep 2 && health_ok && {
      say "salud restablecida tras restart"; return 0; }
  fi
  return 1
}

check_once() {
  rotate_logs
  if health_ok; then
    say "health OK (puerto $PORT)"
    return 0
  fi
  say "health FALLA (puerto $PORT)"
  return 1
}

if [ "$ONCE" -eq 1 ]; then
  check_once
  exit $?
fi

fails=0
say "inicio watchdog · puerto=$PORT max_fails=$MAX_FAILS sleep=${SLEEP_S}s"
while true; do
  if check_once; then
    fails=0
  else
    fails=$((fails + 1))
    say "fallo consecutivo $fails/$MAX_FAILS"
    if [ "$fails" -ge "$MAX_FAILS" ]; then
      reload_nginx && fails=0
    fi
  fi
  sleep "$SLEEP_S"
done
