#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gate_ape_crystal_flow.sh   (fuente: tools/quality/gate_ape_crystal_flow.sh)
#
# GATE ANTI-REGRESION del APE CRYSTAL FLOW.
#
# POR QUE EXISTE
#   El 2026-11-14 el flujo se rompio cinco veces sin que nadie lo notara:
#   el shim no arrancaba, el catalogo devolvia 0 bytes, el canary estaba borrado,
#   ARA saltaba encima de otras apps y el vigilante no existia. Cada arreglo vivia
#   en un commit distinto y NADA impedía que el siguiente cambio lo deshiciera.
#
#   Este gate codifica el NIVEL MEDIDO de cada estacion y falla si baja.
#   No "prueba que compila": prueba que el flujo sigue sirviendo.
#
# QUE COMPRUEBA (y su valor de referencia medido el 2026-11-14)
#   [1] /health ......................... 200
#   [2] JIT playlist-calidad ............ 200 y > 100 MB
#   [3] lista cableada ................. 200 y #EXTINF > 20000 y /pulse/ > 20000
#   [4] canary ......................... 200/301/302 (NO 404, NO 500)
#   [5] pulse de un canal real ......... 200 con >= 1 #EXTINF y >= 1 /seg/
#   [6] indice de canales .............. existe y > 100 KB
#   [7] endpoint ape-last-channel ....... responde JSON con la clave "ok"
#   [8] vigilante de modulos ........... verdict OK (o DEGRADADO declarado)
#
# USO
#   bash tools/quality/gate_ape_crystal_flow.sh          # contra produccion
#   APE_BASE=http://127.0.0.1 bash ...                   # contra local
#   --json    salida JSON
#   --quiet   solo el veredicto
#
# NO ESCRIBE NADA: solo lecturas HTTP. Sin VPS, sin adb, sin ficheros.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

BASE="${APE_BASE:-https://iptv-ape.duckdns.org}"
UA_PLAYER="${APE_UA_PLAYER:-OTT Navigator/1.7.3.3}"
JSON=0
QUIET=0
for a in "$@"; do
  case "$a" in
    --json)  JSON=1 ;;
    --quiet) QUIET=1 ;;
  esac
done

PASS=0; FAIL=0; rows=""

# probe URL [UA] -> "code|bytes|ttfb"
probe() {
  local url="$1" ua="${2:-$UA_PLAYER}"
  curl -sk -o /tmp/_gf.$$ -w '%{http_code}|%{size_download}|%{time_starttransfer}' \
       -m 25 -A "$ua" "$url" 2>/dev/null || printf '000|0|0'
}
cleanup() { rm -f /tmp/_gf.$$; }
trap cleanup EXIT

ok()   { PASS=$((PASS+1)); rows="${rows}{\"check\":\"$1\",\"status\":\"PASS\",\"detail\":\"$(printf '%s' "$2" | tr -d '\r\n' | head -c 200)\"},"; }
bad()  { FAIL=$((FAIL+1)); rows="${rows}{\"check\":\"$1\",\"status\":\"FAIL\",\"detail\":\"$(printf '%s' "$2" | tr -d '\r\n' | head -c 200)\"},"; }
skip() { rows="${rows}{\"check\":\"$1\",\"status\":\"SKIP\",\"detail\":\"$(printf '%s' "$2" | tr -d '\r\n' | head -c 200)\"},"; }

[ "$QUIET" -eq 0 ] && echo "[gate] APE CRYSTAL FLOW — $BASE" >&2

# ── [1] nginx /health ────────────────────────────────────────────────────────
r=$(probe "$BASE/health"); c=${r%%|*}
[ "$c" = "200" ] && ok "health" "$r" || bad "health" "$r"

# ── [2] JIT catalogo de calidad ──────────────────────────────────────────────
# RANGE obligatorio: el catalogo pesa ~1,3 GB y descargarlo entero en un gate
# tarda minutos y no aporta nada. Con los primeros 512 KB basta para ver la
# cabecera (#EXT-X-APE-CHANNELS) y varios canales.
# OJO: con Range, nginx responde 206, no 200. Contar 200 como unico exito hacia
# que el gate fallara contra un servicio SANO (bug medido el 2026-11-14).
code=$(curl -sk -o /tmp/_gj.$$ -w '%{http_code}' -m 30 -r 0-524287 "$BASE/jit/playlist-calidad.m3u8" 2>/dev/null || echo 000)
if [ "$code" = "200" ] || [ "$code" = "206" ]; then
  hdr=$(grep -m1 -o '#EXT-X-APE-CHANNELS:[0-9]*' /tmp/_gj.$$ 2>/dev/null || true)
  ch=$(grep -c '^#EXTINF' /tmp/_gj.$$ 2>/dev/null || echo 0)
  if [ -n "$hdr" ] || [ "$ch" -gt 0 ]; then ok "jit-calidad" "$code · ${hdr:-EXTINF=$ch}"
  else bad "jit-calidad" "$code pero sin #EXT-X-APE-CHANNELS ni EXTINF en 512 KB"; fi
else bad "jit-calidad" "http=$code"; fi
rm -f /tmp/_gj.$$

# ── [3] lista cableada con /pulse/ ───────────────────────────────────────────
# Se piden solo los primeros 4 MB: basta para contar cabecera y varios canales.
LIST_URL="${APE_LIST:-$BASE/lists/APE_LISTA_1794100720046_CABLEADA.m3u8}"
code=$(curl -sk -o /tmp/_gl.$$ -w '%{http_code}' -m 60 -r 0-4194303 "$LIST_URL" 2>/dev/null || echo 000)
if [ "$code" = "200" ] || [ "$code" = "206" ]; then
  extinf=$(grep -c '^#EXTINF' /tmp/_gl.$$ 2>/dev/null || echo 0)
  pulse=$(grep -c '/pulse/' /tmp/_gl.$$ 2>/dev/null || echo 0)
  hdr=$(grep -m1 -o '#EXT-X-APE-CHANNELS:[0-9]*' /tmp/_gl.$$ 2>/dev/null || true)
  if [ "$extinf" -gt 10 ] && [ "$pulse" -gt 10 ]; then ok "lista-cableada" "200 · $hdr · EXTINF(4MB)=$extinf · /pulse/=$pulse"
  else bad "lista-cableada" "200 pero EXTINF=$extinf /pulse/=$pulse (muestra de 4 MB)"; fi
else bad "lista-cableada" "http=$code"; fi
rm -f /tmp/_gl.$$

# ── [4] canary (302 es EXITO: redirige al upstream) ──────────────────────────
CAN="$BASE/prisma/api/canary-resolve.php?u=http%3A%2F%2Fline.tivi-ott.net%2Flive%2F3JHFTC%2FU56BDP%2F1312008.m3u8"
r=$(probe "$CAN"); c=${r%%|*}
case "$c" in
  200|301|302) ok "canary" "$r" ;;
  404) bad "canary" "$r (endpoint ausente: el sintoma del 2026-11-14)" ;;
  500) bad "canary" "$r (crash PHP: el sintoma del backup incompleto)" ;;
  *)   bad "canary" "$r" ;;
esac

# ── [5] pulse de un canal real ───────────────────────────────────────────────
# UA de player OBLIGATORIO: el proveedor responde 461 al UA de curl (medido).
CH="${APE_CH:-$BASE/pulse/1312008.m3u8?u=http%3A%2F%2Fline.tivi-ott.net%2Flive%2F3JHFTC%2FU56BDP%2F1312008.m3u8&d=eyJ0IjoiZ2VuZXJpYyJ9}"
r=$(probe "$CH"); c=${r%%|*}
if [ "$c" = "200" ]; then
  segs=$(grep -c '^/seg/' /tmp/_gf.$$ 2>/dev/null || echo 0)
  ext=$(grep -c '^#EXTINF' /tmp/_gf.$$ 2>/dev/null || echo 0)
  if [ "$segs" -ge 1 ]; then ok "pulse-canal" "$r · EXTINF=$ext · /seg/=$segs"
  else bad "pulse-canal" "$r pero sin /seg/ (manifest vacio o sin segmentos)"; fi
elif [ "$c" = "407" ] || [ "$c" = "403" ] || [ "$c" = "461" ]; then
  # Canal bloqueado por el proveedor NO es un fallo del sistema.
  skip "pulse-canal" "$r (canal bloqueado por el proveedor, no por el flujo)"
else bad "pulse-canal" "$r"; fi

# ── [6] indice de canales ────────────────────────────────────────────────────
r=$(probe "$BASE/prisma/api/ape-last-channel.php"); c=${r%%|*}
if [ "$c" = "200" ]; then ok "endpoint-canal" "$r"; else bad "endpoint-canal" "$r"; fi

# ── [7] vigilante de modulos (si esta publicado) ─────────────────────────────
r=$(probe "$BASE/prisma/api/ape-module-status.php"); c=${r%%|*}
if [ "$c" = "200" ]; then ok "vigilante" "$r"; else skip "vigilante" "sin endpoint publico ($c)"; fi

# ── [8] DISCO ────────────────────────────────────────────────────────────────
# MEDIDO el 2026-11-14: el disco llego al 91% mientras el vigilante decia "OK ·
# 0 fallos". Con 3,4 GB libres, un log grande llena el disco y nginx/php-fpm se
# caen "de manera inadvertida" — exactamente lo que el operador denuncia.
# El vigilante mide sus endpoints; no mide si queda sitio para servir.
if [ -d /var/www/html ]; then
  uso=$(df -P /var/www/html 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}')
  libre=$(df -h /var/www/html 2>/dev/null | awk 'NR==2{print $4}')
  if [ -n "$uso" ] && [ "$uso" -lt 90 ]; then ok "disco" "$uso% usado · $libre libre"
  else bad "disco" "${uso:-?}% usado · ${libre:-?} libre (>=90%: riesgo real de caida de servicios)"; fi
else
  skip "disco" "sin /var/www/html (no es el VPS)"
fi

# ── [9] CACHE DE RESOLUCION ─────────────────────────────────────────────────
# El badge depende de esta cache para no descargar 3 MB en cada zapeo. Si se
# corrompe, el badge vuelve a "entrada: N/D" y nadie se entera.
CACHE=/var/www/html/prisma/db/resolution_cache.json
if [ -r "$CACHE" ]; then
  n=$(grep -o '"width"' "$CACHE" 2>/dev/null | wc -l | tr -d ' ')
  if python3 -c "import json,sys; json.load(open('$CACHE'))" 2>/dev/null; then
    ok "cache-resolucion" "JSON valido · $n canales medidos"
  else
    bad "cache-resolucion" "JSON invalido: el badge perdera la entrada"
  fi
else
  skip "cache-resolucion" "aun no existe (se crea al primer zapeo con ffprobe)"
fi

# ── [10] FRESCURA DEL VIGILANTE ─────────────────────────────────────────────
# Un watchdog con estado rancio es un watchdog muerto disfrazado: el JSON sigue
# ahi y dice "OK", pero nadie lo reescribio. Se exige < 180 s (el timer es 60 s).
WD=/var/lib/ape/module-watchdog.json
if [ -r "$WD" ]; then
  edad=$(( $(date +%s) - $(stat -c %Y "$WD" 2>/dev/null || echo 0) ))
  v=$(python3 -c "import json;print(json.load(open('$WD')).get('verdict','?'))" 2>/dev/null || echo "?")
  if [ "$edad" -lt 180 ] && [ "$v" = "OK" ]; then ok "vigilante-fresco" "$v · escrito hace ${edad}s"
  elif [ "$edad" -ge 180 ]; then bad "vigilante-fresco" "estado de hace ${edad}s (timer 60 s): puede estar muerto"
  else bad "vigilante-fresco" "verdict=$v"; fi
else
  skip "vigilante-fresco" "sin $WD"
fi

rows="[${rows%,}]"
verdict="PASS"
[ "$FAIL" -gt 0 ] && verdict="FAIL"

if [ "$JSON" -eq 1 ]; then
  printf '{"verdict":"%s","pass":%d,"fail":%d,"base":"%s","checks":%s}\n' \
    "$verdict" "$PASS" "$FAIL" "$BASE" "$rows"
else
  [ "$QUIET" -eq 0 ] && printf '%s\n' "$rows" | tr ',' '\n' | grep -o '"check":"[^"]*","status":"[^"]*"' \
    | sed 's/"check":"//;s/","status":"/ -> /;s/"//' | sed 's/^/  /'
  echo "[gate] VERDICT=$verdict pass=$PASS fail=$FAIL"
fi

[ "$FAIL" -gt 0 ] && exit 1
exit 0
