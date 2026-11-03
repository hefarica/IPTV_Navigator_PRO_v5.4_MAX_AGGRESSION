#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E2 · FASE 1 — HABILITAR HTTP/2 EN LOS LISTEN 443 (nginx 1.24)
# ═══════════════════════════════════════════════════════════════════════════
# EJECUTAR EN EL VPS (el script vive en el repo):
#   ssh root@178.156.147.234 "STAMP=20261026T203255Z bash -s" \
#     < _vps_stage/edge/phase1/apply_phase1_http2.sh
#
# QUÉ HACE (y solo esto)
#   1. Verifica que `sites-enabled/default` NO cambió desde el backup <STAMP>
#      (sha256 actual == sha256 del manifiesto). Si cambió, aborta.
#   2. Exige el estado previo exacto: 2 líneas `listen …443 ssl default_server;`
#      y 0 ocurrencias de `http2`.
#   3. Añade `http2` a ESAS 2 líneas (443 IPv4 + 443 IPv6). Nada más.
#   4. `nginx -t`. Si falla ⇒ restaura el backup y sale SIN recargar.
#   5. `systemctl reload nginx` (NUNCA restart). Verifica ALPN=h2 y estado.
#
# IDEMPOTENTE: si las 2 líneas ya tienen http2, sale 0 sin tocar nada.
# ROLLBACK: rollback_phase1.sh <STAMP> --apply  (restaura + nginx -t + reload)
# ═══════════════════════════════════════════════════════════════════════════
set -u

STAMP="${STAMP:-20261026T205255Z}"
BACKUP_ROOT="/root/backups/edge-e1-${STAMP}"
MAN="$BACKUP_ROOT/SHA256SUMS"
FILE="/etc/nginx/sites-enabled/default"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1
TMP_ORIG=""
TMP_NEW=""
FAIL=0

say() { printf '%s\n' "$*"; }
cleanup() { [ -n "$TMP_ORIG" ] && rm -f "$TMP_ORIG"; [ -n "$TMP_NEW" ] && rm -f "$TMP_NEW"; }
trap cleanup EXIT

say "===== E2 FASE 1 · HTTP/2 EN 443 ====="
say "stamp_backup=$STAMP"
say "file=$FILE"
say "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "nginx=$(nginx -v 2>&1)"

# ── 1 · precondiciones de backup ─────────────────────────────────────────
[ -f "$FILE" ] || { say "FATAL: falta $FILE"; exit 1; }
[ -f "$MAN" ]  || { say "FATAL: falta manifiesto $MAN"; exit 1; }

src_sha="$(awk -v f="$FILE" '$4 == f { print $1; exit }' "$MAN")"
cur_sha="$(sha256sum "$FILE" | cut -d' ' -f1)"
if [ -z "$src_sha" ]; then
  say "FATAL: $FILE no figura en $MAN"
  exit 1
fi
if [ "$cur_sha" != "$src_sha" ]; then
  say "FATAL: $FILE cambió desde el backup ($cur_sha != $src_sha); re-backupear antes de tocar."
  exit 1
fi
say "pre: sha256=$cur_sha (== backup $STAMP) size=$(stat -c %s "$FILE") mode=$(stat -c %a "$FILE")"

# ── 2 · estado previo exacto / idempotencia ──────────────────────────────
h2_now="$(grep -c 'listen .*443 .*http2' "$FILE" 2>/dev/null || true)"
h2_now="${h2_now:-0}"
if [ "$h2_now" -eq 2 ]; then
  say "OK: http2 ya está en los 2 listen 443 — nada que hacer."
  say "RESULT=OK (noop)"
  exit 0
fi
if [ "$h2_now" -ne 0 ]; then
  say "FATAL: estado http2 inesperado ($h2_now líneas con http2); no toco nada."
  exit 1
fi
n443="$(grep -c '^[[:space:]]*listen .*443 ssl default_server;' "$FILE" 2>/dev/null || true)"
if [ "$n443" -ne 2 ]; then
  say "FATAL: esperaba 2 líneas 'listen …443 ssl default_server;', encontré $n443."
  grep -n 'listen .*443' "$FILE" | sed 's/^/    /'
  exit 1
fi
say "pre: 2 listeners 443 sin http2"

# ── 3 · edición exacta (solo las 2 líneas 443) ───────────────────────────
TMP_ORIG="$(mktemp)"
TMP_NEW="$(mktemp)"
cp -a "$FILE" "$TMP_ORIG"
sed -e 's/^\([[:space:]]*\)listen 443 ssl default_server;/\1listen 443 ssl http2 default_server;/' \
    -e 's/^\([[:space:]]*\)listen \[::\]:443 ssl default_server;/\1listen [::]:443 ssl http2 default_server;/' \
    "$TMP_ORIG" > "$TMP_NEW"
new_h2="$(grep -c 'listen .*443 .*http2' "$TMP_NEW" 2>/dev/null || true)"
new_h2="${new_h2:-0}"
if [ "$new_h2" -ne 2 ]; then
  say "FATAL: la edición no produjo 2 listeners con http2 ($new_h2); no toco el fichero vivo"
  exit 1
fi

# ── 3b · modo --check: muestra el diff exacto y NO escribe nada ──────────
if [ "$CHECK" -eq 1 ]; then
  say "MODO --check: diff que se aplicaría (NO se escribe nada):"
  diff -u "$TMP_ORIG" "$TMP_NEW" | sed 's/^/    /' || true
  say "RESULT=CHECK (sin cambios)"
  exit 0
fi

# ── 3c · re-chequeo anti-carrera justo antes de escribir ─────────────────
cur_sha2="$(sha256sum "$FILE" | cut -d' ' -f1)"
if [ "$cur_sha2" != "$src_sha" ]; then
  say "FATAL: $FILE cambió durante la preparación ($cur_sha2 != $src_sha); aborto sin escribir."
  exit 1
fi

if ! install -m 644 -o root -g root "$TMP_NEW" "$FILE"; then
  say "FATAL: no pude instalar el fichero editado; restaurando original"
  install -m 644 -o root -g root "$TMP_ORIG" "$FILE"
  exit 1
fi
say "editado:"
grep -n 'listen .*443' "$FILE" | sed 's/^/    /'

# ── 4 · nginx -t; si falla, restaurar SIN reload ─────────────────────────
if nginx -t > /tmp/phase1-nginx-t.txt 2>&1; then
  say "OK  nginx -t"
  sed 's/^/    /' /tmp/phase1-nginx-t.txt
else
  say "FATAL: nginx -t FALLA — restauro el backup y NO recargo"
  sed 's/^/    /' /tmp/phase1-nginx-t.txt
  if install -m 644 -o root -g root "$TMP_ORIG" "$FILE" && nginx -t >/dev/null 2>&1; then
    say "restaurado: $FILE vuelve a sha256=$cur_sha; nginx sigue corriendo intacto"
  else
    say "CRITICAL: la restauración no pasa nginx -t; intervención manual"
  fi
  say "RESULT=FAIL"
  exit 1
fi

# ── 5 · reload + verificación ────────────────────────────────────────────
pre_pid="$(systemctl show nginx -p MainPID --value)"
if systemctl reload nginx; then
  say "OK  systemctl reload nginx (no restart)"
else
  say "FATAL: reload falló — restauro y recargo"
  install -m 644 -o root -g root "$TMP_ORIG" "$FILE"
  nginx -t && systemctl reload nginx
  say "RESULT=FAIL"
  exit 1
fi
sleep 1

post_sha="$(sha256sum "$FILE" | cut -d' ' -f1)"
say "post: sha256=$post_sha size=$(stat -c %s "$FILE") mode=$(stat -c %a "$FILE")"
say "nginx: $(systemctl show nginx -p MainPID --value) (pre=$pre_pid) NRestarts=$(systemctl show nginx -p NRestarts --value) active=$(systemctl is-active nginx)"
say "nginx -T listeners 443:"
nginx -T 2>/dev/null | grep 'listen .*443' | sed 's/^/    /'
alpn="$(echo | openssl s_client -connect 127.0.0.1:443 -servername iptv-ape.duckdns.org -alpn h2,http/1.1 2>/dev/null | grep -a 'ALPN protocol' || true)"
say "ALPN local: ${alpn:-(no leído)}"
list_v="$(curl -sS -I --http2 -m 15 -o /dev/null -w '%{http_version} %{http_code}' https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8 || true)"
say "lista por curl --http2: ${list_v:-ERROR}"
case "$list_v" in
  "2 200") : ;;
  *) say "WARN: la lista no respondió por HTTP/2 ($list_v)"; FAIL=1 ;;
esac
say "nginx -T sha256=$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"

if [ "$FAIL" -eq 0 ]; then
  say "RESULT=OK"
else
  say "RESULT=FAIL"
fi
exit "$FAIL"
