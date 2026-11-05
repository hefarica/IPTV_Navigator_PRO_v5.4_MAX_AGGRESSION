#!/usr/bin/env node
'use strict';
/**
 * Auditoría EXTHTTP según la skill iptv-exthttp-traps-checklist (14 detonadores).
 * Uso: node audit_exthttp_live.js <ruta.m3u8> [maxBloques]
 * Valida: JSON estricto, llaves, CRLF, %20 en UA, doble-encoding, coma final,
 * comillas simples, fingerprints (OMEGA/CRYSTAL/APE_), traceparent,
 * X-Requested-With, Referer/Origin con dominio del VPS, headers condicionales.
 */
const fs = require('fs');
const readline = require('readline');

const file = process.argv[2];
const max = Number(process.argv[3] || 0) || Infinity;

const FORBIDDEN = new Set([
  'range', 'if-none-match', 'if-modified-since', 'te', 'priority', 'upgrade-insecure-requests'
]);

let total = 0, bad = 0, samples = [];
const issues = {};
function note(kind, sample) {
  issues[kind] = (issues[kind] || 0) + 1;
  if (samples.length < 8) samples.push(kind + ' :: ' + sample.slice(0, 160));
}

const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
rl.on('line', (line) => {
  if (total >= max) { rl.close(); return; }
  const m = /^#EXTHTTP:(.*)$/.exec(line.trim());
  if (!m) return;
  total++;
  const raw = m[1];
  if (!/^\{.*\}$/.test(raw)) { bad++; note('missing-braces', raw); return; }
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { bad++; note('invalid-json', raw); return; }
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (typeof v !== 'string') { bad++; note('non-string-value:' + k, raw); continue; }
    if (/[\r\n]/.test(v)) { bad++; note('crlf:' + k, raw); }
    if (kl === 'user-agent' && /%20/.test(v)) { bad++; note('ua-%20', raw); }
    if (/%25[0-9A-F]{2}/i.test(v)) { bad++; note('double-encoding:' + k, raw); }
    if (/OMEGA|CRYSTAL|APE_/i.test(v)) { bad++; note('engine-fingerprint:' + k, raw); }
    if (kl === 'traceparent') { bad++; note('traceparent', raw); }
    if (kl === 'x-requested-with') { bad++; note('x-requested-with', raw); }
    if ((kl === 'referer' || kl === 'origin') && /iptv-ape|duckdns|178\.156|hetzner/i.test(v)) { bad++; note('vps-referer:' + k, raw); }
    if (FORBIDDEN.has(kl)) { bad++; note('conditional-header:' + k, raw); }
  }
});
rl.on('close', () => {
  console.log(JSON.stringify({
    file, blocks: total, bad, issues, samples
  }, null, 2));
  process.exitCode = bad ? 1 : 0;
});
