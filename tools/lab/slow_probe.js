#!/usr/bin/env node
/**
 * slow_probe.js — prueba canales ESPACIADOS para separar rate-limit de estado
 * real. Si el 407 desaparece con 1.2s de pausa, era la rafaga de la sonda y no
 * el proveedor.
 *
 * Uso: node slow_probe.js --muestra muestra.json --host line.tivi-ott.net --n 15 --gap 1200
 */
'use strict';
const fs = require('fs');
const http = require('http');
const { URL } = require('url');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const MUESTRA = get('--muestra');
const HOST = get('--host');
const N = parseInt(get('--n') || '15', 10);
const GAP = parseInt(get('--gap') || '1200', 10);
if (!MUESTRA || !HOST) { console.error('falta --muestra --host'); process.exit(2); }

function split(l) {
    const i = l.indexOf('|');
    const h = {};
    if (i !== -1) {
        for (const p of l.slice(i + 1).split('&')) {
            const e = p.indexOf('=');
            if (e > 0) h[p.slice(0, e)] = p.slice(e + 1);
        }
    }
    return { u: i === -1 ? l : l.slice(0, i), h };
}

function go(u, h) {
    return new Promise((r) => {
        let x; try { x = new URL(u); } catch { return r('BADURL'); }
        const q = http.request({
            hostname: x.hostname, port: x.port || 80, path: x.pathname + x.search,
            headers: h, timeout: 15000, agent: false,
        }, (res) => {
            res.resume();
            res.on('end', () => r(res.statusCode));
        });
        q.on('timeout', () => { q.destroy(); r('TIMEOUT'); });
        q.on('error', (e) => r(e.code));
        q.end();
    });
}

(async () => {
    const m = JSON.parse(fs.readFileSync(MUESTRA, 'utf8'));
    const uris = (m[HOST] || []).slice(0, N);
    const out = [];
    for (const l of uris) {
        const { u, h } = split(l);
        const c = await go(u, h);
        out.push(c);
        process.stdout.write('  ' + c + '\n');
        await new Promise(r => setTimeout(r, GAP));
    }
    const t = {};
    for (const c of out) t[c] = (t[c] || 0) + 1;
    console.log('');
    console.log('  recuento sin rafaga: ' + Object.entries(t).map(([k, v]) => k + 'x' + v).join('  '));
})();
