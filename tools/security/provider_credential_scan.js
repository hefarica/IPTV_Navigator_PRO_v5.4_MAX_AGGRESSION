#!/usr/bin/env node
'use strict';

// [2026-11-08] Gate de CREDENCIALES DE PROVEEDOR en ficheros versionados.
//
// Motivo: docs/security/SECRET_EXPOSURE_20261108.md midió 19 ficheros trackeados con un par
// usuario/clave de Xtream real. Rotar es del operador, pero el repositorio debe dejar de CRECER.
//
// Funcionamiento (trinquete / ratchet):
//   - escanea los ficheros trackeados de git
//   - detecta la firma Xtream: URL con 4 segmentos de path  host/usuario/clave/<stream_id>
//   - compara con la linea base (tools/security/provider_credential_baseline.json)
//   - exit 0 si no aparece NINGUN fichero nuevo
//   - exit 1 si aparece uno nuevo  -> el cambio que lo introduce se rechaza
//   - exit 2 si el entorno no permite medir (no hay git, etc.)  -> NO se declara verde
//
// No exige que las 19 históricas desaparezcan de golpe: eso depende de la rotación. Exige que
// ninguna nueva entre. Cuando el operador rote y limpie, la linea base se regenera con --update.
//
// Uso:
//   node tools/security/provider_credential_scan.js            # verifica
//   node tools/security/provider_credential_scan.js --update   # regenera la linea base

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const BASELINE = path.join(__dirname, 'provider_credential_baseline.json');
const MAX_BYTES = 8 * 1024 * 1024; // no leer monstruos binarios

// Hosts de ejemplo/documentacion: NO son proveedores.
const ALLOW_HOSTS = [
    'audit.invalid', 'example.com', 'example.org', 'test.invalid', 'invalid',
    'localhost', '127.0.0.1', '0.0.0.0', '[::1]',
    'iptv-ape.duckdns.org', 'duckdns.org', 'github.com', 'npmjs.com',
    'rfc-editor.org', 'w3.org', 'mozilla.org', 'ffmpeg.org',
    'socket.io', 'cdn.jsdelivr.net', 'unpkg.com', 'jquery.com'
];

// host / seg1 / seg2 / <id numerico> [.ext]  ->  firma Xtream
const XTREAM = /https?:\/\/([^/\s"'<>)\\|]+)\/([^/\s"'<>)\\|]{2,32})\/([^/\s"'<>)\\|]{2,32})\/(\d{1,12})(?=[.\/?#\s"'<>)\\|]|$)/g;

function trackedFiles() {
    const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\n').map(s => s.trim()).filter(Boolean);
}

function scan() {
    let files;
    try { files = trackedFiles(); } catch (e) {
        console.error('NO COMPUTADO: git no disponible -> ' + e.message);
        process.exit(2);
    }
    const hits = {};
    let scanned = 0;
    for (const rel of files) {
        const abs = path.join(ROOT, rel);
        let st;
        try { st = fs.statSync(abs); } catch (_e) { continue; }
        if (!st.isFile() || st.size > MAX_BYTES) continue;
        let txt;
        try { txt = fs.readFileSync(abs, 'utf8'); } catch (_e) { continue; }
        scanned++;
        if (txt.indexOf('://') < 0) continue;
        let n = 0;
        XTREAM.lastIndex = 0;
        let m;
        while ((m = XTREAM.exec(txt)) !== null) {
            const host = m[1].toLowerCase().split(':')[0];
            if (ALLOW_HOSTS.some(a => host === a || host.endsWith('.' + a))) continue;
            n++;
        }
        if (n > 0) hits[rel] = n;
    }
    return { hits, scanned, total: files.length };
}

function main() {
    const update = process.argv.includes('--update');
    const { hits, scanned, total } = scan();
    const names = Object.keys(hits).sort();
    const totalHits = names.reduce((a, f) => a + hits[f], 0);

    if (update) {
        fs.writeFileSync(BASELINE, JSON.stringify({
            schema: 'ape.security/provider-credential-baseline/1',
            note: 'Ficheros trackeados con firma Xtream (usuario/clave en el path). Ratchet: nadie nuevo.',
            measured_at: new Date().toISOString(),
            files: hits
        }, null, 2) + '\n', 'utf8');
        console.log('linea base escrita: ' + names.length + ' ficheros, ' + totalHits + ' URIs');
        process.exit(0);
    }

    let baseline = { files: {} };
    if (fs.existsSync(BASELINE)) {
        baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    } else {
        console.error('NO COMPUTADO: falta la linea base ' + BASELINE);
        process.exit(2);
    }

    const known = Object.keys(baseline.files || {});
    const nuevos = names.filter(f => !known.includes(f));
    const conocidosQueSiguen = names.filter(f => known.includes(f));
    const resueltos = known.filter(f => !names.includes(f));

    console.log('escaneados ' + scanned + '/' + total + ' ficheros trackeados');
    console.log('firma Xtream: ' + names.length + ' ficheros, ' + totalHits + ' URIs (linea base: ' + known.length + ')');
    if (resueltos.length) console.log('  resueltos desde la linea base: ' + resueltos.length + ' (bien)');

    if (nuevos.length === 0) {
        console.log('\nVEREDICTO: SIN_FUGA_NUEVA');
        console.log('  conocidos que siguen: ' + conocidosQueSiguen.length + ' (pendientes de rotacion del operador)');
        process.exit(0);
    }

    console.log('\nVEREDICTO: FUGA_NUEVA (' + nuevos.length + ')');
    for (const f of nuevos) console.log('  NUEVO  ' + hits[f] + ' URI(s)  ' + f);
    console.log('\nUn fichero versionado con usuario/clave de Xtream da acceso a TODOS los canales del servidor.');
    console.log('Usa un host no resolvible (audit.invalid) en el fixture, o saca el fichero del control de versiones.');
    console.log('Ver docs/security/SECRET_EXPOSURE_20261108.md');
    process.exit(1);
}

main();
