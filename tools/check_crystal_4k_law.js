#!/usr/bin/env node
'use strict';
const fs = require('fs');
let pass = 0, total = 0;
function ok(n, c, d) { total++; if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else console.log('FAIL ' + n + (d ? ' · ' + d : '')); }
const law = fs.readFileSync('docs/policies/CRYSTAL_4K_ENHANCEMENT_LAW.md', 'utf8');
const c = JSON.parse(fs.readFileSync('contracts/crystal_4k_enhancement_contract.json', 'utf8'));
const agents = fs.readFileSync('AGENTS.md', 'utf8');
ok('crystal law exists', law.includes('LEY CRYSTAL 4K UHD') && law.includes('REMUX NATIVO'));
ok('enhancement allowed', c.allowed.includes('display_vpp') && c.allowed.includes('synthetic_sharpening'));
ok('upscale rule', c.priority.includes('real_upscale_if_capacity'));
ok('downscale forbidden', c.forbidden.includes('downscale_4k_to_fhd'));
ok('AGENTS references crystal law', agents.includes('CRYSTAL_4K_ENHANCEMENT_LAW.md') || agents.includes('LEY CRYSTAL 4K'));
console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
if (pass !== total) process.exitCode = 1;
