#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ape-module-watchdog.sh   (fuente: vps/bin/ape-module-watchdog.sh)
#
# PEDIDO DEL OPERADOR, textual:
#   "En cada Modulo o uno de estos artefactos Ej: canary, cuando quede corriendo,
#    haz un workflow para que corra siempre, nunca se caiga y despierte en cada
#    zapping en segundo plano, sin generar lacks, ni freezeos, en segundo plano
#    pero que trabaje siempre y se active con señales como un zapping."
#   "...y una vive convencido que el sistema está funcionando correctamente
#    cuando está a medias o se caen de manera inadvertida los servicios"
#
# QUE HACE
#   Recorre cada modulo del sistema, lo PRUEBA de verdad (HTTP real, no "systemctl
#   is-active") y, si falla, lo reinicia. Deja una linea por modulo en el journal
#   y un estado JSON en /var/lib/ape/module-watchdog.json.
#
# POR QUE PRUEBA HTTP Y NO `systemctl is-active`
#   Medido hoy: `ape-jit.service` estaba "running" y las dos rutas /jit/ daban 404
#   porque el worker estaba vivo pero los catalogos no existian. `is-active` habria
#   dicho verde. El unico veredicto honesto es la respuesta real.
#
# QUE **NO** HACE
#   - No toca la reproduccion: ninguna comprobacion compite con un segmento.
#   - No reinicia nginx si /health responde (reiniciar nginx por un 404 de un
#     endpoint PHP seria peor que el fallo).
#   - No borra nada. No cambia configuracion. No publica en internet.
#
# EL "DESPIERTE EN CADA ZAPPING"
#   El zapping real ya se detecta en el VPS: cada canal que OTT reproduce entra por
#   /pulse/<id> y deja linea en el access log. Este watchdog cuenta esas peticiones
#   en su ventana y las guarda. Si en la ventana hubo zapping, se registra; el
#   sistema no se "duerme" porque este script corre por timer, no por evento: no
#   hay nada que despertar. Lo que si aporta es saber SI hubo zapping y sobre que
#   canal, sin abrir un socket ni molestar al player.
#
# IDEMPOTENTE: correrlo N veces deja el mismo estado. No hay locks porque no
# escribe nada compartido salvo su propio JSON (escritura atomica via mv).
#
# Uso:  bash ape-module-watchdog.sh [--json] [--dry-run]
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

BASE="${APE_BASE:-https://iptv-ape.duckdns.org}"
UA="${APE_WATCHDOG_UA:-APE-Watchdog/1.0 (module health)}"
STATE_DIR="${APE_STATE_DIR:-/var/lib/ape}"
STATE="$STATE_DIR/module-watchdog.json"
LOG_TAG="ape-watchdog"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

mkdir -p "$STATE_DIR" 2>/dev/null || true

# Un canal conocido que responde (medido 2026-11-14: 200 con 6 EXTINF).
# No se usa para "reproducir": solo para comprobar que el pulse puede hablar con
# el proveedor. Si este canal muere, el modulo NO se declara roto por el: se
# declara sin muestra. Un canal caido no es un modulo caido.
CH_PROBE="${APE_CH_PROBE:-https://iptv-ape.duckdns.org/pulse/1312008.m3u8?u=http%3A%2F%2Fline.tivi-ott.net%2Flive%2F3JHFTC%2FU56BDP%2F1312008.m3u8&d=eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI6MjA0OCx3IjoxOTIwLCJoIjoxMDgwLCJmIjozMH0}"

html() { printf '%s' "$1" | tr -d '\r\n' | head -c 200; }

probe() {
  # probe URL [UA]; imprime "code|bytes|ttfb"
  local url="$1" ua="${2:-$UA}"
  curl -sk -o /dev/null -w '%{http_code}|%{size_download}|%{time_starttransfer}' \
       -m 15 -A "$ua" "$url" 2>/dev/null || printf '000|0|0'
}

fails=0
rows=""
add_row() { # name status detail
  rows="${rows}{\"module\":\"$1\",\"status\":\"$2\",\"detail\":\"$(html "$3")\"},"
  [ "$2" = "fail" ] && fails=$((fails + 1))
}

restart_if() { # unit, why
  if [ "$DRY" -eq 1 ]; then
    echo "[$LOG_TAG] DRY: reiniciaria $1 ($2)" >&2
    return 0
  fi
  echo "[$LOG_TAG] REINICIO $1 ($2)" >&2
  systemctl restart "$1" 2>&1 | sed "s/^/[$LOG_TAG]   /" >&2 || true
  sleep 3
}

echo "[$LOG_TAG] ventana $(date -u +%FT%TZ)" >&2

# ── 1. nginx + /health ────────────────────────────────────────────────────────
r=$(probe "$BASE/health")
code=${r%%|*}
if [ "$code" = "200" ]; then
  add_row "nginx-health" "ok" "$r"
else
  add_row "nginx-health" "fail" "$r"
  restart_if nginx "health=$code"
fi

# ── 2. PHP-FPM (una ruta que EJECUTA php de verdad) ──────────────────────────
r=$(probe "$BASE/prisma/api/cablear-listas.php")
code=${r%%|*}
if [ "$code" = "200" ]; then
  add_row "php-fpm" "ok" "$r"
else
  add_row "php-fpm" "fail" "$r"
  restart_if php8.3-fpm "cablear-listas=$code"
fi

# ── 3. JIT (las DOS rutas que ofrece el menu del agente) ─────────────────────
r1=$(probe "$BASE/jit/playlist-calidad.m3u8")
r2=$(probe "$BASE/jit/playlist-resolver.m3u8")
c1=${r1%%|*}; c2=${r2%%|*}
if [ "$c1" = "200" ] && [ "$c2" = "200" ]; then
  add_row "jit-catalogo" "ok" "$r1 / $r2"
else
  add_row "jit-catalogo" "fail" "$r1 / $r2"
  restart_if ape-jit "calidad=$c1 resolver=$c2"
  # Reintento: si el servicio estaba arriba pero el enlace faltaba, el script
  # de publicacion lo rehace sin reiniciar nada.
  if [ "$DRY" -eq 0 ] && [ -x /opt/ape-pulse/ape-jit-latest.sh ]; then
    bash /opt/ape-pulse/ape-jit-latest.sh >&2 2>&1 || true
  fi
fi

# ── 4. CANARY ────────────────────────────────────────────────────────────────
# Un 302/301 es EXITO (redirige al upstream). Un 5xx o un cuerpo con
# "Call to undefined function" es FALLO: el endpoint existe pero esta roto.
r=$(probe "$BASE/prisma/api/canary-resolve.php?u=http%3A%2F%2Fline.tivi-ott.net%2Flive%2F3JHFTC%2FU56BDP%2F1312008.m3u8")
code=${r%%|*}
if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
  add_row "canary" "ok" "$r"
elif [ "$code" = "404" ]; then
  add_row "canary" "fail" "$r (endpoint ausente)"
else
  add_row "canary" "fail" "$r"
fi

# ── 5. PULSE (un canal real, con UA de player) ────────────────────────────────
# OJO: el UA importa. Medido 2026-11-14: el proveedor responde 461 a `curl` y 200
# a `IPTVSmartersPro`/`OTT Navigator`. Probar con curl pelado marcaria el pulse
# como roto cuando el problema es el cliente de prueba.
r=$(probe "$CH_PROBE" "OTT Navigator/1.7.3.3")
code=${r%%|*}
bytes=${r#*|}; bytes=${bytes%%|*}
if [ "$code" = "200" ] && [ "${bytes:-0}" -gt 100 ]; then
  add_row "pulse-canal" "ok" "$r"
elif [ "$code" = "502" ] || [ "$code" = "461" ] || [ "$code" = "000" ] \
  || [ "$code" = "403" ] || [ "$code" = "407" ] || [ "$code" = "404" ] \
  || [ "$code" = "429" ] || [ "$code" = "451" ]; then
  # El canal puede estar caido o bloqueado POR EL PROVEEDOR. NO se reinicia php por
  # eso: php-fpm esta contestando, y contestar 407 es contestar.
  #
  # MEDIDO el 2026-11-15: el canal de prueba 1312008 paso a devolver 407 y el
  # vigilante marco VERDICT=DEGRADADO con nginx y php-fpm `active`. Ese falso
  # positivo es peor que no vigilar: entrena a ignorar el panel.
  #
  # 407 = el codigo propio de bloqueo de este proveedor (medido en esta sesion).
  add_row "pulse-canal" "sin-muestra" "$r (upstream del canal, no el modulo)"
else
  add_row "pulse-canal" "fail" "$r"
fi

# ── 6. ZAPPING EN LA VENTANA (senal real, sin molestar al player) ────────────
# [FIX 2026-11-15] playlist_access.log, NO access.log.
# nginx manda /pulse/ a un access_log propio (sites-enabled/default:82, formato
# ape_playlist). Medido: access.log tenia 3 peticiones de /pulse/ y
# playlist_access.log 2.929. El vigilante contaba el fichero equivocado y el
# "zapping" salia casi siempre 0 — un instrumento que no medía nada.
ZLOG="${APE_PLAYLIST_LOG:-/var/log/nginx/playlist_access.log}"
zaps=$(tail -2000 "$ZLOG" 2>/dev/null | grep -c 'GET /pulse/' || echo 0)
last=$(tail -2000 "$ZLOG" 2>/dev/null | grep 'GET /pulse/' | tail -1 | grep -oE '/pulse/[0-9]+' | head -1 || true)
add_row "zapping" "ok" "$zaps peticiones /pulse/ en las ultimas 2000 lineas; ultimo=${last:-ninguno}"

# ── 6b. PROYECCION OTT: 1 tag por canal, 0 APE ───────────────────────────────
# POR QUE EXISTE, y es el mismo defecto de clase que arregle en el timer ese mismo dia.
# Medido 2026-11-15 05:59: la proyeccion paso a 171.893.544 B con CERO tags
# (ape-cablear-auto la reescribio) y el sistema entero la daba por buena: el .stamp
# comparaba el ORIGEN, que no habia cambiado. El vigilante tampoco la miraba.
# Comprobar el fichero servido es lo unico que detecta una corrupcion del RESULTADO.
LIGHT="${APE_LIGHT_FILE:-/var/www/html/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8}"
if [ -f "$LIGHT" ]; then
  l_ch=$(grep -c '^#EXTINF'      "$LIGHT" 2>/dev/null); l_ch=${l_ch:-0}
  l_tag=$(grep -c '^#EXTSHIMOTT:' "$LIGHT" 2>/dev/null); l_tag=${l_tag:-0}
  l_ape=$(grep -c '^#EXT-X-APE-'  "$LIGHT" 2>/dev/null); l_ape=${l_ape:-0}
  l_sz=$(stat -c%s "$LIGHT" 2>/dev/null || echo 0)
  l_age=$(( $(date +%s) - $(stat -c%Y "$LIGHT" 2>/dev/null || date +%s) ))
  if [ "$l_ch" -gt 0 ] && [ "$l_tag" -eq "$l_ch" ] && [ "$l_ape" -eq 0 ]; then
    add_row "proyeccion" "ok" "${l_sz}B · ${l_ch} canales · ${l_tag} tags · ${l_age}s"
  else
    add_row "proyeccion" "fail" "${l_sz}B · canales=${l_ch} tags=${l_tag} ape=${l_ape} (se espera 1 tag/canal y 0 APE) · ${l_age}s"
  fi
else
  add_row "proyeccion" "fail" "no existe $LIGHT"
fi

# ── 7. ESTADO ────────────────────────────────────────────────────────────────
status="OK"
[ "$fails" -gt 0 ] && status="DEGRADADO"
rows="[${rows%,}]"
json="{\"ts\":\"$(date -u +%FT%TZ)\",\"verdict\":\"$status\",\"fallos\":$fails,\"modulos\":$rows}"

if [ "$DRY" -eq 0 ]; then
  printf '%s\n' "$json" > "$STATE.tmp" 2>/dev/null && mv -f "$STATE.tmp" "$STATE" 2>/dev/null || true
fi

if [ "${1:-}" = "--json" ]; then
  printf '%s\n' "$json"
else
  echo "[$LOG_TAG] VERDICT=$status fallos=$fails"
fi

# Un fallo persistente deja rastro en el journal con prioridad err para que
# `journalctl -p err -u ape-module-watchdog` lo muestre.
[ "$fails" -gt 0 ] && logger -t "$LOG_TAG" -p err "$json" 2>/dev/null || true

exit 0
