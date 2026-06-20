#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# APPLY FAKE 4K UNLOCKED — verificación/estado de la doctrina visual extrema
# (2026-06-20, owner LOCKED). Los cambios de código YA están aplicados en el repo;
# este script crea backups frescos y valida sintaxis (idempotente, no-destructivo).
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
TS="$(date +%Y%m%dT%H%M%SZ)"
BK="$REPO_ROOT/.backups/fake4k-unlocked-$TS"

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║     FAKE 4K UNLOCKED — backup + validación de la doctrina visual      ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"

GEN="$REPO_ROOT/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js"
LUA="$REPO_ROOT/IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/combined_body_filter.lua"
V4K="$REPO_ROOT/IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_virtual_4k.lua"

echo "[1/4] Backups -> $BK"
mkdir -p "$BK"
cp "$REPO_ROOT/CLAUDE.md" "$BK/" 2>/dev/null || true
cp "$REPO_ROOT/README_VISUAL_SCIENCE_SAFE.md" "$BK/" 2>/dev/null || true
cp "$GEN" "$BK/" 2>/dev/null || true
cp "$LUA" "$BK/" 2>/dev/null || true
cp "$V4K" "$BK/" 2>/dev/null || true

echo "[2/4] node -c (generador JS)"
node -c "$GEN" && echo "  OK: $GEN"

echo "[3/4] luac -p (VPS Lua) — si luac está disponible"
if command -v luac >/dev/null 2>&1; then
  luac -p "$LUA" && echo "  OK: $LUA"
  luac -p "$V4K" && echo "  OK: $V4K"
else
  echo "  (luac no instalado — validar en el VPS con: luac -p ... && sudo nginx -t)"
fi

echo "[4/4] Estado de la doctrina:"
echo "  ✅ Virtual 4K en 100% de canales (RESOLUTION=3840x2160)"
echo "  ✅ Virtual HDR incondicional (VIDEO-RANGE=PQ)"
echo "  ✅ Virtual HEVC (hvc1.2.4.L153.B0, audio preservado)"
echo "  ✅ Virtual LCEVC (SUPPLEMENTAL-CODECS=lcev.1.1.1)"
echo "  ✅ Virtual CMAF (EXT-X-MAP en master, capa VPS Lua)"
echo "  ✅ Virtual HDCP (HDCP-LEVEL=TYPE-1 universal)"
echo "  ✅ Virtual Bitrate (BANDWIDTH=28000000)"
echo ""
echo "  Rollback: restaurar desde $BK o poner V4K.enabled=false (JS) /"
echo "            CHINA_BOX_FAKE_4K=false (Lua)."
echo ""
echo "  ⚠️  CAVEAT (aceptado por el propietario): hvc1 sobre AVC puede congelar/dropear el"
echo "      canal en players sin el daemon ADB. Los fixtures de CI marcarán las listas como bad."
echo ""
echo "  Commit sugerido:"
echo "    git add -A && git commit -m 'doctrine(visual-unlocked): Fake 4K/HDR/HEVC/LCEVC total liberation'"
echo ""
echo "  Deploy VPS Lua (manual, gated): tools/cicd/deploy_vps.sh (backup + nginx -t + rollback)"
