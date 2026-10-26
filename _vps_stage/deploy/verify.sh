#!/usr/bin/env bash
# verify.sh — SMOKE post-deploy (y también línea base pre-deploy). Solo GET.
#
# [t92b] Reglas de este script:
#   · NADA de nombres inventados. Solo se comprueban endpoints MEDIDOS.
#   · Códigos de salida: 0 = todo OK · 2 = fallo de RED/curl · 3 = endpoint != 200
#   · En DRY-RUN (APE_DRY_RUN=1) la capa lua (8088) va en SKIP: no se ha desplegado.
#
# Endpoints MEDIDOS (200 verificado por el capitán y por vps-edge):
#   /lists/APE_LISTA_1793002539897_CDN.m3u8   → 200 (154 MB)
#   /lists/APE_LISTA_4K.m3u8                  → 200 (135 MB)
# APE_LISTA_PRODUCTION.m3u8 NO EXISTE: no se usa.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
c_hdr "VERIFY · smoke HTTP · $(date -u +%FT%TZ)"
HOST_IP="${VPS_HOST#*@}"
BASE="https://iptv-ape.duckdns.org"
DRY="${APE_DRY_RUN:-0}"
net_fail=0
bad=0

# Comprueba status + primera línea. Distingue RED de ENDPOINT.
check(){ # url  nombre
  local url="$1" name="$2" code first rc
  code="$(rsh "curl -s -o /dev/null -m 25 -w '%{http_code}' --resolve iptv-ape.duckdns.org:443:$HOST_IP '$url'" 2>/dev/null)"
  rc=$?
  if [ "$rc" -eq 255 ] || [ -z "$code" ]; then
    printf '   RED    %-46s SSH/curl no respondio (rc=%s)\n' "$name" "$rc"
    net_fail=1; return 1
  fi
  if [ "$code" != "200" ]; then
    printf '   FALLA  %-46s code=%s (esperado 200)\n' "$name" "$code"
    bad=1; return 1
  fi
  first="$(rsh "curl -s -m 25 --resolve iptv-ape.duckdns.org:443:$HOST_IP '$url' | head -c 7" 2>/dev/null)"
  if [ "$first" != "#EXTM3U" ]; then
    printf '   FALLA  %-46s code=200 pero 1a linea != #EXTM3U\n' "$name"
    bad=1; return 1
  fi
  printf '   OK     %-46s code=%s · #EXTM3U\n' "$name" "$code"
  return 0
}

# Endpoints lua (solo se usan tras un deploy real): status sin comprobar cuerpo.
check_code(){ # url  nombre
  local url="$1" name="$2" code
  code="$(rsh "curl -s -o /dev/null -m 15 -w '%{http_code}' '$url'" 2>/dev/null)"
  if [ -z "$code" ]; then printf '   RED    %-46s SSH/curl no respondio\n' "$name"; net_fail=1; return 1; fi
  if [ "$code" != "200" ]; then printf '   FALLA  %-46s code=%s\n' "$name" "$code"; bad=1; return 1; fi
  printf '   OK     %-46s code=%s\n' "$name" "$code"
  return 0
}

c_hdr "1 · listas vivas (endpoints MEDIDOS)"
check "$BASE/lists/APE_LISTA_1793002539897_CDN.m3u8" "/lists/APE_LISTA_..._CDN.m3u8"
check "$BASE/lists/APE_LISTA_4K.m3u8" "/lists/APE_LISTA_4K.m3u8"

if [ "$DRY" = "1" ]; then
  c_hdr "2 · capa lua (8088) · SKIP en dry-run (no se ha desplegado)"
  printf '   SKIP   8088 selftest (lua fuse)         APE_DRY_RUN=1\n'
  printf '   SKIP   8088 _ape/health                 APE_DRY_RUN=1\n'
else
  c_hdr "2 · capa lua (8088)"
  check_code "http://127.0.0.1:8088/__selftest.m3u8" "8088 selftest (lua fuse)"
  check_code "http://127.0.0.1:8088/_ape/health" "8088 _ape/health"
fi

c_hdr "RESUMEN VERIFY"
[ "$DRY" = "1" ] && printf '   modo=dry-run · capa lua omitida\n'
if [ "$net_fail" -ne 0 ]; then
  c_bad "   RED: no se pudo consultar el edge (exit 2)"
  exit 2
fi
if [ "$bad" -ne 0 ]; then
  c_bad "   ENDPOINTS: alguno no devolvio 200 (codigos arriba) (exit 3)"
  exit 3
fi
c_ok "   SMOKE OK (todos 200 con #EXTM3U)"
exit 0
