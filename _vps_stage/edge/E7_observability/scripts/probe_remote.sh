#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E7 · PROBE REMOTO — mide el baseline de la decisión SIN desplegar nada
# ═══════════════════════════════════════════════════════════════════════════
# Se ejecuta EN el VPS (lo alimenta tools/e7_obs.mjs por stdin). Entradas por env:
#   LIST  lista viva (gz) para descubrir canales /cdn/
#   BASE  127.0.0.1:8088
#   IDS   ids de canal separados por espacio (p.ej. "3 5 6")
#   N     muestras por canal de la ruta del gateway
#   S     muestras por canal del split primer/último hop
#
# Publica SOLO hosts, estados, tiempos y el nombre del error. La URL con
# credenciales se descubre aquí y NUNCA se imprime: ni la URL del proveedor, ni
# el `redirect_url` (lleva token), ni el cuerpo del error (lleva "path").
# Todos los separadores son TAB: el parser del arnés corta por TAB.
#
# OJO (medido): cuando el gateway marca un host caído (`down:` 15 s), las
# peticiones siguientes fallan en ~0 ms SIN hablar con el proveedor (fast fail,
# `"error":"all_upstreams_failed"` + `"ms":0`, sin cabeceras X-APE-*). Muestrear
# en ráfaga dentro de esa ventana mide el circuito, no el proveedor: por eso aquí
# se detecta el fast fail, se espera a que expire (16 s) y se reintenta UNA vez,
# registrando cuántas veces pasó (`FF`).
# ═══════════════════════════════════════════════════════════════════════════
set -u
LIST="${LIST:-/var/www/html/lists/APE_LISTA_4K.m3u8.gz}"
BASE="${BASE:-127.0.0.1:8088}"
IDS="${IDS:-3 5 6}"
N="${N:-5}"
S="${S:-3}"

H=$(mktemp); B=$(mktemp); trap 'rm -f "$H" "$B"' EXIT
printf 'PROBE_BEGIN\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── clasifica un fallo sin imprimir el cuerpo (lleva credenciales en "path")
err_of() {   # $1 = fichero cuerpo → "error\tms"
  local e m
  e=$(sed -n 's/.*"error":"\([a-zA-Z_]*\)".*/\1/p' "$1" | head -1)
  m=$(sed -n 's/.*"ms":\([0-9][0-9]*\).*/\1/p' "$1" | head -1)
  printf '%s\t%s' "${e:-unknown}" "${m:-}"
}

for id in $IDS; do
  # canal de la lista viva: https://iptv-ape.duckdns.org/cdn/<host>/<ruta>/<id>.m3u8
  url=$(zcat "$LIST" 2>/dev/null | grep -m1 -E "^https://iptv-ape\.duckdns\.org/cdn/[^/]+/.*/${id}\.m3u8$")
  if [ -z "${url:-}" ]; then
    printf 'MISSING\t%s\n' "$id"
    continue
  fi
  phost=$(printf '%s' "$url" | sed -E 's#^https://[^/]+/cdn/([^/]+)/.*#\1#')
  # El gateway habla HTTP (proxy_pass http://$ape_host), no HTTPS: el split debe
  # medir el MISMO esquema o mide otra cosa (primer intento: code=000).
  pprov=$(printf '%s' "$url" | sed -E 's#^https://[^/]+/cdn/([^/]+)#http://\1#')
  printf 'CHANNEL\t%s\t%s\n' "$id" "$phost"

  # ── A · la ruta que ve el jugador (gateway 8088)
  i=0
  while [ "$i" -lt "$N" ]; do
    i=$((i+1))
    tries=0; ff=0; code=000; ttfb=0; size=0; err="-"; errms="-"
    while : ; do
      tries=$((tries+1))
      if meta=$(curl -sS -A "Mozilla/5.0" -D "$H" -o "$B" -m 30 -w '%{http_code}\t%{time_starttransfer}\t%{size_download}' "$url" 2>/dev/null); then
        code=$(printf '%s' "$meta" | cut -f1)
        ttfb=$(printf '%s' "$meta" | cut -f2)
        size=$(printf '%s' "$meta" | cut -f3)
      else
        code=000; ttfb=0; size=0
      fi
      hdr=$(tr -d '\r' < "$H")
      up=$(printf '%s\n'  "$hdr" | awk 'tolower($1)=="x-ape-upstream-ms:"{print $2; exit}')
      reb=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="x-ape-uri-rebased:"{print $2; exit}')
      uhd=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="x-ape-uhd:"{print $2; exit}')
      cdn=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="x-ape-cdn:"{print $2; exit}')
      org=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="x-ape-origin:"{print $2; exit}')
      if [ "${code:0:1}" != "2" ]; then
        read -r err errms <<<"$(err_of "$B" | tr '\t' ' ')"
        # fast fail del circuito down: (15 s) ⇒ no mide al proveedor
        if [ "$err" = "all_upstreams_failed" ] && [ "${errms:--1}" -lt 50 ] 2>/dev/null; then
          ff=$((ff+1))
          if [ "$tries" -le 2 ]; then sleep 16; continue; fi
        fi
      fi
      break
    done
    # invariante metadata-only: ¿queda alguna URI relativa en el cuerpo servido?
    tot=0; rel=0
    if [ "${code:0:1}" = "2" ]; then
      tot=$(awk 'BEGIN{n=0} !/^#/ && NF {n++} END{print n+0}' "$B")
      rel=$(awk 'BEGIN{n=0} !/^#/ && NF { if (substr($0,1,7) != "http://" && substr($0,1,8) != "https://" && substr($0,1,2) != "//") n++ } END{print n+0}' "$B")
    fi
    printf 'SAMPLE\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$id" "$i" "$code" "$ttfb" "$size" "${up:-}" "${reb:-}" "${uhd:-}" "${cdn:-}" "${org:-}" \
      "$tot" "$rel" "$err" "${errms:-}" "$ff"
    sleep 0.3
  done

  # ── B · split primer hop (proveedor) vs último hop (CDN del 302), S muestras
  i=0
  while [ "$i" -lt "$S" ]; do
    i=$((i+1))
    if r1=$(curl -sS -A "Mozilla/5.0" -o /dev/null -m 20 -w '%{http_code}\t%{time_starttransfer}\t%{redirect_url}' "$pprov" 2>/dev/null); then
      code1=$(printf '%s' "$r1" | cut -f1)
      ttfb1=$(printf '%s' "$r1" | cut -f2)
      rurl=$(printf '%s' "$r1" | cut -f3)
    else
      code1=000; ttfb1=0; rurl=""
    fi
    h2=$(printf '%s' "${rurl:-}" | sed -E 's#^https?://([^/]+).*#\1#')
    code2="-"; ttfb2="-"; size2="-"
    if [ -n "${rurl:-}" ]; then
      if r2=$(curl -sS -A "Mozilla/5.0" -o "$B" -m 20 -w '%{http_code}\t%{time_starttransfer}\t%{size_download}' "$rurl" 2>/dev/null); then
        code2=$(printf '%s' "$r2" | cut -f1)
        ttfb2=$(printf '%s' "$r2" | cut -f2)
        size2=$(printf '%s' "$r2" | cut -f3)
      else
        code2=000; ttfb2=0; size2=0
      fi
    fi
    # h2 solo si es un host creíble (evita imprimir basura si rurl era "000")
    case "${h2:-}" in
      *[!A-Za-z0-9.:-]*|"") h2="-" ;;
    esac
    printf 'SPLIT\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$id" "$i" "$code1" "$ttfb1" "$h2" "$code2" "$ttfb2" "$size2"
    sleep 0.3
  done

  # ── C · nº real de redirects que sigue un cliente (curl -L, máx 3)
  if hops=$(curl -sS -A "Mozilla/5.0" -L --max-redirs 3 -o /dev/null -m 25 -w '%{num_redirects}\t%{http_code}' "$pprov" 2>/dev/null); then
    printf 'HOPS\t%s\t%s\n' "$id" "$hops"
  else
    printf 'HOPS\t%s\t?\t000\n' "$id"
  fi
done

printf 'PROBE_END\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf -- '---QOE---\n'
curl -sS -m 5 "http://$BASE/_ape/qoe" || true
printf '\n---HEALTH---\n'
curl -sS -m 5 "http://$BASE/_ape/health" || true
printf '\n---METRICS---\n'
curl -sS -m 5 -o /dev/null -w '%{http_code}' "http://$BASE/_ape/metrics" || true
printf '\n'
