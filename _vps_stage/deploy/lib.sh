#!/usr/bin/env bash
# lib.sh — constantes y helpers comunes del pipeline. NO ejecuta nada por sí solo.
set -uo pipefail
export LC_ALL=C
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/../.." && pwd)"
MANIFEST="$DEPLOY_DIR/manifest.tsv"
SNAP_DIR="$DEPLOY_DIR/snapshots"
# Host: se toma de variables de entorno para no hardcodear credenciales ni IPs.
VPS_HOST="${VPS_HOST:-root@178.156.147.234}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REMOTE_BACKUP_ROOT="/var/backups/ape-deploy"

c_ok(){ printf '\033[32m%s\033[0m\n' "$*"; }
c_bad(){ printf '\033[31m%s\033[0m\n' "$*"; }
c_warn(){ printf '\033[33m%s\033[0m\n' "$*"; }
c_hdr(){ printf '\n\033[1m== %s\033[0m\n' "$*"; }

SSH_BIN="${SSH_BIN:-ssh}"
rsh(){ "$SSH_BIN" "${SSH_OPTS[@]}" "$VPS_HOST" "$@"; }

# Lee el manifiesto y emite: origen<TAB>destino<TAB>modo<TAB>propietario<TAB>nota
manifest_rows(){
  [ -f "$MANIFEST" ] || { c_bad "FATAL: falta $MANIFEST"; return 3; }
  grep -vE '^\s*(#|$)' "$MANIFEST"
}

# sha256 local: usa sha256sum si existe (Linux/WSL) y cae a node como respaldo.
sha_local() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    else
        node "$DEPLOY_DIR/sha256.js" "$1"
    fi
}
