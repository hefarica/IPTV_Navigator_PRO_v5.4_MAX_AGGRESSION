#!/usr/bin/env node
/**
 * test_hybrid_single_file.js — HIBRIDA EN UN SOLO FICHERO (mandato del operador 2026-11-15)
 *
 * LO QUE EL OPERADOR EXIGIO
 *   "BAJAN DOS FORMATOS EN UNO SOLO... INTEGRARLOS SIN QUE NINGUNO SE PISE Y SIN QUE
 *    NINGUNO FALLE, PERO QUE LOS DOS FUNCIONEN CUANDO SE REQUIERA EN EL PLAYER O DEVICE"
 *
 * LO QUE HABIA
 *   Con formato HIBRIDA se descargaban DOS archivos: el .m3u8 (HLS) y una M3U aparte que
 *   apuntaba al MPD del JIT. Dos descargas que emparejar, y la segunda fallaba sola con
 *   HTTP 503 PROVIDER_SLOT_BUSY (medido en produccion), dejando la salida a medias sin que
 *   la primera lo supiera.
 *
 * LO QUE SE MIDE AQUI
 *   A) El panel pide hybrid en las MISMAS opciones de generacion (no descarga aparte).
 *   B) El controlador propaga esas opciones al generador sin perderlas.
 *   C) El generador emite UN tag de cabecera con el manifiesto DASH como JSON.
 *   D) Ese JSON es valido y dice la verdad sobre cuando funciona la ruta DASH.
 *   E) Sin hybrid no se emite NADA: la ruta normal no cambia ni un byte.
 *   F) El tag es ignorable por un reproductor HLS (RFC 8216) y no se repite por canal.
 *
 * El codigo bajo prueba es el de produccion: se carga el IIFE real del generador y se
 * llama a su funcion de cabecera. No hay copia de la logica.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FE = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend');
const GEN = path.join(FE, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const PANEL = path.join(FE, 'js', 'ape-v9', 'generation-output-panel.js');
const CTRL = path.join(FE, 'js', 'ape-v9', 'generation-controller.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

const genSrc = fs.readFileSync(GEN, 'utf8');
const panelSrc = fs.readFileSync(PANEL, 'utf8');
const ctrlSrc = fs.readFileSync(CTRL, 'utf8');

console.log('\n═══ A · EL PANEL PIDE HIBRIDA EN LAS OPCIONES, NO EN UNA DESCARGA APARTE ═══\n');

check('A1 genOpts marca hybrid cuando el formato es hybrid',
    /o\.hybrid = \(selectedFormat\(\) === 'hybrid'\)/.test(panelSrc));
check('A2 deliverHybridDash ya NO descarga un segundo archivo',
    !/async function deliverHybridDash[\s\S]{0,400}downloadActiveJitMpd/.test(panelSrc));
check('A3 deliverHybridDash ya no es async', /function deliverHybridDash\(\) \{/.test(panelSrc) &&
    !/async function deliverHybridDash/.test(panelSrc));
// A4 — el aviso de HIBRIDA no puede prometer dos archivos. Se mira SOLO el bloque de
// hybrid, y sin comentarios: el comentario CITA el texto viejo ("se descargaran DOS
// archivos") para explicar por que se cambio, y citarlo no es prometerlo.
const hybridRaw = (panelSrc.match(/if \(f === 'hybrid'\) \{[\s\S]{0,900}?\n    \}/) || [''])[0];
const hybridBlock = hybridRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('A4 el aviso de HIBRIDA ya no promete dos archivos', !!hybridBlock && !/DOS archivos/i.test(hybridBlock),
    hybridBlock ? hybridBlock.slice(0, 120) : 'bloque no encontrado');
check('A4b el aviso de HIBRIDA dice un solo archivo', /un solo archivo/i.test(hybridBlock), hybridBlock.slice(0, 90));
check('A5 el aviso dice que van en el MISMO archivo',
    /MISMO archivo/.test(panelSrc), (panelSrc.match(/H[IÍ]BRIDA[^'"]{0,90}/) || [''])[0]);

console.log('\n═══ B · EL CONTROLADOR PROPAGA LAS OPCIONES AL GENERADOR ═══\n');

check('B1 el controlador construye merged con spread de options',
    /const merged = \{\s*\.\.\.options,/.test(ctrlSrc));
const genCalls = ['gen.generateAndDownloadStreaming(channels, merged)',
    'gen.generate(channels, merged)',
    'gen.generateStream(channels, merged)'];
check('B2 las tres rutas de generacion reciben merged', genCalls.every(c => ctrlSrc.includes(c)),
    genCalls.filter(c => !ctrlSrc.includes(c)).join(' | ') || 'las tres');
check('B3 prepublishAndGenerateDual conserva las opciones al envolverlas',
    /Object\.assign\(\{\}, options, \{ dual: dualMode/.test(ctrlSrc));

console.log('\n═══ C · EL GENERADOR EMITE UN UNICO TAG DE CABECERA ═══\n');

check('C1 existe __apeHybridHeaderBlock', /function __apeHybridHeaderBlock\(options = \{\}\)/.test(genSrc));
check('C2 se llama en el camino de la cabecera',
    /generateGlobalHeader\(channels\.length, options\)[\s\S]{0,400}__apeHybridHeaderBlock\(options\)/.test(genSrc));
check('C3 emite el modo para grep rapido', /#EXT-X-APE-DR-MODE:HYBRID/.test(genSrc));
check('C4 emite el contenedor JSON', /#EXT-X-APE-DASH-CONTAINER:' \+ JSON\.stringify\(spec\)/.test(genSrc));
check('C5 el JSON se serializa con JSON.stringify (no se concatena a mano)',
    /JSON\.stringify\(spec\)/.test(genSrc));
check('C6 esta expuesto en el seam publico', /hybridHeaderBlock: __apeHybridHeaderBlock/.test(genSrc));

console.log('\n═══ D · EL JSON EMITIDO ES VALIDO Y HONESTO ═══\n');

// Se ejecuta el generador REAL en un entorno minimo y se llama a su funcion de cabecera.
// Si el IIFE completo no arranca fuera del navegador, se extrae el TEXTO EXACTO de
// __apeHybridHeaderBlock del fichero y se evalua: mismo codigo de produccion, sin copia.
function loadGenerator() {
    const win = {};
    win.window = win;
    win.document = {
        getElementById() { return null; }, querySelector() { return null; },
        querySelectorAll() { return []; }, createElement() { return { style: {} }; },
        addEventListener() { }, body: { appendChild() { } }, readyState: 'complete'
    };
    win.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
    win.navigator = { userAgent: 'node-test' };
    win.location = { href: 'http://localhost/', hostname: 'localhost' };
    win.APE_JIT_BASE = 'https://iptv-ape.duckdns.org';
    win.setTimeout = setTimeout; win.clearTimeout = clearTimeout;
    win.setInterval = () => 0; win.clearInterval = () => { };
    win.console = console;
    win.URL = URL;
    const saved = { window: global.window, document: global.document, localStorage: global.localStorage, navigator: global.navigator, location: global.location, setInterval: global.setInterval };
    global.window = win; global.document = win.document; global.localStorage = win.localStorage;
    global.navigator = win.navigator; global.location = win.location;
    global.setInterval = () => 0;
    let api = null;
    try {
        new Function(genSrc)();
        api = global.window && global.window.M3U8TypedArraysGenerator;
    } catch (e) {
        // El IIFE completo necesita el navegador; se aisla la funcion por su texto exacto.
        api = null;
    } finally {
        global.window = saved.window; global.document = saved.document; global.localStorage = saved.localStorage;
        global.navigator = saved.navigator; global.location = saved.location; global.setInterval = saved.setInterval;
    }
    if (api && typeof api.hybridHeaderBlock === 'function') return api;

    // Aislamiento por texto exacto: se copia la funcion TAL CUAL del fichero de produccion.
    const start = genSrc.indexOf('function __apeHybridHeaderBlock');
    if (start < 0) return null;
    // OJO: el parametro por defecto tiene su propio `{}` (options = {}), asi que el conteo
    // de llaves debe empezar en la llave del CUERPO, no en la primera que aparezca.
    const bodyOpen = genSrc.indexOf(') {', start);
    if (bodyOpen < 0) return null;
    let depth = 0, end = -1;
    for (let i = bodyOpen + 2; i < genSrc.length; i++) {
        const ch = genSrc[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) return null;
    const fnText = genSrc.slice(start, end);
    const win2 = { APE_JIT_BASE: 'https://iptv-ape.duckdns.org' };
    win2.window = win2;
    const factory = new Function('window', 'globalThis', 'console', 'return (' + fnText + ');');
    try {
        return { hybridHeaderBlock: factory(win2, win2, console) };
    } catch (e) {
        return null;
    }
}

let api = null;
try { api = loadGenerator(); } catch (_) { api = null; }

if (api && typeof api.hybridHeaderBlock === 'function') {
    const off = api.hybridHeaderBlock({});
    check('D1 sin hybrid devuelve cadena vacia (la ruta normal no cambia)', off === '', JSON.stringify(off));
    const off2 = api.hybridHeaderBlock({ hybrid: false });
    check('D2 hybrid:false tambien devuelve vacio', off2 === '', JSON.stringify(off2));

    const block = api.hybridHeaderBlock({ hybrid: true });
    check('D3 con hybrid emite el modo', /#EXT-X-APE-DR-MODE:HYBRID/.test(block), block.slice(0, 60));
    const m = block.match(/#EXT-X-APE-DASH-CONTAINER:(.+)$/m);
    check('D4 emite la linea del contenedor', !!m);
    if (m) {
        let spec = null;
        try { spec = JSON.parse(m[1]); } catch (e) { spec = null; }
        check('D5 el JSON parsea', !!spec, spec ? 'ok' : m[1].slice(0, 120));
        if (spec) {
            check('D6 declara los dos formatos', Array.isArray(spec.formats) && spec.formats.includes('hls') && spec.formats.includes('dash'), JSON.stringify(spec.formats));
            check('D7 declara un solo contenedor', spec.container === 'single-m3u8', String(spec.container));
            check('D8 HLS funciona siempre', spec.hls && spec.hls.works === 'always', JSON.stringify(spec.hls && spec.hls.works));
            check('D9 DASH dice la verdad: solo con pipeline JIT activo',
                spec.dash && spec.dash.works === 'when_jit_pipeline_active', JSON.stringify(spec.dash && spec.dash.works));
            check('D10 el MPD se resuelve por tvg-id, no por 21224 punteros',
                spec.dash && /\{id\}/.test(spec.dash.mpd_template) && /tvg-id/.test(spec.dash.id_source),
                JSON.stringify(spec.dash && spec.dash.mpd_template));
            check('D11 el MPD apunta al host del JIT', spec.dash && /\/jit\/live\/\{id\}\/manifest\.mpd$/.test(spec.dash.mpd_template), String(spec.dash && spec.dash.mpd_template));
            check('D12 declara que no colisiona nada', spec.isolation && /none/.test(spec.isolation.collide || ''), JSON.stringify(spec.isolation && spec.isolation.collide));
            check('D13 declara execution=declared (no "applied")', spec.execution === 'declared', String(spec.execution));
            check('D14 HLS players ignoran el tag por RFC 8216', /RFC 8216/.test(JSON.stringify(spec.isolation)), JSON.stringify(spec.isolation && spec.isolation.hls_players));
        }
    }
} else {
    console.log('  (el generador no expuso el seam en este entorno; se valida por forma de codigo)');
    check('D1 sin hybrid devuelve cadena vacia', /if \(!options \|\| options\.hybrid !== true\) return '';/.test(genSrc));
    check('D5 el JSON se construye con JSON.stringify', /JSON\.stringify\(spec\)/.test(genSrc));
    check('D9 DASH declara works=when_jit_pipeline_active', /works: 'when_jit_pipeline_active'/.test(genSrc));
    check('D10 el MPD se resuelve por tvg-id', /id_source: '#EXTINF tvg-id'/.test(genSrc));
    check('D13 declara execution=declared', /execution: 'declared'/.test(genSrc));
}

console.log('\n═══ E · UN SOLO TAG, NO UNO POR CANAL ═══\n');

// El tag vive en la cabecera: aparece UNA vez en el codigo y SIEMPRE dentro de
// __apeHybridHeaderBlock, nunca en el camino de emision por canal.
const fnStart = genSrc.indexOf('function __apeHybridHeaderBlock');
const fnEnd = fnStart >= 0 ? genSrc.indexOf('function generateGlobalHeader', fnStart) : -1;
const fnBody = (fnStart >= 0 && fnEnd > fnStart) ? genSrc.slice(fnStart, fnEnd) : '';
const tagTotal = (genSrc.match(/#EXT-X-APE-DASH-CONTAINER:/g) || []).length;
const tagInFn = (fnBody.match(/#EXT-X-APE-DASH-CONTAINER:/g) || []).length;
check('E1 el tag solo vive dentro de __apeHybridHeaderBlock', tagTotal === 1 && tagInFn === 1,
    'total=' + tagTotal + ' enFuncion=' + tagInFn);
const dashContainerCount = tagTotal;
check('E2 el tag aparece una sola vez en el codigo', dashContainerCount === 1, String(dashContainerCount));
check('E3 no hay punteros por canal', !/#EXT-X-APE-DASH-POINTER/.test(genSrc));

console.log('\n═══ F · NO SE ROMPE NADA DE LO QUE YA FUNCIONABA ═══\n');

check('F1 el tag es de la familia APE (ignorable por RFC 8216)', /#EXT-X-APE-DASH-CONTAINER/.test(genSrc));
check('F2 un fallo del bloque no rompe la generacion', /catch \(e\)[\s\S]{0,200}hybrid header block omitido[\s\S]{0,40}return '';/.test(genSrc));
check('F3 el formato MPD puro sigue teniendo su ruta propia', /selectedFormat\(\) === 'mpd'/.test(panelSrc));
check('F4 downloadActiveJitMpd sigue existiendo para el formato DASH', /async function downloadActiveJitMpd/.test(panelSrc));

console.log('\n═══ G · SINTAXIS ═══\n');
for (const [label, src] of [['generador', genSrc], ['panel', panelSrc], ['controlador', ctrlSrc]]) {
    let ok = true, err = '';
    try { new Function(src); } catch (e) { ok = false; err = e.message; }
    check('G ' + label + ' parsea', ok, err);
}

console.log('\n─────────────────────────────────────────────');
console.log('  PASS ' + pass + ' · FAIL ' + fail);
if (fail) { failures.forEach(f => console.log('   · ' + f)); process.exit(1); }
console.log('  Un fichero. HLS en el cuerpo, DASH en un tag JSON. Ninguno se pisa.');
process.exit(0);
