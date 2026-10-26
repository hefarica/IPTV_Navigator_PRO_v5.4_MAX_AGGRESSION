#!/usr/bin/env bash
# ============================================================================
# vps_catalog_census2.sh — segunda pasada CORREGIDA (read-only, streaming).
#   p1: separa lineas EN BLANCO de lineas URI (el censo 1 las contaba juntas)
#   p2: detecta headers toxicos EXTHTTP por CLAVE EXACTA (no substring: el
#       substring "Range" daba falso positivo contra X-Video-Range)
#   p3: histograma de tags NO clasificados (que son esos 2.77 M)
#   p4: canales CON y SIN #EXT-X-STREAM-INF
#   p5: muestra integra de #EXT-X-I-FRAME-STREAM-INF y #EXT-X-PART*
#   p6: cola real del archivo
# CERO escrituras en el VPS.
# ============================================================================
set -uo pipefail
F="${F:-/var/www/lists/APE_LISTA_1792869328847.m3u8.gz}"
echo "### FILE2 $F"
zcat "$F" | awk '
function extkey(s,   k){ k=s; sub(/^#/,"",k); sub(/[:=].*$/,"",k); return k }
BEGIN{
  known["EXTM3U"]=1; known["EXTINF"]=1; known["EXT-X-STREAM-INF"]=1; known["EXTHTTP"]=1
  known["EXTVLCOPT"]=1; known["KODIPROP"]=1; known["EXT-X-APE"]=1
}
{
  n++; L=$0
  if (L=="") { blanks++; next }
  if (substr(L,1,1)!="#") { urls++; next }

  k=extkey(L)
  if (k=="EXTHTTP") {
     eh++
     # claves exactas (el JSON empieza justo tras "EXTHTTP:")
     body=substr(L, index(L,":")+1)
     # quitar espacios
     gsub(/^[ \t]+/,"",body)
     # probar cada header toxico como CLAVE JSON exacta
     if (body ~ /"range"[[:space:]]*:/)                      tox["range"]++
     if (body ~ /"if-none-match"[[:space:]]*:/)              tox["if-none-match"]++
     if (body ~ /"if-modified-since"[[:space:]]*:/)          tox["if-modified-since"]++
     if (body ~ /"te"[[:space:]]*:/)                         tox["te"]++
     if (body ~ /"priority"[[:space:]]*:/)                   tox["priority"]++
     if (body ~ /"upgrade-insecure-requests"[[:space:]]*:/)  tox["upgrade-insecure-requests"]++
     if (body ~ /"traceparent"[[:space:]]*:/)                tox["traceparent"]++
     if (body ~ /"x-requested-with"[[:space:]]*:/)           tox["x-requested-with"]++
     if (body ~ /iptv-ape\.duckdns\.org/)                    tox["vps_domain_en_header"]++
     if (!(body ~ /^\{/) || !(body ~ /\}$/))                 eh_bad++
     next
  }
  if (k=="EXT-X-STREAM-INF") {
     si++
     # canales con STREAM-INF: se marca el canal abierto
     if (openchan) chan_with_si++
     if (si<=3) sisamp[si]=L
     next
  }
  if (k=="EXT-X-I-FRAME-STREAM-INF") {
     ifr++; if (index(L,"URI=")>0) ifr_uri++
     if (ifr<=2) ifrsamp[ifr]=n"|"L
     next
  }
  if (k=="EXT-X-PART" || k=="EXT-X-PART-INF" || k=="EXT-X-START" || k=="EXT-X-SERVER-CONTROL" || k=="EXT-X-VERSION") {
     med[k]++; if (med[k]<=2) medsamp[k]=medsamp[k] "\n" n"|"L
     next
  }
  if (k=="EXTINF") { extinf++; if (openchan) {closed++} openchan=1; next }
  if (k=="EXTM3U" || k=="EXTVLCOPT" || k=="KODIPROP" || k=="EXT-X-APE") next
  other[k]++
}
END{
  for (i=n-2; i<=n; i++) tailring[i]=1
  printf "LINES=%d BLANKS=%d URI_LINES=%d\n", n, blanks, urls
  printf "EXTINF=%d STREAM_INF=%d IFRAME=%d IFRAME_SIN_URI=%d\n", extinf, si, ifr, ifr-ifr_uri
  printf "EXTHTTP=%d EXTHTTP_MALFORMADO=%d\n", eh, eh_bad
  for (t in tox) printf "TOXICO_%s=%d\n", t, tox[t]
  printf "CANALES_CON_STREAMINF=%d CANALES_SIN_STREAMINF=%d\n", chan_with_si, extinf-chan_with_si
  print "---MEDIA_TAGS---"
  for (k in med) { printf "%s=%d\n", k, med[k]; printf "%s", medsamp[k] }
  print "---OTROS_TAGS_TOP---"
  c=0
  for (k in other) { print other[k] "\t" k; c++ }
  printf "OTROS_TAGS_DISTINTOS=%d\n", c
  print "---IFRAME_SAMPLES---"
  for (i=1;i<=2;i++) if (i in ifrsamp) print ifrsamp[i]
  print "---STREAMINF_SAMPLE---"
  for (i=1;i<=1;i++) if (i in sisamp) print sisamp[i]
}
'
echo "### TAIL_REAL"
zcat "$F" | tail -n 4 | cut -c1-600
echo "### CENSUS2_END"
