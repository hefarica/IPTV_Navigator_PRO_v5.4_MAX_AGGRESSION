#!/usr/bin/env node
/**
 * test_panel_value_promise.js — ¿CADA OPCION DEL PANEL CUMPLE SU PROMESA?
 *
 * El panel "OPTIMIZACIÓN Y SALIDAS" promete cosas concretas en su propio texto:
 *
 *   HLS          -> lista HLS descargable
 *   DASH (M3U)   -> "enlaza el MPD servido de un canal JIT activo"
 *   HIBRIDA      -> "HLS descargable + DASH servido por JIT"
 *   JIT          -> "Usar rutas /jit/live/ del catalogo JIT"
 *   LIGHT        -> "Proyeccion LIGHT por perfil ... d= desde STREAM-TRUTH"
 *   HDR          -> "Modo HDR de salida"
 *   MODO         -> Strict Terminal >99% 200 / Balanced 95 >95% playback / Diagnostic
 *   Pro Streaming / OTT Navigator / HTTP Headers -> los 3 toggles de optimizacion
 *
 * Esta prueba NO cree ninguna de esas promesas: las mide.
 *   A) Que el panel PASE al generador las opciones que dice aplicar.
 *   B) Que el generador las LEA de verdad (si no las lee, la opcion es muerta).
 *   C) Que HIBRIDA entregue las DOS partes y no solo el aviso.
 *   D) Que las cuatro salidas usen la misma ruta de opciones.
 *   E) Que los toggles de optimizacion lleguen a quien los consume.
 *   F) Que el modo de publicacion se sincronice en las dos direcciones.
 *   G) Que no queden enlaces publicados que devuelvan error.
 *
 * El codigo bajo prueba es el de produccion: se carga el IIFE real del panel con
 * un DOM minimo. No hay copia de la logica ni dobles de las funciones medidas.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FE = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend');
const PANEL = path.join(FE, 'js', 'ape-v9', 'generation-output-panel.js');
const CTRL = path.join(FE, 'js', 'ape-v9', 'generation-controller.js');
const GEN = path.join(FE, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

// ── DOM minimo suficiente para que el panel arranque fuera del navegador ──────
function makeEl(id, props) {
    return Object.assign({
        id, value: '', checked: false, textContent: '', innerHTML: '', disabled: false,
        style: {}, firstChild: null, parentNode: null,
        addEventListener() { }, removeEventListener() { }, appendChild() { },
        insertBefore() { }, remove() { }, querySelector() { return null; },
        querySelectorAll() { return []; }, dispatchEvent() { },
        getAttribute() { return null; }, setAttribute() { },
        classList: { add() { }, remove() { }, toggle() { } }
    }, props || {});
}

/**
 * Arranca el panel de produccion con un DOM limpio y devuelve sus hooks.
 * @param {object} seed valores iniciales por id de control
 */
function bootPanel(seed, done) {
    const els = new Map();
    Object.keys(seed).forEach(id => els.set(id, makeEl(id, seed[id])));
    const win = {};
    const doc = {
        getElementById(id) { if (id === 'ape-gen-output-panel') return null; return els.get(id) || null; },
        querySelector(s) {
            if (String(s).includes('ape-out-format')) return { value: 'm3u8' };
            const k = String(s).replace(/^#/, '');
            if (k.startsWith('input[')) return null;
            return els.get(k) || null;
        },
        querySelectorAll() { return []; },
        createElement(t) { const e = makeEl(t); e.querySelectorAll = () => []; return e; },
        addEventListener() { }, body: { appendChild() { } }, readyState: 'complete'
    };
    win.window = win;
    win.document = doc;
    win.app = { showToast() { } };
    win.__APE_OUTPUT_TEST__ = true;
    win.APE_VPS_BASE = 'https://example.invalid';
    win.localStorage = {
        _d: {},
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
        setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }
    };
    // El panel usa document/window/localStorage globales, y render() corre en un timer:
    // los globales tienen que seguir puestos cuando dispare. Por eso NO se restauran.
    global.window = win; global.document = doc; global.localStorage = win.localStorage;
    try {
        new Function(fs.readFileSync(PANEL, 'utf8'))();
    } catch (e) {
        console.log('  FAIL  el panel no arranca: ' + e.message);
        process.exit(1);
    }
    // render() corre en setTimeout(...,0): hay que dejar que dispare antes de medir
    setTimeout(function () { done(win, els); }, 60);
}

const BASE_SEED = {
    'tab-export': {}, 'ape-out-jit': {}, 'ape-out-hdr': { value: 'auto' },
    'ape-out-hls': { checked: true }, 'ape-out-dash': {}, 'ape-out-hybrid': {},
    'ape-out-light': {}, 'ape-out-matrix-state': {}, 'ape-gen-status': {},
    'ape-gen-mode-select': { value: 'balanced_95' }, 'ape-gen-mode': {},
    'ape-delta-input': { value: '19' }, 'ape-delta-apply': {}, 'ape-buf-sugerencia': {},
    'ape-sel-vps': { checked: true }, 'ape-sel-direct': {}, 'ape-sel-both': {},
    'ape-sel-state': {}, 'genExportFormat': { value: 'm3u8' },
    'publicationMode': { value: 'balanced_95' },
    'proStreamingOptimized': {}, 'ottNavOptimizedGen': {}, 'includeHttpHeaders': { checked: true }
};

bootPanel(BASE_SEED, function (win, els) {
    const H = win.APE_OUTPUT_TEST_HOOKS;
    if (!H) { console.log('  FAIL  el panel no expuso los hooks de prueba'); process.exit(1); }

    const panelSrc = fs.readFileSync(PANEL, 'utf8');
    const ctrlSrc = fs.readFileSync(CTRL, 'utf8');
    const genSrc = fs.readFileSync(GEN, 'utf8');

    console.log('\n═══ A · EL PANEL PASA AL GENERADOR LO QUE PROMETE ═══\n');

    els.get('ape-out-jit').checked = true;
    els.get('ape-out-hdr').value = 'pq';
    let o = H.genOpts(19);
    check('A1 genOpts incluye jit', o.jit === true, JSON.stringify(o));
    check('A2 genOpts incluye hdrMode', o.hdrMode === 'pq', JSON.stringify(o));
    check('A3 genOpts incluye el delta', o.buffer_delta_pct === 19 && o.buffer_delta_array !== undefined,
        'delta=' + o.buffer_delta_pct + ' array=' + typeof o.buffer_delta_array);

    els.get('ape-out-jit').checked = false;
    els.get('ape-out-hdr').value = 'auto';
    o = H.genOpts(19);
    check('A4 jit=false cuando la casilla esta apagada', o.jit === false);
    check('A5 hdrMode=auto cuando el selector esta en Auto', o.hdrMode === 'auto');

    els.get('ape-out-jit').checked = true;
    els.get('ape-out-hdr').value = 'pq';
    check('A6 la etiqueta nombra JIT y HDR', /JIT/.test(H.outOptsLabel()) && /HDR PQ/.test(H.outOptsLabel()), H.outOptsLabel());
    els.get('ape-out-jit').checked = false;
    els.get('ape-out-hdr').value = 'auto';
    check('A7 la etiqueta no inventa nada si no hay opciones', H.outOptsLabel() === '', JSON.stringify(H.outOptsLabel()));
    check('A8 el panel expone syncMode para verificar el modo', typeof H.syncMode === 'function');

    console.log('\n═══ B · EL GENERADOR LEE DE VERDAD ESAS OPCIONES ═══\n');

    // Se quitan los comentarios antes de mirar el codigo: si no, la propia explicacion
    // ("esto era un if < 0.50 fijo") hace fallar la prueba de que ya no lo es.
    const ctrlCode = ctrlSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('B1 el controlador lee options.jit', /window\.APE_USE_JIT\s*=\s*options\.jit\s*===\s*true/.test(ctrlSrc));
    check('B2 el controlador lee options.hdrMode', /window\.APE_HDR_MODE\s*=\s*options\.hdrMode/.test(ctrlSrc));
    check('B3 hdrMode se convierte en hdr_force', /merged\.hdr_force\s*=\s*window\.APE_HDR_MODE/.test(ctrlSrc));
    check('B4 el generador consume APE_USE_JIT', /APE_USE_JIT\s*===\s*true/.test(genSrc));
    check('B5 el modo de publicacion fija el umbral del probe',
        /_probeTriggerByMode/.test(ctrlSrc) && /channelCoverage\.ratio\s*<\s*_probeTrigger/.test(ctrlCode));
    check('B6 el umbral ya NO es un literal fijo', !/channelCoverage\.ratio\s*<\s*0\.\d+\s*\)/.test(ctrlCode),
        (ctrlCode.match(/channelCoverage\.ratio\s*<[^)]*\)/g) || []).join(' | '));

    const m = ctrlSrc.match(/_probeTriggerByMode\s*=\s*\{([^}]*)\}/);
    check('B7 los tres modos tienen umbral', !!m && /strict_terminal/.test(m[1]) && /balanced_95/.test(m[1]) && /diagnostic/.test(m[1]),
        m ? m[1].trim() : 'no encontrado');
    if (m) {
        const strict = Number((m[1].match(/strict_terminal:\s*([\d.]+)/) || [])[1]);
        const balanced = Number((m[1].match(/balanced_95:\s*([\d.]+)/) || [])[1]);
        const diag = Number((m[1].match(/diagnostic:\s*([\d.]+)/) || [])[1]);
        check('B8 strict_terminal es el mas exigente', strict === 0.99, String(strict));
        check('B9 balanced_95 pide 95%', balanced === 0.95, String(balanced));
        check('B10 diagnostic prueba siempre', diag === 1.0, String(diag));
        check('B11 strict > balanced > 0', strict > balanced && balanced > 0);
    }

    console.log('\n═══ C · HIBRIDA ENTREGA LAS DOS PARTES, NO SOLO EL TOAST ═══\n');

    check('C1 existe deliverHybridDash', /async function deliverHybridDash\(\)/.test(panelSrc));
    const hybridCalls = (panelSrc.match(/await deliverHybridDash\(\)/g) || []).length;
    check('C2 la llaman las 4 salidas (VPS/DIRECTO/AMBAS)', hybridCalls >= 3, String(hybridCalls) + ' llamadas');
    check('C3 solo actua con formato hybrid', /selectedFormat\(\)\s*!==\s*'hybrid'/.test(panelSrc));
    check('C4 si el DASH falla lo declara PARCIAL', /HÍBRIDA PARCIAL/.test(panelSrc));
    check('C5 el aviso de HIBRIDA anuncia dos entregables',
        /DOS archivos/.test(panelSrc) && !/Se generará la lista HLS; el manifiesto DASH se sirve desde JIT/.test(panelSrc));

    console.log('\n═══ D · LAS CUATRO SALIDAS USAN LA MISMA RUTA DE OPCIONES ═══\n');

    const genOptsUses = (panelSrc.match(/prepublishAndGenerateDual\(genOpts\(d\)\)/g) || []).length;
    check('D1 VPS y LIGHT usan genOpts(d) directamente', genOptsUses >= 2, String(genOptsUses));
    check('D2 AMBAS usa genOpts(d) + dual', /var bothOpts = genOpts\(d\)/.test(panelSrc));
    check('D3 DIRECTO pasa jit y hdrMode explicitos', /jit:\s*out\.jit,\s*\n?\s*hdrMode:\s*out\.hdrMode/.test(panelSrc));
    check('D4 ya no queda ninguna llamada con solo el delta', !/prepublishAndGenerateDual\(\{\s*buffer_delta_pct/.test(panelSrc));

    console.log('\n═══ E · LOS 3 TOGGLES DE OPTIMIZACION LLEGAN A QUIEN LOS CONSUME ═══\n');

    // Cada tarjeta del panel conmuta un checkbox real, y cada checkbox lo lee otro modulo.
    const consumers = {
        proStreamingOptimized: 0, ottNavOptimizedGen: 0, includeHttpHeaders: 0
    };
    const jsDir = path.join(FE, 'js');
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!/backup|tests|node_modules/.test(e.name)) walk(p); }
            else if (e.name.endsWith('.js')) {
                const src = fs.readFileSync(p, 'utf8');
                if (/generation-output-panel\.js$/.test(p)) continue;   // el que los cablea no cuenta
                for (const k of Object.keys(consumers)) {
                    if (src.includes(k + "')") || src.includes(k + '")')) consumers[k]++;
                }
            }
        }
    })(jsDir);
    for (const k of Object.keys(consumers)) {
        check('E ' + k + ' tiene consumidor fuera del panel', consumers[k] > 0, consumers[k] + ' referencias');
    }
    check('E los 3 toggles se cablean con bindOption', (panelSrc.match(/bindOption\('/g) || []).length >= 3);

    console.log('\n═══ F · EL MODO SE SINCRONIZA EN LAS DOS DIRECCIONES ═══\n');

    // F1 — sentido panel -> global y -> select externo
    const applied = H.syncMode('strict_terminal');
    check('F1 syncMode aplica el valor', applied === 'strict_terminal', String(applied));
    check('F2 escribe window.APE_PUBLICATION_MODE', win.APE_PUBLICATION_MODE === 'strict_terminal', String(win.APE_PUBLICATION_MODE));
    check('F3 refleja el select externo publicationMode', els.get('publicationMode').value === 'strict_terminal', els.get('publicationMode').value);
    check('F4 refleja el select del panel', els.get('ape-gen-mode-select').value === 'strict_terminal', els.get('ape-gen-mode-select').value);
    // F5 — un valor invalido no rompe: cae a balanced_95
    const coerced = H.syncMode('basura');
    check('F5 un modo desconocido cae a balanced_95', coerced === 'balanced_95', String(coerced));

    console.log('\n═══ G · NINGUN ENLACE PUBLICADO QUE DEVUELVA ERROR ═══\n');

    // El panel publicaba dos enlaces fijos a /jit/live/<id>/manifest.mpd que devuelven
    // 503 en produccion (PROVIDER_SLOT_BUSY) salvo que ese id concreto este activo.
    // Un enlace fijo no puede cumplir esa promesa: se sustituyo por un control que
    // resuelve el canal ACTIVO en el momento del clic.
    const htmlBlock = panelSrc.slice(panelSrc.indexOf('JIT:</strong>'), panelSrc.indexOf('JIT:</strong>') + 1400);
    const fixedDashLinks = (htmlBlock.match(/href="[^"]*\/jit\/live\/\d+\/manifest\.mpd"/g) || []).length;
    check('G1 no quedan enlaces DASH fijos a un canal concreto', fixedDashLinks === 0, String(fixedDashLinks));
    check('G2 existe el control que resuelve el canal activo', /id="ape-jit-dash-live"/.test(panelSrc));
    check('G3 el control esta cableado', /getElementById\('ape-jit-dash-live'\)[\s\S]{0,80}addEventListener\('click'/.test(panelSrc));
    check('G4 el error del MPD incluye el motivo del servidor', /await r\.text\(\)\)\.slice\(0, 160\)/.test(panelSrc) || /PROVIDER_SLOT/.test(panelSrc));
    check('G5 el "no hay canal activo" dice el conteo', /no hay canal JIT activo \(0 de /.test(panelSrc));

    console.log('\n═══ H · CONDICION DE BUFFER: mide, avisa y llega al generador ═══\n');

    // El panel promete "Entrada requerida >= salida solicitada × (1 + delta)".
    // Eso solo se puede sostener si hay una medicion real; sin ella el guard NO debe
    // inventar un veredicto, y checkGeneration debe decirlo.
    const g = H.guard();
    check('H1 guard devuelve el contrato completo',
        g && typeof g.has === 'boolean' && typeof g.ok === 'boolean' && typeof g.canStart === 'boolean',
        JSON.stringify(g && { has: g.has, ok: g.ok, canStart: g.canStart }));
    const sug = H.sugerirAjuste();
    check('H2 sugerirAjuste lleva inM/outM/floorM para poder pintarlos',
        sug && 'inM' in sug && 'outM' in sug && 'floorM' in sug,
        JSON.stringify(sug && { inM: sug.inM, outM: sug.outM, floorM: sug.floorM }));
    check('H3 sin medicion el veredicto es has=false, no un si optimista', g.has === false ? sug.bloquea === false : true,
        'has=' + g.has + ' bloquea=' + sug.bloquea);
    check('H4 checkGeneration deja generar aunque no haya medicion',
        (function () { try { return H.checkGeneration() === true; } catch (e) { return false; } })());
    check('H5 el delta vive en una variable que el generador lee',
        /APE_DELTA/.test(genSrc), 'APE_DELTA en el generador: ' + (/APE_DELTA/.test(genSrc) ? 'si' : 'NO'));
    check('H6 el boton Aplicar del panel esta cableado', /ape-delta-apply'\)[\s\S]{0,120}applyDelta\(true\)/.test(panelSrc));
    check('H7 applyDelta es alcanzable desde la superficie de prueba', typeof H.applyDelta === 'function');

    console.log('\n═══ J · LOS ROTULOS NOMBRAN LO QUE DE VERDAD PASA ═══\n');

    // Un rotulo que nombra la funcion equivocada, o que usa "d=" para dos cosas
    // distintas, es una promesa rota aunque el boton funcione.

    // J1 — VPS dice "_CDN.m3u8" y dual:'cdn' produce el sufijo CDN.
    // Se ancla al boton de la tarjeta: el rotulo va justo antes de el.
    const vpsAt = panelSrc.indexOf('data-ape-run="vps"');
    const vpsBlock = vpsAt > 0 ? panelSrc.slice(Math.max(0, vpsAt - 700), vpsAt) : '';
    check('J1 el rotulo de VPS nombra _CDN.m3u8', /_CDN\.m3u8/.test(vpsBlock), vpsBlock.slice(-90) || 'no encontrado');
    check('J2 dual:"cdn" es el modo por defecto del controlador',
        /dualMode\s*=\s*options\.dual === undefined \|\| options\.dual === true \? 'cdn'/.test(ctrlSrc));
    check('J3 el sufijo CDN se aplica al nombre del fichero',
        /_apeOutputName\(stamp[\s\S]{0,120}'CDN'/.test(ctrlSrc));

    // J2 — DIRECTO no puede nombrar una funcion que no se llama
    check('J4 DIRECTO nombra prepublishAndGenerateDirect, no la generica',
        /prepublishAndGenerateDirect/.test(panelSrc) &&
        !/prepublishAndGenerate\(\) · URLs del proveedor/.test(panelSrc));
    check('J5 prepublishAndGenerateDirect es prepublishAndGenerateDual con dual:false',
        /function prepublishAndGenerateDirect[\s\S]{0,200}dual:\s*false/.test(ctrlSrc));

    // J3 — el rotulo de LIGHT desambigua los dos "d="
    check('J6 LIGHT distingue el d= de la URL del delta de buffer',
        /URL d= desde STREAM-TRUTH/.test(panelSrc) && /delta de buffer desde el panel/.test(panelSrc));
    check('J7 el envoltorio SI reescribe el d= desde STREAM-TRUTH',
        (function () {
            const wrap = path.join(ROOT, 'tools', 'pulse', 'ape-pulse-wrap.js');
            if (!fs.existsSync(wrap)) return false;
            const w = fs.readFileSync(wrap, 'utf8');
            return /EXT-X-APE-STREAM-TRUTH/.test(w) && /replace\(\/\(\[\?&\]\)d=\[\^&\]\*/.test(w);
        })(), 'tools/pulse/ape-pulse-wrap.js');
    check('J8 el delta de buffer NO viene de STREAM-TRUTH',
        /function normalizeDeltaArray/.test(panelSrc) && /APE_OUTPUT_DELTA_ARRAY/.test(panelSrc));
    check('J9 el rotulo ya no promete un numero fijo de lineas sin medida',
        !/1\.040 lineas por canal desde 9 plantillas/.test(panelSrc));

    console.log('\n═══ I · SINTAXIS DE LO TOCADO ═══\n');
    for (const [label, src] of [['generation-output-panel.js', panelSrc], ['generation-controller.js', ctrlSrc]]) {
        let ok = true, err = '';
        try { new Function(src); } catch (e) { ok = false; err = e.message; }
        check('I ' + label + ' parsea', ok, err);
    }

    console.log('\n─────────────────────────────────────────────');
    console.log('  PASS ' + pass + ' · FAIL ' + fail);
    if (fail) { failures.forEach(f => console.log('   · ' + f)); process.exit(1); }
    console.log('  Cada opcion del panel tiene una ruta medida hasta el generador.');
    // El panel instala un setInterval de 2 s para repintar el guardarrail; sin este
    // exit explicito el proceso quedaria vivo para siempre aunque todo pase.
    process.exit(0);
});
