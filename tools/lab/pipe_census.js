#!/usr/bin/env node
/**
 * pipe_census.js — censo de los parametros que viajan en el PIPE de cada URL.
 * El pipe (lo que va despues del primer "|") es lo que el player lee de verdad:
 * KODIPROP y EXTVLCOPT son metadata de Kodi/VLC, el pipe lo aplica el player
 * de la URL.
 *
 * Reporta, por host: cuantas URLs llevan cada clave, que valores toma, y si el
 * valor esta URL-encoded o crudo.
 *
 * Uso: node tools/lab/pipe_census.js --file <lista.m3u8>
 */
'use strict';
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file'); process.exit(2); }

const byHost = new Map();
let total = 0, withPipe = 0, noPipe = 0;

function b(host) {
    if (!byHost.has(host)) byHost.set(host, {
        host, n: 0, keys: new Map(), vals: new Map(), encRef: 0, rawRef: 0,
        orderSamples: new Map(), noPipeList: [],
    });
    return byHost.get(host);
}

function add(map, k, v) {
    if (!map.has(k)) map.set(k, new Map());
    const m = map.get(k);
    m.set(v, (m.get(v) || 0) + 1);
}

(async () => {
    const rl = readline.createInterface({
        input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    for await (const raw of rl) {
        const line = raw.trim();
        if (!/^https?:\/\//i.test(line)) continue;
        total++;

        const i = line.indexOf('|');
        let host = 'SIN-PIPE';
        try { host = new URL(i === -1 ? line : line.slice(0, i)).hostname; } catch { host = 'NO-PARSE'; }
        const s = b(host);
        s.n++;

        if (i === -1) { noPipe++; s.noPipeList.push(line.slice(0, 120)); continue; }
        withPipe++;

        const q = line.slice(i + 1);
        const pairs = q.split('&');
        const shape = pairs.map(p => p.split('=')[0]).join('&');
        s.orderSamples.set(shape, (s.orderSamples.get(shape) || 0) + 1);

        for (const p of pairs) {
            const eq = p.indexOf('=');
            const k = eq === -1 ? p : p.slice(0, eq);
            const v = eq === -1 ? '' : p.slice(eq + 1);
            s.keys.set(k, (s.keys.get(k) || 0) + 1);
            add(s.vals, k, v);
        }

        const ref = pairs.find(p => /^Referer=/i.test(p) || /^referrer=/i.test(p));
        if (ref) {
            const v = ref.split('=')[1] || '';
            if (/%3A|%2F/i.test(v)) s.encRef++; else s.rawRef++;
        }
    }

    const out = [];
    const P = s => out.push(s);
    P('='.repeat(80));
    P('CENSO DE PIPES  — ' + FILE);
    P('='.repeat(80));
    P('URIs totales : ' + total);
    P('con pipe     : ' + withPipe);
    P('SIN pipe     : ' + noPipe + (noPipe ? '   <<== el player no recibe headers' : ''));
    P('');

    for (const s of [...byHost.values()].sort((a, b) => b.n - a.n)) {
        P('─'.repeat(80));
        P('HOST ' + s.host + '  (' + s.n + ' URLs)');
        P('─'.repeat(80));
        P('  Referer URL-encoded : ' + s.encRef);
        P('  Referer crudo       : ' + s.rawRef);
        P('  claves en el pipe   :');
        for (const [k, c] of [...s.keys].sort((a, b) => b[1] - a[1]))
            P('      ' + String(c).padStart(7) + '  ' + k + '   (' + s.vals.get(k).size + ' valor/es distinto/s)');

        P('  ORDEN del pipe (formas distintas: ' + s.orderSamples.size + '):');
        for (const [shape, c] of [...s.orderSamples].sort((a, b) => b[1] - a[1]).slice(0, 3))
            P('      ' + String(c).padStart(7) + '  |' + shape);

        // valores por clave, con los 3 mas frecuentes
        for (const [k, c] of [...s.keys].sort((a, b) => b[1] - a[1])) {
            const m = [...s.vals.get(k)].sort((a, b) => b[1] - a[1]);
            P('  VALORES de ' + k + ':');
            for (const [v, n] of m.slice(0, 3))
                P('      ' + String(n).padStart(7) + '  ' + (v.length > 150 ? v.slice(0, 150) + '…' : v));
            if (m.length > 3) P('      ... ' + (m.length - 3) + ' valores mas');
        }
        if (s.noPipeList.length) {
            P('  URLS SIN PIPE (muestra):');
            for (const l of s.noPipeList.slice(0, 5)) P('      ' + l);
        }
    }

    P('');
    P('='.repeat(80));
    P('VEREDICTOS MECANICOS');
    P('='.repeat(80));
    let anyLocal = 0, anyLocalEnc = 0;
    for (const s of byHost.values()) {
        for (const [k, m] of s.vals) {
            if (!/^referer|^referrer/i.test(k)) continue;
            for (const [v, n] of m) {
                if (/127\.0\.0\.1|localhost/i.test(v)) { anyLocal += n; if (/%3A/i.test(v)) anyLocalEnc += n; }
            }
        }
    }
    P('  URLs con Referer apuntando a 127.0.0.1/localhost : ' + anyLocal);
    P('  de esas, con el valor URL-encoded                : ' + anyLocalEnc);
    P('  (el player envia el Referer tal cual; encoded lo manda literal)');

    console.log(out.join('\n'));
})();
