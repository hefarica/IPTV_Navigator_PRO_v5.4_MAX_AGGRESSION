#!/usr/bin/env node
// Valida cadenas de fallback de 4 capas en ape-profiles-config.js
// Doctrina "Beautiful Madness": cada header configurable debe tener
// mínimo 4 valores separados por coma (GOD_TIER,ELITE,BALANCED,COMPATIBLE).
// Excepciones: placeholders, IDs únicos, URLs canónicas, qfactor lists.

const path = require('path');
const CFG_PATH = path.resolve(
  __dirname,
  '../../../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js'
);

const EXEMPT_HEADERS = new Set([
  'X-Playback-Session-Id',
  'X-Device-Id',
  'X-Client-Timestamp',
  'X-Request-Id',
  'Origin',
  'Referer',
  'If-None-Match',
  'If-Modified-Since',
  'Range',
  'Host',
  'Authorization',
]);

const EXEMPT_VALUE_PATTERNS = [
  /^\[.*\]$/,    // [PLACEHOLDER]
  /^bytes=\d/,   // bytes=0-
  /^\*$/,        // wildcard
  /;q=\d/,       // qfactor (es;q=0.9)
];

function isExempt(header, value) {
  if (EXEMPT_HEADERS.has(header)) return true;
  if (typeof value !== 'string') return true;
  return EXEMPT_VALUE_PATTERNS.some((re) => re.test(value));
}

function countFallbacks(value) {
  if (typeof value !== 'string') return 0;
  return value.split(',').filter((v) => v.trim().length > 0).length;
}

global.window = {};
try {
  require(CFG_PATH);
} catch (err) {
  console.error('FAIL: ape-profiles-config.js no compila:');
  console.error(err.message);
  process.exit(2);
}

const cfg = global.window.APE_PROFILES_CONFIG;
if (!cfg) {
  console.error('FAIL: window.APE_PROFILES_CONFIG no se exportó.');
  process.exit(2);
}

const profiles = cfg.getAllProfiles ? cfg.getAllProfiles() : cfg;
if (!profiles || typeof profiles !== 'object') {
  console.error('FAIL: getAllProfiles() no retornó un objeto.');
  process.exit(2);
}

let totalViolations = 0;
const profileIds = Object.keys(profiles).sort();

profileIds.forEach((pid) => {
  const p = profiles[pid];
  const overrides = (p && p.headerOverrides) || {};
  const headers = Object.entries(overrides);
  const violations = [];
  let exempt = 0;
  let valid = 0;

  headers.forEach(([h, v]) => {
    if (isExempt(h, v)) {
      exempt++;
      return;
    }
    if (countFallbacks(v) < 4) {
      violations.push({ header: h, value: v, count: countFallbacks(v) });
    } else {
      valid++;
    }
  });

  const status = violations.length === 0 ? '\u2705' : '\u274C';
  console.log(
    `[${pid}] ${headers.length} headers \u2014 ${valid} con 4+ fallbacks \u2014 ${exempt} exentos \u2014 ${violations.length} violations ${status}`
  );
  violations.forEach((vi) => {
    console.log(`    ${vi.header}: "${vi.value}" (${vi.count} valores)`);
  });
  totalViolations += violations.length;
});

console.log('---');
console.log(`TOTAL violations: ${totalViolations}`);
process.exit(totalViolations > 0 ? 1 : 0);
