#!/usr/bin/env bash
# ============================================================================
# validate_local.sh — doctrine + syntax gate. Same logic CI runs and the CD
# orchestrator mirrors locally. Touches NOTHING (read-only). Exit 0 = PASS.
#
# Usage:
#   ./validate_local.sh                 # generator trio + git-changed files
#   ./validate_local.sh path1 path2 ..  # explicit files
#   ./validate_local.sh --all-tracked   # every tracked source file (slow)
# ============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
PY="$(command -v python3 || command -v python)"
FAIL=0
red(){ printf '\033[31m%s\033[0m\n' "$*"; }
grn(){ printf '\033[32m%s\033[0m\n' "$*"; }
yel(){ printf '\033[33m%s\033[0m\n' "$*"; }

GEN_TRIO=(
  "IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-fallback-resolver.js"
  "IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-quality-prober.js"
  "IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js"
)

# Generated artifacts / vendored trees are NOT source — never gate them by default.
EXCLUDE='\.agents/reports/|node_modules/|/vendor/|backup_master|\.pytest_cache/'

# ---- build file list ----
FILES=()
if [ $# -gt 0 ] && [ "$1" = "--all-tracked" ]; then
  mapfile -t FILES < <(git ls-files '*.js' '*.php' '*.py' '*.sh' '*.json' '*.m3u8' 2>/dev/null | grep -vE "$EXCLUDE")
elif [ $# -gt 0 ]; then
  FILES=("$@")   # explicit files are validated as-is (no exclusions)
else
  for f in "${GEN_TRIO[@]}"; do [ -f "$f" ] && FILES+=("$f"); done
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    echo "$f" | grep -qE "$EXCLUDE" && continue
    case "$f" in *.js|*.php|*.py|*.sh|*.json|*.m3u8) FILES+=("$f");; esac
  done < <({ git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u)
fi
# de-dup
mapfile -t FILES < <(printf '%s\n' "${FILES[@]}" | awk 'NF' | sort -u)
[ ${#FILES[@]} -gt 0 ] || { yel "no files to validate"; exit 0; }

yel ">> validating ${#FILES[@]} file(s)"
TOXIC='Range:|If-None-Match:|If-Modified-Since:|TE:[[:space:]]*trailers|Priority:[[:space:]]*u=|Upgrade-Insecure-Requests'

for f in "${FILES[@]}"; do
  [ -f "$f" ] || { red "  missing: $f"; FAIL=1; continue; }
  case "$f" in
    *.js)
      if command -v node >/dev/null 2>&1; then
        node -c "$f" 2>/dev/null && grn "  node -c  OK   $f" || { red "  node -c  FAIL $f"; FAIL=1; }
      else yel "  (node absent — skip $f)"; fi ;;
    *.php)
      if command -v php >/dev/null 2>&1; then
        php -l "$f" >/dev/null 2>&1 && grn "  php -l   OK   $f" || { red "  php -l   FAIL $f"; FAIL=1; }
      else yel "  (php absent — skip $f)"; fi ;;
    *.py)
      "$PY" -m py_compile "$f" 2>/dev/null && grn "  pycomp   OK   $f" || { red "  pycomp   FAIL $f"; FAIL=1; } ;;
    *.sh)
      bash -n "$f" 2>/dev/null && grn "  bash -n  OK   $f" || { red "  bash -n  FAIL $f"; FAIL=1; } ;;
    *.json)
      "$PY" -m json.tool "$f" >/dev/null 2>&1 && grn "  json     OK   $f" || { red "  json     FAIL $f"; FAIL=1; } ;;
    *.m3u8)
      # doctrine gates only meaningful on emitted playlists
      head -1 "$f" | grep -q '#EXTM3U' || { red "  m3u8 no #EXTM3U header: $f"; FAIL=1; }
      if grep -nE "$TOXIC" "$f" >/dev/null 2>&1; then red "  TOXIC HEADER in $f:"; grep -nE "$TOXIC" "$f" | sed 's/^/      /'; FAIL=1; fi
      # GOLDEN RULE: hev1.* must NOT appear inside a STREAM-INF CODECS= line
      if grep -nE '#EXT-X-STREAM-INF' "$f" | grep -q 'hev1\.'; then red "  GOLDEN RULE violation (hev1 in STREAM-INF): $f"; FAIL=1; fi
      grn "  m3u8 doctrine checked: $f" ;;
    *) yel "  (no validator for $f)";;
  esac
done

echo "----------------------------------------------------------"
[ "$FAIL" -eq 0 ] && { grn "VALIDATION PASS"; exit 0; } || { red "VALIDATION FAIL"; exit 1; }
