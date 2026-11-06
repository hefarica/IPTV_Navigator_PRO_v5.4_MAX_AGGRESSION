#!/usr/bin/env node
/**
 * pipe_replay.js — reproduce EXACTAMENTE lo que hace un player con una URI con
 * pipe: parte la linea en URL + headers, manda esos headers tal cual (sin
 * decodificar el Referer), sigue el 302 y pide el primer segmento con Range
 * para medir 200/206/302 reales.
 *
 * POR QUE EXISTE
 *   El pipe es lo que el player lee. KODIPROP/EXTVLCOPT son metadata de Kodi/VLC.
 *   Si el Referer del pipe esta roto, se rompe para TODOS los players; si solo
 *   esta roto en EXTVLCOPT, se rompe solo en VLC. Hay que medir el pipe.
 *
 * Uso:
 *   node tools/lab/pipe_replay.js --file <lista> --host <host> [--n 10] [--nostrip]
 *   --nostrip : NO aplica el pipe (control) para separar causa de sintoma
 */
'use strict';
const fs = require('fs');
const readline = require('readline');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const has = (k) => args.includes(k);
const FILE = get('--file');
const HOSTF = get('--host');
const N = parseInt(get('--n') || '10', 10);
const NOSTRIP = has('--nostrip');
const MS = parseInt(get('--ms') || '15000', 10);
if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file'); process.exit(2); }

const keep = new http.Agent({ keepAlive: true, maxSockets: 4 });
const keeps = new https.Agent({ keepAlive: true, maxSockets: 4 });

function raw(method, urlStr, headers, extra) {
    return new Promise((resolve) => {
        let u;
        try { u = new URL(urlStr); } catch { return resolve({ err: 'BADURL' }); }
        const isHttps = u.protocol === 'https:';
        const mod = isHttps ? https : http;
        const t0 = Date.now();
        let done = false;
        const fin = (o) => { if (!done) { done = true; resolve({ ...o, ms: Date.now() - t0 }); } };

        const r = mod.request({
            method, hostname: u.hostname, port: u.port || (isHttps ? 443 : 80),
            path: u.pathname + (u.search || ''),
            headers, agent: isHttps ? keeps : keep,
            rejectUnauthorized: false, timeout: MS,
        }, (res) => {
            const bufs = []; let total = 0;
            res.on('data', (c) => {
                total += c.length;
                if (bufs.length < 8) bufs.push(c);
                if (total > 262144) { res.destroy(); fin({ code: res.statusCode, h: res.headers, body: Buffer.concat(bufs), size: total }); }
            });
            res.on('end', () => fin({ code: res.statusCode, h: res.headers, body: Buffer.concat(bufs), size: total }));
            res.on('error', (e) => fin({ code: res.statusCode, h: res.headers, err: e.code || e.message }));
        });
        r.on('timeout', () => { r.destroy(); fin({ err: 'TIMEOUT' }); });
        r.on('error', (e) => fin({ err: e.code || e.message }));
        if (extra) for (const [k, v] of Object.entries(extra)) r.setHeader(k, v);
        r.end();
    });
}

/** Parte una linea con pipe en {url, headers} como hace un player. */
function splitPipe(line) {
    const i = line.indexOf('|');
    if (i === -1) return { url: line, headers: {}, pipe: null };
    const url = line.slice(0, i);
    const headers = {};
    const order = [];
    for (const p of line.slice(i + 1).split('&')) {
        const e = p.indexOf('=');
        if (e < 0) continue;
        const k = p.slice(0, e);
        const v = p.slice(e + 1);       // SIN decodificar: el player manda literal
        headers[k] = v;
        order.push(k);
    }
    return { url, headers, pipe: order.join('&') };
}

function firstSegment(manifestText, baseUrl) {
    const lines = manifestText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length || !/^#EXTM3U/.test(lines[0])) return null;
    // master?
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].startsWith('#')) continue;
                return { kind: 'master', uri: new URL(lines[j], baseUrl).toString() };
            }
        }
    }
    // media: primer URI que no sea tag
    for (const l of lines) {
        if (l.startsWith('#')) continue;
        return { kind: 'media', uri: new URL(l, baseUrl).toString() };
    }
    return null;
}

(async () => {
    const picks = [];
    const rl = readline.createInterface({
        input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });
    for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (!/^https?:\/\//i.test(line)) continue;
        let h;
        try { h = new URL(line.split('|')[0]).hostname; } catch { continue; }
        if (HOSTF && !h.includes(HOSTF)) continue;
        picks.push(line);
        if (picks.length >= N) break;
    }
    rl.close();

    console.log('='.repeat(88));
    console.log('REPLAY DEL PIPE  (lo que el player manda de verdad)');
    console.log('URLs      : ' + picks.length + '   host filtro: ' + (HOSTF || '(todos)'));
    console.log('pipe      : ' + (NOSTRIP ? 'NO aplicado (control)' : 'aplicado tal cual'));
    console.log('='.repeat(88));

    const counts = { manifest302: 0, manifest200: 0, manifestOther: 0, seg206: 0, seg200: 0, segOther: 0, timeout: 0 };

    for (let i = 0; i < picks.length; i++) {
        const line = picks[i];
        const { url, headers, pipe } = splitPipe(line);
        const tag = '#' + String(i + 1).padStart(2);

        const hdrs = NOSTRIP
            ? { 'User-Agent': 'VLC/3.0.24 LibVLC/3.0.24', 'Accept': '*/*', 'Accept-Encoding': 'identity' }
            : headers;

        // 1) manifest
        const m = await raw('GET', url, hdrs);
        if (m.err) { counts.timeout++; console.log(tag + ' manifest   ERROR ' + m.err); continue; }
        const loc = m.h && m.h.location;
        console.log(tag + ' manifest   ' + m.code + (loc ? '  -> ' + String(loc).slice(0, 70) + '…' : '') + '   (' + m.ms + 'ms)');
        if (m.code === 302) counts.manifest302++;
        else if (m.code === 200) counts.manifest200++;
        else counts.manifestOther++;

        // 2) seguir el 302 con LOS MISMOS headers del pipe
        let mUrl = url, mBody = m.body;
        if (m.code >= 300 && m.code < 400 && loc) {
            mUrl = new URL(loc, url).toString();
            const m2 = await raw('GET', mUrl, hdrs);
            if (m2.err) { counts.timeout++; console.log(tag + '   destino    ERROR ' + m2.err); continue; }
            console.log(tag + '   destino  ' + m2.code + '  (' + m2.size + 'B, ' + m2.ms + 'ms)');
            mBody = m2.body;
        }

        const txt = (mBody || Buffer.alloc(0)).toString('utf8');
        const seg = firstSegment(txt, mUrl);
        if (!seg) {
            console.log(tag + '   manifest NO es HLS valido. primera linea: ' + JSON.stringify(txt.split('\n')[0].slice(0, 60)));
            continue;
        }
        let segUri = seg.uri;
        if (seg.kind === 'master') {
            const v = await raw('GET', segUri, hdrs);
            const vt = (v.body || Buffer.alloc(0)).toString('utf8');
            const s2 = firstSegment(vt, segUri);
            if (!s2) { console.log(tag + '   variante sin segmentos'); continue; }
            segUri = s2.uri;
            console.log(tag + '   variante  ' + v.code + '  -> segmento');
        }

        // 3) primer segmento con Range (206)
        const s = await raw('GET', segUri, { ...hdrs, 'Range': 'bytes=0-1023' });
        if (s.err) { counts.timeout++; console.log(tag + '   segmento   ERROR ' + s.err); continue; }
        const cr = s.h && (s.h['content-range'] || '');
        if (s.code === 206) counts.seg206++;
        else if (s.code === 200) counts.seg200++;
        else counts.segOther++;
        console.log(tag + '   segmento ' + s.code + '  ' + s.size + 'B  ' + (cr ? 'Content-Range=' + cr : '') + '  (' + s.ms + 'ms)');
    }

    console.log('');
    console.log('='.repeat(88));
    console.log('RESUMEN');
    console.log('  manifest 302 : ' + counts.manifest302);
    console.log('  manifest 200 : ' + counts.manifest200);
    console.log('  manifest otro: ' + counts.manifestOther);
    console.log('  segmento 206 : ' + counts.seg206);
    console.log('  segmento 200 : ' + counts.seg200);
    console.log('  segmento otro: ' + counts.segOther);
    console.log('  timeouts     : ' + counts.timeout);
    console.log('='.repeat(88));
})();
