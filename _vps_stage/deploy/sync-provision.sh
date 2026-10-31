#!/usr/bin/env bash
# sync-provision.sh — provisiona el estado de `/sync` en el VPS (t35).
#
# Sin secretos hardcodeados: la clave HMAC y la identidad del artefacto se
# inyectan por entorno (GitHub Environment/secret o export manual del owner).
#
#   ARA_SYNC_KEY             64 hex lowercase (obligatoria para habilitar 200)
#   ARA_SYNC_KEY_ID          id de clave (default: k1)
#   ARA_SYNC_DEVICE_IDS      lista separada por comas de device_id ligados
#   ARA_SYNC_ARTIFACT_SHA256 sha256 de la generación servida
#   ARA_SYNC_GENERATION_ID   generation_id (R1)
#   ARA_SYNC_LIST_VERSION    list_version (R1)
#   ARA_SYNC_LAB_EXPORTED_AT timestamp ISO/opaco del LAB SSOT
#
# Modo:
#   --apply   crea dirs, aplica la migración SQL y escribe key/artifact
#   (sin --apply) solo imprime el plan; no toca el VPS.
#
# Si falta ARA_SYNC_KEY o ARA_SYNC_ARTIFACT_SHA256: el deploy ABORTA y hace
# rollback (no se habilita /sync a medias ni se inventa una clave). El secreto
# se inyecta desde el Environment `production` con aprobación del owner.
#
# Sin --apply solo imprime el plan; no toca el VPS.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

APPLY=0
for a in "$@"; do [ "$a" = "--apply" ] && APPLY=1; done

KEY="${ARA_SYNC_KEY:-}"
KEY_ID="${ARA_SYNC_KEY_ID:-k1}"
DEVICE_IDS="${ARA_SYNC_DEVICE_IDS:-}"
ART_SHA="${ARA_SYNC_ARTIFACT_SHA256:-}"
ART_GEN="${ARA_SYNC_GENERATION_ID:-}"
ART_LIST="${ARA_SYNC_LIST_VERSION:-}"
ART_EXPORTED="${ARA_SYNC_LAB_EXPORTED_AT:-}"

c_hdr "SYNC PROVISION · $(date -u +%FT%TZ) · apply=$APPLY"
if [ "$APPLY" -ne 1 ]; then
  c_warn "   SIMULACIÓN: no se escribe nada. Para aplicar: $0 --apply"
fi

# Validación estricta ANTES de tocar el VPS.
if [ -n "$KEY" ] && ! printf '%s' "$KEY" | grep -qE '^[a-f0-9]{64}$'; then
  c_bad "   ARA_SYNC_KEY inválida: se esperan 64 hex lowercase"; exit 2
fi
if [ -n "$KEY" ] && ! printf '%s' "$KEY_ID" | grep -qE '^[A-Za-z0-9._-]{1,32}$'; then
  c_bad "   ARA_SYNC_KEY_ID inválido"; exit 2
fi
if [ -n "$KEY" ] && ! printf '%s' "$DEVICE_IDS" | grep -qE '^[A-Za-z0-9._-]+(,[A-Za-z0-9._-]+)*$'; then
  c_bad "   ARA_SYNC_DEVICE_IDS vacío o inválido (device_ids:null está prohibido)"; exit 2
fi
if [ -n "$ART_SHA" ] && ! printf '%s' "$ART_SHA" | grep -qE '^[a-f0-9]{64}$'; then
  c_bad "   ARA_SYNC_ARTIFACT_SHA256 inválido"; exit 2
fi

if [ "$APPLY" -ne 1 ]; then
  printf '   dirs: /etc/ara-x (0750 root:www-data) · /var/lib/ara-x (0750 www-data:www-data)\n'
  printf '   sql : _vps_stage/sql/ara_sync.sql → /var/lib/ara-x/sync.db\n'
  [ -n "$KEY" ] && printf '   key : key_id=%s device_ids=%s → /etc/ara-x/sync-keys.json (0600 www-data)\n' "$KEY_ID" "$DEVICE_IDS" \
                 || printf '   key : FALTA ARA_SYNC_KEY → el deploy abortará con rollback\n'
  [ -n "$ART_SHA" ] && printf '   ref : %s… → /etc/ara-x/artifact.json (0600)\n' "${ART_SHA:0:12}" \
                     || printf '   ref : FALTA ARA_SYNC_ARTIFACT_SHA256 → el deploy abortará con rollback\n'
  exit 0
fi

# 1 · dirs (el install de staging necesita que existan).
rsh "install -d -m 0750 -o root -g www-data /etc/ara-x && install -d -m 0750 -o www-data -g www-data /var/lib/ara-x" \
  || { c_bad "   no se pudieron crear /etc/ara-x y /var/lib/ara-x"; exit 3; }

# 2 · migración SQL (idempotente). Si sqlite3 no está, el PHP la aplica al primer request.
if rsh "command -v sqlite3 >/dev/null 2>&1"; then
  rsh "sqlite3 /var/lib/ara-x/sync.db" < "$REPO_ROOT/_vps_stage/sql/ara_sync.sql" \
    || { c_bad "   migración SQL falló"; exit 4; }
  rsh "chmod 0600 /var/lib/ara-x/sync.db && chown www-data:www-data /var/lib/ara-x/sync.db" || true
  c_ok "   migración SQL aplicada (ara_sync_state/nonce/replay/keys)"
else
  c_warn "   sqlite3 ausente: el PHP creará las tablas IF NOT EXISTS al primer request"
fi

# 3 · key store: OBLIGATORIA para declarar `/sync` operativo. Nunca hardcode.
if [ -n "$KEY" ]; then
  jids="$(printf '%s' "$DEVICE_IDS" | sed 's/,/","/g')"
  json="$(printf '{"keys":{"%s":{"secret":"%s","device_ids":["%s"],"created_at":%s,"retires_at":null}}}' \
    "$KEY_ID" "$KEY" "$jids" "$(date +%s)")"
  rsh "cat > /tmp/ara-sync-keys.json.$$" <<< "$json" \
    || { c_bad "   no se pudo subir el key store"; exit 5; }
  rsh "install -m 0600 -o www-data -g www-data /tmp/ara-sync-keys.json.$$ /etc/ara-x/sync-keys.json && rm -f /tmp/ara-sync-keys.json.$$" \
    || { c_bad "   no se pudo instalar /etc/ara-x/sync-keys.json"; exit 5; }
  c_ok "   key store instalado (0600 www-data, key_id=$KEY_ID)"
else
  c_bad "   FALTA ARA_SYNC_KEY (Environment/secret): no se despliega /sync sin clave; usa dry-run o inyecta el secreto."
  exit 7
fi

# 4 · identidad del artefacto (R1). Sin ella, /sync no puede responder 200.
if [ -n "$ART_SHA" ]; then
  ref="$(printf '{"artifact_sha256":"%s","generation_id":"%s","list_version":"%s","lab_exported_at":"%s"}' \
    "$ART_SHA" "${ART_GEN:-unknown}" "${ART_LIST:-unknown}" "${ART_EXPORTED:-unknown}")"
  rsh "cat > /tmp/ara-sync-artifact.json.$$" <<< "$ref" || exit 6
  rsh "install -m 0600 -o www-data -g www-data /tmp/ara-sync-artifact.json.$$ /etc/ara-x/artifact.json && rm -f /tmp/ara-sync-artifact.json.$$" \
    || { c_bad "   no se pudo instalar artifact.json"; exit 6; }
  c_ok "   artifact.json instalado (0600 www-data)"
else
  c_bad "   FALTA ARA_SYNC_ARTIFACT_SHA256 (R1): no se despliega /sync sin identidad de artefacto."
  exit 8
fi

c_ok "   SYNC PROVISION OK (sin secretos en repo; nada tocado fuera de /etc/ara-x y /var/lib/ara-x)"
exit 0
