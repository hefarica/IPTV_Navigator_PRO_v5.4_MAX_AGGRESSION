#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# /opt/ape-pulse/lib/provider-gate.sh   (v3 — repair round 2 / t45)
#
# PUNTO UNICO DE DECISION de quien puede tocar la UNICA conexion del proveedor.
# Ningun proceso decide por su cuenta: se pregunta aqui.
#
# EL PROVEEDOR DA UNA CONEXION POR CUENTA
#   Palabras del operador: "la lista solo puede reproducir un canal por lista".
#     1. el reproductor del operador (pulse.php -> OTT Navigator)
#     2. el canary (ffmpeg diagnostico)
#     3. el JIT (ffmpeg bajo demanda)
#
# ESCALERA (menor numero = mas prioridad; no se negocia)
#   nivel 0  player   reproductor del operador  -> manda SIEMPRE
#   nivel 1  canary   diagnostico               -> solo si el player esta idle
#   nivel 2  jit      bajo demanda              -> solo si player y canary idle
#
# QUE ES "PLAYER ACTIVO" (dos senales, la que gane en el tiempo)
#   (a) ZAP: GET /pulse/<id>.m3u8 con &z=1.
#   (b) LATIDO: POST /prisma/api/conviva-event.php cada ~30.5 s mientras
#       reproduce. MEDIDO 2026-11-14: 01:45:29 -> 01:57:46 sin un solo hueco,
#       con los zaps parados a las 01:51:37.
#   El zap marca el INICIO de ver, no la continuacion: con solo el zap el gate
#   daba ALLOW a los 180 s y el canary le robaba la conexion a un operador que
#   seguia viendo.
#
# FAIL-CLOSED (todo lo que sigue es "no puedo probarlo" => DENY)
#   - log ausente o ilegible
#   - log de 0 lineas, o log sin escrituras recientes (mtime mas viejo que la
#     ventana): no se puede probar que el player este idle
#   - fecha imparseable, o epoch imposible
#   - reloj no fiable: age < -PG_CLOCK_SKEW (una senal "del futuro")
#   - la consulta de unidades canary falla (exit != 0): no se confunde
#     "0 unidades" (exit 0, salida vacia, legitimo) con "consulta rota"
#   - el autotest de fecha/zona del arranque no cuadra
#
# ESCOTILLA DE INSTALACION NUEVA
#   PG_ALLOW_EMPTY_LOG=1 acepta un log de 0 lineas como "player idle". Solo vale
#   para el arranque de una instalacion sin trafico todavia. NUNCA en regimen.
#   Si se usa, el motivo queda escrito en el registro.
#
# LO QUE ESTE GATE NO PUEDE GARANTIZAR (declarado, no prometido)
#   - que el proveedor respete la cuota
#   - que el player no abra dos conexiones por su cuenta
#   - que un `ape-canaryctl start` manual pase por aqui
#   - que ape-canary@.service no reintente (Restart=on-failure; StartLimitBurst=3)
#   - que el latido QoE se emita siempre
#   - que el log rote: si rota, la frescura lo detecta y DENIEGA (fail-closed),
#     lo que degrada a "el canary no corre" tras cada rotacion, no a "roba la
#     conexion"
# ═══════════════════════════════════════════════════════════════════════════

# ── Configuracion ──────────────────────────────────────────────────────────
# Los overrides por entorno existen SOLO como costura de test (el test corre
# sin red y sin tocar produccion). En produccion nadie los define.
: "${PG_PLAYER_LOG:=/var/log/nginx/playlist_access.log}"
: "${PG_PLAYER_WINDOW:=180}"
: "${PG_PLAYER_TAIL:=5000}"
: "${PG_SYSTEMCTL:=systemctl}"
: "${PG_CANARYCTL:=/usr/local/bin/ape-canaryctl}"
: "${PG_CANARY_UNIT_GLOB:=ape-canary@*}"
: "${PG_JIT_ROOT:=/dev/shm/ape-jit}"
: "${PG_LOG:=/var/log/ara/provider-gate.log}"
: "${PG_LOG_MAX:=1048576}"
: "${PG_SETTLE:=15}"
: "${PG_START_CONFIRM:=2}"
: "${PG_CLOCK_SKEW:=5}"
: "${PG_ALLOW_EMPTY_LOG:=0}"
# Mutex que NO depende de un fichero creado por mi: se bloquea el INODO DE UN
# DIRECTORIO que no se puede borrar. Si alguien borra un fichero de lock, dos
# procesos acaban bloqueando inodos distintos y el mutex desaparece; con un
# directorio del sistema eso no puede pasar.
: "${PG_MUTEX_TARGET:=/run}"
: "${PG_MUTEX_HELD:=0}"

PG_LEVEL_PLAYER=0
PG_LEVEL_CANARY=1
PG_LEVEL_JIT=2

pg_now() { date -u +%s; }
pg_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

pg_rotate_log() {
  local sz
  case "$PG_LOG" in ''|/dev/null) return 0 ;; esac
  [ -f "$PG_LOG" ] || return 0
  sz="$(stat -c%s "$PG_LOG" 2>/dev/null || echo 0)"
  case "$sz" in ''|*[!0-9]*) return 0 ;; esac
  [ "$sz" -gt "$PG_LOG_MAX" ] || return 0
  mv -f "$PG_LOG" "$PG_LOG.1" 2>/dev/null || true
}

# Solo fichero (con rotacion). Nunca escribe en stdout: el worker captura
# stdout de decide y no se puede contaminar.
pg_record() {
  case "$PG_LOG" in ''|/dev/null) return 0 ;; esac
  pg_rotate_log
  { printf '%s %s\n' "$(pg_utc)" "$*" >> "$PG_LOG"; } 2>/dev/null || true
}

pg_log() { printf '%s gate: %s\n' "$(pg_utc)" "$*"; pg_record "gate: $*"; }

# ── Mutex (API de SCOPE LLAMANTE, no del camino de decision) ───────────────
# MEDIDO en el dry-run: NO se puede tomar el mutex dentro de decide(). El worker
# invoca DECISION="$(provider_gate_decide canary)" y la command substitution
# crea un subshell: el fd se abre y se cierra con el subshell, y flock se
# libera al instante. Un mutex que se libera antes de usarse no protege nada.
# Por eso se expone como API que el LLAMANTE debe invocar en su propio proceso:
#     pg_mutex_acquire   # 0 = tomado por mi
#     pg_mutex_release   # lo suelta
# Cablearlo en el worker son 2 lineas, pero el worker esta EXCLUIDO de este
# contrato (necesita decision humana). Ver informe, seccion de reparacion.
# flock sobre el inodo de un DIRECTORIO del sistema. systemd tambien rechazaria
# un segundo `systemd-run --unit=ape-canary-mutex`, pero eso deja una unidad
# transitoria que hay que limpiar y que, si el dueno muere mal, bloquea para
# siempre. El flock sobre directorio lo libera el kernel al morir el proceso.
pg_mutex_acquire() {
  [ "$PG_MUTEX_HELD" = "1" ] && return 0
  if ! { exec 200<"$PG_MUTEX_TARGET"; } 2>/dev/null; then
    pg_log "mutex: no puedo abrir $PG_MUTEX_TARGET"
    return 1
  fi
  if ! flock -n 200 2>/dev/null; then
    exec 200<&- 2>/dev/null || true
    return 1
  fi
  PG_MUTEX_HELD=1
  return 0
}

pg_mutex_release() {
  [ "$PG_MUTEX_HELD" = "1" ] || return 0
  exec 200<&- 2>/dev/null || true
  PG_MUTEX_HELD=0
  return 0
}

# ── Fecha / zona ───────────────────────────────────────────────────────────
pg_month_to_num() {
  case "$1" in
    Jan) printf '01';; Feb) printf '02';; Mar) printf '03';; Apr) printf '04';;
    May) printf '05';; Jun) printf '06';; Jul) printf '07';; Aug) printf '08';;
    Sep) printf '09';; Oct) printf '10';; Nov) printf '11';; Dec) printf '12';;
    *)   return 1 ;;
  esac
}

# Offset de nginx ('+0000', '-0500') -> segundos este de UTC. Falla si no vale.
pg_offset_seconds() {
  local o="$1" sign hh mm
  case "$o" in
    [+-][0-9][0-9][0-9][0-9]) ;;
    *) return 1 ;;
  esac
  sign="${o%"${o#?}"}"
  hh="${o#?}"; hh="${hh%??}"
  mm="${o#???}"
  hh=$((10#$hh)); mm=$((10#$mm))
  [ "$hh" -le 23 ] || return 1
  [ "$mm" -le 59 ] || return 1
  if [ "$sign" = "-" ]; then
    printf '%s' "-$(( hh*3600 + mm*60 ))"
  else
    printf '%s' "$(( hh*3600 + mm*60 ))"
  fi
}

# '14/Nov/2026:01:41:27' [+0000] -> epoch UTC.
# El offset del campo $5 se aplica si se pasa: epoch = base_utc - offset_seg.
pg_epoch_from_nginx_ts() {
  local ts day rest mon rest2 year hms monnum ep off offs
  ts="${1#\[}"
  [ -n "$ts" ] || return 1
  off="${2:-}"; off="${off#\[}"; off="${off%\]}"
  day="${ts%%/*}"; rest="${ts#*/}"
  [ "$rest" != "$ts" ] || return 1
  mon="${rest%%/*}"; rest2="${rest#*/}"
  [ "$rest2" != "$rest" ] || return 1
  year="${rest2%%:*}"; hms="${rest2#*:}"
  [ "$hms" != "$rest2" ] || return 1
  case "$day"  in ''|*[!0-9]*) return 1 ;; esac
  case "$year" in ''|*[!0-9]*) return 1 ;; esac
  [ "${#year}" -eq 4 ] || return 1
  case "$hms" in [0-9][0-9]:[0-9][0-9]:[0-9][0-9]) ;; *) return 1 ;; esac
  monnum="$(pg_month_to_num "$mon")" || return 1
  ep="$(TZ=UTC date -u -d "$year-$monnum-$day $hms" +%s 2>/dev/null)" || return 1
  case "$ep" in ''|*[!0-9]*) return 1 ;; esac
  if [ -n "$off" ]; then
    offs="$(pg_offset_seconds "$off")" || return 1
    ep=$(( ep - offs ))
  fi
  [ "$ep" -gt 1600000000 ] || return 1
  printf '%s' "$ep"
}

# Autotest de fecha/zona al arrancar el gate. Si no cuadra, todo DENY.
PG_SELFTEST=ok
pg_selftest() {
  local got want_c want_off
  got="$(pg_epoch_from_nginx_ts '01/Jan/2024:00:00:00' '+0000')"
  want_c=1704067200
  if [ "$got" != "$want_c" ]; then
    PG_SELFTEST="fail_zona: 01/Jan/2024:00:00:00 +0000 -> [$got], esperado $want_c"
    return 1
  fi
  got="$(pg_epoch_from_nginx_ts '01/Jan/2024:00:00:00' '-0500')"
  want_off=$(( want_c + 18000 ))
  if [ "$got" != "$want_off" ]; then
    PG_SELFTEST="fail_offset: -0500 -> [$got], esperado $want_off"
    return 1
  fi
  if [ "$(TZ=UTC date -u -d @1704067200 +%Y-%m-%dT%H:%M:%SZ)" != "2024-01-01T00:00:00Z" ]; then
    PG_SELFTEST="fail_utc: el entorno no calcula UTC como se espera"
    return 1
  fi
  PG_SELFTEST=ok
  return 0
}

# ── Senal del reproductor ──────────────────────────────────────────────────
# Salidas: "<epoch>:<zap|conviva>" | "" (idle CONOCIDO) | "ERR" (FAIL-CLOSED)
pg_player_last_seen() {
  local zc zoff cc coff ze ce sz mt age_log
  if [ ! -r "$PG_PLAYER_LOG" ]; then printf 'ERR'; return 0; fi

  # Frescura: un log sin escrituras recientes no prueba nada. Un log reciente
  # sin lineas de player SI prueba "idle".
  sz="$(stat -c%s "$PG_PLAYER_LOG" 2>/dev/null || echo '')"
  mt="$(stat -c%Y "$PG_PLAYER_LOG" 2>/dev/null || echo '')"
  case "$sz" in ''|*[!0-9]*) printf 'ERR'; return 0 ;; esac
  case "$mt" in ''|*[!0-9]*) printf 'ERR'; return 0 ;; esac
  if [ "$sz" -eq 0 ]; then
    if [ "$PG_ALLOW_EMPTY_LOG" = "1" ]; then
      pg_record "escotilla: PG_ALLOW_EMPTY_LOG=1 con log de 0 bytes — se asume idle de instalacion nueva"
      printf ''; return 0
    fi
    printf 'ERR'; return 0
  fi
  age_log=$(( $(pg_now) - mt ))
  if [ "$age_log" -gt "$PG_PLAYER_WINDOW" ]; then
    printf 'ERR'; return 0
  fi

  zc=""; zoff=""; cc=""; coff=""
  read -r zc zoff <<EOF
$(tail -n "$PG_PLAYER_TAIL" "$PG_PLAYER_LOG" 2>/dev/null \
  | awk '/\/pulse\// && /[?&]z=1([^0-9]|$)/ {ts=$4; off=$5; gsub(/[\[\]]/,"",ts); print ts, off}' | tail -n 1)
EOF
  read -r cc coff <<EOF
$(tail -n "$PG_PLAYER_TAIL" "$PG_PLAYER_LOG" 2>/dev/null \
  | awk '/conviva-event/ {ts=$4; off=$5; gsub(/[\[\]]/,"",ts); print ts, off}' | tail -n 1)
EOF

  ze=""; ce=""
  if [ -n "${zc:-}" ]; then
    ze="$(pg_epoch_from_nginx_ts "$zc" "${zoff:-}")" || { printf 'ERR'; return 0; }
  fi
  if [ -n "${cc:-}" ]; then
    ce="$(pg_epoch_from_nginx_ts "$cc" "${coff:-}")" || { printf 'ERR'; return 0; }
  fi
  if [ -z "$ze" ] && [ -z "$ce" ]; then printf ''; return 0; fi
  if [ -z "$ce" ] || { [ -n "$ze" ] && [ "$ze" -ge "$ce" ]; }; then
    printf '%s:zap' "$ze"
  else
    printf '%s:conviva' "$ce"
  fi
}

# ── Estado de las unidades canary ──────────────────────────────────────────
# UNA sola llamada a systemctl. Vivos = active/activating/reloading/deactivating
# ('activating' es la ventana de auto-restart de Restart=on-failure).
# Salidas: lista | "" (0 unidades con exit 0: LEGITIMO) | "ERR" (consulta rota)
pg_canary_live_units() {
  local out rc
  out="$("$PG_SYSTEMCTL" list-units "$PG_CANARY_UNIT_GLOB" --all --plain --no-legend \
         --state=active,activating,reloading,deactivating 2>/dev/null)"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    printf 'ERR'; return 0
  fi
  printf '%s' "$(printf '%s\n' "$out" | awk '{print $1}' \
    | grep -E '^ape-canary@[^ ]+\.service$' | tr '\n' ' ')"
}

# Limpieza de unidades fallidas: sin esto se acumulan (medido: 28 failed).
# Se invoca desde provider_gate_decide, es decir en CADA corrida del gate.
pg_reset_failed() {
  "$PG_SYSTEMCTL" reset-failed "$PG_CANARY_UNIT_GLOB" >/dev/null 2>&1 || true
}

pg_jit_pids() {
  local p pid cmd cwd
  for p in /proc/[0-9]*; do
    pid="${p#/proc/}"
    case "$pid" in *[!0-9]*|'') continue ;; esac
    cmd="$( { tr '\0' ' ' < "$p/cmdline"; } 2>/dev/null )" || continue
    [ -n "$cmd" ] || continue
    case "$cmd" in *ffmpeg*) ;; *) continue ;; esac
    cwd="$(readlink "$p/cwd" 2>/dev/null)" || continue
    case "$cwd" in "$PG_JIT_ROOT"/*) printf '%s ' "$pid" ;; esac
  done
}

pg_level_of() {
  case "$1" in
    player) printf '%s' "$PG_LEVEL_PLAYER" ;;
    canary) printf '%s' "$PG_LEVEL_CANARY" ;;
    jit)    printf '%s' "$PG_LEVEL_JIT" ;;
    *)      return 1 ;;
  esac
}

pg_unit_id() {
  local u="${1#ape-canary@}"
  printf '%s' "${u%.service}"
}

# ── LA DECISION ────────────────────────────────────────────────────────────
provider_gate_decide() {
  local claimant="${1:-}" level now seen epoch signal age canary_units jit_pids
  local decision reason line

  level="$(pg_level_of "$claimant")" || {
    line="PROVIDER_GATE decision=DENY claimant=${claimant:-<empty>} level=- reason=claimant_invalid ts=$(pg_utc)"
    printf '%s\n' "$line"; pg_record "decision: $line"; return 1
  }

  now="$(pg_now)"
  seen="$(pg_player_last_seen)"
  case "$seen" in
    ERR) epoch=""; signal="unknown"; age="unknown" ;;
    '')  epoch=""; signal="none";    age="none" ;;
    *:*) epoch="${seen%%:*}"; signal="${seen##*:}"; age=$(( now - epoch )) ;;
    *)   epoch=""; signal="unknown"; age="unknown" ;;
  esac

  canary_units="$(pg_canary_live_units)"
  jit_pids="$(pg_jit_pids)"

  if [ "$claimant" = "player" ]; then
    decision=ALLOW; reason=player_is_top_of_ladder
  elif [ "$PG_SELFTEST" != "ok" ]; then
    decision=DENY; reason=gate_selftest_failed
  elif [ "$signal" = "unknown" ]; then
    decision=DENY; reason=player_state_unknown_failclosed
  elif [ "$age" != "none" ] && [ "$age" -lt "-$PG_CLOCK_SKEW" ]; then
    # Senal "del futuro": reloj no fiable, no se puede probar nada.
    decision=DENY; reason=player_state_unknown_failclosed
  elif [ "$age" != "none" ] && [ "$age" -lt "$PG_PLAYER_WINDOW" ]; then
    decision=DENY; reason=player_active
  elif [ "$canary_units" = "ERR" ]; then
    decision=DENY; reason=canary_state_unknown_failclosed
  elif [ -n "$jit_pids" ]; then
    decision=DENY; reason=jit_serving_player_path
  elif [ "$claimant" = "canary" ] && [ -n "$canary_units" ]; then
    decision=DENY; reason=canary_already_live
  elif [ "$claimant" = "jit" ] && [ -n "$canary_units" ]; then
    decision=DENY; reason=canary_holds_connection
  else
    decision=ALLOW; reason=idle_admit
  fi

  line="PROVIDER_GATE decision=$decision claimant=$claimant level=$level reason=$reason player_age_s=$age player_signal=$signal player_window_s=$PG_PLAYER_WINDOW canary_live=\"$canary_units\" jit_pids=\"$jit_pids\" selftest=$PG_SELFTEST ts=$(pg_utc)"
  printf '%s\n' "$line"
  pg_record "decision: $line"

  # Limpieza de unidades fallidas en CADA corrida (criterio 6). Antes vivia
  # solo en el camino de espera, y con la puerta denegando todo ese camino no
  # se recorre: las 28 unidades failed seguian acumuladas. Medido 2026-11-14.
  # reset-failed sobre unidades activas es no-op: no toca al canary en vuelo.
  pg_reset_failed
  [ "$decision" = "ALLOW" ] && return 0
  return 1
}

# ── Espera, confirmacion de arranque y mitigacion ──────────────────────────
# 1) CONFIRMA que la unidad aparece en <= PG_START_CONFIRM s tras el `$CTL
#    start`. Si no aparece: se intenta `ape-canaryctl stop` sobre la unidad no
#    muerta que haya quedado y se DENIEGA (no se asume que arranco).
# 2) Espera a que desaparezca DE VERDAD (asentamiento: la ventana de 10 s de
#    RestartSec enmascaraba el fin y el siguiente ticket apilaba otro canary).
# 3) MITIGA el caso borde: si el reproductor se activa con el canary vivo, se
#    detiene el canary (es diagnostico; el operador es produccion).
# 4) Limpia unidades fallidas al terminar.
# devuelve 0 = confirmado y terminado, 1 = no confirmado
provider_gate_wait_canary_gone() {
  local limit="$1" t0 now seen age units id all tc dead

  t0="$(pg_now)"

  # ── fase 1: confirmacion de arranque ──────────────────────────────────
  tc="$(pg_now)"; dead=""
  while :; do
    units="$(pg_canary_live_units)"
    if [ -n "$units" ] && [ "$units" != "ERR" ]; then break; fi
    if [ $(( $(pg_now) - tc )) -ge "$PG_START_CONFIRM" ]; then dead="yes"; break; fi
    sleep 0.2
  done
  if [ -n "$dead" ]; then
    all="$("$PG_SYSTEMCTL" list-units "$PG_CANARY_UNIT_GLOB" --all --plain --no-legend 2>/dev/null \
          | awk '$1 ~ /^ape-canary@.*[.]service$/ {print $1}' | head -n 1)"
    if [ -n "$all" ]; then
      id="$(pg_unit_id "$all")"
      pg_log "MITIGACION: la unidad no aparecio en ${PG_START_CONFIRM}s; ape-canaryctl stop $id y DENY"
      "$PG_CANARYCTL" stop "$id" >/dev/null 2>&1 || true
    fi
    pg_log "reason=canary_start_not_confirmed tras ${PG_START_CONFIRM}s"
    pg_reset_failed
    return 1
  fi

  # ── fases 2 y 3: espera con asentamiento y mitigacion ────────────────
  while :; do
    now="$(pg_now)"
    if [ $(( now - t0 )) -gt "$limit" ]; then
      pg_log "espera agotada tras ${limit}s: hay canary vivo, no suelto la conexion"
      pg_reset_failed
      return 1
    fi

    units="$(pg_canary_live_units)"
    if [ "$units" = "ERR" ]; then
      pg_log "consulta de unidades rota durante la espera; no afirmo que termino"
      pg_reset_failed
      return 1
    fi

    if [ -n "$units" ]; then
      seen="$(pg_player_last_seen)"
      case "$seen" in
        ''|ERR) ;;
        *:*)
          age=$(( now - ${seen%%:*} ))
          if [ "$age" -ge 0 ] && [ "$age" -lt "$PG_PLAYER_WINDOW" ]; then
            id="$(pg_unit_id "${units%% *}")"
            pg_log "MITIGACION: reproductor activo (${age}s) con canary vivo; ape-canaryctl stop $id"
            "$PG_CANARYCTL" stop "$id" >/dev/null 2>&1 || true
          fi
          ;;
      esac
      sleep 3
      continue
    fi

    sleep "$PG_SETTLE"
    units="$(pg_canary_live_units)"
    if [ -n "$units" ] && [ "$units" != "ERR" ]; then
      pg_log "tras ${PG_SETTLE}s de asentamiento el canary sigue/volvio vivo: no suelto la conexion"
      continue
    fi
    pg_reset_failed
    return 0
  done
}

# Autotest al cargar: si falla, todo DENY (fail-closed).
pg_selftest || pg_record "SELFTEST FALLIDO: $PG_SELFTEST"
