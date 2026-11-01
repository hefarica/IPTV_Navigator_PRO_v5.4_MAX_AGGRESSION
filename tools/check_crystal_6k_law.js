#!/usr/bin/env node
'use strict';
const fs = require('fs');
let pass = 0, total = 0;
function ok(n, c, d) { total++; if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else console.log('FAIL ' + n + (d ? ' · ' + d : '')); }
const law = fs.readFileSync('docs/policies/CRYSTAL_6K_MAX_ENHANCEMENT_LAW.md', 'utf8');
const c = JSON.parse(fs.readFileSync('contracts/crystal_6k_enhancement_contract.json', 'utf8'));
const agents = fs.readFileSync('AGENTS.md', 'utf8');
ok('6K law exists', law.includes('LEY CRYSTAL 6K MAX ENHANCEMENT'));
ok('6K target', c.target === '6144x3456');
ok('all technique families', c.techniques.includes('ai_super_resolution') && c.techniques.includes('neural_upscale') && c.techniques.includes('synthetic_hdr_display'));
ok('opt-in not default', c.default_enabled === false && c.opt_in_env === 'APE_6K=1');
ok('downscale forbidden', c.forbidden.includes('downscale_4k_to_fhd'));
ok('AGENTS references 6K law', agents.includes('CRYSTAL_6K_MAX_ENHANCEMENT_LAW.md') || agents.includes('LEY CRYSTAL 6K'));
console.log('\nTOTAL=' + total + ' PASS=' + pass + ' FAIL=' + (total - pass));
if (pass !== total) process.exitCode = 1;
