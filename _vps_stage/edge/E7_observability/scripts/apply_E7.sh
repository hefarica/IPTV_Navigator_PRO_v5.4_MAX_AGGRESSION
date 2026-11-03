#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E7 · APLICACIÓN EN VENTANA (§4) — fase 6: observabilidad de la decisión
# ═══════════════════════════════════════════════════════════════════════════
# NO EJECUTAR sin ventana anunciada en COORDENADAS_SESIONES.md §4 (E10).
#
# Qué toca (y NADA más):
#   + /etc/nginx/lua/ape_obs_metrics.lua       (nuevo)
#   + /etc/nginx/lua/ape_obs_rec.lua           (nuevo)
#   + /etc/nginx/lua/ape_obs_http.lua          (nuevo)
#   + /etc/nginx/lua/ape_log_chain.lua         (nuevo)
#   + /etc/nginx/lua/ape_obs_metrics_api.lua   (nuevo)
#   ~ /etc/nginx/lua/ape_gateway.lua           (parche 0001: decisión en ngx.ctx)
#   ~ /etc/nginx/lua/ape_obs.lua               (parche 0002: error_ratio corregido)
#   ~ /etc/nginx/conf.d/50-ape-meta-plane.conf (parche 0003: 3 hooks + /_ape/metrics)
#
# NO toca: /var/www/lists, /lists/, gzip_static/gunzip, la regla .ts→404,
# resolve.php / origins.php, ngx.exit(503), circuit breakers, el gateway de
# /cdn/ en el 443, ni ningún upstream. No reinicia nginx (reload).
#
# Uso (2 pasos; el stage vive en /tmp, no en producción):
#   scp -r _vps_stage/edge/E7_observability root@VPS:/tmp/e7-stage-src
#   ssh root@VPS "STAGE=/tmp/e7-stage-src bash -s -- --check" < scripts/apply_E7.sh
#   ssh root@VPS "STAGE=/tmp/e7-stage-src bash -s -- --apply" < scripts/apply_E7.sh
#
# Salvaguardas:
#   · aborta si los ficheros vivos tienen otro sha256 que el pineado
#   · aborta si el preflight (luac5.1 -p) falla
#   · `nginx -t` antes de recargar; si falla ⇒ ROLLBACK automático sin recargar
#   · si el smoke posterior falla ⇒ ROLLBACK automático + reload
#   · backup con SHA256SUMS en /root/backups/edge-e7-<STAMP>/
# ═══════════════════════════════════════════════════════════════════════════
set -u

STAGE="${STAGE:-/tmp/e7-stage-src}"
STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
MODE="${1:-}"
BK="/root/backups/edge-e7-${STAMP}"
LUA_DIR="/etc/nginx/lua"
CONF="/etc/nginx/conf.d/50-ape-meta-plane.conf"

SHA_GW="2dc0fad86f45f4acfe03f3e3e7044b193cc391f5592e48cd8126424f736f35a8"
SHA_OBS="f477741bcfa600bb44801d44b83a62777848d4b11e5305a7327bee09d1fdc6d0"
SHA_CONF="3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515"

NEW_LUA="ape_obs_metrics.lua ape_obs_rec.lua ape_obs_http.lua ape_log_chain.lua ape_obs_metrics_api.lua"
FAIL=0
say() { printf '%s\n' "$*"; }
bad() { FAIL=1; printf 'FAIL  %s\n' "$*"; }

say "===== E7 · APLICAR FASE 6 (observabilidad de la decisión) ====="
say "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "stamp=$STAMP mode=${MODE:-<ninguno>} stage=$STAGE"
say "nginx=$(nginx -v 2>&1)  lua=$(lua -v 2>&1 | head -1)"

case "$MODE" in
  --check|--apply) : ;;
  *) say "USO: bash -s -- --check | --apply"; exit 2 ;;
esac
[ -d "$STAGE" ] || { say "FATAL: falta el stage $STAGE"; exit 1; }

# ── 0 · precondiciones: los bytes vivos son los esperados ──────────────────
say ""
say "── 0 · precondiciones ────────────────────────────────────────────────"
for pair in "$LUA_DIR/ape_gateway.lua:$SHA_GW" "$LUA_DIR/ape_obs.lua:$SHA_OBS" "$CONF:$SHA_CONF"; do
  f="${pair%%:*}"; want="${pair##*:}"
  [ -f "$f" ] || { say "FATAL: falta $f"; exit 1; }
  got="$(sha256sum "$f" | cut -d' ' -f1)"
  if [ "$got" != "$want" ]; then
    say "FATAL: $f cambió (sha256=${got:0:16}… != ${want:0:16}…)"
    say "       re-hashear y regenerar parches antes de aplicar (regla del baseline E1)."
    exit 1
  fi
  say "  OK   $f = ${got:0:16}…"
done
for f in $NEW_LUA; do
  [ -f "$STAGE/lua/$f" ] || { say "FATAL: falta $STAGE/lua/$f"; exit 1; }
done
say "  OK   stage completo (5 Lua nuevos + 3 parches)"
say "  nginx pre: MainPID=$(systemctl show nginx -p MainPID --value) NRestarts=$(systemctl show nginx -p NRestarts --value) active=$(systemctl is-active nginx)"

# ── 1 · sintaxis de todo lo que se va a instalar ───────────────────────────
say ""
say "── 1 · luac5.1 -p ────────────────────────────────────────────────────"
for f in $NEW_LUA; do
  luac5.1 -p "$STAGE/lua/$f" 2>/tmp/e7-luac.err && say "  OK   $f" || { bad "$f: $(cat /tmp/e7-luac.err)"; }
done
for f in ape_gateway.lua ape_obs.lua; do
  luac5.1 -p "$STAGE/stage/$f" 2>/tmp/e7-luac.err && say "  OK   $f (parcheado)" || { bad "$f: $(cat /tmp/e7-luac.err)"; }
done
[ "$FAIL" -eq 0 ] || { say "FATAL: sintaxis Lua rota; no se aplica nada."; exit 1; }

# ── 2 · modo --check: solo muestra el diff, no escribe ─────────────────────
if [ "$MODE" = "--check" ]; then
  say ""
  say "── 2 · MODO --check: diff que se aplicaría (NO se escribe nada) ──────"
  for spec in "$STAGE/patches/0001-ape_gateway-decision.patch:$LUA_DIR" \
              "$STAGE/patches/0002-ape_obs-error-ratio.patch:$LUA_DIR" \
              "$STAGE/patches/0003-50-ape-meta-plane-e7.patch:/etc/nginx/conf.d"; do
    p="${spec%%:*}"; d="${spec##*:}"
    say ""
    say "  ## $(basename "$p")"
    ( cd "$d" && patch -p1 --dry-run < "$p" ) 2>&1 | sed 's/^/     /'
  done
  say ""
  say "  Nuevos ficheros que se instalarían en $LUA_DIR/:"
  for f in $NEW_LUA; do say "    + $f ($(stat -c %s "$STAGE/lua/$f") B)"; done
  say ""
  say "RESULT=CHECK (sin cambios)"
  exit 0
fi

# ── 3 · backup + instalación ───────────────────────────────────────────────
say ""
say "── 3 · backup e instalación ──────────────────────────────────────────"
mkdir -p "$BK" || { say "FATAL: no pude crear $BK"; exit 1; }
cp -a "$LUA_DIR/ape_gateway.lua" "$BK/ape_gateway.lua.orig"
cp -a "$LUA_DIR/ape_obs.lua"     "$BK/ape_obs.lua.orig"
cp -a "$CONF"                    "$BK/50-ape-meta-plane.conf.orig"
( cd "$BK" && sha256sum *.orig > SHA256SUMS )
chmod 600 "$BK"/* 2>/dev/null
say "  OK   backup en $BK (3 ficheros + SHA256SUMS, 600)"

rollback() {
  local why="$1"
  say ""
  say "!! ROLLBACK ($why)"
  install -m 644 -o root -g root "$BK/ape_gateway.lua.orig" "$LUA_DIR/ape_gateway.lua"
  install -m 644 -o root -g root "$BK/ape_obs.lua.orig"     "$LUA_DIR/ape_obs.lua"
  install -m 644 -o root -g root "$BK/50-ape-meta-plane.conf.orig" "$CONF"
  for f in $NEW_LUA; do rm -f "$LUA_DIR/$f"; done
  if nginx -t >/tmp/e7-rollback-t.txt 2>&1; then
    say "  OK   nginx -t tras restaurar"
    systemctl reload nginx && say "  OK   reload tras rollback" || say "  CRITICAL: reload falló"
  else
    say "  CRITICAL: nginx -t falla tras restaurar:"; sed 's/^/       /' /tmp/e7-rollback-t.txt
  fi
  say "  hashes restaurados:"
  for pair in "$LUA_DIR/ape_gateway.lua:$SHA_GW" "$LUA_DIR/ape_obs.lua:$SHA_OBS" "$CONF:$SHA_CONF"; do
    f="${pair%%:*}"; want="${pair##*:}"
    got="$(sha256sum "$f" | cut -d' ' -f1)"
    [ "$got" = "$want" ] && say "    OK $f" || say "    MISMATCH $f ($got)"
  done
  say "RESULT=FAIL (rollback aplicado: $why)"
  exit 1
}

for f in $NEW_LUA; do
  install -m 644 -o root -g root "$STAGE/lua/$f" "$LUA_DIR/$f" || rollback "no pude instalar $f"
  say "  + $f ($(stat -c %s "$LUA_DIR/$f") B)"
done
for spec in "$STAGE/patches/0001-ape_gateway-decision.patch:$LUA_DIR" \
            "$STAGE/patches/0002-ape_obs-error-ratio.patch:$LUA_DIR" \
            "$STAGE/patches/0003-50-ape-meta-plane-e7.patch:/etc/nginx/conf.d"; do
  p="${spec%%:*}"; d="${spec##*:}"
  if ( cd "$d" && patch -p1 --silent --forward < "$p" ); then
    say "  ~ $(basename "$p") aplicado en $d"
  else
    rollback "el parche $(basename "$p") no aplicó"
  fi
done

# ── 4 · validación final + nginx -t ────────────────────────────────────────
say ""
say "── 4 · validación post-instalación ───────────────────────────────────"
for f in $LUA_DIR/ape_obs_metrics.lua $LUA_DIR/ape_obs_rec.lua $LUA_DIR/ape_obs_http.lua \
         $LUA_DIR/ape_log_chain.lua $LUA_DIR/ape_obs_metrics_api.lua \
         $LUA_DIR/ape_gateway.lua $LUA_DIR/ape_obs.lua; do
  luac5.1 -p "$f" 2>/tmp/e7-luac.err || rollback "luac5.1 -p falla en $f: $(cat /tmp/e7-luac.err)"
done
say "  OK   luac5.1 -p de los 7 ficheros en su ubicación final"

if nginx -t >/tmp/e7-nginx-t.txt 2>&1; then
  say "  OK   nginx -t"
else
  sed 's/^/       /' /tmp/e7-nginx-t.txt
  rollback "nginx -t FALLA con la config nueva"
fi

# ── 5 · reload (nunca restart) ─────────────────────────────────────────────
say ""
say "── 5 · reload ────────────────────────────────────────────────────────"
pre_pid="$(systemctl show nginx -p MainPID --value)"
if systemctl reload nginx; then
  say "  OK   systemctl reload nginx"
else
  rollback "systemctl reload falló"
fi
sleep 1
post_pid="$(systemctl show nginx -p MainPID --value)"
say "  MainPID $pre_pid → $post_pid (reload no cambia PID) NRestarts=$(systemctl show nginx -p NRestarts --value) active=$(systemctl is-active nginx)"
[ "$pre_pid" = "$post_pid" ] || bad "el PID cambió: hubo restart, no reload"

# ── 6 · smoke funcional (sin proveedor, sin credenciales) ──────────────────
say ""
say "── 6 · smoke funcional ───────────────────────────────────────────────"
J="/tmp/e7-metrics.json"
H="/tmp/e7-health.json"

code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:8088/_ape/metrics" || true)"
[ "$code" = "200" ] && say "  OK   /_ape/metrics → 200" || bad "/_ape/metrics → ${code:-timeout}"

# 6a · cadena de log de /meta/ (fixture local: header_filter + body_filter + log chain)
code_fx="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:8088/__selftest_full.m3u8" || true)"
[ "$code_fx" = "200" ] && say "  OK   fixture /__selftest_full → 200 (header+body+log chain)" \
                        || bad "fixture → ${code_fx:-timeout}"

# 6b · decisión denegada por allowlist (IP pública ⇒ NO es loopback ⇒ 403) sin tocar proveedor
PUBIP="$(hostname -I | awk '{print $1}')"
code_dn="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://$PUBIP:8088/cdn/e7-smoke.invalid/x.m3u8" || true)"
[ "$code_dn" = "403" ] && say "  OK   /cdn/<host no permitido> → 403 (allowlist intacta, sin fetch)" \
                       || bad "/cdn/<host no permitido> → ${code_dn:-timeout} (esperaba 403)"

curl -s -m 5 "http://127.0.0.1:8088/_ape/metrics?window=300" -o "$J" || bad "/_ape/metrics no devuelve JSON"
curl -s -m 5 "http://127.0.0.1:8088/_ape/health" -o "$H" || bad "/_ape/health no devuelve JSON"

# 6c · validación estructural + aritmética (python3 del sistema)
python3 - "$J" "$H" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
h = json.load(open(sys.argv[2]))
fails = []
def need(cond, msg):
    print(("  OK   " if cond else "  FAIL ") + msg)
    if not cond: fails.append(msg)

need(m.get("schema") == "ape.obs.metrics/1", "schema ape.obs.metrics/1")
need(m.get("ok") is True, "ok=true en /_ape/metrics")
for k in ("provider_fetch_ms", "provider_fetch_split", "hops", "uhd_mode", "rebase", "errors", "edge", "cost", "cumulative"):
    need(k in m, f"bloque {k} presente")
need(m.get("cost", {}).get("hot_path_writes") == 0, "cost.hot_path_writes == 0 (registro en fase log)")
need(m.get("cost", {}).get("phase", "").startswith("log_by_lua"), "cost.phase declara log_by_lua")
need(isinstance(m.get("provider_fetch_ms", {}).get("n"), int), "provider_fetch_ms.n es entero")
need(m.get("errors", {}).get("error_ratio_note", "") != "", "error_ratio documentado (fallos/intentos)")
need(m.get("errors", {}).get("denied", 0) >= 1, "la decisión denegada llegó al dict (errors.denied ≥ 1)")
need(m.get("cumulative", {}).get("req") is not None, "contadores acumulados legibles (compat)")
e = m.get("edge", {})
need(e.get("n", 0) >= 1, f"familia edge registrada (edge.n={e.get('n')}) — ape_log_chain activo")
print(f"       provider_fetch_ms: n={m['provider_fetch_ms'].get('n')} p50={m['provider_fetch_ms'].get('p50_ms')} p95={m['provider_fetch_ms'].get('p95_ms')}")
print(f"       hops.mean={m['hops'].get('mean')} · uhd.declared_pct={m['uhd_mode'].get('declared_pct')} · rebase_pct={m['rebase'].get('rebase_pct')} · error_ratio={m['errors'].get('error_ratio')}")

c = h.get("checks", {})
need(c.get("error_ratio_semantics", "").startswith("fallos/intentos"), "/_ape/health con fórmula corregida (parche 0002 cargado)")
need(h.get("ok") is True, "/_ape/health ok:true")
att = int(c.get("attempts") or 0); ft = int(c.get("fail_total") or 0); er = float(c.get("error_ratio") or 0)
want = round(ft / att, 4) if att else 0.0
need(abs(er - want) <= 0.0001, f"error_ratio={er} == fail_total/attempts={ft}/{att}")
if h.get("window"):
    w = h["window"]
    need("endpoint" in w and w["endpoint"] == "/_ape/metrics", "/_ape/health enlaza /_ape/metrics")
    print(f"       health.window: attempts={w.get('attempts')} error_ratio={w.get('error_ratio')} p50={w.get('provider_fetch_p50_ms')}")
sys.exit(1 if fails else 0)
PY
[ $? -eq 0 ] || bad "validación estructural/aritmética del JSON"

# 6d · endpoints de compatibilidad (los que ya consumían otros: watchdog, smoke, ancla de lista)
for u in /_ape/qoe /_ape/health; do
  c="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:8088$u" || true)"
  [ "$c" = "200" ] && say "  OK   $u → 200 (compat)" || bad "$u → ${c:-timeout}"
done
# OJO (medido): /ape/health público vive en el server 443 (snippet ape-meta-public.conf),
# NO en el 8088: ahi responde 404 a proposito.
c="$(curl -s -o /dev/null -w '%{http_code}' -m 10 --resolve iptv-ape.duckdns.org:443:127.0.0.1 "https://iptv-ape.duckdns.org/ape/health" || true)"
[ "$c" = "200" ] && say "  OK   /ape/health (443, público) → 200" || bad "/ape/health (443) → ${c:-timeout}"
listc="$(curl -s -o /dev/null -w '%{http_code}' -m 30 --resolve iptv-ape.duckdns.org:443:127.0.0.1 "https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8" || true)"
[ "$listc" = "200" ] && say "  OK   lista 4K por 443 → 200 (no se tocó)" || bad "lista 4K → ${listc:-timeout}"

if [ "$FAIL" -ne 0 ]; then
  rollback "smoke con fallos"
fi

say ""
say "── 7 · estado final ──────────────────────────────────────────────────"
say "  nginx: MainPID=$(systemctl show nginx -p MainPID --value) NRestarts=$(systemctl show nginx -p NRestarts --value) active=$(systemctl is-active nginx)"
say "  hashes post:"
for f in $LUA_DIR/ape_gateway.lua $LUA_DIR/ape_obs.lua $CONF; do
  say "    $(sha256sum "$f" | cut -d' ' -f1 | cut -c1-16)…  $f"
done
say "  backup/rollback: $BK  (usa scripts/rollback_E7.sh $STAMP --apply)"
say ""
say "RESULT=OK"
exit 0
