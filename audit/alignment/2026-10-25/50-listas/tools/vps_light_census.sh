#!/usr/bin/env bash
# ============================================================================
# vps_light_census.sh — censo ESTRUCTURAL ligero de las listas restantes del VPS
# (una pasada por archivo, streaming, CERO escrituras). Sirve para declarar un
# denominador honesto: cuántas de las 7 listas quedan UNKNOWN y con qué perfil.
# ============================================================================
set -uo pipefail
for F in "$@"; do
  echo "########## $F"
  stat -c 'size=%s mtime=%y' "$F" 2>&1
  gzip -t "$F" 2>&1 && echo "gzip_t=OK"
  zcat "$F" | awk '
  function extkey(s,   k){ k=s; sub(/^#/,"",k); sub(/[:=].*/,"",k); return k }
  {
    n++; L=$0
    if (L=="") { blanks++; next }
    if (substr(L,1,1)!="#") {
      u++
      if (index(L,"/cdn/")>0) cdn++
      else if (index(L,"/shield/")>0) sh++
      else if (index(L,"/meta/")>0) meta++
      else if (substr(L,1,5)=="http:") http++
      else if (substr(L,1,6)=="https:") https++
      next
    }
    k=extkey(L)
    if (k=="EXTM3U") { hm++; if (hm==1) hml=n; next }
    if (k=="EXTINF") { ei++; next }
    if (k=="EXT-X-STREAM-INF") {
      si++
      tmp=L; vr=gsub(/VIDEO-RANGE=/,"",tmp); if (vr>1) vrd++
      res="?"; if (match(L,/RESOLUTION=[0-9]+x[0-9]+/)) res=substr(L,RSTART+11,RLENGTH-11)
      cod="";  if (match(L,/CODECS="[^"]*"/)) cod=substr(L,RSTART+8,RLENGTH-9)
      combo[res "|" cod]++
      if (cod ~ /hev1/) hev1si++
      if (cod ~ /mp4a|ac-3|ec-3/) haud++
      next
    }
    if (k=="EXT-X-I-FRAME-STREAM-INF") { ifr++; if (index(L,"URI=")>0) ifru++; next }
    if (k=="EXT-X-MEDIA") { med++; if (index(L,"URI=")>0) medu++; next }
    if (k=="EXTHTTP") {
      eh++; b=substr(L, index(L,":")+1)
      if (b ~ /"range"[[:space:]]*:/) t["range"]++
      if (b ~ /"if-none-match"[[:space:]]*:/) t["if-none-match"]++
      if (b ~ /"if-modified-since"[[:space:]]*:/) t["if-modified-since"]++
      if (b ~ /"te"[[:space:]]*:/) t["te"]++
      if (b ~ /"priority"[[:space:]]*:/) t["priority"]++
      if (b ~ /"upgrade-insecure-requests"[[:space:]]*:/) t["uir"]++
      if (b ~ /"traceparent"[[:space:]]*:/) t["traceparent"]++
      if (b ~ /"x-requested-with"[[:space:]]*:/) t["x-requested-with"]++
      if (!(b ~ /^\{/)) ebad++
      next
    }
    if (k=="EXT-X-TARGETDURATION") { td++; next }
    if (k=="EXT-X-MEDIA-SEQUENCE") { ms++; next }
    if (k=="EXT-X-PART-INF") { pi++; next }
    if (k=="EXT-X-SERVER-CONTROL") { sc++; next }
    if (k=="EXT-X-START") { st++; next }
  }
  END{
    printf "LINES=%d BLANKS=%d URI=%d\n", n, blanks, u
    printf "EXTM3U=%d@%s EXTINF=%d STREAMINF=%d IFRAME=%d(conURI=%d) MEDIA=%d(conURI=%d)\n", hm, hml, ei, si, ifr, ifru, med, medu
    printf "EXTHTTP=%d MALFORMADO=%d\n", eh, ebad
    for (x in t) printf "TOXICO_%s=%d\n", x, t[x]
    printf "URL: directo_http=%d directo_https=%d cdn=%d shield=%d meta=%d\n", http, https, cdn, sh, meta
    printf "VIDEO_RANGE_DUP=%d HEV1_EN_STREAMINF=%d CON_AUDIO=%d\n", vrd, hev1si, haud
    printf "TAGS_MEDIA_PLAYLIST: TARGETDURATION=%d MEDIA_SEQUENCE=%d PART_INF=%d SERVER_CONTROL=%d START=%d\n", td, ms, pi, sc, st
    printf "COMBOS_DISTINTOS=%d\n", length(combo)
    for (x in combo) printf "  %d\t%s\n", combo[x], x
  }
  '
done
echo "########## FIN"
