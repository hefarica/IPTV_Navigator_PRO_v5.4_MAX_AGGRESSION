#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# E6 · probe_vps.sh — SONDA READ-ONLY del borde para el PESO/ENTREGA de la lista
# ════════════════════════════════════════════════════════════════════════════
# Se ejecuta EN el VPS por stdin (`ssh root@... 'bash -s' < probe_vps.sh`).
#
# GARANTÍAS
#   · CERO escrituras: no se crea ni modifica ningún fichero (ni en /tmp).
#     Todo el cuerpo va a /dev/null o a un pipe, y las cabeceras a stdout.
#   · CERO cambios de configuración: solo GET/HEAD/OPTIONS contra 127.0.0.1:443
#     con `--resolve` (mismo vhost y TLS reales, sin salir a Internet).
#   · CERO mutaciones de estado: no se llama a /_ape/flags ni a ningún endpoint
#     con efectos. Solo se leen /proc/<pid>/stat, /var/log y los .conf vivos.
#
# QUÉ MIDE (FASE 5 · E6)
#   A · negociación gzip: qué recibe un cliente que pide gzip, identity, br,
#       gzip;q=0, o que NO envía Accept-Encoding
#   B · tamaño y digest REALES de cada representación (y coste CPU de nginx)
#   C · Range sobre el .gz: 206/200, Content-Range, bytes, validez del trozo
#   D · ETag / If-None-Match / If-Modified-Since → 304 (ambas representaciones)
#   E · estado de HTTP/2 (ALPN) y bytes de cabecera por petición
#
# SALIDA: bloques `### <caso>` + cabeceras crudas + líneas `W ...` de curl.
# El arnés Node (payload_edge.mjs) guarda esta salida tal cual como evidencia.
# ════════════════════════════════════════════════════════════════════════════
set -u
set -o pipefail

HOST=iptv-ape.duckdns.org
R="$HOST:443:127.0.0.1"
URL="https://$HOST/lists/APE_LISTA_4K.m3u8"
GZ=/var/www/html/lists/APE_LISTA_4K.m3u8.gz
STUB=/var/www/html/lists/APE_LISTA_4K.m3u8
FMT='W status=%{http_code} http=%{http_version} size=%{size_download} ttfb=%{time_starttransfer} total=%{time_total} speed=%{speed_download} redirects=%{num_redirects}\n'
MASTER=$(systemctl show nginx -p MainPID --value)

echo "PROBE_VERSION=1.0.0"
echo "DATE_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "MASTER_PID=$MASTER"
echo "CONF_DEFAULT_SHA=$(sha256sum /etc/nginx/sites-enabled/default | cut -d' ' -f1)"
echo "CONF_META_PLANE_SHA=$(sha256sum /etc/nginx/conf.d/50-ape-meta-plane.conf | cut -d' ' -f1)"
echo "CONF_META_PUBLIC_SHA=$(sha256sum /etc/nginx/snippets/ape-meta-public.conf | cut -d' ' -f1)"
echo "NGINX_T_SHA=$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"
echo "H2_LISTEN_COUNT=$(grep -RhsE 'listen .*443' /etc/nginx/sites-enabled/default /etc/nginx/conf.d/ 2>/dev/null | grep -c http2 || true)"
echo "STUB=$(stat -c 'size=%s mtime=%Y' "$STUB") stub_hex=$(head -c 8 "$STUB" | od -An -tx1 | tr -d ' \n')"
echo "GZ=$(stat -c 'size=%s mtime=%Y' "$GZ")"
echo "GZ_SHA256=$(sha256sum "$GZ" | cut -d' ' -f1)"
echo "DECOMPRESSED_SHA256=$(zcat "$GZ" | sha256sum | cut -d' ' -f1)"
echo "DECOMPRESSED_BYTES=$(zcat "$GZ" | wc -c | tr -d ' ')"
echo "DECOMPRESSED_LINES=$(zcat "$GZ" | wc -l | tr -d ' ')"

# CPU del árbol nginx (workers + cache manager/loader) — para atribuir coste
tree_cpu_ticks() {
  local total=0 p t
  for p in $(ps -o pid= --ppid "$MASTER" 2>/dev/null); do
    [ -r "/proc/$p/stat" ] || continue
    t=$(awk '{print $14+$15}' "/proc/$p/stat" 2>/dev/null) || continue
    total=$((total + ${t:-0}))
  done
  echo "$total"
}
HZ=$(getconf CLK_TCK 2>/dev/null || echo 100)

# ── helper: petición con cabeceras crudas ───────────────────────────────────
req() { # req <label> <curl-args...>
  local label="$1"; shift
  echo "### $label"
  echo "REQ_ARGS=$*"
  # shellcheck disable=SC2086
  curl -sS --resolve "$R" -D - -o /dev/null -w "$FMT" "$@" "$URL" 2>&1 \
    | sed -E 's/\r$//' | sed -E 's/^(date|server):.*$/\1: <omitido>/I'
  echo "### end $label"
}

# ── helper: cuerpo pequeño → hex + bytes + sha256 (sin ficheros) ────────────
body() { # body <label> <curl-args...>
  local label="$1"; shift
  echo "### $label"
  # shellcheck disable=SC2086
  local out
  out=$(curl -sS --resolve "$R" --max-time 30 "$@" "$URL" 2>/dev/null \
        | head -c 4096 | od -An -tx1 | tr -d '\n' | tr -s ' ')
  echo "BODY_HEX_HEAD=${out:0:320}"
  # shellcheck disable=SC2086
  local digest
  digest=$(curl -sS --resolve "$R" --max-time 60 "$@" "$URL" 2>/dev/null | sha256sum | cut -d' ' -f1)
  echo "BODY_SHA256=$digest"
  # shellcheck disable=SC2086
  local size
  size=$(curl -sS --resolve "$R" --max-time 60 -o /dev/null -w '%{size_download}' "$@" "$URL" 2>/dev/null)
  echo "BODY_BYTES=$size"
  echo "### end $label"
}

echo
echo "════ A · NEGOCIACIÓN gzip (HEAD: solo cabeceras) ════"
req "A1 HEAD sin Accept-Encoding"                 -I
req "A2 HEAD Accept-Encoding: identity"           -I -H 'Accept-Encoding: identity'
req "A3 HEAD Accept-Encoding: gzip"               -I -H 'Accept-Encoding: gzip'
req "A4 HEAD Accept-Encoding: gzip, deflate, br"  -I -H 'Accept-Encoding: gzip, deflate, br, zstd'
req "A5 HEAD Accept-Encoding: br (solo br)"       -I -H 'Accept-Encoding: br'
req "A6 HEAD Accept-Encoding: gzip;q=0"           -I -H 'Accept-Encoding: gzip;q=0'
req "A7 HEAD Accept-Encoding: gzip;q=0, identity" -I -H 'Accept-Encoding: gzip;q=0, identity'
req "A8 HEAD HTTP/1.0 (sin Host implícito keep-alive)" -I --http1.0

echo
echo "════ B · PESO REAL de cada representación (cuerpo completo, loopback) ════"
echo "### B1 GET gzip completo (coste CPU nginx)"
c0=$(tree_cpu_ticks); t0=$(date +%s%N)
curl -sS --resolve "$R" -o /dev/null -H 'Accept-Encoding: gzip' -w "$FMT" "$URL"
t1=$(date +%s%N); c1=$(tree_cpu_ticks)
echo "NGINX_CPU_TICKS=$((c1-c0)) HZ=$HZ NGINX_CPU_MS=$(( (c1-c0) * 1000 / HZ )) WALL_MS=$(( (t1-t0)/1000000 ))"
echo "### end B1"

echo "### B2 GET identity completo (ruta gunzip, coste CPU nginx)"
c0=$(tree_cpu_ticks); t0=$(date +%s%N)
curl -sS --resolve "$R" -o /dev/null -H 'Accept-Encoding: identity' -w "$FMT" "$URL"
t1=$(date +%s%N); c1=$(tree_cpu_ticks)
echo "NGINX_CPU_TICKS=$((c1-c0)) HZ=$HZ NGINX_CPU_MS=$(( (c1-c0) * 1000 / HZ )) WALL_MS=$(( (t1-t0)/1000000 ))"
echo "### end B2"

echo "### B3 GET sin cabecera Accept-Encoding (cliente legacy) — digest"
b3_digest=$(curl -sS --resolve "$R" --max-time 120 "$URL" | sha256sum | cut -d' ' -f1)
echo "BODY_SHA256=$b3_digest"
echo "### end B3"
echo "### B4 GET gzip — digest del cuerpo YA descomprimido por el cliente"
b4_digest=$(curl -sS --resolve "$R" --max-time 120 -H 'Accept-Encoding: gzip' "$URL" | gunzip -c | sha256sum | cut -d' ' -f1)
echo "BODY_SHA256=$b4_digest"
echo "### end B4"

echo
echo "════ C · RANGE sobre el .gz ════"
req "C1 GET Range 0-1023 + AE gzip"                  -r 0-1023 -H 'Accept-Encoding: gzip'
req "C2 GET Range 0-1023 + AE identity"              -r 0-1023 -H 'Accept-Encoding: identity'
req "C3 GET Range 0-1023 sin AE"                     -r 0-1023
req "C4 GET Range 100000000-100000999 + AE gzip"     -r 100000000-100000999 -H 'Accept-Encoding: gzip'
req "C5 GET Range -1024 (sufijo) + AE gzip"          -r -1024 -H 'Accept-Encoding: gzip'
req "C6 GET Range multi 0-99,200-299 + AE gzip"      -r 0-99,200-299 -H 'Accept-Encoding: gzip'
req "C7 GET Range 0-1023 + If-Range ETag fuerte"     -r 0-1023 -H 'Accept-Encoding: gzip' -H 'If-Range: "6adfb045-860b582"'
req "C8 GET Range 0-1023 + If-Range ETag ajeno"      -r 0-1023 -H 'Accept-Encoding: gzip' -H 'If-Range: "deadbeef-1"'
req "C9 HEAD Range 0-1023 + AE gzip"                 -I -r 0-1023 -H 'Accept-Encoding: gzip'
body  "C10 cuerpo de Range 0-1023 + AE gzip"         -r 0-1023 -H 'Accept-Encoding: gzip'
body  "C11 cuerpo de Range 100000000-100000999 + AE gzip" -r 100000000-100000999 -H 'Accept-Encoding: gzip'
echo "GZ_SLICE_100000000_1000_SHA256=$(tail -c +100000001 "$GZ" | head -c 1000 | sha256sum | cut -d' ' -f1)"
echo "GZ_SLICE_0_1024_SHA256=$(head -c 1024 "$GZ" | sha256sum | cut -d' ' -f1)"
echo "STUB_SHA256=$(sha256sum "$STUB" | cut -d' ' -f1)"

echo
echo "════ D · ETag / If-None-Match / If-Modified-Since → 304 ════"
LM=$(curl -sSI --resolve "$R" "$URL" | awk 'tolower($1)=="last-modified:"{sub(/\r$/,""); print substr($0,index($0,$2)); exit}')
ET=$(curl -sSI --resolve "$R" -H 'Accept-Encoding: gzip' "$URL" | awk 'tolower($1)=="etag:"{gsub(/\r/,""); print $2; exit}')
ETW=$(curl -sSI --resolve "$R" "$URL" | awk 'tolower($1)=="etag:"{gsub(/\r/,""); print $2; exit}')
echo "ETAG_GZIP=$ET"
echo "ETAG_GUNZIP=$ETW"
echo "LAST_MODIFIED=$LM"
req "D1 gzip + If-None-Match fuerte (el suyo)"        -H 'Accept-Encoding: gzip' -H "If-None-Match: $ET"
req "D2 gzip + If-None-Match débil"                   -H 'Accept-Encoding: gzip' -H "If-None-Match: $ETW"
req "D3 identity + If-None-Match débil (el suyo)"     -H 'Accept-Encoding: identity' -H "If-None-Match: $ETW"
req "D4 identity + If-None-Match fuerte (cruzado)"    -H 'Accept-Encoding: identity' -H "If-None-Match: $ET"
req "D5 sin AE + If-None-Match fuerte (cruzado)"      -H "If-None-Match: $ET"
req "D6 gzip + If-None-Match: *"                      -H 'Accept-Encoding: gzip' -H 'If-None-Match: *'
req "D7 gzip + If-None-Match ajeno"                   -H 'Accept-Encoding: gzip' -H 'If-None-Match: "deadbeef-1"'
req "D8 sin AE + If-Modified-Since = Last-Modified"   -H "If-Modified-Since: $LM"
req "D9 gzip + If-Modified-Since = Last-Modified"     -H 'Accept-Encoding: gzip' -H "If-Modified-Since: $LM"
req "D10 HEAD gzip + If-None-Match fuerte"            -I -H 'Accept-Encoding: gzip' -H "If-None-Match: $ET"
req "D11 HEAD identity + If-None-Match débil"         -I -H 'Accept-Encoding: identity' -H "If-None-Match: $ETW"
req "D12 gzip + INM fuerte + IMS"                     -H 'Accept-Encoding: gzip' -H "If-None-Match: $ET" -H "If-Modified-Since: $LM"
req "D13 Range 0-1023 + INM fuerte + If-Range"        -r 0-1023 -H 'Accept-Encoding: gzip' -H "If-None-Match: $ET" -H "If-Range: $ET"

echo
echo "════ E · HTTP/2 y cabeceras de petición ════"
echo "### E1 ALPN ofrecido [h2,http/1.1]"
echo | openssl s_client -connect 127.0.0.1:443 -servername "$HOST" -alpn 'h2,http/1.1' 2>/dev/null \
  | grep -aE 'ALPN protocol|Protocol *:|Cipher *:' | sed -E 's/^ *//'
echo "### end E1"
echo "### E2 ALPN ofrecido [h2] (estricto)"
echo | openssl s_client -connect 127.0.0.1:443 -servername "$HOST" -alpn 'h2' 2>/dev/null \
  | grep -aE 'ALPN protocol|alert|error' | sed -E 's/^ *//' | head -5
echo "### end E2"
req "E3 GET --http2 (curl del VPS)"                   --http2 -H 'Accept-Encoding: gzip'
req "E4 GET --http1.1"                                --http1.1 -H 'Accept-Encoding: gzip'
echo "### E5 tamaño de las cabeceras de petición (h1) que un cliente envía"
printf 'GET /lists/APE_LISTA_4K.m3u8 HTTP/1.1\r\nHost: %s\r\nUser-Agent: Mozilla/5.0 (Linux; Android 12) ExoPlayerLib/2.19.1\r\nAccept-Encoding: gzip\r\nConnection: keep-alive\r\n\r\n' "$HOST" | wc -c | xargs echo "H1_REQUEST_BYTES_UA_PLAYER="
echo "### end E5"

echo
echo "PROBE_RESULT=OK"
