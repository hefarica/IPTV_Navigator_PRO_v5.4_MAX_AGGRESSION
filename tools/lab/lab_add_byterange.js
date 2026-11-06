#!/usr/bin/env node
/**
 * lab_add_byterange.js — inserta la seccion `byterange_capability` en el LAB
 * PRESERVANDO el resto del fichero byte a byte.
 *
 * POR QUE NO JSON.parse/stringify: reescribir el JSON cambia el sha256 del
 * artefacto calibrado (585.107 B) y cualquier gate/comparacion que lo use deja
 * de cuadrar. Se inserta texto antes del ultimo `}` del objeto raiz.
 *
 * Idempotente: si la clave ya existe, no duplica.
 *
 * Uso: node tools/lab/lab_add_byterange.js --file <LAB.json> [--check]
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
const CHECK = args.includes('--check');
if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file'); process.exit(2); }

const raw = fs.readFileSync(FILE, 'utf8');

if (raw.includes('"byterange_capability"')) {
    console.log('  ya existe byterange_capability — no se toca (idempotente)');
    const j = JSON.parse(raw);
    console.log('  hosts declarados: ' + Object.keys(j.byterange_capability.hosts || {}).join(', '));
    process.exit(0);
}

const SECTION = `,
 "byterange_capability": {
  "measured_at": "2026-11-06",
  "method": "GET del primer segmento de un canal servible con Range: bytes=0-1023 y bytes=0-; se registra codigo HTTP, Content-Range y Accept-Ranges",
  "policy": "EMIT-X-BYTERANGE-SOLO-CON-HONORS-206",
  "why": "Emitir #EXT-X-BYTERANGE sobre un origen que ignora Range no es premium: rompe hls.js (NETWORK_ERROR 'range header was ignored') y hace que ExoPlayer decodifique el fichero entero como si fuera el trozo. La lista solo lo emite con 206 probado.",
  "hosts": {
   "nfqdeuxu.x1megaott.store": {
    "accept_ranges_header": false,
    "honors_range_206": false,
    "observed": "Accept-Ranges ausente; Range: bytes=0-1023 -> HTTP 200 con 300870 B (segmento completo)",
    "emit_byterange": false
   },
   "line.tivi-ott.net": {
    "accept_ranges_header": true,
    "honors_range_206": false,
    "observed": "Accept-Ranges: bytes declarado pero Range: bytes=0-1023 -> HTTP 200 con 302412 B (segmento completo)",
    "emit_byterange": false
   }
  },
  "cdns_observados": {
   "9711897.j06m.cc": {
    "declara_accept_ranges": false,
    "honra_206": false
   },
   "185.227.34.195": {
    "declara_accept_ranges": true,
    "honra_206": false
   }
  },
  "conclusion": "206 no es alcanzable desde la lista en esta arquitectura: los dos origenes devuelven el segmento entero e ignoran Range. Para 206 real hace falta que el borde sirva bytes por rango (proxy de video en el VPS) o que el proveedor lo honre."
 }`;

// insertar antes del ultimo '}' del objeto raiz
const idx = raw.lastIndexOf('}');
if (idx < 0) { console.error('no hay cierre de objeto raiz'); process.exit(1); }
let before = raw.slice(0, idx);
// quitar el salto/espacios finales para colgar la coma del ultimo campo
before = before.replace(/\s+$/, '');
const after = raw.slice(idx);
const out = before + SECTION + '\n' + after;

if (CHECK) {
    console.log('  (check) se insertarian ' + (out.length - raw.length) + ' bytes');
    process.exit(0);
}

// validar que sigue siendo JSON antes de escribir
try { JSON.parse(out); } catch (e) { console.error('  ABORTADO: el resultado no es JSON valido: ' + e.message); process.exit(1); }

fs.writeFileSync(FILE + '.bak_byterange', raw, 'utf8');
fs.writeFileSync(FILE, out, 'utf8');
console.log('  insertado. bytes: ' + raw.length + ' -> ' + out.length + ' (+' + (out.length - raw.length) + ')');
console.log('  backup: ' + FILE + '.bak_byterange');
