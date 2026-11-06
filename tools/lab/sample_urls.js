#!/usr/bin/env node
/**
 * sample_urls.js — extrae una muestra estratificada de URIs CON su pipe de una
 * lista, y emite JSON compacto para que la sonda corra donde hay red util.
 *
 * Uso: node tools/lab/sample_urls.js --file <lista> --n 400 --out muestra.json
 */
'use strict';
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
const N = parseInt(get('--n') || '400', 10);
const OUT = get('--out') || 'muestra.json';
if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file'); process.exit(2); }

const byHost = new Map();
let seen = 0;

(async () => {
    const rl = readline.createInterface({
        input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    for await (const raw of rl) {
        const s = raw.trim();
        if (!/^https?:\/\//i.test(s)) continue;
        let host;
        try { host = new URL(s.split('|')[0]).hostname; } catch { continue; }
        if (!byHost.has(host)) byHost.set(host, []);
        const arr = byHost.get(host);
        // muestreo uniforme: guardar 1 de cada k para no sesgar por el orden
        seen++;
        if (arr.length < N) { arr.push(s); continue; }
        // reservorio simple determinista
        const k = Math.floor(seen / N);
        if (k > 1 && seen % k === 0) arr[Math.floor(Math.random() * N)] = s;
    }

    const out = {};
    for (const [h, arr] of byHost) out[h] = arr;
    fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
    console.log('muestra escrita: ' + OUT);
    for (const [h, arr] of byHost) console.log('  ' + h + ' : ' + arr.length + ' URIs');
})();
