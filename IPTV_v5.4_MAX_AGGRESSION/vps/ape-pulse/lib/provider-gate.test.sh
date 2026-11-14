#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# /opt/ape-pulse/lib/provider-gate.test.sh   (v3 — repair round 2 / t45)
#
# Test SIN RED del gate de exclusion mutua del proveedor.
#   - no abre sockets, no habla con el proveedor, no toca produccion
#   - usa systemctl FALSO y ape-canaryctl FALSO (unidades systemd falsas)
#   - mide la concurrencia REAL de propietarios por interseccion de eventos
#   - el mutex se toma sobre un directorio TEMPORAL, nunca sobre /run, para que
#     el test no bloquee al worker real del VPS
#
# uso:
#   provider-gate.test.sh                     -> suite completa; exit 0 = verde
#   provider-gate.test.sh --negative-control  -> MISMA suite con el mutex
#                                                quitado; exit 1 = el detector
#                                                vio >=2 propietarios a la vez
# ═══════════════════════════════════════════════════════════════════════════
export LC_ALL=C
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER="${APE_WORKER_UNDER_TEST:-/opt/ape-pulse/ape-pulse-canary-worker.sh}"
MODE="${1:-}"

T="$(mktemp -d /tmp/pgtest.XXXXXX)" || exit 9
trap 'rm -rf "$T"' EXIT

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf 'PASS  %s\n' "$*"; }
no() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n' "$*"; }
chk_eq() { if [ "$2" = "$3" ]; then ok "$1 [$2]"; else no "$1 (esperado [$3], obtenido [$2])"; fi; }
chk_contains() { case "$2" in *"$3"*) ok "$1";; *) no "$1 (no contiene [$3] en [$2])";; esac; }

# ── entorno falso ──────────────────────────────────────────────────────────
export TESTROOT="$T"
mkdir -p "$T/bin" "$T/units" "$T/queue" "$T/jit/xyz" "$T/logs" "$T/mtx"
export PATH="$T/bin:$PATH"

# systemctl falso: estado por fichero. Respeta --state=... (si no, una unidad
# 'inactive' contaria como viva) y puede simular una consulta ROTA.
cat > "$T/bin/systemctl" <<'EOS'
#!/usr/bin/env bash
U="$TESTROOT/units"
cmd="${1:-}"; shift || true
printf '%s\n' "$cmd" >> "$TESTROOT/calls.log" 2>/dev/null || true
WANT="ALL"
case "$cmd" in
  list-units)
    while [ $# -gt 0 ]; do
      case "$1" in
        --state=*) WANT="$(printf '%s' "${1#--state=}" | tr ',' ' ')" ;;
      esac
      shift
    done
    if [ "${FAKE_SYSTEMCTL_FAIL:-0}" = "1" ]; then
      echo "Failed to connect to bus: No such file or directory" >&2
      exit 1
    fi
    for f in "$U"/*.state; do
      [ -e "$f" ] || continue
      st="$(cat "$f")"
      want="no"; [ "$WANT" = "ALL" ] && want="yes"
      for w in $WANT; do [ "$st" = "$w" ] && want="yes"; done
      [ "$want" = "yes" ] || continue
      printf '%s loaded %s\n' "$(basename "$f" .state)" "$st"
    done
    ;;
  show)
    unit=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -p) shift; shift ;;
        --value) shift ;;
        *) unit="$1"; shift ;;
      esac
    done
    if [ -n "$unit" ] && [ -f "$U/$unit.state" ]; then cat "$U/$unit.state"; else echo "inactive"; fi
    ;;
  reset-failed) exit 0 ;;
  is-active)
    unit=""
    while [ $# -gt 0 ]; do case "$1" in --quiet) shift ;; *) unit="$1"; shift ;; esac; done
    if [ -n "$unit" ] && [ -f "$U/$unit.state" ] && [ "$(cat "$U/$unit.state")" = "active" ]; then exit 0; fi
    exit 3
    ;;
  *) exit 0 ;;
esac
EOS
chmod +x "$T/bin/systemctl"

# ape-canaryctl falso: reproduce Type=simple (retorna al ARRANCAR, no al terminar)
cat > "$T/bin/ape-canaryctl" <<'EOS'
#!/usr/bin/env bash
R="$TESTROOT"
verb="${1:-}"; id="${2:-x}"; secs=3
while [ $# -gt 0 ]; do case "$1" in --seconds) secs="${2:-3}"; shift 2 ;; *) shift ;; esac; done
if [ "$verb" = "stop" ]; then
  printf 'stop %s\n' "$id" >> "$R/stop_called.log"
  echo inactive > "$R/units/ape-canary@${id}.service.state" 2>/dev/null || true
  exit 0
fi
U="ape-canary@${id}.service"
echo active > "$R/units/$U.state"
printf 'S %s %s\n' "$(date +%s%N)" "$id" >> "$R/events.log"
(
  sleep "$secs"
  echo inactive > "$R/units/$U.state"
  if [ "${APE_FAKE_RESTART:-0}" = "1" ]; then
    sleep 1
    echo active > "$R/units/$U.state"
    printf 'R %s %s\n' "$(date +%s%N)" "$id" >> "$R/events.log"
    sleep 1
    echo inactive > "$R/units/$U.state"
  fi
  printf 'E %s %s\n' "$(date +%s%N)" "$id" >> "$R/events.log"
) &
exit 0
EOS
chmod +x "$T/bin/ape-canaryctl"

# CTL que NUNCA hace visible la unidad: sirve para probar la confirmacion de
# arranque (fase 1 de la espera).
cat > "$T/bin/ape-canaryctl-nostart" <<'EOS'
#!/usr/bin/env bash
R="$TESTROOT"
if [ "${1:-}" = "stop" ]; then printf 'stop %s\n' "${2:-?}" >> "$R/stop_called.log"; else echo failed > "$R/units/ape-canary@nostart.service.state"; fi
exit 0
EOS
chmod +x "$T/bin/ape-canaryctl-nostart"

printf 'line.tivi-ott.net\n' > "$T/allowed_hosts.txt"
: > "$T/access.log"
: > "$T/events.log"
: > "$T/stop_called.log"

max_owners() {
  if [ ! -s "$T/events.log" ]; then echo 0; return; fi
  sort -k2,2n "$T/events.log" \
    | awk '{c += ($1=="E" ? -1 : ($1=="R" ? 0 : 1)); if (c>m) m=c} END{printf "%d", m+0}'
}

# nginx SIEMPRE escribe. Un log reciente y sin lineas de player prueba "idle";
# un log vacio NO prueba nada. El keepalive reproduce la realidad del log.
keepalive() {
  local ts
  ts="$(date -u '+%d/%b/%Y:%H:%M:%S')"
  printf '10.0.0.9 - - [%s +0000] "GET /favicon.ico HTTP/1.1" 404 0 "-" "probe" rt=0.001\n' "$ts" >> "$T/access.log"
}
reset_scenario() {
  : > "$T/events.log"
  : > "$T/stop_called.log"
  rm -f "$T"/units/*.state 2>/dev/null
  : > "$T/access.log"
  keepalive
  pg_mutex_release 2>/dev/null || true
}

gate_env() {
  export PG_PLAYER_LOG="$T/access.log"
  export PG_PLAYER_WINDOW=180
  export PG_PLAYER_TAIL=5000
  export PG_SYSTEMCTL=systemctl
  export PG_CANARYCTL="$T/bin/ape-canaryctl"
  export PG_CANARY_UNIT_GLOB='ape-canary@*'
  export PG_JIT_ROOT="$T/jit"
  export PG_LOG="$T/logs/provider-gate.log"
  export PG_SETTLE=2
  export PG_START_CONFIRM=2
  export PG_CLOCK_SKEW=5
  export PG_ALLOW_EMPTY_LOG=0
  export PG_MUTEX_TARGET="$T/mtx"
  unset FAKE_SYSTEMCTL_FAIL 2>/dev/null || true
}

write_zap() {
  local age="$1" ts
  ts="$(date -u -d "@$(( $(date -u +%s) - age ))" '+%d/%b/%Y:%H:%M:%S')"
  printf '10.0.0.1 - - [%s +0000] "GET /pulse/1098502.m3u8?u=http%%3A%%2F%%2Fx&z=1 HTTP/1.1" 200 322 "-" "OTT Navigator" rt=0.611\n' "$ts" >> "$T/access.log"
}

write_conviva() {
  local age="$1" ts
  ts="$(date -u -d "@$(( $(date -u +%s) - age ))" '+%d/%b/%Y:%H:%M:%S')"
  printf '10.0.0.2 - - [%s +0000] "POST /prisma/api/conviva-event.php HTTP/2.0" 200 56 "-" "okhttp/4.12.0" rt=0.173\n' "$ts" >> "$T/access.log"
}

# Timestamp FUTURO (reloj no fiable) con el formato de nginx.
write_future_zap() {
  local ahead="$1" ts
  ts="$(date -u -d "@$(( $(date -u +%s) + ahead ))" '+%d/%b/%Y:%H:%M:%S')"
  printf '10.0.0.1 - - [%s +0000] "GET /pulse/1098502.m3u8?z=1 HTTP/1.1" 200 322 "-" "OTT Navigator"\n' "$ts" >> "$T/access.log"
}

queue_ticket() { printf '{"id":"%s","url":"http://line.tivi-ott.net/live/x/y/z.m3u8"}\n' "$1" > "$T/queue/$1.json"; }

GOT_OWNERS=0
run_workers() {
  local libdir="$1" lockmode="$2" label="$3" n="${4:-3}" i LOCKF
  pg_mutex_release 2>/dev/null || true
  # El lock del worker es flock sobre el INODO DE UN DIRECTORIO (no un fichero).
  # 'same' = un solo directorio compartido (exclusion real entre los 3);
  # 'unique' = un directorio por worker (mutex QUITADO, para el control negativo).
  mkdir -p "$T/lockshared"
  for i in $(seq 1 "$n"); do
    LOCKF="$T/lockshared"
    if [ "$lockmode" = "unique" ]; then LOCKF="$T/lock$i"; mkdir -p "$LOCKF"; fi
    ( APE_PULSE_LIB="$libdir" \
      APE_CANARY_QUEUE="$T/queue" \
      APE_CANARY_ALLOW="$T/allowed_hosts.txt" \
      APE_CANARY_CTL="$T/bin/ape-canaryctl" \
      APE_CANARY_LOG="$T/logs/worker.$i.log" \
      APE_CANARY_LOCK_TARGET="$LOCKF" \
      APE_CANARY_WAIT_MAX=25 \
      bash "$WORKER" ) &
  done
  wait
  GOT_OWNERS="$(max_owners)"
  printf 'INFO  %s: maximo de propietarios simultaneos = %s\n' "$label" "$GOT_OWNERS"
}

printf '\n=== A. PARSEO DE FECHA Y ZONA ===\n'
gate_env
# shellcheck disable=SC1090
. "$HERE/provider-gate.sh"

RAW='14/Nov/2026:01:28:37'
WANT="$(date -u -d '2026-11-14 01:28:37' +%s)"
GOT="$(pg_epoch_from_nginx_ts "[$RAW" '+0000')"
printf 'INFO  A0  date -u -d "%s" +%%s  -> %s (GNU date rechaza el formato de nginx)\n' "$RAW" "$(date -u -d "$RAW" +%s 2>&1)"
printf 'INFO  A3  epoch del gate = %s   esperado = %s\n' "$GOT" "$WANT"
chk_eq "A1 pg_epoch_from_nginx_ts(['$RAW'],'+0000')" "$GOT" "$WANT"
if [ -n "$GOT" ] && [ "$GOT" -gt 0 ]; then ok "A2 epoch != 0"; else no "A2 epoch != 0 (obtenido [$GOT])"; fi

BAD=0; N=0
for m in Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec; do
  N=$((N+1))
  e="$(pg_epoch_from_nginx_ts "05/$m/2026:00:00:00" '+0000')"
  if [ -z "$e" ] || [ "$e" -le 0 ]; then BAD=$((BAD+1)); fi
done
chk_eq "A4 los 12 meses parsean a epoch > 0" "$BAD/12 malos" "0/12 malos"

# criterio 3: offset del campo $5
OFFM="$(pg_epoch_from_nginx_ts '01/Jan/2024:00:00:00' '-0500')"
chk_eq "A5 offset -0500 aplicado (base + 5h)" "$OFFM" "1704085200"
OFFN="$(pg_epoch_from_nginx_ts '01/Jan/2024:00:00:00' '+0530')"
chk_eq "A6 offset +0530 aplicado (base - 5h30)" "$OFFN" "1704047400"
chk_eq "A7 autotest de zona al arrancar" "$PG_SELFTEST" "ok"

printf '\n=== B. LA ESCALERA: player(0) > canary(1) > jit(2) ===\n'
reset_scenario
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "B1 sin zap ni canary -> canary ADMITIDO" "$RC" "0"
chk_contains "B1b razon literal" "$D" "reason=idle_admit"

reset_scenario; write_zap 12
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "B2 zap hace 12s -> canary DENEGADO" "$RC" "1"
chk_contains "B2b razon literal" "$D" "reason=player_active"
AGE="$(printf '%s' "$D" | sed -n 's/.*player_age_s=\([0-9]*\).*/\1/p')"
printf 'INFO  B2c linea literal: %s\n' "$D"
if [ -n "$AGE" ] && [ "$AGE" -ge 11 ] && [ "$AGE" -le 15 ]; then ok "B2c segundos reportados ($AGE) coherentes con 12"; else no "B2c segundos ([$AGE]) no cuadran con 12"; fi

reset_scenario; write_zap 400
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "B3 zap hace 400s (>180) -> canary ADMITIDO" "$RC" "0"

reset_scenario; write_zap 30
D="$(provider_gate_decide player)"; RC=$?
chk_eq "B4 el reproductor siempre manda -> ADMITIDO" "$RC" "0"
chk_contains "B4b razon" "$D" "reason=player_is_top_of_ladder"

reset_scenario; echo active > "$T/units/ape-canary@aaaaaaaaaaaaaaaa.service.state"
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "B5 canary ya vivo -> segundo canary DENEGADO" "$RC" "1"
chk_contains "B5b razon literal" "$D" "reason=canary_already_live"

echo activating > "$T/units/ape-canary@bbbbbbbbbbbbbbbb.service.state"
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "B6 canary en 'activating' (ventana Restart=on-failure) -> DENEGADO" "$RC" "1"

reset_scenario; echo active > "$T/units/ape-canary@cccccccccccccccc.service.state"
D="$(provider_gate_decide jit)"; RC=$?
chk_eq "B7 escalera: canary vivo -> JIT DENEGADO" "$RC" "1"
chk_contains "B7b razon literal" "$D" "reason=canary_holds_connection"

reset_scenario
cp /bin/sleep "$T/bin/ffmpeg" 2>/dev/null || cp "$(command -v sleep)" "$T/bin/ffmpeg"
( cd "$T/jit/xyz" && exec "$T/bin/ffmpeg" 20 ) &
JITSHIM=$!
sleep 0.5
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "B8 JIT sirviendo -> canary DENEGADO" "$RC" "1"
chk_contains "B8b razon literal" "$D" "reason=jit_serving_player_path"
kill "$JITSHIM" 2>/dev/null; wait "$JITSHIM" 2>/dev/null
reset_scenario

printf '\n=== C. FAIL-CLOSED ===\n'
reset_scenario
PG_PLAYER_LOG="$T/no-existe.log" provider_gate_decide canary > "$T/o.txt" 2>&1; RC=$?
chk_eq "C1 log ausente -> DENEGADO" "$RC" "1"
chk_contains "C1b razon" "$(cat "$T/o.txt")" "reason=player_state_unknown_failclosed"

reset_scenario
printf '10.0.0.1 - - [XX/Foo/2026:99:99:99 +0000] "GET /pulse/1.m3u8?z=1 HTTP/1.1" 200 1 "-" "u"\n' >> "$T/access.log"
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "C2 fecha imparseable -> DENEGADO" "$RC" "1"
chk_contains "C2b razon" "$D" "reason=player_state_unknown_failclosed"

# criterio 2: 0 lineas = unknown
reset_scenario
: > "$T/access.log"
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "C6 log de 0 bytes -> DENEGADO (unknown, no idle)" "$RC" "1"
chk_contains "C6b razon" "$D" "reason=player_state_unknown_failclosed"

reset_scenario
: > "$T/access.log"
PG_ALLOW_EMPTY_LOG=1 provider_gate_decide canary > "$T/o.txt" 2>&1; RC=$?
chk_eq "C7 escotilla PG_ALLOW_EMPTY_LOG=1 -> ADMITIDO" "$RC" "0"
chk_contains "C7b razon" "$(cat "$T/o.txt")" "reason=idle_admit"
chk_contains "C7c la escotilla queda registrada" "$(cat "$T/logs/provider-gate.log" 2>/dev/null)" "escotilla: PG_ALLOW_EMPTY_LOG=1"
reset_scenario

# criterio 2b: log rancio = no se puede probar
reset_scenario
touch -d "@$(( $(date -u +%s) - 900 ))" "$T/access.log"
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "C8 log sin escrituras desde hace 900s -> DENEGADO" "$RC" "1"
chk_contains "C8b razon" "$D" "reason=player_state_unknown_failclosed"

# criterio 3: reloj no fiable (senal del futuro)
reset_scenario
write_future_zap 600
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "C9 age < -5 (senal del futuro) -> DENEGADO" "$RC" "1"
chk_contains "C9b razon literal" "$D" "reason=player_state_unknown_failclosed"

printf '\n=== C3. EL LATIDO QoE TAMBIEN CUENTA ===\n'
reset_scenario; write_conviva 10
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "C3 latido conviva 10s, sin zap -> DENEGADO" "$RC" "1"
chk_contains "C3b razon" "$D" "reason=player_active"
chk_contains "C3c senal" "$D" "player_signal=conviva"

reset_scenario; write_conviva 400
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "C4 latido conviva 400s -> ADMITIDO" "$RC" "0"
chk_contains "C4b razon" "$D" "reason=idle_admit"

reset_scenario; write_zap 20; write_conviva 300
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "C5 gana la senal mas reciente -> DENEGADO" "$RC" "1"
chk_contains "C5b senal = zap" "$D" "player_signal=zap"

printf '\n=== D0. CONSULTA DE UNIDADES: 0 legitimo vs consulta rota ===\n'
reset_scenario
US="$(pg_canary_live_units)"
chk_eq "D0a 0 unidades con exit 0 -> cadena vacia (LEGITIMO, no ERR)" "$US" ""
export FAKE_SYSTEMCTL_FAIL=1
US="$(export FAKE_SYSTEMCTL_FAIL=1; pg_canary_live_units)"
unset FAKE_SYSTEMCTL_FAIL
chk_eq "D0b consulta rota -> ERR" "$US" "ERR"
D="$(export FAKE_SYSTEMCTL_FAIL=1; provider_gate_decide canary)"; RC=$?
chk_eq "D0c consulta rota -> canary DENEGADO" "$RC" "1"
chk_contains "D0d razon literal" "$D" "reason=canary_state_unknown_failclosed"

printf '\n=== D1. MUTEX QUE NO DEPENDE DE UN PATH (inodo de directorio) ===\n'
reset_scenario
pg_mutex_release 2>/dev/null || true
# El mutex NO se toma dentro de decide(): el worker usa command substitution y
# el subshell liberaria el lock al instante. Se prueba la PRIMITIVA en scope
# llamante, que es como debe usarse.
pg_mutex_acquire; RCA=$?
chk_eq "D1a el llamante toma el mutex en su propio proceso" "$RCA" "0"
chk_eq "D1b estado interno" "$PG_MUTEX_HELD" "1"

CH="$( bash -c '. "'"$HERE"'/provider-gate.sh"; if pg_mutex_acquire; then echo TOMADO; else echo RECHAZADO; fi' 2>&1 )"
printf 'INFO  D1c otro proceso intenta tomarlo: %s\n' "$CH"
chk_eq "D1d otro proceso -> RECHAZADO (exclusion real, sin depender de un fichero mio)" "$CH" "RECHAZADO"

pg_mutex_release
chk_eq "D1e tras liberar, PG_MUTEX_HELD" "$PG_MUTEX_HELD" "0"
CH2="$( bash -c '. "'"$HERE"'/provider-gate.sh"; if pg_mutex_acquire; then echo TOMADO; else echo RECHAZADO; fi' 2>&1 )"
chk_eq "D1f liberado -> el otro proceso lo toma" "$CH2" "TOMADO"

reset_scenario
D="$(provider_gate_decide canary)"; RC=$?
chk_eq "D1g la decision no depende del mutex (no lo toma dentro de decide)" "$RC" "0"

printf '\n=== D2. EXCLUSION MUTUA REAL: 3 workers concurrentes ===\n'
gate_env
reset_scenario
queue_ticket aaaa1111; queue_ticket bbbb2222; queue_ticket cccc3333
run_workers "$HERE" same "D2 gate ON + flock ON"
chk_eq "D2 maximo 1 propietario con la puerta activa" "$GOT_OWNERS" "1"

printf '\n=== D3. La ventana de Restart=on-failure NO debe abrir la puerta ===\n'
reset_scenario; gate_env
export APE_FAKE_RESTART=1
queue_ticket dddd4444; queue_ticket eeee5555
( APE_PULSE_LIB="$HERE" APE_CANARY_QUEUE="$T/queue" \
  APE_CANARY_ALLOW="$T/allowed_hosts.txt" APE_CANARY_CTL="$T/bin/ape-canaryctl" \
  APE_CANARY_LOG="$T/logs/worker.restart.log" APE_CANARY_LOCK_TARGET="$T/lockshared" \
  APE_CANARY_WAIT_MAX=25 bash "$WORKER" )
RC=$?
T1="$(date +%s%N)"
D3N="$(max_owners)"
RESTART_TS="$(awk '$1=="R"{print $2}' "$T/events.log" | tail -n 1)"; RESTART_TS="${RESTART_TS:-0}"
printf 'INFO  D3 worker rc=%s salio_en=%s resurreccion_en=%s max=%s\n' "$RC" "$T1" "$RESTART_TS" "$D3N"
if [ "$T1" -gt "$RESTART_TS" ]; then ok "D3 el worker espero a la resurreccion"; else no "D3 solto la conexion ANTES de la resurreccion"; fi
chk_eq "D3b maximo 1 propietario pese al reintento" "$D3N" "1"
export APE_FAKE_RESTART=0

printf '\n=== D4. CONFIRMACION DE ARRANQUE (criterio 1, 2a mitad) ===\n'
reset_scenario; gate_env
# El stub deja la unidad en 'failed': no es visible como viva, pero SI aparece
# en --all, que es justo el caso en que hay algo que parar.
"$T/bin/ape-canaryctl-nostart" start nostart --seconds 1
( export PG_CANARYCTL="$T/bin/ape-canaryctl-nostart"
  . "$HERE/provider-gate.sh"
  provider_gate_wait_canary_gone 5 )
RCW=$?
chk_eq "D4a si la unidad no aparece en 2s -> NO confirmado (exit 1)" "$RCW" "1"
chk_contains "D4b se intento ape-canaryctl stop" "$(cat "$T/stop_called.log" 2>/dev/null)" "stop nostart"

printf '\n=== D5. MITIGACION: zap con canary vivo (caso borde) ===\n'
reset_scenario; gate_env
echo active > "$T/units/ape-canary@mitigacion.service.state"
write_zap 5
( . "$HERE/provider-gate.sh"
  provider_gate_wait_canary_gone 12 ) > "$T/mitig.out" 2>&1
printf 'INFO  D5 salida de la espera:\n'; sed 's/^/      /' "$T/mitig.out"
chk_contains "D5a se detecto el reproductor activo con canary vivo" "$(cat "$T/mitig.out")" "MITIGACION: reproductor activo"
chk_contains "D5b se pidio ape-canaryctl stop" "$(cat "$T/stop_called.log" 2>/dev/null)" "stop mitigacion"

printf '\n=== D6. UNA SOLA LLAMADA + reset-failed EN CADA CORRIDA (criterio 6) ===\n'
reset_scenario
: > "$T/calls.log"
provider_gate_decide canary > /dev/null 2>&1
CALLS="$(cat "$T/calls.log" 2>/dev/null)"
printf 'INFO  D6 llamadas a systemctl en UNA decision:\n'; sed 's/^/      /' "$T/calls.log" 2>/dev/null
chk_contains "D6a reset-failed invocado en la corrida" "$CALLS" "reset-failed"
chk_eq "D6b la consulta de unidades es UNA sola llamada list-units" "$(grep -c '^list-units$' "$T/calls.log" 2>/dev/null || echo 0)" "1"
chk_eq "D6c cero llamadas 'show' por unidad" "$(grep -c '^show$' "$T/calls.log" 2>/dev/null || true)" "0"

printf '\n=== E. CONTROL NEGATIVO: sin mutex, el detector DEBE ver >=2 ===\n'
mkdir -p "$T/lib-neutered"
cat > "$T/lib-neutered/provider-gate.sh" <<'EON'
provider_gate_decide() { printf 'PROVIDER_GATE decision=ALLOW claimant=%s level=- reason=mutex_removed\n' "${1:-}"; return 0; }
provider_gate_wait_canary_gone() { return 0; }
pg_mutex_release() { return 0; }
EON
gate_env
reset_scenario
queue_ticket ffff6666; queue_ticket gggg7777; queue_ticket hhhh8888
run_workers "$T/lib-neutered" unique "E1 gate OFF + flock OFF"
E1="$GOT_OWNERS"

printf '\n=== F. WORKER REAL con un zap reciente: NO debe arrancar canary ===\n'
gate_env
reset_scenario
write_zap 12
: > "$T/logs/worker.zap.log"
queue_ticket zzzz9999
( APE_PULSE_LIB="$HERE" APE_CANARY_QUEUE="$T/queue" \
  APE_CANARY_ALLOW="$T/allowed_hosts.txt" APE_CANARY_CTL="$T/bin/ape-canaryctl" \
  APE_CANARY_LOG="$T/logs/worker.zap.log" APE_CANARY_LOCK_TARGET="$T/lockshared" \
  APE_CANARY_WAIT_MAX=25 bash "$WORKER" )
RCF=$?
NS="$(grep -c '^S ' "$T/events.log" 2>/dev/null || true)"; NS="${NS:-0}"
printf 'INFO  F1 worker rc=%s ; arranques de canary = %s\n' "$RCF" "$NS"
printf 'INFO  F2 log literal del worker:\n'; sed 's/^/      /' "$T/logs/worker.zap.log" 2>/dev/null
chk_eq "F3 con zap reciente el worker NO arranca canary" "$NS" "0"
chk_contains "F4 registra la razon literal" "$(cat "$T/logs/worker.zap.log" 2>/dev/null)" "reason=player_active"
chk_contains "F5 registra los segundos" "$(cat "$T/logs/worker.zap.log" 2>/dev/null)" "player_age_s="
chk_eq "F6 el ticket se conserva" "$([ -f "$T/queue/zzzz9999.json" ] && echo queda || echo consumido)" "queda"

printf '\n=== G. REGISTRO DE DECISIONES EN PG_LOG (con rotacion) ===\n'
NDEC="$(grep -c 'decision: PROVIDER_GATE' "$T/logs/provider-gate.log" 2>/dev/null || true)"; NDEC="${NDEC:-0}"
printf 'INFO  G1 decisiones registradas en el log de la puerta: %s\n' "$NDEC"
if [ "$NDEC" -ge 10 ]; then ok "G1 cada decision se registra en PG_LOG ($NDEC)"; else no "G1 solo $NDEC decisiones en PG_LOG"; fi
reset_scenario
for i in $(seq 1 40); do printf 'relleno %s 0123456789012345678901234567890123456789\n' "$i"; done > "$T/big.txt"
cp "$T/big.txt" "$T/logs/rot.log"
PG_LOG="$T/logs/rot.log" PG_LOG_MAX=1000 pg_record "forzar rotacion"
unset PG_LOG_PLACEHOLDER 2>/dev/null || true
if [ -f "$T/logs/rot.log.1" ]; then ok "G2 rotacion del log al superar PG_LOG_MAX"; else no "G2 no se roto el log"; fi

printf '\n=== H. RESUMEN ===\n'
printf 'SUMMARY pass=%s fail=%s  (control_negativo_propietarios=%s)\n' "$PASS" "$FAIL" "$E1"

if [ "$MODE" = "--negative-control" ]; then
  printf 'NEGATIVE_CONTROL propietarios_simultaneos=%s (se esperaba >=2)\n' "$E1"
  if [ "$E1" -ge 2 ]; then
    printf 'NEGATIVE_CONTROL VERDICT: FAIL — el detector SI vio %s propietarios a la vez. exit 1\n' "$E1"
  else
    printf 'NEGATIVE_CONTROL VERDICT: el detector NO vio la violacion -> el test no vale. exit 1\n'
  fi
  exit 1
fi

if [ "$FAIL" -eq 0 ] && [ "$E1" -ge 2 ]; then
  printf 'VERDICT: PASS (mutex real = 1 propietario; control negativo detecto %s propietarios)\n' "$E1"
  exit 0
fi
printf 'VERDICT: FAIL (fail=%s, control_negativo=%s)\n' "$FAIL" "$E1"
exit 1
