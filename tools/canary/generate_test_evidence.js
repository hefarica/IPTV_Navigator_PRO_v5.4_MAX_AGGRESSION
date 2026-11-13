#!/usr/bin/env node
'use strict';

// [2026-11-13] Entregable 11 del mandato: CANARY_TEST_EVIDENCE.json
//
// Ejecuta TODOS los gates y registra el resultado real de cada uno: comando, exit code,
// ultima linea de salida y veredicto. No inventa: si un gate no existe o falla, lo dice.
//
// Lo que este fichero NO es: no es una estimacion ni un resumen de prosa. Es la salida
// cruda de haber ejecutado los gates en esta maquina, con su exit code.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'docs/audits/CANARY_TEST_EVIDENCE.json');

const GATES = [
    // [id, archivo, necesita LABV24, que prueba]
    ['anti_degradation', 'tools/check_anti_degradation_policy.js', false, 'Ninguna ruta degrada 4K a FHD/HD/SD, HEVC a H264, HDR a SDR ni recorta fps/bitrate'],
    ['crystal_4k', 'tools/check_crystal_4k_law.js', false, 'Ley Crystal 4K: la mejora es obligatoria y se declara como declaracion, no como ejecucion'],
    ['crystal_6k', 'tools/check_crystal_6k_law.js', false, 'Ley Crystal 6K: opt-in, nunca declarar 6K falso, nunca degradar 4K'],
    ['display_cadence', 'tools/quality/test_display_cadence.js', false, 'Display4K no pisa la cadencia elegida; discriminador de multiplo exacto con tolerancia 1e-4'],
    ['variant_select', 'tools/quality/test_variant_select.js', false, 'Seleccion de variante: reordena por area de RESOLUTION, nunca elimina ni reescribe atributos'],
    ['caps_contract', 'tools/quality/test_caps_contract.js', false, 'Contrato APK <-> soc_gate del VPS: ai_sr se reporta y el gate lo lee'],
    ['soc_vocabulary', 'tools/quality/check_soc_vocabulary.js', false, 'El vocabulario de SoC es identico en los 10 sitios y 4 runtimes donde esta copiado'],
    ['soc_normalization', 'tools/quality/test_soc_normalization.js', false, 'AMLS905Y4 -> amlogic: el SoC crudo del aparato pasa el gate canonico'],
    ['6k_source_honest', 'tools/quality/test_6k_source_honest.js', true, 'El 6K emulado se calcula sobre la fuente MEDIDA; sin sonda declara UNKNOWN, nunca asume 1080p'],
    ['composition_policy', 'tools/quality/test_composition_policy.js', false, 'Politica de composicion: allowlist, tope 1080p del firmware, excepcion de creacion solo para geometria'],
    ['e2e_playlist_v24', 'IPTV_v5.4_MAX_AGGRESSION/frontend/tests/rea-v24-e2e-playlist.js', true, 'E2E del generador en tres regimenes: legacy, REA sin opt-in y REA con opt-in']
];

const labPath = path.join(ROOT, 'artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json');
const env = Object.assign({}, process.env);
if (fs.existsSync(labPath)) env.LABV24 = labPath;

function sha256File(p) {
    try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (e) { return null; }
}

const resultados = [];
let pasan = 0, fallan = 0, ausentes = 0;

for (const [id, rel, necesitaLab, prueba] of GATES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
        resultados.push({ id, gate: rel, estado: 'AUSENTE', prueba, evidencia: 'el fichero no existe' });
        ausentes++;
        continue;
    }
    if (necesitaLab && !env.LABV24) {
        resultados.push({ id, gate: rel, estado: 'BLOQUEADO', prueba, evidencia: 'falta LABV24: artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json' });
        ausentes++;
        continue;
    }
    let salida = '', exit = 0;
    try {
        salida = execFileSync(process.execPath, [abs], { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
        exit = (e && typeof e.status === 'number') ? e.status : 1;
        salida = String((e && (e.stdout || '')) + (e && (e.stderr || '')));
    }
    const lineas = salida.trim().split(/\r?\n/).filter(Boolean);
    const ultima = lineas.length ? lineas[lineas.length - 1].trim() : '';
    // El veredicto sale del exit code, NO de buscar la palabra PASS en la salida.
    const ok = exit === 0;
    if (ok) pasan++; else fallan++;
    resultados.push({
        id,
        gate: rel,
        estado: ok ? 'PASS' : 'FAIL',
        exit_code: exit,
        prueba,
        ultima_linea: ultima.slice(0, 200),
        lineas_salida: lineas.length,
        sha256_gate: sha256File(abs)
    });
}

const evidencia = {
    schema: 'ape.canary.test-evidence.v1',
    generado: new Date().toISOString(),
    maquina: 'Windows, node ' + process.version,
    metodo: 'cada gate se ejecuta con node; el veredicto se toma del exit code, no de buscar PASS en el texto',
    lab_v24: fs.existsSync(labPath) ? { ruta: 'artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json', sha256: sha256File(labPath) } : null,
    resumen: { total: GATES.length, pasan, fallan, ausentes },
    gates: resultados,
    limites: [
        'Estos gates prueban LOGICA y CONTRATOS, no pixeles. Que esten verdes no significa que la imagen se vea mejor.',
        'Ninguno de estos gates se ha ejecutado contra el aparato del operador: son estaticos, sobre el repositorio.',
        'La ausencia de un gate BLOQUEADO no es un fallo del codigo; es un dato que falta, y se reporta como tal.'
    ]
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(evidencia, null, 2), 'utf8');

console.log('gates ejecutados : ' + GATES.length);
console.log('PASS             : ' + pasan);
console.log('FAIL             : ' + fallan);
console.log('AUSENTE/BLOQUEADO: ' + ausentes);
console.log('artefacto        : ' + path.relative(ROOT, OUT));
process.exit(fallan === 0 && ausentes === 0 ? 0 : (fallan > 0 ? 1 : 2));
