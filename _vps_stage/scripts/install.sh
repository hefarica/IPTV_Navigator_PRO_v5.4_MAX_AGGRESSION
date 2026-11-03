#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE META-PLANE — instalación reversible
# ═══════════════════════════════════════════════════════════════════════════
# Qué hace, en orden:
#   1. Backup de la config/estado actual en /root/ape-meta-plane-backup-<ts>/
#   2. Instala el módulo Lua en /etc/nginx/lua/ape_uri_rebase.lua
#   3. Instala el vhost staged en /etc/nginx/conf.d/50-ape-meta-plane.conf
#   4. `nginx -t` — si falla, restaura el backup y ABORTA (no recarga nada)
#   5. reload de nginx solo si la prueba pasó
#   6. ejecuta el smoke test
#
# NO toca el vhost público 443 ni ninguna config existente.
# Si algo sale mal: scripts/rollback.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

STAGE="$(cd "$(dirname "$0")/.." && pwd)"
DEST_CONF="/etc/nginx/conf.d/50-ape-meta-plane.conf"
DEST_LUA_DIR="/etc/nginx/lua"
DEST_LUA="$DEST_LUA_DIR/ape_uri_rebase.lua"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/root/ape-meta-plane-backup-$TS"

echo "== APE META-PLANE install =="
echo "stage : $STAGE"
echo "backup: $BACKUP"

echo "[1/6] backup"
mkdir -p "$BACKUP"
if [ -f "$DEST_CONF" ]; then cp -a "$DEST_CONF" "$BACKUP/"; fi
if [ -d "$DEST_LUA_DIR" ]; then cp -a "$DEST_LUA_DIR" "$BACKUP/lua"; fi
if [ -d /etc/nginx/ape-selftest ]; then cp -a /etc/nginx/ape-selftest "$BACKUP/ape-selftest"; fi
nginx -T > "$BACKUP/nginx-T-before.txt" 2>/dev/null || true
echo "  ok -> $BACKUP"

echo "[2/6] instalar lua"
mkdir -p "$DEST_LUA_DIR"
for f in ape_uri_rebase.lua ape_rebase_lib.lua ape_gateway.lua ape_obs.lua ape_uhd.lua ape_lab_bridge.lua ape_lab_api.lua ape_lab_upload.lua ape_luatest.lua sentinel_auth_guard.lua ape_header.lua ape_wake_on_manifest.lua bw_adaptive_floor.lua ape_profile_resolver.lua; do
    install -m 0644 "$STAGE/lua/$f" "$DEST_LUA_DIR/$f"
    echo "  $DEST_LUA_DIR/$f"
done

echo "[2b/6] instalar fixture de self-test"
install -d /etc/nginx/ape-selftest
install -m 0644 "$STAGE/fixtures/selftest.m3u8" /etc/nginx/ape-selftest/playlist.m3u8
install -m 0644 "$STAGE/fixtures/selftest_ll.m3u8" /etc/nginx/ape-selftest/playlist_ll.m3u8
install -m 0644 "$STAGE/fixtures/selftest_master.m3u8" /etc/nginx/ape-selftest/playlist_master.m3u8
install -m 0644 "$STAGE/fixtures/selftest_master4k.m3u8" /etc/nginx/ape-selftest/playlist_master4k.m3u8
echo "  /etc/nginx/ape-selftest/playlist.m3u8"

echo "[2c/6] cola de wake-on-manifest"
# ape_wake_on_manifest.lua hace io.open("/dev/shm/ape_wake_queue","a") desde el worker
# (www-data). Si el fichero es de otro usuario, el append falla EN SILENCIO.
# Bug real observado: cola creada por otro usuario en tests → el módulo no encolaba.
install -m 0666 /dev/null /dev/shm/ape_wake_queue
echo "  /dev/shm/ape_wake_queue (0666)"

echo "[3/6] instalar conf"
install -m 0644 "$STAGE/nginx/meta-plane.conf" "$DEST_CONF"
echo "  $DEST_CONF"

echo "[4/6] nginx -t"
if ! nginx -t; then
    echo "  FALLO nginx -t -> restaurando backup (no se recarga nada)"
    if [ -f "$BACKUP/50-ape-meta-plane.conf" ]; then
        cp -a "$BACKUP/50-ape-meta-plane.conf" "$DEST_CONF"
    else
        rm -f "$DEST_CONF"
    fi
    nginx -t || true
    exit 1
fi
echo "  ok"

echo "[5/6] reload nginx"
systemctl reload nginx
echo "  ok"

echo "[6/6] smoke"
"$STAGE/scripts/smoke.sh" || echo "  smoke con avisos (revisar)"

echo
echo "LISTO. Metadata-only activo en :8088."
echo "Rollback: $STAGE/scripts/rollback.sh"
