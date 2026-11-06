#!/usr/bin/env node
/**
 * header_and_logo.js — dos censos que PowerShell no puede hacer sin manglear
 * los escapes de las comillas:
 *   1. tags #EXT-X-SERVER-N y #EXT-X-SYS-SERVER-* del header (pool declarado
 *      vs hosts reales de la lista)
 *   2. dominios usados en tvg-logo
 *
 * Uso: node tools/lab/header_and_logo.js --file <lista.m3u8>
 */
'use strict';
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file'); process.exit(2); }

(async () => {
    // ── pasada unica: header (primeras 300 lineas) + logos de todos los EXTINF
    const rl = readline.createInterface({
        input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    const srv = new Map();
    const sysTags = [];
    const dom = new Map();
    const logoUrls = new Map();
    let extinf = 0, sinLogo = 0, i = 0;

    const tvgLogoRe = /\btvg-logo="([^"]*)"/;

    for await (const raw of rl) {
        i++;
        const s = raw.trim();

        if (i <= 300 && s.startsWith('#EXT-X-SERVER-')) {
            const m = s.match(/^#EXT-X-SERVER-([0-9]+):(.*)$/);
            if (m) srv.set(m[1], m[2]);
        }
        if (i <= 300 && s.startsWith('#EXT-X-SYS-SERVER')) sysTags.push(s);

        if (s.startsWith('#EXTINF')) {
            extinf++;
            const m = s.match(tvgLogoRe);
            if (!m || !m[1]) { sinLogo++; continue; }
            let h = '?';
            try { h = new URL(m[1]).hostname; } catch { h = '(no-url)'; }
            dom.set(h, (dom.get(h) || 0) + 1);
            if (logoUrls.size < 40) {
                if (!logoUrls.has(m[1])) logoUrls.set(m[1], 0);
                logoUrls.set(m[1], logoUrls.get(m[1]) + 1);
            }
        }
    }

    console.log('='.repeat(78));
    console.log('1) POOL DE SERVIDORES DECLARADO EN EL HEADER');
    console.log('='.repeat(78));
    if (!srv.size) console.log('  #EXT-X-SERVER-N : NINGUNO');
    else for (const [k, v] of [...srv].sort((a, b) => +a[0] - +b[0])) console.log('  SERVER-' + k + '  ->  ' + v);
    console.log('');
    for (const s of sysTags) console.log('  ' + s);

    console.log('');
    console.log('='.repeat(78));
    console.log('2) tvg-logo');
    console.log('='.repeat(78));
    console.log('  EXTINF totales      : ' + extinf);
    console.log('  EXTINF sin logo     : ' + sinLogo);
    console.log('  dominios distintos  : ' + dom.size);
    const t = [...dom].sort((a, b) => b[1] - a[1]);
    for (const [h, c] of t.slice(0, 15)) console.log('      ' + String(c).padStart(7) + '  ' + h);
    if (t.length > 15) console.log('      ... ' + (t.length - 15) + ' dominios mas');
    console.log('');
    console.log('  URLs de logo mas repetidas (muestra):');
    const lu = [...logoUrls].sort((a, b) => b[1] - a[1]).slice(0, 8);
    for (const [u, c] of lu) console.log('      ' + String(c).padStart(7) + '  ' + u.slice(0, 90));
})();
