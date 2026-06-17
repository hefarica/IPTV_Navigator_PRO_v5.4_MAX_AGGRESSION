#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# bootstrap_ara_android.sh — host-side bootstrap del ARA on-device (Council-safe).
# HONESTO: una playlist NO instala apps ni abre ADB. Esto requiere un host con ADB
# y el device YA AUTORIZADO (RSA/wireless-debugging). Si no -> ARA_BOOTSTRAP_REQUIRED.
# Empuja el agente CANÓNICO ape-qoe-agent.sh (QoE-up + SSE-down + FSM), NO un binario Go.
# El token NO va en argv: se escribe en un launcher 0700 con export.
# Uso:  ARA_TOKEN=xxxx ./bootstrap_ara_android.sh <ip:port>    (descubrir con `adb mdns services`)
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
DEV="${1:-}"
ADB="${ADB_PATH:-adb}"
command -v "$ADB" >/dev/null 2>&1 || ADB="/c/Android/platform-tools/adb"
ARA_ENDPOINT="${ARA_ENDPOINT:-https://iptv-ape.duckdns.org}"
ARA_TOKEN="${ARA_TOKEN:-}"
DEVICE_ID="${DEVICE_ID:-}"
CURL_BIN="${CURL_BIN:-}"                              # ruta a un curl estático arm64 (opcional, recomendado para SSE)
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/ape-qoe-agent.sh"                          # agente canónico (este repo)

[ -n "$DEV" ] || { echo "ARA_BOOTSTRAP_REQUIRED: pasa <ip:port> (descubre con: $ADB mdns services)" >&2; exit 2; }
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

echo "[bootstrap] device=$DEV endpoint=$ARA_ENDPOINT token=$([ -n "$ARA_TOKEN" ] && echo set || echo none)"
"$ADB" connect "$DEV" >/dev/null 2>&1 || true
state="$("$ADB" -s "$DEV" get-state 2>/dev/null || true)"
if [ "$state" != "device" ]; then
  echo "ARA_BOOTSTRAP_REQUIRED: ADB no autorizado/abierto para $DEV." >&2
  echo "  Habilita Depuración ADB/Wireless debugging + acepta el RSA una vez; luego reintenta." >&2
  echo "  (Una playlist/VPS NO puede otorgar permisos Android ni abrir ADB — sandbox.)" >&2
  exit 2
fi

"$ADB" -s "$DEV" shell 'mkdir -p /data/local/tmp/ape_ara_state' >/dev/null
"$ADB" -s "$DEV" push "$SRC" /data/local/tmp/ape-qoe-agent.sh >/dev/null
"$ADB" -s "$DEV" shell 'chmod 755 /data/local/tmp/ape-qoe-agent.sh' >/dev/null
if [ -n "$CURL_BIN" ] && [ -f "$CURL_BIN" ]; then
  "$ADB" -s "$DEV" push "$CURL_BIN" /data/local/tmp/curl >/dev/null
  "$ADB" -s "$DEV" shell 'chmod 755 /data/local/tmp/curl' >/dev/null
  echo "[bootstrap] static curl pushed (SSE-capable)"
else
  echo "[bootstrap] WARN: sin curl estático -> SSE-down (curl -N) puede no funcionar; QoE-up usa wget fallback. Pasa CURL_BIN=<arm64 curl> para SSE."
fi

# launcher con env (token NO en argv ni en el process list global)
tmp="$(mktemp)"
cat > "$tmp" <<EOF
#!/system/bin/sh
export ARA_ENDPOINT='$ARA_ENDPOINT'
export ARA_TOKEN='$ARA_TOKEN'
export CONVIVA_EP='$ARA_ENDPOINT/prisma/api/conviva-event'
$([ -n "$DEVICE_ID" ] && echo "export DEVICE_ID='$DEVICE_ID'")
exec /data/local/tmp/ape-qoe-agent.sh daemon
EOF
"$ADB" -s "$DEV" push "$tmp" /data/local/tmp/ara-run.sh >/dev/null
rm -f "$tmp"
"$ADB" -s "$DEV" shell 'chmod 700 /data/local/tmp/ara-run.sh; pgrep -f ape-qoe-agent.sh >/dev/null 2>&1 || nohup /data/local/tmp/ara-run.sh >/data/local/tmp/ape_ara_state/ara.log 2>&1 &' >/dev/null
echo "[bootstrap] ARA instalado/iniciado en $DEV"
"$ADB" -s "$DEV" shell '/data/local/tmp/ape-qoe-agent.sh selftest' || true
