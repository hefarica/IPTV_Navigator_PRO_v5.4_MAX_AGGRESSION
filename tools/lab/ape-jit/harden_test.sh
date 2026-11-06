#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# harden_test.sh — prueba el hardening de /opt/ape-jit/server.js SIN TOCAR PROD
# ═══════════════════════════════════════════════════════════════════════════════
# Aislamiento total: puerto 3098, OUT_ROOT propio, ffmpeg/ffprobe falsos en PATH.
# El servicio real (3099) no se toca en ningun momento.
#
# El fake-ffmpeg reproduce el ciclo REAL que fallaba: escribe chunk-*.m4s.tmp,
# espera, y renombra. Si el directorio desaparece bajo sus pies, el rename falla
# con ENOENT — exactamente el sintoma medido en produccion.
#
# PROPIEDADES QUE VERIFICA
#   P1  el dir NO se borra bajo los pies de ffmpeg       (bug A)
#   P2  start() no limpia un dir pendiente de reaping    (bug B)
#   P3  exit de un hijo viejo no borra el dir de uno nuevo (bug C)
#   P4  el idle no mata antes de que exista output       (bug D)
#   P5  NUNCA hay dos ffmpeg vivos (max_connections=1)   (slot unico)
#
# Uso: bash harden_test.sh <server.js>
set -u

SRC="${1:-/tmp/ape-jit-test/server.js}"
ROOT=/tmp/ape-jit-test
PORT=3098
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL  $1${2:+   [$2]}"; }

rm -rf "$ROOT"; mkdir -p "$ROOT/bin" "$ROOT/out"
cp "$SRC" "$ROOT/server.js"

# ── ffprobe falso ────────────────────────────────────────────────────────────
cat > "$ROOT/bin/ffprobe" <<'FP'
#!/bin/bash
case "$*" in
  *"a:0"*) echo '{"streams":[{"codec_name":"aac","channels":2,"sample_rate":48000}]}' ;;
  *) echo '{"streams":[{"width":3840,"height":2160,"codec_name":"hevc","color_transfer":"smpte2084","color_primaries":"bt2020"}]}' ;;
esac
FP
chmod +x "$ROOT/bin/ffprobe"

# ── ffmpeg falso: reproduce el .tmp + rename ─────────────────────────────────
cat > "$ROOT/bin/ffmpeg" <<'FF'
#!/bin/bash
DIR="$PWD"
echo "$" >> /tmp/ape-jit-test/pids.txt
sleep "${FIRST_CHUNK_DELAY:-0}"
echo "fake-ffmpeg start $$ in $DIR" >&2
echo '<MPD/>' > "$DIR/manifest.mpd"
printf '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-MAP:URI="init-0.m4s"\n#EXTINF:5,\nchunk-0-1.m4s\n' > "$DIR/master.m3u8"
printf 'ftypisom' > "$DIR/init-0.m4s"
# SIGTERM lento a proposito: es lo que hacia ffmpeg real y disparaba el ENOENT
trap 'sleep 3; exit 0' TERM
for i in $(seq 1 200); do
  printf 'chunk %s payload' "$i" > "$DIR/chunk-0-$i.m4s.tmp"
  sleep 0.25
  if ! mv "$DIR/chunk-0-$i.m4s.tmp" "$DIR/chunk-0-$i.m4s" 2>/dev/null; then
    echo "FFMPEG failed to rename chunk-0-$i.m4s.tmp to chunk-0-$i.m4s: No such file or directory" >&2
    exit 1
  fi
  sleep 0.75
done
FF
chmod +x "$ROOT/bin/ffmpeg"

cat > "$ROOT/channels.json" <<'MP'
{"1":{"url":"http://fake.local/1.m3u8","ua":"VLC/3.0.19"},"2":{"url":"http://fake.local/2.m3u8","ua":"VLC/3.0.19"}}
MP

echo "══════════════════════════════════════════════════════════════════"
echo "  HARDENING TEST — aislado en :$PORT  (prod :3099 intacto)"
echo "══════════════════════════════════════════════════════════════════"

PATH="$ROOT/bin:$PATH" \
PORT=$PORT BIND=127.0.0.1 \
MAP_FILE="$ROOT/channels.json" \
OUT_ROOT="$ROOT/out" \
IDLE_MS=${TEST_IDLE_MS:-20000} BOOT_GRACE_MS=${TEST_BOOT_GRACE_MS:-45000} WAIT_MS=30000 \
STOP_GRACE_MS=6000 \
node "$ROOT/server.js" > "$ROOT/server.log" 2>&1 &
SRV=$!
sleep 1.2
if ! kill -0 $SRV 2>/dev/null; then
  bad "el servidor arranca" "$(tail -3 "$ROOT/server.log" | tr '\n' ' ')"
  echo "  TOTAL PASS=$PASS FAIL=$FAIL"; exit 1
fi
ok "el servidor arranca en :$PORT"

# ── P1+P4: arrancar un canal y dejar que escriba ─────────────────────────────
curl -s -o /dev/null -m 12 "http://127.0.0.1:$PORT/live/1/master.m3u8"
D1="$ROOT/out/1"
sleep $(( ${FIRST_CHUNK_DELAY:-0} + 3 ))
N1=$(find "$D1" -name '*.m4s' 2>/dev/null | wc -l)
[ "$N1" -ge 1 ] && ok "P1/P4 el primer chunk existe ($N1 .m4s) — el idle no lo mato antes de nacer" \
                || bad "P1/P4 el primer chunk existe" "n=$N1"

# P1: sobrevivir al menos 2 escrituras (si el dir se borrara, el rename fallaria)
sleep 2.5
N2=$(find "$D1" -name '*.m4s' 2>/dev/null | wc -l)
[ "$N2" -gt "$N1" ] && ok "P1 el dir sobrevive y sigue creciendo ($N1 -> $N2)" \
                    || bad "P1 el dir sobrevive y sigue creciendo" "$N1 -> $N2"
ERRS=$(grep -c "failed to rename" "$ROOT/server.log" 2>/dev/null || true); ERRS=${ERRS:-0}
[ "$ERRS" -eq 0 ] && ok "P1 cero 'failed to rename' (era el sintoma raiz)" || bad "P1 cero 'failed to rename'" "$ERRS"

# ── P5: switch de canal -> jamas 2 hijos vivos ──────────────────────────────
BEFORE=$(wc -l < "$ROOT/pids.txt" 2>/dev/null || true); BEFORE=${BEFORE:-0}
curl -s -o /dev/null -m 12 "http://127.0.0.1:$PORT/live/2/master.m3u8"
MAXKIDS=0
for i in $(seq 1 24); do
  K=$(pgrep -fc "$ROOT/bin/ffmpeg" 2>/dev/null || true); K=${K:-0}
  [ "$K" -gt "$MAXKIDS" ] && MAXKIDS=$K
  sleep 0.25
done
[ "$MAXKIDS" -le 1 ] && ok "P5 NUNCA mas de 1 ffmpeg vivo (slot unico, max_connections=1) max=$MAXKIDS" \
                     || bad "P5 NUNCA mas de 1 ffmpeg vivo" "max=$MAXKIDS"
D2="$ROOT/out/2"
sleep $(( ${FIRST_CHUNK_DELAY:-0} + 3 ))
M2=$(find "$D2" -name '*.m4s' 2>/dev/null | wc -l)
[ "$M2" -ge 1 ] && ok "P3 el canal 2 arranca y escribe ($M2 .m4s)" || bad "P3 el canal 2 arranca y escribe" "n=$M2"
ERRS2=$(grep -c "failed to rename" "$ROOT/server.log" 2>/dev/null || true); ERRS2=${ERRS2:-0}
[ "$ERRS2" -eq 0 ] && ok "P2/P3 cero 'failed to rename' tambien en el switch" || bad "P2/P3 cero rename en switch" "$ERRS2"

# ── el servidor sigue vivo ──────────────────────────────────────────────────
kill -0 $SRV 2>/dev/null && ok "el servidor sigue vivo tras todo el ciclo" || bad "el servidor sigue vivo"
curl -s -o /dev/null -m 5 -w '' "http://127.0.0.1:$PORT/capabilities.json" && ok "responde capabilities.json" || bad "responde capabilities.json"

# ── limpieza ────────────────────────────────────────────────────────────────
kill -TERM $SRV 2>/dev/null; sleep 2; kill -9 $SRV 2>/dev/null
pkill -f "$ROOT/bin/ffmpeg" 2>/dev/null

echo "──────────────────────────────────────────────────────────────────"
echo "  eventos del log:"
grep -oE 'START|STOP|EXIT|SLOT_TIMEOUT|BOOT_TIMEOUT|DEFER_CLEAN|START_FAIL|SPAWN_ERROR' "$ROOT/server.log" 2>/dev/null | sort | uniq -c | sed 's/^/    /'
echo "──────────────────────────────────────────────────────────────────"
echo "  TOTAL  PASS=$PASS  FAIL=$FAIL"
echo "══════════════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
