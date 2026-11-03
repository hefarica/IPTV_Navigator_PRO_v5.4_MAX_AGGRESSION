#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E7 · PREFLIGHT — valida la fase 6 SIN tocar producción
# ═══════════════════════════════════════════════════════════════════════════
# Qué hace (y qué NO hace):
#   ✅ luac5.1 -p de los Lua nuevos y de los 2 parcheados
#   ✅ aplica los 3 parches a una COPIA del árbol nginx en /tmp y corre
#      `nginx -t -c` sobre esa copia (patrón de E2: preflight_nginx_t_copy.log)
#   ✅ comprueba que el fichero VIVO sigue con el sha esperado (no se tocó)
#   ✅ imprime el diff exacto que se aplicaría en la ventana E10
#   ❌ NO escribe en /etc/nginx, NO escribe en /var/www, NO recarga nginx,
#      NO toca el shared dict, NO envía tráfico al proveedor.
#
# Uso (2 pasos: subir a /tmp y ejecutar; /tmp es el único sitio que se escribe):
#   scp -r _vps_stage/edge/E7_observability /tmp/e7-stage-src       # o a /tmp
#   ssh root@VPS "STAGE=/tmp/e7-stage-src bash -s" < scripts/preflight_E7.sh
#
# Salidas: RESULT=OK | RESULT=FAIL (exit code == fallo)
# ═══════════════════════════════════════════════════════════════════════════
set -u

STAGE="${STAGE:-/tmp/e7-stage-src}"
WORK="${WORK:-/tmp/e7-preflight}"
LUA_DIR="/etc/nginx/lua"
CONF="/etc/nginx/conf.d/50-ape-meta-plane.conf"

# Hashes de los ficheros VIVOS contra los que se generaron los parches.
SHA_GW="2dc0fad86f45f4acfe03f3e3e7044b193cc391f5592e48cd8126424f736f35a8"
SHA_OBS="f477741bcfa600bb44801d44b83a62777848d4b11e5305a7327bee09d1fdc6d0"
SHA_CONF="3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515"

FAIL=0
say() { printf '%s\n' "$*"; }
bad() { FAIL=1; printf 'FAIL  %s\n' "$*"; }

say "===== E7 · PREFLIGHT FASE 6 (observabilidad de la decisión) ====="
say "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "stage=$STAGE"
say "work=$WORK"
say "nginx=$(nginx -v 2>&1)"
say "lua=$(lua -v 2>&1)"
say ""

[ -d "$STAGE" ] || { say "FATAL: no existe el stage $STAGE"; exit 1; }

# ── 0 · hashes vivos (los parches se generaron contra ESTOS bytes) ─────────
say "── 0 · estado de los ficheros vivos ─────────────────────────────────"
for pair in "$LUA_DIR/ape_gateway.lua:$SHA_GW" "$LUA_DIR/ape_obs.lua:$SHA_OBS" "$CONF:$SHA_CONF"; do
  f="${pair%%:*}"; want="${pair##*:}"
  if [ ! -f "$f" ]; then bad "falta $f"; continue; fi
  got="$(sha256sum "$f" | cut -d' ' -f1)"
  if [ "$got" = "$want" ]; then
    say "  OK   $f sha256=${got:0:16}…"
  else
    bad "$f cambió: sha256=${got:0:16}… != esperado ${want:0:16}… (regenerar parches)"
  fi
done

# ── 1 · sintaxis Lua 5.1 (mismo lenguaje que LuaJIT) ───────────────────────
say ""
say "── 1 · luac5.1 -p (intérprete del VPS: $(lua -v 2>&1 | head -1)) ───────"
for f in "$STAGE/lua/ape_obs_metrics.lua" "$STAGE/lua/ape_obs_rec.lua" \
         "$STAGE/lua/ape_obs_http.lua" "$STAGE/lua/ape_log_chain.lua" \
         "$STAGE/lua/ape_obs_metrics_api.lua" \
         "$STAGE/stage/ape_gateway.lua" "$STAGE/stage/ape_obs.lua"; do
  name="$(basename "$f")"
  if luac5.1 -p "$f" 2>/tmp/e7-luac.err; then
    say "  OK   $name"
  else
    bad "$name: $(cat /tmp/e7-luac.err)"
  fi
done

# ── 1b · selftest funcional de la librería (Lua 5.1 real, stub de ngx) ─────
say ""
say "── 1b · selftest ape_obs_metrics.lua (57 aserciones, sin nginx) ───────"
if [ -f "$STAGE/tests/stub_ngx.lua" ] && [ -f "$STAGE/tests/selftest_obs.lua" ]; then
  {
    cat "$STAGE/tests/stub_ngx.lua"
    printf '\npackage.preload["ape_obs_metrics"] = function()\n'
    cat "$STAGE/lua/ape_obs_metrics.lua"
    printf '\nend\n'
    cat "$STAGE/tests/selftest_obs.lua"
  } > /tmp/e7-selftest.lua
  if out="$(lua /tmp/e7-selftest.lua 2>&1)"; then
    say "  $(printf '%s' "$out" | tail -2 | tr '\n' ' ')"
  else
    bad "selftest falla:"
    printf '%s\n' "$out" | grep -E '^not ok|^# pass' | sed 's/^/       /'
  fi
else
  say "  SKIP (no hay tests/ en el stage)"
fi

# ── 2 · árbol de config COPIADO en /tmp (nunca /etc/nginx) ─────────────────
say ""
say "── 2 · nginx -t sobre una COPIA del árbol (no se toca /etc/nginx) ─────"
rm -rf "$WORK"; mkdir -p "$WORK"
cp -a /etc/nginx "$WORK/nginx" || { say "FATAL: no pude copiar /etc/nginx"; exit 1; }
mkdir -p "$WORK/nginx/lua"
for f in ape_obs_metrics.lua ape_obs_rec.lua ape_obs_http.lua ape_log_chain.lua ape_obs_metrics_api.lua; do
  cp "$STAGE/lua/$f" "$WORK/nginx/lua/$f"
done

# IMPORTANTE: los parches se aplican ANTES de remapear las rutas absolutas;
# si no, las líneas de contexto (`/etc/nginx/lua/...`) ya no coinciden y
# `patch` rechaza 2 de 3 hunks del parche 0003 (medido en el primer intento).
apply_patch_copy() {
  local p="$1" dir="$2"
  ( cd "$dir" && patch -p1 --silent --forward < "$p" ) || return 1
  return 0
}
if apply_patch_copy "$STAGE/patches/0001-ape_gateway-decision.patch" "$WORK/nginx/lua"; then
  say "  OK   parche 0001 (ape_gateway.lua) aplicado en la copia"
else
  bad "parche 0001 no aplica en la copia"
fi
if apply_patch_copy "$STAGE/patches/0002-ape_obs-error-ratio.patch" "$WORK/nginx/lua"; then
  say "  OK   parche 0002 (ape_obs.lua) aplicado en la copia"
else
  bad "parche 0002 no aplica en la copia"
fi
if apply_patch_copy "$STAGE/patches/0003-50-ape-meta-plane-e7.patch" "$WORK/nginx/conf.d"; then
  say "  OK   parche 0003 (50-ape-meta-plane.conf) aplicado en la copia"
else
  bad "parche 0003 no aplica en la copia"
fi

# ahora sí: los includes absolutos deben apuntar a la copia (patrón de E2)
grep -rl "/etc/nginx" "$WORK/nginx" 2>/dev/null | while read -r f; do
  sed -i "s#/etc/nginx#$WORK/nginx#g" "$f"
done

# luac sobre los ficheros YA parcheados (no solo sobre el stage)
for f in "$WORK/nginx/lua/ape_gateway.lua" "$WORK/nginx/lua/ape_obs.lua"; do
  if luac5.1 -p "$f" 2>/tmp/e7-luac.err; then
    say "  OK   luac5.1 -p $(basename "$f") (parcheado)"
  else
    bad "luac5.1 -p $(basename "$f") parcheado: $(cat /tmp/e7-luac.err)"
  fi
done

if nginx -t -c "$WORK/nginx/nginx.conf" >/tmp/e7-nginx-t.txt 2>&1; then
  say "  OK   nginx -t (copia)"
  sed 's/^/       /' /tmp/e7-nginx-t.txt
else
  bad "nginx -t (copia) FALLA"
  sed 's/^/       /' /tmp/e7-nginx-t.txt
fi

# ── 3 · las directivas E7 están donde deben, y SOLO donde deben ────────────
say ""
say "── 3 · verificación de las 3 directivas nuevas en la copia ────────────"
C="$WORK/nginx/conf.d/50-ape-meta-plane.conf"
# OJO: en la copia los includes absolutos apuntan a $WORK/nginx (sed de arriba)
chk() { if grep -qF -- "$2" "$C"; then say "  OK   $1"; else bad "$1 (no aparece: $2)"; fi; }
chk "log_by_lua del gateway → ape_obs_rec"  "log_by_lua_file $WORK/nginx/lua/ape_obs_rec.lua;"
chk "log_by_lua de /meta/ → ape_log_chain"  "log_by_lua_file $WORK/nginx/lua/ape_log_chain.lua;"
chk "location /_ape/metrics"                "location = /_ape/metrics {"
# el wake NO debe desaparecer: debe quedar dentro de la cadena (dofile)
if grep -qF "ape_wake_on_manifest.lua" "$WORK/nginx/lua/ape_log_chain.lua"; then
  say "  OK   el wake-on-manifest sigue invocándose (ape_log_chain)"
else
  bad "el wake-on-manifest no aparece en ape_log_chain"
fi
# un solo log_by_lua por location. En el plano hay 3 y los 3 son a propósito:
#   gateway /cdn/ → ape_obs_rec · /meta/ → ape_log_chain · fixture /__selftest_full → wake crudo
# (el fixture mantiene el wake SIN cadena para seguir probando el módulo original).
n_lb="$(grep -c 'log_by_lua_file' "$C")"
if [ "$n_lb" -eq 3 ]; then
  say "  OK   3 log_by_lua_file (gateway + /meta/ + fixture), uno por location"
else
  bad "nº inesperado de log_by_lua_file en 50-ape-meta-plane.conf: $n_lb (esperado 3)"
fi
if grep -qE "log_by_lua_file[[:space:]]+$WORK/nginx/lua/ape_wake_on_manifest\.lua;" "$C"; then
  say "  OK   el fixture /__selftest_full conserva el wake directo (regresión viva)"
else
  bad "el fixture perdió el wake directo"
fi
# invariantes prohibidos: siguen ENTEROS en la copia parcheada
for inv in "return 404;" "location = /_ape/_fetch" "proxy_cache             off;" "location = /_ape/qoe" "location = /_ape/health"; do
  if grep -qF -- "$inv" "$C"; then
    say "  OK   invariante presente: $inv"
  else
    bad "invariante PERDIDO: $inv"
  fi
done

# ── 4 · diff exacto que se aplicaría en la ventana (informativo) ───────────
say ""
say "── 4 · diff que la ventana E10 aplicaría (ficheros VIVOS) ────────────"
for spec in "$STAGE/patches/0001-ape_gateway-decision.patch:$LUA_DIR" \
            "$STAGE/patches/0002-ape_obs-error-ratio.patch:$LUA_DIR" \
            "$STAGE/patches/0003-50-ape-meta-plane-e7.patch:/etc/nginx/conf.d"; do
  p="${spec%%:*}"; d="${spec##*:}"
  say "  ── $(basename "$p") en $d"
  ( cd "$d" && patch -p1 --dry-run --silent < "$p" ) >/tmp/e7-dry.log 2>&1 \
    && say "     DRY-RUN OK (los hunk encajan en los bytes vivos)" \
    || { bad "DRY-RUN falla en $d"; sed 's/^/     /' /tmp/e7-dry.log; }
done

# ── 5 · el fichero vivo sigue intacto después de todo lo anterior ──────────
say ""
say "── 5 · prueba de que producción NO se tocó ───────────────────────────"
for pair in "$LUA_DIR/ape_gateway.lua:$SHA_GW" "$LUA_DIR/ape_obs.lua:$SHA_OBS" "$CONF:$SHA_CONF"; do
  f="${pair%%:*}"; want="${pair##*:}"
  got="$(sha256sum "$f" | cut -d' ' -f1)"
  [ "$got" = "$want" ] && say "  OK   $f sigue ${got:0:16}…" || bad "$f cambió durante el preflight"
done
say "  nginx: MainPID=$(systemctl show nginx -p MainPID --value) NRestarts=$(systemctl show nginx -p NRestarts --value) active=$(systemctl is-active nginx)"

say ""
if [ "$FAIL" -eq 0 ]; then
  say "RESULT=OK"
else
  say "RESULT=FAIL"
fi
exit "$FAIL"
