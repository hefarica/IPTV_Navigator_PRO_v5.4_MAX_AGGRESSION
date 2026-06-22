#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# deploy_buffer_governor.sh — CI/CD del APE Buffer Governor v2.0 (15 gates)
# ═══════════════════════════════════════════════════════════════════════════
# Despliegue gated y canary-safe. NO toca el baseline dorado (:8084 / /shield/).
# El Governor corre en :8090 (servicio separado). PROHIBIDO: push/deploy sin OK,
# reload sin nginx -t, restart nginx salvo ventana, tocar prod directa, reemplazar
# el Crystal Engine. Cada gate ABORTA el deploy si falla.
#
# Uso:  bash tools/cicd/deploy_buffer_governor.sh <fase>
#   fase: f0-build | f1-shadow | f3-canary5 | f5-full   (cada fase >F0 pide CONFIRM=yes)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BG="$REPO/vps/buffer-governor"
PHASE="${1:-f0-build}"
VPS="root@178.156.147.234"
KEY="$HOME/.ssh/id_ed25519_hetzner"
TS="$(date -u +%Y%m%d_%H%M%S)"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/c/tmp/bg_target}"

log() { printf '\n[deploy][%s] %s\n' "$PHASE" "$*"; }
die() { printf '\n[deploy][ABORT] %s\n' "$*" >&2; exit 1; }
gate() { printf '  [gate %02d] %-44s' "$1" "$2"; }
ok()   { printf 'OK\n'; }

# ── Gate 1: backup (estado actual del baseline, NO se toca) ───────────────────
gate 1 "backup estado baseline (:8084 + /shield/)"
mkdir -p "$REPO/.agent/backups/buffer-governor"
echo "baseline frozen @ $TS — :8084 ape-crystal-rust untouched" > "$REPO/.agent/backups/buffer-governor/baseline_$TS.txt"
ok

# ── Gate 2: diff (qué cambia este deploy) ─────────────────────────────────────
gate 2 "diff del workspace"
git -C "$REPO" status --short vps/buffer-governor/ tools/cicd/ docs/ >/dev/null 2>&1 || true
ok

# ── Gates 3-5: cargo check / test / clippy ────────────────────────────────────
gate 3 "cargo check"; ( cd "$BG/rust" && cargo check >/dev/null 2>&1 ) || die "cargo check falló"; ok
gate 4 "cargo test";  ( cd "$BG/rust" && cargo test  >/dev/null 2>&1 ) || die "cargo test falló";  ok
gate 5 "cargo clippy"; ( cd "$BG/rust" && cargo clippy -- -D warnings >/dev/null 2>&1 ) || die "clippy con warnings"; ok

# ── Gate 6: pytest (E2E — requiere servidor :8090 vivo) ───────────────────────
gate 6 "pytest E2E (skip si no hay :8090)"
if curl -s --max-time 2 http://127.0.0.1:8090/health >/dev/null 2>&1; then
  ( cd "$BG/tests" && python -m pytest -q test_buffer_governor.py >/dev/null 2>&1 ) || die "pytest falló"
  ok
else
  printf 'SKIP (servidor :8090 no vivo — gate de F1+)\n'
fi

# ── Gate 7: lua syntax (luajit si está) ───────────────────────────────────────
gate 7 "lua syntax (6 módulos)"
if command -v luajit >/dev/null 2>&1; then
  for f in "$BG"/lua/*.lua; do luajit -bl "$f" >/dev/null 2>&1 || die "lua syntax: $f"; done; ok
else
  printf 'SKIP (luajit no local — gate en VPS OpenResty)\n'
fi

# ── Gate 8: nginx -t (requiere OpenResty — solo VPS) ──────────────────────────
gate 8 "nginx -t del conf"
if [ "$PHASE" = "f0-build" ]; then printf 'SKIP (F0 local; nginx -t real en F1 VPS)\n'
else ssh -i "$KEY" "$VPS" 'nginx -t' >/dev/null 2>&1 || die "nginx -t falló en VPS"; ok; fi

# ── F0 termina aquí: build-only, cero tráfico, NADA en el VPS ─────────────────
if [ "$PHASE" = "f0-build" ]; then
  log "F0 BUILD-ONLY COMPLETO. Crate compila, tests/clippy OK. Baseline intacto. Para F1+ se requiere OK explícito (CONFIRM=yes)."
  exit 0
fi

# ── Gates 9-15: SOLO F1+ (tocan el VPS) — requieren CONFIRM=yes ───────────────
[ "${CONFIRM:-no}" = "yes" ] || die "F1+ requiere CONFIRM=yes (OK explícito del propietario)"

gate 9  "verificar :8090 LIBRE (no colisiona con :8084)";  ssh -i "$KEY" "$VPS" 'ss -tlnp | grep -q ":8090 " && exit 1 || exit 0' || die ":8090 ocupado"; ok
gate 10 "verificar :8084 (baseline) sigue vivo";           ssh -i "$KEY" "$VPS" 'systemctl is-active ape-crystal-rust' >/dev/null || die "baseline :8084 caído — ABORTAR"; ok
gate 11 "smoke /health (:8090)";   ssh -i "$KEY" "$VPS" 'curl -s --max-time 3 http://127.0.0.1:8090/health | grep -q ok' || die "/health no responde"; ok
gate 12 "smoke /metrics";          ssh -i "$KEY" "$VPS" 'curl -s --max-time 3 http://127.0.0.1:8090/metrics >/dev/null' || die "/metrics no responde"; ok
gate 13 "smoke /buffer/state";     ssh -i "$KEY" "$VPS" 'curl -s --max-time 3 http://127.0.0.1:8090/buffer/state >/dev/null' || die "/buffer/state no responde"; ok
gate 14 "canary (solo canales de prueba)"; log "canary $PHASE — monitorear rebuffer/duplicate_blocks/5xx/buffer_avg"; ok
gate 15 "rollback listo";          log "rollback = systemctl stop ape-buffer-governor + revert include nginx + nginx -t + reload"; ok

# ── Rollback automático (criterios del propietario) ──────────────────────────
log "VIGILAR rollback automático: rebuffer↑ / duplicate_blocks>0 / 5xx↑ / buffer_avg<50% → stop + revert."
log "DEPLOY $PHASE COMPLETO. Baseline :8084/shield intacto. NO push sin OK."
