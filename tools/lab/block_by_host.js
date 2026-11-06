#!/usr/bin/env node
/**
 * block_by_host.js — extrae un bloque completo por host y muestra SOLO las
 * lineas que construyen la conexion (EXTINF, STREAM-INF, EXTHTTP, KODIPROP,
 * EXTVLCOPT de red, y la URI final).
 *
 * Uso: node tools/lab/block_by_host.js --file <lista> [--host <host>]
 */
'use strict';
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
const HOST = get('--host');
if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file'); process.exit(2); }

const RX_CONN = /^#EXTINF|^#EXT-X-STREAM-INF|^#EXTHTTP|manifest_headers|^#EXTVLCOPT:http-|^https?:\/\//i;
const RX_HOST = HOST ? new RegExp(HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

(async () => {
    const rl = readline.createInterface({
        input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    const seen = new Set();
    let block = [];        // lineas del bloque en curso
    let inBlock = false;
    let n = 0;

    const flush = () => {
        if (!block.length) return;
        // el host de este bloque: primera URI que matchee
        let bloquHost = null;
        for (const l of block) {
            const m = l.match(/^https?:\/\/([^\/|]+)/i);
            if (m) { bloquHost = m[1]; break; }
        }
        if (!bloquHost) { block = []; return; }
        const key = RX_HOST ? (RX_HOST.test(bloquHost) ? bloquHost : null) : bloquHost;
        if (!key || seen.has(key)) { block = []; return; }

        seen.add(key);
        const name = (block.find(l => l.startsWith('#EXTINF')) || '').slice(0, 160);
        console.log('');
        console.log('═'.repeat(76));
        console.log('HOST   : ' + bloquHost);
        console.log('LINEAS : ' + block.length);
        console.log('EXTINF : ' + name);
        console.log('═'.repeat(76));
        let ln = 0;
        for (const l of block) {
            ln++;
            if (!RX_CONN.test(l)) continue;
            console.log(String(ln).padStart(5) + ' | ' + l.slice(0, 460));
        }
        block = [];
    };

    for await (const raw of rl) {
        n++;
        const line = raw.trim();

        if (line.startsWith('#EXTINF')) {
            if (inBlock) flush();
            inBlock = true;
            block = [line];
            continue;
        }
        if (!inBlock) continue;

        block.push(line);

        // la URI final cierra el bloque
        if (/^https?:\/\//i.test(line)) {
            flush();
            inBlock = false;
            // parar cuando ya tenemos todos los hosts pedidos
            if (!RX_HOST && seen.size >= 2) break;
            if (RX_HOST && seen.size >= 1) break;
        }
    }
    if (inBlock) flush();
})();
