#!/usr/bin/env node
/**
 * profile_to_data_js.js — convierte el store medido (profile.json) en un fichero
 * JS que se carga con <script> y deja el store en window.APE_SERVER_PROFILES_STORE.
 *
 * POR QUE UN .js Y NO fetch(): el controller necesita el store ANTES de generar.
 * Un <script> es sincrono y no añade una espera de red al camino critico; un fetch
 * obligaria a volver asincrona la preparacion de la generacion.
 *
 * El fichero lleva el timestamp de medicion y el TTL para que sea auditable: si el
 * snapshot es viejo, se ve en el propio fichero.
 *
 * Uso: node tools/lab/profile_to_data_js.js --in profile.json --out ape-server-profiles-data.js
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const IN = get('--in');
const OUT = get('--out');
if (!IN || !OUT || !fs.existsSync(IN)) { console.error('falta --in (existente) --out'); process.exit(2); }

const store = JSON.parse(fs.readFileSync(IN, 'utf8'));
if (!store || !store.servers) { console.error('el input no es un store de APE_SERVER_PROFILE'); process.exit(1); }

const keys = Object.keys(store.servers).sort();
const bornAt = new Date().toISOString();
const ages = keys.map(k => store.servers[k].measuredAt).filter(Boolean).sort();
const oldest = ages.length ? ages[0] : null;
const newest = ages.length ? ages[ages.length - 1] : null;

const header = [
    '/**',
    ' * ═══════════════════════════════════════════════════════════════════════════════',
    ' * APE_SERVER_PROFILES — PERFILES MEDIDOS, GENERADO. NO EDITAR A MANO.',
    ' * ═══════════════════════════════════════════════════════════════════════════════',
    ' *',
    ' * Deja el store de APE_SERVER_PROFILE en window.APE_SERVER_PROFILES_STORE para',
    ' * que generation-controller lo pase al generador como options.server_profile.',
    ' *',
    ' * Generado por: tools/lab/profile_to_data_js.js',
    ' * Fuente      : ' + (IN.split(/[\\/]/).pop()),
    ' * Generado    : ' + bornAt,
    ' * Medido desde: ' + (oldest || '(sin measuredAt)') + '   (la medicion mas antigua)',
    ' * Medido hasta: ' + (newest || '(sin measuredAt)') + '   (la mas reciente)',
    ' * TTL         : ' + ((store.ttlMs || 0) / 3600000) + ' h  (pasado el TTL estos datos son una',
    ' *               FOTO, no una medicion viva: re-correr profile_run.js y regenerar)',
    ' * Servidores  : ' + keys.length,
    ' *',
    ' * Para actualizar: node tools/lab/profile_run.js --servers <muestra> --out profile.json',
    ' *                  node tools/lab/profile_to_data_js.js --in profile.json --out <destino>',
    ' * ═══════════════════════════════════════════════════════════════════════════════',
    ' */',
    '(function (root) {',
    "    'use strict';",
    '    var STORE = ' + JSON.stringify(store, null, 4).split('\n').join('\n    ') + ';',
    "    if (root && typeof root === 'object') { root.APE_SERVER_PROFILES_STORE = STORE; }",
    "    if (typeof module !== 'undefined' && module.exports) { module.exports = STORE; }",
    "})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));",
    ''
].join('\n');

fs.writeFileSync(OUT, header, 'utf8');
console.log('  escrito: ' + OUT + '   ' + header.length + ' bytes');
console.log('  servidores: ' + keys.length + '  ->  ' + keys.join(', '));
console.log('  medido: ' + oldest + ' .. ' + newest);
console.log('  TTL: ' + ((store.ttlMs || 0) / 3600000) + ' h');
