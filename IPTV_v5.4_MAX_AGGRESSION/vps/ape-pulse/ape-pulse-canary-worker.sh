#!/usr/bin/env bash
# ape-pulse-canary-worker.sh — dispara el canary one-shot desde la COLA de zapping.
#
# POR QUÉ EXISTE
#   /pulse corre en php-fpm como www-data. `ape-canaryctl start` escribe en
#   /etc/ara/canary y hace systemctl start => Permission denied. En vez de dar
#   sudo a www-data (podría lanzar ffmpeg contra URLs arbitrarias), el endpoint
#   SÓLO deja un fichero en la cola y este worker (root) decide.
#
# GARANTÍAS
#   - Fail-closed: si falta la allowlist de hosts, NO se dispara nada.
#   - Un solo slot: si hay un ape-canary@*.service activo, se espera al siguiente tick.
#   - TTL de cola: ficheros con más de 120 s se descartan (un zap viejo no interesa).
#   - Dedupe por lock de canal (300 s) que ya crea el endpoint.
#   - Nunca toca /lists, /sync ni /ara.
set -euo pipefail

QUEUE=/var/lib/ara/canary/queue
ALLOW=/etc/ara/canary/allowed_hosts.txt
CTL=/usr/local/bin/ape-canaryctl
LOG=/var/log/ara/canary.log
MAX_TTL=120
SECONDS_SAMPLE="${APE_CANARY_SECONDS:-6}"

log(){ printf '%s worker: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG" 2>/dev/null || true; }

[ -d "$QUEUE" ] || exit 0
[ -r "$ALLOW" ] || { log "skip: falta $ALLOW (fail-closed)"; exit 0; }

# Un solo canary a la vez (3 vCPU; CPUQuota 40%).
if systemctl list-units --state=active --no-legend 2>/dev/null | grep -q 'ape-canary@'; then
  exit 0
fi

shopt -s nullglob
for f in "$QUEUE"/*.json; do
  now=$(date +%s)
  mt=$(stat -c%Y "$f" 2>/dev/null || echo 0)
  age=$(( now - mt ))
  if [ "$age" -gt "$MAX_TTL" ]; then rm -f "$f"; log "descarta cola vieja ($age s)"; continue; fi

  id=$(node -e 'try{const j=require(process.argv[1]);process.stdout.write(String(j.id||""))}catch(e){}' "$f" 2>/dev/null || true)
  url=$(node -e 'try{const j=require(process.argv[1]);process.stdout.write(String(j.url||""))}catch(e){}' "$f" 2>/dev/null || true)
  [ -n "$id" ] && [ -n "$url" ] || { rm -f "$f"; log "descarta cola invalida"; continue; }

  # Validación de forma.
  case "$url" in http://*|https://*) ;; *) rm -f "$f"; log "rechaza: url no http(s)"; continue ;; esac
  case "$url" in *[[:space:]]*) rm -f "$f"; log "rechaza: url con espacios"; continue ;; esac
  [ "${#url}" -le 2000 ] || { rm -f "$f"; log "rechaza: url >2000"; continue; }

  # Allowlist de hosts (fail-closed). Evita SSRF desde root.
  host=$(printf '%s' "$url" | sed -E 's#^https?://([^/]+).*#\1#; s#:.*$##' | tr 'A-Z' 'a-z')
  if ! grep -qxF "$host" "$ALLOW"; then
    rm -f "$f"; log "rechaza host no autorizado: $host"; continue
  fi

  rm -f "$f"
  log "dispara canary id=$id host=$host (fuente redactada)"
  if "$CTL" start "$id" --source-url "$url" --seconds "$SECONDS_SAMPLE" >> "$LOG" 2>&1; then
    log "canary $id lanzado"
  else
    log "canary $id FALLO al lanzar"
  fi
  exit 0   # un disparo por tick
done
exit 0
