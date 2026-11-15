#!/usr/bin/env bash
# ============================================================================
# CI gate — APE Visual Extreme Science-Safe (additive; non-destructive)
# Runs: linter (py_compile + adversarial fixtures), bash -n, Node harnesses,
# Lua structural smoke. Does NOT deploy, push, or reload nginx.
# Exit: 0 all pass, 1 any fail.  Tools missing are reported, not faked.
# ============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
Q="$ROOT/tools/quality"
LUADIR="$ROOT/IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua"
PY="$(command -v python || command -v python3)"
NODE="$(command -v node || true)"
fail=0
ok(){ echo "PASS  $1"; }
ko(){ echo "FAIL  $1"; fail=1; }
skip(){ echo "SKIP  $1 ($2)"; }

echo "== py_compile linter =="
if [ -n "$PY" ]; then "$PY" -m py_compile "$Q/hls_science_lint.py" && ok "py_compile" || ko "py_compile"; else skip "py_compile" "no python"; fi

echo "== bash -n scripts =="
for s in benchmark_vmaf_ab.sh ci_science_safe_checks.sh; do
  bash -n "$Q/$s" && ok "bash -n $s" || ko "bash -n $s"
done

echo "== linter fixtures (expect: clean PASS, bad_* BLOCK except no_avc=WARN) =="
if [ -n "$PY" ]; then
  "$PY" "$Q/hls_science_lint.py" "$Q/testdata/master_sample.m3u8" >/dev/null; [ $? -eq 0 ] && ok "clean manifest PASS" || ko "clean manifest"
  for f in bad_hev1_streaminf bad_4k_low_level bad_toxic_header bad_fake_lcevc bad_wrapped_url; do
    "$PY" "$Q/hls_science_lint.py" "$Q/testdata/$f.m3u8" >/dev/null; [ $? -eq 1 ] && ok "BLOCK $f" || ko "BLOCK $f"
  done
  "$PY" "$Q/hls_science_lint.py" "$Q/testdata/bad_no_avc_fallback.m3u8" >/dev/null; [ $? -eq 0 ] && ok "WARN no_avc (non-blocking)" || ko "WARN no_avc"
else skip "linter fixtures" "no python"; fi

echo "== Node harnesses =="
if [ -n "$NODE" ]; then
  "$NODE" "$Q/sandbox_harness.mjs" >/dev/null && ok "sandbox_harness" || ko "sandbox_harness"
  "$NODE" "$Q/reactor_harness.mjs" >/dev/null && ok "reactor_harness" || ko "reactor_harness"
else skip "Node harnesses" "no node"; fi

echo "== Lua structural smoke (LUAC_UNAVAILABLE if no luac) =="
if command -v luac >/dev/null 2>&1; then
  for f in combined_body_filter_visual_science_safe bandwidth_reactor_science_safe ape_profile_resolver_science_safe; do
    luac -p "$LUADIR/$f.lua" && ok "luac -p $f" || ko "luac -p $f"
  done
else
  skip "luac -p" "LUAC_UNAVAILABLE -> authoritative check on VPS (resty -e / luac -p)"
fi

echo "== additive guardrails =="
grep -q "purge" "$LUADIR/combined_body_filter_visual_science_safe.lua" && ko "no AVC purge present" || ok "no AVC purge"
[ -f "$LUADIR/combined_body_filter.lua" ] && ok "live body filter still present (OMEGA-NO-DELETE)" || ko "live body filter missing"

echo
[ "$fail" -eq 0 ] && echo "CI_RESULT: PASS" || echo "CI_RESULT: FAIL"
exit "$fail"
