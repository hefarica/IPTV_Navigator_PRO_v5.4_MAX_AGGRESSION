#!/usr/bin/env bash
# ============================================================================
# E9 - CAMPANA /cdn/ (>=100 peticiones, READ-ONLY)  v1.0.1
# ----------------------------------------------------------------------------
# Mismo instrumento para el "despues": N peticiones secuenciales por canal a
# traves del 443 real (SNI -> 127.0.0.1) y 15 al 8088 directo. Registra status,
# TTFB, X-APE-Upstream-Ms, X-APE-UHD, X-APE-URI-Rebased, bytes y sha del cuerpo.
# Uso: ssh root@178.156.147.234 'N=34 bash -s' < e9_cdn_campaign.sh
# ============================================================================
set -uo pipefail
N="${N:-34}"
GZCDN=/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz
HOST=iptv-ape.duckdns.org
TMP=$(mktemp -d /tmp/e9-camp-XXXXXX); trap 'rm -rf "$TMP"' EXIT
REQS="$TMP/reqs.tsv"
say() { printf '%s\n' "$*"; }

say "## CAMPANA /cdn/"
say "n_per_channel=$N"
say "date_utc=$(date -u +%FT%TZ)"
say "nginx_T_sha256=$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"

i=0
for id in 3 5 6; do
  url=$(zcat "$GZCDN" 2>/dev/null | grep -m1 -E "^https://iptv-ape\.duckdns\.org/cdn/line\.tivi-ott\.net/.*/${id}\.m3u8$")
  if [ -z "$url" ]; then say "channel_$id=MISSING"; continue; fi
  path=${url#https://$HOST}
  say "channel_$id=found path_len=${#path}"
  k=0
  while [ "$k" -lt "$N" ]; do
    k=$((k+1)); i=$((i+1))
    hdr="$TMP/h.$i"; body="$TMP/b.$i"
    meta=$(curl -sS -D "$hdr" -o "$body" -m 30 --resolve "$HOST:443:127.0.0.1" \
      -w '%{http_code}\t%{time_starttransfer}\t%{time_total}\t%{size_download}' "https://$HOST$path" 2>/dev/null \
      || printf '000\t0\t0\t0')
    up=$(tr -d '\r' < "$hdr" 2>/dev/null | awk 'tolower($1)=="x-ape-upstream-ms:"{gsub(/[^0-9]/,"",$2); print $2; exit}')
    uhd=$(tr -d '\r' < "$hdr" 2>/dev/null | awk 'tolower($1)=="x-ape-uhd:"{print $2; exit}')
    reb=$(tr -d '\r' < "$hdr" 2>/dev/null | awk 'tolower($1)=="x-ape-uri-rebased:"{print $2; exit}')
    bg=$(sha256sum "$body" 2>/dev/null | cut -d' ' -f1)
    IFS=$'\t' read -r code ttfb total size <<< "$meta"
    printf 'REQ\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$i" "$id" "${code:-000}" "${ttfb:-0}" "${total:-0}" "${size:-0}" "${up:-}" "${uhd:-}" "${reb:-}" "$bg" "443" >> "$REQS"
    sleep 0.15
  done
done

url3=$(zcat "$GZCDN" 2>/dev/null | grep -m1 -E "^https://iptv-ape\.duckdns\.org/cdn/line\.tivi-ott\.net/.*/3\.m3u8$")
if [ -n "$url3" ]; then
  path3=${url3#https://$HOST}
  k=0
  while [ "$k" -lt 15 ]; do
    k=$((k+1)); i=$((i+1))
    meta=$(curl -sS -o /dev/null -m 30 -w '%{http_code}\t%{time_starttransfer}\t%{time_total}\t%{size_download}' \
      "http://127.0.0.1:8088$path3" 2>/dev/null || printf '000\t0\t0\t0')
    IFS=$'\t' read -r code ttfb total size <<< "$meta"
    printf 'REQ\t%s\t%s\t%s\t%s\t%s\t%s\t\t\t\t\t8088\n' \
      "$i" "3" "${code:-000}" "${ttfb:-0}" "${total:-0}" "${size:-0}" >> "$REQS"
    sleep 0.15
  done
fi

say "campaign_total_attempts=$i"
say "req_sample_begin"
head -3 "$REQS" | sed 's/^/req: /'
say "req_sample_end"

say "summary_begin"
awk -F'\t' '
function pct(a,b){ return (b>0)?(100.0*a/b):0 }
$1=="REQ" {
  ch=$3; code=$4; ttfb=$5*1000; up=$8; plane=$12
  tot[plane]++; bycode[plane ":" code]++; chans[ch]++
  if (code==200) { ok[plane]++; t[plane, ++nt[plane]] = ttfb }
  if (up!="" && code==200) { u[plane, ++nu[plane]] = up }
  if ($11 ~ /^[0-9a-f]{64}$/) { bodies[$11]++ }
  if ($9=="on" || $9=="4k" || $9=="8k") uhd[$9]++
  reb[$10]++
}
function nearest(arr, n, p,   k) { if (n==0) return -1; k=int((p*n)+0.999999); if (k<1) k=1; if (k>n) k=n; return arr[k] }
function sortarr(arr, n,   i,j,tmp) { for(i=2;i<=n;i++){tmp=arr[i]; j=i-1; while(j>0 && arr[j]>tmp){arr[j+1]=arr[j]; j--} arr[j+1]=tmp} }
END {
  for (p in tot) {
    printf "plane_%s_total=%d\n", p, tot[p]
    printf "plane_%s_ok=%d\n", p, ok[p]
    printf "plane_%s_ok_pct=%.2f\n", p, pct(ok[p], tot[p])
    n=nt[p]; for (i=1;i<=n;i++) a[i]=t[p,i]; sortarr(a,n)
    printf "plane_%s_ttfb_p50_ms=%.1f\n", p, nearest(a,n,0.50)
    printf "plane_%s_ttfb_p95_ms=%.1f\n", p, nearest(a,n,0.95)
    n=nu[p]; for (i=1;i<=n;i++) b[i]=u[p,i]; sortarr(b,n)
    printf "plane_%s_upstream_p50_ms=%.1f\n", p, nearest(b,n,0.50)
    printf "plane_%s_upstream_p95_ms=%.1f\n", p, nearest(b,n,0.95)
  }
  for (k in bycode) { n=split(k, z, ":"); printf "code_%s_%s=%d\n", z[1], z[2], bycode[k] }
  for (k in uhd) printf "uhd_mode_%s=%d\n", k, uhd[k]
  for (k in reb) if (k!="") printf "rebase_value_%s=%d\n", k, reb[k]
  printf "distinct_bodies=%d\n", length(bodies)
}' "$REQS" | sort
say "summary_end"
say "done_utc=$(date -u +%FT%TZ)"
