#!/usr/bin/env bash
# verify.sh — SMOKE post-deploy (y también línea base pre-deploy). Solo GET.
#
# [t92b] Reglas de este script:
#   · NADA de nombres inventados. Solo se comprueban endpoints MEDIDOS.
#   · Códigos de salida: 0 = todo OK · 2 = fallo de RED/curl · 3 = endpoint != 200
#   · En DRY-RUN (APE_DRY_RUN=1) la capa lua (8088) va en SKIP: no se ha desplegado.
#
# Endpoints: ya NO se hardcodean. La lista viva se descubre en disco (la .m3u8
# mas reciente en /var/www/html/lists), porque las dos que estaban fijadas
# (APE_LISTA_4K.m3u8 y APE_LISTA_1793002539897_CDN.m3u8) fueron retiradas y su
# 404 hacia fallar este job SIEMPRE, bloqueando cualquier deploy. [t120]
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
# [t120] DESCUBRIMIENTO DINAMICO.
# Antes estaban hardcodeadas dos listas ya retiradas (APE_LISTA_4K.m3u8 y
# APE_LISTA_1793002539897_CDN.m3u8). Ambas devuelven 404 desde que fueron
# reemplazadas, asi que este job fallaba SIEMPRE y bloqueaba cualquier deploy:
# el verificador miraba ficheros que ya no existen. No era una caida del VPS.
# Ahora se prueba la lista viva: la .m3u8 mas reciente en disco.
LIVE_LIST="$(rsh 'for d in /var/www/html/lists /var/www/lists; do if [ -d "$d" ]; then ls -1t "$d"/*.m3u8 2>/dev/null | head -1; break; fi; done' 2>/dev/null | tr -d '\r' | tail -1)"
if [ -n "$LIVE_LIST" ]; then
  LIVE_LIST_NAME="$(basename "$LIVE_LIST")"
  printf '   INFO   lista viva detectada en disco: %s\n' "$LIVE_LIST_NAME"
else
  LIVE_LIST_NAME="APE_LISTA_1793589060441.m3u8"
  printf '   WARN   no se pudo descubrir la lista viva; se prueba la conocida: %s\n' "$LIVE_LIST_NAME"
fi
check "$BASE/lists/$LIVE_LIST_NAME" "/lists/$LIVE_LIST_NAME"

if [ "$DRY" = "1" ]; then
  c_hdr "2 · capa lua (8088) · SKIP en dry-run (no se ha desplegado)"
  printf '   SKIP   8088 selftest (lua fuse)         APE_DRY_RUN=1\n'
  printf '   SKIP   8088 _ape/health                 APE_DRY_RUN=1\n'
else
  c_hdr "2 · capa lua (8088)"
  check_code "http://127.0.0.1:8088/__selftest.m3u8" "8088 selftest (lua fuse)"
  check_code "http://127.0.0.1:8088/_ape/health" "8088 _ape/health"
fi

# ── [t112] PARIDAD OBLIGATORIA DE HASHES ─────────────────────────────────────
# Regla dura: NO se declara success si el sha256 del fichero instalado no es
# EXACTAMENTE el del repo. Esto es lo que faltaba: el deploy decía "success"
# con `ape_gateway.lua` en 11.748 B mientras el repo tenía 21.327 B.
c_hdr "PARIDAD sha256 repo == remoto (manifiesto completo)"
parity_bad=0; parity_missing=0; n_checked=0
n_manifest=$(manifest_rows | grep -c . || true)   # [t115]
while IFS=$'\t' read -r src dst mode owner note <&3; do   # [t115] fd 3: ssh NO puede robar el manifiesto
  n_checked=$((n_checked+1))
  lf="$REPO_ROOT/$src"
  if [ ! -f "$lf" ]; then
    printf '   SIN-FUENTE  %s  (FALLA: el manifiesto cita un origen local inexistente)\n' "$src"
    parity_missing=$((parity_missing+1)); parity_bad=$((parity_bad+1)); continue
  fi
  want="$(sha_local "$lf")"
  got="$(rsh "[ -f '$dst' ] && sha256sum '$dst' | cut -d' ' -f1 || echo AUSENTE" 2>/dev/null | tr -d '[:space:]')"
  if [ "$want" = "$got" ]; then
    printf '   PARIDAD-OK  %s\n' "$dst"
  elif [ "$DRY" = "1" ] && [ "$got" = "AUSENTE" ]; then
    # [t35] En dry-run los ficheros NUEVOS del manifiesto aún no existen en el
    # VPS: se reportan como pendientes, no como paridad rota (el deploy los sube).
    printf '   PARIDAD-PENDIENTE (dry-run) %s\n' "$dst"
  else
    printf '   PARIDAD-ROTA %s (repo=%s remoto=%s)\n' "$dst" "${want:0:12}" "${got:0:12}"
    parity_bad=$((parity_bad+1))
  fi
done 3< <(manifest_rows)   # [t115]
if [ "$n_checked" -ne "$n_manifest" ]; then
  c_bad "   CONTEO ROTO: manifiesto=$n_manifest, comprobadas=$n_checked → VERIFY FALLA"
  exit 2
fi
if [ "$parity_bad" -ne 0 ]; then
  c_bad "   $parity_bad fichero(s) con paridad rota ($parity_missing sin fuente) → VERIFY FALLA → rollback"
  exit 2
fi
c_ok "   paridad completa: $n_checked/$n_manifest ficheros repo == remoto"

# ── [t35] SYNC SMOKE (solo deploy real; dry-run no tiene /sync desplegado) ───
if [ "$DRY" != "1" ] && [ -f "$DEPLOY_DIR/sync-smoke.js" ]; then
  c_hdr "SYNC SMOKE · /sync + /ara/events + /lists/"
  if ! SYNC_BASE="$BASE" SYNC_IP="$HOST_IP" SYNC_DEVICE_ID="${ARA_SYNC_DEVICE_ID:-onn4k-001}" \
       SYNC_KEY="${ARA_SYNC_VERIFY_KEY:-}" SYNC_KEY_ID="${ARA_SYNC_KEY_ID:-k1}" \
       SYNC_ARTIFACT_SHA="${ARA_SYNC_ARTIFACT_SHA256:-$(printf '0%.0s' $(seq 1 64))}" \
       SYNC_TOKEN="${ARA_VERIFY_TOKEN:-}" SYNC_LIVE_LIST="${LIVE_LIST_NAME:-}" \
       node "$DEPLOY_DIR/sync-smoke.js"; then
    c_bad "   sync-smoke falló (401/413/429/200/listas) → VERIFY FALLA"
    exit 4
  fi
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
