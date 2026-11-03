#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE — rollback de la exposición en 443 y del watchdog
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

VHOST=/etc/nginx/sites-enabled/default
SNIP=/etc/nginx/snippets/ape-meta-public.conf
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/root/ape-443-rollback-$TS"

echo "== unexpose-443 =="
mkdir -p "$BACKUP"
cp -a "$VHOST" "$BACKUP/default.before" 2>/dev/null || true

echo "[1] watchdog"
systemctl disable --now ape-meta-watchdog.timer >/dev/null 2>&1 || true
rm -f /etc/systemd/system/ape-meta-watchdog.timer /etc/systemd/system/ape-meta-watchdog.service
rm -f /usr/local/bin/ape-meta-watchdog.sh
systemctl daemon-reload
echo "  watchdog desinstalado"

echo "[2] quitar include del vhost"
if grep -q "ape-meta-public.conf" "$VHOST"; then
    TMP="$(mktemp)"
    grep -v "include snippets/ape-meta-public.conf;" "$VHOST" > "$TMP"
    cat "$TMP" > "$VHOST"
    rm -f "$TMP"
    echo "  include quitado"
else
    echo "  no estaba"
fi

echo "[3] quitar snippet"
rm -f "$SNIP"
echo "  $SNIP eliminado"

echo "[4] nginx -t + reload"
if nginx -t; then
    systemctl reload nginx && echo "  reload ok"
else
    echo "  nginx -t FALLA; restaurar a mano desde $BACKUP"
    exit 1
fi

echo "[5] verificacion"
PUB="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 \
    --resolve iptv-ape.duckdns.org:443:127.0.0.1 https://iptv-ape.duckdns.org/ape/health || echo 000)"
echo "  /ape/health (debe ser 404 ahora) -> $PUB"
echo "LISTO."
