#!/usr/bin/env node
'use strict';
/*
 * ape-crystal-vpp-nondegradation.test.js — INVARIANTE DE CALIDAD DE IMAGEN.
 *
 * FIJA EL DEFECTO MEDIDO (2026-11-22): en m3u8-typed-arrays-ultimate.js las tres
 * líneas que usaban `/^P[0-5]$/` mandaban cualquier perfil `.5` (P4.5 = 6K/112 Mbps)
 * a 'P3': le aplicaban la intensidad VPP de SD (55) y lo declaraban PROFILE=P3.
 *
 * DECISION DEL OPERADOR (opción B): un `.5` cae a SU TIER BASE (P4.5 → P4), nunca a P3.
 * Y no puede recibir MENOS post-proceso del que ya recibía: P0.5/P1.5/P2.5 heredarían
 * 40/35/45 con el tier base, así que se conserva el 55 histórico y sólo se sube donde
 * el tier base manda más (P4.5 → 70, P5.5 → 85).
 *
 * COMO PRUEBA: extrae las funciones REALES del fuente del generador y las ejecuta en
 * aislamiento. No hay mock de la tabla ni del helper: si alguien cambia el archivo,
 * la prueba lee el cambio.
 *
 * Uso: node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-crystal-vpp-nondegradation.test.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const src = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const check = (cond, name, extra) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra ? ' — ' + extra : '')); } };

/* 1 · el patrón viejo no puede volver como código (los comentarios sí lo mencionan) */
const oldTernaries = (src.match(/const\s+\w+\s*=\s*\/\^P\[0-5\]\$\/\.test\(/g) || []).length;
check(oldTernaries === 0, 'ningun ternario /^P[0-5]$/ en codigo', oldTernaries + ' restantes');

/* 2 · el helper y la tabla existen una sola vez */
const fTier = src.match(/function _apeTierOf\(profile\) \{[\s\S]*?\n    \}/);
const fVpp = src.match(/function _apeCrystalVppLine\(profile\) \{[\s\S]*?\n    \}/);
const tVpp = src.match(/const _APE_CRYSTAL_VPP = \{[^}]*\};/);
check(!!fTier, '_apeTierOf presente en el fuente');
check(!!fVpp, '_apeCrystalVppLine presente en el fuente');
check(!!tVpp, '_APE_CRYSTAL_VPP presente en el fuente');
check((src.match(/const _APE_CRYSTAL_VPP\s*=/g) || []).length === 1, 'una sola tabla de intensidades');
if (!fTier || !fVpp || !tVpp) { console.log('\n{"passed":' + pass + ',"failed":' + fail + '}'); process.exit(1); }

/* Se compilan los TROZOS REALES del fuente en una factoría: en modo estricto `eval`
 * no filtra declaraciones al scope del módulo, y no queremos duplicar la lógica. */
let api;
try {
    api = new Function(
        fTier[0] + '\n' +
        tVpp[0].replace('const', 'var') + '\n' +
        fVpp[0] + '\n' +
        'return { tier: _apeTierOf, vpp: _apeCrystalVppLine, tabla: _APE_CRYSTAL_VPP };'
    )();
} catch (e) {
    check(false, 'las funciones reales del fuente compilan en aislamiento', e && e.message);
    console.log('\n{"passed":' + pass + ',"failed":' + fail + '}');
    process.exit(1);
}
const _apeTierOf = api.tier;
const _APE_CRYSTAL_VPP = api.tabla;
const _vpp = api.vpp;
check(true, 'las funciones reales del fuente compilan y se ejecutan en aislamiento');

const PERFILES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'];
const BASE = { 'P0.5': 'P0', 'P1.5': 'P1', 'P2.5': 'P2', 'P3.5': 'P3', 'P4.5': 'P4', 'P5.5': 'P5' };
const FALLBACK_HISTORICO = 55;   // lo que todo `.5` recibia al caer a P3

/* 3 · el token emitido SIEMPRE cabe en el dominio del edge (P0..P5) */
let fueraDeDominio = [];
for (const id of PERFILES) {
    const tok = (_vpp(id).match(/PROFILE=([^;]+)/) || [])[1];
    if (!/^P[0-5]$/.test(String(tok))) fueraDeDominio.push(id + '→' + tok);
}
check(fueraDeDominio.length === 0, 'el token emitido siempre es P0..P5 (contrato del edge)', fueraDeDominio.join(','));

/* 4 · `.5` cae a su tier base, no a P3 */
let malTier = [];
for (const [id, base] of Object.entries(BASE)) {
    const tok = (_vpp(id).match(/PROFILE=([^;]+)/) || [])[1];
    if (tok !== base) malTier.push(id + '→' + tok + ' (esperado ' + base + ')');
}
check(malTier.length === 0, 'cada .5 cae a SU tier base (P4.5→P4)', malTier.join(','));

/* 5 · INVARIANTE: ningun perfil recibe menos intensidad que antes */
const degradados = [];
for (const id of PERFILES) {
    const n = Number((_vpp(id).match(/VPP_INTENSITY=([^;]+)/) || [])[1]);
    const antes = /^P[0-5]$/.test(id) ? n : Math.max(FALLBACK_HISTORICO, n);
    const previo = /^P[0-5]$/.test(id) ? Number(_APE_CRYSTAL_VPP[id]) : FALLBACK_HISTORICO;
    if (!isFinite(n) || n < previo) degradados.push(id + ': ' + previo + '→' + n);
}
check(degradados.length === 0, 'ningun perfil baja su VPP respecto del comportamiento previo', degradados.join(','));
check(Number((_vpp('P4.5').match(/VPP_INTENSITY=([^;]+)/) || [])[1]) === 70, 'P4.5 sube a VPP 70 (antes 55)');
check(Number((_vpp('P5.5').match(/VPP_INTENSITY=([^;]+)/) || [])[1]) === 85, 'P5.5 sube a VPP 85 (antes 55)');

/* 6 · entradas invalidas conservan el fallback historico y jamas emiten undefined */
let malos = [];
for (const bad of ['P6', '', 'P4.7', 'xyz', null, 'P4_5']) {
    const l = _vpp(bad);
    if (l.indexOf('undefined') >= 0) malos.push(String(bad) + '→undefined');
    const tok = (l.match(/PROFILE=([^;]+)/) || [])[1];
    if (!/^P[0-5]$/.test(String(tok))) malos.push(String(bad) + '→' + tok);
}
check(malos.length === 0, 'entradas invalidas: fallback seguro, nunca undefined', malos.join(','));

console.log('\n{"passed":' + pass + ',"failed":' + fail + '}');
process.exit(fail === 0 ? 0 : 1);
