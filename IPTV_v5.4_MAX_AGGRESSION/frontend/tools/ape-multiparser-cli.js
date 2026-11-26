#!/usr/bin/env node
'use strict';

/**
 * APE MultiParser CLI v1.0
 *
 * Uso:
 *   node tools/ape-multiparser-cli.js <entrada.m3u8> [salida.zip]
 *   node tools/ape-multiparser-cli.js <entrada.m3u8> [salida.zip] --report reporte.json
 *   node tools/ape-multiparser-cli.js <entrada.m3u8> [salida.zip] --dialects=vlc,kodi,apple
 *
 * No modifica la entrada. Genera un ZIP con los dialectos, sidecars,
 * manifiesto, reporte y README. El reporte no contiene URLs ni credenciales.
 */

const fs = require('fs');
const path = require('path');
const MP = require('../js/ape-v9/ape-multi-parser.js');

function usage() {
    console.log('Uso: node tools/ape-multiparser-cli.js <entrada.m3u8> [salida.zip] [--report reporte.json] [--dialects=vlc,kodi,apple]');
}

function main(argv) {
    const args = argv.slice(2);
    if (!args.length || args[0] === '-h' || args[0] === '--help') {
        usage();
        return 0;
    }

    const input = args[0];
    let output = args[1] && args[1].charAt(0) !== '-' ? args[1] : null;
    let reportPath = null;
    let dialects = null;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--report') {
            reportPath = args[i + 1] || null;
            i++;
        } else if (args[i].indexOf('--dialects=') === 0) {
            dialects = args[i].slice('--dialects='.length).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        }
    }

    if (!fs.existsSync(input)) {
        console.error('No existe el archivo: ' + input);
        return 2;
    }

    const text = fs.readFileSync(input, 'utf8');
    const model = MP.parse(text, { sourceName: path.basename(input) });
    const bundle = MP.buildBundleZip(model, {
        includeSidecars: true,
        dialects: dialects || undefined
    });

    if (!output) {
        output = path.join(
            path.dirname(input),
            'APE_MULTIPLAYER_' + path.basename(input).replace(/\.[^.]+$/, '') + '.zip'
        );
    }

    fs.writeFileSync(output, Buffer.from(bundle.zip));

    console.log('APE MultiParser v' + MP.VERSION);
    console.log('  entrada:   ' + input);
    console.log('  salida:    ' + output);
    console.log('  tipo:      ' + model.kind);
    console.log('  canales:   ' + model.channels.length);
    console.log('  variantes: ' + model.hls.variants.length);
    console.log('  segmentos: ' + model.hls.segments.length);
    console.log('  dialectos: ' + bundle.dialects.length);
    console.log('  bytes:     ' + bundle.zip.length);
    console.log('  cuarentena:' + model.quarantine.length);
    console.log('  c2.a:      ' + bundle.report.anomalies.c2aCount);
    console.log('  403:       ' + bundle.report.anomalies.http403Count);

    if (reportPath) {
        fs.writeFileSync(reportPath, JSON.stringify(bundle.report, null, 2));
        console.log('  reporte:   ' + reportPath);
    }

    return 0;
}

try {
    process.exitCode = main(process.argv);
} catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
}
