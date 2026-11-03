#!/usr/bin/env bash
# ============================================================================
# E9 - ROLLBACK PROBADO DE FASE 1 (HTTP/2 en 443)  v1.0.0   *** MUTA EL VPS ***
# ----------------------------------------------------------------------------
# Uso (ventana anunciada en COORDENADAS_SESIONES.md 4):
#   STAMP=<stamp> ssh root@178.156.147.234 'STAMP=$STAMP bash -s' -- off < e9_rollback.sh
#   STAMP=<stamp> ssh root@178.156.147.234 'STAMP=$STAMP bash -s' -- on  < e9_rollback.sh
#
# off : guarda el default VIVO (h2 ON) en /root/backups/e9-<STAMP>/default.h2,
#       restaura el backup PRE-FASE-1 pero POST-SEGURIDAD (SSRF 403 + .ts->404 +
#       upload.php 403 siguen dentro), nginx -t, reload, verifica ALPN=1.1.
#       Si nginx -t falla, restaura el estado ON automaticamente (nunca deja prod roto).
# on  : re-aplica el default con http2 desde /root/backups/e9-<STAMP>/default.h2,
#       nginx -t, reload, verifica ALPN=h2. Estado final = h2 ON.
# ============================================================================
set -uo pipefail
MODE="${1:-}"
STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
DEF=/etc/nginx/sites-enabled/default
BAK=/root/backups/edge-e1-20261026T205255Z/etc/nginx/sites-enabled/default.bak_20261026T205255Z
STORE=/root/backups/e9-$STAMP
H2SHA=49c162a862f1e5485959350f2b2175f24eec440a10d2cd6902b2e0e03f8c59d1
say() { printf '%s\n' "$*"; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
W='%{http_code}:%{http_version}'
R="--resolve iptv-ape.duckdns.org:443:127.0.0.1"

verify() {
  say "verify_date_utc=$(date -u +%FT%TZ)"
  say "verify_default_sha256=$(sha "$DEF")"
  say "verify_default_bytes=$(stat -c %s "$DEF")"
  say "verify_nginx_t_sha256=$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"
  say "verify_mainpid=$(systemctl show nginx -p MainPID --value) nrestarts=$(systemctl show nginx -p NRestarts --value)"
  say "verify_alpn=$(openssl s_client -alpn h2 -connect 127.0.0.1:443 -servername iptv-ape.duckdns.org </dev/null 2>/dev/null | grep -i 'ALPN protocol' | sed 's/.*: //' | tr -d '\r')"
  say "verify_curl_http2_list=$(curl -sS -m 20 $R -I --http2   -o /dev/null -w "$W" https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 2>&1)"
  say "verify_curl_http11_list=$(curl -sS -m 20 $R -I --http1.1 -o /dev/null -w "$W" https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 2>&1)"
  say "verify_upload_get=$(curl -sS -m 20 $R -o /dev/null -w "$W" https://iptv-ape.duckdns.org/upload.php 2>&1)"
  say "verify_upload_post=$(curl -sS -m 20 $R -o /dev/null -w "$W" -X POST -F 'file=@/etc/hostname' https://iptv-ape.duckdns.org/upload.php 2>&1)"
  say "verify_ssrf_loopback=$(curl -sS -m 20 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/cdn/127.0.0.1:8088/_ape/health' 2>&1)"
  say "verify_cdn_ts404=$(curl -sS -m 20 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/probe_e9.ts' 2>&1)"
  say "verify_resolve=$(curl -sS -m 25 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/resolve.php?ch=1&p=P3' 2>&1)"
  say "verify_health=$(curl -sS -m 20 $R -o /dev/null -w "$W" 'https://iptv-ape.duckdns.org/ape/health' 2>&1)"
}

case "$MODE" in
off|OFF)
  say "## ROLLBACK OFF (restaurar pre-FASE-1 post-seguridad)"
  [ -r "$BAK" ] || { say "ABORT: backup pre-FASE-1 ausente ($BAK)"; exit 2; }
  mkdir -p "$STORE"; chmod 700 "$STORE"
  cur="$(sha "$DEF")"
  say "pre_default_sha256=$cur"
  if [ "$cur" = "$(sha "$BAK")" ]; then say "NOOP: ya esta en estado pre-FASE-1"; verify; exit 0; fi
  if [ "$cur" != "$H2SHA" ]; then say "ABORT: base inesperada (se esperaba $H2SHA)"; exit 3; fi
  cp -a "$DEF" "$STORE/default.h2.$STAMP"
  say "stored_on_copy=$STORE/default.h2.$STAMP sha=$(sha "$STORE/default.h2.$STAMP")"
  cp -a "$BAK" "$DEF"; chmod 644 "$DEF"; chown root:root "$DEF"
  say "post_restore_sha256=$(sha "$DEF") expect=$(sha "$BAK")"
  if ! nginx -t; then
    say "ABORT: nginx -t FALLO tras restaurar -> volviendo a h2 ON"
    cp -a "$STORE/default.h2.$STAMP" "$DEF"
    nginx -t && systemctl reload nginx
    say "recovered_default_sha256=$(sha "$DEF")"
    exit 4
  fi
  systemctl reload nginx || { say "ABORT: reload fallo"; exit 5; }
  sleep 2
  verify
  ;;
on|ON)
  say "## RE-APLICAR ON (http2)"
  src=""
  for c in "$STORE"/default.h2.*; do [ -r "$c" ] && src="$c" && break; done
  [ -n "$src" ] || { say "ABORT: no encuentro copia ON en $STORE"; exit 6; }
  cur="$(sha "$DEF")"
  say "pre_default_sha256=$cur source=$src source_sha=$(sha "$src")"
  if [ "$cur" = "$H2SHA" ]; then say "NOOP: ya esta en h2 ON"; verify; exit 0; fi
  if [ "$(sha "$src")" != "$H2SHA" ]; then say "ABORT: la copia guardada no es la esperada"; exit 7; fi
  cp -a "$src" "$DEF"; chmod 644 "$DEF"; chown root:root "$DEF"
  say "post_apply_sha256=$(sha "$DEF") expect=$H2SHA"
  if ! nginx -t; then
    say "ABORT: nginx -t FALLO tras re-aplicar -> restaurando pre-FASE-1"
    cp -a "$BAK" "$DEF"; nginx -t && systemctl reload nginx
    exit 8
  fi
  systemctl reload nginx || { say "ABORT: reload fallo"; exit 9; }
  sleep 2
  verify
  ;;
*)
  say "uso: bash e9_rollback.sh off|on   (STAMP=<stamp> en el entorno)"
  exit 1
  ;;
esac
say "done_utc=$(date -u +%FT%TZ)"
