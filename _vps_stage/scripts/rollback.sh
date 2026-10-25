#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE META-PLANE — rollback completo
# ═══════════════════════════════════════════════════════════════════════════
# Quita el vhost y el módulo Lua del plano de metadata, valida y recarga.
# Idempotente: se puede correr varias veces.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

DEST_CONF="/etc/nginx/conf.d/50-ape-meta-plane.conf"
DEST_LUA="/etc/nginx/lua/ape_uri_rebase.lua"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/root/ape-meta-plane-rollback-$TS"

echo "== APE META-PLANE rollback =="
mkdir -p "$BACKUP"
if [ -f "$DEST_CONF" ]; then cp -a "$DEST_CONF" "$BACKUP/"; rm -f "$DEST_CONF"; echo "  conf quitada"; else echo "  conf no estaba"; fi
if [ -f "$DEST_LUA" ];  then cp -a "$DEST_LUA"  "$BACKUP/"; rm -f "$DEST_LUA";  echo "  lua quitado";  else echo "  lua no estaba"; fi
if [ -d /etc/nginx/ape-selftest ]; then cp -a /etc/nginx/ape-selftest "$BACKUP/"; rm -rf /etc/nginx/ape-selftest; echo "  fixture quitado"; fi

echo "nginx -t"
if nginx -t; then
    systemctl reload nginx
    echo "rollback OK — :8088 ya no responde"
else
    echo "nginx -t FALLA tras rollback. Restaurar a mano desde $BACKUP"
    exit 1
fi
