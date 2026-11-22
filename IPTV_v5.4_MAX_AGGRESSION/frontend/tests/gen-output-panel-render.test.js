#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// render() REAL del panel · re-pintado del badge JIT desde localStorage
//
// Cierra la costura de cobertura que midió la revisión (mutación M6): el arnés de
// gen-output-panel-format.test.js deja el DOM en readyState 'loading', así que render() NUNCA
// corre y quitar la llamada a renderJitFallbackBadge() dentro de render() no rompía ningún
// test. Aquí el DOM simulado está en readyState 'complete' y setTimeout es síncrono: cargar el
// panel EJECUTA render(), exactamente como en la página real. No se llama a ninguna función
// interna del panel: se carga el archivo y se lee el DOM resultante.
//
// Qué SÍ prueba: que al renderizar, el badge persistente #ape-jit-fallback se puebla desde
// localStorage['ape_last_jit_fallback'] con el iso y el motivo, y que sin dato (clave ausente,
// JSON corrupto, registro sin motivo) queda vacío sin lanzar.
// Qué NO prueba: reproducción, generador, VPS ni el contenido de la lista. El DOM es un doble
// explícito, no un navegador.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONT = path.resolve(__dirname, '..');
const PANEL = path.join(FRONT, 'js/ape-v9/generation-output-panel.js');
const KEY = 'ape_last_jit_fallback';
const AMBER = '#f59e0b';
const quiet = { log() { }, warn() { }, error() { }, debug() { } };

// ── DOM simulado ────────────────────────────────────────────────────────────────────────────
// Elemento con lo mínimo que render() toca. Los nodos por id se auto-crean: en el navegador
// ya existen porque el panel los escribe en su propio innerHTML; aquí se materializan al
// pedirlos, con la misma identidad mientras viva el contexto.
function makeElement(tag) {
    const listeners = Object.create(null);
    return {
        tagName: String(tag || 'div').toUpperCase(),
        style: {},
        textContent: '',
        title: '',
        value: '',
        checked: false,
        disabled: false,
        firstChild: null,
        children: [],
        _attrs: Object.create(null),
        _queries: Object.create(null),
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        dispatch(type, event) { (listeners[type] || []).forEach(fn => fn(event || { type })); },
        getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; },
        setAttribute(name, value) { this._attrs[name] = String(value); },
        appendChild(child) { this.children.push(child); if (!this.firstChild) this.firstChild = child; return child; },
        insertBefore(child) { this.children.unshift(child); this.firstChild = child; return child; },
        removeChild() { },
        querySelector() { return null; },
        querySelectorAll(selector) { return this._queries[selector] || []; }
    };
}

// Los botones Generar X se DERIVAN del markup real del panel (data-ape-run="vps|direct|both|
// light"): si mañana se renombra un botón, el arnés lo sigue sin tocar el test.
function deriveRunButtons(panel, markup) {
    const all = [];
    const re = /data-ape-run="([a-z]+)"/g;
    let match;
    while ((match = re.exec(markup)) !== null) {
        const button = makeElement('button');
        button._attrs['data-ape-run'] = match[1];
        all.push(button);
        const selector = '[data-ape-run="' + match[1] + '"]';
        panel._queries[selector] = panel._queries[selector] || [];
        panel._queries[selector].push(button);
    }
    panel._queries['[data-ape-run]'] = all;
}

// Los nodos con id TAMBIÉN se derivan del markup: en un navegador real el innerHTML del panel
// los crea, y aquí se materializan al escribirlo (con el mismo `checked` que declare la
// etiqueta). Así el badge que se afirma NO es un nodo inventado por el arnés: es el
// `#ape-jit-fallback` que el propio panel escribe en su plantilla.
function registerMarkupIds(markup, byId, markupIds) {
    const re = /id="([\w-]+)"([^>]*)>/g;
    let match;
    while ((match = re.exec(markup)) !== null) {
        const node = makeElement('div');
        node.id = match[1];
        if (/\bchecked\b/.test(match[2])) node.checked = true;
        byId.set(node.id, node);
        markupIds.add(node.id);
    }
}

function makePanel(onMarkup) {
    const panel = makeElement('section');
    let markup = '';
    Object.defineProperty(panel, 'innerHTML', {
        configurable: true,
        get() { return markup; },
        set(value) { markup = String(value); onMarkup(panel, markup); }
    });
    return panel;
}

// `seed`: valor crudo que queda en localStorage[KEY] ANTES de cargar el panel. undefined = la
// clave no existe (escenario "sin dato").
function environment({ seed } = {}) {
    const store = new Map();
    if (seed !== undefined) store.set(KEY, seed);

    const byId = new Map();
    const markupIds = new Set();
    const consoleInfo = [];
    let panelRef = null;

    function getById(id) {
        if (!byId.has(id)) byId.set(id, makeElement('div'));
        return byId.get(id);
    }

    const tab = makeElement('div');
    tab.id = 'tab-export';
    // insertBefore del panel en la pestaña: registra el panel con el id que él mismo se pone,
    // igual que haría el DOM real.
    tab.insertBefore = function (child) {
        tab.children.unshift(child);
        tab.firstChild = child;
        if (child && child.id) {
            byId.set(child.id, child);
            if (child.id === 'ape-gen-output-panel') panelRef = child;
        }
        return child;
    };

    const formatRadios = ['m3u8', 'mpd', 'hybrid'].map(value => {
        const radio = makeElement('input');
        radio.value = value;
        radio.checked = value === 'm3u8';
        return radio;
    });

    const document = {
        // ← LA CLAVE DEL ENCARGO: con 'loading' el panel sólo registraría el listener y
        // render() no correría nunca; con 'complete' el panel lo ejecuta al cargarse.
        readyState: 'complete',
        getElementById: id => getById(id),
        querySelector(selector) {
            if (selector === '#tab-export') return tab;
            if (selector === '#ape-gen-output-panel') return panelRef;
            if (selector.charAt(0) === '#') return getById(selector.slice(1));
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'input[name="ape-out-format"]') return formatRadios;
            return [];
        },
        createElement(name) {
            return name === 'section'
                ? makePanel(function (panel, markup) {
                    deriveRunButtons(panel, markup);
                    registerMarkupIds(markup, byId, markupIds);
                })
                : makeElement(name);
        },
        addEventListener() { },
        body: { appendChild() { }, removeChild() { } }
    };

    const localStorage = {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key)
    };

    const ctx = {
        console: { ...quiet, info: (...args) => consoleInfo.push(args.join(' ')) },
        document,
        localStorage,
        // Síncrono: el panel hace setTimeout(render, 0) al cargarse, así que cargarlo
        // ejecuta render() en el acto, sin esperas ni temporizadores reales.
        setTimeout: fn => { if (typeof fn === 'function') fn(); return 0; },
        clearTimeout,
        setInterval: () => 0,
        clearInterval() { },
        app: { showToast() { } },
        __APE_OUTPUT_TEST__: true,
        APE_VPS_BASE: 'https://vps.invalid',
        APE_JIT_BASE: 'https://jit.invalid'
    };
    ctx.window = ctx;
    ctx.self = ctx;
    ctx.global = ctx;

    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(PANEL, 'utf8'), ctx, { filename: 'generation-output-panel.js' });

    return {
        ctx, store, tab, byId, markupIds, consoleInfo,
        // Leer el nodo NO lo puebla: lo devuelve tal como quedó tras render().
        badge: () => getById('ape-jit-fallback'),
        hooks: () => ctx.APE_OUTPUT_TEST_HOOKS
    };
}

// Prueba de que render() recorrió el panel hasta el final (y no murió antes del badge):
// el panel se insertó en la pestaña, selPaint quedó publicado (línea 1658) y paintMode()
// fijó el modo global (línea 1731), que va DESPUÉS de la llamada al badge (línea 1707).
function assertRenderCompleted(env) {
    assert.equal(env.tab.children.length, 1, 'render() insertó UN panel en #tab-export');
    assert.equal(env.tab.children[0].id, 'ape-gen-output-panel', 'el panel insertado es el del panel de salidas');
    assert.equal(typeof env.hooks().selPaint, 'function', 'render() llegó a publicar selPaint');
    assert.equal(env.ctx.APE_PUBLICATION_MODE, 'balanced_95',
        'render() llegó a paintMode(), que está DESPUÉS de la llamada al badge');
    assert.ok(env.tab.children[0].innerHTML.indexOf('id="ape-jit-fallback"') >= 0,
        'el nodo del badge existe en el markup real del panel');
}

let passed = 0;
let failed = 0;
function fail(label, error) {
    failed++;
    console.error('FAIL ' + label + ' :: ' + (error && error.stack ? error.stack.split('\n')[0] : error));
}
async function test(label, body) {
    try { await body(); passed++; console.log('PASS ' + label); }
    catch (error) { fail(label, error); }
}

async function main() {
    const record = {
        at: 1795300000000,
        iso: new Date(1795300000000).toISOString(),
        reason: 'catalog HTTP 503 · PROVIDER_SLOT_BUSY',
        requested: true
    };

    await test('render() real pinta el badge persistente desde localStorage (iso + motivo)', async () => {
        const env = environment({ seed: JSON.stringify(record) });
        assertRenderCompleted(env);
        const badge = env.badge();
        assert.ok(env.markupIds.has('ape-jit-fallback'), 'el badge es el nodo que la plantilla del panel escribe');
        assert.ok(badge.textContent.length > 0, 'el badge quedó poblado: ' + JSON.stringify(badge.textContent));
        assert.ok(badge.textContent.indexOf(record.iso) >= 0,
            'el texto incluye el ISO del registro: ' + badge.textContent);
        assert.ok(badge.textContent.indexOf(record.reason) >= 0,
            'el texto incluye el motivo del registro: ' + badge.textContent);
        assert.ok(badge.textContent.indexOf('Último fallback de JIT') === 0,
            'y se rotula como el último fallback: ' + badge.textContent);
        assert.equal(badge.style.color, AMBER, 'se pinta en ámbar, no como estado normal');
        assert.ok(String(badge.title).indexOf(KEY) >= 0,
            'el title dice de dónde sale el dato: ' + badge.title);
        // El read-back también informa por consola (sin abrir el inspector de storage).
        assert.ok(env.consoleInfo.some(line => line.indexOf(record.iso) >= 0 && line.indexOf('catalog HTTP 503') >= 0),
            'console.info nombra iso y motivo: ' + JSON.stringify(env.consoleInfo));
    });

    await test('sin clave en localStorage, el badge queda vacío y render() no lanza', async () => {
        const env = environment();   // sin seed: la clave no existe
        assertRenderCompleted(env);  // el render corrió COMPLETO (si no, este test no probaría nada)
        assert.ok(env.markupIds.has('ape-jit-fallback'), 'el nodo del badge existe en la plantilla del panel');
        assert.equal(env.badge().textContent, '', 'sin dato no se pinta nada: no se inventa un fallback');
    });

    await test('con JSON corrupto, el badge queda vacío y render() no lanza', async () => {
        const env = environment({ seed: '{no es json' });
        assertRenderCompleted(env);
        assert.ok(env.markupIds.has('ape-jit-fallback'));
        assert.equal(env.badge().textContent, '', 'un registro ilegible no se pinta como fallback');
    });

    await test('con un registro sin motivo de texto, el badge tampoco inventa', async () => {
        // readJitFallback() sólo acepta objetos con reason de tipo string: un motivo numérico
        // o ausente no es un motivo, y pintarlo sería afirmar algo que no se midió.
        const env = environment({ seed: JSON.stringify({ at: record.at, iso: record.iso, requested: true }) });
        assertRenderCompleted(env);
        assert.equal(env.badge().textContent, '', 'sin motivo legible no hay línea que pintar');
    });
}

main().then(() => {
    console.log('RESULT ' + passed + ' passed, ' + failed + ' failed · ' +
        'scope=panel_render_real_path · physical_playback_verified=false');
    if (failed > 0) process.exitCode = 1;
}).catch(error => {
    console.error('FATAL ' + (error && error.stack ? error.stack : error));
    process.exitCode = 1;
});
