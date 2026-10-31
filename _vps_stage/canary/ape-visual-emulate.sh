#!/usr/bin/env bash
# ape-visual-emulate.sh <session-id> — canary visual 4K de UN canal (FASE 1).
#
# GATE: no arranca sin `ara-skill check --for-canary` (además del ExecStartPre
# del unit). Salida aislada en /var/lib/ara/canary/<id>/; NO toca /lists/,
# /sync, /ara ni el catálogo global.
#
# Cadena (orden exacto): deblock → dering → yuv444p → Lanczos(3840x2160)
#   → grain → unsharp → eq → yuv420p
# `dering` no existe en ffmpeg 6.1 Ubuntu: se implementa con smartblur
# (edge-aware) y se declara como limitación; no se finge el filtro literal.
#
# Límites reales: 5 fps muestreados (no vivo 25/30), CPUQuota=40%, MemoryMax=1G,
# RuntimeMaxSec=300. Si no hay 4K o falla la cadena => exit != 0 (FAIL honesto).
set -euo pipefail

SESSION="${1:-}"
[ -n "$SESSION" ] || { echo "uso: $0 <session-id>" >&2; exit 2; }
[[ "$SESSION" =~ ^[A-Za-z0-9._-]{1,32}$ ]] || { echo "session-id inválido" >&2; exit 2; }

source /etc/ara/canary/env.common 2>/dev/null || true
SOURCE="${CANARY_SOURCE_URL:-}"
OUT="${CANARY_OUT_DIR:-/var/lib/ara/canary/$SESSION}"
SECONDS_OUT="${CANARY_SECONDS:-6}"
FPS="${CANARY_FPS:-5}"
TIMEOUT="${CANARY_TIMEOUT:-300}"

[ -n "$SOURCE" ] || { echo "CANARY_FAIL: falta CANARY_SOURCE_URL" >&2; exit 3; }
case "$SOURCE" in
  http://*|https://*) ;;
  *) echo "CANARY_FAIL: source no http(s)" >&2; exit 3 ;;
esac
[[ "$SOURCE" != *[[:space:]]* ]] || { echo "CANARY_FAIL: source con espacios" >&2; exit 3; }

# Gate obligatorio: si falta cualquier skill, NO se arranca.
/usr/local/bin/ara-skill check --for-canary >/dev/null || {
  echo "CANARY_FAIL: ara-skill check --for-canary" >&2
  exit 78
}

mkdir -p "$OUT"
chmod 0750 "$OUT" 2>/dev/null || true
rm -f "$OUT"/*.ts "$OUT"/*.m3u8 2>/dev/null || true
umask 027

# Etapas: deblock, dering(sustituto smartblur), yuv444p, Lanczos, grain(noise),
# unsharp, eq, yuv420p. NO reordenar.
DERING="smartblur=lr=1.5:ls=-0.5"
FILTERS="deblock,${DERING},format=yuv444p,scale=3840:2160:flags=lanczos,noise=alls=8:allf=t,unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.05:brightness=0.02:saturation=1.05,format=yuv420p"

echo "canary session=$SESSION fps=$FPS seconds=$SECONDS_OUT filters=deblock,dering(smartblur),yuv444p,lanczos,grain,unsharp,eq,yuv420p"
timeout "$TIMEOUT" ffmpeg -hide_banner -nostdin -loglevel error \
  -i "$SOURCE" \
  -t "$SECONDS_OUT" -r "$FPS" -an \
  -vf "$FILTERS" \
  -c:v libx265 -preset ultrafast -tune zerolatency \
  -x265-params pools=1:frame-threads=1 \
  -g 5 -keyint_min 5 -sc_threshold 0 \
  -f hls -hls_time 3 -hls_list_size 20 \
  -hls_flags independent_segments+delete_segments \
  "$OUT/out.m3u8" || { echo "CANARY_FAIL: ffmpeg" >&2; exit 4; }

SEG="$(ls -1t "$OUT"/*.ts 2>/dev/null | head -1 || true)"
[ -n "$SEG" ] || { echo "CANARY_FAIL: sin segmento" >&2; exit 5; }
WH="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$SEG" 2>/dev/null | head -1)"
[ "$WH" = "3840x2160" ] || { echo "CANARY_FAIL: segmento ${WH:-?} != 3840x2160" >&2; exit 6; }

printf '{"session":"%s","segment":"%s","width":3840,"height":2160,"fps":%s,"seconds":%s,"filters":"deblock,dering(smartblur),yuv444p,lanczos,grain,unsharp,eq,yuv420p"}\n' \
  "$SESSION" "$(basename "$SEG")" "$FPS" "$SECONDS_OUT" > "$OUT/status.json"
echo "CANARY_OK: $SEG 3840x2160 fps=$FPS"
exit 0
