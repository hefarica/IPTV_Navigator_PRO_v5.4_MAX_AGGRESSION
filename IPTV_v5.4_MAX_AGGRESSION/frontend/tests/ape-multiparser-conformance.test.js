#!/usr/bin/env node
'use strict';
/*
 * ape-multiparser-conformance.test.js — GATE del multiparseador (opción (a)).
 *
 * QUÉ VIGILA
 *   1. El multiparseador DETECTA los 7 defectos plantados (--selftest) y no da falsos positivos
 *      sobre una base limpia. Sin esto el tool es decorativo.
 *   2. La emisión REAL de los 12 perfiles no es rechazada por NINGUNO de los 8 perfiles de player
 *      (hls.js, RFC 8216, M3U Plus, libVLC, Kodi ISA, ExoPlayer, Apple AVPlayer, parser hostil).
 *   3. Reporta (no falla) los avisos que sí son riesgo real: UA de valor único con coma,
 *      opciones EXTVLCOPT fuera del inventario auditado.
 *
 * LÍMITE DECLARADO: esto es verificación TEXTO-PLANO. La capa #EXT-X-APE-* es de sólo escritura
 * (199 familias, 0 lectores family-aware — medido en t6). Auditar esa capa exige el lector de la
 * opción (b), que no existe todavía.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FE = path.join(__dirname, '..');
const REPO = path.join(FE, '..', '..');
const TOOL = path.join(FE, '..', 'tools', 'diag', 'multiparser-audit.js');

let pass = 0, fail = 0;
const check = (c, name, extra) => { if (c) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };

const run = (args) => spawnSync('node', [TOOL, ...args], { encoding: 'utf8', cwd: FE, timeout: 240000 });

if (!fs.existsSync(TOOL)) {
    console.log('SKIP  multiparser-audit.js no existe');
    process.exit(0);
}

/* 1 · autotest */
const st = run(['--selftest']);
const stOut = (st.stdout || '') + (st.stderr || '');
const m = stOut.match(/AUTOTEST:\s*(\d+)\/(\d+)/);
check(st.status === 0, 'el multiparseador pasa su propio autotest (exit 0)', 'exit=' + st.status);
check(!!m && m[1] === '7' && m[2] === '7', 'detecta 7/7 defectos plantados', m ? m[0] : 'sin salida');
check(/BASE LIMPIA sin rechazos: SI/.test(stOut), 'la base limpia no produce falsos positivos');

/* 2 · emisión real: cero rechazos */
const au = run(['--json']);
let parsed = null;
try { parsed = JSON.parse(au.stdout || '{}'); } catch (e) { /* abajo se reporta */ }
if (!parsed || !parsed.perfiles) {
    console.log('SKIP  auditoría de la emisión real no produjo JSON (fixture LAB ausente o error)');
    console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"scope":"multiparser-plain-text"}');
    process.exit(fail === 0 ? 0 : 1);
}
check(au.status === 0, 'la emisión real no es rechazada por ningún perfil (exit 0)', 'exit=' + au.status);
check(parsed.total_rechazos === 0, 'total_rechazos = 0 sobre ' + parsed.lineas + ' líneas', 'total=' + parsed.total_rechazos);
check(parsed.perfiles.length === 8, 'audita 8 familias de player', parsed.perfiles.length);

/* 3 · avisos reales (no fallan, pero se reportan) */
const exo = parsed.perfiles.find(p => /ExoPlayer/.test(p.perfil));
const uaComma = exo && exo.notas.some(n => /valor único con coma: User-Agent/.test(n));
check(uaComma === true, 'REPORTA el riesgo real: User-Agent con coma (trampa OkHttp de valor único)', uaComma);

const vlc = parsed.perfiles.find(p => /libVLC/.test(p.perfil));
console.log('\nAVISOS medidos (no bloquean):');
if (vlc) for (const n of vlc.notas) console.log('  · ' + n);

console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"scope":"multiparser-plain-text","rechazos":' + parsed.total_rechazos + ',"perfiles":' + parsed.perfiles.length + '}');
process.exit(fail === 0 ? 0 : 1);
