#!/usr/bin/env node
'use strict';

/**
 * test_sr_rules_gate.js — Prueba que el gate de superresolucion funciona en LOS
 * DOS SENTIDOS. Un gate que solo sabe decir que no no es un gate: es un muro.
 *
 *   1. Sobre un fixture que CUMPLE las 7 reglas -> exit 0 y lo dice.
 *   2. Sobre un fixture que VIOLA las 7          -> exit 1 y las 7 nombradas.
 *   3. Control negativo: sin declaraciones de SR -> exit 0 y avisa que es
 *      cumplimiento POR AUSENCIA, no una verificacion.
 *   4. El contrato declara las 7 reglas y el gate las implementa todas.
 *
 * Exit 0 = todo pasa. Exit 1 = algo falla.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const GATE = path.join(__dirname, 'check_sr_rules.js');
const CONTRATO = path.join(ROOT, 'contracts', 'super_resolution_rules.json');
const OK_FIX = path.join(ROOT, 'tests', 'fixtures', 'sr_rules_ok.m3u8');
const MAL_FIX = path.join(ROOT, 'tests', 'fixtures', 'sr_rules_mal.m3u8');
const VACIO_FIX = path.join(ROOT, 'tests', 'fixtures', 'sr_rules_vacio.m3u8');

let pass = 0;
let total = 0;

function ok(nombre, cond, detalle) {
  total++;
  if (cond) {
    pass++;
    console.log('PASS ' + nombre + (detalle ? ' · ' + detalle : ''));
  } else {
    console.log('FAIL ' + nombre + (detalle ? ' · ' + detalle : ''));
  }
}

function corre(fichero) {
  const r = spawnSync(process.execPath, [GATE, fichero], { encoding: 'utf8' });
  return { code: r.status, salida: (r.stdout || '') + (r.stderr || '') };
}

// --- 1. Contrato y gate alineados -----------------------------------------
const contrato = JSON.parse(fs.readFileSync(CONTRATO, 'utf8'));
const ids = (contrato.reglas || []).map((r) => r.id);
ok('el contrato declara 7 reglas', ids.length === 7, `${ids.length}: ${ids.join(',')}`);
ok('los ids son SR-R1..SR-R7', ids.join(',') === 'SR-R1,SR-R2,SR-R3,SR-R4,SR-R5,SR-R6,SR-R7');

const fuente = fs.readFileSync(GATE, 'utf8');
const faltan = ids.filter((id) => !fuente.includes(`'${id}':`));
ok('el gate implementa cada regla del contrato', faltan.length === 0,
  faltan.length ? 'faltan: ' + faltan.join(',') : 'las 7');

// --- 2. El fixture que cumple debe pasar ----------------------------------
const rOk = corre(OK_FIX);
ok('fixture que cumple -> exit 0', rOk.code === 0, `exit=${rOk.code}`);
ok('fixture que cumple -> sin violaciones', /Sin fallos/.test(rOk.salida));
ok('fixture que cumple -> las ve como conformes', /cumplen las 7 reglas/.test(rOk.salida));

// --- 3. El fixture que viola debe fallar, con las 7 ------------------------
const rMal = corre(MAL_FIX);
ok('fixture que viola -> exit 1', rMal.code === 1, `exit=${rMal.code}`);
const detectadas = ids.filter((id) => rMal.salida.includes('[' + id + ']'));
ok('fixture que viola -> detecta las 7', detectadas.length === 7,
  `${detectadas.length}/7: ${detectadas.join(',')}`);
ok('fixture que viola -> las nombra', /regla\(s\) violada\(s\)/.test(rMal.salida));

// --- 4. Control negativo: sin declaraciones no hay verificacion ------------
if (fs.existsSync(VACIO_FIX)) {
  const rVacio = corre(VACIO_FIX);
  ok('lista sin SR -> exit 0', rVacio.code === 0, `exit=${rVacio.code}`);
  ok('lista sin SR -> avisa que es POR AUSENCIA',
    /CUMPLIMIENTO POR AUSENCIA/.test(rVacio.salida),
    'no se hace pasar una ausencia por una verificacion');
}

// --- 5. Un fichero inexistente es NO COMPUTADO, no un aprobado -------------
const rNo = corre(path.join(ROOT, 'no-existe-jamas.m3u8'));
ok('fichero inexistente -> exit 2', rNo.code === 2, `exit=${rNo.code}`);
ok('fichero inexistente -> dice NO COMPUTADO', /NO COMPUTADO/.test(rNo.salida));

console.log('');
console.log(`TOTAL=${total} PASS=${pass} FAIL=${total - pass}`);
if (pass !== total) process.exitCode = 1;
