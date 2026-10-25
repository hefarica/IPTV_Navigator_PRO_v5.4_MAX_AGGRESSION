#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE META-PLANE — smoke test (offline, sin tocar proveedores)
# ═══════════════════════════════════════════════════════════════════════════
# Verifica 4 invariantes del contrato metadata-only:
#   1. /__selftest.m3u8 devuelve 200 y header X-APE-Meta-Mode: rebase-only
#   2. la URI de variante sale ABSOLUTA (http://provider.test/live/user/pass/1.m3u8)
#   3. un segmento relativo sale ABSOLUTO
#   4. URI="key.bin" dentro de #EXT-X-KEY sale ABSOLUTA
#   5. .ts/.m4s responden 404 (el video no pasa por el plano)
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

BASE="${1:-http://127.0.0.1:8088}"
FAIL=0

hr() { printf '%s\n' "------------------------------------------------------------"; }

echo "== smoke $BASE =="
hr
echo "[1] /__selftest.m3u8 (status + header) — hasta 5 intentos (carrera con reload)"
HDRS=""
for try in 1 2 3 4 5; do
    HDRS="$(curl -s -D - -o /tmp/ape-selftest.m3u8 "$BASE/__selftest.m3u8" 2>/dev/null || true)"
    CODE="$(printf '%s' "$HDRS" | head -1 | awk '{print $2}')"
    [ "$CODE" = "200" ] && break
    sleep 1
done
MODE="$(printf '%s' "$HDRS" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-ape-meta-mode"{print $2}')"
echo "    status=$CODE mode=${MODE:-<none>} (intento $try)"
[ "$CODE" = "200" ] || { echo "    ✗ se esperaba 200"; FAIL=1; }
[ "$MODE" = "rebase-only" ] || { echo "    ✗ se esperaba X-APE-Meta-Mode: rebase-only"; FAIL=1; }

hr
echo "[2..4] contenido rebasado"
for needle in 'http://provider.test/live/user/pass/1.m3u8' 'http://provider.test/live/user/pass/1.ts' 'URI="http://provider.test/key.bin"'; do
    if grep -qF "$needle" /tmp/ape-selftest.m3u8; then
        echo "    ✓ $needle"
    else
        echo "    ✗ FALTA $needle"; FAIL=1
    fi
done

hr
echo "[5] candado de video"
for p in /x.ts /x.m4s /x.mp4 /foo.aac; do
    c="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p" || echo 000)"
    if [ "$c" = "404" ]; then echo "    ✓ $p -> 404"; else echo "    ✗ $p -> $c (debería ser 404)"; FAIL=1; fi
done

hr
echo "[6] sentinel (header_filter) + rebase (body_filter) + wake (log) — no interferencia"
FULL="$(curl -s -D /tmp/ape-full.hdr -o /tmp/ape-full.m3u8 -w '%{http_code}' "$BASE/__selftest_full.m3u8" || true)"
echo "    status=$FULL"
[ "$FULL" = "200" ] || { echo "    ✗ se esperaba 200"; FAIL=1; }
SENT="$(tr -d '\r' < /tmp/ape-full.hdr 2>/dev/null | awk -F': ' 'tolower($1)=="x-ape-sentinel"{print $2}')"
echo "    X-APE-Sentinel=${SENT:-<none>}"
if [ -n "$SENT" ]; then echo "    ✓ sentinel activo (passthrough)"; else echo "    ✗ falta X-APE-Sentinel"; FAIL=1; fi
if grep -qF 'http://provider.test/live/user/pass/1.m3u8' /tmp/ape-full.m3u8 2>/dev/null; then
    echo "    ✓ el rebase sigue correcto con los 3 módulos en el mismo location"
else
    echo "    ✗ el rebase se rompió al añadir los otros módulos"; FAIL=1
fi

hr
echo "[7] ape_wake_on_manifest (cola en /dev/shm, post-respuesta)"
Q=/dev/shm/ape_wake_queue
B0="$( [ -f "$Q" ] && wc -l < "$Q" || echo 0 )"
curl -s -o /dev/null "$BASE/__selftest_full.m3u8" || true
sleep 1
B1="$( [ -f "$Q" ] && wc -l < "$Q" || echo 0 )"
echo "    lineas en $Q: $B0 -> $B1"
if [ "$B1" -gt "$B0" ]; then echo "    ✓ encolado"; else echo "    ✗ no encoló"; FAIL=1; fi

hr
echo "[8] luatest — librerías cableadas (bw_adaptive_floor, ape_profile_resolver)"
LT="$(curl -s --max-time 10 "$BASE/_ape/luatest" || true)"
printf '%s' "$LT" | head -c 600; echo
if printf '%s' "$LT" | grep -q '"fail":0'; then
    echo "    ✓ 0 fallos"
else
    echo "    ✗ hay fallos o el endpoint no responde"; FAIL=1
fi

hr
echo "[9] flags en caliente"
FL="$(curl -s --max-time 5 "$BASE/_ape/flags" || true)"
echo "    $FL"
case "$FL" in *'"rebase"'*) echo "    ✓ endpoint de flags operativo";; *) echo "    ✗ flags no responde"; FAIL=1;; esac

hr
echo "[10] gateway multi-CDN: failover real (host muerto primero)"
HOSTPORT="$(printf '%s' "$BASE" | sed 's#^http://##')"
CDN_CODE="$(curl -s -D /tmp/ape-cdn.hdr -o /tmp/ape-cdn.m3u8 -w '%{http_code}' \
    "$BASE/cdn/127.0.0.1:1/__fixture.m3u8?alt=$HOSTPORT" || true)"
CDN_HOST="$(tr -d '\r' < /tmp/ape-cdn.hdr 2>/dev/null | awk -F': ' 'tolower($1)=="x-ape-cdn"{print $2}')"
CDN_FO="$(tr -d '\r' < /tmp/ape-cdn.hdr 2>/dev/null | awk -F': ' 'tolower($1)=="x-ape-failover"{print $2}')"
echo "    status=$CDN_CODE cdn=${CDN_HOST:-<none>} failover=${CDN_FO:-<none>}"
[ "$CDN_CODE" = "200" ] || { echo "    ✗ el failover no recuperó"; FAIL=1; }
[ "$CDN_HOST" = "$HOSTPORT" ] && echo "    ✓ sirvió desde el CDN alterno" || { echo "    ✗ X-APE-CDN incorrecto"; FAIL=1; }
[ "$CDN_FO" = "true" ] && echo "    ✓ failover detectado" || { echo "    ✗ no marcó failover"; FAIL=1; }
grep -qF "http://$HOSTPORT/__fixture.m3u8" /tmp/ape-cdn.m3u8 2>/dev/null \
    && echo "    ✓ URIs rebasadas al CDN ganador" || echo "    (sin URI relativa que rebasar: normal en este fixture)"

hr
echo "[11] LL-HLS: passthrough de partes + EXT-X-SERVER-CONTROL"
curl -s -o /tmp/ape-ll.m3u8 "$BASE/cdn/$HOSTPORT/__fixture_ll.m3u8" || true
if grep -q "#EXT-X-SERVER-CONTROL" /tmp/ape-ll.m3u8 2>/dev/null; then
    echo "    ✓ SERVER-CONTROL inyectado: $(grep -o '#EXT-X-SERVER-CONTROL:[^ ]*' /tmp/ape-ll.m3u8 | head -1)"
else
    echo "    ✗ falta #EXT-X-SERVER-CONTROL"; FAIL=1
fi
if grep -q "#EXT-X-PART:" /tmp/ape-ll.m3u8 2>/dev/null; then echo "    ✓ partes preservadas"; else echo "    ✗ se perdieron las partes"; FAIL=1; fi
grep -q "PART-HOLD-BACK=1.500" /tmp/ape-ll.m3u8 && echo "    ✓ PART-HOLD-BACK = 3×PART-TARGET" || { echo "    ✗ PART-HOLD-BACK incorrecto"; FAIL=1; }

hr
echo "[12] telemetría QoE + health"
QJ="$(curl -s --max-time 5 "$BASE/_ape/qoe" || true)"
HJ="$(curl -s --max-time 5 "$BASE/_ape/health" || true)"
echo "    qoe:    $(printf '%s' "$QJ" | head -c 180)"
echo "    health: $(printf '%s' "$HJ" | head -c 180)"
case "$QJ" in *'"plane"'*) echo "    ✓ /_ape/qoe responde";; *) echo "    ✗ /_ape/qoe no responde"; FAIL=1;; esac
case "$HJ" in *'"ok":true'*) echo "    ✓ /_ape/health ok";; *) echo "    ✗ /_ape/health no ok"; FAIL=1;; esac
case "$QJ" in *'"req"'*) echo "    ✓ contadores de peticiones presentes";; *) echo "    ✗ sin contadores"; FAIL=1;; esac

hr
echo "[13] UHD — 4K prevalece (RESOLUTION declarada, CODECS intacto)"
curl -s -o /tmp/ape-master.m3u8 "$BASE/cdn/$HOSTPORT/__fixture_master.m3u8" || true
if grep -q "RESOLUTION=3840x2160" /tmp/ape-master.m3u8 2>/dev/null; then
    echo "    ✓ RESOLUTION=3840x2160 declarada en la variante top"
else
    echo "    ✗ no declaró 4K"; FAIL=1
fi
if grep -q 'CODECS="avc1.640028' /tmp/ape-master.m3u8 2>/dev/null; then
    echo "    ✓ CODECS AVC intacto (sin riesgo de freeze FZ-01)"
else
    echo "    ✗ CODECS alterado — RIESGO DE FREEZE"; FAIL=1
fi
grep -q "#EXT-X-APE-UPSCALE:declared=3840x2160" /tmp/ape-master.m3u8 \
    && echo "    ✓ marca #EXT-X-APE-UPSCALE" || { echo "    ✗ falta la marca"; FAIL=1; }
grep -q "http://$HOSTPORT/1080p/index.m3u8" /tmp/ape-master.m3u8 \
    && echo "    ✓ variantes rebasadas/absolutas" || { echo "    ✗ rebase de variantes roto"; FAIL=1; }

hr
echo "[14] UHD automático — 4K real se declara 8K (CODECS intacto)"
curl -s -o /tmp/ape-master4k.m3u8 "$BASE/cdn/$HOSTPORT/__fixture_master4k.m3u8" || true
if grep -q "RESOLUTION=7680x4320" /tmp/ape-master4k.m3u8 2>/dev/null; then
    echo "    ✓ RESOLUTION=7680x4320 declarada (8K) sobre fuente 4K"
else
    echo "    ✗ no declaró 8K"; FAIL=1
fi
if grep -q 'CODECS="hvc1.2.4.L153.B0' /tmp/ape-master4k.m3u8 2>/dev/null; then
    echo "    ✓ CODECS HEVC real intacto (sin freeze)"
else
    echo "    ✗ CODECS alterado"; FAIL=1
fi
grep -q "#EXT-X-APE-UPSCALE:declared=7680x4320" /tmp/ape-master4k.m3u8 \
    && echo "    ✓ marca de 8K declarado" || { echo "    ✗ falta la marca 8K"; FAIL=1; }
grep -q "RESOLUTION=1920x1080" /tmp/ape-master4k.m3u8 \
    && echo "    ✓ variante 1080p de fallback preservada" || { echo "    ✗ perdió el fallback 1080p"; FAIL=1; }

hr
if [ "$FAIL" -eq 0 ]; then
    echo "RESULTADO: OK — contrato metadata-only verificado"
else
    echo "RESULTADO: FALLOS — revisar arriba"
fi
echo
echo "playlist devuelta:"; sed 's/^/    /' /tmp/ape-selftest.m3u8 2>/dev/null || true
exit "$FAIL"
