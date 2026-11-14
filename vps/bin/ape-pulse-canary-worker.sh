#!/usr/bin/env bash

# ── LOCK ATOMICO (2026-11-14) ─────────────────────────────────────────────
# Antes: `systemctl list-units --state=active | grep -q ape-canary@` -> NO es
# atomico. Ocho workers evaluaron el grep antes de que el primero arrancase su
# unidad y se apilaron 8 ffmpeg contra un proveedor que da UNA conexion.
# Ahora: flock -n. El segundo sale en el acto, sin esperar y sin acumular.
exec 9>/run/ape-canary.lock
if ! flock -n 9; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) worker: skip (ya hay uno con el lock)" >> /var/log/ape-canary.log 2>/dev/null || true
  exit 0
fi

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


# ── PRIORIDAD DEL REPRODUCTOR ─────────────────────────────────────────────
# MEDIDO 2026-11-14: el proveedor permite UNA conexion por cuenta. El canary
# lanza ffmpeg contra el mismo proveedor; si el operador ve al mismo tiempo,
# le roba la conexion y su siguiente zap recibe 461 -> el player ve 502.
# Si hubo un zap en los ultimos PLAYER_WINDOW segundos, el canary NO arranca.
# El canary es diagnostico; el operador es produccion. Manda el operador.
PLAYER_WINDOW="${APE_CANARY_PLAYER_WINDOW:-180}"
PLEG=/var/log/nginx/playlist_access.log
if [ -r "$PLEG" ]; then
  ULT=$(tail -n 400 "$PLEG" 2>/dev/null | awk '/\/pulse\// && /z=1/ {print $4}' | tail -n 1)
  if [ -n "$ULT" ]; then
    # $4 es [dd/Mmm/aaaa:HH:MM:SS -- convertir a epoch
    ISO=$(printf '%s' "$ULT" | tr -d '[]' | sed 's~\([0-9][0-9]\/\)\([A-Za-z][a-z][a-z]\)\/\([0-9]\{4\}\):\1~\3-XX-\1 \1~')
        MES=$(printf '%s' "$ULT" | cut -d/ -f2)
    case "$MES" in
      Jan) MESNUM=01;; Feb) MESNUM=02;; Mar) MESNUM=03;; Apr) MESNUM=04;;
      May) MESNUM=05;; Jun) MESNUM=06;; Jul) MESNUM=07;; Aug) MESNUM=08;;
      Sep) MESNUM=09;; Oct) MESNUM=10;; Nov) MESNUM=11;; Dec) MESNUM=12;;
      *)   MESNUM=00;;
    esac
    FDIA=$(printf '%s' "$ULT" | cut -d/ -f1)
    FANO=$(printf '%s' "$ULT" | cut -d/ -f3 | cut -d: -f1)
    FHMS=$(printf '%s' "$ULT" | cut -d: -f2-4)
    EPOCA=$(date -u -d "$FANO-$MESNUM-$FDIA $FHMS" +%s 2>/dev/null || echo 0)

    AHORA=$(date -u +%s)
    if [ "$EPOCA" -gt 0 ] && [ $((AHORA - EPOCA)) -lt "$PLAYER_WINDOW" ]; then
      log "skip: reproductor activo hace $((AHORA - EPOCA))s (< ${PLAYER_WINDOW}s) — le dejo la conexion"
      exit 0
    fi
  fi
fi

# ── GUARDA DE NO-INTERFERENCIA CON EL JIT ────────────────────────────────────
# MEDIDO 2026-11-09: un canary de 6 s de clip 4K consume cpu_seconds=76,
# wall_seconds=194, cpu_pct_avg=39.2 — 32x tiempo real. El JIT es single-slot y
# en 3 vCPU un FHD ya usa ~2 nucleos. Si coinciden, compiten por ffmpeg y por la
# conexion al proveedor, y eso SI se ve como freeze en el player.
#
# Por eso el canary NO dispara mientras el JIT tenga un ffmpeg sirviendo. Se
# distingue por el cwd del proceso: el JIT lanza ffmpeg con cwd=/dev/shm/ape-jit/<id>,
# el canary con cwd=/var/lib/ara/canary/<id>. Asi esta guarda no confunde su
# propio ffmpeg con el del JIT.
jit_busy() {
  local p pid cmd cwd
  for p in /proc/[0-9]*; do
    pid="${p#/proc/}"
    case "$pid" in *[!0-9]*|'') continue ;; esac
    # El redirect <"$p/cmdline" falla si el proceso muere entre el glob de
    # /proc y la lectura; el mensaje lo imprime el SHELL antes de que tr corra,
    # asi que el 2>/dev/null de tr no lo tapa. Medido 2026-11-13: 4 errores por
    # ejecucion, ~180/hora en el journal, con el worker funcionando igual.
    # Se comprueba legibilidad ANTES de redirigir: sin carrera y sin ruido.
    # Se agrupa el redirect DENTRO del silencio: el mensaje "No such file" lo
    # imprime el shell al abrir el fichero, antes de que tr exista, asi que un
    # 2>/dev/null puesto en tr no lo tapa. Con { ...; } 2>/dev/null si.
    cmd="$( { tr '\0' ' ' < "$p/cmdline"; } 2>/dev/null )" || continue
    [ -n "$cmd" ] || continue
    case "$cmd" in *ffmpeg*) ;; *) continue ;; esac
    cwd="$(readlink "$p/cwd" 2>/dev/null)" || continue
    case "$cwd" in /dev/shm/ape-jit/*) return 0 ;; esac
  done
  return 1
}
if jit_busy; then
  log "skip: JIT sirviendo (ffmpeg en /dev/shm/ape-jit) — no se compite por CPU ni proveedor"
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

  # ── ESPERA AL CANARY (2026-11-14) ───────────────────────────────────
  # Type=simple: `systemctl start` retorna al ARRANCAR, no al terminar.
  # Sin esta espera el worker sale, suelta el flock y el siguiente ticket
  # lanza otro canary. Con 9 tickets se apilaron 10 ffmpeg contra UNA
  # conexion del proveedor -> 461 -> 502 para el operador.
  UNIDAD="ape-canary@${id}.service"
  T0=$(date -u +%s)
  LIMITE=$(( SECONDS_SAMPLE + 240 ))
  while systemctl is-active --quiet "$UNIDAD" 2>/dev/null; do
    [ $(( $(date -u +%s) - T0 )) -gt "$LIMITE" ] && {
      log "espera agotada tras ${LIMITE}s en $UNIDAD"; break;
    }
    sleep 3
  done
  log "canary $id terminado tras $(( $(date -u +%s) - T0 ))s"
  exit 0   # un disparo por tick
done
exit 0
