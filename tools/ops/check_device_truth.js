#!/usr/bin/env node
'use strict';
/*
 * check_device_truth.js — consumidor del veredicto del watchdog de device.
 *
 * POR QUE EXISTE (medido 2026-11-22 01:41 local / 06:41:46Z):
 *   El watchdog (tarea programada APE-Device-Watchdog) escribia LATEST.json y ALERTA.txt
 *   cada 4-6 min con VEREDICTO=SIN_MEDIDA porque adb no encontraba 192.168.1.3:5555.
 *   Nada leia ese veredicto: era una alerta sin consumidor. Este script es el consumidor.
 *
 * CONTRATO:
 *   exit 0  veredicto OK            -> medido y verde
 *   exit 2  veredicto SIN_*         -> NO se pudo medir (NO es un sistema sano)
 *   exit 1  veredicto ROTO/DEGRADADO, o JSON ilegible/ausente
 *
 * Uso:
 *   node tools/ops/check_device_truth.js [ruta/LATEST.json]
 *
 * LIMITE DECLARADO: no arregla el device ni reintenta el adb. Solo lee lo que el
 * watchdog ya midio. Si el device esta offline, este script devuelve 2 y eso es
 * correcto: no se inventa un verde.
 */
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join('artifacts', 'device-truth', 'LATEST.json');

function fail(code, line, extra) {
    console.log(line);
    if (extra) console.log(extra);
    process.exit(code);
}

if (!fs.existsSync(target)) {
    fail(1, 'NO DATA: no existe ' + target, 'Sin LATEST.json no hay veredicto. Ausencia de dato no es cero.');
}

let j;
try {
    /* [2026-11-22 · MEDIDO] El watchdog escribe LATEST.json con BOM UTF-8 (0xEF 0xBB 0xBF,
     * tipico de Out-File/Set-Content de PowerShell en Windows). JSON.parse lo rechaza
     * ("Unexpected token '\uFEFF'"). Se tolera el BOM al leer; el defecto real esta en el
     * escritor y se reporta aparte — no se parchea el productor desde el consumidor. */
    const raw = fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, '');
    j = JSON.parse(raw);
} catch (e) {
    fail(1, 'ILEGIBLE: ' + target + ' — ' + (e && e.message));
}

const verdict = String(j.verdict || '').toUpperCase();
const reason = j.reason ? String(j.reason) : '';
const ts = j.ts ? String(j.ts) : '(sin ts)';
const device = j.device ? String(j.device) : '(sin device)';

const line = 'device=' + device + ' ts=' + ts + ' verdict=' + (verdict || '(vacio)') +
    (reason ? ' reason="' + reason + '"' : '');

if (verdict === 'OK') {
    console.log('OK  ' + line);
    process.exit(0);
}

if (verdict.startsWith('SIN_') || verdict === 'SIN_MEDIDA' || verdict === 'SIN_MEDICION') {
    fail(2, 'ALERTA  ' + line, 'SIN_MEDIDA no es un sistema sano: no se pudo medir. El device debe volver a responder por adb.');
}

fail(1, 'FALLA  ' + line, 'El veredicto no es OK. Ver artifacts/device-truth/incidentes.log y ALERTA.txt.');
