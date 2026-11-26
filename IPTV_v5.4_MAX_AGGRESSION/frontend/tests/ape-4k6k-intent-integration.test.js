/**
 * tests/ape-4k6k-intent-integration.test.js
 * ---------------------------------------------------------------------------
 * La casilla «INTENCIÓN 4K/6K EN LA LISTA» ahora vive DENTRO del panel
 * ⚙️ OPTIMIZACIÓN Y SALIDAS y, sobre todo, EMITE: antes escribía
 * window.APE_4K6K_AUDIT y nadie lo leía al generar la lista (0 líneas
 * añadidas). Esta suite comprueba las tres cosas que hacen falta para poder
 * decir que se hizo bien:
 *
 *   A · el módulo de emisión (unitario, sin navegador)
 *   B · que el panel y el HTML están cableados en el sitio correcto (lectura)
 *   C · la lista REAL, dos veces, con el flag apagado y encendido (extremo a
 *       extremo con el arnés headless)
 *
 * Reglas que la suite defiende:
 *   · flag APAGADO ⇒ el bloque vuelve por IDENTIDAD: la lista es idéntica.
 *   · flag ENCENDIDO ⇒ por canal: su etiqueta #EXT-X-APE-4K6K-INTENT, UN
 *     #EXTVLCOPT:network-caching, UN #EXTVLCOPT:video-filter con la cadena
 *     enterprise (zscale…minterpolate) y UN #EXT-X-APE-AI-SR-ENABLED.
 *   · sin esas tres clases de línea, la lista encendida es byte a byte igual a
 *     la apagada: el interruptor no cambia nada más (se comprueba, no se supone).
 *   · el tag NUNCA rompe la adyacencia #EXT-X-STREAM-INF → URI (RFC 8216
 *     §4.3.4.2), que ya costó 22 721 canales una vez.
 *   · 0 o 2 URI en el bloque ⇒ no se toca: no se adivina.
 *   · sin adaptador no se inventa payload: 0 dependencias, sin DOM, sin red.
 *
 * El indicador --4k6k del arnés NO es código de producto: sólo existe en
 * _vps_stage/tests/regen_headless/regen_headless.js para encender el flag
 * dentro del sandbox de medición. Si el arnés no está, la parte C se declara
 * OMITIDA y nunca se cuenta como verde.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

let PASS = 0, FAIL = 0, SKIP = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'esperado ' + JSON.stringify(want) + ', obtenido ' + JSON.stringify(got)); }

// frontend/tests → frontend → IPTV_v5.4_MAX_AGGRESSION → raíz del repo
const FRONT = path.resolve(__dirname, '..');
const REPO = path.resolve(FRONT, '..', '..');
const EMIT_SRC = path.join(FRONT, 'js', 'ape-v9', 'ape-4k6k-intent-emit.js');
const ADAPTER_SRC = path.join(FRONT, 'js', 'ape-v9', 'ape-4k6k-audit-adapter.js');
const PANEL_SRC = path.join(FRONT, 'js', 'ape-v9', 'generation-output-panel.js');
const GEN_SRC = path.join(FRONT, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const INDEX = path.join(FRONT, 'index-v4.html');
const HARNESS = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'regen_headless.js');
const FIXTURE = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'fixtures', 'mini_15.m3u8');

const TAG = '#EXT-X-APE-4K6K-INTENT:';
const read = (p) => fs.readFileSync(p, 'utf8');
const count = (h, n) => h.split(n).length - 1;

// ── Sandbox mínimo: sin DOM, sin red, sin reloj ────────────────────────────
function makeCtx(withAdapter) {
    const sandbox = { console: console, JSON: JSON, Math: Math };
    sandbox.window = sandbox;          /* el módulo busca window primero */
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    if (withAdapter) vm.runInContext(read(ADAPTER_SRC), sandbox, { filename: 'ape-4k6k-audit-adapter.js' });
    vm.runInContext(read(EMIT_SRC), sandbox, { filename: 'ape-4k6k-intent-emit.js' });
    return sandbox;
}

/* Un bloque de canal como el que entrega el generador: variables, EXTINF, opciones,
   etiquetas APE y la URI final. */
function canal(opts) {
    opts = opts || {};
    const L = [
        '#EXTINF:-1 tvg-id="c1" tvg-name="Canal Uno" group-title="Pruebas",Canal Uno',
        '#EXTVLCOPT:network-caching=1500',
        '#EXT-X-APE-STREAM-TRUTH:src=fake-4k,w=3840,h=2160',
        '#EXT-X-APE-PROFILE:P3'
    ];
    if (opts.stream) L.push('#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=3840x2160');
    if (opts.uris === 2) L.push('https://a.invalid/uno.m3u8');
    if (opts.uris !== 0) L.push('https://b.invalid/dos.m3u8');
    return L.join(opts.crlf ? '\r\n' : '\n');
}

console.log('\n=== A · módulo de emisión (unitario) ===');
if (!fs.existsSync(EMIT_SRC) || !fs.existsSync(ADAPTER_SRC)) {
    SKIP++;
    console.log('  OMITIDA  falta ape-4k6k-intent-emit.js o el adaptador; no se afirma nada');
} else {
    const ctx = makeCtx(true);
    const E = ctx.APE_4K6K_INTENT_EMIT;

    eq('A1.1 el módulo se registra con versión y TAG', E && E.version + '|' + E.TAG, '1.2.0|' + TAG);
    const sinComentarios = read(EMIT_SRC).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok('A1.2 no usa DOM, red, Date.now ni Math.random (mirando el código, no los comentarios)',
        !/\bdocument\b|fetch\(|XMLHttpRequest|Date\.now|Math\.random/.test(sinComentarios));

    // A2 · apagado = identidad
    ctx.APE_4K6K_AUDIT = false;
    const b = canal();
    ok('A2.1 con el flag apagado devuelve el MISMO string (identidad)', E.apply(b, {}, 'P3') === b);
    ok('A2.2 el flag apagado por opción gana al global encendido', E.apply(b, {}, 'P3', false) === b);

    // A3 · encendido = etiqueta + las garantías que el bloque no tenía
    /* [2026-11-23 · RUTA ÚNICA] Desde la 1.1.0 el interruptor no sólo añade la
       etiqueta: aplica las tres garantías. Este bloque de prueba NO trae
       video-filter ni AI-SR, así que el módulo tiene que añadir las dos, más la
       etiqueta: 3 líneas. Lo que se afirma ya no es "+1 línea" sino el contrato
       nuevo, y se comprueba línea por línea para que no se pueda colar de más. */
    ctx.APE_4K6K_AUDIT = true;
    const on = E.apply(b, {}, 'P3');
    const lOn = on.split('\n'), lOf = b.split('\n');
    const esGarantia = (x) => x.indexOf(TAG) === 0 || x.indexOf('#EXTVLCOPT:video-filter=') === 0 || x.indexOf('#EXT-X-APE-AI-SR-ENABLED:') === 0;
    eq('A3.1 añade la etiqueta y las dos garantías que faltaban (3 líneas)', lOn.length - lOf.length, 3);
    eq('A3.1b añade exactamente un video-filter', lOn.filter((x) => x.indexOf('#EXTVLCOPT:video-filter=') === 0).length, 1);
    eq('A3.1c añade exactamente un AI-SR', lOn.filter((x) => x.indexOf('#EXT-X-APE-AI-SR-ENABLED:') === 0).length, 1);
    eq('A3.1d añade exactamente un network-caching (el bloque ya traía uno: no se duplica)',
        lOn.filter((x) => x.indexOf('#EXTVLCOPT:network-caching=') === 0).length, 1);
    ok('A3.2 la etiqueta va justo antes de la URI', /^https?:\/\//.test(lOn[lOn.indexOf(lOn.filter(x => x.indexOf(TAG) === 0)[0]) + 1] || ''));
    ok('A3.3 quitando las tres líneas de garantía el bloque queda igual que estaba',
        lOn.filter((x) => !esGarantia(x)).join('\n') === b);

    // A4 · STREAM-INF → URI sigue pegado
    const bs = canal({ stream: true });
    const ons = E.apply(bs, {}, 'P3');
    const ls = ons.split('\n');
    const iTag = ls.findIndex(x => x.indexOf(TAG) === 0);
    const iSi = ls.findIndex(x => x.indexOf('#EXT-X-STREAM-INF:') === 0);
    ok('A4.1 con STREAM-INF el tag entra ANTES del STREAM-INF', iTag >= 0 && iTag === iSi - 1, 'tag=' + iTag + ' stream=' + iSi);
    ok('A4.2 el par STREAM-INF → URI queda adyacente', /^https?:\/\//.test(ls[iSi + 1] || ''));

    // A5 · CRLF conservado
    const bc = canal({ crlf: true });
    const onc = E.apply(bc, {}, 'P3');
    eq('A5.1 el bloque CRLF añade sus 3 líneas y sigue en CRLF puro', onc.split('\r\n').length - bc.split('\r\n').length, 3);
    eq('A5.2 sin LF sueltos', onc.split('\n').length - 1 - (onc.split('\r\n').length - 1), 0);

    // A6 · no adivinar
    ok('A6.1 sin URI no se toca', E.place(canal({ uris: 0 }), TAG + '{"a":1}').block === canal({ uris: 0 }));
    ok('A6.2 con dos URI no se toca', E.place(canal({ uris: 2 }), TAG + '{"a":1}').block === canal({ uris: 2 }));
    eq('A6.3 el motivo se declara', E.place(canal({ uris: 2 }), TAG + '{"a":1}').where, 'ambigua: 2 URI');

    // A7 · idempotente
    eq('A7.1 aplicarlo dos veces no duplica', count(E.apply(on, {}, 'P3'), TAG), 1);

    // A8 · sin adaptador no se inventa nada
    const ctx2 = makeCtx(false);
    ctx2.APE_4K6K_AUDIT = true;
    eq('A8.1 sin adaptador no hay etiqueta', count(ctx2.APE_4K6K_INTENT_EMIT.apply(b, {}, 'P3'), TAG), 0);

    // A9 · el payload cumple el esquema del adaptador
    const lineaTag = on.split('\n').filter((l) => l.indexOf(TAG) === 0)[0] || '';
    const payload = lineaTag.slice(TAG.length);
    let p = null;
    try { p = JSON.parse(payload); } catch (_e) { p = null; }
    ok('A9.1 el payload parsea', !!p);
    if (p) {
        eq('A9.2 schema declarado', p.schema, 'ape-4k-premium6k-intent/1');
        eq('A9.3 estado requested_only (no se declara hecho)', p.status, 'requested_only');
        eq('A9.4 ejecución not_verified (estático no prueba ejecución)', p.execution, 'not_verified');
        eq('A9.5 el perfil emitido viaja en el payload como su versión premium .5',
            p.outputPolicy && p.outputPolicy.profile, 'P3.5');
        eq('A9.6 outputPolicy mantiene sus 13 claves', p.outputPolicy ? Object.keys(p.outputPolicy).length : -1, 13);
        ok('A9.7 declara resolución objetivo 4K/6K y no nativa',
            /^\d+x\d+$/.test(String(p.targetResolution)) && p.outputPolicy.nativeResolutionClaim === false);
    }

    // ── A10 · enforce() por dentro: las tres garantías, caso por caso ────────
    /* enforce() es puro (no mira el flag, no toca DOM): se puede afirmar su
       comportamiento sin generar ninguna lista. Cada caso es un bloque mínimo con
       una sola variable cambiada, para que un fallo diga cuál de las tres reglas
       se rompió. */
    const FIL = '#EXTVLCOPT:video-filter=';
    const AISR = '#EXT-X-APE-AI-SR-ENABLED:';
    const CACH = '#EXTVLCOPT:network-caching=';
    const blk = (arr) => arr.join('\n');
    const cuenta = (txt, pre) => txt.split('\n').filter((x) => x.indexOf(pre) === 0).length;

    // (0 filtros) añade UNA cadena enterprise, y es la misma que trae la muestra 4K
    const e0 = E.enforce(blk(['#EXTINF:-1,Canal', '#EXTVLCOPT:network-caching=15000', 'https://b.invalid/x.m3u8']));
    eq('A10.1 sin filtros añade exactamente uno', cuenta(e0.block, FIL), 1);
    ok('A10.2 el filtro añadido es la cadena enterprise medida (zscale+hqdn3d+unsharp+gradfun+minterpolate)',
        e0.block.indexOf(E.ENTERPRISE_FILTER) >= 0 &&
        /zscale=/.test(E.ENTERPRISE_FILTER) && /hqdn3d=/.test(E.ENTERPRISE_FILTER) &&
        /unsharp=/.test(E.ENTERPRISE_FILTER) && /gradfun=/.test(E.ENTERPRISE_FILTER) && /minterpolate=/.test(E.ENTERPRISE_FILTER));

    // (1 filtro pobre) se REEMPLAZA por el enterprise: no se acumulan filtros
    const pobre = blk(['#EXTINF:-1,Canal', FIL + 'format=yuv420p10le,gradfun=radius=10:strength=0.51', 'https://b.invalid/x.m3u8']);
    const e1 = E.enforce(pobre);
    eq('A10.3 con un filtro pobre queda exactamente uno', cuenta(e1.block, FIL), 1);
    ok('A10.4 y es el enterprise, no el pobre', e1.block.indexOf(FIL + 'format=yuv420p10le') < 0 && e1.block.indexOf(E.ENTERPRISE_FILTER) >= 0);

    // (1 filtro ya enterprise) no se toca: el bloque ya cumple las tres
    const rico = blk(['#EXTINF:-1,Canal', CACH + '15000', E.ENTERPRISE_FILTER, AISR + 'ADAPTIVE', 'https://b.invalid/x.m3u8']);
    eq('A10.5 con las tres garantías ya puestas no cambia nada', E.enforce(rico).block, rico);
    eq('A10.6 y no declara ningún cambio', E.enforce(rico).changes.length, 0);

    // (2 filtros) ambiguo: los dos filtros se dejan como están y se declara
    const dos = blk(['#EXTINF:-1,Canal', FIL + 'scale=1920:1080', FIL + 'hflip', 'https://b.invalid/x.m3u8']);
    const filtrosDe = (txt) => txt.split('\n').filter((l) => l.indexOf(FIL) === 0);
    eq('A10.7 con dos filtros NO se tocan los filtros (ambiguo)',
        filtrosDe(E.enforce(dos).block).join('|'), filtrosDe(dos).join('|'));
    ok('A10.8 y el motivo se declara', E.enforce(dos).changes.some((c) => /ambiguo/.test(c)));

    // caché: se añade si no hay; no se duplica si ya hay
    const sinCache = blk(['#EXTINF:-1,Canal', 'https://b.invalid/x.m3u8']);
    eq('A10.9 sin network-caching añade uno', cuenta(E.enforce(sinCache).block, CACH), 1);
    eq('A10.10 con network-caching no lo duplica',
        cuenta(E.enforce(blk(['#EXTINF:-1,Canal', CACH + '60000', 'https://b.invalid/x.m3u8'])).block, CACH), 1);

    // AI-SR: se añade si no hay; no se duplica si ya hay
    eq('A10.11 sin AI-SR lo añade una vez', cuenta(E.enforce(sinCache).block, AISR), 1);
    eq('A10.12 con AI-SR no lo duplica',
        cuenta(E.enforce(blk(['#EXTINF:-1,Canal', AISR + 'ADAPTIVE', 'https://b.invalid/x.m3u8'])).block, AISR), 1);

    // adyacencia: con STREAM-INF, nada se cuela entre el par y la URI
    const conSi = blk(['#EXTINF:-1,Canal', '#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1280x720', 'https://b.invalid/x.m3u8']);
    const eSi = E.enforce(conSi).block.split('\n');
    const iSi2 = eSi.findIndex((x) => x.indexOf('#EXT-X-STREAM-INF:') === 0);
    ok('A10.13 la adyacencia STREAM-INF → URI se conserva al reforzar', /^https?:\/\//.test(eSi[iSi2 + 1] || ''));

    // bordes: no-string, vacío, CRLF
    eq('A10.14 un bloque vacío se devuelve igual', E.enforce('').block, '');
    eq('A10.15 un bloque que no es cadena se devuelve igual', E.enforce(null).block, null);
    const cLf = E.enforce(blk(['#EXTINF:-1,Canal', 'https://b.invalid/x.m3u8'])).block;
    const cCrl = E.enforce(blk(['#EXTINF:-1,Canal', 'https://b.invalid/x.m3u8']).replace(/\n/g, '\r\n')).block;
    eq('A10.16 en LF no aparecen CR', (cLf.match(/\r/g) || []).length, 0);
    eq('A10.17 en CRLF no quedan LF sueltos', (cCrl.split('\n').length - 1) - (cCrl.split('\r\n').length - 1), 0);

    // dos veces = igual (idempotente)
    eq('A10.18 aplicarlo dos veces da el mismo texto', E.enforce(E.enforce(sinCache).block).block, E.enforce(sinCache).block);
}

console.log('\n=== B · panel, HTML y generador (lectura) ===');
if (!fs.existsSync(PANEL_SRC) || !fs.existsSync(INDEX) || !fs.existsSync(GEN_SRC)) {
    SKIP++;
    console.log('  OMITIDA  falta el panel, el HTML o el generador; no se afirma nada');
} else {
    const panel = read(PANEL_SRC), index = read(INDEX), gen = read(GEN_SRC);

    eq('B1.1 el panel pinta la casilla (un solo id de input)', count(panel, 'id="ape4k6kIntentToggle"'), 1);
    eq('B1.2 el panel pinta su etiqueta una sola vez', count(panel, 'id="ape4k6kIntentLabel"'), 1);
    ok('B1.3 el panel pasa la opción a la generación', /o\.intent4k6k\s*=\s*intentOn\(\)/.test(panel));
    ok('B1.4 la preferencia se guarda y se restaura', /ape_4k6k_intent_enabled/.test(panel) && /localStorage\.getItem\(INTENT_KEY\)/.test(panel));
    const iPaint = panel.indexOf('paintOutputs();');
    const iWire = panel.indexOf("addEventListener('change'", iPaint);
    ok('B1.5 el cableado va DESPUÉS de pintar (si no, getElementById daría null)',
        iPaint > 0 && iWire > iPaint, 'paint=' + iPaint + ' wire=' + iWire);

    ok('B2.1 el HTML ya no tiene la casilla suelta (0 ids duplicados)', count(index, 'ape4k6kIntentToggle') === 0 && count(index, 'ape4k6kIntentLabel') === 0);
    ok('B2.2 el HTML sí restaura el flag al cargar', /APE_4K6K_AUDIT\s*=\s*v\b/.test(index));
    const iEmitTag = index.indexOf('<script src="js/ape-v9/ape-4k6k-intent-emit.js');
    const iGenTag = index.indexOf('<script src="js/ape-v9/m3u8-typed-arrays-ultimate.js');
    ok('B2.3 el módulo se carga ANTES del generador', iEmitTag > 0 && iGenTag > iEmitTag, 'emit=' + iEmitTag + ' gen=' + iGenTag);

    eq('B3.1 el generador llama al módulo en UN solo sitio', count(gen, 'APE_4K6K_INTENT_EMIT.apply('), 1);
    ok('B3.2 la llamada va guardada por typeof window', /typeof window !== 'undefined' && window\.APE_4K6K_INTENT_EMIT/.test(gen));
    ok('B3.3 el flag se puede pedir por opción de esta generación', /options\.intent4k6k === true/.test(gen));
}

console.log('\n=== C · lista real: flag apagado vs encendido ===');
if (!fs.existsSync(HARNESS) || !fs.existsSync(FIXTURE)) {
    SKIP++;
    console.log('  OMITIDA  no están el arnés o la fixture en este árbol; no se afirma nada');
} else {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ape4k6k-'));
    const dirOff = path.join(base, 'off');
    const dirOn = path.join(base, 'on');
    function run(on4k6k) {
        const args = [HARNESS, FIXTURE, '--mode', 'default', '--deterministic', '--profiles'];
        if (on4k6k) args.push('--4k6k', 'on');
        args.push('--out', on4k6k ? dirOn : dirOff);
        const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
        return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
    }
    function listIn(dir) {
        if (!fs.existsSync(dir)) return null;
        const f = fs.readdirSync(dir).filter((x) => /\.m3u8$/i.test(x));
        if (f.length !== 1) return null;
        return fs.readFileSync(path.join(dir, f[0]), 'utf8');
    }
    try {
        const rOff = run(false), offText = listIn(dirOff);
        const rOn = run(true), onText = listIn(dirOn);

        eq('C1.1 la corrida apagada termina bien', rOff.code, 0);
        eq('C1.2 la corrida encendida termina bien', rOn.code, 0);
        ok('C1.3 las dos listas existen y son grandes', !!offText && !!onText && offText.length > 1000 && onText.length > 1000);
        ok('C1.4 el arnés dice que cargó el módulo sólo al encender',
            /\[4k6k\] flag=on · modulo=1\.2\.0/.test(rOn.out) && !/\[4k6k\]/.test(rOff.out));
        ok('C1.5 la corrida encendida sigue siendo determinista', /determinismo\s*:\s*SHA IDÉNTICO/.test(rOn.out));

        const lOff = offText.split('\n'), lOnTxt = onText.split('\n');
        const tagsOff = lOff.filter((l) => l.indexOf(TAG) === 0);
        const tagsOn = lOnTxt.filter((l) => l.indexOf(TAG) === 0);
        const nExtinf = lOff.filter((l) => l.indexOf('#EXTINF:') === 0).length;

        eq('C2.1 apagado: ni una etiqueta', tagsOff.length, 0);
        eq('C3.1 encendido: una etiqueta por canal', tagsOn.length, nExtinf);
        /* [2026-11-23 · RUTA ÚNICA] Con la casilla encendida la lista ya no sólo
           crece: el canal cuyo filtro era la cadena corta pasa a la enterprise (se
           REEMPLAZA, no se suma) y recibe su declaración AI-SR. Por eso "crece
           exactamente N líneas" deja de describir la verdad y se sustituye por lo
           que de verdad importa, contado canal a canal. */
        const bloques = (arr) => {
            /* Un bloque = una línea #EXTINF y lo que le sigue. Lo que va ANTES del
               primer #EXTINF es el encabezado del maestro y no es un canal: se
               ignora a propósito (si no, saldría un "canal" 16 de 15). */
            const out = [];
            let cur = null;
            for (const l of arr) {
                if (l.indexOf('#EXTINF:') === 0) { if (cur) out.push(cur); cur = [l]; }
                else if (cur) cur.push(l);
            }
            if (cur) out.push(cur);
            return out;
        };
        const canalesOn = bloques(lOnTxt), canalesOff = bloques(lOff);
        const conLinea = (c, pre) => c.filter((l) => l.indexOf(pre) === 0).length;
        eq('C3.2 cada canal del OFF trae su network-caching (la ruta ya existía)',
            canalesOff.filter((c) => conLinea(c, '#EXTVLCOPT:network-caching=') >= 1).length, canalesOff.length);
        eq('C3.3 cada canal del ON trae su network-caching (ruta única, sin saltos)',
            canalesOn.filter((c) => conLinea(c, '#EXTVLCOPT:network-caching=') === 1).length, canalesOn.length);
        eq('C3.4 cada canal del ON trae EXACTAMENTE un video-filter',
            canalesOn.filter((c) => conLinea(c, '#EXTVLCOPT:video-filter=') === 1).length, canalesOn.length);
        eq('C3.5 y ese filtro es el enterprise de la muestra 4K (lleva zscale=)',
            canalesOn.filter((c) => c.some((l) => l.indexOf('#EXTVLCOPT:video-filter=') === 0 && l.indexOf('zscale=') > 0)).length, canalesOn.length);
        eq('C3.6 cada canal del ON trae EXACTAMENTE un AI-SR',
            canalesOn.filter((c) => conLinea(c, '#EXT-X-APE-AI-SR-ENABLED:') === 1).length, canalesOn.length);
        eq('C3.7 ningún canal duplica el caching', canalesOn.filter((c) => conLinea(c, '#EXTVLCOPT:network-caching=') > 1).length, 0);

        /* Ahora las dos listas deben coincidir salvo, exactamente, en las líneas
           que el interruptor aporta: su etiqueta, la cadena de filtros y la
           declaración AI-SR. Si se colara cualquier otra diferencia, este
           cotejo byte a byte la delata. */
        const esGarantiaLinea = (l) => l.indexOf(TAG) === 0 ||
            l.indexOf('#EXTVLCOPT:video-filter=') === 0 || l.indexOf('#EXT-X-APE-AI-SR-ENABLED:') === 0;
        const limpia = (arr) => arr.filter((l) => !esGarantiaLinea(l));
        const a = limpia(lOff), c = limpia(lOnTxt);
        let primerDiff = -1;
        if (a.length === c.length) {
            for (let i = 0; i < a.length; i++) { if (a[i] !== c[i]) { primerDiff = i; break; } }
        }
        ok('C4.1 sin las líneas de garantía las dos listas tienen las mismas líneas', a.length === c.length, a.length + ' vs ' + c.length);
        ok('C4.2 y son idénticas byte a byte (la casilla no cambia nada más)', primerDiff === -1,
            primerDiff === -1 ? '' : 'L' + (primerDiff + 1) + ': ' + JSON.stringify((a[primerDiff] || '').slice(0, 80)) + ' vs ' + JSON.stringify((c[primerDiff] || '').slice(0, 80)));

        ok('C5.1 todas declaran requested_only y not_verified',
            tagsOn.every((t) => /"status":"requested_only"/.test(t) && /"execution":"not_verified"/.test(t)));
        ok('C5.2 todas llevan el perfil emitido y una resolución objetivo',
            tagsOn.every((t) => /"profile":"P\d/.test(t) && /"targetResolution":"\d+x\d+"/.test(t)));

        let bien = 0;
        for (let i = 0; i < lOnTxt.length; i++) {
            if (lOnTxt[i].indexOf(TAG) !== 0) continue;
            const nx = lOnTxt[i + 1] || '';
            if (/^\s*https?:\/\//i.test(nx) || /^\s*#EXT-X-STREAM-INF:/i.test(nx)) bien++;
        }
        eq('C6.1 la etiqueta nunca queda suelta', bien, tagsOn.length);

        const si = (arr) => {
            let n = 0, good = 0;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].indexOf('#EXT-X-STREAM-INF:') !== 0) continue;
                n++;
                if (/^\s*https?:\/\//i.test(arr[i + 1] || '')) good++;
            }
            return n + '/' + good;
        };
        eq('C6.2 la adyacencia STREAM-INF → URI no cambia', si(lOnTxt), si(lOff));

        /* [2026-11-23 · PREMIUM .5] Regla del operador: a cada perfil le toca su
           versión premium (.5) y la INTENCIÓN se declara con ESA versión, por canal.
           No basta con "tiene perfil": se exige que sea una .5 y de las seis que
           existen en el contrato de 12 (nada inventado). */
        const perfilDe = (t) => {
            const m = /"profile":"([^"]*)"/.exec(t);
            return m ? m[1] : '';
        };
        const declarados = tagsOn.map(perfilDe);
        eq('C7.1 cada canal declara su perfil premium .5 (no la base)', declarados.filter((p) => /\.5$/.test(p)).length, tagsOn.length);
        eq('C7.2 y todos son una de las seis .5 del contrato de 12 perfiles',
            declarados.filter((p) => ['P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'].indexOf(p) >= 0).length, tagsOn.length);
        eq('C7.3 y cada uno tiene base de P0 a P5 (ningún perfil inventado)', declarados.filter((p) => /^P[0-5]\.5$/.test(p)).length, tagsOn.length);
        console.log('  perfiles declarados (ON): ' + JSON.stringify(declarados.reduce((m, p) => { m[p] = (m[p] || 0) + 1; return m; }, {})));

        console.log('\n  medido: OFF ' + Buffer.byteLength(offText) + ' B / ' + lOff.length + ' líneas · ON ' +
            Buffer.byteLength(onText) + ' B / ' + lOnTxt.length + ' líneas · etiquetas ' + tagsOn.length + '/' + nExtinf + ' canales');
    } finally {
        try { fs.rmSync(base, { recursive: true, force: true }); } catch (_e) { /* limpieza best-effort */ }
    }
}

console.log('\n=== D · fixture 4K: la lista que el merge recompone ===');
/* La lista 4K/6K es AUTODESCRIPTIVA (trae su capa APE) y el arnés la recompone en modo
   passthrough: sólo conserva del emisor su capa de DECLARACIÓN. Medido antes del arreglo:
   el emisor ponía la etiqueta en 6/6 bloques y el fichero salía con 0. Sin esta sección
   la suite no habría notado nada. */
const FIX4K = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'fixtures', 'mini_inherit_6_4K.m3u8');
if (!fs.existsSync(HARNESS) || !fs.existsSync(FIX4K)) {
    SKIP++;
    console.log('  OMITIDA  no están el arnés o la fixture 4K; no se afirma nada');
} else {
    const listaEn = (dir) => {
        if (!fs.existsSync(dir)) return null;
        const f = fs.readdirSync(dir).filter((x) => /\.m3u8$/i.test(x));
        if (f.length !== 1) return null;
        return fs.readFileSync(path.join(dir, f[0]), 'utf8');
    };
    const base2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ape4k6k-k4-'));
    const dOff = path.join(base2, 'off');
    const dOn = path.join(base2, 'on');
    const runK4 = (on4k6k) => {
        const args = [HARNESS, FIX4K, '--mode', 'default', '--deterministic', '--profiles'];
        if (on4k6k) args.push('--4k6k', 'on');
        args.push('--out', on4k6k ? dOn : dOff);
        return spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
    };
    try {
        const r1 = runK4(false), tOff = listaEn(dOff);
        const r2 = runK4(true), tOn = listaEn(dOn);
        eq('D1.1 la corrida 4K apagada termina bien', r1.status, 0);
        eq('D1.2 la corrida 4K encendida termina bien', r2.status, 0);
        ok('D1.3 las dos listas 4K existen', !!tOff && !!tOn);
        const n4 = (tOff || '').split('\n').filter((l) => l.indexOf('#EXTINF:') === 0).length;
        const g4 = (tOn || '').split('\n').filter((l) => l.indexOf(TAG) === 0);
        eq('D2.1 apagado: 0 etiquetas en la lista 4K', (tOff || '').split('\n').filter((l) => l.indexOf(TAG) === 0).length, 0);
        eq('D2.2 encendido: la etiqueta SOBREVIVE al merge (1 por canal)', g4.length, n4);
        const a4 = (tOff || '').split('\n'), b4 = (tOn || '').split('\n').filter((l) => l.indexOf(TAG) !== 0);
        ok('D2.3 sin la etiqueta las dos listas 4K son idénticas', a4.length === b4.length && a4.every((x, i) => x === b4[i]));
        ok('D2.4 todas las etiquetas 4K llevan el perfil y el objetivo',
            g4.length > 0 && g4.every((t) => /"profile":"P\d/.test(t) && /"targetResolution":"\d+x\d+"/.test(t)));
        ok('D2.5 el merge declara la etiqueta como capa de declaración (si no, la tira)',
            /APE-PERCEPTUAL-4K\|APE-4K6K-INTENT/.test(read(HARNESS)));

        /* [2026-11-23 · RUTA ÚNICA] La muestra 4K ya traía la cadena enterprise, así
           que el refuerzo no debe tocarla: se comprueba que ON y OFF tienen la MISMA
           línea de filtros (si el refuerzo la reescribiera, aquí se vería). Lo que
           sí faltaba era la declaración AI-SR: el merge la tiraba porque no estaba
           en su lista de declaraciones (0 de 6). Ahora tiene que estar en las dos. */
        const filtro4 = (t) => (t || '').split('\n').filter((l) => l.indexOf('#EXTVLCOPT:video-filter=') === 0);
        const fOn = filtro4(tOn), fOff = filtro4(tOff);
        eq('D2.6 la muestra 4K trae un filtro por canal (no hay que añadirlo)', fOff.length, n4);
        ok('D2.7 y el del ON es el MISMO que el del OFF (el refuerzo no reescribe lo que ya era enterprise)',
            fOn.length === fOff.length && fOn.every((x, i) => x === fOff[i]));
        ok('D2.8 ese filtro es la cadena enterprise (zscale + hqdn3d + gradfun + minterpolate)',
            fOff.length > 0 && fOff[0].indexOf('zscale=') > 0 && fOff[0].indexOf('hqdn3d=') > 0 &&
            fOff[0].indexOf('gradfun=') > 0 && fOff[0].indexOf('minterpolate=') > 0);
        const aisr4 = (t) => (t || '').split('\n').filter((l) => l.indexOf('#EXT-X-APE-AI-SR-ENABLED:') === 0).length;
        eq('D2.9 AI-SR por canal: uno en cada lista (la declaración ya no se pierde en el merge)',
            aisr4(tOff) + '/' + aisr4(tOn), n4 + '/' + n4);
        const perfil4 = (t) => {
            const m = /"profile":"([^"]*)"/.exec(t);
            return m ? m[1] : '';
        };
        eq('D2.10 cada uno de los 6 canales declara su perfil premium .5',
            g4.map(perfil4).filter((p) => /^P[0-5]\.5$/.test(p)).length, g4.length);
        console.log('  medido 4K: OFF ' + Buffer.byteLength(tOff || '') + ' B / ' + a4.length + ' líneas · ON ' +
            Buffer.byteLength(tOn || '') + ' B / ' + (tOn || '').split('\n').length + ' líneas · etiquetas ' + g4.length + '/' + n4);
    } finally {
        try { fs.rmSync(base2, { recursive: true, force: true }); } catch (_e) { /* limpieza */ }
    }
}

console.log('\n=== E · el multiparser se pide desde el panel del generador ===');
/* [2026-11-23 · PANEL] El bloque #apeMultiParserPanel (traducción por player) se
   trae al panel que genera las listas. Se comprueba la ÚNICA forma que no duplica
   nada: MOVER el nodo (no clonarlo), con guarda de idempotencia. */
if (!fs.existsSync(PANEL_SRC) || !fs.existsSync(INDEX)) {
    SKIP++;
    console.log('  OMITIDA  falta el panel o el HTML; no se afirma nada');
} else {
    const panel2 = read(PANEL_SRC), index2 = read(INDEX);
    const iMp = panel2.indexOf("getElementById('apeMultiParserPanel')");
    const iInner = panel2.indexOf('panel.innerHTML =');
    const iInsert = panel2.indexOf('tab.insertBefore(panel');
    eq('E1.1 el panel conoce el bloque por su id (una sola vez)', count(panel2, "getElementById('apeMultiParserPanel')"), 1);
    ok('E1.2 y lo mueve DESPUÉS de pintar el panel y de insertarlo en la pestaña',
        iInner > 0 && iInsert > 0 && iMp > iInsert, 'inner=' + iInner + ' insert=' + iInsert + ' mover=' + iMp);
    ok('E1.3 lo MUEVE, no lo clona (clonar dejaría dos #apeMultiParserStatus)',
        /panel\.appendChild\(mpPanel\)/.test(panel2) && !/cloneNode/.test(panel2.slice(Math.max(0, iMp - 400), iMp + 400)));
    ok('E1.4 va protegido: si el bloque no está, el generador no se rompe',
        /if \(mpPanel && mpPanel\.parentNode !== panel\)/.test(panel2) && /try \{/.test(panel2.slice(Math.max(0, iMp - 200), iMp)));
    eq('E2.1 el HTML sigue teniendo el bloque una sola vez', count(index2, 'id="apeMultiParserPanel"'), 1);
    const iP = index2.indexOf('js/ape-v9/ape-multi-parser.js');
    const iU = index2.indexOf('js/ape-v9/ape-multi-export-ui.js');
    ok('E2.2 el parser se carga antes que su capa de botones', iP > 0 && iU > iP, 'parser=' + iP + ' ui=' + iU);
    ok('E2.3 los dos botones siguen en el marcado',
        count(index2, 'id="btnMultiExportView"') === 1 && count(index2, 'id="btnMultiParseFile"') === 1);
    eq('E2.4 un solo div de estado para los mensajes del exportador', count(index2, 'id="apeMultiParserStatus"'), 1);
}

console.log('\n=== F · la .5 es la versión premium y la declara cada canal ===');
/* [2026-11-23 · PREMIUM .5] Orden del operador: la versión premium de cada perfil es
   la .5 y la INTENCIÓN 4K/6K se declara con ESA versión, por canal. La tabla no se
   inventa: sale del propio adaptador (PROFILE_IDS, 12 ids) y la emisión la aplica
   premiumOf(). Aquí se prueba el mapa y la puerta, con el adaptador REAL delante. */
if (!fs.existsSync(EMIT_SRC) || !fs.existsSync(ADAPTER_SRC)) {
    SKIP++;
    console.log('  OMITIDA  faltan el módulo o el adaptador; no se afirma nada');
} else {
    const ctxF = makeCtx(true);
    const EF = ctxF.APE_4K6K_INTENT_EMIT;
    const AD = ctxF.APE_4K6K;

    eq('F1.1 el módulo publica el mapa premium', typeof EF.premiumOf, 'function');
    eq('F1.2 P0→P0.5 · P1→P1.5 · P2→P2.5 · P3→P3.5 · P4→P4.5 · P5→P5.5',
        ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map(EF.premiumOf).join(','),
        'P0.5,P1.5,P2.5,P3.5,P4.5,P5.5');
    eq('F1.3 una .5 se queda en .5 (no se sube dos veces)',
        ['P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'].map(EF.premiumOf).join(','),
        'P0.5,P1.5,P2.5,P3.5,P4.5,P5.5');
    eq('F1.4 lo que no es un perfil no se inventa (runtime/vacío/P9 vuelven igual)',
        [EF.premiumOf('runtime'), EF.premiumOf(''), EF.premiumOf('P9')].join('|'), 'runtime||P9');
    const ids12 = (AD.PROFILE_IDS || []).slice();
    eq('F1.5 las seis .5 existen de verdad en el contrato del adaptador (12 perfiles)',
        ['P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'].filter((x) => ids12.indexOf(x) >= 0).length + '/' + ids12.length, '6/12');

    const bloqF = canal();
    const lineaF = (p) => (EF.applyDetailed(bloqF, {}, p, true).block.split('\n').filter((x) => x.indexOf(TAG) === 0)[0] || '');
    const prof = (t) => (/\"profile\":\"([^\"]*)\"/.exec(t) || [])[1];
    const res = (t) => (/\"targetResolution\":\"([^\"]*)\"/.exec(t) || [])[1];
    eq('F2.1 canal en P0 declara la .5 (P0.5)', prof(lineaF('P0')), 'P0.5');
    eq('F2.2 canal en P5 declara la .5 (P5.5)', prof(lineaF('P5')), 'P5.5');
    eq('F2.3 canal que ya viene en P3.5 se queda en P3.5', prof(lineaF('P3.5')), 'P3.5');
    eq('F2.4 sin perfil resuelto se declara tal cual, sin inventar una .5', prof(lineaF('runtime')), 'runtime');
    eq('F2.5 el informe dice qué perfil era y cuál se declaró',
        EF.applyDetailed(bloqF, {}, 'P2', true).profileOwn + '→' + EF.applyDetailed(bloqF, {}, 'P2', true).profilePremium, 'P2→P2.5');
    ok('F2.6 la resolución objetivo del tag no la inventa el módulo (base y premium coinciden aquí)',
        res(lineaF('P3')) === res(lineaF('P3.5')) && /^\d+x\d+$/.test(res(lineaF('P3'))), res(lineaF('P3')) + '|' + res(lineaF('P3.5')));
    const apagadoF = EF.applyDetailed(bloqF, {}, 'P0', false);
    eq('F2.7 con el flag apagado no se toca ni el perfil ni el bloque',
        apagadoF.profilePremium + '|' + (apagadoF.block === bloqF), 'P0|true');

    /* Un payload previo que declara la BASE no se reaprovecha: si no, el tag
       seguiría diciendo P3 y la regla quedaría sin cumplir sobre el papel. */
    const iField = AD.INTENT_FIELD;
    const prevBase = {}; prevBase[iField] = { outputPolicy: { profile: 'P3' } };
    const prevPrem = {}; prevPrem[iField] = { outputPolicy: { profile: 'P3.5' } };
    const tagCon = (ch, p) => (EF.applyDetailed(bloqF, ch, p, true).block.split('\n').filter((x) => x.indexOf(TAG) === 0)[0] || '');
    eq('F3.1 un payload previo de la base NO se reaprovecha', prof(tagCon(prevBase, 'P3.5')), 'P3.5');
    eq('F3.2 uno que ya declara la premium se reaprovecha tal cual', tagCon(prevPrem, 'P3.5'), lineaF('P3.5'));

    /* [2026-11-23 · PREMIUM .5] El catalogo cargado puede traer SOLO las 6 bases:
       entonces la .5 no tiene resolucion propia y el adaptador HEREDA la de su base
       (no la inventa). Si el catalogo si trae la .5, manda la .5. */
    const pt = (t) => (/"profileTarget":("[^"]*"|null)/.exec(t) || [])[1];
    ctxF.APE_PROFILES_CONFIG = { profiles: { P3: { settings: { resolution: '1920x1080' } } } };
    ok('F4.1 catalogo sin la .5: la .5 hereda la resolucion de su base (no queda en null)',
        pt(tagCon({}, 'P3.5')) === pt(tagCon({}, 'P3')) && pt(tagCon({}, 'P3.5')) === '"1920x1080"',
        pt(tagCon({}, 'P3')) + '|' + pt(tagCon({}, 'P3.5')));
    ok('F4.2 catalogo sin la .5: el objetivo declarado no baja al declarar la premium',
        res(tagCon({}, 'P3.5')) === res(tagCon({}, 'P3')),
        res(tagCon({}, 'P3')) + '|' + res(tagCon({}, 'P3.5')));
    ctxF.APE_PROFILES_CONFIG = { profiles: {
        P3: { settings: { resolution: '1920x1080' } },
        'P3.5': { settings: { resolution: '5760x3240' } }
    } };
    ok('F4.3 catalogo que si declara la .5: manda la .5 (objetivo 5760x3240)',
        res(tagCon({}, 'P3.5')) === '5760x3240', res(tagCon({}, 'P3.5')));
    try { delete ctxF.APE_PROFILES_CONFIG; } catch (e) { ctxF.APE_PROFILES_CONFIG = null; }
    ok('F4.4 sin catalogo, base y premium declaran lo mismo (el modulo no inventa 6K)',
        res(tagCon({}, 'P3')) === res(tagCon({}, 'P3.5')) && res(tagCon({}, 'P3')) === '3840x2160',
        res(tagCon({}, 'P3')) + '|' + res(tagCon({}, 'P3.5')));
}

console.log('\nRESUMEN PASS=' + PASS + ' FAIL=' + FAIL + (SKIP ? ' OMITIDAS=' + SKIP : ''));
process.exit(FAIL === 0 ? 0 : 1);
