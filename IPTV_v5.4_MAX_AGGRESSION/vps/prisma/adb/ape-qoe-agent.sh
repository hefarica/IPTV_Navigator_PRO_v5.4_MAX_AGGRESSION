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
    "$CURL" -k -sf -m 4 -X POST -H 'Content-Type: application/json' -d "$1" "$EP" >/dev/null 2>&1 && return 0
  else
    wget -q -T 4 --post-data="$1" --header='Content-Type: application/json' -O /dev/null "$EP" 2>/dev/null && return 0
  fi
  echo "$1" >> "$QUEUE" 2>/dev/null; return 1; }

flush_queue(){
  [ -s "$QUEUE" ] && [ -x "$CURL" ] || return 0
  tmp="$QUEUE.snd"; mv "$QUEUE" "$tmp" 2>/dev/null || return 0
  while IFS= read -r b; do [ -n "$b" ] || continue
    "$CURL" -k -sf -m 4 -X POST -H 'Content-Type: application/json' -d "$b" "$EP" >/dev/null 2>&1 || echo "$b" >> "$QUEUE"
  done < "$tmp"
  rm -f "$tmp" 2>/dev/null; }

# --- emit: arma JSON schema conviva_event v1.0 y POSTea en background (al vuelo) ---
emit(){ # $1=event_type  $2=data-fragment-sin-llaves-externas
  ts=$(now_ms); player=$(current_player)
  json="{\"version\":\"1.0\",\"session_id\":\"$SES\",\"device_id\":\"$DEVID\",\"player\":\"$player\",\"channel\":{\"id\":\"${CONVIVA_CHANNEL_ID:-auto}\",\"name\":\"${CONVIVA_CHANNEL_NAME:-live}\"},\"event_type\":\"$1\",\"timestamp_ms\":$ts,\"data\":{$2}}"
  post_event "$json" &   # background: NO bloquea el read del logcat
}

LAST_SIG=""; LAST_DRAIN=0; LAST_HEAL=0
logcat_loop(){
  # -v epoch (timestamps absolutos) -T 1 (solo nuevas lineas). CALIBRAR tags/case contra logcat real.
  logcat -v epoch -T 1 \
    MediaCodec:V MediaCodecVideoRenderer:V ExoPlayerImpl:V ExoPlayer:V \
    DefaultBandwidthMeter:V MediaCodecQuerier:V Codec2Client:V '*:E' 2>/dev/null | \
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
        emit quality_change "\"codec\":\"$cod\",\"resolution\":\"${w}x${h}\",\"bitrate_bps\":${br:-0}"
        log "quality_change $sig" ;;
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

daemon(){
  acquire
  log "START on-device QoE agent uid=$(id -u 2>/dev/null) dev=$DEVID ses=$SES ep=$EP"
  heal_adb_network
  emit first_frame "\"reason\":\"agent_boot\""
  while true; do logcat_loop; log "logcat ended; restart in 3s"; sleep 3; done; }

case "${1:-daemon}" in
  daemon|start) daemon ;;
  heal) heal_adb_network; echo healed ;;
  selftest)
    echo "uid=$(id -u 2>/dev/null) groups=$(id -Gn 2>/dev/null)"
    echo "curl=$([ -x "$CURL" ] && echo OK || echo MISSING) ep=$EP"
    echo "logcat=$(logcat -d -t 1 >/dev/null 2>&1 && echo READABLE || echo DENIED)" ;;
  stop) [ -f "$LOCK" ] && { p=$(cat "$LOCK"); is_alive "$p" && kill "$p" 2>/dev/null; rm -f "$LOCK"; echo STOPPED; } || echo "NOT RUNNING" ;;
  *) echo "Usage: $0 {daemon|heal|selftest|stop}"; exit 1 ;;
esac
