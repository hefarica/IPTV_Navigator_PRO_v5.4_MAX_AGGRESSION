#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE META-PLANE — validación OFFLINE con instancia nginx aislada (:8089)
# ═══════════════════════════════════════════════════════════════════════════
# Arranca un nginx APARTE (prefix /tmp/ape-test) con el vhost staged.
# La instancia de producción (443 y el :8088 real) NO se toca en ningún momento.
# Al terminar, la instancia de prueba se detiene.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

STAGE="$(cd "$(dirname "$0")/.." && pwd)"
P=/tmp/ape-test

echo "== validate-offline =="
echo "stage: $STAGE"
rm -rf "$P"; mkdir -p "$P"

echo "[1] sintaxis Lua (luajit -bl)"
if command -v luajit >/dev/null 2>&1; then
    if luajit -bl "$STAGE/lua/ape_uri_rebase.lua" >/dev/null 2>&1; then
        echo "    ok"
    else
        echo "    FAIL sintaxis Lua"; exit 1
    fi
else
    echo "    luajit no disponible: se omite (lo validan nginx + luatest)"
fi

echo "[2] preparar conf aislada"
mkdir -p "$P/lua" "$P/fixtures"
MODS="ape_uri_rebase.lua ape_rebase_lib.lua ape_gateway.lua ape_obs.lua ape_uhd.lua ape_lab_bridge.lua ape_lab_api.lua ape_lab_upload.lua ape_luatest.lua sentinel_auth_guard.lua ape_header.lua ape_wake_on_manifest.lua bw_adaptive_floor.lua ape_profile_resolver.lua"
for f in $MODS; do
    install -m 0644 "$STAGE/lua/$f" "$P/lua/$f"
done
# el conf referencia /etc/nginx/ape-selftest/playlist[_ll|_master].m3u8
install -m 0644 "$STAGE/fixtures/selftest.m3u8"        "$P/fixtures/playlist.m3u8"
install -m 0644 "$STAGE/fixtures/selftest_ll.m3u8"     "$P/fixtures/playlist_ll.m3u8"
install -m 0644 "$STAGE/fixtures/selftest_master.m3u8" "$P/fixtures/playlist_master.m3u8"
install -m 0644 "$STAGE/fixtures/selftest_master4k.m3u8" "$P/fixtures/playlist_master4k.m3u8"
chmod 755 "$P" "$P/lua" "$P/fixtures"

# remapeo de rutas + puerto (8088 prod -> 8089 test)
sed -e "s#/etc/nginx/lua/#$P/lua/#g" \
    -e "s#/etc/nginx/ape-selftest/#$P/fixtures/#g" \
    -e "s#listen 8088;#listen 8089;#g" \
    -e "s#127.0.0.1:8088/__fixture#127.0.0.1:8089/__fixture#g" \
    "$STAGE/nginx/meta-plane.conf" > "$P/meta-plane.conf"

# wrapper: sin lua_package_path los require() de los módulos fallan
# (el nginx.conf de producción sí lo declara; el test necesita el suyo).
cat > "$P/nginx.conf" <<EOF
worker_processes 1;
pid $P/nginx.pid;
error_log $P/error.log warn;
include /etc/nginx/modules-enabled/*.conf;
events { worker_connections 128; }
http {
    access_log off;
    lua_package_path "$P/lua/?.lua;/usr/share/lua/5.1/?.lua;;";
    client_body_temp_path $P/client_body;
    proxy_temp_path      $P/proxy;
    fastcgi_temp_path    $P/fastcgi;
    uwsgi_temp_path      $P/uwsgi;
    scgi_temp_path       $P/scgi;
    include $P/meta-plane.conf;
}
EOF

echo "[3] nginx -t (config de prueba, NO producción)"
# SIN -p: los load_module de /etc/nginx/modules-enabled usan rutas relativas al
# prefijo compilado (/usr/share/nginx). Todos los paths de la config son absolutos.
nginx -t -c "$P/nginx.conf" || exit 1

echo "[4] arrancar instancia de prueba :8089"
nginx -c "$P/nginx.conf" || exit 1
sleep 1

echo "[5] smoke contra :8089 (instancia aislada, NO producción)"
"$STAGE/scripts/smoke.sh" http://127.0.0.1:8089
RC=$?

echo "[6] detener instancia de prueba"
nginx -s stop -c "$P/nginx.conf" >/dev/null 2>&1 || true
sleep 1
if pgrep -f "$P/nginx.conf" >/dev/null 2>&1; then
    pkill -f "$P/nginx.conf" >/dev/null 2>&1 || true
fi
echo "    detenida"

echo "== resultado: RC=$RC =="
exit "$RC"
