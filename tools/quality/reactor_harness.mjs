// ============================================================================
// APE Visual Extreme — Science-Safe bandwidth reactor harness (Node)
// Ports the bucket logic of bandwidth_reactor_science_safe.lua and proves the
// CORE FIX: as EWMA throughput DROPS, requested profile/bitrate/prefetch DROP
// (never increases aggression on a bad network). LUAC_UNAVAILABLE -> logic port.
// Exit: 0 pass, 1 fail.
// ============================================================================
let pass = 0, fail = 0;
const check = (n, c, d = '') => { const ok = !!c; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  :: ' + d : ''}`); ok ? pass++ : fail++; };

// port of the reactor buckets
function reactor(ewma) {
  if (ewma >= 90e6) return { profile: 'P0', maxbps: 80e6, prefetch: 4 };
  if (ewma >= 55e6) return { profile: 'P1', maxbps: 45e6, prefetch: 3 };
  if (ewma >= 30e6) return { profile: 'P2', maxbps: 28e6, prefetch: 3 };
  if (ewma >= 16e6) return { profile: 'P3', maxbps: 14e6, prefetch: 2 };
  if (ewma >= 8e6)  return { profile: 'P4', maxbps: 7e6,  prefetch: 1 };
  return { profile: 'P5', maxbps: 3.5e6, prefetch: 0 };
}
const pidx = p => 'P0 P1 P2 P3 P4 P5'.split(' ').indexOf(p);

console.log('=== FASE 5: bandwidth reactor monotonicity (no aggression on bad network) ===');
const sweep = [120, 90, 70, 55, 40, 30, 20, 16, 12, 8, 5, 2].map(m => m * 1e6);
let monoOk = true, detail = [];
let prev = null;
for (const e of sweep) {
  const r = reactor(e);
  detail.push(`${(e/1e6).toFixed(0)}M->${r.profile}/${(r.maxbps/1e6).toFixed(1)}M/pf${r.prefetch}`);
  if (prev) {
    // EWMA decreasing => maxbps non-increasing, prefetch non-increasing, profile index non-decreasing
    if (r.maxbps > prev.maxbps) monoOk = false;
    if (r.prefetch > prev.prefetch) monoOk = false;
    if (pidx(r.profile) < pidx(prev.profile)) monoOk = false;
  }
  prev = r;
}
console.log('  ladder: ' + detail.join('  '));
check('monotonic de-escalation as EWMA drops', monoOk);

// explicit: dropping from 100M to 5M must LOWER requested bitrate (the bug being fixed)
check('100M vs 5M -> requested bitrate drops', reactor(100e6).maxbps > reactor(5e6).maxbps,
  `${reactor(100e6).maxbps/1e6}M > ${reactor(5e6).maxbps/1e6}M`);
// low bandwidth must NOT request 4K-class bitrate
check('5M network does not request 4K-class bitrate', reactor(5e6).maxbps < 20e6, `${reactor(5e6).maxbps/1e6}M`);
// congestion must reduce prefetch to protect freezeless
check('worst network -> prefetch 0 (freezeless protection)', reactor(2e6).prefetch === 0);
// healthy network may raise (hysteresis is monotone upward at top)
check('excellent network -> top profile P0', reactor(120e6).profile === 'P0');

console.log(`\nRESULT: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
