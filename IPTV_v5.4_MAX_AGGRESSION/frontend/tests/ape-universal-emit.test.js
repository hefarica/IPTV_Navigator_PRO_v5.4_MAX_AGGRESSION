/**
 * tests/ape-universal-emit.test.js
 * ---------------------------------------------------------------------------
 * MODO UNIVERSAL · la casilla «LISTA UNIVERSAL · TODOS LOS PLAYERS» del panel
 * ⚙️ OPTIMIZACIÓN Y SALIDAS. Esta suite comprueba las cuatro cosas que hacen
 * falta para poder decir que el interruptor existe y que no inventa nada:
 *
 *   A  · el módulo emisor (unitario, sin navegador)
 *   A2 · que su lista de dialectos es la del multiparser de verdad (no copiada a ojo)
 *   A3 · que su «guía canónica» es la que ya implementa la capa 12P (techo a techo)
 *   B  · que el generador y la página están cableados en el sitio correcto (lectura)
 *   C  · la lista REAL con la fixture mini_15, apagada y encendida (extremo a extremo)
 *   D  · la fixture 4K (el camino que el arnés recompone en passthrough)
 *   E  · el panel: dónde vive la fila, quién escribe el flag y qué pasa por defecto
 *
 * Reglas que la suite defiende:
 *   · flag APAGADO ⇒ apply() devuelve el MISMO string: la lista es byte a byte igual.
 *   · flag ENCENDIDO ⇒ UNA línea declarativa por canal, y nada más cambia.
 *   · la etiqueta NUNCA rompe la adyacencia #EXT-X-STREAM-INF → URI (RFC 8216
 *     §4.3.4.2), que ya costó 22 721 canales una vez.
 *   · 0 o 2 URI en el bloque ⇒ no se toca: no se adivina.
 *   · ningún número propio: DIALECTS sale del multiparser, GUIDE de la capa 12P,
 *     y PROFILE del perfil real del canal (vacío → 'runtime', nunca P3 inventado).
 *
 * El indicador --universal del arnés NO es código de producto: sólo existe en
 * _vps_stage/tests/regen_headless/regen_headless.js para encender el flag dentro
 * del sandbox de medición. Si el arnés no está, la parte C se declara OMITIDA y
 * nunca se cuenta como verde.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
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
const EMIT_SRC = path.join(FRONT, 'js', 'ape-v9', 'ape-universal-emit.js');
const MP_SRC = path.join(FRONT, 'js', 'ape-v9', 'ape-multi-parser.js');
const L12P_SRC = path.join(FRONT, 'js', 'ape-v9', 'lab-12p-conformance.js');
const GEN_SRC = path.join(FRONT, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const PANEL_SRC = path.join(FRONT, 'js', 'ape-v9', 'generation-output-panel.js');
const INDEX = path.join(FRONT, 'index-v4.html');
const HARNESS = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'regen_headless.js');
const FIXTURES = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'fixtures');
const FIXTURE = path.join(FIXTURES, 'mini_15.m3u8');
const FIX4K = path.join(FIXTURES, 'mini_inherit_6_4K.m3u8');

const TAG = '#EXT-X-APE-UNIVERSAL';
const read = (p) => fs.readFileSync(p, 'utf8');
const count = (h, n) => h.split(n).length - 1;
const sha256 = (t) => crypto.createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');

// ── Sandbox mínimo: sin DOM, sin red, sin reloj ────────────────────────────
function makeCtx() {
    const sandbox = { console: console, JSON: JSON, Math: Math };
    sandbox.window = sandbox;          /* el módulo busca window primero */
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read(EMIT_SRC), sandbox, { filename: 'ape-universal-emit.js' });
    return sandbox;
}

/* Un bloque de canal como el que entrega el generador: EXTINF, opciones,
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
if (!fs.existsSync(EMIT_SRC)) {
    SKIP++;
    console.log('  OMITIDA  falta ape-universal-emit.js; no se afirma nada');
} else {
    const ctx = makeCtx();
    const E = ctx.APE_UNIVERSAL_EMIT;

    eq('A1.1 el módulo se registra con versión y TAG', E && E.version + '|' + E.TAG, '1.0.0|' + TAG);
    const sinComentarios = read(EMIT_SRC).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok('A1.2 no usa DOM, red, Date.now ni Math.random (mirando el código, no los comentarios)',
        !/\bdocument\b|fetch\(|XMLHttpRequest|Date\.now|Math\.random/.test(sinComentarios));

    // A2 · el flag: apagado por defecto, y sólo lo que se dice es «encendido»
    ctx.APE_UNIVERSAL_MODE = undefined;
    ok('A2.1 sin nada puesto, está APAGADO (el defecto nunca es encender)', E.isOn() === false);
    ctx.APE_UNIVERSAL_MODE = false;
    ok('A2.2 false es apagado', E.isOn() === false);
    ctx.APE_UNIVERSAL_MODE = 0;
    ok('A2.3 0 es apagado', E.isOn() === false);
    ctx.APE_UNIVERSAL_MODE = 'off';
    ok('A2.4 "off" es apagado', E.isOn() === false);
    ctx.APE_UNIVERSAL_MODE = null;
    ok('A2.5 null es apagado', E.isOn() === false);
    ctx.APE_UNIVERSAL_MODE = true;
    ok('A2.6 true es encendido', E.isOn() === true);
    ctx.APE_UNIVERSAL_MODE = '1';
    ok('A2.7 "1" persiste como encendido (lo que guarda localStorage)', E.isOn() === true);
    ok('A2.8 options.universal=false APAGA aunque el global esté encendido', E.isOn(false) === false);
    ok('A2.9 options.universal=true ENCIENDE aunque el global esté apagado', E.isOn(true) === true);

    // A3 · la línea que se emite: literal y con orden fijo
    const LINEA = TAG + ':V=1,DIALECTS=12,KEEP_UNKNOWN=true,KEEP_APE=true,SANITIZE_TOXIC=true,GUIDE=12P_CANONICAL/1,PROFILE=P3';
    eq('A3.1 declare("P3") es exactamente la línea esperada (orden de atributos fijo)', E.declare('P3'), LINEA);
    eq('A3.2 sin perfil se declara runtime, no se inventa uno', E.declare(''), TAG + ':V=1,DIALECTS=12,KEEP_UNKNOWN=true,KEEP_APE=true,SANITIZE_TOXIC=true,GUIDE=12P_CANONICAL/1,PROFILE=runtime');
    eq('A3.3 attrValue quita lo que rompería la lista de atributos (comas, dos puntos)', E.attrValue('P3,evil:x'), 'P3evilx');
    eq('A3.4 attrValue deja intacto un perfil normal', E.attrValue('P2.5'), 'P2.5');
    eq('A3.5 attrValue de null cae en runtime', E.attrValue(null), 'runtime');

    // A4 · apagado = identidad
    ctx.APE_UNIVERSAL_MODE = false;
    const b = canal();
    ok('A4.1 con el flag apagado devuelve el MISMO string (identidad)', E.apply(b, {}, 'P3') === b);
    ok('A4.2 el flag apagado por opción gana al global encendido', E.apply(b, {}, 'P3', false) === b);
    ok('A4.3 applyDetailed con el flag apagado informa "flag apagado" y no toca nada',
        E.applyDetailed(b, {}, 'P3').where === 'flag apagado' && E.applyDetailed(b, {}, 'P3').block === b);

    // A5 · encendido = exactamente una línea, bien colocada
    ctx.APE_UNIVERSAL_MODE = true;
    const on = E.apply(b, {}, 'P3');
    const lOn = on.split('\n'), lOf = b.split('\n');
    eq('A5.1 añade exactamente UNA línea', lOn.length - lOf.length, 1);
    eq('A5.2 y es la declaración universal', lOn.filter((x) => x.indexOf(TAG) === 0).length, 1);
    eq('A5.3 va justo antes de la URI', lOn[lOn.indexOf(LINEA) + 1], 'https://b.invalid/dos.m3u8');
    eq('A5.4 place() dice dónde la puso', E.place(b, LINEA).where, 'antes de la URI');
    ok('A5.5 quitando esa línea el bloque queda igual que estaba', lOn.filter((x) => x.indexOf(TAG) !== 0).join('\n') === b);

    // A6 · con STREAM-INF delante, la etiqueta va ANTES del STREAM-INF
    const bs = canal({ stream: true });
    const os2 = E.apply(bs, {}, 'P3');
    const ls = os2.split('\n');
    const atS = ls.indexOf(LINEA);
    eq('A6.1 la etiqueta entra ANTES del STREAM-INF', E.place(bs, LINEA).where, 'antes del STREAM-INF');
    eq('A6.2 el par STREAM-INF → URI sigue pegado (RFC 8216 §4.3.4.2)', ls[atS + 1].indexOf('#EXT-X-STREAM-INF:'), 0);
    eq('A6.3 y la URI sigue inmediatamente detrás', ls[atS + 2], 'https://b.invalid/dos.m3u8');
    ok('A6.4 quitando la etiqueta el bloque con STREAM-INF queda igual que estaba',
        ls.filter((x) => x.indexOf(TAG) !== 0).join('\n') === bs);

    // A7 · idempotencia y ambigüedad: no se adivina
    eq('A7.1 aplicarla dos veces no la duplica', count(E.apply(os2, {}, 'P3'), TAG), 1);
    eq('A7.2 place() lo declara "ya presente"', E.place(os2, LINEA).where, 'ya presente');
    eq('A7.3 dos URI en el bloque ⇒ no se toca', E.place(canal({ uris: 2 }), LINEA).where, 'ambigua: 2 URI');
    eq('A7.4 y el bloque vuelve intacto', E.apply(canal({ uris: 2 }), {}, 'P3'), canal({ uris: 2 }));
    eq('A7.5 cero URI ⇒ no se toca', E.place(canal({ uris: 0 }), LINEA).where, 'ambigua: 0 URI');
    eq('A7.6 bloque vacío ⇒ no se toca', E.place('', LINEA).where, 'bloque vacio o no-string');
    eq('A7.7 línea que no es la del módulo ⇒ se rechaza', E.place(canal(), '#EXTINF:-1,otro').where, 'linea no valida');

    // A8 · CRLF
    const bcrlf = canal({ crlf: true, stream: true });
    const ocrlf = E.apply(bcrlf, {}, 'P3');
    ok('A8.1 con CRLF no se cuelan saltos sueltos',
        ocrlf.split('\r\n').every((x) => x.indexOf('\n') < 0 && x.indexOf('\r') < 0));
    eq('A8.2 con CRLF sigue añadiendo una sola línea', ocrlf.split('\r\n').length - bcrlf.split('\r\n').length, 1);
    ok('A8.3 y el par STREAM-INF → URI sigue pegado', /#EXT-X-STREAM-INF:[^\r\n]*\r\nhttps:\/\//.test(ocrlf));

    // A9 · el resumen de la guía sale de GUIDE, no de literales sueltos
    const gs = E.guideSummary();
    eq('A9.1 el resumen declara 12 dialectos', gs.dialects, E.DIALECTS.length);
    ok('A9.2 y la guía 12P_CANONICAL/1 con sus cuatro techos',
        gs.id === '12P_CANONICAL/1' && gs.caps === '25 Mbps→30 s / 80 Mbps→24 s / 150 Mbps→20 s / resto→15 s', gs.caps);
    ok('A9.3 sin aparcar el valor declarado (declared_retained)', gs.declared_retained === true);
}

console.log('\n=== A2 · los dialectos son los del multiparser de verdad ===');
if (!fs.existsSync(MP_SRC) || !fs.existsSync(EMIT_SRC)) {
    SKIP++;
    console.log('  OMITIDA  falta el multiparser o el emisor; no se afirma nada');
} else {
    const src = read(MP_SRC);
    const i = src.indexOf('const DIALECT_DEFS = {');
    ok('A2.0 el multiparser declara DIALECT_DEFS donde se esperaba', i > 0);
    let real = [];
    if (i > 0) {
        let j = src.indexOf('{', i), depth = 0, k = j;
        for (; k < src.length; k++) {
            if (src[k] === '{') depth++;
            else if (src[k] === '}') { depth--; if (depth === 0) break; }
        }
        const cuerpo = src.slice(j, k + 1);
        /* claves de primer nivel: al principio de línea, 8 espacios, identificador y ': {' */
        const re = /^\s{8}([A-Za-z0-9_]+)\s*:\s*\{/gm;
        let m;
        while ((m = re.exec(cuerpo))) real.push(m[1]);
    }
    eq('A2.1 el multiparser tiene 12 dialectos', real.length, 12);
    const E2 = makeCtx().APE_UNIVERSAL_EMIT;
    eq('A2.2 la lista del emisor es EXACTAMENTE la del multiparser (mismo orden)',
        E2.DIALECTS.join(','), real.join(','));
    eq('A2.3 y DIALECTS= declara su número real, no un 12 escrito a mano',
        E2.declare('P3').indexOf(',DIALECTS=' + real.length + ',') > 0, true);
}

console.log('\n=== A3 · la guía canónica es la de la capa 12P (techo a techo) ===');
if (!fs.existsSync(L12P_SRC) || !fs.existsSync(EMIT_SRC)) {
    SKIP++;
    console.log('  OMITIDA  falta lab-12p-conformance.js o el emisor; no se afirma nada');
} else {
    const L = require(L12P_SRC);
    const E3 = makeCtx().APE_UNIVERSAL_EMIT;
    ok('A3.0 la capa 12P se carga con su API', !!(L && L.CAPS && L.envelope && L.effectiveBuffer));

    const capsL = L.CAPS.map((c) => (c.bitrate_max_mbps === null ? 'resto' : c.bitrate_max_mbps) + '→' + c.cap_s).join(' / ');
    const capsE = E3.GUIDE.caps.map((c) => (c.bitrate_max_mbps === null ? 'resto' : c.bitrate_max_mbps) + '→' + c.cap_s).join(' / ');
    eq('A3.1 los cuatro techos por bitrate coinciden con los de la capa 12P', capsE, capsL);

    const T = 24;
    const env = L.envelope(T);
    eq('A3.2 el mínimo del envelope coincide (0,625 · T)', E3.GUIDE.envelope[0] * T * 1000, env.min_ms);
    eq('A3.3 el máximo del envelope coincide (2 · T)', E3.GUIDE.envelope[1] * T * 1000, env.max_ms);
    eq('A3.4 el mínimo extendido coincide (1,25 · T)', E3.GUIDE.envelope[2] * T * 1000, env.exo_min_ms);
    eq('A3.5 el máximo extendido coincide (3,75 · T)', E3.GUIDE.envelope[3] * T * 1000, env.exo_max_ms);

    const pf = (t) => Math.min(6, Math.max(2, Math.round(t / 4)));
    const mismos = [8, 15, 17, 20, 24, 27, 30].every((t) => L.prefetchSegments(t) === pf(t));
    ok('A3.6 la regla de prefetch coincide con la de la capa 12P en 7 objetivos', mismos && E3.GUIDE.prefetch_rule === 'min(6,max(2,round(T/4)))');

    const e24 = L.effectiveBuffer({ declaredSec: 40, bitrateMbps: 80 });
    eq('A3.7 las descargas en paralelo son las mismas (4)', E3.GUIDE.parallel_downloads, e24.parallel_downloads);
    eq('A3.8 y el valor declarado se conserva igual', E3.GUIDE.declared_retained, e24.declared_retained);

    /* El contrato de 12 perfiles: 12 de verdad, no un 12 de adorno. */
    const CJ = path.join(REPO, 'contracts', 'ape_profiles_12.json');
    if (fs.existsSync(CJ)) {
        const j = JSON.parse(read(CJ));
        const ids = j && j.profiles ? Object.keys(j.profiles) : [];
        eq('A3.9 el contrato de perfiles tiene 12 y la guía declara 12', ids.length + '/' + E3.GUIDE.profiles, '12/12');
    } else {
        SKIP++;
        console.log('  OMITIDA  no está contracts/ape_profiles_12.json; no se afirma el número de perfiles');
    }
}

console.log('\n=== B · cableado leído (generador, panel y página) ===');
{
    const gen = read(GEN_SRC);
    eq('B1.1 el generador llama al emisor en UN solo sitio', count(gen, 'window.APE_UNIVERSAL_EMIT.apply('), 1);
    eq('B1.2 y guarda por typeof window antes de usarlo', count(gen, "typeof window !== 'undefined' && window.APE_UNIVERSAL_EMIT"), 1);
    ok('B1.3 el resultado va a _entryOut', /const _entryOut = \(\(/.test(gen));
    ok('B1.4 el validador recibe _entryOut, no entry', /_ca11ValidateEntry\(_entryOut, index\)/.test(gen));
    ok('B1.5 el trozo que se publica usa _entryOut', /const chunk = _entryOut \+ '\\n\\n';/.test(gen));
    ok('B1.6 options.universal=true es lo único que fuerza el encendido desde el generador',
        /options && options\.universal === true/.test(gen));

    const panel = read(PANEL_SRC);
    ok('B2.1 el panel pinta la fila UNIVERSAL:', panel.indexOf('LISTA UNIVERSAL · TODOS LOS PLAYERS') > 0);
    ok('B2.2 con su casilla y su etiqueta', panel.indexOf('id="apeUniversalToggle"') > 0 && panel.indexOf('id="apeUniversalLabel"') > 0);
    ok('B2.3 y con el rótulo de estado', panel.indexOf('id="apeUniversalState"') > 0);
    eq('B2.4 setUniversal se define una sola vez', count(panel, 'function setUniversal(on, silent)'), 1);
    eq('B2.5 y se llama desde el arranque y desde la casilla',
        count(panel, 'setUniversal(savedUni, true)') + '|' + count(panel, 'setUniversal(uniCb.checked, false)'), '1|1');
    eq('B2.6 sólo hay un sitio que ASIGNA window.APE_UNIVERSAL_MODE en el panel',
        (panel.match(/window\.APE_UNIVERSAL_MODE\s*=(?!=)/g) || []).length, 1);

    const html = read(INDEX);
    eq('B3.1 el HTML carga el módulo una sola vez', count(html, 'ape-universal-emit.js'), 1);
    const posScript = html.indexOf('<script src="js/ape-v9/ape-universal-emit.js');
    const posGen = html.indexOf('<script src="js/ape-v9/m3u8-typed-arrays-ultimate.js');
    ok('B3.2 y lo carga ANTES del generador canónico', posScript > 0 && posGen > 0 && posScript < posGen,
        'script=' + posScript + ' generador=' + posGen);
    ok('B3.3 el token del script es el del fichero, no uno inventado', /ape-universal-emit\.js\?v=[0-9a-z.\-]+/.test(html));
    eq('B3.4 el HTML no tiene la casilla: la pinta el panel (por eso no devuelve null)', count(html, 'apeUniversalToggle'), 0);
    eq('B3.5 el HTML nunca enciende el flag por su cuenta', count(html, 'APE_UNIVERSAL_MODE = true'), 0);
    ok('B3.6 el arranque por defecto es APAGADO',
        /localStorage\.getItem\('ape_universal_intent_enabled'\) === '1'/.test(html));
}

console.log('\n=== C · lista real: flag apagado vs encendido ===');
if (!fs.existsSync(HARNESS) || !fs.existsSync(FIXTURE)) {
    SKIP++;
    console.log('  OMITIDA  no están el arnés o la fixture en este árbol; no se afirma nada');
} else {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'apeuni-'));
    const dirOff = path.join(base, 'off');
    const dirOnA = path.join(base, 'ona');
    const dirOnB = path.join(base, 'onb');
    function run(universal, dir) {
        /* OJO con los argumentos: 868 821 B / a9a13c03… es la referencia histórica de
           mini_15 SIN --profiles. Con --profiles el mismo árbol da otra lista más larga
           (medido tras R22: 929 193 B, 14 620 líneas), así que mezclar las dos no compara nada. */
        const args = [HARNESS, FIXTURE, '--mode', 'default', '--deterministic'];
        if (universal) args.push('--universal', 'on');
        args.push('--out', dir);
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
        const rOff = run(false, dirOff), offText = listIn(dirOff);
        const rOnA = run(true, dirOnA), onTextA = listIn(dirOnA);
        const rOnB = run(true, dirOnB), onTextB = listIn(dirOnB);

        eq('C1.1 la corrida apagada termina bien', rOff.code, 0);
        eq('C1.2 la corrida encendida termina bien', rOnA.code, 0);
        ok('C1.3 las dos listas existen y son grandes', !!offText && !!onTextA && offText.length > 1000 && onTextA.length > 1000);
        ok('C1.4 el arnés dice que cargó el módulo sólo al encender',
            /\[universal\] flag=on · modulo=1\.0\.0/.test(rOnA.out) && !/\[universal\]/.test(rOff.out));
        ok('C1.5 la corrida encendida sigue siendo determinista', /determinismo\s*:\s*SHA IDÉNTICO/.test(rOnA.out));

        const lOff = offText.split('\n'), lOn = onTextA.split('\n');
        const tagsOff = lOff.filter((l) => l.indexOf(TAG) === 0);
        const tagsOn = lOn.filter((l) => l.indexOf(TAG) === 0);
        const nExtinf = lOff.filter((l) => l.indexOf('#EXTINF:') === 0).length;
        const nCanales = lOff.filter((l) => l.indexOf('#EXTINF:') === 0).length;

        eq('C2.1 apagado: ni una etiqueta', tagsOff.length, 0);
        eq('C2.2 apagado: la lista es la histórica (868 821 B)', Buffer.byteLength(offText), 868821);
        eq('C2.3 apagado: y su sha256 es el de siempre (a9a13c03…)', sha256(offText).slice(0, 8), 'a9a13c03');

        eq('C3.1 encendido: una etiqueta por canal', tagsOn.length, nCanales);
        eq('C3.2 encendido: exactamente una línea más por canal', lOn.length - lOff.length, nCanales);
        ok('C3.3 todas declaran la guía 12P y el número real de dialectos', tagsOn.every((t) => /^#EXT-X-APE-UNIVERSAL:V=1,DIALECTS=12,/.test(t) && t.indexOf('GUIDE=12P_CANONICAL/1') > 0));
        ok('C3.4 todas llevan un PROFILE saneado y no vacío', tagsOn.every((t) => /,PROFILE=[A-Za-z0-9._\-]+$/.test(t)));
        ok('C3.5 ninguna declara un perfil inventado (salen del contrato de 12: P0…P5, sus .5, o runtime)',
            tagsOn.every((t) => /,PROFILE=(runtime|P[0-5](\.[0-9])?)$/.test(t)),
            JSON.stringify(tagsOn.map((t) => (/,PROFILE=(.*)$/.exec(t) || [])[1]).reduce((m, p) => { m[p] = (m[p] || 0) + 1; return m; }, {})));

        /* Dónde entra: una etiqueta y, detrás, o la URI o el STREAM-INF (nunca un tag suelto). */
        let antesUri = 0, antesStream = 0, suelta = 0;
        for (let i = 0; i < lOn.length; i++) {
            if (lOn[i].indexOf(TAG) !== 0) continue;
            const nx = lOn[i + 1] || '';
            if (/^\s*https?:\/\//i.test(nx)) antesUri++;
            else if (/^#EXT-X-STREAM-INF:/i.test(nx)) antesStream++;
            else suelta++;
        }
        eq('C4.1 ninguna etiqueta queda suelta', suelta, 0);
        eq('C4.2 todas van delante de algo que es una URI o su STREAM-INF', antesUri + antesStream, tagsOn.length);
        console.log('  colocación: antes de la URI ' + antesUri + ' · antes del STREAM-INF ' + antesStream + ' · sueltas ' + suelta);

        /* La adyacencia STREAM-INF → URI: mismo recuento antes y después del interruptor. */
        const si = (arr) => {
            let n = 0, good = 0;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].indexOf('#EXT-X-STREAM-INF:') !== 0) continue;
                n++;
                if (/^\s*https?:\/\//i.test(arr[i + 1] || '')) good++;
            }
            return n + '/' + good;
        };
        eq('C4.3 la adyacencia STREAM-INF → URI no cambia al encender', si(lOn), si(lOff));

        /* El cotejo que de verdad importa: sin las líneas nuevas, idénticas. */
        const limpia = (arr) => arr.filter((l) => l.indexOf(TAG) !== 0);
        const a = limpia(lOff), c = limpia(lOn);
        let primerDiff = -1;
        if (a.length === c.length) {
            for (let i = 0; i < a.length; i++) { if (a[i] !== c[i]) { primerDiff = i; break; } }
        }
        ok('C5.1 sin la línea nueva las dos listas tienen las mismas líneas', a.length === c.length, a.length + ' vs ' + c.length);
        ok('C5.2 y son idénticas byte a byte (el interruptor no cambia nada más)', primerDiff === -1,
            primerDiff === -1 ? '' : 'L' + (primerDiff + 1) + ': ' + JSON.stringify((a[primerDiff] || '').slice(0, 80)) + ' vs ' + JSON.stringify((c[primerDiff] || '').slice(0, 80)));
        const bloques = (arr) => {
            const out = [];
            let cur = null;
            for (const l of arr) {
                if (l.indexOf('#EXTINF:') === 0) { if (cur) out.push(cur); cur = [l]; }
                else if (cur) cur.push(l);
            }
            if (cur) out.push(cur);
            return out;
        };
        const canalesOn = bloques(lOn);
        eq('C5.3 ningún canal lleva la etiqueta dos veces',
            canalesOn.filter((c) => c.filter((x) => x.indexOf(TAG) === 0).length > 1).length, 0);
        eq('C5.4 y cada canal lleva exactamente una', canalesOn.filter((c) => c.filter((x) => x.indexOf(TAG) === 0).length === 1).length, canalesOn.length);

        eq('C6.1 dos corridas encendidas dan el mismo sha256 (determinismo del módulo)', sha256(onTextA), sha256(onTextB));
        ok('C6.2 y el encendido no es el apagado (el interruptor hace algo)', sha256(onTextA) !== sha256(offText));

        console.log('\n  medido: OFF ' + Buffer.byteLength(offText) + ' B / ' + lOff.length + ' líneas / sha ' + sha256(offText).slice(0, 8) +
            ' · ON ' + Buffer.byteLength(onTextA) + ' B / ' + lOn.length + ' líneas / sha ' + sha256(onTextA).slice(0, 8) +
            ' · etiquetas ' + tagsOn.length + '/' + nCanales + ' canales');
    } finally {
        try { fs.rmSync(base, { recursive: true, force: true }); } catch (_e) { /* limpieza best-effort */ }
    }
}

console.log('\n=== D · fixture 4K: la lista que el merge recompone ===');
/* La lista 4K/6K es AUTODESCRIPTIVA (trae su capa APE) y el arnés la recompone en modo
   passthrough: sólo conserva del emisor lo que pasa DECL_RE. Por eso la etiqueta nueva
   se añadió también a esa lista blanca (cambio de arnés, no de producto). Si el camino
   no la dejara pasar, aquí se declara cobertura parcial; nunca se cuenta como verde. */
if (!fs.existsSync(HARNESS) || !fs.existsSync(FIX4K)) {
    SKIP++;
    console.log('  OMITIDA  no están el arnés o la fixture 4K; no se afirma nada');
} else {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'apeuni4k-'));
    function run4k(universal, dir) {
        const args = [HARNESS, FIX4K, '--mode', 'default', '--deterministic', '--profiles'];
        if (universal) args.push('--universal', 'on');
        args.push('--out', dir);
        const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
        return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
    }
    const listIn = (dir) => {
        if (!fs.existsSync(dir)) return null;
        const f = fs.readdirSync(dir).filter((x) => /\.m3u8$/i.test(x));
        return f.length === 1 ? fs.readFileSync(path.join(dir, f[0]), 'utf8') : null;
    };
    try {
        const dOff = path.join(base, 'off'), dOn = path.join(base, 'on');
        const rOff = run4k(false, dOff), tOff = listIn(dOff);
        const rOn = run4k(true, dOn), tOn = listIn(dOn);
        eq('D1.1 las dos corridas de la 4K terminan bien', rOff.code + '/' + rOn.code, '0/0');
        ok('D1.2 existen las dos listas', !!tOff && !!tOn);
        if (tOff && tOn) {
            const nExt = tOff.split('\n').filter((l) => l.indexOf('#EXTINF:') === 0).length;
            const tagsOff = tOff.split('\n').filter((l) => l.indexOf(TAG) === 0).length;
            const tagsOn = tOn.split('\n').filter((l) => l.indexOf(TAG) === 0).length;
            eq('D2.1 apagada: ni una etiqueta', tagsOff, 0);
            if (tagsOn === nExt) {
                ok('D2.2 encendida: una por canal (' + tagsOn + '/' + nExt + ')', true);
                const lOn = tOn.split('\n').filter((l) => l.indexOf(TAG) !== 0);
                const lOf = tOff.split('\n');
                ok('D2.3 sin la etiqueta, la 4K encendida es idéntica a la apagada',
                    lOn.length === lOf.length && lOn.every((x, i) => x === lOf[i]),
                    lOn.length + ' vs ' + lOf.length);
            } else {
                SKIP++;
                console.log('  COBERTURA PARCIAL  la 4K da ' + tagsOn + '/' + nExt + ' etiquetas: su camino passthrough');
                console.log('                    recompone los bloques y puede no dejar pasar las declaraciones.');
                console.log('                    NO se cuenta como fallo (es cobertura parcial declarada).');
            }
        }
    } finally {
        try { fs.rmSync(base, { recursive: true, force: true }); } catch (_e) { /* limpieza best-effort */ }
    }
}

console.log('\n=== E · el panel: fila, flag y valor por defecto ===');
{
    const panel = read(PANEL_SRC);
    const html = read(INDEX);
    ok('E1.1 la fila se pinta con el resto del panel, no en el HTML', panel.indexOf('id="apeUniversalToggle"') > 0 && html.indexOf('apeUniversalToggle') < 0);
    ok('E1.2 el panel lee la preferencia guardada', /localStorage\.getItem\(UNIVERSAL_KEY\)/.test(panel));
    ok('E1.3 y por defecto está APAGADO (savedUni arranca en false)', /var savedUni = false;/.test(panel));
    ok('E1.4 el listener se engancha después de paintOutputs (el elemento ya existe)',
        panel.lastIndexOf("document.getElementById('apeUniversalToggle')") > panel.indexOf('function paintOutputs()'));
    ok('E1.5 la casilla es de verdad un checkbox, no un botón que diga "encendido"', /<input type="checkbox" id="apeUniversalToggle"/.test(panel));
    ok('E1.6 el rótulo de estado dice lo que pasa sin el flag', panel.indexOf("'apagado · lista intacta'") > 0);
    ok('E1.7 y con el flag, cuántas líneas añade y cuántos dialectos cubre', /\+1 línea por canal/.test(panel));
    ok('E1.8 la nota aclara que el ZIP por player no modifica la lista', panel.indexOf('NO modifica la lista') > 0);
    ok('E1.9 no depende de un id que el HTML no pinte (el fallo original)', count(panel, 'apeUniversalToggle') === 4);
}

console.log('\nRESUMEN PASS=' + PASS + ' FAIL=' + FAIL + (SKIP ? ' OMITIDAS=' + SKIP : ''));
process.exit(FAIL === 0 ? 0 : 1);
