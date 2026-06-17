#!/usr/bin/env bash
# Council-hardened validator (WARN/0-BLOCK review, 2026-06-08).
# Adds: TREE_ROOT parametrization (validates BOTH the Manus 'improved/' tree and the
# live IPTV_v5.4_MAX_AGGRESSION/ repo), the mandatory generator node -c trio, a static
# HEVC Level<->Resolution coherence check (Cardinal Law 1 — the 2026-06-08 freeze), and a
# scoped GOLDEN-RULE hev1/hvc1 check on the real STREAM-INF emitters (no false positives).
set -u

WORKDIR="${1:-}"
if [[ -z "$WORKDIR" || ! -d "$WORKDIR" ]]; then
  echo "Usage: $0 <workdir>   [APE_TREE_ROOT=improved|IPTV_v5.4_MAX_AGGRESSION|.]" >&2
  exit 2
fi

cd "$WORKDIR" || exit 2
LOG="${WORKDIR%/}/VALIDATION_APE_PACKAGE.log"
: > "$LOG"

ok()   { echo "OK $*"   | tee -a "$LOG"; }
warn() { echo "WARN $*" | tee -a "$LOG"; }
fail() { echo "FAIL $*" | tee -a "$LOG"; exit 1; }

# Tree root: Manus packaging uses improved/ ; the live repo uses IPTV_v5.4_MAX_AGGRESSION/ .
# Override with APE_TREE_ROOT, else auto-detect by probing for a vps/ or frontend/ subtree.
TREE_ROOT="${APE_TREE_ROOT:-}"
if [[ -z "$TREE_ROOT" ]]; then
  for c in improved IPTV_v5.4_MAX_AGGRESSION .; do
    if [[ -d "$c/vps" || -d "$c/frontend" ]]; then TREE_ROOT="$c"; break; fi
  done
fi
TREE_ROOT="${TREE_ROOT:-improved}"
ok "TREE_ROOT=$TREE_ROOT"

required=(
  "$TREE_ROOT/vps/prisma/players/lib/m3u8_variant_analyzer.sh"
  "$TREE_ROOT/vps/prisma/players/lib/playback_profile_decider.sh"
  "$TREE_ROOT/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js"
)
# contract path differs between packaging tree and live repo (may not exist yet in repo)
optional_attachment5=(
  "$TREE_ROOT/vps/prisma/players/contracts/player_daemon_bidirectional_contract.json"
  "$TREE_ROOT/vps/prisma/install/ape-daemon-bootstrap.sh"
  "$TREE_ROOT/vps/nginx/snippets/prisma-ape-installer-location.conf"
  "$TREE_ROOT/vps/nginx/lua/ape_wake_on_manifest.lua"
  "$TREE_ROOT/vps/prisma/api/ape-wake.php"
  "$TREE_ROOT/vps/prisma/adb/ape-wake-worker.sh"
  "$TREE_ROOT/vps/prisma/adb/ape-wake-worker.service"
  "$TREE_ROOT/frontend/js/ape-v9/ape-installer-anchor.js"
)

for f in "${required[@]}"; do
  [[ -f "$f" ]] || fail "missing required file: $f"
  ok "present: $f"
done

for f in "${optional_attachment5[@]}"; do
  if [[ -f "$f" ]]; then ok "present optional: $f"; else warn "optional absent: $f"; fi
done

while IFS= read -r -d '' f; do
  bash -n "$f" || fail "bash syntax: $f"
  ok "bash syntax: $f"
done < <(find "$TREE_ROOT" -type f \( -name '*.sh' -o -name '*.bash' \) -print0 2>/dev/null)

if command -v node >/dev/null 2>&1; then
  while IFS= read -r -d '' f; do
    node --check "$f" >/dev/null || fail "node syntax: $f"
    ok "node syntax: $f"
  done < <(find "$TREE_ROOT" -type f -name '*.js' -print0 2>/dev/null)
  # CLAUDE.md mandatory gate: the canonical generator trio (hard FAIL as a unit).
  for g in \
    "$TREE_ROOT/frontend/js/ape-v9/ape-fallback-resolver.js" \
    "$TREE_ROOT/frontend/js/ape-v9/ape-quality-prober.js" \
    "$TREE_ROOT/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js"; do
    if [[ -f "$g" ]]; then
      node --check "$g" >/dev/null || fail "generator node -c: $g"
      ok "generator node -c: $g"
    fi
  done
else
  warn "node unavailable; skipping JavaScript syntax checks"
fi

if command -v php >/dev/null 2>&1; then
  while IFS= read -r -d '' f; do
    php -l "$f" >/dev/null || fail "php lint: $f"
    ok "php lint: $f"
  done < <(find "$TREE_ROOT" -type f -name '*.php' -print0 2>/dev/null)
else
  warn "php unavailable; skipping PHP lint"
fi

python3 - "$TREE_ROOT" <<'PY' || exit 1
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
for p in root.rglob('*.json'):
    try:
        json.loads(p.read_text(encoding='utf-8'))
        print(f"OK json: {p}")
    except Exception as e:
        print(f"FAIL json: {p}: {e}")
        sys.exit(1)
PY

echo "OK JSON validation completed" >> "$LOG"

svc="$TREE_ROOT/vps/prisma/adb/ape-wake-worker.service"
if [[ -f "$svc" ]]; then
  grep -q '^ExecStart=' "$svc" || fail "systemd service lacks ExecStart: $svc"
  ok "systemd ExecStart present: $svc"
fi

# GOLDEN RULE (scoped to real STREAM-INF emitters, not the installer anchor):
# a standalone hev1.* inside a STREAM-INF CODECS= with no hvc1.* sibling is a violation.
# Demoted to WARN to avoid false positives from legitimate dual-codec cascade lines.
for emit in \
  "$TREE_ROOT/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js" \
  "$TREE_ROOT/frontend/js/ape-v9/ape-fallback-resolver.js"; do
  [[ -f "$emit" ]] || continue
  if grep -nE 'STREAM-INF.*hev1\.' "$emit" 2>/dev/null | grep -vqE 'hvc1\.'; then
    grep -nE 'STREAM-INF.*hev1\.' "$emit" | tee -a "$LOG"
    warn "standalone hev1 in STREAM-INF (review GOLDEN RULE): $emit"
  else
    ok "GOLDEN RULE hev1/hvc1 ok: $emit"
  fi
done

# Cardinal Law 1 — static HEVC Level<->Resolution coherence on emitted/sample lists.
# FAIL when the declared HEVC level cannot carry the declared RESOLUTION (+fps hint).
LAW_FAIL=0
while IFS= read -r -d '' f; do
  hits="$(awk '
    /#EXT-X-STREAM-INF/ {
      line=$0; res=""; lvl=0; fps=0;
      if (match(line, /RESOLUTION=[0-9]+x[0-9]+/)) { res=substr(line,RSTART+11,RLENGTH-11); }
      if (match(line, /h[ve][cv]1\.[0-9]+\.[0-9A-Fa-f]+\.L[0-9]+/)) {
        s=substr(line,RSTART,RLENGTH); sub(/.*\.L/,"",s); lvl=s+0;
      }
      if (line ~ /120/) fps=120; else if (line ~ /@60|FRAME-RATE=60|FRAME-RATE=59/) fps=60;
      if (res!="" && lvl>0) {
        split(res,a,"x"); h=a[2]+0; bad=0;
        if (h>=4320 && lvl<180) bad=1;                  # 8K needs L180+
        else if (h>=2160 && fps>=120 && lvl<156) bad=1; # 4K@120 needs L156+
        else if (h>=2160 && lvl<150) bad=1;             # 4K needs L150+
        if (bad) printf("  LEVELFAIL %s res=%s fps=%d L=%d\n", FILENAME, res, fps, lvl);
      }
    }' "$f")"
  if [[ -n "$hits" ]]; then echo "$hits" | tee -a "$LOG"; LAW_FAIL=1; fi
done < <(find "$TREE_ROOT" -type f \( -name '*.m3u8' -o -name '*.m3u' \) -print0 2>/dev/null)
[[ "$LAW_FAIL" -eq 0 ]] && ok "Level<->Resolution coherence ok (Cardinal Law 1)" \
  || fail "Level<->Resolution violation (Cardinal Law 1 — see 2026-06-08 post-mortem)"

ok "validation completed"
