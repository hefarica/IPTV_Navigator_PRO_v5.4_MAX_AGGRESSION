#!/usr/bin/env bash
# jit_ott_ready.sh — ¿está TODO listo para dar de alta el catálogo en OTT?
#
# Un comando, un veredicto. Comprueba lo que de verdad hace falta y NO da nada
# por supuesto: cada línea trae el dato medido. Si algo no se puede medir, lo dice
# como NO COMPUTADO en vez de asumirlo bueno.
#
# Uso:  bash jit_ott_ready.sh

set -uo pipefail

JIT=http://127.0.0.1:3099
PUB=https://iptv-ape.duckdns.org
CATALOGO="$PUB/jit/playlist-resolver.m3u8"
RESOLVER="$PUB/jit/resolve"

fallos=0
avisos=0
ok()  { printf '  OK     %s\n' "$1"; }
mal() { printf '  FALLO  %s\n' "$1"; fallos=$((fallos+1)); }
avi() { printf '  AVISO  %s\n' "$1"; avisos=$((avisos+1)); }

echo "══════════════════════════════════════════════════════════════"
echo " LISTO PARA OTT — comprobacion medida  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "══════════════════════════════════════════════════════════════"
echo

echo "── SERVICIOS ──"
for u in ape-jit nginx; do
  st=$(systemctl is-active "$u" 2>/dev/null)
  if [ "$st" = "active" ]; then ok "$u: active"; else mal "$u: $st"; fi
done
if ss -ltn 2>/dev/null | grep -q ':3099'; then ok "puerto 3099 escuchando"; else mal "puerto 3099 NO escucha"; fi
if curl -s -o /dev/null -w '%{http_code}' --max-time 6 "$JIT/image/config" | grep -q 200; then
  ok "HTTP del motor responde 200"; else mal "HTTP del motor no responde"; fi
echo

echo "── CATALOGO (el que se da de alta en OTT) ──"
echo "     URL: $CATALOGO"
code=$(curl -s -o /tmp/rd_cat.m3u8 -w '%{http_code}' --max-time 120 "$CATALOGO")
sz=$(wc -c < /tmp/rd_cat.m3u8 2>/dev/null || echo 0)
ncan=$(grep -c '^#EXTINF' /tmp/rd_cat.m3u8 2>/dev/null || echo 0)
natt=$(grep -c '^#EXTATTRFROMURL' /tmp/rd_cat.m3u8 2>/dev/null || echo 0)
if [ "$code" = "200" ] && [ "$ncan" -gt 0 ]; then
  ok "HTTP $code  $sz B  $ncan canales  $natt directivas"
else
  mal "catalogo HTTP $code con $ncan canales"
fi
max=$((150*1024*1024))
if [ "$sz" -le "$max" ]; then ok "tamano $sz B <= limite OTT $max B"; else mal "tamano $sz B EXCEDE el limite OTT"; fi
first=$(head -1 /tmp/rd_cat.m3u8 2>/dev/null | tr -d '\r')
if [ "$first" = "#EXTM3U" ]; then ok "primera linea #EXTM3U"; else mal "primera linea no es #EXTM3U"; fi
if [ "$natt" -eq "$ncan" ] && [ "$ncan" -gt 0 ]; then
  ok "#EXTATTRFROMURL en todos ($natt/$ncan)"; else avi "#EXTATTRFROMURL en $natt de $ncan"; fi
echo

echo "── RESOLVER (lo que consulta OTT al abrir el canal) ──"
for ua in "OTT Navigator/1.7.0.0 ExoPlayer" "VLC/3.0.19 LibVLC/3.0.19"; do
  cuerpo=$(curl -s -A "$ua" --max-time 30 "$RESOLVER?channel=1" 2>/dev/null)
  url=$(printf '%s\n' "$cuerpo" | grep -v '^#' | grep -v '^$' | head -1)
  if printf '%s' "$cuerpo" | grep -q '#EXTM3U' && [ -n "$url" ]; then
    tipo="media"; case "$url" in *master*) tipo="master";; esac
    if printf '%s' "$ua" | grep -qE 'VLC|Kodi'; then
      [ "$tipo" = "master" ] && ok "${ua%% *}: entrega $tipo (correcto)" || avi "${ua%% *}: entrega $tipo (esperaba master)"
    else
      [ "$tipo" = "media" ] && ok "${ua%% *}: entrega $tipo (correcto)" || avi "${ua%% *}: entrega $tipo (esperaba media)"
    fi
  else
    mal "resolver no devolvio entrada M3U con URL para ${ua%% *}"
  fi
done
echo

echo "── JIT: puede producir? ──"
segs=$(curl -sL --max-time 60 "$JIT/live/1/media_0.m3u8" 2>/dev/null | grep -vc '^#')
if [ "$segs" -gt 0 ]; then ok "canal 1 produce ($segs segmentos)"; else avi "canal 1 sin segmentos ahora (arranque en frio o fuente caida)"; fi
if pgrep -f ffmpeg > /dev/null; then ok "ffmpeg vivo: $(pgrep -f ffmpeg | head -1)"; else avi "sin ffmpeg: el JIT arrancara al primer pedido"; fi
echo

echo "── DESPERTAR EN EL ZAP (/pulse -> JIT) ──"
if [ -f /etc/ara/pulse/jit.enabled ]; then
  avi "ENCENDIDO: cada zap manda el canal al JIT (single-slot: un zap corta el anterior)"
else
  ok "APAGADO: /pulse sirve el proveedor (zapping sin interrupcion)"
fi
echo

echo "── RECIBO (lo que se puede auditar despues) ──"
# El status aparece DESPUES de ffmpeg/live/video_measured en el JSON: truncar a
# 200 caracteres lo cortaba y decia "no interpretable". Se extrae el campo.
rr=$(curl -s --max-time 60 "$JIT/image/receipt?channel=1" 2>/dev/null | grep -o '"status": *"[A-Z_]*"' | head -1)
case "$rr" in
  *MATCH*)        ok "recibo: MATCH (los bytes coinciden con lo declarado)";;
  *MISMATCH*)     mal "recibo: MISMATCH — revisar color/resolucion declarados vs medidos";;
  *NO_COMPUTADO*) avi "recibo: NO_COMPUTADO (no habia produccion al medir)";;
  *)              avi "recibo sin status legible (endpoint $JIT/image/receipt)";;
esac
echo

echo "══════════════════════════════════════════════════════════════"
if [ "$fallos" -eq 0 ]; then
  printf ' VEREDICTO: LISTO — 0 fallos, %d aviso(s)\n' "$avisos"
  echo
  echo " PEGUE ESTA URL EN OTT NAVIGATOR:"
  echo "   Ajustes -> Proveedor -> Anadir proveedor -> Lista de reproduccion"
  echo "   $CATALOGO"
else
  printf ' VEREDICTO: %d FALLO(S), %d aviso(s) — NO dar de alta aun\n' "$fallos" "$avisos"
fi
echo "══════════════════════════════════════════════════════════════"
exit $([ "$fallos" -eq 0 ] && echo 0 || echo 1)
