#!/usr/bin/env node
/**
 * Test de CONTRATO: lo que el soc_gate del VPS LEE debe ser lo que la APK MANDA.
 *
 * El hueco que este test existe para impedir (medido el 2026-11-13):
 *   `ara-x/spec/actuator_allowlist.json` -> soc_gate.caps_keys_read_by_vps declara
 *   ['soc','soc_8k','ai_sr','features[] contiene ai_sr'].
 *   El heartbeat de la APK mandaba `soc` y `soc_8k` pero NO `ai_sr` ni el feature `ai_sr`.
 *   Resultado: el gate no tenia nada que leer y la politica VPP no podia activarse
 *   NUNCA — ni en el device que si puede, ni en el que no. Fallo silencioso.
 *
 * Este test cruza el contrato (JSON) con el codigo real (Kotlin). Si alguien anade una
 * clave al gate y no la manda el APK, aqui falla.
 *
 * Uso: node tools/quality/test_caps_contract.js
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
const CONTRATO = path.join(RAIZ, 'ara-x', 'spec', 'actuator_allowlist.json');
const K_DEVICE  = path.join(RAIZ, 'IPTV_v5.4_MAX_AGGRESSION', 'android', 'ape-crystal-agent',
  'app', 'src', 'main', 'java', 'com', 'ape', 'crystalagent', 'DeviceSampler.kt');
const K_REPORT  = path.join(RAIZ, 'IPTV_v5.4_MAX_AGGRESSION', 'android', 'ape-crystal-agent',
  'app', 'src', 'main', 'java', 'com', 'ape', 'crystalagent', 'QoEReporter.kt');

// ---------------------------------------------------------------- cargar
let contrato = null;
try { contrato = JSON.parse(fs.readFileSync(CONTRATO, 'utf8')); }
catch (e) { fail++; fallos.push('no se pudo leer el contrato: ' + e.message); }

let deviceSrc = '', reportSrc = '';
try { deviceSrc = fs.readFileSync(K_DEVICE, 'utf8'); }
catch (e) { fail++; fallos.push('no se pudo leer DeviceSampler.kt: ' + e.message); }
try { reportSrc = fs.readFileSync(K_REPORT, 'utf8'); }
catch (e) { fail++; fallos.push('no se pudo leer QoEReporter.kt: ' + e.message); }

// Sin comentarios: un contrato que solo se cumple en un comentario NO se cumple.
const sinComentarios = s => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

const dev = sinComentarios(deviceSrc);
const rep = sinComentarios(reportSrc);

// ---------------------------------------------------------------- el cruce
if (contrato && contrato.soc_gate && Array.isArray(contrato.soc_gate.caps_keys_read_by_vps)) {
  const claves = contrato.soc_gate.caps_keys_read_by_vps;
  ok('el contrato declara caps_keys_read_by_vps', claves.length > 0, claves.join(','));

  for (const clave of claves) {
    if (/features.*ai_sr|features\[\].*ai_sr/i.test(clave)) {
      // Debe existir como feature en el mapa del sampler
      ok('feature "' + clave + '" presente como out["ai_sr"] en DeviceSampler',
        /out\["ai_sr"\]/.test(dev));
      ok('feature "ai_sr" se declara measured_device (no inventado)',
        /out\["ai_sr"\][\s\S]{0,200}measured_device/.test(dev));
    } else {
      // Debe enviarse en el objeto caps del heartbeat
      const reCaps = new RegExp('put\\("' + clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
      ok('caps.' + clave + ' se envia en el heartbeat (QoEReporter)',
        reCaps.test(rep), 'no aparece put("' + clave + '"...)');
    }
  }
} else {
  fail++;
  fallos.push('el contrato no tiene soc_gate.caps_keys_read_by_vps');
}

// ---------------------------------------------------------------- honestidad del sondeo
ok('DeviceSampler sondea el VPP en vez de asumirlo',
  /fun vppCapability\(\)/.test(dev));
ok('vppCapability usa Settings.Global.getString (medicion real)',
  /Settings\.Global\.getString/.test(dev));
ok('vppCapability exige WRITE_SECURE_SETTINGS para declarar ai_sr=true',
  /KeyGuard\.hasSecure/.test(dev));
ok('existe la razon no_vendor_keys para el caso 0 claves',
  /no_vendor_keys/.test(dev));
ok('existe la razon no_write_secure_settings',
  /no_write_secure_settings/.test(dev));
ok('existe la razon vpp_reachable',
  /vpp_reachable/.test(dev));
ok('la razon viaja al VPS para poder explicar el denegado',
  /put\("ai_sr_reason"/.test(rep));

// ---------------------------------------------------------------- vocabulario coherente
// Las claves que se sondean deben ser las mismas que el contrato llama vpp_levers.
// Se EXTRAE el bloque VPP_KEYS y se leen todos sus literales: un regex por prefijo
// (pq_/ai_/aipq_) se dejaba fuera match_content_frame_rate y
// minimal_post_processing_allowed, que no llevan esos prefijos.
if (contrato && contrato.settings_allowlist && contrato.settings_allowlist.vpp_levers) {
  const levers = contrato.settings_allowlist.vpp_levers.keys || [];
  let enKotlin = [];
  const m = dev.match(/val\s+VPP_KEYS\s*=\s*arrayOf\(([\s\S]*?)\)/);
  if (m) {
    enKotlin = (m[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
  } else {
    fail++;
    fallos.push('no se encontro val VPP_KEYS = arrayOf(...) en DeviceSampler');
  }
  const faltan = levers.filter(l => !enKotlin.includes(l));
  ok('DeviceSampler sondea TODOS los vpp_levers del contrato (' + enKotlin.length + ' claves)',
    faltan.length === 0, 'faltan: ' + faltan.join(', '));
  const sobran = enKotlin.filter(k => !levers.includes(k));
  ok('DeviceSampler no sondea claves fuera del contrato', sobran.length === 0,
    'sobran: ' + sobran.join(', '));
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
