#!/usr/bin/env bash
# verify.sh — SMOKE post-deploy (y también pre-deploy como línea base). Solo GET.
# [t92] En DRY-RUN (APE_DRY_RUN=1) solo se exigen los endpoints de LECTURA
#       (/health, /lists/, /cdn/). Los de la capa lua (8088) NO se exigen porque
#       el dry-run no despliega nada: exigirlos haría fallar el pipeline por un
#       componente que, por definición, aún no está. Además se reporta el código
#       concreto de cada endpoint en vez de un exit 1 genérico.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
c_hdr "VERIFY · smoke HTTP"
HOST_IP="${VPS_HOST#*@}"
BASE="https://iptv-ape.duckdns.org"
DRY="${APE_DRY_RUN:-0}"

check(){ # url  esperado  nombre
  code="$(rsh "curl -s -o /dev/null -m 12 -w '%{http_code}' --resolve iptv-ape.duckdns.org:443:$HOST_IP '$1'")" || code='SSH_FAIL'
  if [ "$code" = "$2" ]; then printf '   OK    %-45s %s\n' "$3" "$code"; return 0; fi
  printf '   FALLA %-45s %s (esperado %s)\n' "$3" "$code" "$2"; return 1
}

bad=0

# ── Endpoints de LECTURA: se exigen siempre (dry-run y deploy) ──────────────
c_hdr "1 · lectura (se exige en dry-run y en deploy)"
check "$BASE/health" 200 "443 /health" || bad=1
if [ "$DRY" = "1" ]; then
  # [t92] El nombre de la lista es APE_LISTA_<epoch>[_CDN_SHIELDED].m3u8 y lo
  # fija la APP en cada publicacion: en dry-run NO se exige un nombre concreto.
  check "$BASE/lists/" 200 "443 /lists/ (directorio)" || bad=1
else
  check "$BASE/lists/APE_LISTA_PRODUCTION.m3u8" 200 "443 /lists/ lista viva" || bad=1
fi
check "$BASE/cdn/" 200 "443 /cdn/ plano CDN" || bad=1

# ── Capa lua (8088): solo se exige tras un deploy real ──────────────────────
if [ "$DRY" = "1" ]; then
  c_hdr "2 · capa lua (8088) · OMITIDA en dry-run (no se ha desplegado)"
  printf '   SKIP  8088 selftest (lua fuse)            APE_DRY_RUN=1\n'
  printf '   SKIP  8088 _ape/health                    APE_DRY_RUN=1\n'
else
  c_hdr "2 · capa lua (8088)"
  check "http://127.0.0.1:8088/__selftest.m3u8" 200 "8088 selftest (lua fuse)" || bad=1
  check "http://127.0.0.1:8088/_ape/health" 200 "8088 _ape/health" || bad=1
fi

printf '   --- tamano de la lista servida:\n'
rsh "curl -s -m 20 -o /dev/null -w '   bytes=%{size_download} code=%{http_code}\n' --resolve iptv-ape.duckdns.org:443:$HOST_IP '$BASE/lists/APE_LISTA_PRODUCTION.m3u8'"

c_hdr "RESUMEN VERIFY"
if [ "$DRY" = "1" ]; then
  printf '   modo=dry-run · solo lectura · capa lua omitida\n'
fi
if [ "$bad" -eq 0 ]; then
  c_ok "   SMOKE OK (codigos concretos arriba)"
  exit 0
fi
c_bad "   SMOKE CON FALLOS (ver codigos concretos arriba)"
exit 1
