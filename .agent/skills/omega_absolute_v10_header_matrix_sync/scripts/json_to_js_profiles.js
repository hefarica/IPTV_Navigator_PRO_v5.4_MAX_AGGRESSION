#!/usr/bin/env node
// Convierte APE_OMEGA_PROFILES_v*.json en bloque JavaScript
// para insertar en this.DEFAULT_PROFILES de ape-profiles-config.js.
// Uso: node json_to_js_profiles.js <input.json> <output.js>

const fs = require('fs');
const path = require('path');

const JSON_PATH =
  process.argv[2] ||
  'c:/Users/HFRC/Downloads/APE_OMEGA_PROFILES_v10.0_FINAL.json';
const OUT_PATH = process.argv[3] || './DEFAULT_PROFILES_GENERATED.js';

if (!fs.existsSync(JSON_PATH)) {
  console.error(`FAIL: no existe ${JSON_PATH}`);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
} catch (err) {
  console.error('FAIL: JSON inválido:', err.message);
  process.exit(2);
}

const profiles = data.profiles || data;
if (typeof profiles !== 'object') {
  console.error('FAIL: estructura no contiene .profiles');
  process.exit(2);
}

const order = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const missing = order.filter((k) => !profiles[k]);
if (missing.length > 0) {
  console.error('FAIL: perfiles faltantes:', missing.join(', '));
  process.exit(2);
}

// Generar el bloque JS
const lines = ['        this.DEFAULT_PROFILES = {'];
order.forEach((pid, idx) => {
  const p = profiles[pid];
  // JSON.stringify con indent 12 para alinear con la clase
  const body = JSON.stringify(p, null, 4)
    .split('\n')
    .map((ln, i) => (i === 0 ? ln : '            ' + ln))
    .join('\n');
  const trailing = idx < order.length - 1 ? ',' : '';
  lines.push(`            "${pid}": ${body}${trailing}`);
  lines.push('');
});
lines.push('        };');

fs.writeFileSync(OUT_PATH, lines.join('\n'));

// Reporte
console.log(`OK: generado ${OUT_PATH}`);
console.log('Perfiles incluidos:');
order.forEach((pid) => {
  const p = profiles[pid];
  const headers = Object.keys(p.headerOverrides || {}).length;
  console.log(`  ${pid} — ${p.name || '?'} — ${headers} headers`);
});
console.log('');
console.log('Siguientes pasos:');
console.log('1. Revisar visualmente: head -50', OUT_PATH);
console.log('2. node -c', OUT_PATH, '(debe pasar como expression embebida)');
console.log('3. Edit ape-profiles-config.js reemplazando this.DEFAULT_PROFILES = { ... };');
console.log('4. node -c ape-profiles-config.js');
console.log('5. node .agent/skills/iptv_header_4layer_fallback_validator/scripts/validate.js');
