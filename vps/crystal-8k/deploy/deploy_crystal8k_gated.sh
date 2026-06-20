#!/usr/bin/env bash
# deploy_crystal8k_gated.sh — GATED deployer for the Crystal v8.0 staged tree.
# Runs ON THE VPS. Honors iptv-vps-touch-nothing: backup -> lint -> nginx -t -> reload/restart -> rollback.
# DRY-RUN by default. Pass --apply to actually deploy. Pass --transcode to also deploy the service.
#
#   ./deploy_crystal8k_gated.sh            # dry-run (whatif) — shows what WOULD happen
#   ./deploy_crystal8k_gated.sh --apply    # deploy inline agents + overlay (NO transcode service)
#   ./deploy_crystal8k_gated.sh --apply --transcode   # also the async transcode service
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"   # vps/crystal-8k
TS="$(date +%Y%m%dT%H%M%SZ)"
BK="/root/.backups/crystal8k-$TS"
APPLY=0; TRANSCODE=0
for a in "$@"; do
  case "$a" in --apply) APPLY=1 ;; --transcode) TRANSCODE=1 ;; esac
done
WHATIF=$([ "$APPLY" -eq 1 ] && echo "" || echo "[WHATIF] ")

# no_touch guard — never overwrite hand-maintained live files.
NO_TOUCH="/etc/nginx/conf.d/iptv-intercept.conf /etc/nginx/conf.d/iptv-intercept-final.conf"

log(){ echo "${WHATIF}$*"; }
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else echo "${WHATIF}would: $*"; fi; }

echo "=== Crystal v8.0 gated deploy ($([ "$APPLY" -eq 1 ] && echo APPLY || echo DRY-RUN)) ==="
mkdir -p "$BK"

# ── 1. Validate everything we are about to ship (fail closed) ────────────────
echo "--- validate ---"
command -v lua5.1 >/dev/null 2>&1 && LUA=lua5.1 || LUA=luajit
for f in "$SRC"/agents/*.lua; do
  $LUA -e "assert(loadfile([[$f]]))" && echo "lua OK $(basename "$f")"
done
for f in "$SRC"/agents/*.php; do php -l "$f" >/dev/null && echo "php OK $(basename "$f")"; done
python3 -m json.tool "$SRC/config/codec-cascade-8k-extreme.json" >/dev/null && echo "json OK cascade"
python3 -m json.tool "$SRC/transcode/crystal_transcode_control.json" >/dev/null && echo "json OK control"
python3 -m py_compile "$SRC"/transcode/*.py && echo "py OK transcode"

# ── 2. Deploy inline Lua agents -> /etc/nginx/lua/ ───────────────────────────
echo "--- nginx lua agents ---"
for f in "$SRC"/agents/*.lua; do
  dst="/etc/nginx/lua/$(basename "$f")"
  [ -f "$dst" ] && run "cp -a '$dst' '$BK/'"
  run "install -D '$f' '$dst'"
done

# ── 3. Deploy PHP -> /var/www/html/ ──────────────────────────────────────────
echo "--- php ---"
for f in "$SRC"/agents/*.php; do
  dst="/var/www/html/$(basename "$f")"
  [ -f "$dst" ] && run "cp -a '$dst' '$BK/'"
  run "install -D '$f' '$dst'"
done

# ── 4. Deploy overlay conf (guard no_touch) ──────────────────────────────────
echo "--- overlay conf ---"
OV="/etc/nginx/conf.d/ape-crystal-8k-overlay.conf"
if echo "$NO_TOUCH" | grep -qw "$OV"; then
  echo "SKIP $OV (no_touch — hand-maintained)"
else
  [ -f "$OV" ] && run "cp -a '$OV' '$BK/'"
  run "install -D '$SRC/conf.d/ape-crystal-8k-overlay.conf' '$OV'"
fi

# ── 5. Optional transcode service ────────────────────────────────────────────
if [ "$TRANSCODE" -eq 1 ]; then
  echo "--- transcode service ---"
  echo "preflight (GPU) BEFORE enabling any channel:"; run "bash '$SRC/deploy/preflight_gpu_check.sh' || true"
  run "install -D '$SRC/transcode/ape_pixel_processor.py'  /opt/ape-api-server/crystal/ape_pixel_processor.py"
  run "install -D '$SRC/transcode/ape_hdr_color_science.py' /opt/ape-api-server/crystal/ape_hdr_color_science.py"
  [ -f /etc/ape/crystal_transcode_control.json ] && run "cp -a /etc/ape/crystal_transcode_control.json '$BK/'"
  run "install -D '$SRC/transcode/crystal_transcode_control.json' /etc/ape/crystal_transcode_control.json"
  run "install -D '$SRC/transcode/ape-crystal-transcode.service' /etc/systemd/system/ape-crystal-transcode.service"
  run "systemctl daemon-reload"
  echo "NOTE: all channels ship enabled=false. Service is a no-op until you flag a flagship channel."
fi

# ── 6. nginx -t then reload (Lua/conf changes); transcode service restart ─────
echo "--- validate + reload ---"
run "nginx -t"
# Lua *_by_lua_file edits require RESTART (lua_code_cache law); plain conf can reload.
run "systemctl restart nginx"          # restart (not reload) because Lua modules changed
[ "$TRANSCODE" -eq 1 ] && run "systemctl enable --now ape-crystal-transcode"

echo
echo "=== done. Backups in $BK ==="
echo "ROLLBACK: cp -a $BK/* to their targets; nginx -t; systemctl restart nginx; (systemctl disable --now ape-crystal-transcode)"
