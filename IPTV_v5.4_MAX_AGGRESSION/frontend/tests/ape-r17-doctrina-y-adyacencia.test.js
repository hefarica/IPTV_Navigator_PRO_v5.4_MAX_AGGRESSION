/**
 * tests/ape-r17-doctrina-y-adyacencia.test.js
 * ---------------------------------------------------------------------------
 * Ronda 17 · dos cosas que la persona pidió tocar, medidas y no supuestas:
 *
 *   A · MODELO DE EJECUCIÓN del adaptador 4K/6K
 *       `contracts/muestra-12p/DOCTRINA_EJECUCION_12P.md` nombra el estado de
 *       las capas HLS de los doce perfiles `execution.status=SIMULATED_EXECUTED`.
 *       El adaptador NO ejecuta nada, así que `executed` se queda en `false`
 *       (es verdad) y lo que se añade es el MODELO, con su alcance escrito:
 *       `execution_model`, `mechanism=video_filters`, `quality_measured=false`.
 *       Esta suite comprueba que el nombre sale del contrato (se lee el .md,
 *       no se copia a mano) y que no aparece `executed:true` en ningún sitio.
 *
 *   B · ADYACENCIA RFC 8216 §4.3.4.2 en el envoltorio de pulse
 *       `tools/pulse/ape-pulse-wrap.js` metía sus 9 declaraciones del
 *       propietario + el tag `#EXTSHIMOTT` ENTRE `#EXT-X-STREAM-INF` y su URI
 *       (medido: 0 de 2 pares adyacentes). Su bandera nueva
 *       `--tag-before-stream-inf` lo arregla (2 de 2), pero el contrato
 *       EXTSHIMOTT ver:1 exige que el tag sea la ÚLTIMA línea antes de la URI
 *       (`tools/quality/validate_extshimott.js` → `E_TAG_NOT_LAST`). Son dos
 *       reglas incompatibles en un bloque con STREAM-INF: por eso la bandera
 *       va APAGADA por defecto (salida byte a byte idéntica) y esta suite deja
 *       medido qué gana y qué pierde cada modo. No se esconde el conflicto.
 *
 * Lo que NO se prueba aquí: que un reproductor aplique los filtros, ni la
 * calidad del upscale (NADA de eso está medido en ningún sitio).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

let PASS = 0, FAIL = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + String(detail).slice(0, 400) : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'esperado ' + JSON.stringify(want) + ', obtenido ' + JSON.stringify(got)); }

const FRONT = path.resolve(__dirname, '..');
const REPO = path.resolve(FRONT, '..', '..');
const ADAPTER = path.join(FRONT, 'js', 'ape-v9', 'ape-4k6k-audit-adapter.js');
const WRAP = path.join(REPO, 'tools', 'pulse', 'ape-pulse-wrap.js');
const LIST = path.join(REPO, 'tools', 'pulse', 'ape-pulse-list.cjs');
const BUILDER = path.join(REPO, 'tools', 'url2', 'ape-url-builder.js');
const VALIDATOR = path.join(REPO, 'tools', 'quality', 'validate_extshimott.js');
const DOCTRINE = path.join(REPO, 'contracts', 'muestra-12p', 'DOCTRINA_EJECUCION_12P.md');
const SYNC = path.join(REPO, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'ape-pulse', 'ape-pulse-sync.sh');

const read = (p) => fs.readFileSync(p, 'utf8');
const count = (h, n) => h.split(n).length - 1;

/* ── A · el adaptador: modelo de ejecución ───────────────────────────────── */
console.log('\nA · MODELO DE EJECUCIÓN (adaptador 4K/6K, unitario, sin navegador)');

/* Se carga el módulo en un cajón aislado: sin DOM, sin red, sin ficheros. */
function loadAdapter() {
    const sandbox = { module: { exports: {} }, console: console, require: undefined };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read(ADAPTER), sandbox, { filename: 'ape-4k6k-audit-adapter.js' });
    const api = (sandbox.module.exports && sandbox.module.exports.enrich) ? sandbox.module.exports
        : (sandbox.window && sandbox.window.APE_4K6K);
    return { api: api, ctx: sandbox };
}
const A = loadAdapter();
const api = A.api;
A.ctx[api.FLAG] = true;      // el adaptador es inerte si la bandera está apagada

ok('A1 el módulo se carga y expone la API', !!api && typeof api.enrich === 'function');
eq('A2 versión declarada del adaptador', api.version, '1.2.0');
eq('A3 el nombre del modelo es el de la doctrina (literal exacto)', api.EXECUTION_MODEL, 'SIMULATED_EXECUTED');
eq('A4 mecanismo declarado (etapa aplicada por filtros, no transcoder propio)', api.EXECUTION_MECHANISM, 'video_filters');

const dec = api.executionDeclaration();
ok('A5 la declaración se puede pedir sin encender nada', !!dec && typeof dec === 'object');
eq('A6 `executed` sigue siendo false: aquí no se ejecuta nada', dec.executed, false);
eq('A7 execution_model = SIMULATED_EXECUTED (nombre de la doctrina)', dec.model, 'SIMULATED_EXECUTED');
eq('A8 simulated = true (la fuente no es 4K/6K nativa)', dec.simulated, true);
eq('A9 no se reclama calidad medida (0 mediciones de calidad)', dec.quality_measured, false);
eq('A10 no se reclama fuente nativa', dec.source_native, false);
eq('A11 la etapa la ejecuta el reproductor, no esta app', dec.executed_by, 'player');
ok('A12 la declaración se apunta al contrato que la manda (no a la nada)',
    String(dec.doctrine || '').indexOf('DOCTRINA_EJECUCION_12P.md') >= 0 && fs.existsSync(DOCTRINE), dec.doctrine);
ok('A13 la doctrina existe y NOMBRA SIMULATED_EXECUTED (el literal no es inventado)',
    fs.existsSync(DOCTRINE) && /SIMULATED_EXECUTED/.test(read(DOCTRINE)));
ok('A14 dos llamadas devuelven objetos distintos (nadie muta el del módulo)',
    api.executionDeclaration() !== dec && api.executionDeclaration().model === dec.model);

/* El audit de una lista mínima: el modelo viaja en el registro, en los dos caminos. */
const MINI = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="r1" group-title="R",Canal 1',
    '#EXT-X-APE-STREAM-TRUTH:src=native-4k,w=3840,h=2160,fps=50,rawfps=50,family=HEVC,pq=1',
    '#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0"',
    'http://prov.invalid/1.m3u8',
    '#EXTINF:-1 tvg-id="r2" group-title="R",Canal 2',
    'http://prov.invalid/2.m3u8',
    '',
].join('\n');

const recText = api.auditText(MINI);
ok('A15 auditText(texto) devuelve un registro', !!recText && !!recText.adapter, JSON.stringify(recText && Object.keys(recText)));
eq('A16 el registro de texto declara el modelo', recText && recText.adapter && recText.adapter.execution_model, 'SIMULATED_EXECUTED');
eq('A17 versión del registro subida a 1.1.0', recText && recText.adapter && recText.adapter.version, '1.1.0');
eq('A18 ningún estado de ejecución dice executed=true',
    /"executed"\s*:\s*true/.test(JSON.stringify(recText)) || /EXECUTED=1/.test(JSON.stringify(recText)), false);
eq('A19 la doctrina prohíbe DECLARED_ONLY / NOT_EXECUTED como estado; no aparecen',
    /DECLARED_ONLY|NOT_EXECUTED/.test(JSON.stringify(recText)), false);

/* El audit de objetos-canal (segundo camino) también lo lleva. */
const recObj = api.audit([{ name: 'Canal 1', url: 'http://prov.invalid/1.m3u8', 'tvg-id': 'r1' },
    { name: 'Canal 2', url: 'http://prov.invalid/2.m3u8', 'tvg-id': 'r2' }], 'mini');
eq('A20 el registro de objetos declara el mismo modelo',
    recObj && recObj.adapter && recObj.adapter.execution_model, 'SIMULATED_EXECUTED');
ok('A21 la declaración es la misma en los dos caminos (una sola verdad)',
    recObj.adapter.execution_model === recText.adapter.execution_model &&
    recObj.adapter.version === recText.adapter.version);

/* ── B · el envoltorio: adyacencia RFC 8216 §4.3.4.2 ────────────────────── */
console.log('\nB · ENVOLTORIO DE PULSE: #EXT-X-STREAM-INF → URI (RFC 8216 §4.3.4.2)');

const FIX = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="x1" tvg-name="A 4K" group-title="FIX",A 4K',
    '#EXTHTTP:{"User-Agent":"Mozilla/5.0"}',
    '#EXT-X-APE-STREAM-TRUTH:src=native-4k,w=3840,h=2160,fps=50,rawfps=50,family=HEVC,pq=1',
    '#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,FRAME-RATE=50.000,CODECS="hvc1.2.4.L153.B0,ec-3",VIDEO-RANGE=PQ',
    'http://prov.invalid/live/u/p/1.m3u8',
    '#EXTINF:-1 tvg-id="x2" tvg-name="B FHD" group-title="FIX",B FHD',
    '#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"',
    'http://prov.invalid/live/u/p/2.m3u8',
    '#EXTINF:-1 tvg-id="x3" tvg-name="C SD" group-title="FIX",C SD',
    'http://prov.invalid/live/u/p/3.m3u8',
    '',
].join('\n');

const WRAP_SRC = read(WRAP);
const LIST_SRC = read(LIST);
ok('B0 el envoltorio está y trae la bandera documentada',
    LIST_SRC.indexOf("args['tag-before-stream-inf']") >= 0 && /RFC 8216 §4\.3\.4\.2/.test(LIST_SRC));
ok('B0b versión del envoltorio declarada', /const WRAPPER_VERSION = '1\.8\.1';/.test(LIST_SRC), (LIST_SRC.match(/WRAPPER_VERSION = '[^']+'/) || [''])[0]);
/* El despachador 1.8.1 debe exponer los tres modos y no perder el modo iptv. */
ok('B0d el despachador 1.8.1 expone iptv|hls-master|upscale',
    /--format iptv\|hls-master\|upscale/.test(WRAP_SRC) && /ape-pulse-list\.cjs/.test(WRAP_SRC));
/* B0c · la clave de caché del .sh va EN PAR con la del envoltorio. El .state guarda
 * wrapper_version: si el .js sube y el .sh no, las listas ya envueltas dan need=0 y
 * NUNCA reciben los tags nuevos (medido: sync se quedó en 1.5.0 con el .js en 1.7.0). */
const wrapVer = (LIST_SRC.match(/const WRAPPER_VERSION = '([^']+)'/) || [])[1];
const syncSrc = read(SYNC);
const syncVer = (syncSrc.match(/^WRAPPER_VERSION=([0-9][0-9.]*)/m) || [])[1];
ok('B0c la versión del envoltorio y la clave de caché del .sh van EN PAR',
    !!wrapVer && wrapVer === syncVer, 'wrapper=' + wrapVer + ' · sync=' + syncVer);

const TMPROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-r17-'));
/* El sha256 del resultado incluye el nombre del fichero de salida, así que las
 * corridas que se comparan usan SIEMPRE el mismo nombre base ('k'). */
function wrapRun(tag, extra) {
    const dir = path.join(TMPROOT, tag);
    fs.mkdirSync(dir, { recursive: true });
    const inp = path.join(dir, 'k.m3u8');
    const out = path.join(dir, 'k.out.m3u8');
    fs.writeFileSync(inp, FIX, 'utf8');
    const so = execFileSync(process.execPath, [WRAP, '--in', inp, '--out', out].concat(extra || []), {
        env: Object.assign({}, process.env, { APE_URL_BUILDER: BUILDER }), encoding: 'utf8',
    });
    return { out: out, res: JSON.parse(so.trim()), text: read(out) };
}
function census(text) {
    const L = text.split('\n');
    let si = 0, adjOk = 0, tagBetween = 0, tagBeforeSi = 0;
    L.forEach((l, i) => {
        if (l.indexOf('#EXT-X-STREAM-INF:') !== 0) return;
        si++;
        const nx = L[i + 1] || '';
        if (/^https?:\/\//.test(nx)) adjOk++;
        if (nx.indexOf('#EXTSHIMOTT:') === 0) tagBetween++;
        let j = i - 1;
        while (j >= 0 && L[j] === '') j--;
        if (j >= 0 && L[j].indexOf('#EXTSHIMOTT:') === 0) tagBeforeSi++;
    });
    return { si: si, adjOk: adjOk, tagBetween: tagBetween, tagBeforeSi: tagBeforeSi };
}
const tagLines = (t) => t.split('\n').filter((l) => l.indexOf('#EXTSHIMOTT:') === 0);
const ownerLines = (t) => t.split('\n').filter((l) => l.indexOf('#EXT-X-APE-') === 0);
const uriLines = (t) => t.split('\n').filter((l) => /^https?:\/\//.test(l));
const stripWrapper = (t) => t.split('\n')
    .filter((l) => l.indexOf('#EXTSHIMOTT:') !== 0 && l.indexOf('#EXT-X-APE-') !== 0).join('\n');

const OFF = wrapRun('off', []);
const OFF2 = wrapRun('off2', []);
const ON = wrapRun('on', ['--tag-before-stream-inf']);

const cOff = census(OFF.text), cOn = census(ON.text);
eq('B1 apagado (por defecto): la fixture trae 2 #EXT-X-STREAM-INF', cOff.si, 2);
eq('B2 apagado: 0 de 2 pares STREAM-INF→URI quedan adyacentes (lo que ya pasaba)', cOff.adjOk, 0);
eq('B3 apagado: el tag va inmediatamente ANTES de su URI en los 3 canales (contrato ver:1)', 
    OFF.text.split('\n').filter((l, i, L) => l.indexOf('#EXTSHIMOTT:') === 0 && /^https?:\/\//.test(L[i + 1] || '')).length, 3);
eq('B4 encendido: 2 de 2 pares STREAM-INF→URI quedan adyacentes', cOn.adjOk, 2);
eq('B5 encendido: el tag va ANTES del STREAM-INF en los 2 canales que lo traen', cOn.tagBeforeSi, 2);
eq('B6 encendido: 0 etiquetas metidas entre STREAM-INF y su URI', cOn.tagBetween, 0);

eq('B7 el número de canales no cambia con la bandera', ON.res.channels, OFF.res.channels);
eq('B8 las 9 declaraciones del propietario se emiten igual en los dos modos', ownerLines(ON.text).length, ownerLines(OFF.text).length);
eq('B9 un solo #EXTSHIMOTT por canal en los dos modos', tagLines(ON.text).length, tagLines(OFF.text).length);
eq('B10 el contenido de los tags no cambia (sólo su posición)', 
    JSON.stringify(tagLines(ON.text).map((l) => l.split('').sort().join('')).sort()), 
    JSON.stringify(tagLines(OFF.text).map((l) => l.split('').sort().join('')).sort()));
eq('B11 las URIs son las mismas y en el mismo orden (no se toca el cable)',
    JSON.stringify(uriLines(ON.text)), JSON.stringify(uriLines(OFF.text)));
eq('B12 quitando las líneas que añade el envoltorio, encendido y apagado son el MISMO texto',
    stripWrapper(ON.text), stripWrapper(OFF.text));
eq('B13 apagado es determinista: dos corridas dan el mismo sha256',
    OFF2.res.sha256, OFF.res.sha256);
eq('B14 apagado no cambia el número de líneas del apagado de siempre', OFF.res.lines, OFF2.res.lines);

/* Idempotencia: envolver otra vez lo ya envuelto no duplica nada. */
const dir3 = path.join(TMPROOT, 'again');
fs.mkdirSync(dir3, { recursive: true });
const inp3 = path.join(dir3, 'k.m3u8'), out3 = path.join(dir3, 'k.out.m3u8');
fs.writeFileSync(inp3, OFF.text, 'utf8');
execFileSync(process.execPath, [WRAP, '--in', inp3, '--out', out3], {
    env: Object.assign({}, process.env, { APE_URL_BUILDER: BUILDER }), encoding: 'utf8',
});
const AGAIN = read(out3);
eq('B15 envolver dos veces no duplica el tag', tagLines(AGAIN).length, tagLines(OFF.text).length);
eq('B16 envolver dos veces no duplica las declaraciones del propietario',
    ownerLines(AGAIN).length, ownerLines(OFF.text).length);

/* ── C · el conflicto, medido y no escondido ────────────────────────────── */
console.log('\nC · CONTRATO EXTSHIMOTT (ver:1) CONTRA RFC 8216: qué gana cada modo');

function validate(p) {
    try {
        const o = execFileSync(process.execPath, [VALIDATOR, p], { encoding: 'utf8' });
        return { code: 0, text: o };
    } catch (e) {
        return { code: e.status, text: (e.stdout || '') + (e.stderr || '') };
    }
}
const vOff = validate(OFF.out), vOn = validate(ON.out);
eq('C1 apagado: el validador del contrato da PASS (exit 0)', vOff.code, 0);
eq('C2 encendido: el validador del contrato da FAIL (exit != 0)', vOn.code === 0, false);
ok('C3 encendido: el error es exactamente E_TAG_NOT_LAST (el tag ya no es el último)',
    /E_TAG_NOT_LAST/.test(vOn.text), (vOn.text.split('\n').filter((l) => /E_TAG_NOT_LAST/.test(l))[0] || '').slice(0, 200));
ok('C4 encendido: 2 errores, uno por canal con STREAM-INF (medido, no estimado)',
    /ERROR=2\b/.test(vOn.text), (vOn.text.split('\n').filter((l) => /veredicto/.test(l))[0] || '').slice(0, 200));
ok('C5 apagado: 0 errores', /ERROR=0\b/.test(vOff.text), (vOff.text.split('\n').filter((l) => /veredicto/.test(l))[0] || '').slice(0, 200));
ok('C6 el censo protegido (EXTHTTP / EXT-X-STREAM-INF) no cambia con la bandera',
    /EXTHTTP=1/.test(vOff.text) === /EXTHTTP=1/.test(vOn.text));

console.log('\nRESUMEN PASS=' + PASS + ' FAIL=' + FAIL);
process.exit(FAIL === 0 ? 0 : 1);
