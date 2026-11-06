#!/usr/bin/env node
/**
 * url_forensics.js — forense de la construccion de URLs por servidor.
 * Lee una .m3u8 en streaming (no carga 1.3 GB en RAM) y descompone cada URI
 * en scheme/host/puerto/segmentos/extension/query.
 *
 * Reporta la PLANTILLA de path por host: "live/{user}/{pass}/{id}.m3u8?token=..."
 * para que se vea si el metodo de conexion de cada servidor es el que toca.
 *
 * Uso: node tools/lab/url_forensics.js "C:\ruta\lista.m3u8"
 */
'use strict';
const fs = require('fs');
const readline = require('readline');

const path = process.argv[2];
if (!path) { console.error('Falta ruta'); process.exit(2); }

// Clasifica un segmento de path en su TIPO estructural.
function segType(s) {
    if (s === '') return 'EMPTY';
    if (/^[0-9]+$/.test(s)) return 'NUM';
    if (/^[0-9]+\.(ts|m3u8|mp4|mkv|m4s)$/i.test(s)) return 'NUM.EXT';
    if (/^live$/i.test(s)) return 'KW:live';
    if (/^movie$/i.test(s)) return 'KW:movie';
    if (/^series$/i.test(s)) return 'KW:series';
    if (/^timeshift$/i.test(s)) return 'KW:timeshift';
    if (/^stream$/i.test(s)) return 'KW:stream';
    if (/^hls$/i.test(s)) return 'KW:hls';
    if (/^[A-Za-z0-9]{1,32}$/.test(s)) return 'ALNUM';
    return 'LIT:' + s.slice(0, 40);
}

function extOf(p) {
    const base = p.split('/').pop() || '';
    const m = base.match(/\.([A-Za-z0-9]{1,6})$/);
    return m ? '.' + m[1].toLowerCase() : '(sin ext)';
}

const byHost = new Map();   // host -> stats
let totalUrls = 0;
let unparsed = 0;

function bucket(host) {
    let b = byHost.get(host);
    if (!b) {
        b = {
            host, n: 0, schemes: new Set(), ports: new Set(),
            templates: new Map(),   // firma -> count
            exts: new Map(),
            queryKeys: new Map(),   // clave -> count
            queryRaw: new Map(),    // raw sample -> count
            users: new Set(), passes: new Set(), ids: new Set(),
            sampleUrl: null, sampleUrl2: null,
            withPipe: 0, withToken: 0,
            segmentsLen: new Map(),
        };
        byHost.set(host, b);
    }
    return b;
}

(async () => {
    const rl = readline.createInterface({
        input: fs.createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (!/^https?:\/\//i.test(line)) continue;

        totalUrls++;
        // Separar el pipe de player (URL + "|User-Agent=...")
        let urlPart = line;
        let pipePart = '';
        const pipeIdx = line.indexOf('|');
        if (pipeIdx !== -1) { urlPart = line.slice(0, pipeIdx); pipePart = line.slice(pipeIdx + 1); }

        let u;
        try { u = new URL(urlPart); } catch { unparsed++; continue; }

        const b = bucket(u.hostname);
        b.n++;
        b.schemes.add(u.protocol.replace(':', ''));
        b.ports.add(u.port || '(default)');
        if (pipePart) b.withPipe++;
        if (/token=/i.test(urlPart)) b.withToken++;
        if (!b.sampleUrl) b.sampleUrl = line;

        const segs = u.pathname.split('/').filter((_, i) => true); // conservar el primero vacio
        const clean = u.pathname.split('/').slice(1);              // sin el vacio inicial
        b.segmentsLen.set(clean.length, (b.segmentsLen.get(clean.length) || 0) + 1);

        // Firma estructural
        const sig = clean.map(segType).join('/');
        const tpl = (u.protocol.replace(':', '')) + '://' + u.hostname +
            (u.port ? ':' + u.port : '') + '/' + sig + extOf(u.pathname);
        b.templates.set(tpl, (b.templates.get(tpl) || 0) + 1);
        b.exts.set(extOf(u.pathname), (b.exts.get(extOf(u.pathname)) || 0) + 1);

        // Credenciales: Xtream = {user}/{pass}/{id}
        // Detectar por posicion: los ultimos 3 (o 2) segmentos.
        // Heuristica: si hay un segmento numerico al final -> id, y los dos previos son user/pass.
        const nums = clean.map((s, i) => (/^\d+/.test(s) ? i : -1)).filter(i => i >= 0);
        if (nums.length) {
            const idIdx = nums[nums.length - 1];
            const id = clean[idIdx].replace(/\.[A-Za-z0-9]+$/, '');
            b.ids.add(id);
            if (idIdx >= 2) {
                b.users.add(clean[idIdx - 2]);
                b.passes.add(clean[idIdx - 1]);
            }
        }

        // Query
        if (u.search) {
            for (const [k, v] of u.searchParams) {
                b.queryKeys.set(k, (b.queryKeys.get(k) || 0) + 1);
                if (k.toLowerCase().includes('token') || k.toLowerCase().includes('key')) {
                    b.queryRaw.set(k + '=' + '«' + (v ? v.length : 0) + ' chars»',
                        (b.queryRaw.get(k + '=' + '«' + (v ? v.length : 0) + ' chars»') || 0) + 1);
                } else {
                    b.queryRaw.set(k + '=' + v, (b.queryRaw.get(k + '=' + v) || 0) + 1);
                }
            }
        }
    }

    // ── Reporte ───────────────────────────────────────────────────────────
    const out = [];
    const P = s => out.push(s);

    P('='.repeat(78));
    P('FORENSE DE CONSTRUCCION DE URLs');
    P('archivo : ' + path);
    P('bytes   : ' + fs.statSync(path).size);
    P('URIs    : ' + totalUrls + '   no parseables: ' + unparsed);
    P('hosts   : ' + byHost.size);
    P('='.repeat(78));

    const order = [...byHost.values()].sort((a, b) => b.n - a.n);

    for (const b of order) {
        P('');
        P('─'.repeat(78));
        P('HOST  ' + b.host + '   (' + b.n + ' URLs)');
        P('─'.repeat(78));
        P('  scheme        : ' + [...b.schemes].join(','));
        P('  puerto        : ' + [...b.ports].join(','));
        P('  con pipe      : ' + b.withPipe + ' / ' + b.n);
        P('  con token     : ' + b.withToken + ' / ' + b.n);
        P('  ids unicos    : ' + b.ids.size);
        P('  users unicos  : ' + b.users.size + (b.users.size === 1 ? '  → [' + [...b.users][0] + ']' : ''));
        P('  passes unicos : ' + b.passes.size);
        P('  segmentos     : ' + [...b.segmentsLen.entries()].map(([k, v]) => k + '→' + v).join('  '));

        P('  extensiones   :');
        for (const [e, c] of [...b.exts].sort((x, y) => y[1] - x[1]))
            P('      ' + e.padEnd(12) + c);

        P('  PLANTILLAS de path  (scheme://host/ TIPO/TIPO/.../EXT):');
        const tpls = [...b.templates].sort((x, y) => y[1] - x[1]);
        for (const [t, c] of tpls) P('      ' + String(c).padStart(7) + '  ' + t);
        if (tpls.length > 12) P('      ... ' + (tpls.length - 12) + ' plantillas mas');

        if (b.queryKeys.size) {
            P('  query params  :');
            for (const [k, c] of [...b.queryKeys].sort((x, y) => y[1] - x[1]))
                P('      ' + k.padEnd(20) + c);
        }
        if (b.queryRaw.size) {
            P('  query valores (muestra, max 20):');
            let i = 0;
            for (const [k, c] of [...b.queryRaw].sort((x, y) => y[1] - x[1])) {
                P('      ' + String(c).padStart(7) + '  ' + k);
                if (++i >= 20) break;
            }
        }
        P('  URL ejemplo   :');
        P('      ' + (b.sampleUrl || '').slice(0, 400));
    }

    // ── Credenciales: comparar entre hosts ────────────────────────────────
    P('');
    P('='.repeat(78));
    P('CREDENCIALES POR HOST');
    P('='.repeat(78));
    for (const b of order) {
        const u = [...b.users], p = [...b.passes];
        P('  ' + b.host.padEnd(32) + 'users=' + u.length + ' passes=' + p.length +
            '   user=[' + u.map(x => x.slice(0, 24)).join(',') + ']');
        P('  ' + ''.padEnd(32) + 'pass=[' + p.map(x => x ? x.slice(0, 6) + '…(' + x.length + ')' : '').join(',') + ']');
    }

    // ── Duplicados de stream_id dentro de cada host ───────────────────────
    P('');
    P('='.repeat(78));
    P('RESUMEN');
    P('='.repeat(78));
    const totalIds = order.reduce((s, b) => s + b.ids.size, 0);
    const totalUrlCount = order.reduce((s, b) => s + b.n, 0);
    P('  URLs totales          : ' + totalUrlCount);
    P('  stream_id unicos      : ' + totalIds);
    P('  hosts                 : ' + byHost.size);
    P('');

    console.log(out.join('\n'));
})();
