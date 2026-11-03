#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E2 · FASE 1 — VERIFICACIÓN HTTP/2 (lista + 3 manifiestos) Y HTTP/1.1
# ═══════════════════════════════════════════════════════════════════════════
# EJECUTAR EN EL VPS (usa curl 8.5.0 con nghttp2; el curl de Windows no tiene h2):
#   ssh root@178.156.147.234 'bash -s' < _vps_stage/edge/phase1/verify_phase1_http2.sh
#
# Solo lecturas: curl -I/GET, openssl s_client, nginx -t, nginx -T.
# Los 3 canales se descubren de la lista CDN viva; las credenciales se REDACTAN
# en la salida (se piden con la URL real, nunca se imprimen).
# ═══════════════════════════════════════════════════════════════════════════
set -u
HOST="iptv-ape.duckdns.org"
BASE="https://${HOST}"
LIST="/lists/APE_LISTA_4K.m3u8"
LIST_GZ="/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz"
CHANNEL_IDS="3 5 6"
N=3

say() { printf '%s\n' "$*"; }

say "===== E2 FASE 1 · VERIFICACIÓN HTTP/2 ====="
say "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
say

say "--- nginx -t / estado ---"
nginx -t 2>&1 | sed 's/^/    /'
systemctl show nginx -p MainPID -p NRestarts -p ActiveEnterTimestamp | sed 's/^/    /'
say "    active=$(systemctl is-active nginx)"
say

say "--- listeners 443 en la config EFECTIVA ---"
nginx -T 2>/dev/null | grep 'listen .*443' | sed 's/^/    /'
say "    líneas con http2: $(nginx -T 2>/dev/null | grep -c 'listen .*443 .*http2')"
say

say "--- ALPN (openssl s_client, loopback) ---"
echo | openssl s_client -connect 127.0.0.1:443 -servername "$HOST" -alpn h2,http/1.1 2>/dev/null \
  | grep -aE 'ALPN protocol|Protocol *:|Cipher *:' | sed 's/^/    /'
say

say "--- LISTA: HEAD por protocolo (N=$N) ---"
for proto in http2 http1.1; do
  flag="--$proto"
  i=0
  while [ "$i" -lt "$N" ]; do
    i=$((i+1))
    r="$(curl -sS -I "$flag" -m 20 -o /dev/null -w '%{http_version} %{http_code} %{time_starttransfer}' "$BASE$LIST" 2>&1 || true)"
    say "    $proto #$i: $r"
    sleep 0.2
  done
done
say "--- LISTA: representación gzip por h2 (HEAD, Content-Length debe ser el .gz) ---"
curl -sS -I --http2 -m 20 -H 'Accept-Encoding: gzip' -o /dev/null \
  -w '    h2+gzip: %{http_version} %{http_code} ttfb=%{time_starttransfer}\n' "$BASE$LIST" 2>&1 || true
say

say "--- CANALES /cdn/: GET por h2 (N=$N) + 1 por h1 ---"
for id in $CHANNEL_IDS; do
  url="$(zcat "$LIST_GZ" 2>/dev/null | grep -m1 -E "^https://iptv-ape\\.duckdns\\.org/cdn/line\\.tivi-ott\\.net/.*/${id}\\.m3u8$")"
  if [ -z "$url" ]; then
    say "    canal $id: NO ENCONTRADO en la lista CDN"
    continue
  fi
  redacted="$(printf '%s' "$url" | sed -E 's#/live/[^/]+/[^/]+/#/live/<USER>/<PASS>/#')"
  say "    canal $id: $redacted"
  i=0
  while [ "$i" -lt "$N" ]; do
    i=$((i+1))
    h="$(mktemp)"; b="$(mktemp)"
    r="$(curl -sS --http2 -m 30 -D "$h" -o "$b" -w '%{http_version} %{http_code} %{time_starttransfer} %{size_download}' "$url" 2>&1 || true)"
    up="$(tr -d '\r' < "$h" | awk 'tolower($1) == "x-ape-upstream-ms:" { print $2; exit }')"
    sha="$(sha256sum "$b" | cut -d' ' -f1)"
    say "      h2 #$i: $r upstream_ms=${up:-?} sha=${sha:0:12}"
    rm -f "$h" "$b"
    sleep 0.25
  done
  r1="$(curl -sS --http1.1 -m 30 -o /dev/null -w '%{http_version} %{http_code} %{time_starttransfer} %{size_download}' "$url" 2>&1 || true)"
  say "      h1 #1: $r1"
  sleep 0.25
done
say

say "--- HTTP/1.1 sigue funcionando (lista, HEAD) ---"
curl -sS -I --http1.1 -m 20 -o /dev/null \
  -w '    h1 lista: %{http_version} %{http_code} ttfb=%{time_starttransfer}\n' "$BASE$LIST" 2>&1 || true
say

say "--- error.log: menciones HTTP/2 (debe estar vacío) ---"
if grep -iE 'http2|HTTP/2' /var/log/nginx/error.log 2>/dev/null | tail -10 | grep -q .; then
  grep -iE 'http2|HTTP/2' /var/log/nginx/error.log 2>/dev/null | tail -10 | sed 's/^/    /'
else
  say "    (sin menciones)"
fi
say
say "RESULT=DONE"
