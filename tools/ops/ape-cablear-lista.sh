#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# tools/ops/ape-cablear-lista.sh
#
# CABLEA una lista M3U8 generada para que TODOS sus canales pasen por el sistema:
#   http://proveedor/live/USER/PASS/<id>.m3u8
#   ->
#   https://iptv-ape.duckdns.org/pulse/<id>.m3u8?u=<b64url>&d=<device-b64>
#
# PEDIDO TEXTUAL DEL OPERADOR:
#   "https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046.m3u8 ESTA ES LA
#    MALDITA URL QUE DEBES VER COMO HACES PARA QUE SEA CABLEADA POR TODO EL
#    SISTEMA Y LUEGO DESARROLLAR UNA RUTA IDEMPOTENTE, POLIMORFICA, ISOMORFICA
#    PARA QUE SE PUEDA REPRODUCIR TODAS LAS LISTAS QUE GENERE EL IPTV NAVIGATOR"
#
# ESTADO MEDIDO ANTES DE ESCRIBIR ESTO (2026-11-14):
#   La lista de 21.224 canales servida en /lists/ tiene:
#     /pulse/: 0    /url2/: 0
#     URLs de canal: evestv.wuitf.com (756) · line.tivi-ott.net (60) en 50 MB
#   Es decir: NINGUN componente del ecosistema construia una URL hacia /pulse/.
#   El endpoint funcionaba (200, video real) pero nadie lo llamaba. El
#   reproductor iba DIRECTO al proveedor, sin pasar por el VPS, y por eso el
#   QoE solo registraba los canales que yo provoque a mano con curl.
#
# QUE HACE ESTE SCRIPT
#   Lee un .m3u8 (o su .gz), y por cada bloque #EXTINF + URL:
#     - deja intactas TODAS las lineas de metadata (#EXTINF, #EXTVLCOPT,
#       #KODIPROP, #EXTHTTP, #EXTGRP, cabeceras APE...). Nada se pierde.
#     - envuelve SOLO la linea de URL del canal.
#   Escribe un .m3u8 nuevo y su .gz.
#
# QUE NO HACE
#   - No toca la lista original.
#   - No toca el VPS ni nginx.
#   - No publica nada: deja el fichero listo para que el operador decida.
#
# IDEMPOTENTE: si una URL ya empieza por /pulse/ o https://iptv-ape..., se deja
# tal cual. Se puede correr dos veces sin doble envoltura.
#
# USO
#   bash tools/ops/ape-cablear-lista.sh <lista.m3u8|lista.m3u8.gz> <salida.m3u8>
#   APE_PULSE_BASE=https://iptv-ape.duckdns.org bash ...   (otro host)
#   APE_DEVICE_B64=... bash ...                            (otro fingerprint)
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

IN="${1:?falta la lista de entrada}"
OUT="${2:?falta la ruta de salida}"
BASE="${APE_PULSE_BASE:-https://iptv-ape.duckdns.org}"
# Fingerprint generico por defecto: tipo generico, 1080p, 2048x1920, 30 fps.
# Es el mismo que usa el VPS en sus ejemplos; el player real manda el suyo por
# el parametro d= si el generador lo conoce.
DEVICE="${APE_DEVICE_B64:-eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI6MjA0OCwidyI6MTkyMCwiaCI6MTA4MCwiZiI6MzB9}"

[ -r "$IN" ] || { echo "ERROR: no puedo leer $IN" >&2; exit 2; }

# Descompresor segun extension.
READ="cat"
case "$IN" in
  *.gz) READ="zcat" ;;
esac

TMP="${OUT}.tmp.$$"
trap 'rm -f "$TMP"' EXIT

canales=0
envueltos=0
ya_envueltos=0
sin_id=0

# Extrae el id del canal de una URL de proveedor.
# Patrones reales medidos en la lista del operador:
#   http://evestv.wuitf.com/live/2RHAVYWB/SDXH4MYV/191.m3u8       -> 191
#   http://line.tivi-ott.net/live/3JHFTC/U56BDP/1312008.m3u8      -> 1312008
#   http://host:port/series/USER/PASS/12345.mp4                   -> 12345
# Cae a cualquier numero final si los patrones no casan.
#
# ENVOLTURA: /pulse/<id>.m3u8?u=<base64url de la URL completa>&d=<device>
# base64url = base64 estandar con + -> - , / -> _ , sin relleno '='.
wrap() {
  local raw="$1"

  # [FIX 2026-11-14] EL PIPE `|`. Las URLs de la lista real del operador llevan
  # los headers pegados detras del caracter `|`:
  #   http://evestv.wuitf.com/live/USER/PASS/1.m3u8|User-Agent=TiviMate/4.7.0&Referer=...
  # Medido: 80 de 80 URLs lo llevan. Si se codifica la linea ENTERA en base64,
  # pulse.php decodifica "...&Referer=..." como parte de la URL, no encuentra un
  # token valido y responde 400 (27 bytes: "token invalido"). Comprobado a mano
  # contra el VPS. Por eso se corta en el PRIMER `|` y solo se codifica la URL.
  #
  # Los headers NO se pierden: cada canal lleva su bloque #EXTHTTP con los mismos
  # valores (medido: 81 #EXTHTTP para 80 URLs) y pulse.php los reenvia al
  # proveedor. El pipe era un duplicado para reproductores que no leen #EXTHTTP.
  local url="${raw%%|*}"

  # Idempotencia: si ya esta cableada, no se vuelve a envolver.
  case "$url" in
    "$BASE"/*|*/pulse/*) echo "$raw"; return 1 ;;
  esac
  local id
  id=$(printf '%s' "$url" | sed -nE 's#^.*/live/[^/]+/[^/]+/([0-9]+)\.(m3u8|ts|mp4).*$#\1#p' | head -1)
  [ -n "$id" ] || id=$(printf '%s' "$url" | sed -nE 's#^.*/([0-9]+)\.(m3u8|ts|mp4)$#\1#p' | head -1)
  if [ -z "$id" ]; then
    echo "$raw"
    return 2
  fi
  # [FIX 2026-11-14] ENCODING DE `u=`. NO es base64.
  #
  # Medido contra el VPS, las cuatro variantes sobre la misma URL:
  #   A) base64url (con - _ sin padding)  -> HTTP 400
  #   B) base64 estandar (con + / =)      -> HTTP 400
  #   C) URL urlencoded (%3A %2F)         -> HTTP 200  <-- la correcta
  #   D) la forma que usa el player real  -> HTTP 200
  #
  # El motivo esta en pulse.php:214:
  #   if (!preg_match('#^https?://#i', $u)) { pulse_fail(400, 'u no es http(s)'); }
  # `u` tiene que empezar literalmente por http:// o https://. El base64_decode
  # de la linea 59 es para el TOKEN DE SESION, no para este parametro: por eso
  # codificar en base64 devuelve "u no es http(s)" y no "token invalido".
  #
  # Se usa `php -r rawurlencode` que ya esta en el VPS (los .php son el propio
  # servicio) en vez de inventar un percent-encoding a mano con sed: rawurlencode
  # escapa TODO lo que no sea [A-Za-z0-9-_.~], que es exactamente lo que necesita
  # un query string, incluidos & = ? # y los espacios.
  local u_enc
  u_enc=$(php -r 'echo rawurlencode($argv[1]);' "$url" 2>/dev/null)
  if [ -z "$u_enc" ]; then
    # Sin php se cae a un sed minimo: los caracteres que de verdad aparecen en
    # estas URLs. No es completo, pero no deja el fichero roto.
    u_enc=$(printf '%s' "$url" | sed 's/:/%3A/g; s#/#%2F#g; s/?/%3F/g; s/&/%26/g; s/=/%3D/g; s/#/%23/g')
  fi
  printf '%s/pulse/%s.m3u8?u=%s&d=%s\n' "$BASE" "$id" "$u_enc" "$DEVICE"
  return 0
}

{
  while IFS= read -r line || [ -n "$line" ]; do
    # Cabeceras, comentarios, tags y metadata: se copian VERBATIM.
    case "$line" in
      \#*|"" )
        printf '%s\n' "$line"
        continue
        ;;
    esac
    # url-tvg="..." suelta en cabecera: no es una URL de canal.
    case "$line" in
      url-tvg*|x-tvg*)
        printf '%s\n' "$line"
        continue
        ;;
    esac
    # A partir de aqui es una linea de URL de canal.
    case "$line" in
      http://*|https://*)
        canales=$((canales+1))
        newurl=$(wrap "$line"); rc=$?
        case $rc in
          0) envueltos=$((envueltos+1)) ;;
          1) ya_envueltos=$((ya_envueltos+1)) ;;
          *) sin_id=$((sin_id+1)) ;;
        esac
        printf '%s\n' "$newurl"
        ;;
      *)
        # Cualquier otra cosa (linea de continuacion rara): verbatim.
        printf '%s\n' "$line"
        ;;
    esac
  done < <($READ "$IN")
} > "$TMP"

mv "$TMP" "$OUT"
trap - EXIT

gzip -9 -c "$OUT" > "${OUT}.gz"

echo "CABLEADO"
echo "  entrada   : $IN"
echo "  salida    : $OUT  ($(stat -c%s "$OUT" 2>/dev/null) B)"
echo "  salida.gz : ${OUT}.gz  ($(stat -c%s "${OUT}.gz" 2>/dev/null) B)"
echo "  base      : $BASE"
echo "  canales   : $canales"
echo "  envueltos : $envueltos"
echo "  ya estaban: $ya_envueltos"
echo "  sin id    : $sin_id"
echo "  sha256    : $(sha256sum "$OUT" 2>/dev/null | cut -d' ' -f1)"
