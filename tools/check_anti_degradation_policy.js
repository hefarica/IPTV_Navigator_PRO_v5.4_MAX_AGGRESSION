#!/usr/bin/env node
/** Static gate for the anti-degradation law. */
'use strict';
const fs = require('fs');
let pass = 0, total = 0;
function ok(name, cond, detail) {
  total++;
  if (cond) { pass++; console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  else console.log('FAIL ' + name + (detail ? ' · ' + detail : ''));
}
const law = fs.readFileSync('docs/policies/ANTI_DEGRADATION_LAW.md', 'utf8');
const contract = JSON.parse(fs.readFileSync('contracts/anti_degradation_contract.json', 'utf8'));
const agents = fs.readFileSync('AGENTS.md', 'utf8');
ok('law exists', law.includes('LEY ANTI-DEGRADACIÓN') && law.includes('Prohibición de degradar'));
ok('law forbids 4K→FHD', law.includes('4K → FHD') || law.includes('4K → FHD/HD/SD'));
ok('contract mandatory', contract.status === 'mandatory');
ok('contract forbids fallback', contract.forbidden_automatic_actions.includes('replace_4k_source_with_fhd'));
ok('contract allows JIT copy', contract.allowed_without_exception.includes('jit_native_copy_4k'));
ok('AGENTS references law', agents.includes('ANTI_DEGRADATION_LAW.md') || agents.includes('LEY ANTI-DEGRADACIÓN'));
console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
if (pass !== total) process.exitCode = 1;
