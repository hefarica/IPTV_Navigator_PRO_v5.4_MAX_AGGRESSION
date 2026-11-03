#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E10 · VENTANA DE APLICACIÓN — paquete compuesto (E7 + SSRF + Accept-Ranges + UHD)
# ═══════════════════════════════════════════════════════════════════════════
# ESTADO: PREPARADO. NO se aplica sin confirmación explícita del propietario.
#
# Uso (el stage se sube a /tmp, nunca a producción):
#   scp -r _vps_stage/edge/E10_window/staged root@VPS:/tmp/e10-stage
#   ssh root@VPS "STAGE=/tmp/e10-stage bash -s -- --check" < scripts/apply_E10.sh
#   ssh root@VPS "OWNER_CONFIRMED=1 STAGE=/tmp/e10-stage bash -s -- --apply" < scripts/apply_E10.sh
#
# Qué instala (11 ficheros):
#   ~ lua/ape_gateway.lua       (E11+E7 compuesto + sin bypass SSRF + guard 8K E5-B)
#   ~ lua/ape_obs.lua           (E11+E7 compuesto: error_ratio fallos/intentos + ventana)
#   ~ lua/ape_uhd.lua           (E5-A: techo 4K + can_declare_8k)
#   ~ lua/ape_luatest.lua       (asserts 155-156 a 4K/4k)
#   + lua/ape_obs_metrics.lua · ape_obs_rec.lua · ape_obs_http.lua · ape_log_chain.lua · ape_obs_metrics_api.lua
#   ~ conf.d/50-ape-meta-plane.conf (E7: log_by_lua chain + /_ape/metrics loopback)
#   ~ sites-enabled/default     (E6: quita add_header Accept-Ranges de /lists/)
#
# NO toca: /var/www/lists, gzip_static/gunzip, regla .ts→404, resolve.php/origins.php,
#          ngx.exit(503), ningún circuito, HTTP/2 (sigue ON), APE-SEC (se preservan).
# Salvaguardas: hashes vivos pineados, luac5.1 -p, nginx -t, APE-SEC antes del include,
#               reload (nunca restart), smoke y ROLLBACK automático.
# ═══════════════════════════════════════════════════════════════════════════
set -u

MODE="${1:-}"
STAGE="${STAGE:-/tmp/e10-stage}"
STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
OWNER_CONFIRMED="${OWNER_CONFIRMED:-0}"
BK="/root/backups/edge-e10-${STAMP}"
LUA="/etc/nginx/lua"
CONF="/etc/nginx/conf.d/50-ape-meta-plane.conf"
SITE="/etc/nginx/sites-enabled/default"

SHA_GW="2dc0fad86f45f4acfe03f3e3e7044b193cc391f5592e48cd8126424f736f35a8"
SHA_OBS="f477741bcfa600bb44801d44b83a62777848d4b11e5305a7327bee09d1fdc6d0"
SHA_UHD="f1f5eb674744858ae7c5e84c73262e37545b0c84e557c6466cad20ae7b1f3b5e"
SHA_LT="98a29c444f1bca0f59d4b15a7426eaf8e64e7745d12caaba54266019c37eb37d"
SHA_DEF="49c162a862f1e5485959350f2b2175f24eec440a10d2cd6902b2e0e03f8c59d1"
SHA_CONF="3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515"
SHA_NGT="0c6c0ea0090e7dd7defb0845763e4eb050ed21dfc70953e987cfd9d9b3813d1c"
NEW_LUA="ape_obs_metrics.lua ape_obs_rec.lua ape_obs_http.lua ape_log_chain.lua ape_obs_metrics_api.lua"
FAIL=0
say() { printf '%s\n' "$*"; }
bad() { FAIL=1; printf 'FAIL  %s\n' "$*"; }

case "$MODE" in --check|--apply|--backup-only) : ;; *) say "USO: bash -s -- --check | --backup-only | --apply"; exit 2 ;; esac
[ -d "$STAGE" ] || { say "FATAL: falta el stage $STAGE"; exit 1; }
command -v luac5.1 >/dev/null || { say "FATAL: falta luac5.1"; exit 1; }

say "===== E10 · VENTANA COMPUESTA (E7+SSRF+Accept-Ranges+UHD) ====="
say "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE stamp=$STAMP"
say "OWNER_CONFIRMED=$OWNER_CONFIRMED (para --apply debe ser 1)"
say "stage=$STAGE backup=$BK"
say "nginx=$(nginx -v 2>&1) · lua=$(lua5.1 -v 2>&1 | head -1)"

# ── 0 · compuerta de confirmación explícita ────────────────────────────────
if [ "$MODE" = "--apply" ] && [ "$OWNER_CONFIRMED" != "1" ]; then
  say "FATAL: --apply exige confirmación explícita del propietario (OWNER_CONFIRMED=1)."
  say "       Sin confirmación, el único modo válido es --check."
  exit 2
fi

# ── 1 · precondiciones: bytes vivos pineados ───────────────────────────────
say ""
say "── 1 · precondiciones (bytes vivos) ──────────────────────────────────"
for pair in "$LUA/ape_gateway.lua:$SHA_GW" "$LUA/ape_obs.lua:$SHA_OBS" "$LUA/ape_uhd.lua:$SHA_UHD" \
            "$LUA/ape_luatest.lua:$SHA_LT" "$SITE:$SHA_DEF" "$CONF:$SHA_CONF"; do
  f="${pair%%:*}"; want="${pair##*:}"
  [ -f "$f" ] || { say "FATAL: falta $f"; exit 1; }
  got="$(sha256sum "$f" | cut -d' ' -f1)"
  if [ "$got" != "$want" ]; then
    say "FATAL: $f cambió (sha256=${got:0:16}… != ${want:0:16}…)"
    say "       re-hashear y recomponer; NUNCA aplicar contra otra base."
    exit 1
  fi
  say "  OK   $f = ${got:0:16}…"
done
want_t="$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"
if [ "$want_t" != "$SHA_NGT" ]; then
  say "FATAL: nginx -T cambió (${want_t:0:16}… != ${SHA_NGT:0:16}…); otra sesión tocó nginx."
  exit 1
fi
say "  OK   nginx -T = ${want_t:0:16}…"
for f in $NEW_LUA; do
  if [ -e "$LUA/$f" ]; then say "FATAL: $LUA/$f ya existe; el paquete asume que E7 NO está instalado."; exit 1; fi
done
say "  OK   los 5 Lua de E7 no existen (instalación limpia)"
say "  nginx: MainPID=$(systemctl show nginx -p MainPID --value) NRestarts=$(systemctl show nginx -p NRestarts --value) active=$(systemctl is-active nginx)"

# ── 2 · stage íntegro + sintaxis + checks estáticos ────────────────────────
say ""
say "── 2 · stage: SHA256SUMS + luac5.1 -p + checks estáticos ──────────────"
( cd "$STAGE" && sha256sum -c SHA256SUMS >/tmp/e10-sums.txt 2>&1 ) || { say "FATAL: SHA256SUMS del stage no verifica"; sed 's/^/  /' /tmp/e10-sums.txt; exit 1; }
say "  OK   SHA256SUMS ($(wc -l < "$STAGE/SHA256SUMS") ficheros)"
for f in "$STAGE"/etc/nginx/lua/*.lua; do
  b="$(basename "$f")"
  if luac5.1 -p "$f" 2>/tmp/e10-luac.err; then say "  OK   luac $b"; else bad "luac $b: $(cat /tmp/e10-luac.err)"; fi
done
GW="$STAGE/etc/nginx/lua/ape_gateway.lua"
grep -q 'remote_addr == "127.0.0.1"' "$GW" && bad "bypass SSRF sigue en el gateway" || say "  OK   bypass SSRF ausente"
grep -q 'if true then' "$GW" && say "  OK   breaker neutralizado (if true then)" || bad "falta 'if true then'"
grep -q 'HOSTS:set(dk, 1, 15)' "$GW" && bad "HOSTS:set(dk,1,15) sigue" || say "  OK   sin HOSTS:set(dk,1,15)"
for k in 'X-APE-Reason' 'X-APE-Attempts' 'ngx.ctx.ape_dec' 'uhd.can_declare_8k(rebased)'; do
  grep -q "$k" "$GW" && say "  OK   gateway contiene $k" || bad "falta $k"
done
grep -q 'M.can_declare_8k' "$STAGE/etc/nginx/lua/ape_uhd.lua" && say "  OK   ape_uhd can_declare_8k" || bad "ape_uhd sin guard"
grep -q 'tostring(attempts)' "$GW" >/dev/null && say "  OK   attempts serializado" || bad "attempts no serializado"
grep -q 'attempts = req + failed + denied + big' "$STAGE/etc/nginx/lua/ape_obs.lua" && say "  OK   obs error_ratio honesto" || bad "obs sin fix"
if grep -q 'uhd.auto_4k_a_8k.*RESOLUTION=3840x2160' "$STAGE/etc/nginx/lua/ape_luatest.lua" \
   && grep -q 'uhd.auto_4k_modo.*, "4k")' "$STAGE/etc/nginx/lua/ape_luatest.lua" \
   && ! grep -q 'uhd.auto_4k_a_8k.*RESOLUTION=7680x4320' "$STAGE/etc/nginx/lua/ape_luatest.lua"; then
  say "  OK   luatest auto_4k espera 3840x2160 / 4k"
else
  bad "luatest no actualizado a 4K"
fi
# (el test directo de 8K - uhd.8k_resolucion - sigue esperando 7680x4320 y es correcto)
# APE-SEC antes del include (SSRF y vídeo; upload.php va después, es otro server location)
awk '/APE-SEC 2026-10-26 SSRF/{ssrf=NR} /APE-SEC 2026-10-26: el candado/{vid=NR} /include snippets\/ape-meta-public.conf/{inc=NR} END{ if (ssrf && vid && inc && ssrf < inc && vid < inc) print "  OK   APE-SEC SSRF/vídeo (l." ssrf "/" vid ") antes del include (l." inc ")"; else { print "  FAIL orden APE-SEC/include"; exit 1 } }' "$STAGE/etc/nginx/sites-enabled/default" || bad "orden APE-SEC"
[ "$FAIL" -eq 0 ] || { say "FATAL: checks estáticos con fallos; NO se aplica nada."; exit 1; }

# ── 3 · nginx -t sobre un árbol COPIA con los confs staged ─────────────────
say ""
say "── 3 · nginx -t del paquete (árbol copia, no toca el vivo) ────────────"
ETC="/tmp/e10-etc-${STAMP}"
rm -rf "$ETC"; mkdir -p "$ETC"; cp -a /etc/nginx/. "$ETC"/
install -m 644 "$STAGE/etc/nginx/conf.d/50-ape-meta-plane.conf" "$ETC/conf.d/50-ape-meta-plane.conf"
install -m 644 "$STAGE/etc/nginx/sites-enabled/default" "$ETC/sites-enabled/default"
sed -e "s#include /etc/nginx/conf.d/\*.conf;#include $ETC/conf.d/*.conf;#" \
    -e "s#include /etc/nginx/sites-enabled/\*;#include $ETC/sites-enabled/*;#" \
    "$ETC/nginx.conf" > "$ETC/nginx.conf.e10"
if nginx -t -c "$ETC/nginx.conf.e10" >/tmp/e10-nginxt.txt 2>&1; then
  say "  OK   nginx -t del paquete"; sed 's/^/       /' /tmp/e10-nginxt.txt
else
  say "FATAL: nginx -t del paquete FALLA"; sed 's/^/       /' /tmp/e10-nginxt.txt; exit 1
fi
say "  listeners 443 (siguen con http2):"; nginx -T -c "$ETC/nginx.conf.e10" 2>/dev/null | grep 'listen .*443' | sed 's/^/       /'

# ── 4 · --check: diff exacto y salir sin escribir ──────────────────────────
if [ "$MODE" = "--check" ]; then
  say ""
  say "── 4 · MODO --check: diff que se aplicaría (NO se escribe nada) ──────"
  for pair in "ape_gateway.lua:2dc0fad86f45f4ac:D" "ape_obs.lua:f477741bcfa600bb:D" "ape_uhd.lua:f1f5eb674744858a:D" "ape_luatest.lua:98a29c444f1bca0f:D"; do
    f="${pair%%:*}"; rest="${pair#*:}"; pin="${rest%%:*}"
    say ""
    say "  ## $f (vivo ${pin}… → staged $(sha256sum "$STAGE/etc/nginx/lua/$f" | cut -c1-16)…)"
    diff -u "$LUA/$f" "$STAGE/etc/nginx/lua/$f" 2>/dev/null | head -80 | sed 's/^/     /' || true
  done
  say ""
  say "  ## sites-enabled/default (vivo 49c162a8… → staged $(sha256sum "$STAGE/etc/nginx/sites-enabled/default" | cut -c1-16)…)"
  diff -u "$SITE" "$STAGE/etc/nginx/sites-enabled/default" 2>/dev/null | head -40 | sed 's/^/     /' || true
  say ""
  say "  ## conf.d/50-ape-meta-plane.conf (vivo 3e29b928… → staged $(sha256sum "$STAGE/etc/nginx/conf.d/50-ape-meta-plane.conf" | cut -c1-16)…)"
  diff -u "$CONF" "$STAGE/etc/nginx/conf.d/50-ape-meta-plane.conf" 2>/dev/null | head -80 | sed 's/^/     /' || true
  say ""
  say "  Ficheros nuevos: $(echo $NEW_LUA | tr ' ' ', ')"
  say ""
  say "RESULT=CHECK (sin cambios; requiere OWNER_CONFIRMED=1 + --apply para aplicar)"
  exit 0
fi

# ── 4b · --backup-only: crea el punto de rollback SIN tocar nginx ─────────
if [ "$MODE" = "--backup-only" ]; then
  say ""
  say "── 4b · --backup-only: creando $BK (solo backups, Δ funcional 0) ──────"
  mkdir -p "$BK" || { say "FATAL: no pude crear $BK"; exit 1; }
  for f in ape_gateway.lua ape_obs.lua ape_uhd.lua ape_luatest.lua; do
    cp -a "$LUA/$f" "$BK/$f.orig" || { say "FATAL: backup $f"; exit 1; }
  done
  cp -a "$SITE" "$BK/default.orig"
  cp -a "$CONF" "$BK/50-ape-meta-plane.conf.orig"
  nginx -T > "$BK/nginx-T.orig.conf" 2>/dev/null || true
  ( cd "$BK" && sha256sum *.orig nginx-T.orig.conf > SHA256SUMS )
  chmod 600 "$BK"/* 2>/dev/null
  say "  OK   $BK ($(wc -l < "$BK/SHA256SUMS") hashes, 600)"
  say "RESULT=BACKUP_OK stamp=$STAMP root=$BK"
  exit 0
fi

# ── 5 · backup + instalación ───────────────────────────────────────────────
say ""
say "── 5 · backup + instalación ──────────────────────────────────────────"
mkdir -p "$BK" || { say "FATAL: no pude crear $BK"; exit 1; }
for f in ape_gateway.lua ape_obs.lua ape_uhd.lua ape_luatest.lua; do
  cp -a "$LUA/$f" "$BK/$f.orig" || { say "FATAL: backup $f"; exit 1; }
done
cp -a "$SITE" "$BK/default.orig"
cp -a "$CONF" "$BK/50-ape-meta-plane.conf.orig"
nginx -T > "$BK/nginx-T.orig.conf" 2>/dev/null || true
( cd "$BK" && sha256sum *.orig nginx-T.orig.conf > SHA256SUMS )
chmod 600 "$BK"/* 2>/dev/null
say "  OK   backup $BK ($(wc -l < "$BK/SHA256SUMS") hashes)"

rollback() {
  local why="$1"
  say ""
  say "!! ROLLBACK ($why)"
  install -m 644 -o root -g root "$BK/ape_gateway.lua.orig" "$LUA/ape_gateway.lua"
  install -m 644 -o root -g root "$BK/ape_obs.lua.orig" "$LUA/ape_obs.lua"
  install -m 644 -o root -g root "$BK/ape_uhd.lua.orig" "$LUA/ape_uhd.lua"
  install -m 644 -o root -g root "$BK/ape_luatest.lua.orig" "$LUA/ape_luatest.lua"
  install -m 644 -o root -g root "$BK/default.orig" "$SITE"
  install -m 644 -o root -g root "$BK/50-ape-meta-plane.conf.orig" "$CONF"
  for f in $NEW_LUA; do rm -f "$LUA/$f"; done
  if nginx -t >/tmp/e10-rb-t.txt 2>&1; then
    say "  OK   nginx -t tras restaurar"
    systemctl reload nginx && say "  OK   reload tras rollback" || say "  CRITICAL: reload falló"
  else
    say "  CRITICAL: nginx -t falla tras restaurar:"; sed 's/^/       /' /tmp/e10-rb-t.txt
  fi
  say "  hashes restaurados:"
  for pair in "$LUA/ape_gateway.lua:$SHA_GW" "$LUA/ape_obs.lua:$SHA_OBS" "$LUA/ape_uhd.lua:$SHA_UHD" \
              "$LUA/ape_luatest.lua:$SHA_LT" "$SITE:$SHA_DEF" "$CONF:$SHA_CONF"; do
    f="${pair%%:*}"; want="${pair##*:}"; got="$(sha256sum "$f" | cut -d' ' -f1)"
    [ "$got" = "$want" ] && say "    OK $f" || say "    MISMATCH $f ($got)"
  done
  say "RESULT=FAIL (rollback aplicado: $why)"
  exit 1
}

# re-chequeo anti-carrera justo antes de escribir
for pair in "$LUA/ape_gateway.lua:$SHA_GW" "$LUA/ape_obs.lua:$SHA_OBS" "$LUA/ape_uhd.lua:$SHA_UHD" \
            "$LUA/ape_luatest.lua:$SHA_LT" "$SITE:$SHA_DEF" "$CONF:$SHA_CONF"; do
  f="${pair%%:*}"; want="${pair##*:}"
  [ "$(sha256sum "$f" | cut -d' ' -f1)" = "$want" ] || rollback "carrera: $f cambió antes de escribir"
done

for f in $NEW_LUA; do
  install -m 644 -o root -g root "$STAGE/etc/nginx/lua/$f" "$LUA/$f" || rollback "no pude instalar $f"
  say "  + $f"
done
for f in ape_gateway.lua ape_obs.lua ape_uhd.lua ape_luatest.lua; do
  install -m 644 -o root -g root "$STAGE/etc/nginx/lua/$f" "$LUA/$f" || rollback "no pude instalar $f"
  say "  ~ $f"
done
install -m 644 -o root -g root "$STAGE/etc/nginx/conf.d/50-ape-meta-plane.conf" "$CONF" || rollback "no pude instalar meta-plane"
install -m 644 -o root -g root "$STAGE/etc/nginx/sites-enabled/default" "$SITE" || rollback "no pude instalar default"
say "  ~ conf.d/50-ape-meta-plane.conf"
say "  ~ sites-enabled/default"

# ── 6 · validación post-instalación ────────────────────────────────────────
say ""
say "── 6 · validación post-instalación ───────────────────────────────────"
for f in "$LUA"/ape_obs_metrics.lua "$LUA"/ape_obs_rec.lua "$LUA"/ape_obs_http.lua "$LUA"/ape_log_chain.lua "$LUA"/ape_obs_metrics_api.lua "$LUA"/ape_gateway.lua "$LUA"/ape_obs.lua "$LUA"/ape_uhd.lua "$LUA"/ape_luatest.lua; do
  luac5.1 -p "$f" 2>/tmp/e10-luac.err || rollback "luac5.1 -p falla en $f: $(cat /tmp/e10-luac.err)"
done
say "  OK   luac5.1 -p de los 9 Lua en su ubicación final"
awk '/APE-SEC 2026-10-26 SSRF/{ssrf=NR} /APE-SEC 2026-10-26: el candado/{vid=NR} /include snippets\/ape-meta-public.conf/{inc=NR} END{ if (ssrf && vid && inc && ssrf < inc && vid < inc) print "  OK   APE-SEC SSRF/vídeo (l." ssrf "/" vid ") antes del include (l." inc ")"; else exit 1 }' "$SITE" || rollback "APE-SEC movido respecto al include"
if nginx -t >/tmp/e10-nginx-t.txt 2>&1; then
  say "  OK   nginx -t"
else
  sed 's/^/       /' /tmp/e10-nginx-t.txt
  rollback "nginx -t FALLA con la config nueva"
fi
pre_pid="$(systemctl show nginx -p MainPID --value)"
if systemctl reload nginx; then
  say "  OK   systemctl reload nginx (no restart)"
else
  rollback "systemctl reload falló"
fi
sleep 1
post_pid="$(systemctl show nginx -p MainPID --value)"
say "  MainPID $pre_pid → $post_pid NRestarts=$(systemctl show nginx -p NRestarts --value) active=$(systemctl is-active nginx)"
[ "$pre_pid" = "$post_pid" ] || bad "el PID cambió: hubo restart, no reload"

# ── 7 · smoke (incluye los 3 manifiestos y las guardas) ───────────────────
say ""
say "── 7 · smoke ─────────────────────────────────────────────────────────"
smoke_fail=0
chk() { local name="$1" want="$2" got="$3"; if [ "$got" = "$want" ]; then say "  OK   $name = $got"; else say "  FAIL $name = $got (esperaba $want)"; smoke_fail=1; fi; }

code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://127.0.0.1:8088/_ape/metrics || true)"
chk "/_ape/metrics loopback" 200 "$code"
curl -s -m 8 "http://127.0.0.1:8088/_ape/metrics?window=300" -o /tmp/e10-metrics.json || true
python3 - <<'PY' || smoke_fail=1
import json,sys
m=json.load(open('/tmp/e10-metrics.json'))
for k in ("schema","provider_fetch_ms","hops","uhd_mode","rebase","errors","edge","cost"):
    assert k in m, k
assert m["schema"]=="ape.obs.metrics/1"
assert m["cost"]["hot_path_writes"]==0
print("  OK   /_ape/metrics schema + bloques + coste 0")
PY
h="$(curl -s -m 8 http://127.0.0.1:8088/_ape/health || true)"
echo "$h" | python3 -c 'import json,sys; d=json.load(sys.stdin); c=d["checks"]; assert c["error_ratio_semantics"].startswith("fallos/intentos"); assert "attempts" in c; print("  OK   /_ape/health: error_ratio honesto + attempts")' || smoke_fail=1
code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 --resolve iptv-ape.duckdns.org:443:127.0.0.1 https://iptv-ape.duckdns.org/ape/health || true)"
chk "/ape/health (443)" 200 "$code"
code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 https://iptv-ape.duckdns.org/cdn/127.0.0.1:8088/_ape/health || true)"
chk "SSRF /cdn/127.0.0.1 (público)" 403 "$code"
code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://127.0.0.1:8088/cdn/127.0.0.1:8088/_ape/health || true)"
chk "SSRF /cdn/127.0.0.1 (loopback, bypass fuera)" 403 "$code"
code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/x.ts || true)"
chk "/cdn/…x.ts" 404 "$code"
code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 https://iptv-ape.duckdns.org/upload.php || true)"
chk "/upload.php" 403 "$code"
code="$(curl -s -I --http2 -o /dev/null -w '%{http_code}' -m 10 https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 || true)"
chk "lista h2" 200 "$code"
code="$(curl -s -I --http1.1 -o /dev/null -w '%{http_code}' -m 10 https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 || true)"
chk "lista h1" 200 "$code"
# 3 canales reales (descubiertos de la lista CDN viva; credenciales no se imprimen)
LIST_GZ=/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz
for id in 3 5 6; do
  url="$(zcat "$LIST_GZ" 2>/dev/null | grep -m1 -E "^https://iptv-ape\\.duckdns\\.org/cdn/line\\.tivi-ott\\.net/.*/${id}\\.m3u8$")"
  if [ -z "$url" ]; then say "  FAIL canal $id no encontrado"; smoke_fail=1; continue; fi
  hdr="$(mktemp)"; body="$(mktemp)"
  code="$(curl -sS --http2 -m 30 -D "$hdr" -o "$body" -w '%{http_code}' "$url" || true)"
  chk "canal $id (h2)" 200 "$code"
  if ! tr -d '\r' < "$hdr" | grep -qi '^x-ape-cdn:'; then say "  FAIL canal $id sin X-APE-CDN"; smoke_fail=1; fi
  rm -f "$hdr" "$body"
done
# cabeceras de error E11: una ruta inexistente en host permitido (sonda deliberada)
H="$(mktemp)"
curl -sS -m 20 -D "$H" -o /dev/null "https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/__e10_smoke_no_existe__.m3u8" || true
if tr -d '\r' < "$H" | grep -qi '^x-ape-reason:'; then say "  OK   X-APE-Reason presente en respuesta de error"; else say "  FAIL falta X-APE-Reason"; smoke_fail=1; fi
if tr -d '\r' < "$H" | grep -qi '^x-ape-attempts:'; then say "  OK   X-APE-Attempts presente en respuesta de error"; else say "  FAIL falta X-APE-Attempts"; smoke_fail=1; fi
rm -f "$H"
# UHD: el fixture loopback ya NO es alcanzable (bypass SSRF fuera) — la guarda se
# prueba en /_ape/luatest (módulo) + matriz offline. Aquí solo se comprueba el self-test.
lt="$(curl -s -m 10 http://127.0.0.1:8088/_ape/luatest || true)"
echo "$lt" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["fail"]==0, d; print("  OK   /_ape/luatest fail=0 (total=%d)" % d["total"])' || smoke_fail=1

if [ "$smoke_fail" -ne 0 ] || [ "$FAIL" -ne 0 ]; then
  rollback "smoke con fallos"
fi

say ""
say "── 8 · estado final ──────────────────────────────────────────────────"
say "  nginx: MainPID=$(systemctl show nginx -p MainPID --value) NRestarts=$(systemctl show nginx -p NRestarts --value) active=$(systemctl is-active nginx)"
say "  hashes post:"
for f in "$LUA/ape_gateway.lua" "$LUA/ape_obs.lua" "$LUA/ape_uhd.lua" "$LUA/ape_luatest.lua" "$SITE" "$CONF"; do
  say "    $(sha256sum "$f" | cut -c1-16)…  $f"
done
say "  nginx -T post: $(nginx -T 2>/dev/null | sha256sum | cut -c1-16)…"
say "  backup/rollback: $BK"
say ""
say "RESULT=OK"
exit 0
