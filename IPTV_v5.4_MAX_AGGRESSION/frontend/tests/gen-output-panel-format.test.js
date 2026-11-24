#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PANEL «OPTIMIZACIÓN Y SALIDAS» · las DOS inconsistencias medidas
//
//   (1) JIT: runDirect degradaba en silencio a DIRECTO. ensureJitCatalog() devolvía false,
//       se ponía out.jit = false y solo salía un toast genérico: ni motivo, ni fecha, ni
//       rastro durable. La lista salía con las URL del proveedor y el operador creía haber
//       generado una lista JIT.
//   (2) LIGHT: runLight no llamaba a formatGuard() ni tenía rama DASH. Con el formato DASH
//       marcado generaba igualmente una base HLS y la publicaba, sin avisar.
//
// Node puro, sin dependencias. El panel real se carga en un contexto `vm` con un stub de
// document/window/fetch/localStorage y un APEGenerationController CONTADOR (misma TÉCNICA
// que frontend/tests/rea-generation-dispatch.test.js: `window = ctx`, hooks de prueba).
// Qué NO prueba este archivo: que la lista generada reproduzca, ni el generador, ni la
// proyección LIGHT del VPS, ni que la URL emitida lleve /pulse/ de verdad (eso lo comprueba
// rea-generation-dispatch.test.js, que ejerce el generador real). Prueba el DESPACHO del
// panel: qué se llama, con qué flag de cableado (window.APE_PULSE_WRAP), qué se persiste y
// qué se le dice al operador. Los dobles son fixtures explícitos, no el sistema real.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONT = path.resolve(__dirname, '..');
const PANEL = path.join(FRONT, 'js/ape-v9/generation-output-panel.js');
const JIT_FALLBACK_KEY = 'ape_last_jit_fallback';
const RED = '#ef4444';
const GREEN = '#22c55e';
const quiet = { log() { }, warn() { }, error() { }, debug() { }, info() { } };

// ── Stub mínimo del navegador ────────────────────────────────────────────────────────────────
// `catalog`: 'fail503' (el JIT responde 503 con motivo) | 'empty' (catálogo válido y vacío)
//            | 'ok' (un canal con hls).
// `storageThrows`: localStorage.setItem lanza como con cuota agotada o storage bloqueado.
// `storageReadThrows`: además getItem lanza (storage totalmente inaccesible) — sirve para
//            comprobar que el read-back devuelve null en vez de inventar un registro.
// `controllerMode`: 'ok' | 'throw' (el generador lanza) | 'cancel' (decision cancelled_*)
//            | 'skipped' (decision skipped_already_running).
// `exportFormat`: valor de #genExportFormat ('m3u8' | 'json' | …). 'json' es el export de
//            metadatos: la única salida que NO se cablea por /pulse/.
// `pulseWrap`: valor PREVIO de window.APE_PULSE_WRAP. Si se omite, la clave no existe y el
//            test exige que siga sin existir al terminar (restauración exacta).
function environment({ panelFormat = 'm3u8', lightChecked = true, jitChecked = false,
    catalog = 'fail503', storageThrows = false, storageReadThrows = false,
    controllerMode = 'ok', exportFormat = 'm3u8', pulseWrap } = {}) {
    const store = new Map();
    const fetches = [];
    const controllerCalls = [];
    const toasts = [];

    // El estado del panel se reescribe varias veces por corrida (LIGHT publica y luego
    // añade la URL). Se guarda el HISTORIAL para poder afirmar que el mensaje de éxito se
    // emitió, sin depender de cuál quedó como último texto.
    const statusHistory = [];
    const statusElement = {
        _text: '',
        style: {},
        get textContent() { return this._text; },
        set textContent(value) { this._text = String(value); statusHistory.push(this._text); }
    };

    const elements = {
        genExportFormat: { value: exportFormat },
        'ape-gen-status': statusElement,
        'ape-light-state': { textContent: '', style: {} },
        'ape-delta-input': { value: '15' },
        'ape-out-light': { checked: lightChecked },
        'ape-out-jit': { checked: jitChecked },
        'ape-out-hdr': { value: 'auto' },
        // Linea persistente del ultimo fallback de JIT (la rellena el panel al renderizar).
        'ape-jit-fallback': { textContent: '', style: {}, title: '' }
    };

    const document = {
        // 'loading' + addEventListener no-op: render() nunca corre. Se prueba el despacho,
        // no el pintado del panel.
        readyState: 'loading',
        getElementById: id => elements[id] || null,
        querySelector: selector => selector === 'input[name="ape-out-format"]:checked'
            ? { value: panelFormat }
            : (selector === '#ape-gen-status' ? elements['ape-gen-status'] : null),
        querySelectorAll: () => [],
        addEventListener() { },
        createElement: () => ({ style: {}, appendChild() { }, addEventListener() { } }),
        body: { appendChild() { }, removeChild() { } }
    };

    const localStorage = {
        getItem: key => {
            if (storageReadThrows) {
                const error = new Error('SecurityError: storage inaccesible (fixture)');
                error.name = 'SecurityError';
                throw error;
            }
            return store.has(key) ? store.get(key) : null;
        },
        setItem: (key, value) => {
            if (storageThrows) {
                const error = new Error('QuotaExceededError: storage bloqueado (fixture)');
                error.name = 'QuotaExceededError';
                throw error;
            }
            store.set(key, String(value));
        },
        removeItem: key => store.delete(key)
    };

    const ctx = {
        console: quiet,
        document,
        localStorage,
        setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0; },
        clearTimeout,
        setInterval: () => 0,
        clearInterval() { },
        app: {
            showToast: (msg, type) => toasts.push({ msg: String(msg), type: type || 'info' })
        },
        __APE_OUTPUT_TEST__: true,
        APE_VPS_BASE: 'https://vps.invalid',
        APE_JIT_BASE: 'https://jit.invalid',
        APE_LIST_NAME: 'APE_LISTA_TEST'
    };

    let lastDeltaArray = {};
    ctx.fetch = async function (url, options) {
        const target = String(url);
        const method = (options && options.method) || 'GET';
        fetches.push({ url: target, method });

        if (target.indexOf('/jit/catalog.json') >= 0) {
            if (catalog === 'ok') {
                return {
                    ok: true, status: 200, url: target,
                    json: async () => ({ channels: [{ id: 'a', hls: 'https://jit.invalid/jit/live/a/index.m3u8' }] })
                };
            }
            if (catalog === 'empty') {
                return { ok: true, status: 200, url: target, json: async () => ({ channels: [] }) };
            }
            // El motivo REAL que el panel debe nombrar sale de aquí (cuerpo incluido).
            return {
                ok: false, status: 503, url: target,
                text: async () => 'PROVIDER_SLOT_BUSY: use provider-direct; source unchanged',
                json: async () => ({ error: 'PROVIDER_SLOT_BUSY' })
            };
        }

        if (target.indexOf('ape-output-config.php') >= 0) {
            if (method === 'POST') {
                let sent = {};
                try { sent = JSON.parse(String((options && options.body) || '{}')); } catch (_) { sent = {}; }
                lastDeltaArray = sent.delta_array || {};
                return { ok: true, status: 200, url: target, text: async () => JSON.stringify({ ok: true }) };
            }
            // Lectura de vuelta: el panel compara el array guardado con el enviado.
            return {
                ok: true, status: 200, url: target,
                text: async () => JSON.stringify({ ok: true, delta_array: lastDeltaArray })
            };
        }

        if (target.indexOf('list-publish.php') >= 0) {
            return {
                ok: true, status: 200, url: target,
                json: async () => ({
                    ok: true, paso: 'enlace', url: 'https://vps.invalid/lists/APE_LISTA_TEST_LIGHT.m3u8',
                    medido: { canales: 100, plantillas: 9, indice: 1, ape_en_cuerpo: 0, lab: 'P3' },
                    placeholder_bytes: 2097152, placeholder_gz_bytes: 1048576,
                    enlace_bytes: 1234, ms: 500
                })
            };
        }

        return { ok: false, status: 404, url: target, text: async () => '{}', json: async () => ({}) };
    };

    // Contador, no generador: lo que se verifica es QUÉ se despacha y con qué opciones.
    // controllerMode permite el fallo real: 'throw' lanza, 'cancel' devuelve una decision de
    // cancelación (el generador real devuelve cancelled_* cuando el operador cancela).
    // pulseWrapAtCall es el dato del contrato de cableado: se lee DENTRO de la llamada, que es
    // el instante en que el generador real lee window.APE_PULSE_WRAP
    // (m3u8-typed-arrays-ultimate.js:13344). Mirarlo después no probaría nada.
    function controllerOutcome() {
        if (controllerMode === 'throw') throw new Error('generador caido (fixture)');
        if (controllerMode === 'cancel') return { decision: 'cancelled_by_user' };
        if (controllerMode === 'skipped') return { decision: 'skipped_already_running' };
        return { decision: 'generated_no_audit' };
    }
    ctx.APEGenerationController = {
        prepublishAndGenerateDual: async function (options) {
            controllerCalls.push({ fn: 'prepublishAndGenerateDual', options, pulseWrapAtCall: ctx.APE_PULSE_WRAP });
            return controllerOutcome();
        },
        prepublishAndGenerateDirect: async function (options) {
            controllerCalls.push({ fn: 'prepublishAndGenerateDirect', options, pulseWrapAtCall: ctx.APE_PULSE_WRAP });
            return controllerOutcome();
        },
        prepublishAndGenerate: async function (options) {
            controllerCalls.push({ fn: 'prepublishAndGenerate', options, pulseWrapAtCall: ctx.APE_PULSE_WRAP });
            return controllerOutcome();
        }
    };

    // Valor PREVIO del cableado (si se pidió uno): el panel debe devolverlo tal cual.
    if (pulseWrap !== undefined) ctx.APE_PULSE_WRAP = pulseWrap;

    ctx.window = ctx;
    ctx.self = ctx;
    ctx.global = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(PANEL, 'utf8'), ctx, { filename: 'generation-output-panel.js' });

    const status = () => elements['ape-gen-status'];
    return {
        ctx, elements, store, fetches, controllerCalls, toasts, status, statusHistory,
        hooks: () => ctx.APE_OUTPUT_TEST_HOOKS
    };
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

// Cuántas veces se llamó al endpoint de publicación. Aísla list-publish.php del resto de fetches
// (delta al VPS, catálogo JIT): lo que se mide es el efecto sobre el VPS, no el tráfico del panel.
function publishCallCount(env) {
    return env.fetches.filter(f => f.url.indexOf('list-publish.php') >= 0).length;
}

async function main() {
    // ── DEFECTO (2) · LIGHT ignorando DASH ──────────────────────────────────────────────────
    await test('LIGHT + DASH no genera, no publica y el estado nombra la causa', async () => {
        const env = environment({ panelFormat: 'mpd', lightChecked: true });
        await env.hooks().runLight();
        assert.equal(env.controllerCalls.length, 0, 'no se generó ninguna base');
        assert.equal(env.fetches.length, 0, 'no se descargó ni se publicó nada (cero red)');
        const status = env.status();
        assert.ok(status.textContent.includes('LIGHT no entrega DASH'), 'estado nombra la salida: ' + status.textContent);
        assert.ok(status.textContent.includes('DASH no aplica en esta salida'), 'estado nombra la causa');
        assert.equal(status.style.color, RED, 'el aborto se pinta en rojo');
        assert.ok(env.elements['ape-light-state'].textContent.includes('DASH no aplica'), 'el estado de la tarjeta LIGHT lo dice');
        assert.ok(env.toasts.some(t => t.type === 'error' && t.msg.includes('DASH')), 'toast de error nombra DASH');
        assert.equal(env.store.has(JIT_FALLBACK_KEY), false, 'un aborto de formato no es un fallback de JIT');
    });

    await test('LIGHT + DASH aborta antes de exigir el checkbox de autorización', async () => {
        const env = environment({ panelFormat: 'mpd', lightChecked: false });
        await env.hooks().runLight();
        assert.equal(env.controllerCalls.length, 0);
        assert.ok(env.status().textContent.includes('DASH no aplica'),
            'con DASH marcado se dice lo de DASH en el primer viaje, no "marca el checkbox"');
        assert.ok(!env.status().textContent.includes('marca el checkbox LIGHT'));
    });

    await test('LIGHT + M3U8 sigue el camino normal: base + publicación', async () => {
        const env = environment({ panelFormat: 'm3u8', lightChecked: true });
        await env.hooks().runLight();
        assert.equal(env.controllerCalls.length, 1, 'una sola pasada de generación');
        assert.equal(env.controllerCalls[0].fn, 'prepublishAndGenerateDual');
        assert.equal(env.controllerCalls[0].options.hybrid, false);
        assert.equal(env.controllerCalls[0].options.jit, false);
        assert.equal(publishCallCount(env), 1, 'UNA publicación cuando la base sí se generó');
        assert.ok(env.fetches.some(f => f.url.indexOf('list-publish.php') >= 0 && f.method === 'POST'),
            'se publica la base en el VPS');
        // La corrida emite dos estados de éxito: LIGHT PUBLICADA y después la URL. Se exige
        // que el de publicación se haya emitido, no que sea el último texto del DOM.
        assert.ok(env.statusHistory.some(s => s.includes('LIGHT PUBLICADA')),
            'mensaje de éxito conservado · historial: ' + JSON.stringify(env.statusHistory));
        assert.equal(env.status().style.color, GREEN);
        assert.equal(env.store.has(JIT_FALLBACK_KEY), false);
    });

    // ── LIGHT NO PUBLICA SI LA BASE NO SE GENERÓ (t19 · hallazgo (iii) de t17, preexistente) ──
    // El POST a list-publish.php proyecta y enlaza la base que YA existe en el VPS. Si la
    // generación fue CANCELADA o se SALTÓ porque ya había otra en curso, publicar enlazaría una
    // base VIEJA —la de una corrida anterior— y el operador leería 'LIGHT PUBLICADA' con un
    // enlace que no corresponde a lo que acaba de pedir. Misma clase de defecto que t1/t4/t16
    // (afirmar un hecho que no consta), pero aquí lo afirmado es un ENLACE publicado.
    for (const [modo, decision] of [['cancel', 'cancelled_by_user'], ['skipped', 'skipped_already_running']]) {
        await test('LIGHT con base NO generada (' + decision + ') no publica en el VPS', async () => {
            const env = environment({ panelFormat: 'm3u8', lightChecked: true, controllerMode: modo });
            await env.hooks().runLight();
            assert.equal(env.controllerCalls.length, 1, 'la base se intentó generar');
            assert.equal(publishCallCount(env), 0,
                'CERO llamadas a list-publish.php · fetches: ' + JSON.stringify(env.fetches.map(f => f.url)));
            assert.ok(!env.statusHistory.some(s => s.includes('LIGHT PUBLICADA')),
                'no se anuncia publicación · historial: ' + JSON.stringify(env.statusHistory));
            assert.ok(env.status().textContent.includes('no se publica en el VPS'),
                'el estado nombra la causa · ' + env.status().textContent);
            assert.ok(env.status().textContent.includes(decision),
                'y nombra la decisión REAL del controller · ' + env.status().textContent);
            assert.ok(env.elements['ape-light-state'].textContent.startsWith('NO PUBLICADA'),
                'el estado de la tarjeta es explícito · ' + env.elements['ape-light-state'].textContent);
            assert.ok(!env.elements['ape-light-state'].textContent.startsWith('PUBLICADA'),
                'no deja la tarjeta en PUBLICADA');
            assert.ok(env.toasts.some(t => t.msg.includes('no se publica en el VPS')),
                'toast con la causa · toasts: ' + JSON.stringify(env.toasts));
        });
    }

    await test('LIGHT sin checkbox sigue pidiendo la autorización explícita', async () => {
        const env = environment({ panelFormat: 'm3u8', lightChecked: false });
        await env.hooks().runLight();
        assert.equal(env.controllerCalls.length, 0);
        assert.equal(env.fetches.length, 0);
        assert.ok(env.status().textContent.includes('marca el checkbox LIGHT'));
        assert.equal(env.status().style.color, '#f59e0b');
    });

    await test('LIGHT + HÍBRIDA sí genera y pide la base con hybrid:true', async () => {
        const env = environment({ panelFormat: 'hybrid', lightChecked: true });
        await env.hooks().runLight();
        assert.equal(env.controllerCalls.length, 1, 'HÍBRIDA no es DASH: la base se genera');
        assert.equal(env.controllerCalls[0].fn, 'prepublishAndGenerateDual');
        assert.equal(env.controllerCalls[0].options.hybrid, true,
            'la base LIGHT lleva la parte DASH integrada (genOpts.hybrid)');
        assert.ok(env.statusHistory.some(s => s.includes('LIGHT PUBLICADA')),
            'historial: ' + JSON.stringify(env.statusHistory));
        assert.equal(env.status().style.color, GREEN);
    });

    // ── DEFECTO (1) · fallback de JIT silencioso ────────────────────────────────────────────
    await test('JIT caído: la base se genera, el estado sale en rojo y queda registro durable', async () => {
        const env = environment({ jitChecked: true, catalog: 'fail503' });
        await env.hooks().runDirect();

        assert.equal(env.controllerCalls.length, 1, 'la generación continúa');
        assert.equal(env.controllerCalls[0].fn, 'prepublishAndGenerateDirect');
        assert.equal(env.controllerCalls[0].options.jit, false, 'el generador recibe JIT apagado, no un JIT que no existe');

        const raw = env.store.get(JIT_FALLBACK_KEY);
        assert.ok(raw, 'deja registro en localStorage[' + JIT_FALLBACK_KEY + ']');
        const rec = JSON.parse(raw);
        assert.equal(rec.requested, true, 'requested:true — el operador SÍ había pedido JIT');
        assert.equal(typeof rec.at, 'number');
        assert.ok(rec.at > 0, 'at es un epoch en ms');
        assert.equal(new Date(rec.at).toISOString(), rec.iso, 'iso corresponde al mismo instante');
        assert.ok(rec.reason.includes('catalog HTTP 503'), 'el motivo es el real del catálogo: ' + rec.reason);

        const status = env.status();
        assert.ok(status.textContent.includes('fallback registrado'), 'estado: ' + status.textContent);
        assert.ok(status.textContent.includes('catalog HTTP 503'), 'el estado nombra el motivo real');
        assert.equal(status.style.color, RED, 'rojo, no verde de éxito');
        assert.ok(env.toasts.some(t => t.type === 'warning' && t.msg.includes('catalog HTTP 503')),
            'el toast tampoco se queda en genérico');
    });

    await test('JIT con catálogo válido y vacío se nombra como tal, no como error de red', async () => {
        const env = environment({ jitChecked: true, catalog: 'empty' });
        await env.hooks().runDirect();
        const rec = JSON.parse(env.store.get(JIT_FALLBACK_KEY));
        assert.ok(rec.reason.includes('sin canales usables'), 'motivo medido: ' + rec.reason);
        assert.ok(rec.reason.includes('0 filas'));
        assert.equal(env.status().style.color, RED);
    });

    await test('JIT que sí responde no deja registro de fallback (sin falso positivo)', async () => {
        const env = environment({ jitChecked: true, catalog: 'ok' });
        await env.hooks().runDirect();
        assert.equal(env.controllerCalls.length, 1);
        assert.equal(env.controllerCalls[0].options.jit, true, 'JIT se mantiene encendido');
        assert.equal(env.store.has(JIT_FALLBACK_KEY), false);
        assert.equal(env.status().style.color, GREEN);
        assert.ok(env.status().textContent.startsWith('DIRECTO completado'));
    });

    await test('storage bloqueado: el registro no lanza, lo dice y la generación no se rompe', async () => {
        const env = environment({ jitChecked: true, catalog: 'fail503', storageThrows: true });
        // Si recordJitFallback dejara escapar el throw, esta promesa rechazaría.
        await env.hooks().runDirect();
        assert.equal(env.controllerCalls.length, 1, 'la lista se generó igual');
        assert.equal(env.store.has(JIT_FALLBACK_KEY), false, 'no pudo escribir y aun así siguió');
        // t3: con persisted=false NO se puede afirmar durabilidad. El DOM lo dice literal.
        assert.ok(env.status().textContent.includes('registro NO persistido (storage bloqueado/sin cuota)'),
            'el estado confiesa que no persistió: ' + env.status().textContent);
        assert.ok(env.status().textContent.includes('catalog HTTP 503'),
            'el motivo sigue visible en el DOM aunque no se pueda persistir');
        assert.ok(!env.status().textContent.includes('consta en localStorage'),
            'no promete un registro que no existe');
        assert.equal(env.status().style.color, RED);
        // Y el registro directo tampoco lanza, aunque no pueda escribir: reported persisted=false.
        const rec = env.hooks().recordJitFallback('storage bloqueado');
        assert.equal(rec.requested, true);
        assert.equal(rec.reason, 'storage bloqueado');
        assert.equal(rec.persisted, false, 'persisted refleja el fallo de escritura');
    });

    await test('recordJitFallback devuelve persisted:true cuando la escritura sí ocurre', async () => {
        const env = environment();
        const rec = env.hooks().recordJitFallback('escritura normal');
        assert.equal(rec.persisted, true);
        assert.equal(JSON.parse(env.store.get(JIT_FALLBACK_KEY)).reason, 'escritura normal');
    });

    await test('read-back: el registro durable se relee y se pinta en la línea persistente', async () => {
        const env = environment({ jitChecked: true, catalog: 'fail503' });
        await env.hooks().runDirect();
        const badge = env.elements['ape-jit-fallback'];
        const rec = env.hooks().readJitFallback();
        assert.ok(rec, 'readJitFallback devuelve el registro escrito');
        assert.ok(rec.reason.includes('catalog HTTP 503'));
        assert.ok(badge.textContent.includes(rec.iso), 'el badge pinta el iso: ' + badge.textContent);
        assert.ok(badge.textContent.includes('catalog HTTP 503'), 'el badge pinta el motivo');
        assert.equal(badge.style.color, '#f59e0b');
        // Se simula la recarga del panel: render() vuelve a leer la clave y a pintar.
        badge.textContent = '';
        env.hooks().renderJitFallbackBadge();
        assert.ok(badge.textContent.includes(rec.iso) && badge.textContent.includes('catalog HTTP 503'),
            'tras releer la clave el motivo sigue a la vista: ' + badge.textContent);
    });

    await test('read-back con storage inaccesible o registro corrupto: no se inventa un fallback', async () => {
        const env = environment({ storageReadThrows: true });
        assert.equal(env.hooks().readJitFallback(), null, 'sin lectura no hay dato');
        assert.equal(env.hooks().renderJitFallbackBadge(), null, 'y no devuelve un registro inventado');
        assert.equal(env.elements['ape-jit-fallback'].textContent, '',
            'ni pinta una línea que parezca un fallo');
        // JSON corrupto en la clave: mismo criterio, null en vez de una excepción.
        const corrupt = environment();
        corrupt.store.set(JIT_FALLBACK_KEY, '{no es json');
        assert.equal(corrupt.hooks().readJitFallback(), null);
    });

    await test('generación fallida con JIT caído: conserva el fallo y añade el motivo como sufijo', async () => {
        const env = environment({ jitChecked: true, catalog: 'fail503', controllerMode: 'throw' });
        await env.hooks().runDirect();   // el catch del panel, no una promesa rechazada
        assert.equal(env.controllerCalls.length, 1);
        const status = env.status();
        assert.ok(status.textContent.startsWith('DIRECTO falló: generador caido (fixture)'),
            'el mensaje de fallo se conserva: ' + status.textContent);
        assert.ok(status.textContent.includes('· JIT no disponible: catalog HTTP 503'),
            'y el motivo del JIT va como sufijo, no lo reemplaza: ' + status.textContent);
        assert.ok(!status.textContent.includes('fallback registrado'),
            'no anuncia una lista que no se produjo');
        assert.ok(!status.textContent.includes('DIRECTO completado'));
        assert.equal(status.style.color, RED);
        assert.ok(env.store.has(JIT_FALLBACK_KEY), 'el fallback de JIT ocurrió antes del fallo: consta igual');
    });

    await test('generación cancelada con JIT caído: no afirma lista producida y el motivo sigue visible', async () => {
        const env = environment({ jitChecked: true, catalog: 'fail503', controllerMode: 'cancel' });
        await env.hooks().runDirect();
        const status = env.status();
        assert.ok(status.textContent.includes('cancelada'),
            'conserva el estado de cancelación: ' + status.textContent);
        assert.ok(status.textContent.includes('JIT no disponible: catalog HTTP 503'),
            'y añade el motivo del JIT: ' + status.textContent);
        assert.ok(!status.textContent.includes('fallback registrado'),
            'NO anuncia "fallback registrado" de una lista que no existe');
        assert.ok(!status.textContent.includes('la lista sale'));
        assert.ok(!status.textContent.includes('DIRECTO completado'));
        assert.equal(status.style.color, '#f59e0b');
    });

    // ── CRITERIO 4 · VPS / DIRECTO / AMBAS conservan su comportamiento ─────────────────────
    await test('VPS conserva su dispatch y su mensaje de éxito', async () => {
        const env = environment();
        await env.hooks().runVps();
        assert.equal(env.controllerCalls.length, 1);
        assert.equal(env.controllerCalls[0].fn, 'prepublishAndGenerateDual');
        assert.equal(env.controllerCalls[0].options.jit, false);
        assert.equal(env.controllerCalls[0].options.hdrMode, 'auto');
        assert.ok(env.status().textContent.startsWith('VPS completado'), 'mensaje: ' + env.status().textContent);
        assert.equal(env.status().style.color, GREEN);
    });

    await test('DIRECTO sin JIT conserva su dispatch y su mensaje de éxito', async () => {
        const env = environment();
        await env.hooks().runDirect();
        assert.equal(env.controllerCalls.length, 1);
        assert.equal(env.controllerCalls[0].fn, 'prepublishAndGenerateDirect');
        assert.ok(env.status().textContent.startsWith('DIRECTO completado'), 'mensaje: ' + env.status().textContent);
        assert.equal(env.status().style.color, GREEN);
        assert.equal(env.store.has(JIT_FALLBACK_KEY), false);
    });

    await test('AMBAS conserva su dispatch dual y su mensaje de éxito', async () => {
        const env = environment();
        await env.hooks().runBoth();
        assert.equal(env.controllerCalls.length, 1);
        assert.equal(env.controllerCalls[0].fn, 'prepublishAndGenerateDual');
        assert.equal(env.controllerCalls[0].options.dual, 'both');
        assert.ok(env.status().textContent.startsWith('AMBAS completado'), 'mensaje: ' + env.status().textContent);
        assert.equal(env.status().style.color, GREEN);
    });

    // ── NO REGRESIÓN · las otras tres salidas siguen cortando en DASH por el MPD ───────────
    for (const action of ['runVps', 'runDirect', 'runBoth']) {
        await test(action + ' con DASH sigue exportando el MPD del JIT y no genera catálogo', async () => {
            const env = environment({ panelFormat: 'mpd' });
            await env.hooks()[action]();
            assert.equal(env.controllerCalls.length, 0, 'no hay generación multicine');
            assert.ok(env.fetches.some(f => f.url.indexOf('/jit/catalog.json') >= 0),
                'consulta el catálogo JIT como hasta hoy');
            assert.ok(env.status().textContent.indexOf('DASH/MPD') === 0, 'mensaje DASH/MPD: ' + env.status().textContent);
            assert.equal(env.store.has(JIT_FALLBACK_KEY), false, 'la rama DASH no es un fallback de JIT');
        });
    }

    // ── CABLEADO /pulse/ POR SALIDA (t6 · orden del operador 2026-11-21) ───────────────────
    // El contrato manda: VPS, DIRECTO, AMBAS y LIGHT generan con APE_PULSE_WRAP=true; el export
    // JSON de metadatos es la ÚNICA excepción (false). El flag se lee DENTRO del controller
    // falso, que es el instante en que el generador real lo consume.
    // [2026-11-21 · t16 (hallazgo t8)] El estado ya NO se lee como hecho: dice 'cableado
    // solicitado por VPS (/pulse/)' y declara el alcance (los canales sin id numérico quedan
    // directos). El comportamiento real de ese alcance lo fija rea-generation-dispatch.test.js.
    for (const action of ['runVps', 'runDirect', 'runBoth', 'runLight']) {
        await test(action + ' genera con APE_PULSE_WRAP=true (cableado solicitado por /pulse/)', async () => {
            const env = environment({ lightChecked: true });
            await env.hooks()[action]();
            assert.equal(env.controllerCalls.length, 1);
            assert.equal(env.controllerCalls[0].pulseWrapAtCall, true,
                'el flag vale true DURANTE la llamada al controller');
            assert.ok(env.statusHistory.some(s => s.includes('cableado solicitado por VPS (/pulse/)')),
                'el estado nombra el cableado como lo que es: una solicitud · historial: ' +
                JSON.stringify(env.statusHistory));
            assert.ok(env.statusHistory.some(s => s.includes('los canales sin id numérico quedan directos')),
                'y declara el alcance real (el envoltorio sólo actúa sobre ids numéricos)');
            assert.ok(!env.statusHistory.some(s => s.includes('cableada por VPS')),
                'no vuelve a la forma de hecho no medido');
        });
    }

    for (const action of ['runVps', 'runDirect', 'runBoth', 'runLight']) {
        await test(action + ' con export JSON fuerza APE_PULSE_WRAP=false (catálogo de origen)', async () => {
            const env = environment({ lightChecked: true, exportFormat: 'json' });
            await env.hooks()[action]();
            assert.equal(env.controllerCalls.length, 1);
            assert.equal(env.controllerCalls[0].pulseWrapAtCall, false,
                'el catálogo de metadatos NO se envuelve: conserva las URL de origen');
            assert.ok(env.statusHistory.some(s => s.includes('catálogo de origen (sin /pulse/)')),
                'el estado declara la excepción · historial: ' + JSON.stringify(env.statusHistory));
        });
    }

    await test('las cuatro salidas restauran el valor previo del cableado tras el éxito', async () => {
        for (const action of ['runVps', 'runDirect', 'runBoth', 'runLight']) {
            const env = environment({ lightChecked: true, pulseWrap: 'valor-previo' });
            assert.equal(env.ctx.APE_PULSE_WRAP, 'valor-previo', 'precondición de ' + action);
            await env.hooks()[action]();
            assert.equal(env.ctx.APE_PULSE_WRAP, 'valor-previo',
                action + ' no debe dejar escapar el flag (el siguiente botón lo heredaría)');
        }
    });

    await test('las cuatro salidas restauran el valor previo del cableado tras el error', async () => {
        for (const action of ['runVps', 'runDirect', 'runBoth', 'runLight']) {
            const env = environment({ lightChecked: true, pulseWrap: false, controllerMode: 'throw' });
            await env.hooks()[action]();
            assert.equal(env.controllerCalls.length, 1, action + ': llegó a llamar al controller');
            assert.equal(env.ctx.APE_PULSE_WRAP, false,
                action + ' debe devolver exactamente false (no null/undefined) tras el catch');
        }
    });

    // [2026-11-21 · t16 (hallazgo t8)] Tercer desenlace que faltaba: cancelación. Ni el flag
    // puede quedarse pegado, ni el estado de cancelación puede afirmar un cableado que no
    // llegó a producirse (no hay lista).
    await test('las cuatro salidas restauran el valor previo del cableado al CANCELAR (sin afirmar cableado)', async () => {
        for (const action of ['runVps', 'runDirect', 'runBoth', 'runLight']) {
            const env = environment({ lightChecked: true, pulseWrap: 'sentinela-cancel', controllerMode: 'cancel' });
            await env.hooks()[action]();
            assert.equal(env.controllerCalls.length, 1, action + ': llegó a llamar al controller');
            assert.equal(env.ctx.APE_PULSE_WRAP, 'sentinela-cancel',
                action + ' debe devolver el valor previo exacto tras cancelar');
            const cancelLine = env.statusHistory.find(s => s.includes('cancelada'));
            assert.ok(cancelLine, action + ': deja constancia de la cancelación · historial: ' +
                JSON.stringify(env.statusHistory));
            assert.ok(!cancelLine.includes('cableado solicitado por VPS'),
                action + ': una cancelación no anuncia cableado (no hay lista) · línea: ' + cancelLine);
            assert.ok(!cancelLine.includes('cableada por VPS'),
                action + ': ni la forma anterior del sufijo · línea: ' + cancelLine);
        }
    });

    await test('si la clave no existía, la salida no la deja creada', async () => {
        const env = environment({ lightChecked: true });
        assert.equal('APE_PULSE_WRAP' in env.ctx, false, 'precondición: la clave no existe');
        await env.hooks().runDirect();
        assert.equal('APE_PULSE_WRAP' in env.ctx, false,
            'restaurar a "no existía" y no a "undefined": no es lo mismo');
    });

    await test('la rama DASH del MPD no toca el cableado', async () => {
        const env = environment({ panelFormat: 'mpd', pulseWrap: 'sentinela' });
        await env.hooks().runVps();
        assert.equal(env.controllerCalls.length, 0, 'la rama DASH no genera catálogo');
        assert.equal(env.ctx.APE_PULSE_WRAP, 'sentinela',
            'no se fija el flag para una descarga que no pasa por el generador');
    });

    await test('la tarjeta DIRECTO declara el cableado como solicitado y su alcance real', async () => {
        // render() no corre en este stub (readyState 'loading'), así que se inspecciona la
        // plantilla del panel en el archivo, acotada AL BLOQUE de la tarjeta DIRECTO
        // (ventana alrededor de su botón). Es una aserción sobre el texto que verá el operador.
        const source = fs.readFileSync(PANEL, 'utf8');
        const anchor = source.indexOf('data-ape-run="direct"');
        assert.ok(anchor > 0, 'botón Generar DIRECTO localizado en la plantilla');
        // Se descartan las líneas de comentario: no se renderizan, y un comentario que explica
        // el rótulo viejo no es un rótulo. Lo que se juzga es lo que verá el operador.
        const card = source.slice(Math.max(0, anchor - 900), anchor + 400)
            .split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
        assert.ok(!card.includes('sin CDN'), 'la tarjeta no afirma "sin CDN": ' + card.slice(0, 240));
        assert.ok(!card.includes('sin VPS'), 'la tarjeta no afirma "sin VPS"');
        assert.ok(!card.includes('URLs del proveedor'), 'la tarjeta no afirma que la URL va directa al proveedor');
        // [2026-11-21 · t16] Tampoco puede afirmar el hecho plano: el envoltorio omite los
        // canales sin id numérico, y el panel no recibe el conteo de envueltas/omitidas.
        assert.ok(!card.includes('la lista pasa por el VPS'),
            'no afirma el hecho no medido "la lista pasa por el VPS": ' + card.slice(0, 240));
        assert.ok(card.includes('cableado solicitado por VPS (/pulse/)'),
            'declara el cableado como SOLICITADO: ' + card.slice(0, 240));
        assert.ok(card.includes('los canales sin id numérico quedan directos'),
            'y declara el alcance: los canales sin id numérico quedan directos');
        assert.ok(card.includes('JIT desactivado en híbrido (no va por /pulse/)'),
            'y separa el plano JIT: en híbrido está desactivado y no va por /pulse/');
    });
}

main().then(() => {
    console.log('RESULT ' + passed + ' passed, ' + failed + ' failed · ' +
        'scope=panel_dispatch_small_fixtures · physical_playback_verified=false');
    if (failed > 0) process.exitCode = 1;
}).catch(error => {
    console.error('FATAL ' + (error && error.stack ? error.stack : error));
    process.exitCode = 1;
});
