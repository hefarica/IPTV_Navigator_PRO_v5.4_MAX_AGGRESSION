#!/usr/bin/env bash
# ============================================================================
# vps_catalog_census.sh — censo ESTRUCTURAL read-only de un catalogo servido por
# el VPS, en UNA sola pasada de streaming (zcat | awk). CERO escrituras.
#
# Uso (desde la estacion local, enviado por base64 a `bash -s`):
#   F=/var/www/lists/APE_LISTA_1792869328847.m3u8.gz  bash vps_catalog_census.sh
#
# Autor: listas-m3u8 (t8). Solo lectura: no crea, mueve ni borra archivos.
# ============================================================================
set -uo pipefail
F="${F:-/var/www/lists/APE_LISTA_1792869328847.m3u8.gz}"

echo "### FILE ${F}"
stat -c '%n size=%s mtime=%y' "$F" 2>&1
sha256sum "$F" 2>&1
echo "### GZIP_INTEGRITY"
gzip -t "$F" && echo "gzip -t: OK"
echo

echo "### CENSUS_BEGIN"
zcat "$F" | awk '
BEGIN{ maxhdr=200 }
{
  n++
  L=$0
  if (n<=maxhdr) hdr[n]=L
  ring[n%14]=L

  if (substr(L,1,1) != "#") {
     urls++
     if (substr(L,1,7)=="http://")  hu++
     if (substr(L,1,8)=="https://") hs++
     if (index(L,"/shield/")>0) ushield++
     if (index(L,"/cdn/")>0)    ucdn++
     if (index(L,"/meta/")>0)   umeta++
     if (prevurl) twourls++
     prevurl=1
     if (urls<=4) usamp[urls]=L
     next
  }
  prevurl=0

  if (index(L,"#EXTINF")==1) {
     extinf++
     if (index(L,"tvg-id=")==0)      notvgid++
     if (index(L,"tvg-name=")==0)    notvgnm++
     if (index(L,"group-title=")==0) nogrp++
     if (index(L,"tvg-logo=")==0)    nologo++
     if (extinf<=2) eisamp[extinf]=L
     next
  }
  if (index(L,"#EXT-X-STREAM-INF:")==1) {
     si++
     tmp=L; vr=gsub(/VIDEO-RANGE=/,"",tmp)
     if (vr==0) novr++
     if (vr>1) { vrmulti++; if (vrmulti<=4) vrsamp[vrmulti]=L }
     res="?"; if (match(L,/RESOLUTION=[0-9]+x[0-9]+/)) res=substr(L,RSTART+11,RLENGTH-11)
     bw="?";  if (match(L,/BANDWIDTH=[0-9]+/))         bw=substr(L,RSTART+10,RLENGTH-10)
     cod="";  if (match(L,/CODECS="[^"]*"/))           cod=substr(L,RSTART+8,RLENGTH-9)
     hdrr=""; if (match(L,/VIDEO-RANGE=[A-Za-z0-9-]+/)) hdrr=substr(L,RSTART+12,RLENGTH-12)
     if (cod ~ /mp4a|ac-3|ec-3|opus|flac|dtsc|mha1|mhm1/) haudio++
     if (cod ~ /dvh1|dvhe/) hasdv++
     combo[res "|" bw "|" cod "|" hdrr]++
     if (si<=40) sisamp[si]=L
     next
  }
  if (index(L,"#EXTHTTP")==1) {
     eh++
     if (eh<=2) ehsamp[eh]=L
     if (index(L,"Range")>0)                  eh_range++
     if (index(L,"If-None-Match")>0)          eh_inm++
     if (index(L,"If-Modified-Since")>0)      eh_ims++
     if (index(L,"TE:")>0)                    eh_te++
     if (index(L,"Priority")>0)               eh_pri++
     if (index(L,"Upgrade-Insecure-Requests")>0) eh_uir++
     if (index(L,"traceparent")>0)            eh_trp++
     if (index(L,"X-Requested-With")>0)       eh_xrw++
     next
  }
  if (index(L,"#EXTVLCOPT")==1) { vlc++; next }
  if (index(L,"#KODIPROP")==1)  { kodi++; next }
  if (index(L,"#EXT-X-MEDIA:")==1) { media++; if (index(L,"URI=")>0) media_uri++; next }
  if (index(L,"#EXT-X-I-FRAME-STREAM-INF")==1) { ifr++; if (index(L,"URI=")>0) ifr_uri++; next }
  if (index(L,"#EXT-X-TARGETDURATION")==1) { td++; tdln=tdln" "n; next }
  if (index(L,"#EXT-X-MEDIA-SEQUENCE")==1) { ms++; msln=msln" "n; next }
  if (index(L,"#EXT-X-ENDLIST")==1)     { endlist++; next }
  if (index(L,"#EXT-X-PLAYLIST-TYPE")==1) { ptype++; next }
  if (index(L,"#EXT-X-MAP")==1)         { map++; next }
  if (index(L,"#EXT-X-KEY")==1)         { xkey++; next }
  if (index(L,"#EXT-X-PART")==1)        { part++; next }
  if (index(L,"#EXT-X-START")==1)       { start++; next }
  if (index(L,"#EXT-X-SERVER-CONTROL")==1) { srvctl++; next }
  if (index(L,"#EXT-X-PART-INF")==1)    { partinf++; next }
  if (index(L,"#EXT-X-SESSION-DATA")==1){ sd++; next }
  if (index(L,"#EXT-X-APE-")==1)        { ape++; next }
  if (index(L,"#EXTM3U")==1)            { hm3u++; hm3uln=n; next }
  other++
}
END{
  printf "TOTAL_LINES=%d\n", n
  printf "EXTM3U_COUNT=%d EXTM3U_LINE=%s\n", hm3u, hm3uln
  printf "EXTINF=%d\n", extinf
  printf "STREAM_INF=%d\n", si
  printf "EXTHTTP=%d\n", eh
  printf "EXTVLCOPT=%d\n", vlc
  printf "KODIPROP=%d\n", kodi
  printf "EXT_X_APE_TAGS=%d\n", ape
  printf "SESSION_DATA=%d\n", sd
  printf "URL_LINES=%d (http=%d https=%d)\n", urls, hu, hs
  printf "URL_CON_SHIELD=%d URL_CON_CDN=%d URL_CON_META=%d\n", ushield, ucdn, umeta
  printf "DOS_URLS_SEGUIDAS=%d\n", twourls
  printf "MEDIA_TAGS_EXTRA=%d IFRAME=%d\n", media, ifr
  printf "MEDIA_CON_URI=%d IFRAME_CON_URI=%d\n", media_uri, ifr_uri
  printf "TARGETDURATION_COUNT=%d LINES=[%s]\n", td, tdln
  printf "MEDIA_SEQUENCE_COUNT=%d LINES=[%s]\n", ms, msln
  printf "ENDLIST=%d PLAYLIST_TYPE=%d EXT_X_MAP=%d EXT_X_KEY=%d EXT_X_PART=%d\n", endlist, ptype, map, xkey, part
  printf "EXT_X_START=%d SERVER_CONTROL=%d PART_INF=%d\n", start, srvctl, partinf
  printf "EXTINF_SIN_tvg-id=%d SIN_tvg-name=%d SIN_group-title=%d SIN_tvg-logo=%d\n", notvgid, notvgnm, nogrp, nologo
  printf "STREAMINF_SIN_VIDEORANGE=%d CON_VIDEORANGE_DUPLICADO=%d\n", novr, vrmulti
  printf "STREAMINF_CODEC_CON_AUDIO=%d CODEC_CON_DV=%d\n", haudio, hasdv
  printf "EXTHTTP_T0X_Range=%d If-None-Match=%d If-Modified-Since=%d TE=%d Priority=%d UIR=%d traceparent=%d X-Requested-With=%d\n", eh_range, eh_inm, eh_ims, eh_te, eh_pri, eh_uir, eh_trp, eh_xrw
  printf "OTRAS_LINEA_HASH=%d\n", other
  printf "UNIQUE_COMBO_RES_BW_CODEC_VR=%d\n", length(combo)
  print "---COMBO_BEGIN---"
  for (k in combo) printf "%d\t%s\n", combo[k], k
  print "---COMBO_END---"
  print "---EXTINF_SAMPLES---"
  for (i=1; i<=2; i++) if (i in eisamp) print eisamp[i]
  print "---URL_SAMPLES---"
  for (i=1; i<=4; i++) if (i in usamp) print usamp[i]
  print "---EXTHTTP_SAMPLES---"
  for (i=1; i<=2; i++) if (i in ehsamp) print ehsamp[i]
  print "---STREAMINF_SAMPLES---"
  for (i=1; i<=40; i++) if (i in sisamp) print sisamp[i]
  print "---VIDEORANGE_DUP_SAMPLES---"
  for (i=1; i<=4; i++) if (i in vrsamp) print vrsamp[i]
  print "---HEADER_LINES---"
  for (i=1; i<=maxhdr; i++) if (i in hdr) printf "%d|%s\n", i, hdr[i]
  print "---TAIL_RING---"
  for (i=n-13; i<=n; i++) if (i in ring) printf "%d|%s\n", i, ring[i%14]
}
'
echo "### CENSUS_END"
