#!/usr/bin/env node
/**
 * range_probe2.js — como range_probe pero BUSCA un canal servible en la muestra
 * antes de medir el segmento. El primer canal puede dar 403/407 y no dice nada
 * del soporte de Range del CDN.
 *
 * Uso: node range_probe2.js --muestra muestra.json --host <host> [--tries 25]
 */
'use strict';
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const MUESTRA = get('--muestra');
const HOSTF = get('--host');
const TRIES = parseInt(get('--tries') || '25', 10);
if (!MUESTRA || !HOSTF) { console.error('falta --muestra --host'); process.exit(2); }

function req(urlStr, headers) {
    return new Promise((resolve) => {
        let u; try { u = new URL(urlStr); } catch { return resolve({ err: 'BADURL' }); }
        const isH = u.protocol === 'https:';
        const mod = isH ? https : http;
        let done = false;
        const fin = (o) => { if (!done) { done = true; resolve(o); } };
        const r = mod.request({
            method: 'GET', hostname: u.hostname, port: u.port || (isH ? 443 : 80),
            path: u.pathname + (u.search || ''), headers,
            agent: false, rejectUnauthorized: false, timeout: 15000,
        }, (res) => {
            let n = 0, buf = '';
            res.on('data', (c) => { n += c.length; if (buf.length < 600) buf += c; if (n > 300000) res.destroy(); });
            res.on('end', () => fin({ code: res.statusCode, h: res.headers, size: n, buf }));
            res.on('close', () => fin({ code: res.statusCode, h: res.headers, size: n, buf }));
        });
        r.on('timeout', () => { r.destroy(); fin({ err: 'TIMEOUT' }); });
        r.on('error', (e) => fin({ err: e.code || e.message }));
        r.end();
    });
}

function splitPipe(line) {
    const i = line.indexOf('|');
    const h = {};
    if (i !== -1) for (const p of line.slice(i + 1).split('&')) {
        const e = p.indexOf('=');
        if (e > 0) h[p.slice(0, e)] = p.slice(e + 1);
    }
    return { url: i === -1 ? line : line.slice(0, i), headers: h };
}

function firstSeg(txt, base) {
    const ls = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!ls.length || !/^#EXTM3U/.test(ls[0])) return null;
    for (let i = 0; i < ls.length; i++) {
        if (ls[i].startsWith('#EXT-X-STREAM-INF')) {
            for (let j = i + 1; j < ls.length; j++) if (!ls[j].startsWith('#')) return { kind: 'master', uri: new URL(ls[j], base).toString() };
        }
    }
    for (const l of ls) if (!l.startsWith('#')) return { kind: 'media', uri: new URL(l, base).toString() };
    return null;
}

const RANGES = ['bytes=0-1023', 'bytes=0-'];

(async () => {
    const m = JSON.parse(fs.readFileSync(MUESTRA, 'utf8'));
    const uris = m[HOSTF] || [];
    console.log('');
    console.log('═'.repeat(74));
    console.log('BUSCANDO CANAL SERVIDO EN ' + HOSTF + '  (max ' + TRIES + ' intentos)');
    console.log('═'.repeat(74));

    let found = null;
    const tally = {};
    for (let i = 0; i < Math.min(TRIES, uris.length); i++) {
        const { url, headers } = splitPipe(uris[i]);
        const r = await req(url, headers);
        const c = r.err ? r.err : r.code;
        tally[c] = (tally[c] || 0) + 1;
        if (r.code >= 300 && r.code < 400 && r.h && r.h.location) { found = { url, headers, loc: r.h.location }; break; }
        if (r.code === 200 && /^#EXTM3U/.test((r.buf || '').trimStart())) { found = { url, headers, loc: null }; break; }
    }
    console.log('  codigos vistos: ' + Object.entries(tally).map(([k, v]) => k + 'x' + v).join('  '));
    if (!found) { console.log('  NO se encontro canal servible en la muestra.'); return; }

    let mUrl = found.loc ? new URL(found.loc, found.url).toString() : found.url;
    let man = await req(mUrl, found.headers);
    if (found.loc) console.log('  canal servible. destino: ' + man.code + '  ' + man.size + ' B');
    let seg = firstSeg(man.buf || '', mUrl);
    if (seg && seg.kind === 'master') {
        const v = await req(seg.uri, found.headers);
        const s2 = firstSeg(v.buf || '', seg.uri);
        if (s2) seg = s2;
    }
    if (!seg) { console.log('  manifest sin segmentos.'); return; }

    console.log('');
    console.log('  ── SEGMENTO');
    console.log('     ' + seg.uri.slice(0, 130));
    const base = await req(seg.uri, found.headers);
    if (base.err) { console.log('     SIN RANGE : ERROR ' + base.err); return; }
    console.log('     SIN RANGE      : ' + base.code + '  ' + String(base.size).padStart(9) + ' B   Accept-Ranges=' + ((base.h && base.h['accept-ranges']) || '(ausente)'));
    let any206 = false;
    for (const rg of RANGES) {
        const r = await req(seg.uri, { ...found.headers, Range: rg });
        if (r.err) { console.log('     ' + rg.padEnd(15) + ': ERROR ' + r.err); continue; }
        const cr = (r.h && r.h['content-range']) || '';
        console.log('     ' + rg.padEnd(15) + ': ' + r.code + '  ' + String(r.size).padStart(9) + ' B  ' + cr + (r.code === 206 ? '  <<== 206' : ''));
        if (r.code === 206) any206 = true;
    }
    console.log('');
    console.log('  VEREDICTO ' + HOSTF + ': ' + (any206 ? 'SOPORTA byte-range (206)' : 'NO soporta byte-range (ignora Range)'));
})();
