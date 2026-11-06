#!/usr/bin/env node
/**
 * http_probe.js — sonda HTTP sin seguir redirects por defecto, devolviendo
 * codigo, headers seleccionados, tiempo y primeros bytes del cuerpo.
 *
 * Existe porque PowerShell manglea los escapes (\d, \s, $1) y ya rompio tres
 * verificaciones. Aca la logica vive en JS y no pasa por el parser de pwsh.
 *
 * Uso:
 *   node tools/lab/http_probe.js --url <url> [--ua <ua>] [--ref <url>] [--ms 12000] [--follow]
 *   node tools/lab/http_probe.js --batch probes.json
 */
'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const has = (k) => args.includes(k);

const TIMEOUT = parseInt(get('--ms') || '12000', 10);
const UA = get('--ua') || 'VLC/3.0.24 LibVLC/3.0.24';
const REF = get('--ref') || null;
const FOLLOW = has('--follow');
const MAXREDIR = 5;

function req(urlStr, method) {
    return new Promise((resolve) => {
        let u;
        try { u = new URL(urlStr); } catch (e) { return resolve({ err: 'BADURL' }); }
        const mod = u.protocol === 'https:' ? https : http;
        const headers = {
            'User-Agent': UA,
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'close',
        };
        if (REF) headers['Referer'] = REF;

        const t0 = Date.now();
        let done = false;
        const finish = (o) => { if (!done) { done = true; resolve({ ...o, ms: Date.now() - t0 }); } };

        const r = mod.request({
            method: method || 'GET',
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + (u.search || ''),
            headers,
            rejectUnauthorized: false,
            timeout: TIMEOUT,
        }, (res) => {
            const chunks = [];
            let total = 0;
            res.on('data', (c) => {
                total += c.length;
                if (chunks.length < 4) chunks.push(c);
                // leer solo los primeros KB: es una sonda, no una descarga
                if (total > 65536) { res.destroy(); finish({ code: res.statusCode, headers: res.headers, size: total, body: Buffer.concat(chunks), truncated: true }); }
            });
            res.on('end', () => finish({ code: res.statusCode, headers: res.headers, size: total, body: Buffer.concat(chunks) }));
            res.on('error', (e) => finish({ code: res.statusCode, headers: res.headers, size: total, err: e.code || e.message }));
        });
        r.on('timeout', () => { r.destroy(); finish({ err: 'TIMEOUT' }); });
        r.on('error', (e) => finish({ err: e.code || e.message }));
        r.end();
    });
}

async function probe(urlStr, opts = {}) {
    let cur = urlStr;
    for (let i = 0; i <= MAXREDIR; i++) {
        const r = await req(cur);
        if (r.err) return { url: urlStr, ...r };
        const loc = r.headers && r.headers.location;
        if (FOLLOW && loc && r.code >= 300 && r.code < 400 && i < MAXREDIR) {
            cur = new URL(loc, cur).toString();
            continue;
        }
        return { url: urlStr, final: cur, ...r };
    }
}

function show(tag, r) {
    const pad = (s, n) => String(s).padEnd(n);
    console.log('');
    console.log('### ' + tag);
    console.log('  url      : ' + r.url);
    if (r.final && r.final !== r.url) console.log('  final    : ' + r.final);
    if (r.err) { console.log('  ERROR    : ' + r.err + '   (' + r.ms + ' ms)'); return; }
    console.log('  code     : ' + r.code + '   (' + r.ms + ' ms, ' + r.size + ' bytes' + (r.truncated ? ' truncado' : '') + ')');
    const h = r.headers || {};
    for (const k of ['content-type', 'content-length', 'location', 'server', 'set-cookie', 'x-powered-by', 'cache-control']) {
        if (h[k] !== undefined) console.log('  ' + pad(k, 14) + ': ' + String(h[k]).slice(0, 200));
    }
    if (r.body && r.body.length) {
        const txt = r.body.toString('utf8').replace(/\r/g, '');
        console.log('  body[0..200] : ' + JSON.stringify(txt.slice(0, 200)));
        console.log('  primeraLinea : ' + JSON.stringify(txt.split('\n')[0].slice(0, 160)));
    } else {
        console.log('  body     : (vacio)');
    }
}

(async () => {
    const batch = get('--batch');
    if (batch) {
        const fs = require('fs');
        const items = JSON.parse(fs.readFileSync(batch, 'utf8'));
        for (const it of items) {
            const r = await probe(it.url, it);
            show(it.tag || it.url, r);
        }
        return;
    }
    const url = get('--url');
    if (!url) { console.error('falta --url'); process.exit(2); }
    const r = await probe(url);
    show(get('--tag') || 'probe', r);
})();
