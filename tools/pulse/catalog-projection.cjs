#!/usr/bin/env node
/**
 * catalog-projection.cjs — parser de PROYECCIÓN de solo lectura.
 *
 * Entrada: una lista M3U/M3U8 (posiblemente mezclada: #EXTINF + #EXT-X-STREAM-INF
 * + #EXT-X-TARGETDURATION). Salida: una NUEVA lista de catálogo para el player
 * con #EXTM3U + #EXTINF + directivas APE/EXTHTTP/EXTVLCOPT/KODIPROP + UNA URI.
 *
 * NO modifica la entrada. Las líneas master/media que no pertenecen a un catálogo
 * no se pierden: se escriben en un sidecar `<out>.excluded` con su número de línea.
 *
 * Uso:
 *   node catalog-projection.cjs --in lista.m3u8[.gz] --out catalogo.m3u8
 *        [--excluded catalogo.m3u8.excluded] [--stats catalogo.stats.json]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const crypto = require('crypto');

function parseArgs(argv) {
    const a = {};
    for (let i = 2; i < argv.length; i++) {
        const k = argv[i];
        if (!k.startsWith('--')) continue;
        const n = k.slice(2);
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--')) a[n] = true;
        else { a[n] = v; i++; }
    }
    return a;
}

const args = parseArgs(process.argv);
if (!args.in || !args.out) {
    console.error('uso: --in <lista[.gz]> --out <catalogo.m3u8> [--excluded <archivo>] [--stats <json>]');
    process.exit(2);
}
const inPath = String(args.in);
const outPath = String(args.out);
const excludedPath = args.excluded ? String(args.excluded) : outPath + '.excluded';
const statsPath = args.stats ? String(args.stats) : outPath + '.stats.json';
const tmpOut = outPath + '.tmp';
const tmpExcluded = excludedPath + '.tmp';

const DROP = /^#EXT-X-(?:STREAM-INF:|I-FRAME-STREAM-INF:|TARGETDURATION:|MEDIA-SEQUENCE:|DISCONTINUITY-SEQUENCE:|PLAYLIST-TYPE:|MAP:|KEY:|PART:|PART-INF:|SERVER-CONTROL:|PRELOAD-HINT:|RENDITION-REPORT:|ENDLIST|INDEPENDENT-SEGMENTS|MEDIA:|SESSION-DATA:|SESSION-KEY:|START:|DATERANGE:|BYTERANGE:)/;
const tag = (line) => (line.match(/^(#[A-Za-z0-9-]+)/) || [])[1] || '(otra)';

(async () => {
    const input = fs.createReadStream(inPath);
    const source = /\.gz$/i.test(inPath) ? input.pipe(zlib.createGunzip()) : input;
    const out = fs.createWriteStream(tmpOut, { flags: 'w' });
    const excluded = fs.createWriteStream(tmpExcluded, { flags: 'w' });
    const rl = readline.createInterface({ input: source, crlfDelay: Infinity });
    const hashIn = crypto.createHash('sha256');
    const counts = { lines: 0, kept: 0, excluded: 0, extinf: 0, urls: 0, channels: 0 };
    const tags = new Map();
    let headerSeen = false;
    let currentUrls = 0;
    let channels = 0;

    fs.readFileSync(inPath).length; // no carga el contenido; solo verifica que existe

    for await (const raw of rl) {
        const line = String(raw).replace(/\r$/, '');
        counts.lines++;
        hashIn.update(line + '\n');
        if (!headerSeen && /^#EXTM3U(?:[ \t].*)?$/i.test(line)) {
            headerSeen = true;
            out.write(line + '\n');
            counts.kept++;
            continue;
        }
        if (DROP.test(line)) {
            counts.excluded++;
            const t = tag(line);
            tags.set(t, (tags.get(t) || 0) + 1);
            excluded.write(`${counts.lines}\t${line}\n`);
            continue;
        }
        if (line.startsWith('#EXTINF:')) {
            if (channels > 0 && currentUrls === 0) { /* bloque sin URL: se conserva tal cual */ }
            channels++;
            currentUrls = 0;
            counts.extinf++;
        } else if (/^https?:\/\//i.test(line)) {
            currentUrls++;
            counts.urls++;
        }
        out.write(line + '\n');
        counts.kept++;
    }
    counts.channels = channels;
    await new Promise((resolve, reject) => {
        out.end((e) => e ? reject(e) : resolve());
    });
    await new Promise((resolve, reject) => {
        excluded.end((e) => e ? reject(e) : resolve());
    });
    fs.renameSync(tmpOut, outPath);
    fs.renameSync(tmpExcluded, excludedPath);
    if (!headerSeen) {
        console.error('ERROR: la entrada no empieza por #EXTM3U');
        process.exit(3);
    }
    const stats = {
        in: inPath,
        out: outPath,
        excluded: excludedPath,
        sha256_input_lines: hashIn.digest('hex'),
        bytes_in: fs.statSync(inPath).size,
        bytes_out: fs.statSync(outPath).size,
        lines: counts.lines,
        kept: counts.kept,
        excluded: counts.excluded,
        extinf: counts.extinf,
        urls: counts.urls,
        channels: counts.channels,
        excluded_tags: [...tags.entries()].sort((a, b) => b[1] - a[1]),
    };
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 1));
    if (!args.quiet) console.log(JSON.stringify(stats, null, 1));
})();
