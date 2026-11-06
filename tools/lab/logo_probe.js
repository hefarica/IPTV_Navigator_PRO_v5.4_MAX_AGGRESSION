#!/usr/bin/env node
/**
 * logo_probe.js — audita tvg-logo: URLs con espacio sin %20, con pipe, sin
 * scheme, y salud HTTP del host del logo.
 *
 * Uso: node tools/lab/logo_probe.js --file <lista.m3u8> [--probe 12]
 */
'use strict';
const fs = require('fs');
const readline = require('readline');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
const PROBE = parseInt(get('--probe') || '0', 10);
if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file'); process.exit(2); }

function head(urlStr, ms) {
    return new Promise((resolve) => {
        let u; try { u = new URL(urlStr); } catch { return resolve({ err: 'BADURL' }); }
        const mod = u.protocol === 'https:' ? https : http;
        const t0 = Date.now();
        const r = mod.request({
            method: 'GET', hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + (u.search || ''),
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
            rejectUnauthorized: false, timeout: ms,
        }, (res) => {
            let n = 0;
            res.on('data', (c) => { n += c.length; if (n > 2048) { res.destroy(); resolve({ code: res.statusCode, ct: res.headers['content-type'], size: n, ms: Date.now() - t0 }); } });
            res.on('end', () => resolve({ code: res.statusCode, ct: res.headers['content-type'], size: n, ms: Date.now() - t0 }));
        });
        r.on('timeout', () => { r.destroy(); resolve({ err: 'TIMEOUT' }); });
        r.on('error', (e) => resolve({ err: e.code || e.message }));
        r.end();
    });
}

(async () => {
    const rl = readline.createInterface({
        input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });
    const re = /\btvg-logo="([^"]*)"/;
    let conEspacio = 0, conPipe = 0, sinScheme = 0, total = 0, sinLogo = 0;
    const ejemplos = [];
    const byHost = new Map();
    const hostSample = new Map();

    for await (const raw of rl) {
        const s = raw.trim();
        if (!s.startsWith('#EXTINF')) continue;
        total++;
        const m = s.match(re);
        if (!m || !m[1]) { sinLogo++; continue; }
        const u = m[1];
        if (/ /.test(u)) { conEspacio++; if (ejemplos.length < 6) ejemplos.push(u); }
        if (u.includes('|')) conPipe++;
        if (!/^https?:/i.test(u)) sinScheme++;
        let h = '?';
        try { h = new URL(u).hostname; } catch { h = '(no-url)'; }
        byHost.set(h, (byHost.get(h) || 0) + 1);
        if (!hostSample.has(h)) hostSample.set(h, u);
    }

    console.log('='.repeat(78));
    console.log('AUDITORIA tvg-logo');
    console.log('='.repeat(78));
    console.log('  EXTINF totales          : ' + total);
    console.log('  sin tvg-logo            : ' + sinLogo);
    console.log('  logo con ESPACIO sin %20: ' + conEspacio);
    console.log('  logo con pipe           : ' + conPipe);
    console.log('  logo sin http(s)        : ' + sinScheme);
    if (ejemplos.length) {
        console.log('  ejemplos con espacio:');
        for (const e of ejemplos) console.log('      ' + e);
    }

    if (PROBE > 0) {
        console.log('');
        console.log('='.repeat(78));
        console.log('SALUD DE CADA HOST DE LOGO');
        console.log('='.repeat(78));
        for (const [h, n] of [...byHost].sort((a, b) => b[1] - a[1])) {
            if (h === '(no-url)') { console.log('  ' + h.padEnd(28) + n); continue; }
            const sample = hostSample.get(h);
            const r = await head(sample, 8000);
            const st = r.err ? r.err : (r.code + ' ' + (r.ct || '?') + ' ' + r.size + 'B ' + r.ms + 'ms');
            console.log('  ' + h.padEnd(28) + String(n).padStart(6) + '   ' + st);
        }
    }
})();
