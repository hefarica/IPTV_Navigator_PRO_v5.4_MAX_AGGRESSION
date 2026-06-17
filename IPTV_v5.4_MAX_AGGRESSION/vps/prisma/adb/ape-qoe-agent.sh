#!/system/bin/sh
################################################################################
# ape-qoe-agent.sh — AGENTE QoE ON-DEVICE (Fire TV / ONN 4K), shell-user UID 2000
# ----------------------------------------------------------------------------
# Lee SU PROPIO logcat local (UID 2000 esta en el grupo log=1007 -> ve TODOS los
# players nativos: OTT Navigator / TiviMate / Kodi / ExoPlayer, a diferencia de
# una app sideloaded con READ_LOGS que en Android 4.1+ solo ve su propio UID),
# parsea QoE (codec/res/bitrate/first-frame/rebuffer/drops/error) y la POSTea
# AL VUELO a la URL-2 (conviva-event.php, schema v1.0) por EGRESS HTTPS saliente.
#
# POR QUE este diseno (vs el agente Python host-side que fallaba):
#   #1 glitch Popen-Windows  -> ELIMINADO: el logcat se lee EN Android (pipe nativo).
#   #2 puerto 5555 cerrado    -> IRRELEVANTE para el dato: lee logcat local + egress.
#   #3 reboot apaga adb-net   -> self-heal (adb_wifi_enabled) + host-watchdog re-bootstrap.
# Reutiliza el patron probado freeze-safe de ape-uhdx-sentinel.sh ($BASE/curl + lockfile).
# Doctrina autopista: telemetry-only, POST fire-and-forget con cola de reintento,
# si el VPS cae el player NO se entera, CERO interferencia con playback.
#
# Bootstrap (host LAN, 1 vez; el host-watchdog lo repite tras reboot):
#   adb connect <ip>:5555
#   adb push curl /data/local/tmp/curl ; adb shell chmod 755 /data/local/tmp/curl
#   adb push ape-qoe-agent.sh /data/local/tmp/ ; adb shell chmod 755 /data/local/tmp/ape-qoe-agent.sh
#   adb shell "nohup sh /data/local/tmp/ape-qoe-agent.sh daemon >/dev/null 2>&1 &"
################################################################################
set -u
BASE="/data/local/tmp"
LOCK="$BASE/ape-qoe-agent.lock"
LOG="$BASE/ape-qoe-agent.log"
QUEUE="$BASE/ape-qoe-queue.ndjson"            # eventos no enviados (reintento ordenado)
CURL="$BASE/curl"                             # MISMO binario estatico que ape-uhdx-sentinel.sh
CURL_EXTRA="${CURL_EXTRA:-}"                   # opts extra para egress (ej. bind wlan0 + --resolve si el player monopoliza el VPN/tun0). Se setea en el launcher por-device.
EP="${CONVIVA_EP:-https://iptv-ape.duckdns.org/prisma/api/conviva-event}"
DEVID="$(getprop ro.serialno 2>/dev/null | tr -dc 'A-Za-z0-9_.-' | cut -c1-64)"
[ -z "$DEVID" ] && DEVID="onn-4k-unknown"
SES="s$(date +%s 2>/dev/null)$$"              # session_id (>=8 chars, schema v1.0)
PLAYER_RE='studio.scillarium.ottnavigator|ar.tvplayer.tv|org.xbmc.kodi'
MAX_LOG=700

log(){ echo "[$(date '+%F %T' 2>/dev/null || echo '?')] $1" >> "$LOG" 2>/dev/null
  n=$(wc -l < "$LOG" 2>/dev/null || echo 0)
  [ "$n" -gt "$MAX_LOG" ] 2>/dev/null && { tail -n 300 "$LOG" > "$LOG.t" 2>/dev/null && mv "$LOG.t" "$LOG" 2>/dev/null; }; }

is_alive(){ [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

acquire(){
  if [ -f "$LOCK" ]; then op=$(cat "$LOCK" 2>/dev/null)
    is_alive "$op" && { echo "already running pid=$op"; exit 0; }; rm -f "$LOCK"; fi
  echo $$ > "$LOCK"; trap 'rm -f "$LOCK"; log STOP' EXIT INT TERM; }

# --- self-heal: reabrir adb-network SIN USB (ya estamos dentro del shell autorizado) ---
# Esto NO es "remote-enable de ADB" (truth-guard): es el shell YA autorizado del device
# re-habilitando su propio adb localmente. setprop suele bloquearlo SELinux en no-root.
heal_adb_network(){
  settings put global adb_wifi_enabled 1 2>/dev/null
  settings put global adb_enabled 1 2>/dev/null
  setprop service.adb.tcp.port 5555 2>/dev/null   # best-effort (SELinux no-root)
  stop adbd 2>/dev/null; start adbd 2>/dev/null; }

now_ms(){ echo $(( $(date +%s 2>/dev/null) * 1000 )); }

# --- player en foreground (para el enum 'player' del schema v1.0) ---
current_player(){
  fg=$(dumpsys window 2>/dev/null | grep -oE "$PLAYER_RE" | head -1)
  case "$fg" in
    ar.tvplayer.tv) echo "TiviMate" ;;
    studio.scillarium.ottnavigator) echo "OTT_Navigator" ;;
    org.xbmc.kodi) echo "Kodi" ;;
    *) echo "ExoPlayer" ;;
  esac; }

# --- POST fire-and-forget; encola si falla (autopista: nunca abortar) ---
post_event(){ # $1 = json completo
  if [ -x "$CURL" ]; then
    "$CURL" $CURL_EXTRA -k -sf -m 4 -X POST -H 'Content-Type: application/json' -d "$1" "$EP" >/dev/null 2>&1 && return 0
  else
    wget -q -T 4 --post-data="$1" --header='Content-Type: application/json' -O /dev/null "$EP" 2>/dev/null && return 0
  fi
  echo "$1" >> "$QUEUE" 2>/dev/null; return 1; }

flush_queue(){
  [ -s "$QUEUE" ] && [ -x "$CURL" ] || return 0
  tmp="$QUEUE.snd"; mv "$QUEUE" "$tmp" 2>/dev/null || return 0
  while IFS= read -r b; do [ -n "$b" ] || continue
    "$CURL" $CURL_EXTRA -k -sf -m 4 -X POST -H 'Content-Type: application/json' -d "$b" "$EP" >/dev/null 2>&1 || echo "$b" >> "$QUEUE"
  done < "$tmp"
  rm -f "$tmp" 2>/dev/null; }

# --- emit: arma JSON schema conviva_event v1.0 y POSTea en background (al vuelo) ---
emit(){ # $1=event_type  $2=data-fragment-sin-llaves-externas
  ts=$(now_ms); player=$(current_player)
  json="{\"version\":\"1.0\",\"session_id\":\"$SES\",\"device_id\":\"$DEVID\",\"player\":\"$player\",\"channel\":{\"id\":\"${CONVIVA_CHANNEL_ID:-auto}\",\"name\":\"${CONVIVA_CHANNEL_NAME:-live}\"},\"event_type\":\"$1\",\"timestamp_ms\":$ts,\"data\":{$2}}"
  post_event "$json" &   # background: NO bloquea el read del logcat
}

LAST_SIG=""; LAST_DSIG=""; LAST_DRAIN=0; LAST_HEAL=0
logcat_loop(){
  # -v epoch (timestamps absolutos) -T 1 (solo nuevas lineas). CALIBRAR tags/case contra logcat real.
  logcat -v epoch -T 1 \
    MediaCodec:V MediaCodecVideoRenderer:V ExoPlayerImpl:V ExoPlayer:V \
    DefaultBandwidthMeter:V MediaCodecQuerier:V Codec2Client:V MPB_DRM:V MediaCodecLogger:I '*:E' 2>/dev/null | \
  while IFS= read -r L; do
    n=$(date +%s 2>/dev/null)
    [ $((n-LAST_DRAIN)) -ge 30 ] 2>/dev/null && { flush_queue; LAST_DRAIN=$n; }
    [ $((n-LAST_HEAL))  -ge 60 ] 2>/dev/null && { heal_adb_network; LAST_HEAL=$n; }
    case "$L" in
      *MediaCodecQuerier*isSupported=true*)
        cod=$(printf '%s' "$L"|grep -oE 'CODECS=[A-Za-z0-9.]+'|head -1|cut -d= -f2)
        w=$(printf '%s' "$L"|grep -oE 'WIDTH=[0-9]+'|head -1|cut -d= -f2)
        h=$(printf '%s' "$L"|grep -oE 'HEIGHT=[0-9]+'|head -1|cut -d= -f2)
        br=$(printf '%s' "$L"|grep -oE 'BITRATE=[0-9]+'|head -1|cut -d= -f2)
        [ -z "$cod" ] && continue
        sig="$cod-${w}x${h}-$br"; [ "$sig" = "$LAST_SIG" ] && continue; LAST_SIG="$sig"
        emit quality_change "\"codec\":\"$cod\",\"resolution\":\"${w}x${h}\",\"bitrate_bps\":${br:-0},\"declared\":true"
        log "querier(declared) $sig" ;;
      *omx.video.*bitrateInKbps*)
        # codec REALMENTE decodificado (MediaCodecLogger) + bitrate real -> QoE autoritativa
        dcod=$(printf '%s' "$L"|grep -oE 'omx\.video\.[a-z0-9]+'|head -1|sed 's/.*\.//')
        kb=$(printf '%s' "$L"|grep -oE 'bitrateInKbps[ ]*=[ ]*[0-9]+'|grep -oE '[0-9]+$'|head -1)
        [ -z "$dcod" ] && continue
        dsig="dec-$dcod-${kb}"; [ "$dsig" = "$LAST_DSIG" ] && continue; LAST_DSIG="$dsig"
        emit quality_change "\"codec\":\"$dcod\",\"bitrate_bps\":$(( ${kb:-0} * 1000 )),\"decoded\":true"
        log "decoded $dcod ${kb}kbps" ;;
      *"Output format changed"*)
        res=$(printf '%s' "$L"|grep -oE 'width=[0-9]+.*height=[0-9]+'|grep -oE '[0-9]+'|paste -sd 'x' - 2>/dev/null)
        cod=$(printf '%s' "$L"|grep -oE 'mime=video/[A-Za-z0-9.-]+'|cut -d/ -f2)
        [ -n "$res" ] && emit quality_change "\"resolution\":\"$res\",\"codec\":\"${cod:-unknown}\"" ;;
      *onRenderedFirstFrame*elapsed=*)
        ms=$(printf '%s' "$L"|grep -oE 'elapsed=[0-9]+'|head -1|cut -d= -f2)
        emit first_frame "\"startup_time_ms\":${ms:-0}"; log "first_frame ${ms}ms" ;;
      *Dropped*frames*|*droppedFrames*)
        d=$(printf '%s' "$L"|grep -oE 'Dropped [0-9]+'|grep -oE '[0-9]+'|head -1)
        [ -z "$d" ] && d=$(printf '%s' "$L"|grep -oE 'droppedFrames=[0-9]+'|grep -oE '[0-9]+'|head -1)
        [ -n "$d" ] && emit frame_drop "\"frame_drops\":$d" ;;
      *STATE_BUFFERING*) emit rebuffer_start "\"reason\":\"buffering\"" ;;
      *STATE_READY*) emit rebuffer_end "\"reason\":\"ready\"" ;;
      *ExoPlaybackException*|*PlayerError*|*MediaCodec*Exception*|*"Codec error"*)
        emit error "\"error_code\":\"exo\",\"error_message\":\"logcat\"" ;;
    esac
  done; }

# ════════════════════════════════════════════════════════════════════════════
# OMEGA ARA URL-2 — SSE-DOWN policy deltas + FSM (Council-safe merge, ADDITIVO).
# Reusa $CURL/$DEVID/emit/log/now_ms del agente QoE-up de arriba. NO reemplaza nada.
# Allowlist ESTRICTA (MUST-FIX): hdr_conversion_mode + match_content_frame_rate +
# display_color_mode (SOLO amlogic). SIN minimal_post_processing_allowed.
# Idempotente (ledger por id). OFFLINE_CACHE reaplica SOLO last-good allowlisted.
# ════════════════════════════════════════════════════════════════════════════
ARA_ROOT="${ARA_ENDPOINT:-https://iptv-ape.duckdns.org}"
ARA_TOKEN="${ARA_TOKEN:-}"
ARA_VER="ara-sh-council-safe-20260616"
STATE_DIR="$BASE/ape_ara_state"
LEDGER="$STATE_DIR/applied_deltas.log"
LAST_GOOD="$STATE_DIR/last_good_settings.env"   # "ns key value" por linea
FSM_FILE="$STATE_DIR/fsm_state"
LAST_ID_FILE="$STATE_DIR/last_id"
WAS_DOWN_FILE="$STATE_DIR/was_down"
mkdir -p "$STATE_DIR" 2>/dev/null

ara_auth_header(){ if [ -n "$ARA_TOKEN" ]; then printf 'Authorization: Bearer %s' "$ARA_TOKEN"; else printf 'X-APE-Lab: 1'; fi; }

ara_fsm_set(){ # $1=state — escribe a archivo (cruza subshells del pipe) y loguea SOLO transiciones
  prev=$(cat "$FSM_FILE" 2>/dev/null)
  [ "$prev" = "$1" ] && return 0
  echo "$1" > "$FSM_FILE" 2>/dev/null; log "FSM ${prev:-INIT}->$1"; }

ara_remember(){ # ns key value — UPSERT (reemplaza la linea previa del mismo ns key)
  if [ -f "$LAST_GOOD" ]; then grep -v "^$1 $2 " "$LAST_GOOD" > "$LAST_GOOD.t" 2>/dev/null && mv "$LAST_GOOD.t" "$LAST_GOOD" 2>/dev/null; fi
  echo "$1 $2 $3" >> "$LAST_GOOD" 2>/dev/null; }

# allowlist STRICTA — todo lo demas se RECHAZA con log (sin spam)
ara_safe_put(){ # ns key value
  case "$1.$2" in
    global.hdr_conversion_mode|global.match_content_frame_rate)
      settings put "$1" "$2" "$3" >/dev/null 2>&1 && ara_remember "$1" "$2" "$3" && return 0 ;;
    system.display_color_mode)
      hw=$(getprop ro.hardware 2>/dev/null | tr 'A-Z' 'a-z')
      case "$hw" in
        *amlogic*) settings put system display_color_mode "$3" >/dev/null 2>&1 && ara_remember system display_color_mode "$3" && return 0 ;;
        *) log "reject display_color_mode hw=$hw"; return 1 ;;
      esac ;;
    *) log "reject off-list $1.$2"; return 1 ;;
  esac
  return 1; }

ara_already(){ grep -q "^$1\$" "$LEDGER" 2>/dev/null; }
ara_mark(){ echo "$1" >> "$LEDGER" 2>/dev/null; }

# OFFLINE_CACHE: reaplica SOLO last-good allowlisted (nunca inventa settings nuevos)
ara_replay_last_good(){
  [ -f "$LAST_GOOD" ] || return 0
  while read -r ns key val; do
    [ -n "$ns" ] && [ -n "$key" ] && [ -n "$val" ] && ara_safe_put "$ns" "$key" "$val" >/dev/null 2>&1
  done < "$LAST_GOOD"
  log "OFFLINE_CACHE replayed last-good"; }

ara_reconcile_on_reconnect(){ # RESTORED solo si veniamos de una caida; reconcilia (ledger dedup)
  if [ "$(cat "$WAS_DOWN_FILE" 2>/dev/null)" = "1" ]; then
    ara_fsm_set RESTORED; rm -f "$WAS_DOWN_FILE" 2>/dev/null; ara_replay_last_good
  fi
  ara_fsm_set HEALTHY; }

ara_apply_delta(){ # $1 = linea data: JSON — aplica SOLO settings allowlisted; resto = lo aplica el VPS
  line="$1"
  id=$(printf '%s' "$line" | sed -n 's/.*"id":[ ]*\([0-9][0-9]*\).*/\1/p'); [ -z "$id" ] && id="$(now_ms)"
  ara_already "$id" && return 0
  hcm=$(printf '%s' "$line" | sed -n 's/.*"hdr_conversion_mode"[ ]*:[ ]*"*\([0-9][0-9]*\).*/\1/p'); [ -n "$hcm" ] && ara_safe_put global hdr_conversion_mode "$hcm"
  mcf=$(printf '%s' "$line" | sed -n 's/.*"match_content_frame_rate"[ ]*:[ ]*"*\([0-9][0-9]*\).*/\1/p'); [ -n "$mcf" ] && ara_safe_put global match_content_frame_rate "$mcf"
  dcm=$(printf '%s' "$line" | sed -n 's/.*"display_color_mode"[ ]*:[ ]*"*\([0-9][0-9]*\).*/\1/p'); [ -n "$dcm" ] && ara_safe_put system display_color_mode "$dcm"
  printf '%s' "$line" | grep -q 'SDR_FORCE' && ara_remember pq_profile state SDR_FORCE
  ara_mark "$id"; log "applied delta id=$id"; }

# poll SSE /ara/events (curl -N: conexion abierta, data-push de deltas). Reconnect resiliente.
# Nota: el `curl | while` corre en subshell -> last_id/FSM se persisten en archivo (cruzan el pipe);
# y el LEDGER garantiza idempotencia aunque un reconnect reenvie deltas ya aplicados.
poll_deltas(){
  backoff=1
  echo 0 > "$LAST_ID_FILE" 2>/dev/null
  while true; do
    if [ -z "$ARA_TOKEN" ] && [ "${APE_LAB_MODE:-0}" != "1" ]; then
      log "ARA_TOKEN vacio y no LAB -> SSE off; OFFLINE_CACHE"; ara_fsm_set OFFLINE_CACHE; ara_replay_last_good; sleep 30; continue
    fi
    ara_fsm_set RECOVERING
    last_id=$(cat "$LAST_ID_FILE" 2>/dev/null || echo 0)
    if [ -x "$CURL" ]; then
      "$CURL" $CURL_EXTRA -k -NsS --speed-limit 1 --speed-time 45 -H "$(ara_auth_header)" "$ARA_ROOT/ara/events?device_id=$DEVID&last_id=$last_id" 2>/dev/null | \
      while IFS= read -r ln; do
        case "$ln" in
          id:*)         printf '%s' "$ln" | sed 's/^id:[ ]*//' > "$LAST_ID_FILE" 2>/dev/null ;;
          data:*)       ara_reconcile_on_reconnect; ara_apply_delta "$(printf '%s' "$ln" | sed 's/^data:[ ]*//')" ;;
          :*connected*) ara_reconcile_on_reconnect ;;
        esac
      done
    fi
    ara_fsm_set DEGRADED; echo 1 > "$WAS_DOWN_FILE" 2>/dev/null
    log "SSE disconnected; OFFLINE_CACHE + retry in ${backoff}s"
    ara_fsm_set OFFLINE_CACHE; ara_replay_last_good
    sleep "$backoff"
    if [ "$backoff" -lt 30 ]; then backoff=$((backoff*2)); else backoff=30; fi
  done; }

daemon(){
  acquire
  log "START on-device QoE+ARA agent uid=$(id -u 2>/dev/null) dev=$DEVID ses=$SES ep=$EP ara=$ARA_ROOT token=$([ -n "$ARA_TOKEN" ] && echo set || echo none)"
  heal_adb_network
  emit first_frame "\"reason\":\"agent_boot\""
  emit heartbeat "\"ara_version\":\"$ARA_VER\",\"state\":\"HEALTHY\""
  ara_fsm_set HEALTHY
  poll_deltas &                       # ARA SSE-down policy applier (background, no bloquea logcat)
  while true; do logcat_loop; log "logcat ended; restart in 3s"; sleep 3; done; }

case "${1:-daemon}" in
  daemon|start) daemon ;;
  heal) heal_adb_network; echo healed ;;
  selftest)
    echo "uid=$(id -u 2>/dev/null) groups=$(id -Gn 2>/dev/null)"
    echo "curl=$([ -x "$CURL" ] && echo OK || echo MISSING) ep=$EP"
    echo "ara_root=$ARA_ROOT token=$([ -n "$ARA_TOKEN" ] && echo set || echo none) lab=${APE_LAB_MODE:-0}"
    echo "state_dir=$STATE_DIR fsm=$(cat "$FSM_FILE" 2>/dev/null || echo INIT)"
    echo "hw=$(getprop ro.hardware 2>/dev/null) (display_color_mode permitido solo en amlogic)"
    echo "logcat=$(logcat -d -t 1 >/dev/null 2>&1 && echo READABLE || echo DENIED)" ;;
  fsm) cat "$FSM_FILE" 2>/dev/null || echo INIT ;;
  replay) ara_fsm_set OFFLINE_CACHE; ara_replay_last_good; echo "replayed: $(cat "$LAST_GOOD" 2>/dev/null | wc -l) settings" ;;
  stop) [ -f "$LOCK" ] && { p=$(cat "$LOCK"); is_alive "$p" && kill "$p" 2>/dev/null; rm -f "$LOCK"; echo STOPPED; } || echo "NOT RUNNING" ;;
  *) echo "Usage: $0 {daemon|heal|selftest|fsm|replay|stop}"; exit 1 ;;
esac
