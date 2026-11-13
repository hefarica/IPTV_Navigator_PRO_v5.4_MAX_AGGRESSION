#!/usr/bin/env node
/**
 * test_soc_normalization.js — prueba que el SoC REAL de un device llega al gate como
 * token canonico, usando el mapa de alias que ya existe en la APK.
 *
 * EL FALLO QUE ESTE TEST FIJA (medido el 2026-11-13):
 *   - Build.SOC_MODEL del ONN 4K  = 'AMLS905Y4'   (S905Y4, no S905X4)
 *   - Build.HARDWARE              = 'amlogic'
 *   - El gate (ape_mesh.php) compara en seco contra ['mt8696','amlogic','s905x4','s905x3']
 *   - `QoEReporter.socName()` mandaba el CRUDO -> 'amls905y4' ∉ lista -> allowed=false
 *   - Pero `SyncProtocol.canonicalSoc()` YA sabia mapear 'amls905y4' -> 'amlogic'.
 *     Nadie lo llamaba en ese camino. Fallo silencioso: ni error, ni log, ni sintoma.
 *
 * La correccion es que socName() devuelva el canonico. Este test lo comprueba leyendo
 * el codigo real, no una copia de la logica.
 *
 * Uso: node tools/quality/test_soc_normalization.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fallos = [];
function ok(nombre, cond, detalle) {
  if (cond) pass++;
  else { fail++; fallos.push(nombre + (detalle ? ' :: ' + detalle : '')); }
}

const RAIZ = path.join(__dirname, '..', '..');
const K_DIR = path.join(RAIZ, 'IPTV_v5.4_MAX_AGGRESSION', 'android', 'ape-crystal-agent',
  'app', 'src', 'main', 'java', 'com', 'ape', 'crystalagent');

function lee(n) {
  try { return fs.readFileSync(path.join(K_DIR, n), 'utf8'); }
  catch (e) { fail++; fallos.push('no se pudo leer ' + n); return ''; }
}

const sync = lee('SyncProtocol.kt');
const rep  = lee('QoEReporter.kt');

// ---------------------------------------------------------------- extraer el mapa real
// SOC_ALIASES: mapOf("a" to "b", ...)
let ALIASES = {};
const mAlias = sync.match(/val\s+SOC_ALIASES[^=]*=\s*mapOf\(([\s\S]*?)\n\s*\)/);
if (mAlias) {
  const re = /"([^"]+)"\s+to\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(mAlias[1])) !== null) ALIASES[m[1]] = m[2];
} else {
  fail++; fallos.push('no se pudo extraer SOC_ALIASES de SyncProtocol.kt');
}

// CANON_SOCS: listOf("a","b",...)
let CANON = [];
const mCanon = sync.match(/val\s+CANON_SOCS\s*=\s*listOf\(([^)]*)\)/);
if (mCanon) {
  CANON = (mCanon[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
} else {
  fail++; fallos.push('no se pudo extraer CANON_SOCS de SyncProtocol.kt');
}

ok('SOC_ALIASES tiene entradas', Object.keys(ALIASES).length > 0, String(Object.keys(ALIASES).length));
ok('CANON_SOCS tiene entradas', CANON.length > 0, CANON.join(','));

// ---------------------------------------------------------------- replicar canonicalSoc()
// Misma logica que SyncProtocol.canonicalSoc(): alias directo, luego comparacion
// normalizada quitando todo lo que no sea [a-z0-9], devolviendo null si no hay match.
function canonicalSoc(raw) {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase();
  if (!t) return null;
  if (ALIASES[t]) return ALIASES[t];
  const d = t.replace(/[^a-z0-9]/g, '');
  for (const alias of Object.keys(ALIASES)) {
    if (alias.replace(/[^a-z0-9]/g, '') === d) return ALIASES[alias];
  }
  return null;
}

// ---------------------------------------------------------------- lo que el gate acepta
function pasaGateViejo(socEnviado) {
  const s = String(socEnviado).toLowerCase().trim();
  return ['mt8696', 'amlogic', 's905x4', 's905x3'].includes(s);
}
function pasaGateConCanonico(socEnviado) {
  const s = String(socEnviado).toLowerCase().trim();
  return CANON.map(x => x.toLowerCase()).includes(s);
}

// ---------------------------------------------------------------- casos
const casos = [
  // [raw del device, canonico esperado, motivo]
  ['AMLS905Y4',        'amlogic',  'ONN 4K real: Build.SOC_MODEL'],
  ['amls905y4',        'amlogic',  'mismo en minusculas'],
  ['amlogic',          'amlogic',  'Build.HARDWARE del ONN'],
  ['Amlogic',          'amlogic',  'Build.HARDWARE con mayuscula'],
  ['s905x4',           's905x4',   'nombre limpio de familia'],
  ['amlogic_s905x4',   's905x4',   'con underscore'],
  ['amlogic-s905x4',   's905x4',   'con guion'],
  ['amls905y4-s',      'amlogic',  'variante con sufijo -s'],
  ['mt8696',           'mt8696',   'Fire TV 4K Max'],
  ['mediatek-mt8696',  'mt8696',   'MediaTek con guion'],
];

console.log('');
console.log('raw del device    -> canonico    gate_con_normalizacion');
for (const [raw, esperado] of casos) {
  const c = canonicalSoc(raw);
  const okCanon = c === esperado;
  const okGate = c !== null && pasaGateConCanonico(c);
  ok('canonicalSoc(' + raw + ') === ' + esperado, okCanon, 'obtenido ' + c);
  ok('con normalizacion, ' + raw + ' pasa el gate', okGate);
  console.log('  ' + raw.padEnd(16) + ' -> ' + String(c).padEnd(11) + ' ' + (okGate ? 'PASA' : 'NO PASA'));
}

// ---------------------------------------------------------------- el caso que estaba roto
{
  const crudo = 'AMLS905Y4';
  ok('SIN normalizar, AMLS905Y4 NO pasaba el gate (era el bug)',
     pasaGateViejo(crudo) === false);
  ok('CON normalizar, AMLS905Y4 SI pasa el gate',
     pasaGateConCanonico(canonicalSoc(crudo)));
}

// ---------------------------------------------------------------- el codigo lo hace
{
  const sinComentarios = rep
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  // Ventana fija desde 'fun socName'. NO se corta en el primer '}': la funcion tiene
  // un if/else dentro y un cierre temprano dejaria fuera la linea que importa.
  const i = sinComentarios.indexOf('fun socName');
  const frag = i >= 0 ? sinComentarios.slice(i, i + 1200) : '';
  ok('socName() existe en QoEReporter', i >= 0);
  if (frag) {
    ok('socName() llama a SyncProtocol.canonicalSoc',
       /SyncProtocol\.canonicalSoc/.test(frag), 'no aparece en la ventana');
    ok('socName() tiene fallback al crudo si el SoC es desconocido',
       /\?:\s*raw/.test(frag), 'no aparece el fallback ?: raw');
  }
}

// ---------------------------------------------------------------- desconocido no se inventa
{
  ok('un SoC desconocido devuelve null (no se inventa un canonico)',
     canonicalSoc('rk3588') === null, String(canonicalSoc('rk3588')));
  ok('vacio devuelve null', canonicalSoc('') === null);
  ok('null devuelve null', canonicalSoc(null) === null);
  ok('un SoC desconocido se enviaria CRUDO y el gate lo rechaza con motivo',
     pasaGateConCanonico('rk3588') === false);
}

// ---------------------------------------------------------------- resumen
console.log('');
console.log(pass + '/' + (pass + fail) + ' PASS');
if (fail > 0) {
  console.log('FALLOS:');
  fallos.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
process.exit(0);
