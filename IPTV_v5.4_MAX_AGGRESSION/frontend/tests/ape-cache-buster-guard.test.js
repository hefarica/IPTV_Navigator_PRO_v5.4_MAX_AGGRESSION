#!/usr/bin/env node
'use strict';
/*
 * ape-cache-buster-guard.test.js — EL CACHE-BUSTER NO PUEDE VOLVER A MENTIR.
 *
 * DEFECTO QUE FIJA (ya ocurrió dos veces en esta sesión):
 *   · La primera carga del operador ejecutó `IMPORTADOS 6 perfiles` porque
 *     `ape-profiles-config.js?v=20261120-perfiles12` seguía sirviendo la versión cacheada
 *     después de corregir el filtro de ids.
 *   · Volvió a pasar tras `a4727908` (restitución de hdr_canonical): el archivo cambió y el
 *     token no, así que el navegador habría seguido usando la versión SIN el arreglo HDR.
 *
 * REGLA: para los archivos bajo nuestra custodia el token `?v=` ES el sha256[:8] de su
 * contenido. Cualquier edición cambia el hash → este test falla hasta que se bumpea el token
 * en el <script> de index-v4.html. Determinista y sin listas que mantener a mano más allá de
 * estos nombres.
 *
 * 2026-11-24 · AÑADIDOS `core/db-manager.js` y `app.js`:
 *   El log del operador ejecutó `db-manager.js:322 🗑️ IndexedDB: Canales limpiados`
 *   mientras en disco ya estaba la versión V4.33 que NO borra. El HTML seguía
 *   pidiendo `core/db-manager.js?v=9aff69b4`, así que el navegador servía la
 *   versión cacheada y destructiva: 28.655 canales a cero y a reconectar en
 *   cada F5. Estos dos archivos son el corazón de la persistencia y ahora
 *   están bajo custodia: cualquier cambio sin bumpear el token rompe el test.
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const FE = path.join(__dirname, '..');
const HTML = path.join(FE, 'index-v4.html');
const CUSTODY = [
    'js/ape-v9/ape-profiles-config.js',
    'js/ape-v9/m3u8-typed-arrays-ultimate.js',
    'js/ape-v9/profile-manager-v9.js',
    'js/ape-v9/prefetch-min-bw.js',
    'js/ape-lab-normalize.js',
    'core/db-manager.js',
    'app.js'
];

let pass = 0, fail = 0;
const check = (cond, name, extra) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FALLA ' + name + (extra !== undefined ? ' — ' + extra : '')); } };

if (!fs.existsSync(HTML)) { console.log('SKIP  no hay index-v4.html'); process.exit(0); }
const html = fs.readFileSync(HTML, 'utf8');

/* mapa src → token declarado en el HTML */
const tokens = new Map();
for (const m of html.matchAll(/<script\s+src="([^"?]+\.js)\?v=([^"]*)"/g)) tokens.set(m[1], m[2]);

const sha8 = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(FE, rel))).digest('hex').slice(0, 8);

for (const rel of CUSTODY) {
    const abs = path.join(FE, rel);
    if (!fs.existsSync(abs)) { check(false, rel + ' · existe en disco'); continue; }
    const declared = tokens.get(rel);
    if (declared === undefined) { check(false, rel + ' · está cargado con ?v= en index-v4.html', 'sin tag o sin token'); continue; }
    const want = sha8(rel);
    check(declared === want,
        rel.split('/').pop() + ' · token == sha256[:8] del contenido',
        'declarado="' + declared + '" esperado="' + want + '" → actualiza el <script> a ?v=' + want);
}

/* el emisor por canal debe seguir expuesto: es lo que hace verificable la emisión por perfil */
const genSrc = fs.readFileSync(path.join(FE, 'js/ape-v9/m3u8-typed-arrays-ultimate.js'), 'utf8');
check(/window\.APE_GEN_CHANNEL\s*=\s*generateChannelEntry/.test(genSrc), 'el emisor por canal sigue expuesto (APE_GEN_CHANNEL)');

console.log('\n{"passed":' + pass + ',"failed":' + fail + ',"custodia":' + CUSTODY.length + '}');
process.exit(fail === 0 ? 0 : 1);
