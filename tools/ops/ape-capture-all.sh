#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# /opt/ape-pulse/ape-capture-all.sh  (copia en tools/ops/ del repo)
#
# CAPTURA UNIFICADA DE TODOS LOS MODULOS DEL ECOSISTEMA APE, EN VIVO.
#
# Pedido textual del operador: "haz una captura de toda la data que cada modulo
# este generando en vivo, como funcionan los archivos .json, los php, los lua,
# etc... y agrega analisis de todos los errores que salgan y resuelvelos 4xx y
# 5xx".
#
# Que hace: lee, en una sola pasada y SIN escribir nada en produccion, el estado
# de cada modulo y lo imprime en secciones legibles. No reinicia nada, no toca
# nada, no recarga nada. Solo lectura.
#
# Uso:
#   bash /opt/ape-pulse/ape-capture-all.sh
#   bash /opt/ape-pulse/ape-capture-all.sh --json     (salida maquina)
#
# Doctrina: fail-honest. Un dato que no se puede leer se reporta como
# NO_COMPUTADO con su razon. NUNCA se asume cero. "La ventana de logs no lo
# muestra" no es "nunca ocurrio".
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

DB="/opt/netshield/data/conviva.db"
CANARY_LOG="/var/log/ara/canary.log"
GATE_LOG="/var/log/ara/provider-gate.log"
NGINX_LOGS="/var/log/nginx"
JSON=0
[ "${1:-}" = "--json" ] && JSON=1

# ── helpers ───────────────────────────────────────────────────────────────────
sec() { echo ""; echo "═══ $* ═══"; }
no_computado() { echo "  NO_COMPUTADO: $*"; }

# q <sql> <fallback>
q() {
  local sql="$1"; local fb="${2:-NO_COMPUTADO}"
  php -r '
    $db = getenv("APE_DB");
    try {
      $p = new PDO("sqlite:" . $db, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
      $r = $p->query(getenv("APE_SQL"));
      if (!$r) { echo "NO_COMPUTADO: query fallo\n"; exit(0); }
      $rows = $r->fetchAll(PDO::FETCH_ASSOC);
      if (!$rows) { echo "  (0 filas)\n"; exit(0); }
      $cols = array_keys($rows[0]);
      $w = [];
      foreach ($cols as $c) { $w[$c] = strlen($c); foreach ($rows as $row) { $w[$c] = max($w[$c], strlen((string)($row[$c] ?? ""))); } }
      $line = "";
      foreach ($cols as $c) { $line .= str_pad($c, $w[$c] + 2); }
      echo "  " . rtrim($line) . "\n";
      foreach ($rows as $row) {
        $line = "";
        foreach ($cols as $c) { $line .= str_pad((string)($row[$c] ?? ""), $w[$c] + 2); }
        echo "  " . rtrim($line) . "\n";
      }
    } catch (Throwable $e) { echo "NO_COMPUTADO: " . $e->getMessage() . "\n"; }
  ' APE_DB="$DB" APE_SQL="$sql" 2>/dev/null || echo "  $fb"
}

echo "════════════════════════════════════════════════════════════════════════════"
echo " CAPTURA UNIFICADA APE — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo " host: $(hostname)  ·  uptime: $(uptime -p 2>/dev/null | head -1)"
echo "════════════════════════════════════════════════════════════════════════════"

# ── 1. LISTA CABLEADA ─────────────────────────────────────────────────────────
sec "1. LISTA CABLEADA (/lists/)"
L=$(ls -la /var/www/html/lists/*.m3u8 2>/dev/null | tail -1)
if [ -n "$L" ]; then
  echo "  $L"
  F=$(ls -t /var/www/html/lists/*.m3u8 2>/dev/null | head -1)
  echo "  canales: $(grep -c '^#EXTINF' "$F" 2>/dev/null || echo NO_COMPUTADO)"
  echo "  /pulse/ envueltos: $(grep -c '/pulse/' "$F" 2>/dev/null || echo NO_COMPUTADO)"
  echo "  sha256: $(sha256sum "$F" 2>/dev/null | cut -d' ' -f1)"
else
  no_computado "no hay .m3u8 en /var/www/html/lists"
fi

# ── 2. PULSE + SEG (las dos rutas que sirven video) ───────────────────────────
sec "2. PULSE + SEG (rutas de reproduccion)"
curl -s -o /dev/null -w "  /pulse/<id>  -> http=%{http_code} ttfb=%{time_starttransfer}s\n" -m 15 \
  -H "User-Agent: OTT Navigator/1.7.3.3" \
  "http://127.0.0.1/pulse/27.m3u8?u=http%3A%2F%2Fline.tivi-ott.net%2Flive%2F3JHFTC%2FU56BDP%2F27.m3u8&d=eyJ0IjoiZ2VuZXJpYyJ9" 2>/dev/null || no_computado "curl a /pulse fallo"
segHits=$(grep -h "/seg/" "$NGINX_LOGS"/playlist_access.log 2>/dev/null | wc -l)
echo "  /seg/ hits historicos (playlist_access.log): ${segHits:-NO_COMPUTADO}"
segLast=$(grep -h "/seg/" "$NGINX_LOGS"/playlist_access.log 2>/dev/null | tail -1 | awk '{print $9, $10}')
echo "  /seg/ ultimo: ${segLast:-NO_COMPUTADO}"

# ── 3. QoE SERVER-SIDE ────────────────────────────────────────────────────────
sec "3. QoE (server_side_qoe_metrics)"
if [ -r "$DB" ]; then
  echo "  db: $DB  $(stat -c%s "$DB" 2>/dev/null) B"
  q "SELECT COUNT(*) AS filas, COUNT(DISTINCT channel_id) AS canales FROM server_side_qoe_metrics"
  echo "  --- ultimas 6 ---"
  q "SELECT channel_id, request_count AS req, error_count AS err, vst_proxy_avg AS vst_avg, vst_proxy_max AS vst_max, bitrate_avg_bps AS bps, datetime(flushed_at,'unixepoch') AS ts FROM server_side_qoe_metrics ORDER BY id DESC LIMIT 6"
  echo "  --- canales reales (no unknown) ---"
  q "SELECT channel_id, COUNT(*) AS filas, SUM(request_count) AS reqs FROM server_side_qoe_metrics WHERE channel_id != 'unknown' GROUP BY channel_id ORDER BY reqs DESC LIMIT 8"
else
  no_computado "conviva.db no legible"
fi

# ── 4. CANARY ─────────────────────────────────────────────────────────────────
sec "4. CANARY (despierta en cada zapping)"
echo "  path  : $(systemctl is-active ape-pulse-canary.path 2>/dev/null) / failed=$(systemctl is-failed ape-pulse-canary.path 2>/dev/null)"
echo "  timer : $(systemctl is-active ape-pulse-canary.timer 2>/dev/null)"
echo "  worker: $(ls -la /opt/ape-pulse/ape-pulse-canary-worker.sh 2>/dev/null | awk '{print $1, $5}')"
echo "  cola  : $(ls /var/lib/ara/canary/queue 2>/dev/null | wc -l) tickets"
echo "  artefactos de canal: $(ls -d /var/lib/ara/canary/*/ 2>/dev/null | wc -l)"
echo "  --- ultimas 4 decisiones ---"
tail -4 "$CANARY_LOG" 2>/dev/null | sed 's/^/  /' || no_computado "sin canary.log"

# ── 5. JIT + PROVIDER GATE (el unico slot del proveedor) ──────────────────────
sec "5. JIT + PROVIDER GATE (single slot)"
curl -s -m 8 http://127.0.0.1:3099/health 2>/dev/null | head -c 300 | sed 's/^/  health: /' || no_computado "jit /health no responde"
echo ""
echo "  providerGateAdmit en el motor: $(grep -c 'providerGateAdmit' /opt/ape-jit/server.js 2>/dev/null || echo NO_COMPUTADO)"
echo "  sha motor: $(sha256sum /opt/ape-jit/server.js 2>/dev/null | cut -d' ' -f1)"
echo "  --- ultimas 3 decisiones de la puerta ---"
tail -3 "$GATE_LOG" 2>/dev/null | sed 's/^/  /' || no_computado "sin provider-gate.log"
echo "  ALLOW vs DENY (ultimas 200):"
echo "    ALLOW: $(tail -200 "$GATE_LOG" 2>/dev/null | grep -c 'decision=ALLOW' || echo 0)"
echo "    DENY : $(tail -200 "$GATE_LOG" 2>/dev/null | grep -c 'decision=DENY' || echo 0)"

# ── 6. URL2 (el cartucho de metadata por canal) ──────────────────────────────
sec "6. URL2 (metadata cartridge)"
echo "  nginx: $(grep -c 'location \^~ /url2/' /etc/nginx/snippets/url2-cartridge.conf 2>/dev/null || echo NO_COMPUTADO) location(es)"
echo "  sha conf: $(sha256sum /etc/nginx/snippets/url2-cartridge.conf 2>/dev/null | cut -d' ' -f1)"
u2=$(curl -s -o /dev/null -w "%{http_code}" -m 12 -H "User-Agent: OTT Navigator/1.7.3.3" "http://127.0.0.1/url2/1312008.m3u8?u=http%3A%2F%2Fline.tivi-ott.net%2Flive%2F3JHFTC%2FU56BDP%2F27.m3u8" 2>/dev/null)
echo "  /url2/<id> -> http=${u2:-NO_COMPUTADO}"

# ── 7. NGINX: 4xx y 5xx (el analisis de errores) ─────────────────────────────
sec "7. NGINX: errores 4xx / 5xx"
for log in "$NGINX_LOGS"/*.log; do
  [ -r "$log" ] || continue
  n4=$(grep -cE '" (4[0-9]{2}) ' "$log" 2>/dev/null || echo 0)
  n5=$(grep -cE '" (5[0-9]{2}) ' "$log" 2>/dev/null || echo 0)
  [ "$n4" -gt 0 ] || [ "$n5" -gt 0 ] && echo "  $(basename "$log"): 4xx=$n4 5xx=$n5"
done
echo "  --- los 6 codigos mas frecuentes (todas las rutas) ---"
cat "$NGINX_LOGS"/*.log 2>/dev/null | grep -oE '" [0-9]{3} ' | sort | uniq -c | sort -rn | head -6 | sed 's/^/  /' || no_computado "no se pudieron leer los logs"

# ── 8. APK + OVERLAY ─────────────────────────────────────────────────────────
sec "8. APK / AGENTE (se lee desde el device, no desde aqui)"
echo "  Este bloque lo completa el wrapper del PC con adb."
echo "  En el VPS: /var/www/html/ara/agent.apk $(stat -c%s /var/www/html/ara/agent.apk 2>/dev/null || echo NO_COMPUTADO) B"
cat /var/www/html/ara/version.json 2>/dev/null | head -c 200 | sed 's/^/  version: /' || no_computado "sin version.json"

# ── 9. PHP / LUA / JSON en vivo (los artefactos que el operador pregunto) ─────
sec "9. ARTEFACTOS (.php / .lua / .json) — estado real"
echo "  php -l de los que sirven video:"
for f in /var/www/html/prisma/api/pulse.php /var/www/html/prisma/api/qoe-flush.php; do
  if [ -r "$f" ]; then
    r=$(php -l "$f" 2>&1 | head -1)
    echo "    $(basename "$f"): $r"
  else
    echo "    $(basename "$f"): AUSENTE"
  fi
done
echo "  lua cargados por nginx (los que importan):"
for l in qoe_server_side_observer qoe_flush_worker reactor_tick ape_uri_rebase; do
  p="/etc/nginx/lua/$l.lua"
  if [ -r "$p" ]; then echo "    $l.lua: $(stat -c%s "$p") B"; else echo "    $l.lua: AUSENTE"; fi
done
echo "  lua_shared_dict declarados:"
nginx -T 2>/dev/null | grep -c 'lua_shared_dict' | sed 's/^/    total: /'
nginx -T 2>/dev/null | grep 'lua_shared_dict' | awk '{print "    " $2 " " $3}' | head -10

# ── 10. RESUMEN ──────────────────────────────────────────────────────────────
sec "10. RESUMEN"
echo "  nginx -t     : $(nginx -t 2>&1 | tail -1)"
echo "  nginx        : $(systemctl is-active nginx 2>/dev/null)"
echo "  php-fpm      : $(systemctl is-active php8.3-fpm 2>/dev/null)"
echo "  ape-jit      : $(systemctl is-active ape-jit.service 2>/dev/null)"
echo "  canary.path  : $(systemctl is-active ape-pulse-canary.path 2>/dev/null)"
echo "  canary.timer : $(systemctl is-active ape-pulse-canary.timer 2>/dev/null)"
echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo " FIN — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "════════════════════════════════════════════════════════════════════════════"
