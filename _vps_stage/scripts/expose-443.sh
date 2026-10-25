#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APE — exponer el plano de metadata en el 443 existente + watchdog 24/7
# ═══════════════════════════════════════════════════════════════════════════
# Cambios (todos con backup y gate nginx -t):
#   1. /etc/nginx/snippets/ape-meta-public.conf   (locations /cdn/ y /ape/health)
#   2. /etc/nginx/ape-hosts-allow.txt             (allowlist SSRF)
#   3. UNA línea include dentro del server 443 de sites-enabled/default
#   4. systemd: ape-meta-watchdog.service + .timer (cada 60 s, auto-repara)
# Rollback: scripts/unexpose-443.sh
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

STAGE="$(cd "$(dirname "$0")/.." && pwd)"
VHOST=/etc/nginx/sites-enabled/default
SNIP=/etc/nginx/snippets/ape-meta-public.conf
ALLOW=/etc/nginx/ape-hosts-allow.txt
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/root/ape-443-backup-$TS"

echo "== expose-443 =="
echo "[1] backup"
mkdir -p "$BACKUP"
cp -a "$VHOST" "$BACKUP/default.bak" || { echo "  no puedo leer $VHOST"; exit 1; }
cp -a /etc/nginx/snippets "$BACKUP/snippets" 2>/dev/null || true
echo "  -> $BACKUP"

echo "[2] snippet + allowlist"
install -m 0644 "$STAGE/public/ape-meta-public.conf" "$SNIP"
install -m 0644 "$STAGE/public/ape-hosts-allow.txt" "$ALLOW"
echo "  $SNIP"
echo "  $ALLOW"

echo "[3] include en el server 443 (idempotente)"
if grep -q "ape-meta-public.conf" "$VHOST"; then
    echo "  ya estaba incluido"
else
    TMP="$(mktemp)"
    awk '/ssl_protocols TLSv1\.2 TLSv1\.3;/ && !d {print; print "    include snippets/ape-meta-public.conf;"; d=1; next} {print}' \
        "$VHOST" > "$TMP"
    if ! grep -q "ape-meta-public.conf" "$TMP"; then
        echo "  ERROR: no encontré el punto de inserción"; rm -f "$TMP"; exit 1
    fi
    cat "$TMP" > "$VHOST"      # cat preserva inode y ACLs del archivo original
    rm -f "$TMP"
    echo "  include insertado"
fi

echo "[4] nginx -t"
if ! nginx -t; then
    echo "  FALLO nginx -t -> restaurando vhost y quitando snippet"
    cat "$BACKUP/default.bak" > "$VHOST"
    rm -f "$SNIP"
    nginx -t || true
    exit 1
fi
echo "  ok"

echo "[5] reload nginx"
systemctl reload nginx && echo "  ok"

echo "[6] watchdog 24/7"
install -m 0755 "$STAGE/watchdog/ape-meta-watchdog.sh"      /usr/local/bin/ape-meta-watchdog.sh
install -m 0644 "$STAGE/watchdog/ape-meta-watchdog.service" /etc/systemd/system/ape-meta-watchdog.service
install -m 0644 "$STAGE/watchdog/ape-meta-watchdog.timer"   /etc/systemd/system/ape-meta-watchdog.timer
systemctl daemon-reload
systemctl enable --now ape-meta-watchdog.timer >/dev/null 2>&1
echo "  timer: $(systemctl is-active ape-meta-watchdog.timer)"

echo "[7] verificacion"
if curl -fsS --max-time 5 http://127.0.0.1:8088/_ape/health >/dev/null 2>&1; then
    echo "  health interno (:8088) ok"
else
    echo "  health interno FALLA"
fi

PUB="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 \
    --resolve iptv-ape.duckdns.org:443:127.0.0.1 https://iptv-ape.duckdns.org/ape/health || echo 000)"
echo "  /ape/health publico (443) -> $PUB"

DENY="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 \
    --resolve iptv-ape.duckdns.org:443:127.0.0.1 "https://iptv-ape.duckdns.org/cdn/evil.example.com/x.m3u8" || echo 000)"
echo "  /cdn/ host no permitido -> $DENY (debe ser 403)"

SEG="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 \
    --resolve iptv-ape.duckdns.org:443:127.0.0.1 "https://iptv-ape.duckdns.org/x.ts" || echo 000)"
echo "  segmento .ts publico    -> $SEG (debe ser 404 si lo captura el plano)"

echo
echo "LISTO. Rollback: $STAGE/scripts/unexpose-443.sh"
