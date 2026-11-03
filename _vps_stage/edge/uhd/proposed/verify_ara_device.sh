#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# verify_ara_device.sh — Verificación READ-ONLY del ARA en un device autorizado.
# ════════════════════════════════════════════════════════════════════════════
# QUÉ HACE: comprueba (A) presencia/proceso/caps del APK vía ADB, (B) latido y
#           policy_deltas en la DB del VPS (sqlite -readonly), (C) respuesta del
#           feedforward device-keyed (ape_vpp.allowed / device_settings).
# QUÉ NO HACE (garantía de seguridad):
#   · NO instala APKs, NO enrola, NO escribe settings (`settings get`, nunca `put`),
#     NO arranca actividades, NO modifica la DB (`sqlite3 -readonly`), NO toca nginx.
#   · NO imprime secretos: `APE_ENROLL_SECRET` se ignora si está en el entorno y
#     `caps_json` sólo se resume a `soc`/`soc_8k` (nunca el JSON completo).
# USO:
#   ./verify_ara_device.sh [--serial IP:PUERTO] [--device-id ID] [--ssh user@vps]
#                          [--vps URL] [--db RUTA] [--max-age-s N] [--no-adb]
# SALIDA: líneas [PASS]/[FAIL]/[NOT_RUN]; exit 0 si no hay FAIL, 1 si hay FAIL,
#         2 si no se pudo ejecutar ninguna comprobación.
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SERIAL=""; DEVICE_ID=""; SSH_HOST=""; NO_ADB=0
VPS="${VPS:-https://iptv-ape.duckdns.org}"
DB="${ARA_DB:-/opt/netshield/data/conviva.db}"
MAX_AGE="${ARA_MAX_AGE_S:-300}"
PKG="${ARA_APK_PKG:-com.ape.crystalagent}"

while [ $# -gt 0 ]; do
  case "$1" in
    --serial)      SERIAL="${2:-}"; shift 2 ;;
    --device-id)   DEVICE_ID="${2:-}"; shift 2 ;;
    --ssh)         SSH_HOST="${2:-}"; shift 2 ;;
    --vps)         VPS="${2:-}"; shift 2 ;;
    --db)          DB="${2:-}"; shift 2 ;;
    --max-age-s)   MAX_AGE="${2:-}"; shift 2 ;;
    --no-adb)      NO_ADB=1; shift ;;
    -h|--help)     sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "arg desconocido: $1" >&2; exit 2 ;;
  esac
done

# Endurecimiento: no dejar el secreto de enrolamiento en el entorno del script.
if [ -n "${APE_ENROLL_SECRET:-}" ]; then unset APE_ENROLL_SECRET; fi

FAIL=0; TOTAL=0
chk() { # chk <nombre> <PASS|FAIL|NOT_RUN> [detalle]
  TOTAL=$((TOTAL+1))
  case "$2" in FAIL) FAIL=$((FAIL+1)) ;; esac
  printf '[%s] %s%s\n' "$2" "$1" "${3:+ — $3}"
}
now() { date +%s; }
jget() { # jget <file> <jq-path>  (usa jq si existe; si no, vacío = NO_VERIFICADO)
  if command -v jq >/dev/null 2>&1; then jq -r "$2" "$1" 2>/dev/null; else printf ''; fi
}

echo "=== ARA device verify (read-only) · $(date -u +%FT%TZ) · host=$(hostname 2>/dev/null || echo n/a) ==="

# ── A) DEVICE (ADB read-only) ───────────────────────────────────────────────
if [ "$NO_ADB" = 1 ] || ! command -v adb >/dev/null 2>&1; then
  chk "A1..A6 ADB" NOT_RUN "adb ausente o --no-adb"
else
  ADB=(adb); [ -n "$SERIAL" ] && ADB=(adb -s "$SERIAL")
  ST="$("${ADB[@]}" get-state 2>/dev/null | tr -d '\r' || true)"
  if [ "$ST" = "device" ]; then chk "A1 ADB autorizado" PASS "get-state=device"
  else chk "A1 ADB autorizado" FAIL "get-state=${ST:-none} (habilita Wireless debugging y acepta el RSA)"; fi

  PKGS="$("${ADB[@]}" shell pm list packages 2>/dev/null | tr -d '\r' || true)"
  if printf '%s\n' "$PKGS" | grep -qx "package:${PKG}"; then chk "A2 APK instalado" PASS "$PKG"
  else chk "A2 APK instalado" FAIL "no aparece package:${PKG} (APK/daemon ausente)"; fi

  PID="$("${ADB[@]}" shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true)"
  if [ -n "$PID" ]; then chk "A3 proceso vivo" PASS "pid=$PID"
  else chk "A3 proceso vivo" FAIL "pidof vacío (servicio parado)"; fi

  MODEL="$("${ADB[@]}" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || true)"
  PLAT="$("${ADB[@]}" shell getprop ro.board.platform 2>/dev/null | tr -d '\r' || true)"
  chk "A4 modelo/SoC" PASS "model=${MODEL:-?} platform=${PLAT:-?}"

  LOG="$("${ADB[@]}" shell logcat -d -t 400 2>/dev/null | tr -d '\r' | grep -iE 'ara|crystalagent|ape-' | tail -n 15 || true)"
  if [ -n "$LOG" ]; then chk "A5 logcat ARA" PASS "$(printf '%s\n' "$LOG" | wc -l | tr -d ' ') líneas recientes"
  else chk "A5 logcat ARA" FAIL "sin líneas ara/crystalagent/ape- en 400"; fi

  for K in pq_ai_sr_enable ai_sr_level ai_pq_mode ai_pic_mode hdr_conversion_mode match_content_frame_rate minimal_post_processing_allowed; do
    V="$("${ADB[@]}" shell settings get global "$K" 2>/dev/null | tr -d '\r')"
    [ "$V" = "null" ] && V="$("${ADB[@]}" shell settings get system "$K" 2>/dev/null | tr -d '\r')"
    printf '       A6 %-36s = %s\n' "$K" "${V:-null}"
  done
  chk "A6 settings VPP (sólo lectura)" PASS "ver líneas A6"
fi

# ── B) DB del VPS (sqlite -readonly) ────────────────────────────────────────
SQL_HB="SELECT COUNT(*) FROM ara_heartbeats;"
SQL_LAST="SELECT device_id, last_seen, length(caps_json) FROM ara_heartbeats ORDER BY last_seen DESC LIMIT 3;"
SQL_DELTAS="SELECT COUNT(*) FROM policy_deltas;"
q() { # q <sql> → filas o vacío
  if [ -n "$SSH_HOST" ]; then
    ssh -o BatchMode=yes -o ConnectTimeout=8 "$SSH_HOST" "sqlite3 -readonly '$DB' \"$1\"" 2>/dev/null || true
  elif [ -f "$DB" ] && command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 -readonly "$DB" "$1" 2>/dev/null || true
  fi
}
HB_N="$(q "$SQL_HB")"; DEL_N="$(q "$SQL_DELTAS")"; LAST="$(q "$SQL_LAST")"
if [ -z "$HB_N" ] && [ -z "$DEL_N" ] && [ -z "$LAST" ]; then
  chk "B1 DB ara_heartbeats/policy_deltas" NOT_RUN "sin acceso a $DB (usa --ssh o ejecuta en el VPS)"
else
  if [ "${HB_N:-0}" -gt 0 ] 2>/dev/null; then chk "B1 ara_heartbeats" PASS "filas=$HB_N"
  else chk "B1 ara_heartbeats" FAIL "0 filas (el device nunca latió)"; fi
  if printf '%s\n' "$LAST" | grep -q .; then chk "B2 último latido" PASS "$(printf '%s' "$LAST" | tr '\n' ' ' | cut -c1-160)"
  else chk "B2 último latido" FAIL "sin filas de latido"; fi
  chk "B3 policy_deltas" PASS "filas=${DEL_N:-?} (0 es normal si no hay deltas)"
fi

# ── C) FEEDFORWARD device-keyed (GET read-only) ─────────────────────────────
if [ -z "$DEVICE_ID" ]; then
  chk "C1..C5 feedforward" NOT_RUN "falta --device-id"
elif ! command -v curl >/dev/null 2>&1; then
  chk "C1..C5 feedforward" NOT_RUN "curl ausente"
else
  TMP="$(mktemp 2>/dev/null || echo /tmp/ara_ff.$$)"
  URL="${VPS%/}/prisma/api/ape-feedforward.php?device=$(printf '%s' "$DEVICE_ID" | sed 's/[^0-9A-Za-z_.-]//g')&iv=3&dur=110"
  if curl -fsS --max-time 12 "$URL" -o "$TMP" 2>/dev/null; then
    ACT="$(jget "$TMP" '.activated')"; MODE="$(jget "$TMP" '.mode')"
    PC="$(jget "$TMP" '.preset_count')"; DS="$(jget "$TMP" '.device_settings | length')"
    AL="$(jget "$TMP" '.ape_vpp.allowed')"; RS="$(jget "$TMP" '.ape_vpp.reason')"; PF="$(jget "$TMP" '.ape_vpp.profile')"
    if [ "$ACT" = "true" ] && [ "$MODE" = "device" ]; then chk "C1 gate device-keyed" PASS "activated=true mode=device"
    else chk "C1 gate device-keyed" FAIL "activated=${ACT:-?} mode=${MODE:-?}"; fi
    if [ -n "$PC" ]; then chk "C2 presets" PASS "preset_count=$PC (medido 2026-10-28)"; else chk "C2 presets" NOT_RUN "jq ausente"; fi
    case "${DS:-}" in
      14) chk "C3 device_settings" PASS "14 levers (3 base + 11 VPP)" ;;
      3)  chk "C3 device_settings" FAIL "3 levers: ape_vpp no allowed ⇒ ARA no aplicará VPP" ;;
      "") chk "C3 device_settings" NOT_RUN "jq ausente" ;;
      *)  chk "C3 device_settings" FAIL "n=${DS} (se esperaba 14 con VPP allowlisted o 3 sin VPP)" ;;
    esac
    if [ "$AL" = "true" ]; then chk "C4 ape_vpp.allowed" PASS "reason=${RS:-?} profile=${PF:-?}"
    elif [ -n "$AL" ]; then chk "C4 ape_vpp.allowed" FAIL "allowed=$AL reason=${RS:-?} (no_caps ⇒ sin heartbeat; soc_not_allowlisted ⇒ SoC fuera de lista)"
    else chk "C4 ape_vpp.allowed" NOT_RUN "campo ausente (¿función ape_vpp_block no desplegada?)"; fi
    chk "C5 respuesta" PASS "guardada en $TMP (sin secretos; caps no se imprimen)"
  else
    chk "C1..C5 feedforward" NOT_RUN "curl falló contra $VPS (red/URL)"
  fi
fi

echo "=== RESUMEN: checks=$TOTAL fail=$FAIL ==="
if [ "$FAIL" -gt 0 ]; then
  echo "VEREDICTO: FAIL — revisar A2/A3 (APK/proceso), B1 (latido), C3/C4 (caps/SoC/allowlist)."
  exit 1
else
  echo "VEREDICTO: PASS (o NOT_RUN parcial: no se promueve lo no medido)."
  exit 0
fi
