#!/usr/bin/env node
/** Static gate: app generator, index order, LAB contract and policy must agree. */
'use strict';
const fs = require('fs');
let pass = 0, total = 0;
function ok(name, cond, detail) {
  total++;
  if (cond) { pass++; console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  else console.log('FAIL ' + name + (detail ? ' · ' + detail : ''));
}
const root = 'IPTV_v5.4_MAX_AGGRESSION/frontend';
const idx = fs.readFileSync(root + '/index-v4.html', 'utf8');
const gen = fs.readFileSync(root + '/js/ape-v9/m3u8-typed-arrays-ultimate.js', 'utf8');
const law = fs.readFileSync(root + '/js/ape-v9/ape-continuity-law-v9.js', 'utf8');
const lab = fs.readFileSync(root + '/js/ape-v9/ape-profiles-config-v5.js', 'utf8');
const contract = JSON.parse(fs.readFileSync('contracts/streaming_continuity_contract.json', 'utf8'));
const policy = fs.readFileSync('docs/policies/STREAMING_CONTINUITY_LAW.md', 'utf8');

const iModule = idx.indexOf('ape-continuity-law-v9.js');
const iGen = idx.indexOf('src="js/ape-v9/m3u8-typed-arrays-ultimate.js');
ok('module loaded before generator', iModule >= 0 && iGen >= 0 && iModule < iGen, 'module=' + iModule + ' generator=' + iGen);
ok('generator has continuity helper', gen.includes('__apeContinuityTags'));
const injections = (gen.match(/__apeContinuityTags\(\)/g) || []).length;
ok('all header modes inject tags', injections >= 4, 'injections=' + injections);
ok('law module tags', law.includes('STREAMING_CONTINUITY_LAW_V1') && law.includes('CONTINUITY-RANGE:206'));
ok('LAB continuity contract', lab.includes('continuityLaw') && lab.includes('STREAMING_CONTINUITY_LAW_V1'));
ok('repo contract mandatory', contract.status === 'mandatory' && contract.segments.unique_per_session === true);
ok('policy exists', policy.includes('Artículo 1') && policy.includes('Artículo 11'));
ok('forbidden tokens documented', Array.isArray(contract.forbidden_tokens) && contract.forbidden_tokens.includes('4KFALSE'));

console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
if (pass !== total) process.exitCode = 1;
