#!/usr/bin/env node
'use strict';
/**
 * diff_lists.js — compara dos listas M3U8 línea a línea (streaming, sin cargar en RAM).
 * Uso: node diff_lists.js <a.m3u8> <b.m3u8>
 * Informa: líneas totales, líneas distintas, primeras N diferencias con contexto,
 * y una clasificación heurística (timestamp / id aleatorio / fingerprint de URL / etc.).
 */
const fs = require('fs');
const readline = require('readline');

const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) { console.error('uso: node diff_lists.js a.m3u8 b.m3u8'); process.exit(2); }

const ra = readline.createInterface({ input: fs.createReadStream(fa, { encoding: 'utf8' }), crlfDelay: Infinity });
const rb = readline.createInterface({ input: fs.createReadStream(fb, { encoding: 'utf8' }), crlfDelay: Infinity });

let la = [], lb = [], doneA = false, doneB = false;
let n = 0, diffs = 0, samples = [];
const classes = {};

function classify(a, b) {
  if (!a || !b) return 'linea_faltante';
  if (a === b) return 'igual';
  if (/^#EXTHTTP:/.test(a) && /^#EXTHTTP:/.test(b)) return 'EXTHTTP (json con ids/timestamps)';
  if (/^https?:\/\//.test(a) && /^https?:\/\//.test(b)) {
    const ua = a.split('?')[0], ub = b.split('?')[0];
    if (ua === ub) return 'URL mismo host/path, query distinta';
    return 'URL distinta';
  }
  if (/^#EXTINF/.test(a) && /^#EXTINF/.test(b)) return 'EXTINF distinto (nombre/attrs)';
  const ta = a.split(':')[0], tb = b.split(':')[0];
  if (ta === tb) return 'misma etiqueta, valor distinto: ' + ta;
  return 'etiqueta distinta: ' + ta + ' vs ' + tb;
}

function step() {
  while (!doneA && !doneB && la.length && lb.length) {
    const a = la.shift(), b = lb.shift();
    n++;
    if (a !== b) {
      diffs++;
      const c = classify(a, b);
      classes[c] = (classes[c] || 0) + 1;
      if (samples.length < 12) samples.push({ line: n, a: a.slice(0, 180), b: b.slice(0, 180), clase: c });
    }
  }
  if (doneA && doneB && !la.length && !lb.length) finish();
  else if (doneA && !la.length && !lb.length && doneB) finish();
}

let finished = false;
function finish() {
  if (finished) return; finished = true;
  const out = {
    a: fa, b: fb,
    lineas_a: n, diferencias: diffs,
    porcentaje: n ? +(diffs * 100 / n).toFixed(4) : 0,
    clases: Object.fromEntries(Object.entries(classes).sort((x, y) => y[1] - x[1])),
    muestras: samples,
  };
  console.log(JSON.stringify(out, null, 2));
}

ra.on('line', (l) => { la.push(l); step(); });
rb.on('line', (l) => { lb.push(l); step(); });
ra.on('close', () => { doneA = true; if (doneB && !la.length && !lb.length) finish(); });
rb.on('close', () => { doneB = true; if (doneA && !la.length && !lb.length) finish(); });
