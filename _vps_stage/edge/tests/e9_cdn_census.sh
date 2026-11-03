#!/usr/bin/env bash
# ============================================================================
# E9 - CENSO DEL FALLO INTERMITENTE DE /cdn/ DESDE EL LOG DE NGINX (READ-ONLY)
# ----------------------------------------------------------------------------
# Mismo parser para ANTES y DESPUES; el corte es el hotfix de las 20:49:57Z
# (breaker de 15 s eliminado). Uso:
#   ssh root@178.156.147.234 'TH=26/Oct/2026:20:49:57 bash -s' < e9_cdn_census.sh
# ============================================================================
set -uo pipefail
TH="${TH:-26/Oct/2026:20:49:57}"
LOGS="/var/log/nginx/access.log /var/log/nginx/access.log.1"
say() { printf '%s\n' "$*"; }

say "## CENSO /cdn/ (parser unico para ambos lados)"
say "threshold=$TH"
say "logs=$(echo "$LOGS" | tr ' ' ',')"
say "date_utc=$(date -u +%FT%TZ)"

awk -v TH="$TH" '
function pct(a,b) { return (b > 0) ? (100.0 * a / b) : 0 }
{
  if ($7 !~ /^\/cdn\//) next
  ts = $4; sub(/^\[/, "", ts)
  st = $9
  side = (ts < TH) ? "BEFORE" : "AFTER"
  total[side]++
  byst[side ":" st]++
  nbytes[side] += ($10 == "-" ? 0 : $10 + 0)
  day = substr(ts, 1, 11)
  byday[side ":" day]++
}
END {
  printf "cdn_before_total=%d\n", total["BEFORE"]
  printf "cdn_after_total=%d\n",  total["AFTER"]
  printf "cdn_before_bytes=%d\n", nbytes["BEFORE"]
  printf "cdn_after_bytes=%d\n",  nbytes["AFTER"]
  printf "cdn_before_ok_pct=%.2f\n", pct(byst["BEFORE:200"], total["BEFORE"])
  printf "cdn_after_ok_pct=%.2f\n",  pct(byst["AFTER:200"],  total["AFTER"])
  printf "cdn_before_fail_pct=%.2f\n", pct(total["BEFORE"] - byst["BEFORE:200"], total["BEFORE"])
  printf "cdn_after_fail_pct=%.2f\n",  pct(total["AFTER"]  - byst["AFTER:200"],  total["AFTER"])
  for (k in byst) { n = split(k, p, ":"); printf "cdn_%s_status_%s=%d\n", tolower(p[1]), p[2], byst[k] }
  for (k in byday) { n = split(k, p, ":"); printf "cdn_%s_day_%s_%s=%d\n", tolower(p[1]), p[2], p[3], byday[k] }
}' $LOGS | sort

say ""
say "## DETALLE: codigos no-200 DESPUES (con reason del gateway si consta)"
awk -v TH="$TH" '
{
  if ($7 !~ /^\/cdn\//) next
  ts = $4; sub(/^\[/, "", ts)
  if (ts < TH) next
  if ($9 == 200) next
  printf "after_non200: ts=%s status=%s bytes=%s uri=%s\n", ts, $9, $10, $7
}' $LOGS | head -40

say ""
say "## DETALLE: distribucion ANTES por dia"
awk -v TH="$TH" '
{
  if ($7 !~ /^\/cdn\//) next
  ts = $4; sub(/^\[/, "", ts)
  if (ts >= TH) next
  day = substr(ts, 1, 11)
  d[day ":" $9]++
}
END { for (k in d) { n = split(k, p, ":"); printf "before_day: %s %s -> %d\n", p[1], p[2], d[k] } }' $LOGS | sort
say "done_utc=$(date -u +%FT%TZ)"
