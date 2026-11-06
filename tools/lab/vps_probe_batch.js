#!/usr/bin/env node
/**
 * vps_probe_batch.js — sonda de salud que corre EN EL VPS (o donde haya red).
 *
 * Por cada URI CON pipe:
 *   1. pide el manifest con LOS HEADERS DEL PIPE, tal cual un player
 *   2. si hay 302, sigue el destino y valida que sea un manifest HLS real
 *   3. en una submuestra, pide el primer segmento y ve si da 200 o 509
 *
 * POR QUE: el pipe es lo que el player lee. Probar sin el pipe mide otra cosa.
 * Y el 509 de este proveedor sale cuando max_connections=1 se agota.
 *
 * Uso: node vps_probe_batch.js --muestra muestra.json [--conc 1] [--seg 20]
 */
'use strict';
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const MUESTRA = get('--muestra');
const CONC = parseInt(get('--conc') || '1', 10);
const SEGN = parseInt(get('--seg') || '20', 10);
const MS = parseInt(get('--ms') || '15000', 10);
if (!MUESTRA || !fs.existsSync(MUESTRA)) { console.error('falta --muestra'); process.exit(2); }

const keep = new http.Agent({ keepAlive: true, maxSockets: CONC });
const keeps = new https.Agent({ keepAlive: true, maxSockets: CONC });

function req(urlStr, headers) {
    return new Promise((resolve) => {
        let u; try { u = new URL(urlStr); } catch { return resolve({ err: 'BADURL' }); }
        const isH = u.protocol === 'https:';
        const mod = isH ? https : http;
        const t0 = Date.now();
        let done = false;
        const fin = (o) => { if (!done) { done = true; resolve({ ...o, ms: Date.now() - t0 }); } };
        const r = mod.request({
            method: 'GET', hostname: u.hostname, port: u.port || (isH ? 443 : 80),
            path: u.pathname + (u.search || ''), headers,
            agent: isH ? keeps : keep, rejectUnauthorized: false, timeout: MS,
        }, (res) => {
            const bufs = []; let total = 0;
            res.on('data', (c) => {
                total += c.length;
                if (bufs.length < 6) bufs.push(c);
                if (total > 131072) { res.destroy(); fin({ code: res.statusCode, h: res.headers, size: total, body: Buffer.concat(bufs) }); }
            });
            res.on('end', () => fin({ code: res.statusCode, h: res.headers, size: total, body: Buffer.concat(bufs) }));
            res.on('error', (e) => fin({ code: res.statusCode, h: res.headers, err: e.code || e.message }));
        });
        r.on('timeout', () => { r.destroy(); fin({ err: 'TIMEOUT' }); });
        r.on('error', (e) => fin({ err: e.code || e.message }));
        r.end();
    });
}

function splitPipe(line) {
    const i = line.indexOf('|');
    if (i === -1) return { url: line, headers: {} };
    const url = line.slice(0, i);
    const headers = {};
    for (const p of line.slice(i + 1).split('&')) {
        const e = p.indexOf('=');
        if (e > 0) headers[p.slice(0, e)] = p.slice(e + 1);   // valor literal
    }
    return { url, headers };
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

async function probeOne(line, doSeg) {
    const { url, headers } = splitPipe(line);
    const r = { manifest: null, destino: null, hls: false, seg: null, err: null };
    const m = await req(url, headers);
    if (m.err) { r.err = m.err; return r; }
    r.manifest = m.code;
    let mUrl = url, body = m.body;
    const loc = m.h && m.h.location;
    if (m.code >= 300 && m.code < 400 && loc) {
        mUrl = new URL(loc, url).toString();
        const d = await req(mUrl, headers);
        if (d.err) { r.err = d.err; return r; }
        r.destino = d.code;
        body = d.body;
    } else if (m.code === 200) {
        r.destino = 200;
    }
    const txt = (body || Buffer.alloc(0)).toString('utf8');
    r.hls = /^#EXTM3U/.test(txt.trimStart());
    if (doSeg && r.hls) {
        let seg = firstSeg(txt, mUrl);
        if (seg && seg.kind === 'master') {
            const v = await req(seg.uri, headers);
            const vt = (v.body || Buffer.alloc(0)).toString('utf8');
            const s2 = firstSeg(vt, seg.uri);
            if (s2) seg = s2;
        }
        if (seg) {
            const s = await req(seg.uri, { ...headers, Range: 'bytes=0-2047' });
            r.seg = s.err ? s.err : s.code;
        }
    }
    return r;
}

async function runHost(host, uris, conc) {
    const res = [];
    let i = 0;
    async function worker() {
        while (i < uris.length) {
            const idx = i++;
            const doSeg = idx < SEGN;
            const r = await probeOne(uris[idx], doSeg);
            res.push(r);
            if ((res.length % 50) === 0) process.stderr.write('    ' + host + ' ' + res.length + '/' + uris.length + '\n');
        }
    }
    await Promise.all(Array.from({ length: conc }, worker));
    return res;
}

function summarize(host, res) {
    const c = (f) => res.filter(f).length;
    const n = res.length;
    const pct = (x) => n ? (100 * x / n).toFixed(1) + '%' : 'n/a';
    const man = {};
    const des = {};
    const sg = {};
    for (const r of res) {
        if (r.err) { man['ERR:' + r.err] = (man['ERR:' + r.err] || 0) + 1; continue; }
        man[r.manifest] = (man[r.manifest] || 0) + 1;
        if (r.destino != null) des[r.destino] = (des[r.destino] || 0) + 1;
        if (r.seg != null) sg[typeof r.seg === 'number' ? r.seg : 'ERR:' + r.seg] = (sg[typeof r.seg === 'number' ? r.seg : 'ERR:' + r.seg] || 0) + 1;
    }
    console.log('');
    console.log('═'.repeat(72));
    console.log('HOST ' + host + '   n=' + n);
    console.log('═'.repeat(72));
    console.log('  manifest : ' + Object.entries(man).map(([k, v]) => k + '×' + v).join('  '));
    console.log('  destino  : ' + Object.entries(des).map(([k, v]) => k + '×' + v).join('  '));
    console.log('  HLS real : ' + c(r => r.hls) + '/' + n + '  (' + pct(c(r => r.hls)) + ')');
    console.log('  segmento : ' + Object.entries(sg).map(([k, v]) => k + '×' + v).join('  '));
    const ok302 = c(r => r.manifest === 302);
    const okHls = c(r => r.hls);
    console.log('');
    console.log('  SERVIBLE (302 o 200 + manifest HLS valido) : ' + okHls + '/' + n + '  (' + pct(okHls) + ')');
    return { n, man, des, sg, ok302, okHls };
}

(async () => {
    const muestra = JSON.parse(fs.readFileSync(MUESTRA, 'utf8'));
    console.log('='.repeat(72));
    console.log('SONDA DE SALUD — pipe aplicado tal cual');
    console.log('muestra: ' + MUESTRA + '   concurrencia: ' + CONC + '   segmentos: ' + SEGN);
    console.log('='.repeat(72));
    for (const [host, uris] of Object.entries(muestra)) {
        // line tiene max_connections=1: se sondea en serie para no provocar 509 falsos
        const conc = /tivi-ott/.test(host) ? 1 : Math.max(1, CONC);
        console.log('\n>>> ' + host + '  (' + uris.length + ' URIs, concurrencia ' + conc + ')');
        const res = await runHost(host, uris, conc);
        summarize(host, res);
    }
})();
