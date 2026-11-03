#!/usr/bin/env bash
# ============================================================================
# E9 - VERIFICACION INDEPENDIENTE DE INVARIANTES (READ-ONLY)  v1.0.0
# ----------------------------------------------------------------------------
# Ejecutar SOLO como lectura en el VPS:
#   STAMP=<utc> ssh root@178.156.147.234 'STAMP=$STAMP bash -s' < e9_invariants.sh
# NO escribe nada persistente: usa un mktemp -d y lo borra al salir.
# Salida: lineas KEY=VALUE (estables) + secciones '## X' + listas 'item:'.
# ============================================================================
set -uo pipefail

STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
GZ=/var/www/html/lists/APE_LISTA_4K.m3u8.gz
STUB=/var/www/html/lists/APE_LISTA_4K.m3u8
GZCDN=/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz
BAK=/root/backups/edge-e1-20261026T205255Z      # pre-FASE-1, post-seguridad
GWB=/root/backups/ape_gateway.lua.bak_20261026T204957Z
TMP="$(mktemp -d /tmp/e9-inv-XXXXXX)" || exit 1
trap 'rm -rf "$TMP"' EXIT

say() { printf '%s\n' "$*"; }
h()   { if [ -e "$2" ]; then printf '%s=%s\n' "$1" "$(sha256sum "$2" | cut -d' ' -f1)"; else printf '%s=MISSING\n' "$1"; fi; }
st()  { if [ -e "$2" ]; then printf '%s=%s\n' "$1" "$(stat -c '%s' "$2")"; else printf '%s=MISSING\n' "$1"; fi; }

say "## A - META"
say "stamp_utc=$STAMP"
say "date_utc=$(date -u +%FT%TZ)"
say "host=$(hostname)"
say "kernel=$(uname -r)"
say "os=$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
say "nginx_version=$(nginx -v 2>&1 | sed 's/^nginx version: //')"
say "nginx_t=$(nginx -t 2>&1 | tr '\n' '|')"
say "mainpid=$(systemctl show nginx -p MainPID --value)"
say "nrestarts=$(systemctl show nginx -p NRestarts --value)"
say "active_enter=$(systemctl show nginx -p ActiveEnterTimestamp --value)"

nginx -T 2>/dev/null > "$TMP/T.conf"
say "nginx_T_sha256=$(sha256sum "$TMP/T.conf" | cut -d' ' -f1)"
say "nginx_T_bytes=$(stat -c %s "$TMP/T.conf")"
say "nginx_T_lines=$(wc -l < "$TMP/T.conf")"
say "h2_listen443_count=$(grep -cE 'listen (\[::\]:)?443 ssl http2' "$TMP/T.conf")"
say "listen443_total=$(grep -cE 'listen (\[::\]:)?443 ' "$TMP/T.conf")"

say ""
say "## B - HASHES DE CONFIG VIVA (sha256)"
h conf_default           /etc/nginx/sites-enabled/default
st conf_default_bytes    /etc/nginx/sites-enabled/default
h conf_nginx             /etc/nginx/nginx.conf
h conf_meta_plane        /etc/nginx/conf.d/50-ape-meta-plane.conf
h conf_meta_public       /etc/nginx/snippets/ape-meta-public.conf
h lua_gateway            /etc/nginx/lua/ape_gateway.lua
h lua_uhd                /etc/nginx/lua/ape_uhd.lua
h lua_rebase_lib         /etc/nginx/lua/ape_rebase_lib.lua
h lua_uri_rebase         /etc/nginx/lua/ape_uri_rebase.lua
h lua_obs                /etc/nginx/lua/ape_obs.lua
h lua_lab_bridge         /etc/nginx/lua/ape_lab_bridge.lua
h lua_header             /etc/nginx/lua/ape_header.lua
h lua_wake               /etc/nginx/lua/ape_wake_on_manifest.lua
h lua_bw_floor           /etc/nginx/lua/bw_adaptive_floor.lua
h lua_sentinel_guard     /etc/nginx/lua/sentinel_auth_guard.lua
h lua_profile_resolver   /etc/nginx/lua/ape_profile_resolver.lua
say "lua_file_count=$(ls -1 /etc/nginx/lua/*.lua | wc -l)"
say "lua_dir_digest=$(cd /etc/nginx/lua && sha256sum *.lua | sort -k2 | sha256sum | cut -d' ' -f1)"

say ""
say "## C - HASHES DE DATOS PROHIBIDOS (/var/www/lists, listas servidas, PHP del resolver)"
h list_4k_stub           "$STUB"
st list_4k_stub_bytes    "$STUB"
h list_4k_gz             "$GZ"
st list_4k_gz_bytes      "$GZ"
say "list_4k_gz_mtime_epoch=$(stat -c %Y "$GZ")"
h list_cdn_gz            "$GZCDN"
st list_cdn_gz_bytes     "$GZCDN"
say "lists_dir_file_count=$(find /var/www/lists -maxdepth 1 -type f | wc -l)"
say "lists_dir_digest=$(find /var/www/lists -maxdepth 1 -type f -printf '%f\n' | sort | while read -r f; do sha256sum "/var/www/lists/$f" 2>/dev/null | cut -d' ' -f1; done | sha256sum | cut -d' ' -f1)"
h php_resolve            /var/www/html/resolve.php
st php_resolve_bytes     /var/www/html/resolve.php
h php_resolve_unified    /var/www/html/resolve_quality_unified.php
h php_resolve_quality    /var/www/html/resolve_quality.php
h php_origins            /etc/ape/origins.php
st php_origins_bytes     /etc/ape/origins.php
h php_lists_resolve      /var/www/lists/resolve.php
st php_lists_resolve_bytes /var/www/lists/resolve.php
say "origins_mode=$(stat -c '%a %U:%G' /etc/ape/origins.php)"
say "lists_resolve_mode=$(stat -c '%a %U:%G' /var/www/lists/resolve.php)"

say ""
say "## D - DIFF CONTRA PRE-FASE-1 (nginx -T y default) - debe ser SOLO los 2 listen"
if [ -r "$BAK/nginx-T.conf" ]; then
  say "diff_T_vs_pre_phase1_lines=$(diff -u "$BAK/nginx-T.conf" "$TMP/T.conf" | grep -cE '^[+-][^+-]')"
  say "diff_T_begin"
  diff -u "$BAK/nginx-T.conf" "$TMP/T.conf" | grep -E '^[+-][^+-]' | sed 's/^/diffT: /'
  say "diff_T_end"
else
  say "diff_T_vs_pre_phase1_lines=BACKUP_MISSING"
fi
if [ -r "$BAK/etc/nginx/sites-enabled/default.bak_20261026T205255Z" ]; then
  say "diff_default_lines=$(diff -u "$BAK/etc/nginx/sites-enabled/default.bak_20261026T205255Z" /etc/nginx/sites-enabled/default | grep -cE '^[+-][^+-]')"
  say "diff_default_begin"
  diff -u "$BAK/etc/nginx/sites-enabled/default.bak_20261026T205255Z" /etc/nginx/sites-enabled/default | grep -E '^[+-][^+-]' | sed 's/^/diffD: /'
  say "diff_default_end"
else
  say "diff_default_lines=BACKUP_MISSING"
fi

say ""
say "## E - DIFF DEL HOTFIX LUA (gateway vivo vs backup pre-hotfix) - debe ser SOLO el breaker"
if [ -r "$GWB" ]; then
  say "diff_gateway_lines=$(diff -u "$GWB" /etc/nginx/lua/ape_gateway.lua | grep -cE '^[+-][^+-]')"
  say "diff_gateway_begin"
  diff -u "$GWB" /etc/nginx/lua/ape_gateway.lua | grep -E '^[+-][^+-]' | sed 's/^/diffG: /'
  say "diff_gateway_end"
else
  say "diff_gateway_lines=BACKUP_MISSING"
fi

say ""
say "## F - GREPS DE INVARIANTES EN LA CONFIG RENDERIZADA (nginx -T)"
say "g_gzip_static=$(grep -c 'gzip_static' "$TMP/T.conf")"
say "g_gunzip=$(grep -c 'gunzip' "$TMP/T.conf")"
say "g_cors_acao=$(grep -ci 'Access-Control-Allow-Origin' "$TMP/T.conf")"
say "g_cdn_ts_rule=$(grep -cE 'location ~ \^/cdn/\.\*\\\.\(ts\|m4s\|mp4\)\$' "$TMP/T.conf")"
say "g_ts_rule_any=$(grep -cE '\\\.\(ts\|m4s\|mp4\)\$' "$TMP/T.conf")"
say "g_meta_ts_rule=$(grep -cE '^\\s*location ~ \\\.\(ts\|m4s\|mp4\)\$' "$TMP/T.conf")"
say "g_upload403=$(grep -c 'location = /upload.php' "$TMP/T.conf")"
say "g_ssrf_cdn=$(grep -cE 'location ~ \^/cdn/\(127' "$TMP/T.conf")"
say "g_proxy_8088=$(grep -c 'proxy_pass http://127.0.0.1:8088' "$TMP/T.conf")"
say "g_lists_location=$(grep -cE 'location (\^~|=) /lists/' "$TMP/T.conf")"
say "g_cdn_location=$(grep -cE 'location ~ \^/cdn/' "$TMP/T.conf")"
say "g_proxy_cache=$(grep -c 'proxy_cache ' "$TMP/T.conf")"
say "g_proxy_cache_valid_302=$(grep -cE 'proxy_cache_valid[^;]*302' "$TMP/T.conf")"
say "invariant_lines_begin"
grep -nE 'location = /upload.php|return 403|\\\.\(ts\|m4s\|mp4\)\$|gzip_static|gunzip|Access-Control-Allow-Origin' "$TMP/T.conf" | sed 's/^/inv: /'
say "invariant_lines_end"

say ""
say "## G - LUA: exit 503 / breaker / CODECS"
say "lua_exit503_count=$(grep -rn 'ngx.exit(503)\|HTTP_SERVICE_UNAVAILABLE' /etc/nginx/lua/ | wc -l)"
say "lua_exit503_lines_begin"
grep -rn 'ngx.exit(503)\|HTTP_SERVICE_UNAVAILABLE' /etc/nginx/lua/ | sed 's/^/exit503: /' || true
say "lua_exit503_lines_end"
say "lua_breaker_marks_begin"
grep -rnE 'HOSTS:set|HOSTS:get|host_down|all_upstreams_failed|breaker|down:' /etc/nginx/lua/*.lua | sed 's/^/breaker: /' || true
say "lua_breaker_marks_end"
say "lua_breaker_disabled_marker=$(grep -cE '^[[:space:]]*if true then' /etc/nginx/lua/ape_gateway.lua)"
say "lua_codecs_mentions=$(grep -rn 'CODECS' /etc/nginx/lua/*.lua | wc -l)"
say "lua_codecs_lines_begin"
grep -rn 'CODECS' /etc/nginx/lua/*.lua | sed 's/^/codecs_lua: /' || true
say "lua_codecs_lines_end"
say "uhd_flags_line_begin"
grep -n 'uhd_auto' /etc/nginx/conf.d/50-ape-meta-plane.conf | sed 's/^/uhd: /' || true
say "uhd_flags_line_end"

say ""
say "## H - PROTOCOLO (SNI real -> 127.0.0.1, sin salir a Internet)"
R="--resolve iptv-ape.duckdns.org:443:127.0.0.1"
W='%{http_code}:%{http_version}'
say "alpn_negotiated=$(openssl s_client -alpn h2 -connect 127.0.0.1:443 -servername iptv-ape.duckdns.org </dev/null 2>/dev/null | grep -i 'ALPN protocol' | sed 's/.*: //' | tr -d '\r')"
say "curl_h2_list=$(curl -sS -m 20 $R -I --http2   -o /dev/null -w "$W" https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 2>&1)"
say "curl_h1_list=$(curl -sS -m 20 $R -I --http1.1 -o /dev/null -w "$W" https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 2>&1)"
say "curl_h2_health=$(curl -sS -m 20 $R -o /dev/null -w "$W" --http2 https://iptv-ape.duckdns.org/ape/health 2>&1)"
say "probe_upload_get=$(curl -sS -m 20 $R -o /dev/null -w "$W" https://iptv-ape.duckdns.org/upload.php 2>&1)"
say "probe_upload_post=$(curl -sS -m 20 $R -o /dev/null -w "$W" -X POST -F 'file=@/etc/hostname' https://iptv-ape.duckdns.org/upload.php 2>&1)"
say "probe_ssrf_loopback=$(curl -sS -m 20 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/cdn/127.0.0.1:8088/_ape/health' 2>&1)"
say "probe_cdn_ts404=$(curl -sS -m 20 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/probe_e9.ts' 2>&1)"
say "probe_cdn_m4s404=$(curl -sS -m 20 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/probe_e9.m4s' 2>&1)"
say "probe_cdn_mp4404=$(curl -sS -m 20 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/probe_e9.mp4' 2>&1)"
say "probe_meta_ts404=$(curl -sS -m 20 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/meta/line.tivi-ott.net/probe_e9.ts' 2>&1)"
say "probe_resolve=$(curl -sS -m 25 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/resolve.php?ch=1&p=P3' 2>&1)"
say "probe_health_public=$(curl -sS -m 20 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/ape/health' 2>&1)"
say "list_head_headers_begin"
curl -sS -m 20 $R -I -H 'Accept-Encoding: gzip' https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 2>&1 | tr -d '\r' | sed 's/^/listh: /'
say "list_head_headers_end"
say "list_xape_headers=$(curl -sS -m 20 $R -I https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 2>&1 | grep -ci '^X-APE-' || true)"
say "list_range_1024_status=$(curl -sS -m 25 $R -H 'Range: bytes=0-1023' -H 'Accept-Encoding: gzip' -o "$TMP/r.bin" -w '%{http_code}' https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 2>&1)"
say "list_range_1024_sha256=$(sha256sum "$TMP/r.bin" | cut -d' ' -f1)"
say "list_file_first1024_sha256=$(head -c 1024 "$GZ" | sha256sum | cut -d' ' -f1)"
say "cdn_headers_sample_begin"
curl -sS -m 25 $R -D - -o /dev/null 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/x/x/0.m3u8' 2>&1 | tr -d '\r' | grep -iE '^(HTTP/|X-APE-|Content-Type)' | sed 's/^/cdnh: /'
say "cdn_headers_sample_end"

say ""
say "## I - CODECS / METADATA EMITIDA (una pasada completa sobre la lista servida)"
zcat "$GZ" | awk '
{ lines++; bytes += length($0) + 1;
  if (index($0,"EXT-X-STREAM-INF") > 0) si++;
  if (match($0,/CODECS="[^"]*"/)) { c++; t = substr($0,RSTART,RLENGTH); n[t]++ }
}
END {
  printf "list_decompressed_lines=%d\nlist_decompressed_bytes=%d\nstream_inf_lines=%d\ncodecs_hits=%d\n", lines, bytes, si, c;
  for (k in n) printf "codec_distinct count=%d value=%s\n", n[k], k;
}' | tee "$TMP/agg.txt" | sed 's/^/codecs: /'
say "codecs_multiset_sha256=$(grep -E 'count=' "$TMP/agg.txt" | sort | sha256sum | cut -d' ' -f1)"
say "list_decompressed_sha256=$(zcat "$GZ" | sha256sum | cut -d' ' -f1)"
say "codecs_sample_begin"
zcat "$GZ" | grep -m 3 'CODECS=' | sed 's/^/codecs_sample: /' || true
say "codecs_sample_end"

say ""
say "## J - FIN"
say "done_utc=$(date -u +%FT%TZ)"
