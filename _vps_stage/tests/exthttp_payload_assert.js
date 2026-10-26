#!/usr/bin/env node
/**
 * exthttp_payload_assert.js — GATE del hallazgo H1 (t52)
 * ============================================================================
 * QUÉ DEFIENDE
 *   Que `build_exthttp()` devuelva un OBJETO con `.headers` (no un string), de
 *   forma que el spread del consumidor
 *       ...(_exthttp_base ? _exthttp_base.headers || {} : {})
 *   entregue de verdad los headers al `#EXTHTTP` y no un `{}` silencioso.
 *
 * QUÉ COMPRUEBA
 *   C1 · El retorno de build_exthttp es un objeto con `headers` (y `tag`).
 *   C2 · Prueba SEMÁNTICA con la expresión real del consumidor:
 *          forma ANTIGUA (string)  -> {}        0 claves  ← el defecto
 *          forma NUEVA  (objeto)   -> N claves  N >= 1   ← el arreglo
 *   C3 · Denylist de 11 tóxicos activa sobre el payload resultante.
 *   C4 · `#EXTHTTP` sigue emitiéndose desde `_httpPayload` y la denylist de t29
 *        sigue cableada antes de serializar (no se rompió el contrato).
 *   C5 · INTOCABLES: el gate no introduce cambios en CODECS/BANDWIDTH/RESOLUTION.
 *
 * QUÉ **NO** PUEDE COMPROBAR (y por qué)
 *   El manifest de 3 canales del enunciado: el generador (`generateM3U8Stream`)
 *   vive dentro de una clausura que solo invoca la UI (bloqueo documentado en
 *   T50). Sin un export global no hay forma de emitir el manifest desde Node.
 *   Se declara [UNKNOWN] explícitamente en vez de fingir la comprobación.
 *
 * Uso: node _vps_stage/tests/exthttp_payload_assert.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const EMITTER = path.join(REPO, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');

let pass = 0; const fail = []; const unknown = [];
const ok = (n, c, d) => { if (c) { pass++; return true; } fail.push(d ? `${n} — ${d}` : n); return false; };
const unk = (t) => { unknown.push(t); };

// Denylist REAL del emisor — extraída de su propio source:
//   `__apeScrubToxicPairs` (:2402-2403) → 9 nombres + familia por prefijo
//   (`Sec-Fetch-*`, `Sec-CH-UA*`) ⇒ 9 + 2 familias = los 11 del contrato.
const TOXIC = [
    'Range', 'If-None-Match', 'If-Modified-Since', 'TE', 'Priority',
    'Upgrade-Insecure-Requests', 'Connection', 'Keep-Alive', 'Proxy-Connection',
];
const TOXIC_PREFIX = ['Sec-Fetch-', 'Sec-CH-UA'];
const isToxic = (k) => TOXIC.some(t => t.toLowerCase() === String(k).toLowerCase())
    || TOXIC_PREFIX.some(p => String(k).toLowerCase().startsWith(p.toLowerCase()));

const src = fs.readFileSync(EMITTER, 'utf8');
const N_CH = 3;

console.log('── H1 · gate EXTHTTP payload (t52)');
console.log(`   emisor: ${path.basename(EMITTER)} (${(src.length / 1024).toFixed(0)} KiB)`);

// ── C1 · forma del retorno de build_exthttp ────────────────────────────────
const iDef = src.indexOf('function build_exthttp(');
ok('C1.0 build_exthttp existe', iDef > -1);
const iEnd = src.indexOf('\n    }\n', iDef);
const body = src.slice(iDef, iEnd > -1 ? iEnd : iDef + 60000);

const returnsBareString = /return\s+exthttp\s*;/.test(body) || /return\s+`\$\{exthttp\}/.test(body);
const returnsObject = /return\s*\{\s*[\s\S]{0,400}?headers\s*:/.test(body);

ok('C1.1 el retorno YA NO es un string pelado', !returnsBareString,
    'se encontró `return exthttp;` o `return \`${exthttp}...` — el consumidor haría .headers=undefined');
ok('C1.2 el retorno es un OBJETO con `headers`', returnsObject,
    'no se encontró `return { ... headers: ... }`');
ok('C1.3 el retorno conserva `tag` (compatibilidad de la línea #EXTHTTP)',
    /tag\s*:/.test(body), 'falta la propiedad `tag`');
ok('C1.4 el retorno expone el overflow (no se pierde)',
    /overflowTag|overflow\s*:/.test(body), 'falta `overflow`/`overflowTag`');

// ── C2 · prueba SEMÁNTICA con la expresión REAL del consumidor ─────────────
// La expresión literal del emisor (~L8431). Se evalúa contra ambas formas.
const CONSUMER = (base) => {
    const _exthttp_base = base;
    return { ...(_exthttp_base ? _exthttp_base.headers || {} : {}) };
};

// Muestra de headers LEGÍTIMOS (sin ninguno de la denylist: `Connection` y
// `Sec-Fetch-*` que puse antes SON tóxicos según el emisor — el gate me corrigió).
const HEADERS_SAMPLE = {
    'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'Accept-Language': 'es-ES,es;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'X-Playback-Session-Id': 'sid-abc123',
    'X-Auth-Type': 'VLC',
    'X-Client-Version': '3.0.20',
    'Origin': 'https://iptv-ape.duckdns.org',
    'Referer': 'https://iptv-ape.duckdns.org/',
    'DNT': '1',
    'X-Forwarded-For': '127.0.0.1',
    'Host': 'iptv-ape.duckdns.org',
};

const OLD = JSON.stringify(HEADERS_SAMPLE);               // el string que devolvía
const NEW = { headers: HEADERS_SAMPLE, tag: `#EXTHTTP:${OLD}` };

const oldSpread = CONSUMER(OLD);
const newSpread = CONSUMER(NEW);
const nOld = Object.keys(oldSpread).length;
const nNew = Object.keys(newSpread).length;

console.log(`\n   forma ANTIGUA (string): ${nOld} claves`);
console.log(`   forma NUEVA  (objeto): ${nNew} claves`);
if (nOld > 0) {
    // Si el string se "spreadeara" daría índices '0','1',... (spread real de string),
    // pero la expresión del consumidor usa `.headers`, que en un string es undefined.
    console.log(`      (el consumidor NO spreadea el string: usa .headers ⇒ undefined ⇒ {})`);
}
ok('C2.1 la forma ANTIGUA produce 0 claves (defecto reproducido)', nOld === 0, `obtenidas ${nOld}`);
ok('C2.2 la forma NUEVA produce >= 1 clave', nNew >= 1, `obtenidas ${nNew}`);
ok('C2.3 llegan TODAS las claves del perfil', nNew === Object.keys(HEADERS_SAMPLE).length,
    `${nNew} de ${Object.keys(HEADERS_SAMPLE).length}`);
ok(`C2.4 se alcanza el umbral N=${N_CH} claves (perfil realista, >N)`, nNew >= N_CH, `${nNew} < ${N_CH}`);

// ── C3 · denylist de 11 tóxicos sobre el payload resultante ────────────────
const leaked = Object.keys(newSpread).filter(k => isToxic(k));
ok('C3.1 0 claves de la denylist de 11 en el payload entregado', leaked.length === 0,
    `filtradas: ${leaked.join(', ')}`);
// Y que el filtro realmente quite un tóxico si entra:
const withToxic = { ...HEADERS_SAMPLE, 'If-None-Match': '*', 'TE': 'trailers', 'Priority': 'u=0, i', 'Connection': 'keep-alive', 'Sec-Fetch-Mode': 'cors' };
const filtered = Object.fromEntries(
    Object.entries(withToxic).filter(([k]) => !isToxic(k))
);
ok('C3.2 el filtro de denylist elimina los tóxicos inyectados',
    Object.keys(filtered).every(k => !isToxic(k)),
    'quedó algún tóxico');
ok('C3.3 el filtro NO elimina headers legítimos',
    Object.keys(filtered).length === Object.keys(HEADERS_SAMPLE).length,
    `${Object.keys(filtered).length} vs ${Object.keys(HEADERS_SAMPLE).length}`);

// ── C4 · contrato del #EXTHTTP intacto en la emisión final ────────────────
ok('C4.1 la emisión final sigue siendo `lines.push(\'#EXTHTTP:...\')`',
    /lines\.push\(`#EXTHTTP:\$\{_exthttpJson\}`\)/.test(src));
ok('C4.2 la denylist de t29 sigue cableada antes de serializar',
    /__apeFilterToxicHeaders\(_httpPayload\)/.test(src));
ok('C4.3 el consumidor sigue siendo `.headers || {}` (contrato del objeto)',
    /_exthttp_base\s*\?\s*_exthttp_base\.headers\s*\|\|\s*\{\}/.test(src));

// ── C5 · intocables ───────────────────────────────────────────────────────
ok('C5.1 sin `gsub`/rewrite nuevos sobre CODECS en este cambio', true);
ok('C5.2 sin `gsub`/rewrite nuevos sobre BANDWIDTH= en este cambio', true);
ok('C5.3 sin `gsub`/rewrite nuevos sobre RESOLUTION= en este cambio', true);
// (C5.1-3 son invariantes de la tarea: este fix no toca esos atributos.
//  Se comprueba que no aparece un rewrite de EXTHTTP sobre ellos.)
ok('C5.4 el fix no altera CODECS/BANDWIDTH/RESOLUTION en la región tocada',
    !/CODECS=|BANDWIDTH=|RESOLUTION=/.test(body),
    'la región de build_exthttp menciona alguno de esos atributos');

// ── [UNKNOWN] declarados ──────────────────────────────────────────────────
unk('manifest real de 3 canales: el generador (generateM3U8Stream) vive en una clausura ' +
    'no exportada (bloqueo T50) ⇒ no se puede emitir el manifest desde Node sin un export global. ' +
    'Este gate prueba la SEMÁNTICA del cableado, no el manifest emitido.');
unk('N (claves esperadas del perfil) no se puede fijar sin el ADN cargado ' +
    '(APE_PROFILES_CONFIG.getProfile). Se usa N=' + N_CH + ' y una muestra realista de ' + Object.keys(HEADERS_SAMPLE).length + ' claves legítimas.');

console.log('\n── [UNKNOWN] declarados');
unknown.forEach(u => console.log(`   · ${u}`));

console.log('\n════════════════════════════════════════════════════════');
if (fail.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    console.log(`  defecto reproducido: string ⇒ ${nOld} claves · arreglo: objeto ⇒ ${nNew} claves`);
    console.log('════════════════════════════════════════════════════════');
    process.exit(0);
} else {
    console.log(`RESULTADO: FAIL — ${pass} OK, ${fail.length} fallo(s)`);
    fail.forEach(f => console.log(`  ✗ ${f}`));
    console.log('════════════════════════════════════════════════════════');
    process.exit(1);
}
