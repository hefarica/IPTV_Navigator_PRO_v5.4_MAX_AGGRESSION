#!/usr/bin/env node
'use strict';
/** compare_audits.js — compara dos salidas de audit_list.js. Uso: node compare_audits.js a.json b.json */
const fs = require('fs');
const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) { console.error('uso: node compare_audits.js a.json b.json'); process.exit(2); }
const A = JSON.parse(fs.readFileSync(fa, 'utf8'));
const B = JSON.parse(fs.readFileSync(fb, 'utf8'));

const full = ['file', 'bytes', 'sha256', 'lines', 'extinf', 'streaminf', 'iframe', 'urls',
  'extvlcopt', 'kodiprop', 'exthttp', 'exthttp_bad', 'exthttp_fields_total',
  'avg_block_lines', 'maxBlockLines', 'blocks', 'header1', 'firstExtinf', 'lastUrl'];
const label = (k) => k.padEnd(20);
console.log(label('campo') + '| A'.padEnd(30) + '| B'.padEnd(30) + '| igual');
for (const k of full) {
  const a = JSON.stringify(A[k]), b = JSON.stringify(B[k]);
  console.log(label(k) + '| ' + String(a).slice(0, 28).padEnd(28) + ' | ' + String(b).slice(0, 28).padEnd(28) + ' | ' + (a === b ? 'SI' : 'NO'));
}
console.log('\nprofiles A: ' + JSON.stringify(A.profiles));
console.log('profiles B: ' + JSON.stringify(B.profiles));
console.log('\ndeclarations A: ' + JSON.stringify(A.declarations));
console.log('declarations B: ' + JSON.stringify(B.declarations));
console.log('\nhosts A: ' + JSON.stringify(A.hosts));
console.log('hosts B: ' + JSON.stringify(B.hosts));

const ka = Object.keys(A.tagFamilies), kb = Object.keys(B.tagFamilies);
const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0);
console.log('\ntagFamilies: ' + ka.length + ' (' + sum(A.tagFamilies) + ' tags) vs ' + kb.length + ' (' + sum(B.tagFamilies) + ' tags)');
const onlyA = ka.filter((k) => !(k in B.tagFamilies));
const onlyB = kb.filter((k) => !(k in A.tagFamilies));
console.log('solo en A: ' + onlyA.length + ' ' + JSON.stringify(onlyA.slice(0, 12)));
console.log('solo en B: ' + onlyB.length + ' ' + JSON.stringify(onlyB.slice(0, 12)));
const diffCount = ka.filter((k) => k in B.tagFamilies && A.tagFamilies[k] !== B.tagFamilies[k]);
console.log('familias con conteo distinto: ' + diffCount.length);
for (const k of diffCount.slice(0, 12)) console.log('  ' + k + ': ' + A.tagFamilies[k] + ' vs ' + B.tagFamilies[k]);

const same = full.filter((k) => JSON.stringify(A[k]) === JSON.stringify(B[k])).length;
console.log('\nVEREDICTO: ' + (A.sha256 === B.sha256 && same === full.length
  ? 'listas IDENTICAS (mismo contenido, nombre distinto)'
  : 'listas DISTINTAS (' + (full.length - same) + ' campos difieren; sha distinto)'));
