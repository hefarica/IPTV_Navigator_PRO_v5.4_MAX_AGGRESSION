#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E10 · ROLLBACK de la ventana compuesta (E7+SSRF+Accept-Ranges+UHD)
# ═══════════════════════════════════════════════════════════════════════════
# Uso (EN el VPS):
#   ssh root@VPS "bash -s -- <STAMP> --check" < scripts/rollback_E10.sh
#   ssh root@VPS "bash -s -- <STAMP> --apply" < scripts/rollback_E10.sh
#
# Restaura los 6 ficheros del backup /root/backups/edge-e10-<STAMP>/ y elimina
# los 5 Lua nuevos de E7. nginx -t + reload (nunca restart). Verifica hashes.
# ═══════════════════════════════════════════════════════════════════════════
set -u

STAMP="${1:-}"
MODE="${2:-}"
LUA="/etc/nginx/lua"
CONF="/etc/nginx/conf.d/50-ape-meta-plane.conf"
SITE="/etc/nginx/sites-enabled/default"
BK="/root/backups/edge-e10-${STAMP}"
NEW_LUA="ape_obs_metrics.lua ape_obs_rec.lua ape_obs_http.lua ape_log_chain.lua ape_obs_metrics_api.lua"
FAIL=0
say() { printf '%s\n' "$*"; }
bad() { FAIL=1; printf 'FAIL  %s\n' "$*"; }

case "$MODE" in --check|--apply) : ;; *) say "USO: bash -s -- <STAMP> --check|--apply"; exit 2 ;; esac
[ -n "$STAMP" ] || { say "FATAL: falta STAMP"; exit 2; }
[ -d "$BK" ] || { say "FATAL: no existe $BK"; exit 1; }
for f in ape_gateway.lua.orig ape_obs.lua.orig ape_uhd.lua.orig ape_luatest.lua.orig default.orig 50-ape-meta-plane.conf.orig; do
  [ -f "$BK/$f" ] || { say "FATAL: falta $BK/$f"; exit 1; }
done
say "===== E10 · ROLLBACK $([ "$MODE" = "--apply" ] && echo APPLY || echo CHECK) ====="
say "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ) backup=$BK"

if [ "$MODE" = "--check" ]; then
  say "DRYRUN: restauraría 6 ficheros y eliminaría:"
  for f in $NEW_LUA; do say "  - $LUA/$f"; done
  say "  ~ $LUA/ape_gateway.lua"
  say "  ~ $LUA/ape_obs.lua"
  say "  ~ $LUA/ape_uhd.lua"
  say "  ~ $LUA/ape_luatest.lua"
  say "  ~ $SITE"
  say "  ~ $CONF"
  say "RESULT=CHECK (sin cambios)"
  exit 0
fi

say ""
say "── restaurando ───────────────────────────────────────────────────────"
install -m 644 -o root -g root "$BK/ape_gateway.lua.orig" "$LUA/ape_gateway.lua" || FAIL=1
install -m 644 -o root -g root "$BK/ape_obs.lua.orig" "$LUA/ape_obs.lua" || FAIL=1
install -m 644 -o root -g root "$BK/ape_uhd.lua.orig" "$LUA/ape_uhd.lua" || FAIL=1
install -m 644 -o root -g root "$BK/ape_luatest.lua.orig" "$LUA/ape_luatest.lua" || FAIL=1
install -m 644 -o root -g root "$BK/default.orig" "$SITE" || FAIL=1
install -m 644 -o root -g root "$BK/50-ape-meta-plane.conf.orig" "$CONF" || FAIL=1
for f in $NEW_LUA; do rm -f "$LUA/$f"; done
say "  6 ficheros restaurados y 5 Lua de E7 eliminados"

say ""
say "── verificación ──────────────────────────────────────────────────────"
for f in "$LUA/ape_gateway.lua" "$LUA/ape_obs.lua" "$LUA/ape_uhd.lua" "$LUA/ape_luatest.lua" "$SITE" "$CONF"; do
  luac5.1 -p "$f" 2>/dev/null || { [ "$f" = "$SITE" ] || [ "$f" = "$CONF" ] || { say "FAIL luac $f"; FAIL=1; }; }
done
if nginx -t >/tmp/e10-rb-t.txt 2>&1; then
  say "  OK   nginx -t"
else
  say "  CRITICAL: nginx -t FALLA tras el rollback (no recargo)"; sed 's/^/       /' /tmp/e10-rb-t.txt; FAIL=1
fi
if [ "$FAIL" -eq 0 ]; then
  pre_pid="$(systemctl show nginx -p MainPID --value)"
  systemctl reload nginx && say "  OK   reload" || { say "CRITICAL: reload falló"; FAIL=1; }
  sleep 1
  say "  MainPID $pre_pid → $(systemctl show nginx -p MainPID --value) NRestarts=$(systemctl show nginx -p NRestarts --value)"
  # smoke mínimo del estado restaurado
  for pair in "SSRF público:403:https://iptv-ape.duckdns.org/cdn/127.0.0.1:8088/_ape/health" \
              "lista:200:https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8" \
              "health:200:https://iptv-ape.duckdns.org/ape/health"; do
    name="${pair%%:*}"; rest="${pair#*:}"; want="${rest%%:*}"; url="${rest#*:}"
    got="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$url" || true)"
    [ "$got" = "$want" ] && say "  OK   $name = $got" || { say "  FAIL $name = $got (esperaba $want)"; FAIL=1; }
  done
  c="$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:8088/_ape/metrics || true)"
  [ "$c" = "404" ] && say "  OK   /_ape/metrics = 404 (E7 desinstalado)" || { say "  FAIL /_ape/metrics = $c"; FAIL=1; }
  say "  hashes restaurados:"
  for f in "$LUA/ape_gateway.lua" "$LUA/ape_obs.lua" "$LUA/ape_uhd.lua" "$LUA/ape_luatest.lua" "$SITE" "$CONF"; do
    say "    $(sha256sum "$f" | cut -c1-16)…  $f"
  done
fi
say ""
[ "$FAIL" -eq 0 ] && { say "RESULT=OK"; exit 0; } || { say "RESULT=FAIL"; exit 1; }
