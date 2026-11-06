#!/usr/bin/env node
/**
 * rfc_extract.js — extrae un rango de texto de un fichero por marcador.
 * Existe para no usar `node -e` con escapes (pwsh los manglea; ya rompio el
 * comando cuatro veces en esta sesion).
 *
 * Uso: node tools/lab/rfc_extract.js --file <txt> --from "<marcador>" --len 2600 [--occurrence last|first]
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
const FROM = get('--from');
const LEN = parseInt(get('--len') || '2600', 10);
const OCC = get('--occurrence') || 'last';
if (!FILE || !FROM) { console.error('falta --file --from'); process.exit(2); }

const t = fs.readFileSync(FILE, 'utf8');
const idxs = [];
let p = -1;
while ((p = t.indexOf(FROM, p + 1)) !== -1) idxs.push(p);
console.log('ocurrencias de ' + JSON.stringify(FROM) + ' : ' + idxs.length);
if (!idxs.length) { console.log('NO ENCONTRADO'); process.exit(1); }
const at = OCC === 'first' ? idxs[0] : idxs[idxs.length - 1];
console.log('usando la ocurrencia en offset ' + at + ' (' + OCC + ')');
console.log('-'.repeat(78));
console.log(t.slice(at, at + LEN));
