#!/usr/bin/env bash
# ============================================================================
# deploy_vps.sh — Gated, idempotent CD orchestrator for IPTV-APE VPS
# ----------------------------------------------------------------------------
# Doctrine: iptv-vps-touch-nothing (backup + nginx -t + rollback + health),
#           iptv-omega-no-delete (atomic copy, NEVER --delete),
#           iptv-autopista-doctrine (no breaker/limit_req added by deploy),
#           SHIELDED (URLs verbatim — deploy copies files, never rewrites URLs).
#
# It ONLY touches paths listed in vps_deploy_map.json and ALWAYS refuses
# paths under "no_touch". Every run: pre-flight -> backup -> atomic push ->
# remote lint (php -l / nginx -t) -> reload -> health verify -> auto-rollback
# on any failure -> JSON log.
#
# Usage:
#   ./deploy_vps.sh --whatif                 # dry-run, prints plan, touches nothing
#   ./deploy_vps.sh --changed                # deploy only manifest entries whose src changed in git
#   ./deploy_vps.sh --only id1,id2           # deploy specific target ids
#   ./deploy_vps.sh --all                    # deploy all enabled targets
#   ./deploy_vps.sh --changed --yes          # skip the interactive confirm
#   Flags: --manifest PATH   --no-verify (skip health verify)   -h|--help
# ============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$SCRIPT_DIR/vps_deploy_map.json"
MODE=""            # changed | only | all
ONLY_IDS=""
WHATIF=0
ASSUME_YES=0
DO_VERIFY=1

c_red()  { printf '\033[31m%s\033[0m\n' "$*"; }
c_grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
c_yel()  { printf '\033[33m%s\033[0m\n' "$*"; }
die()    { c_red "FATAL: $*"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --whatif|-n) WHATIF=1 ;;
    --changed)   MODE="changed" ;;
    --all)       MODE="all" ;;
    --only)      MODE="only"; ONLY_IDS="${2:-}"; shift ;;
    --yes|-y)    ASSUME_YES=1 ;;
    --no-verify) DO_VERIFY=0 ;;
    --manifest)  MANIFEST="${2:-}"; shift ;;
    -h|--help)   grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
  shift
done

command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || die "python3 required to parse manifest"
PY="$(command -v python3 || command -v python)"
command -v ssh >/dev/null 2>&1 || die "ssh required"
command -v scp >/dev/null 2>&1 || die "scp required"
[ -f "$MANIFEST" ] || die "manifest not found: $MANIFEST"
[ -n "$MODE" ] || die "select a mode: --changed | --only id,.. | --all (or --whatif with one)"

# ---- read VPS config from manifest ----
SSH_TARGET="$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]))['vps']['ssh_target'])" "$MANIFEST")"
HEALTH_URL="$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]))['vps']['health_url'])" "$MANIFEST")"
MIN_FREE_MB="$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]))['vps']['min_free_mb'])" "$MANIFEST")"
ROLLBACK_ROOT="$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]))['vps']['rollback_root'])" "$MANIFEST")"
SSH_OPTS="-o ConnectTimeout=12 -o BatchMode=yes"

# ---- resolve target set as: id \t src \t dest \t type \t post ----
git_changed() { (cd "$REPO_ROOT" && { git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u); }
CHANGED_LIST="$(git_changed || true)"

mapfile -t ROWS < <("$PY" - "$MANIFEST" "$MODE" "$ONLY_IDS" <<'PYEOF' | tr -d '\r'
import json,sys
mani=json.load(open(sys.argv[1])); mode=sys.argv[2]; only=set(filter(None,sys.argv[3].split(',')))
nt=mani.get('no_touch',[])
for t in mani.get('targets',[]):
    if not t.get('enabled',False): continue
    if mode=='only' and t['id'] not in only: continue
    # no_touch guard
    if any(t['dest']==p or t['dest'].startswith(p.rstrip('/')+'/') for p in nt): continue
    print('\t'.join([t['id'],t['src'],t['dest'],t.get('type','file'),t.get('post','none')]))
PYEOF
)

# Filter by changed if requested
SELECTED=()
for row in "${ROWS[@]}"; do
  [ -z "$row" ] && continue
  IFS=$'\t' read -r id src dest type post <<<"$row"
  if [ "$MODE" = "changed" ]; then
    echo "$CHANGED_LIST" | grep -qxF "$src" || continue
  fi
  [ -f "$REPO_ROOT/$src" ] || { c_yel "skip $id: local src missing ($src)"; continue; }
  SELECTED+=("$row")
done

[ ${#SELECTED[@]} -gt 0 ] || die "no targets selected (mode=$MODE). Nothing to do."

echo "=========================================================="
echo " IPTV-APE VPS deploy  ·  target: $SSH_TARGET  ·  mode: $MODE"
echo "=========================================================="
printf '%-32s %-10s %s\n' "TARGET" "POST" "DEST"
for row in "${SELECTED[@]}"; do
  IFS=$'\t' read -r id src dest type post <<<"$row"
  printf '%-32s %-10s %s\n' "$id" "$post" "$dest"
done
echo "----------------------------------------------------------"

# ---- local validation gate (reuse the same logic CI runs) ----
c_yel ">> local validation gate"
LOCAL_FAIL=0
for row in "${SELECTED[@]}"; do
  IFS=$'\t' read -r id src dest type post <<<"$row"
  f="$REPO_ROOT/$src"
  case "$type" in
    php) if command -v php >/dev/null 2>&1; then php -l "$f" >/dev/null 2>&1 || { c_red "  php -l FAIL: $src"; LOCAL_FAIL=1; }; fi ;;
    json|nginx-conf) if [[ "$src" == *.json ]]; then "$PY" -m json.tool "$f" >/dev/null 2>&1 || { c_red "  json FAIL: $src"; LOCAL_FAIL=1; }; fi ;;
  esac
  [[ "$src" == *.js ]] && { node -c "$f" >/dev/null 2>&1 || { c_red "  node -c FAIL: $src"; LOCAL_FAIL=1; }; }
done
[ "$LOCAL_FAIL" -eq 0 ] && c_grn "  local gate PASS" || die "local validation failed — fix before deploy"

if [ "$WHATIF" -eq 1 ]; then
  c_yel ">> --whatif: no changes made. Pre-flight (read-only) follows:"
  ssh $SSH_OPTS "$SSH_TARGET" "df -Pm / | tail -1 | awk '{print \"  VPS / free MB: \"\$4\" (min required $MIN_FREE_MB)\"}'" 2>/dev/null || c_yel "  (ssh pre-flight unavailable)"
  curl -s -m 10 "$HEALTH_URL" 2>/dev/null | "$PY" -c "import sys,json;d=json.load(sys.stdin);print('  health:',d.get('status'),d.get('warnings'))" 2>/dev/null || true
  exit 0
fi

# ---- pre-flight (real run) ----
c_yel ">> pre-flight"
FREE_MB="$(ssh $SSH_OPTS "$SSH_TARGET" "df -Pm / | tail -1 | awk '{print \$4}'" 2>/dev/null || echo 0)"
[ "${FREE_MB:-0}" -ge "$MIN_FREE_MB" ] || die "VPS disk too low: ${FREE_MB}MB free < ${MIN_FREE_MB}MB required (free disk first)"
c_grn "  disk OK: ${FREE_MB}MB free"
BASE_HEALTH="$(curl -s -m 10 "$HEALTH_URL" 2>/dev/null | "$PY" -c "import sys,json;print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo unknown)"
echo "  baseline health: $BASE_HEALTH"

if [ "$ASSUME_YES" -ne 1 ]; then
  printf "Proceed with deploy of %d target(s) to %s? type 'yes': " "${#SELECTED[@]}" "$SSH_TARGET"
  read -r ans; [ "$ans" = "yes" ] || die "aborted by user"
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BK="$ROLLBACK_ROOT/$TS"
LOG="$REPO_ROOT/.agents/reports/deploy_${TS}.json"
mkdir -p "$REPO_ROOT/.agents/reports"
declare -a LOG_ROWS=()
NEEDS_NGINX=0
DEPLOYED=()

# ---- backup every existing dest ----
c_yel ">> backup -> $BK"
ssh $SSH_OPTS "$SSH_TARGET" "mkdir -p '$BK'" || die "cannot create backup dir"
for row in "${SELECTED[@]}"; do
  IFS=$'\t' read -r id src dest type post <<<"$row"
  ssh $SSH_OPTS "$SSH_TARGET" "test -f '$dest' && install -D '$dest' '$BK$dest' && echo backed || echo new" >/dev/null 2>&1
  [ "$post" = "nginx-reload" ] && NEEDS_NGINX=1
done
ssh $SSH_OPTS "$SSH_TARGET" "nginx -T > '$BK/nginx-T.dump' 2>&1 || true" >/dev/null 2>&1
c_grn "  backup ready"

rollback() {
  c_red ">> ROLLBACK from $BK"
  ssh $SSH_OPTS "$SSH_TARGET" "
    set -e
    for d in $1; do
      if [ -f '$BK'\$d ]; then cp -f '$BK'\$d \$d; else echo \"(no backup for \$d — was new, leaving in place)\"; fi
    done
    nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
  " 2>&1 | sed 's/^/   /'
}

# ---- atomic push (scp -> tmp -> mv), per target ----
c_yel ">> deploy (atomic, no --delete)"
PUSH_FAIL=0; ROLLBACK_DESTS=""
for row in "${SELECTED[@]}"; do
  IFS=$'\t' read -r id src dest type post <<<"$row"
  ROLLBACK_DESTS="$ROLLBACK_DESTS $dest"
  tmp="${dest}.deploytmp.${TS}"
  if scp $SSH_OPTS "$REPO_ROOT/$src" "$SSH_TARGET:$tmp" >/dev/null 2>&1 \
     && ssh $SSH_OPTS "$SSH_TARGET" "mkdir -p \"\$(dirname '$dest')\" && mv -f '$tmp' '$dest'" >/dev/null 2>&1; then
    # remote php lint immediately
    if [ "$type" = "php" ]; then
      if ! ssh $SSH_OPTS "$SSH_TARGET" "php -l '$dest' >/dev/null 2>&1"; then
        c_red "  php -l FAIL on VPS: $dest"; PUSH_FAIL=1; break
      fi
    fi
    c_grn "  ok  $id -> $dest"
    DEPLOYED+=("$dest"); LOG_ROWS+=("{\"id\":\"$id\",\"dest\":\"$dest\",\"status\":\"deployed\"}")
  else
    c_red "  PUSH FAIL: $id -> $dest"; PUSH_FAIL=1; break
  fi
done

if [ "$PUSH_FAIL" -eq 1 ]; then
  rollback "$ROLLBACK_DESTS"
  echo "{\"ts\":\"$TS\",\"result\":\"FAIL\",\"stage\":\"push\",\"backup\":\"$BK\",\"targets\":[$(IFS=,; echo "${LOG_ROWS[*]:-}")]}" > "$LOG"
  die "deploy failed at push/lint stage — rolled back. log: $LOG"
fi

# ---- nginx -t + reload (once) if any nginx/lua target ----
if [ "$NEEDS_NGINX" -eq 1 ]; then
  c_yel ">> nginx -t"
  if ssh $SSH_OPTS "$SSH_TARGET" "nginx -t >/dev/null 2>&1"; then
    ssh $SSH_OPTS "$SSH_TARGET" "systemctl reload nginx" && c_grn "  nginx reloaded"
  else
    c_red "  nginx -t FAILED"; rollback "$ROLLBACK_DESTS"
    echo "{\"ts\":\"$TS\",\"result\":\"FAIL\",\"stage\":\"nginx-t\",\"backup\":\"$BK\"}" > "$LOG"
    die "nginx -t failed — rolled back. log: $LOG"
  fi
fi

# ---- verify health ----
VERIFY_OK=1
if [ "$DO_VERIFY" -eq 1 ]; then
  c_yel ">> verify health"
  sleep 2
  NEW_HEALTH="$(curl -s -m 12 "$HEALTH_URL" 2>/dev/null | "$PY" -c "import sys,json;print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo unknown)"
  echo "  health now: $NEW_HEALTH (baseline was $BASE_HEALTH)"
  if [ "$NEW_HEALTH" = "critical" ] && [ "$BASE_HEALTH" != "critical" ]; then
    c_red "  health regressed to critical"; VERIFY_OK=0
  fi
fi

if [ "$VERIFY_OK" -ne 1 ]; then
  rollback "$ROLLBACK_DESTS"
  echo "{\"ts\":\"$TS\",\"result\":\"FAIL\",\"stage\":\"verify\",\"backup\":\"$BK\"}" > "$LOG"
  die "post-deploy verify failed — rolled back. log: $LOG"
fi

echo "{\"ts\":\"$TS\",\"result\":\"PASS\",\"backup\":\"$BK\",\"health_before\":\"$BASE_HEALTH\",\"health_after\":\"${NEW_HEALTH:-skipped}\",\"targets\":[$(IFS=,; echo "${LOG_ROWS[*]:-}")]}" > "$LOG"
c_grn "=========================================================="
c_grn " DEPLOY PASS · ${#DEPLOYED[@]} target(s) · backup: $BK"
c_grn " log: $LOG"
c_grn "=========================================================="
