#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gate_no_focus_steal.sh   (fuente: tools/quality/gate_no_focus_steal.sh)
#
# GATE ANTI-REGRESION #1 — ARA NO PUEDE ROBAR EL FOCO.
#
# POR QUE EXISTE
#   El 2026-11-14 el operador reporto, literal:
#     "A CUALQUIER APLICACION QUE INGRESO, ME LLEVA AL APK ARA Y ENTRA AL MENU"
#   Se encontraron TRES causas, cada una en un commit distinto:
#     1) UpscaleBadgeActivity lanzada con startActivity desde el ticker de AgentService
#     2) CaptureWatchdogService.onForeground -> startActivity(ScreenCaptureActivity)
#     3) BootReceiver -> startActivity(ScreenCaptureActivity) al ACTION_BOOT_COMPLETED
#
#   El informe del arreglo del badge lo dejo escrito como riesgo residual:
#     "si una version futura vuelve a llamar startActivity(UpscaleBadgeActivity)
#      desde el ticker, el salto vuelve"
#
#   Este gate convierte esa advertencia en un fallo de build. No es documentacion:
#   es un test que rompe si la clase de bug vuelve.
#
# QUE COMPRUEBA (leyendo el codigo, sin ejecutar la app)
#   [1] AgentService.kt NO contiene ninguna llamada real a startActivity
#       (se ignoran comentarios y lineas de documentacion).
#   [2] CaptureWatchdogService.kt NO contiene ninguna llamada real a startActivity.
#   [3] BootReceiver.kt NO contiene ninguna llamada real a startActivity.
#   [4] El ticker de AgentService usa BadgeOverlay (el montaje sin Activity).
#   [5] BadgeOverlay.kt existe y usa WindowManager.addView con TYPE_APPLICATION_OVERLAY.
#   [6] UpscaleBadgeActivity.kt delega en BadgeOverlay y cierra con finish().
#
# COMO DISTINGUE CODIGO DE COMENTARIO
#   Se eliminan las lineas cuyo primer caracter no blanco es //, *, o /*. Las
#   menciones en documentacion (que existen a proposito, para explicar el bug) no
#   cuentan. Solo cuenta el codigo que se compila.
#
# USO
#   bash tools/quality/gate_no_focus_steal.sh [--json]
#   exit 0 = verde · exit 1 = alguien reintrodujo el salto
#
# NO compila ni toca el device: es estatico y tarda milisegundos.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="${APE_ANDROID_ROOT:-IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent}"
JSON=0
[ "${1:-}" = "--json" ] && JSON=1

PASS=0; FAIL=0; rows=""

ok()  { PASS=$((PASS+1)); rows="${rows}{\"check\":\"$1\",\"status\":\"PASS\",\"detail\":\"$2\"},"; }
bad() { FAIL=$((FAIL+1)); rows="${rows}{\"check\":\"$1\",\"status\":\"FAIL\",\"detail\":\"$2\"},"; }

# Devuelve las llamadas REALES a startActivity (sin comentarios) de un fichero.
real_startactivity() {
  local f="$1"
  [ -r "$f" ] || { echo ""; return; }
  grep -n 'startActivity' "$f" 2>/dev/null \
    | grep -vE '^[0-9]+:[[:space:]]*(\*|//|/\*)' \
    | grep -vE '^[0-9]+:[[:space:]]*$' \
    || true
}

echo "[focus-gate] raiz: $ROOT" >&2
if [ ! -d "$ROOT" ]; then
  bad "raiz" "no existe $ROOT (ejecutar desde la raiz del repo)"
else
  # ── [1] AgentService sin startActivity ────────────────────────────────────
  L=$(real_startactivity "$ROOT/AgentService.kt")
  if [ -z "$L" ]; then ok "AgentService-sin-startActivity" "0 llamadas reales"
  else bad "AgentService-sin-startActivity" "$(printf '%s' "$L" | head -3 | tr '\n' ' ')"; fi

  # ── [2] CaptureWatchdogService sin startActivity ──────────────────────────
  L=$(real_startactivity "$ROOT/CaptureWatchdogService.kt")
  if [ -z "$L" ]; then ok "Watchdog-sin-startActivity" "0 llamadas reales"
  else bad "Watchdog-sin-startActivity" "$(printf '%s' "$L" | head -3 | tr '\n' ' ')"; fi

  # ── [3] BootReceiver sin startActivity ────────────────────────────────────
  L=$(real_startactivity "$ROOT/BootReceiver.kt")
  if [ -z "$L" ]; then ok "Boot-sin-startActivity" "0 llamadas reales"
  else bad "Boot-sin-startActivity" "$(printf '%s' "$L" | head -3 | tr '\n' ' ')"; fi

  # ── [4] el ticker usa BadgeOverlay ────────────────────────────────────────
  if grep -q 'BadgeOverlay\.' "$ROOT/AgentService.kt" 2>/dev/null; then
    ok "ticker-usa-BadgeOverlay" "AgentService llama a BadgeOverlay"
  else
    bad "ticker-usa-BadgeOverlay" "AgentService NO llama a BadgeOverlay: el badge volveria por Activity"
  fi

  # ── [5] BadgeOverlay monta por WindowManager ──────────────────────────────
  BO="$ROOT/BadgeOverlay.kt"
  if [ -r "$BO" ] && grep -q 'TYPE_APPLICATION_OVERLAY' "$BO" && grep -q 'addView' "$BO"; then
    ok "BadgeOverlay-WindowManager" "existe y usa addView + TYPE_APPLICATION_OVERLAY"
  else
    bad "BadgeOverlay-WindowManager" "falta BadgeOverlay.kt o no usa WindowManager.addView"
  fi

  # ── [6] UpscaleBadgeActivity delega y cierra ──────────────────────────────
  UB="$ROOT/UpscaleBadgeActivity.kt"
  if [ -r "$UB" ] && grep -q 'BadgeOverlay' "$UB" && grep -q 'finish()' "$UB"; then
    ok "BadgeActivity-delega" "delega en BadgeOverlay y cierra con finish()"
  else
    bad "BadgeActivity-delega" "UpscaleBadgeActivity no delega o no cierra"
  fi
fi

rows="[${rows%,}]"
verdict="PASS"; [ "$FAIL" -gt 0 ] && verdict="FAIL"

if [ "$JSON" -eq 1 ]; then
  printf '{"verdict":"%s","pass":%d,"fail":%d,"checks":%s}\n' "$verdict" "$PASS" "$FAIL" "$rows"
else
  printf '%s\n' "$rows" | tr ',' '\n' | grep -o '"check":"[^"]*","status":"[^"]*"' \
    | sed 's/"check":"//;s/","status":"/ -> /;s/"//' | sed 's/^/  /'
  echo "[focus-gate] VERDICT=$verdict pass=$PASS fail=$FAIL"
fi
[ "$FAIL" -gt 0 ] && exit 1
exit 0
