#!/usr/bin/env bash
# verify.sh — SMOKE post-deploy (y también pre-deploy como línea base). Solo GET.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
c_hdr "VERIFY · smoke HTTP"
HOST_IP="${VPS_HOST#*@}"
BASE="https://iptv-ape.duckdns.org"
check(){ # url  esperado  nombre
  code="$(rsh "curl -s -o /dev/null -m 12 -w '%{http_code}' --resolve iptv-ape.duckdns.org:443:$HOST_IP '$1'")"
  if [ "$code" = "$2" ]; then printf '   OK    %-45s %s\n' "$3" "$code"; return 0; fi
  printf '   FALLA %-45s %s (esperado %s)\n' "$3" "$code" "$2"; return 1
}
bad=0
check "$BASE/health" 200 "443 /health" || bad=1
check "$BASE/lists/APE_LISTA_PRODUCTION.m3u8" 200 "443 lista viva" || bad=1
check "http://127.0.0.1:8088/__selftest.m3u8" 200 "8088 selftest (lua fuse)" || bad=1
check "http://127.0.0.1:8088/_ape/health" 200 "8088 _ape/health" || bad=1
printf '   --- tamano de la lista servida:\n'
rsh "curl -s -m 20 -o /dev/null -w '   bytes=%{size_download} code=%{http_code}\n' --resolve iptv-ape.duckdns.org:443:$HOST_IP '$BASE/lists/APE_LISTA_PRODUCTION.m3u8'"
c_hdr "RESUMEN VERIFY"
[ "$bad" -eq 0 ] && c_ok "   SMOKE OK" || c_bad "   SMOKE CON FALLOS"
exit "$bad"
