#!/usr/bin/env node
/**
 * range_matrix.js — prueba TODAS las formas de Range que la RFC 9110 permite
 * contra un segmento real, incluidas las que el operador queria:
 *
 *   bytes=*          -> NO EXISTE en la RFC (se prueba para demostrarlo)
 *   bytes=-1         -> suffix-range: el ULTIMO byte
 *   bytes=-1024      -> suffix-range: los ultimos 1024 bytes
 *   bytes=0-0,-1     -> multi-range: primer byte Y ultimo byte
 *   bytes=100000-    -> "lo nuevo": de 100000 al final, SIN conocer el tamano
 *   bytes=0-         -> todo (equivale a no mandar Range)
 *
 * Y comprueba si algun 416 trae Content-Range: bytes * /<len> (el unico sitio
 * donde un asterisco es legal).
 *
 * Uso: node range_matrix.js --muestra muestra.json --host <host>
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
            path: u.pathname + (u.search || ''), headers, agent: false,
            rejectUnauthorized: false, timeout: 15000,
        }, (res) => {
            let n = 0, buf = '';
            res.on('data', (c) => {
                n += c.length;
                if (buf.length < 8192) buf += c;     // hace falta el body para resolver el segmento
                if (n > 400000) res.destroy();
            });
            const out = () => fin({ code: res.statusCode, h: res.headers, size: n, body: buf });
            res.on('end', out); res.on('close', out);
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
            for (let j = i + 1; j < ls.length; j++) if (!ls[j].startsWith('#')) return new URL(ls[j], base).toString();
        }
    }
    for (const l of ls) if (!l.startsWith('#')) return new URL(l, base).toString();
    return null;
}

const FORMS = [
    ['(sin Range)  base',        null],
    ['bytes=*        "asterisco"', 'bytes=*'],
    ['bytes=-1       ultimo byte', 'bytes=-1'],
    ['bytes=-1024    ultimos 1KB', 'bytes=-1024'],
    ['bytes=0-0,-1   primero+ultimo', 'bytes=0-0,-1'],
    ['bytes=100000-  lo nuevo',   'bytes=100000-'],
    ['bytes=0-       todo',       'bytes=0-'],
];

(async () => {
    const m = JSON.parse(fs.readFileSync(MUESTRA, 'utf8'));
    const uris = (m[HOSTF] || []).map(u => u.split('|')[0]);

    // buscar un canal servible
    let found = null;
    for (let i = 0; i < Math.min(25, uris.length); i++) {
        const { url, headers } = splitPipe((m[HOSTF] || [])[i]);
        const r = await req(url, headers);
        if (r.err) continue;
        if (r.code >= 300 && r.code < 400 && r.h && r.h.location) {
            const loc = new URL(r.h.location, url).toString();
            const d = await req(loc, headers);
            const seg = firstSeg(d.body || '', loc);
            if (seg) { found = { seg, headers }; break; }
        } else if (r.code === 200) {
            const seg = firstSeg('', url);
            if (seg) { found = { seg, headers }; break; }
        }
    }
    if (!found) { console.log('NO se encontro canal servible en ' + HOSTF); return; }

    console.log('');
    console.log('='.repeat(90));
    console.log('ORIGEN ' + HOSTF);
    console.log('segmento: ' + found.seg.slice(0, 110));
    console.log('='.repeat(90));

    for (const [label, rg] of FORMS) {
        const h = Object.assign({}, found.headers);
        if (rg) h['Range'] = rg;
        const r = await req(found.seg, h);
        if (r.err) { console.log('  ' + label.padEnd(30) + ' ERROR ' + r.err); continue; }
        const cr = (r.h && r.h['content-range']) || '';
        const ar = (r.h && r.h['accept-ranges']) || '(ausente)';
        const marks = [];
        if (r.code === 206) marks.push('<<== 206 PARCIAL');
        if (r.code === 416) marks.push('<<== 416 (Range Not Satisfiable)');
        if (r.code === 400) marks.push('<<== 400 (Range INVALIDO)');
        console.log('  ' + label.padEnd(30) + ' -> ' + String(r.code).padEnd(4) + ' ' +
            String(r.size).padStart(9) + ' B   ' +
            (cr ? 'Content-Range=' + cr : '(sin Content-Range)') +
            '   AR=' + ar + '  ' + marks.join(' '));
    }

    console.log('');
    console.log('  LECTURA: 206 = el origen honra Range. 200 = lo ignora. 400 = rechaza la sintaxis.');
    console.log('           416 con "Content-Range: bytes */N" es el UNICO lugar donde un * es legal.');
})();
