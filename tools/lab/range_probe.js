#!/usr/bin/env node
/**
 * range_probe.js — mide si el ORIGEN soporta byte-range (206) de verdad.
 *
 * Emitir #EXT-X-BYTERANGE sobre un origen que ignora Range no es premium:
 * rompe hls.js (NETWORK_ERROR "range header was ignored") y ExoPlayer
 * (decodifica el fichero entero como si fuera el trozo). Asi que antes de
 * emitir hay que MEDIR, en el manifest y en el segmento, con varias formas
 * de Range y en cada host de CDN que devuelve el 302.
 *
 * Uso: node range_probe.js --muestra muestra.json [--host <host>]
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
if (!MUESTRA || !fs.existsSync(MUESTRA)) { console.error('falta --muestra'); process.exit(2); }

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
            res.on('data', (c) => { n += c.length; if (buf.length < 400) buf += c; if (n > 200000) res.destroy(); });
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

const RANGES = ['bytes=0-1023', 'bytes=100-200', 'bytes=0-', 'bytes=-500'];

async function probeTarget(label, url, headers) {
    console.log('\n  ── ' + label);
    console.log('     ' + url.slice(0, 120));
    // sin Range: linea base
    const base = await req(url, headers);
    if (base.err) { console.log('     SIN RANGE : ERROR ' + base.err); return { ok: false, reason: base.err }; }
    console.log('     SIN RANGE : ' + base.code + '  ' + base.size + ' B   Accept-Ranges=' + (base.h && base.h['accept-ranges'] || '(ausente)'));
    let saw206 = false;
    for (const rg of RANGES) {
        const r = await req(url, { ...headers, Range: rg });
        if (r.err) { console.log('     ' + rg.padEnd(16) + ' : ERROR ' + r.err); continue; }
        const cr = (r.h && r.h['content-range']) || '';
        const mark = r.code === 206 ? '  <<== 206' : (r.code === 200 ? '  (ignorado: devuelve el entero)' : '');
        console.log('     ' + rg.padEnd(16) + ' : ' + r.code + '  ' + String(r.size).padStart(9) + ' B  ' + cr + mark);
        if (r.code === 206) saw206 = true;
    }
    return { ok: saw206 };
}

(async () => {
    const m = JSON.parse(fs.readFileSync(MUESTRA, 'utf8'));
    const hosts = HOSTF ? [HOSTF] : Object.keys(m);
    for (const host of hosts) {
        const uri = (m[host] || [])[0];
        if (!uri) continue;
        const { url, headers } = splitPipe(uri);
        console.log('');
        console.log('═'.repeat(74));
        console.log('ORIGEN ' + host);
        console.log('═'.repeat(74));

        const man = await req(url, headers);
        let mUrl = url, body = man.buf || '';
        const loc = man.h && man.h.location;
        if (man.code >= 300 && man.code < 400 && loc) {
            mUrl = new URL(loc, url).toString();
            const d = await req(mUrl, headers);
            body = d.buf || '';
        }
        await probeTarget('MANIFEST', mUrl, headers);

        const seg = firstSeg(body, mUrl);
        if (seg) {
            let surl = seg.uri;
            if (seg.kind === 'master') {
                const v = await req(surl, headers);
                const s2 = firstSeg(v.buf || '', surl);
                if (s2) surl = s2.uri;
            }
            await probeTarget('SEGMENTO', surl, headers);
        } else {
            console.log('\n  ── SEGMENTO: no se pudo resolver (manifest sin segmentos)');
        }
    }
    console.log('');
    console.log('═'.repeat(74));
    console.log('LECTURA: si ninguna forma de Range devuelve 206 ni aparece Accept-Ranges,');
    console.log('el origen NO soporta byte-range y emitir EXT-X-BYTERANGE rompe el player.');
    console.log('═'.repeat(74));
})();
