#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E7 · ROLLBACK — deshace la fase 6 y vuelve a los bytes del backup
# ═══════════════════════════════════════════════════════════════════════════
# Uso:
#   ssh root@VPS "bash -s -- <STAMP> --check" < scripts/rollback_E7.sh
#   ssh root@VPS "bash -s -- <STAMP> --apply" < scripts/rollback_E7.sh
#
# Restaura: ape_gateway.lua, ape_obs.lua, conf.d/50-ape-meta-plane.conf
# Elimina:  los 5 Lua nuevos de E7 (ape_obs_metrics/rec/http, ape_log_chain,
#           ape_obs_metrics_api) — solo si el rollback es completo.
# Verifica: sha256 restaurado, nginx -t, reload, /_ape/qoe + /_ape/health 200,
#           lista 4K 200 y que /_ape/metrics ya NO existe (404).
# Siempre deja el sistema en un estado con `nginx -t` verde o avisa CRITICAL.
# ═══════════════════════════════════════════════════════════════════════════
set -u

STAMP="${1:-}"
MODE="${2:-}"
LUA_DIR="/etc/nginx/lua"
CONF="/etc/nginx/conf.d/50-ape-meta-plane.conf"
BK="/root/backups/edge-e7-${STAMP}"
NEW_LUA="ape_obs_metrics.lua ape_obs_rec.lua ape_obs_http.lua ape_log_chain.lua ape_obs_metrics_api.lua"

say() { printf '%s\n' "$*"; }
FAIL=0

say "===== E7 · ROLLBACK FASE 6 ====="
say "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "stamp=${STAMP:-<falta>} mode=${MODE:-<falta>} backup=$BK"

case "$MODE" in --check|--apply) : ;; *) say "USO: bash -s -- <STAMP> --check|--apply"; exit 2 ;; esac
[ -n "$STAMP" ] || { say "FATAL: falta el STAMP del backup"; exit 2; }
[ -d "$BK" ] || { say "FATAL: no existe $BK"; exit 1; }
for f in ape_gateway.lua.orig ape_obs.lua.orig 50-ape-meta-plane.conf.orig; do
  [ -f "$BK/$f" ] || { say "FATAL: falta $BK/$f"; exit 1; }
done
say "  backup verificado (3 ficheros)"

if [ "$MODE" = "--check" ]; then
  say ""
  say "── MODO --check: qué haría (no escribe) ──────────────────────────────"
  for pair in "ape_gateway.lua:ape_gateway.lua.orig" "ape_obs.lua:ape_obs.lua.orig"; do
    cur="$LUA_DIR/${pair%%:*}"; bak="$BK/${pair##*:}"
    say "  ~ $cur"
    say "      vivo  $(sha256sum "$cur" 2>/dev/null | cut -c1-16)…  ($(stat -c %s "$cur" 2>/dev/null) B)"
    say "      volver $(sha256sum "$bak" | cut -c1-16)…  ($(stat -c %s "$bak") B)"
  done
  say "  ~ $CONF"
  say "      vivo  $(sha256sum "$CONF" | cut -c1-16)…"
  say "      volver $(sha256sum "$BK/50-ape-meta-plane.conf.orig" | cut -c1-16)…"
  say "  - se eliminarían:"
  for f in $NEW_LUA; do [ -f "$LUA_DIR/$f" ] && say "      $LUA_DIR/$f" || say "      (ya ausente) $f"; done
  say ""
  say "RESULT=CHECK (sin cambios)"
  exit 0
fi

say ""
say "── restaurando ───────────────────────────────────────────────────────"
install -m 644 -o root -g root "$BK/ape_gateway.lua.orig" "$LUA_DIR/ape_gateway.lua" || FAIL=1
install -m 644 -o root -g root "$BK/ape_obs.lua.orig"     "$LUA_DIR/ape_obs.lua" || FAIL=1
install -m 644 -o root -g root "$BK/50-ape-meta-plane.conf.orig" "$CONF" || FAIL=1
for f in $NEW_LUA; do rm -f "$LUA_DIR/$f"; done
say "  3 ficheros restaurados y 5 Lua de E7 eliminados"

say ""
say "── verificación ──────────────────────────────────────────────────────"
while read -r want name; do
  cur="$(sha256sum "$BK/$name" | cut -d' ' -f1)"
  [ "$cur" = "$want" ] || { say "  WARN el backup $name no coincide con su SHA256SUMS"; }
done < "$BK/SHA256SUMS"

if nginx -t >/tmp/e7-rb-t.txt 2>&1; then
  say "  OK   nginx -t"
else
  say "  CRITICAL: nginx -t FALLA tras el rollback (no recargo):"
  sed 's/^/       /' /tmp/e7-rb-t.txt
  say "RESULT=FAIL"
  exit 1
fi
pre_pid="$(systemctl show nginx -p MainPID --value)"
systemctl reload nginx && say "  OK   reload" || { say "  CRITICAL: reload falló"; exit 1; }
sleep 1
say "  MainPID $pre_pid → $(systemctl show nginx -p MainPID --value) NRestarts=$(systemctl show nginx -p NRestarts --value)"

for u in /_ape/qoe /_ape/health; do
  c="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:8088$u" || true)"
  [ "$c" = "200" ] && say "  OK   $u → 200" || { say "  FAIL $u → ${c:-timeout}"; FAIL=1; }
done
c="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:8088/_ape/metrics" || true)"
[ "$c" = "404" ] && say "  OK   /_ape/metrics → 404 (E7 desinstalado)" || say "  WARN /_ape/metrics → ${c:-timeout} (esperaba 404)"
listc="$(curl -s -o /dev/null -w '%{http_code}' -m 30 --resolve iptv-ape.duckdns.org:443:127.0.0.1 "https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8" || true)"
[ "$listc" = "200" ] && say "  OK   lista 4K → 200" || { say "  FAIL lista 4K → ${listc:-timeout}"; FAIL=1; }
say "  hashes restaurados:"
for f in "$LUA_DIR/ape_gateway.lua" "$LUA_DIR/ape_obs.lua" "$CONF"; do
  say "    $(sha256sum "$f" | cut -c1-16)…  $f"
done

say ""
[ "$FAIL" -eq 0 ] && { say "RESULT=OK"; exit 0; } || { say "RESULT=FAIL"; exit 1; }
