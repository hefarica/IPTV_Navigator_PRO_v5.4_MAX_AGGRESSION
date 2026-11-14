#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# /opt/ape-pulse/ape-pulse-canary-worker.sh
#
# dispara el canary one-shot desde la COLA de zapping, PERO solo si el
# reproductor del operador no esta usando la UNICA conexion del proveedor.
#
# POR QUE EXISTE
#   /pulse corre en php-fpm como www-data. `ape-canaryctl start` escribe en
#   /etc/ara/canary y hace systemctl start => Permission denied. En vez de dar
#   sudo a www-data (podria lanzar ffmpeg contra URLs arbitrarias), el endpoint
#   SOLO deja un fichero en la cola y este worker (root) decide.
#
# QUIEN MANDA (2026-11-14)
#   El proveedor da UNA conexion por cuenta: "la lista solo puede reproducir un
#   canal por lista" (operador). El canary es DIAGNOSTICO; el operador es
#   PRODUCCION. La decision NO se toma aqui: se pregunta al unico punto de
#   decision, /opt/ape-pulse/lib/provider-gate.sh, con la escalera
#     nivel 0 reproductor > nivel 1 canary > nivel 2 JIT
#   Fail-closed: si el estado del reproductor no se puede probar, el canary NO
#   arranca.
#
# GARANTIAS
#   - Fail-closed: si falta la allowlist de hosts, NO se dispara nada.
#   - Un solo propietario: flock atomico + puerta del proveedor + espera real.
#   - TTL de cola: ficheros con mas de 120 s se descartan (un zap viejo no interesa).
#   - Dedupe por lock de canal (300 s) que ya crea el endpoint.
#   - Nunca toca /lists, /sync ni /ara.
#
# LO QUE ESTE WORKER NO PUEDE GARANTIZAR (declarado en el informe)
#   - que el proveedor respete la cuota
#   - que el player del operador no abra dos conexiones por su cuenta
#   - que un `ape-canaryctl start` manual (sin pasar por aqui) respete la puerta
#   - que ape-canary@.service no reintente por su cuenta (Restart=on-failure);
#     este worker lo COMPENSA (espera + puerta) pero el template no es suyo
# ═══════════════════════════════════════════════════════════════════════════
# Sin `-e`: la puerta devuelve 1 cuando DENIEGA, que es un veredicto normal,
# no un error. Cada fallo se trata explicitamente con `||`.
set -uo pipefail

# ── Rutas ──────────────────────────────────────────────────────────────────
# Los overrides por entorno son costura de TEST (el test corre sin red y sin
# tocar produccion). En produccion nadie los define: systemd arranca el worker
# con un entorno fijo y www-data no puede iniciar units.
QUEUE="${APE_CANARY_QUEUE:-/var/lib/ara/canary/queue}"
ALLOW="${APE_CANARY_ALLOW:-/etc/ara/canary/allowed_hosts.txt}"
CTL="${APE_CANARY_CTL:-/usr/local/bin/ape-canaryctl}"
LOG="${APE_CANARY_LOG:-/var/log/ara/canary.log}"
LIBDIR="${APE_PULSE_LIB:-/opt/ape-pulse/lib}"
MAX_TTL=120
SECONDS_SAMPLE="${APE_CANARY_SECONDS:-6}"
# Techo de espera. Debe quedar por debajo de TimeoutStartSec del unit
# (ape-pulse-canary.service) o systemd mata al worker a media espera.
WAIT_MAX="${APE_CANARY_WAIT_MAX:-400}"

log(){ printf '%s worker: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG" 2>/dev/null || true; }

# ── 0. LA PUERTA (unico punto de decision) ─────────────────────────────────
if [ ! -r "$LIBDIR/provider-gate.sh" ]; then
  # Fail-closed: sin puerta no se decide nada, y no decidir es no arrancar.
  log "skip: falta $LIBDIR/provider-gate.sh (fail-closed, no arranco nada)"
  exit 0
fi
# shellcheck source=/dev/null
. "$LIBDIR/provider-gate.sh"

# ── 1. LOCK ATOMICO ────────────────────────────────────────────────────────
# Antes: `systemctl list-units --state=active | grep -q ape-canary@` -> NO es
# atomico. Ocho workers evaluaron el grep antes de que el primero arrancase su
# unidad y se apilaron 8 ffmpeg contra un proveedor que da UNA conexion.
# Ahora: flock -n. El segundo sale en el acto, sin esperar y sin acumular.
#
# [2026-11-14 · t45] El lock va sobre el INODO DE UN DIRECTORIO del sistema, no
# sobre un fichero. Un fichero de lock se puede borrar: si alguien lo borra
# mientras un worker lo tiene, el siguiente lo RECREA y bloquea un inodo
# DISTINTO, con lo que los dos se creen duenos y vuelven los dos canarios. El
# inodo de /run no se puede borrar ni recrear, asi que la exclusion no depende
# de ningun path que un tercero pueda tocar. Se libera solo al morir el proceso.
LOCK_TARGET="${APE_CANARY_LOCK_TARGET:-/run}"
exec 9<"$LOCK_TARGET" || { log "skip: no puedo abrir el lock $LOCK_TARGET"; exit 0; }
if ! flock -n 9; then
  log "skip: otro worker tiene el lock de $LOCK_TARGET (un solo propietario)"
  exit 0
fi

# ── 2. LA DECISION ─────────────────────────────────────────────────────────
# Una sola llamada decide. El orden reproductor > canary > JIT vive dentro de
# provider_gate_decide, no aqui.
if ! DECISION="$(provider_gate_decide canary)"; then
  log "$DECISION"
  exit 0
fi
log "$DECISION"

# ── 3. COLA ────────────────────────────────────────────────────────────────
[ -d "$QUEUE" ] || exit 0
[ -r "$ALLOW" ] || { log "skip: falta $ALLOW (fail-closed)"; exit 0; }

shopt -s nullglob
for f in "$QUEUE"/*.json; do
  now=$(date +%s)
  mt=$(stat -c%Y "$f" 2>/dev/null || echo 0)
  age=$(( now - mt ))
  if [ "$age" -gt "$MAX_TTL" ]; then rm -f "$f"; log "descarta cola vieja ($age s)"; continue; fi

  id=$(node -e 'try{const j=require(process.argv[1]);process.stdout.write(String(j.id||""))}catch(e){}' "$f" 2>/dev/null || true)
  url=$(node -e 'try{const j=require(process.argv[1]);process.stdout.write(String(j.url||""))}catch(e){}' "$f" 2>/dev/null || true)
  [ -n "$id" ] && [ -n "$url" ] || { rm -f "$f"; log "descarta cola invalida"; continue; }

  # Validacion de forma.
  case "$url" in http://*|https://*) ;; *) rm -f "$f"; log "rechaza: url no http(s)"; continue ;; esac
  case "$url" in *[[:space:]]*) rm -f "$f"; log "rechaza: url con espacios"; continue ;; esac
  [ "${#url}" -le 2000 ] || { rm -f "$f"; log "rechaza: url >2000"; continue; }

  # Allowlist de hosts (fail-closed). Evita SSRF desde root.
  host=$(printf '%s' "$url" | sed -E 's#^https?://([^/]+).*#\1#; s#:.*$##' | tr 'A-Z' 'a-z')
  if ! grep -qxF "$host" "$ALLOW"; then
    rm -f "$f"; log "rechaza host no autorizado: $host"; continue
  fi

  # ── 3b. RE-DECISION INMEDIATAMENTE ANTES DE ARRANCAR ───────────────────
  # El primer veredicto se tomo al entrar; entre aquel y este momento han
  # pasado milisegundos escaneando la cola. Un zap puede haber llegado en ese
  # hueco. Se vuelve a preguntar para que la ventana de carrera sea minima.
  if ! DECISION2="$(provider_gate_decide canary)"; then
    rm -f "$f"
    log "$DECISION2 (ticket descartado antes de arrancar)"
    exit 0
  fi

  rm -f "$f"
  log "dispara canary id=$id host=$host (fuente redactada)"
  if "$CTL" start "$id" --source-url "$url" --seconds "$SECONDS_SAMPLE" >> "$LOG" 2>&1; then
    log "canary $id lanzado"
  else
    log "canary $id FALLO al lanzar"
    exit 0
  fi

  # ── 4. ESPERA REAL AL CANARY ───────────────────────────────────────────
  # Type=simple: `systemctl start` retorna al ARRANCAR, no al terminar.
  # Y hay un segundo agujero, medido en el journal el 2026-11-14: con
  # Restart=on-failure el unit pasa 10 s inactivo entre "Main process exited"
  # (01:41:27) y "Scheduled restart job" (01:41:37). El bucle viejo veia
  # `is-active` falso en ese hueco, soltaba el flock y el siguiente ticket
  # admitia otro canary mientras systemd resucitaba el anterior -> 4 unidades
  # y 8 ffmpeg contra UNA conexion.
  # provider_gate_wait_canary_gone cierra ese hueco: tras verla caida espera
  # PG_SETTLE s y vuelve a mirar; si resucito, sigue esperando.
  T0=$(date -u +%s)
  if provider_gate_wait_canary_gone "$WAIT_MAX"; then
    log "canary $id terminado tras $(( $(date -u +%s) - T0 ))s (confirmado tras asentamiento)"
  else
    log "canary $id NO confirmado tras $(( $(date -u +%s) - T0 ))s — suelto con la puerta cerrada"
  fi
  exit 0   # un disparo por tick
done
exit 0