#!/usr/bin/env node
'use strict';

// Production controller, panel, TypedArrays generator, finalizer, CDN rewrapper,
// line transformer and gzip interceptor. Only filesystem/browser boundaries are
// in-memory. Small explicit fixtures exercise dispatch, not playback quality.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const ROOT = path.resolve(__dirname, '../../..');
const FRONT = path.resolve(__dirname, '..');
const POLICY = require(path.join(FRONT, 'js/ape-v9/rea-processing-policy.js'));
const LAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/lab/APE_LAB_CANONICAL_BULLETPROOF.json'), 'utf8'));
const clone = x => JSON.parse(JSON.stringify(x));
const quiet = { log() {}, warn() {}, error() {}, debug() {}, info() {}, table() {}, group() {}, groupCollapsed() {}, groupEnd() {}, time() {}, timeEnd() {} };
let passed = 0;

function environment({ picker = false, gzip = false, format = 'm3u8', panelFormat = 'm3u8', jitBase, pickerError = null } = {}) {
    const downloads = [], fsTargets = [], store = new Map([
        ['ape_cdn_mode', 'allowlist'], ['ape_cdn_hosts', 'audit.invalid'], ['ape_cdn_base', 'https://relay.invalid']
    ]);
    const blobs = new Map();
    const channels = [
        { id: '1', name: 'Canal á uno', url: 'https://audit.invalid/live/u%2B/p%2F/1.m3u8?sig=a%2Bb%26c&x=1' },
        { id: '2', name: 'Canal dos', url: 'https://outside.invalid/live/u/p/2.ts?token=%2Fexact%3D' }
    ];
    const elements = {
        genExportFormat: { value: format }, gzipCompressionEnabled: { checked: gzip },
        'ape-out-jit': { checked: false }, 'ape-out-hdr': { value: 'auto' },
        'ape-delta-input': { value: '15' }, 'ape-gen-status': { textContent: '', style: {} }
    };
    class TestURL extends URL {
        static createObjectURL(blob) { const id = 'blob:dispatch-' + blobs.size; blobs.set(id, blob); return id; }
        static revokeObjectURL(id) { blobs.delete(id); }
    }
    class Anchor {
        click() { downloads.push({ filename: this.download, blob: blobs.get(this.href), managedGzip: this._gzipProcessing === true }); }
        remove() {}
    }
    const document = {
        readyState: 'loading', getElementById: id => elements[id] || null,
        querySelector: selector => selector.includes('ape-out-format') ? { value: panelFormat }
            : selector === '#ape-gen-status' ? elements['ape-gen-status'] : null,
        querySelectorAll: () => [], addEventListener() {},
        createElement: name => name === 'a' ? new Anchor() : { style: {}, appendChild() {}, addEventListener() {} },
        body: { appendChild() {}, removeChild() {} }
    };
    let networkRequests = 0;
    // [2026-11-21 · t21] Se capturan las trazas del generador: la decisión de declarar el plano
    // /cdn/ deja constancia del conteo REAL en el log (0 reescrituras → 'NO declarado'). Sin
    // captura, esa constancia no sería verificable.
    const logs = [];
    const capture = value => (typeof value === 'string' ? value : JSON.stringify(value));
    const ctx = {
        console: Object.assign({}, quiet, {
            log: (...args) => logs.push(args.map(capture).join(' ')),
            warn: (...args) => logs.push('WARN ' + args.map(capture).join(' '))
        }),
        document, HTMLAnchorElement: Anchor, URL: TestURL, URLSearchParams,
        TextEncoder, TextDecoder, ReadableStream, WritableStream, TransformStream, CompressionStream,
        Blob, Response, AbortController, performance,
        btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
        setTimeout: (fn, ms) => ms >= 1000 ? 0 : setTimeout(fn, ms), clearTimeout,
        setInterval: () => 0, clearInterval() {}, dispatchEvent() {}, addEventListener() {},
        CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; },
        localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) },
        fetch: async url => {
            if (String(url).startsWith('blob:')) return { blob: async () => blobs.get(url) };
            networkRequests++;
            return { ok: false, status: 503, json: async () => ({}) };
        },
        APE_REA_POLICY: POLICY,
        APE_PROFILES_CONFIG: { profiles: clone(LAB.profiles_calibrated), labExportedAt: LAB.exported_at,
            labVersion: LAB.lab_version, labBulletproof: true, reaProcessing: POLICY.policy },
        APEHealthRuntime: { admittedMap: new Map(channels.map(c => ['id:' + c.id, {}])), config: {}, ensureReady: async () => {} },
        app: { getFilteredChannels: () => channels, showToast() {}, state: {} },
        __APE_OUTPUT_TEST__: true,
        APE_JIT_BASE: jitBase,
        APE_DIRECT_MODE: true, APE_USE_JIT: false, APE_6K: false, APE_FAKE_UHD: false, APE_8K_DECLARE: false
    };
    ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
    ctx.APE_REA_EXPORT = require(path.join(FRONT, 'js/ape-v9/rea-export-finalizer.js'))(ctx);
    let pickerCalls = 0;
    if (picker) ctx.showSaveFilePicker = async options => {
        pickerCalls++;
        if (pickerError) { const e = new Error('Picker fixture'); e.name = pickerError; throw e; }
        const saved = { filename: options.suggestedName, types: options.types, chunks: [], aborted: false, closed: false };
        fsTargets.push(saved);
        return { name: options.suggestedName, createWritable: async () => new WritableStream({
            write(chunk) { saved.chunks.push(Buffer.from(chunk)); },
            close() { saved.closed = true; }, abort() { saved.aborted = true; }
        }) };
    };
    vm.createContext(ctx);
    function load(relative) { vm.runInContext(fs.readFileSync(path.join(FRONT, relative), 'utf8'), ctx, { filename: relative }); }
    load('js/ape-v9/rea-catalog-export.js');
    load('js/ape-v9/m3u8-typed-arrays-ultimate.js');
    load('js/ape-cdn-rewrap.js');
    load('js/ape-line-transform.js');
    load('js/ape-v9/m3u8-gzip-module.js');
    let generationCalls = 0;
    const originalStream = ctx.M3U8TypedArraysGenerator.generateStream;
    ctx.M3U8TypedArraysGenerator.generateStream = function (...args) { generationCalls++; return originalStream(...args); };
    load('js/ape-v9/generation-controller.js');
    load('js/ape-v9/generation-output-panel.js');
    return { ctx, channels, downloads, fsTargets, elements, load,
        get generationCalls() { return generationCalls; }, get pickerCalls() { return pickerCalls; },
        get networkRequests() { return networkRequests; }, logs };
}

async function fileBytes(env) {
    const files = env.fsTargets.filter(f => f.closed).map(f => ({ filename: f.filename, bytes: Buffer.concat(f.chunks), destination: 'fs' }));
    for (const saved of env.downloads) files.push({ filename: saved.filename, bytes: Buffer.from(await saved.blob.arrayBuffer()), destination: 'blob', managedGzip: saved.managedGzip });
    return files;
}

function textOf(file) {
    return (file.filename.endsWith('.gz') ? zlib.gunzipSync(file.bytes) : file.bytes).toString('utf8');
}

// ── CABLEADO POR EL VPS (/pulse/) ────────────────────────────────────────────────────────────
// El generador envuelve cada canal para que el vídeo pase por el VPS
// (m3u8-typed-arrays-ultimate.js, _apePulseWrap): la URI emitida ya NO es la del proveedor,
// es <base>/pulse/<id>.m3u8?u=<url origen urlencoded>&d=<dev>. Por eso la aserción de origen
// se TRASLADA al parámetro u=, que debe decodificar byte-idéntico a la URI fuente —auth,
// escapes y orden de query incluidos—. No se relaja ninguna aserción: se comprueba en el
// sitio donde ahora vive el dato.
const PULSE_BASE = 'https://iptv-ape.duckdns.org';

// Canal que el envoltorio NO puede cablear: no hay id numérico en la URL, así que
// _apePulseWrap devuelve la línea tal cual (m3u8-typed-arrays-ultimate.js). Es exactamente el
// caso que el rótulo del panel declara como "queda directo" (t16, hallazgo t8).
const noIdChannel = [{
    id: 'sin-id', name: 'Sin id',
    url: 'https://audit.invalid/live/u/p/stream.m3u8?sig=a%2Bb'
}];

// Sustituye el catálogo del arnés por uno propio (admisión incluida, que el controller
// consulta al arrancar) para medir un canal distinto sin tocar los fixtures compartidos.
function withChannels(env, channels) {
    env.ctx.app.getFilteredChannels = () => channels;
    env.ctx.APEHealthRuntime.admittedMap = new Map(channels.map(c => ['id:' + c.id, {}]));
    return env;
}

// Decodifica un parámetro de query SIN la conversión '+' → espacio de URLSearchParams:
// aquí '+' es un byte literal de la query del proveedor, no un espacio.
function queryParam(uri, name) {
    const match = uri.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

// ── ATRIBUTOS NATIVOS DECLARADOS SIN PROBE · se verifica la FORMA, no la capacidad ──────────
// [2026-11-21] La DECISIÓN DEL PROPIETARIO del 2026-11-21
// (docs/policies/OWNER_DECISION_2026-11-21_NATIVE_TARGET_ATTRIBUTES_WITHOUT_PROBE.md)
// AUTORIZA declarar CODECS / RESOLUTION / FRAME-RATE / VIDEO-RANGE de OBJETIVO aunque no haya
// probe: la lista declara el objetivo de reconstrucción, no una fuente medida. Por eso este
// guard YA NO VETA la presencia de #EXT-X-STREAM-INF (antes exigía 0 ocurrencias, y con el
// generador actual estaba rojo: emite una variante por canal). Lo que sigue verificándose es
// la FORMA de lo declarado —la decisión quita la exigencia de probe, NO la de formato— y NO
// se añade aquí ningún guard de CAPACIDAD: la Ley Cardinal 1 (nivel incapaz de la resolución
// declarada) sigue vigente y se decide aparte (decisión del 2026-11-15 §3 B-2 y §4 del
// documento del 2026-11-21).
const CODEC_RFC6381 = /^(avc1\.[0-9a-fA-F]{6}|(hvc1|hev1|dvh1|dvhe)\.[0-9A-Fa-f]+\.[0-9A-Fa-f]+(?:\.[0-9A-Za-z]+)*|av01\.[0-9]+\.[0-9]+[MH]\.[0-9]+|mp4a\.40\.(?:2|5|29)|ac-3|ec-3|opus|vp09\.[0-9]+\.[0-9]+\.[0-9]+)$/;
const VIDEO_CODEC_FAMILY = /^(avc1|hvc1|hev1|dvh1|dvhe|av01|vp09)\./;
const VIDEO_RANGES = new Set(['SDR', 'PQ', 'HLG']);

// Lista de atributos de un STREAM-INF: separa por comas RESPETANDO comillas (CODECS lleva una
// coma dentro del valor: CODECS="hvc1…,mp4a…"). Devuelve nombre -> valor sin comillas.
function parseStreamInfAttributes(body) {
    const attrs = Object.create(null);
    let current = '';
    let inQuotes = false;
    const push = () => {
        const raw = current.trim();
        current = '';
        if (!raw) return;
        const eq = raw.indexOf('=');
        assert.ok(eq > 0, 'atributo declarado con forma NOMBRE=valor · ' + JSON.stringify(raw));
        const name = raw.slice(0, eq).trim();
        let value = raw.slice(eq + 1).trim();
        if (value.length > 1 && value[0] === '"' && value[value.length - 1] === '"') value = value.slice(1, -1);
        assert.equal(attrs[name], undefined, 'atributo duplicado en un mismo STREAM-INF: ' + name);
        attrs[name] = value;
    };
    for (const character of body) {
        if (character === '"') inQuotes = !inQuotes;
        if (character === ',' && !inQuotes) { push(); continue; }
        current += character;
    }
    push();
    return attrs;
}

// Forma de UNA variante declarada sin probe. NO comprueba capacidad (nivel ↔ resolución/fps).
function assertDeclaredVariantForm(variant) {
    const attrs = parseStreamInfAttributes(variant);
    for (const required of ['BANDWIDTH', 'CODECS', 'RESOLUTION']) {
        assert.ok(attrs[required] !== undefined, 'atributo obligatorio declarado: ' + required + ' · ' + variant);
    }
    assert.ok(/^\d+$/.test(attrs.BANDWIDTH) && Number(attrs.BANDWIDTH) > 0,
        'BANDWIDTH entero > 0 · ' + attrs.BANDWIDTH);
    if (attrs['AVERAGE-BANDWIDTH'] !== undefined) {
        assert.ok(/^\d+$/.test(attrs['AVERAGE-BANDWIDTH']) && Number(attrs['AVERAGE-BANDWIDTH']) > 0,
            'AVERAGE-BANDWIDTH entero > 0 · ' + attrs['AVERAGE-BANDWIDTH']);
        assert.ok(Number(attrs['AVERAGE-BANDWIDTH']) <= Number(attrs.BANDWIDTH),
            'coherencia: AVERAGE-BANDWIDTH no supera BANDWIDTH · ' + variant);
    }
    const codecs = attrs.CODECS.split(',').map(codec => codec.trim()).filter(Boolean);
    assert.ok(codecs.length > 0, 'CODECS con al menos una entrada · ' + attrs.CODECS);
    for (const codec of codecs) {
        assert.ok(CODEC_RFC6381.test(codec), 'codec string con forma RFC 6381 · ' + codec + ' · ' + variant);
    }
    assert.equal(codecs.filter(codec => VIDEO_CODEC_FAMILY.test(codec)).length, 1,
        'exactamente un codec de vídeo declarado por variante · ' + attrs.CODECS);
    assert.ok(/^\d{2,5}x\d{2,5}$/.test(attrs.RESOLUTION), 'RESOLUTION parseable WxH · ' + attrs.RESOLUTION);
    const [width, height] = attrs.RESOLUTION.split('x').map(Number);
    assert.ok(width > 0 && height > 0, 'RESOLUTION con dimensiones > 0 · ' + attrs.RESOLUTION);
    if (attrs['FRAME-RATE'] !== undefined) {
        assert.ok(/^\d+(?:\.\d+)?$/.test(attrs['FRAME-RATE']) && Number(attrs['FRAME-RATE']) > 0,
            'FRAME-RATE numérico > 0 · ' + attrs['FRAME-RATE']);
    }
    if (attrs['VIDEO-RANGE'] !== undefined) {
        assert.ok(VIDEO_RANGES.has(attrs['VIDEO-RANGE']), 'VIDEO-RANGE en {SDR,PQ,HLG} · ' + attrs['VIDEO-RANGE']);
    }
    return attrs;
}

function checkPlaylist(text, channels, cdn) {
    const uris = text.split(/\r?\n/).filter(line => /^https?:\/\//.test(line));
    assert.equal((text.match(/^#EXTINF:/gm) || []).length, channels.length, 'channel count');
    assert.equal(uris.length, channels.length, 'one URI per channel');
    for (let i = 0; i < channels.length; i++) {
        // Includes pipe headers if the real generator appends them.
        const emitted = uris[i].split('|')[0];
        // 1) La URI emitida es la envuelta del VPS, y con el id de ESTE canal (no otro).
        const prefix = PULSE_BASE + '/pulse/' + String(channels[i].id) + '.m3u8?';
        assert.ok(emitted.startsWith(prefix), 'emitted URI is the VPS pulse wrapper of this channel: ' + emitted);
        // 2) La aserción de origen, trasladada a u=: byte-idéntica a la URI FUENTE.
        //    Medido: es la misma en _DIRECTA y en _CDN. El rewrap CDN no aparece dentro de u=
        //    porque el envoltorio /pulse/ sustituye la línea antes y su host no está en
        //    ape_cdn_hosts; si apareciera, el VPS proxearía al relay (doble salto) en vez de
        //    al proveedor. Por eso u= se exige SIEMPRE contra la URL del proveedor.
        const u = queryParam(emitted, 'u');
        if (cdn) {
            assert.equal(u, channels[i].url,
                'CDN file keeps the pristine source inside u= · emitted: ' + emitted);
        } else {
            assert.equal(u, channels[i].url,
                'u= decodes byte-identical to the source/auth URI · emitted: ' + emitted);
        }
        // 3) d= (payload del device) presente: sin él pulse.php responde 400 "falta u".
        assert.ok(queryParam(emitted, 'd'), 'd= device payload present: ' + emitted);
    }
    assert.equal((text.match(/^#EXT-X-APE-REA:/gm) || []).length, channels.length, 'REA request on every channel');
    // 4) ATRIBUTOS NATIVOS DE OBJETIVO SIN PROBE (decisión del propietario, 2026-11-21 —
    //    docs/policies/OWNER_DECISION_2026-11-21_NATIVE_TARGET_ATTRIBUTES_WITHOUT_PROBE.md).
    //    Declarar CODECS/RESOLUTION/FRAME-RATE/VIDEO-RANGE de objetivo sin probe está
    //    AUTORIZADO: una variante declarada por canal, y cada una con forma válida. Lo que NO
    //    se acepta es una declaración mal formada ni una fuente falsa ni un nivel incapaz
    //    (Ley Cardinal 1: capacidad, no se evalúa en esta tarea).
    const declaredVariants = [...text.matchAll(/^#EXT-X-STREAM-INF:(.*)$/gm)].map(match => match[1]);
    assert.equal(declaredVariants.length, channels.length,
        'una variante declarada por canal (single URL per channel) · ' + declaredVariants.length + ' vs ' + channels.length);
    for (const variant of declaredVariants) assertDeclaredVariantForm(variant);
}

async function test(label, body) { await body(); passed++; console.log('PASS ' + label); }

async function main() {
    // ── HECHOS DEL CABLEADO Y DEL PLANO CDN (t16 · hallazgos t8) ───────────────────────────
    // [2026-11-21] Estos dos casos van ANTES de la matriz de despacho a propósito: la matriz
    // queda bloqueada por la aserción PREEXISTENTE de '#EXT-X-STREAM-INF:' (el generador emite
    // STREAM-INF y este arnés no relaja esa aserción), así que lo que se ponga DESPUÉS nunca se
    // ejecutaría. Aquí se ejecutan y se miden de verdad.
    await test('una URL sin id numérico NO se envuelve: el cableado es por canal, no por lista', async () => {
        // Es el límite que el rótulo del panel declara en vez de afirmar "la lista pasa por el
        // VPS" como hecho: solicitar APE_PULSE_WRAP=true NO garantiza que cada canal se cablee.
        const env = withChannels(environment(), noIdChannel);
        env.ctx.APE_PULSE_WRAP = true;   // cableado SOLICITADO, igual que hace el panel
        await env.ctx.APEGenerationController.prepublishAndGenerateDirect({ filename: 'noid', hud: false });
        const text = textOf((await fileBytes(env))[0]);
        const uris = text.split(/\r?\n/).filter(line => /^https?:\/\//.test(line));
        assert.equal(uris.length, 1, 'one URI per channel');
        assert.equal(uris[0].split('|')[0], noIdChannel[0].url,
            'sin id numérico la línea sale tal cual al proveedor (auth y query intactos)');
        assert.ok(!text.includes('/pulse/'), 'ninguna línea /pulse/ cuando el canal no tiene id numérico');
    });

    await test('_CDN NO declara el plano /cdn/ cuando no reescribió ninguna URL (decisión del operador 2026-11-21)', async () => {
        // [2026-11-21 · t21] El propietario decidió la OPCIÓN B: dejar de DECLARAR el plano /cdn/
        // cuando no se ejerció. Misma clase de defecto que t1/t4/t16 (afirmar un hecho que no
        // consta). Fundamento medido en t15/t18: los marcadores no tienen consumidor (0 en
        // PHP/Lua) y en el catálogo entregado el plano no reescribe ninguna URL.
        // Este caso ANTES exigía lo contrario ('declara el plano aunque no reescriba'); ahora
        // exige su AUSENCIA, con el conteo REAL (stats.wrapped) visible en el log del generador.
        const env = environment();
        await env.ctx.APEGenerationController.prepublishAndGenerateDual({ dual: 'cdn', filename: 'cdnplane', hud: false });
        const cdnFile = (await fileBytes(env)).find(f => f.filename.indexOf('_CDN') >= 0);
        assert.ok(cdnFile, 'la salida CDN se entregó');
        const text = textOf(cdnFile);
        const uris = text.split(/\r?\n/).filter(line => /^https?:\/\//.test(line));
        assert.equal(uris.length, env.channels.length, 'one URI per channel');
        for (const uri of uris) {
            assert.ok(uri.startsWith(PULSE_BASE + '/pulse/'), 'la URL emitida es la envuelta: ' + uri);
            // [HÍBRIDO APE CRYSTAL v9.4] El generador principal debe pedir el
            // cartucho P1.5 con p=P1 para toda fuente <8K (owner override).
            assert.ok(/[?&]p=P1(?:&|$)/.test(uri),
                'la URL /pulse/ lleva p=P1 del híbrido: ' + uri);
        }
        assert.equal((text.match(/#EXT-X-APE-HYBRID-PULSE:ROUTE=max;/g) || []).length,
            env.channels.length, 'un tag híbrido ROUTE=max por canal');
        assert.ok(text.includes('CARTRIDGE=P1.5'), 'el tag declara el cartucho P1.5');
        assert.ok(text.includes('MODE=SIMULATED'), 'el tag declara salida simulada');
        assert.ok(text.includes('EXECUTED=0'), 'el tag no afirma ejecución');
        const rewritten = uris.filter(uri => uri.indexOf('relay.invalid/cdn/') >= 0).length;
        assert.equal(rewritten, 0, 'NINGUNA línea de URL pasa por el plano /cdn/: ' + JSON.stringify(uris));
        assert.ok(!text.includes('#EXT-X-APE-CDN-PLANE'),
            'con 0 reescrituras NO se declara el plano · _CDN empieza: ' + text.slice(0, 300));
        assert.ok(!text.includes('#EXT-X-APE-CDN-BASE'), 'ni su base');
        assert.ok(env.logs.some(line => line.indexOf('"plano_cdn":"NO declarado (0 URLs reescritas)"') >= 0),
            'el conteo 0 queda visible en el log del generador · últimas trazas: ' +
            JSON.stringify(env.logs.slice(-2)));
        assert.ok(env.logs.some(line => line.indexOf('"cableadas":0') >= 0), 'y el conteo real dice 0');
        // Complemento, para que el cambio sea CONDICIONAL y no un borrado: con un canal que el
        // envoltorio no puede cablear, el plano SÍ reescribe y los marcadores vuelven a emitirse.
        const envNoId = withChannels(environment(), noIdChannel);
        envNoId.ctx.APE_PULSE_WRAP = true;
        await envNoId.ctx.APEGenerationController.prepublishAndGenerateDual({ dual: 'cdn', filename: 'cdnplane2', hud: false });
        const cdnNoId = (await fileBytes(envNoId)).find(f => f.filename.indexOf('_CDN') >= 0);
        const textNoId = textOf(cdnNoId);
        const urisNoId = textNoId.split(/\r?\n/).filter(line => /^https?:\/\//.test(line));
        assert.equal(urisNoId.length, 1, 'one URI per channel');
        assert.ok(urisNoId[0].indexOf('relay.invalid/cdn/') >= 0,
            'un canal sin id numérico SÍ lo reescribe el plano CDN: ' + urisNoId[0]);
        assert.ok(urisNoId[0].indexOf(noIdChannel[0].url.replace(/^https?:\/\//, '')) >= 0,
            'y conserva host, ruta y credenciales del origen: ' + urisNoId[0]);
        assert.ok(textNoId.includes('#EXT-X-APE-CDN-PLANE:v4'),
            'con 1 reescritura el marcador del plano vuelve a estar, igual que hoy');
        assert.ok(textNoId.includes('#EXT-X-APE-CDN-BASE:'), 'con su base');
        assert.ok(envNoId.logs.some(line => line.indexOf('"plano_cdn":"DECLARADO"') >= 0),
            'y el log lo declara · últimas trazas: ' + JSON.stringify(envNoId.logs.slice(-2)));
        assert.ok(envNoId.logs.some(line => line.indexOf('"cableadas":1') >= 0), 'con el conteo real 1');
    });

    for (const picker of [false, true]) for (const gzip of [false, true]) for (const mode of ['direct', 'cdn', 'both']) {
        await test(mode + ' / ' + (picker ? 'FSAA' : 'Blob') + ' / gzip=' + gzip, async () => {
            const env = environment({ picker, gzip });
            const opts = { filename: 'dispatch.m3u8', hud: false };
            const result = mode === 'direct'
                ? await env.ctx.APEGenerationController.prepublishAndGenerateDirect(opts)
                : await env.ctx.APEGenerationController.prepublishAndGenerateDual({ ...opts, dual: mode });
            assert.equal(result.decision, 'generated_no_audit');
            // [2026-11-21 · t21] cdn/both hacen DOS pasadas por diseño: la de conteo (sólo lectura,
            // para decidir si el plano /cdn/ se declara) y la de escritura. direct sigue en 1.
            assert.equal(env.generationCalls, mode === 'direct' ? 1 : 2,
                'una generación para escritura (+ una de conteo en cdn/both)');
            const files = await fileBytes(env);
            assert.equal(files.length, mode === 'both' ? 2 : 1, 'actual delivered file count');
            for (const file of files) {
                assert.equal(file.destination, picker ? 'fs' : 'blob');
                assert.equal(file.filename.endsWith('.gz'), gzip);
                if (gzip) assert.ok(file.bytes[0] === 0x1f && file.bytes[1] === 0x8b, 'real gzip bytes');
                if (!picker) assert.equal(file.managedGzip, true, 'legacy interceptor does not recompress');
                checkPlaylist(textOf(file), env.channels, file.filename.includes('_CDN'));
            }
        });
    }

    await test('M3U Plus selector reaches both names and real UTF-8 playlist bytes', async () => {
        const env = environment({ format: 'm3u_plus', gzip: true });
        await env.ctx.APEGenerationController.prepublishAndGenerateDual({ dual: 'both', filename: 'plus', hud: false });
        const files = await fileBytes(env);
        assert.equal(files.length, 2);
        for (const file of files) {
            assert.ok(file.filename.endsWith('.m3u.gz'));
            checkPlaylist(textOf(file), env.channels, file.filename.includes('_CDN'));
            assert.ok(textOf(file).includes('Canal á uno'));
        }
    });

    await test('missing user activation preserves CDN through Blob fallback', async () => {
        const env = environment({ picker: true, pickerError: 'NotAllowedError' });
        const result = await env.ctx.APEGenerationController.prepublishAndGenerateDual({ filename: 'fallback', hud: false });
        assert.equal(result.downloadResult.mode, 'CDN_ONLY');
        const files = await fileBytes(env);
        assert.equal(files.length, 1);
        assert.ok(files[0].filename.includes('_CDN'));
        checkPlaylist(textOf(files[0]), env.channels, true);
    });

    await test('picker cancellation does not start a producer or download a fallback', async () => {
        const env = environment({ picker: true, pickerError: 'AbortError' });
        const result = await env.ctx.APEGenerationController.prepublishAndGenerateDual({ dual: 'both' });
        assert.equal(result.decision, 'cancelled_by_user');
        assert.equal(env.generationCalls, 0);
        assert.equal(env.downloads.length, 0);
    });

    await test('explicit gzip:false is respected even if the legacy checkbox is checked', async () => {
        const env = environment({ gzip: true });
        await env.ctx.APEGenerationController.prepublishAndGenerateDirect({ gzip: false, filename: 'plain', hud: false });
        const files = await fileBytes(env);
        assert.equal(files.length, 1);
        assert.ok(files[0].filename.endsWith('.m3u8'));
        assert.ok(files[0].bytes.toString('utf8').startsWith('#EXTM3U'));
    });

    await test('panel AMBAS calls the real dual dispatch and delivers two files', async () => {
        const env = environment();
        await env.ctx.APE_OUTPUT_TEST_HOOKS.runBoth();
        const files = await fileBytes(env);
        assert.equal(files.length, 2);
        // [2026-11-21 · t21] AMBAS = dual: conteo + escritura.
        assert.equal(env.generationCalls, 2);
        assert.ok(files.some(f => f.filename.includes('_DIRECTA')));
        assert.ok(files.some(f => f.filename.includes('_CDN')));
    });

    await test('JSON selector dispatches to metadata exporter without M3U picker/producer/audit', async () => {
        const env = environment({ picker: true, format: 'json', gzip: true });
        let request;
        env.ctx.APE_REA_CATALOG = { downloadJSON: async (channels, options) => {
            request = { channels, options };
            return { format: 'json', filename: options.filename + '.gz', count: channels.length, written: true, transportApplied: false };
        } };
        const result = await env.ctx.APEGenerationController.prepublishAndGenerateDual({ dual: 'both', filename: 'catalog' });
        assert.equal(result.decision, 'generated_metadata');
        assert.equal(env.pickerCalls, 0);
        assert.equal(env.generationCalls, 0);
        assert.equal(request.options.dual, 'both');
        assert.equal(request.options.gzip, true);
        assert.equal(request.options.filename, 'catalog.json');
        assert.equal(request.channels, env.channels);
        assert.ok(result.notice.includes('conserva las URL de origen'));
    });

    for (const picker of [false, true]) for (const gzip of [false, true]) {
        await test('real JSON metadata / ' + (picker ? 'FSAA' : 'Blob') + ' / gzip=' + gzip, async () => {
            const env = environment({ picker, gzip, format: 'json' });
            const requestsBeforeExport = env.networkRequests;
            await env.ctx.APE_OUTPUT_TEST_HOOKS.runBoth();
            const files = await fileBytes(env);
            assert.equal(files.length, 1, 'metadata is one catalog, not two misleading playlists');
            assert.equal(env.generationCalls, 0);
            assert.equal(env.networkRequests, requestsBeforeExport, 'no admission/audit/JIT/config POST for metadata JSON');
            assert.ok(files[0].filename.endsWith(gzip ? '.json.gz' : '.json'));
            const catalog = JSON.parse(textOf(files[0]));
            assert.equal(catalog.schema, 'ape.rea-catalog/1');
            assert.equal(catalog.channelCount, env.channels.length);
            assert.equal(catalog.requestedDelivery, 'both');
            assert.equal(catalog.transportApplied, false);
            for (let i = 0; i < env.channels.length; i++) assert.equal(catalog.channels[i].url, env.channels[i].url);
            assert.ok(env.elements['ape-gen-status'].textContent.includes('conserva las URL de origen'));
        });
    }

    await test('CDN request cannot silently fall back to direct-only legacy generator', async () => {
        const env = environment();
        env.ctx.M3U8TypedArraysGenerator.generateStream = undefined;
        await assert.rejects(env.ctx.APEGenerationController.prepublishAndGenerate({ dual: 'cdn' }), /requiere generateStream/);
        assert.equal(env.downloads.length, 0);
    });

    await test('direct metadata scan survives new writer and validator cannot remove a channel', async () => {
        const env = environment();
        let scans = 0;
        env.ctx.apeScanMetadataCluster = async () => { scans++; };
        env.ctx.GENERATION_VALIDATOR_V9 = { validateAndTranslate: channels => ({ valid: true, cleanChannels: channels.slice(0, 1) }) };
        await env.ctx.APEGenerationController.prepublishAndGenerateDirect({ filename: 'coverage', hud: false });
        assert.equal(scans, 1);
        const files = await fileBytes(env);
        checkPlaylist(textOf(files[0]), env.channels, false);
    });

    await test('direct schema translation cannot normalize a supplied signed URL', async () => {
        const env = environment();
        env.ctx.GENERATION_VALIDATOR_V9 = { validateAndTranslate: channels => ({ valid: true,
            cleanChannels: channels.map(channel => ({ ...channel, url: channel.url.replace('%2B', '+') })) }) };
        await env.ctx.APEGenerationController.prepublishAndGenerateDirect({ filename: 'opaque', hud: false, skipMetaScan: true });
        const files = await fileBytes(env);
        checkPlaylist(textOf(files[0]), env.channels, false);
    });

    const mpdFixture = '<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" minimumUpdatePeriod="PT2S"><Period><AdaptationSet><Representation id="0"><SegmentTemplate initialization="init-$RepresentationID$.m4s" media="chunk-$Number$.m4s"><SegmentTimeline><S t="0" d="2000" r="2"/></SegmentTimeline></SegmentTemplate></Representation></AdaptationSet></Period></MPD>';
    const signedDash = 'https://jit.invalid/jit/live/a/manifest.mpd?sig=%2b%2B+%2F&token=x%3D&token=y#v';
    function serveJit(env, active, { catalogUrl = 'https://jit.invalid/jit/catalog.json', mpd = mpdFixture, mpdStatus = 200 } = {}) {
        const requests = [];
        env.ctx.fetch = async url => {
            requests.push(String(url));
            return requests.length === 1
                ? { ok: true, url: catalogUrl, json: async () => ({ channels: active ? [active] : [] }) }
                : { ok: mpdStatus === 200, status: mpdStatus, text: async () => mpd };
        };
        return requests;
    }
    for (const action of ['runDirect', 'runVps', 'runBoth']) {
        await test('DASH ' + action + ' exports one served MPD URL with exact authorization bytes', async () => {
            const env = environment({ panelFormat: 'mpd', gzip: true, jitBase: 'https://jit.invalid/' });
            const requests = serveJit(env, { id: 'a', name: 'Canal á', active: true, dash: signedDash });
            await env.ctx.APE_OUTPUT_TEST_HOOKS[action]();
            const files = await fileBytes(env);
            assert.deepEqual(requests, ['https://jit.invalid/jit/catalog.json', signedDash]);
            assert.equal(files.length, 1);
            assert.equal(files[0].filename, 'APE_a_DASH.m3u');
            assert.equal(textOf(files[0]), '#EXTM3U\n#EXTINF:-1,Canal á · DASH JIT\n' + signedDash + '\n');
            assert.equal(env.generationCalls, 0, 'no multichannel catalog producer');
            assert.ok(env.elements['ape-gen-status'].textContent.includes('MPD servido'));
        });
    }
    await test('MPD diagnostic snapshot remains byte-identical and explicitly labelled', async () => {
        const env = environment();
        const requests = serveJit(env, { id: 'a', active: true, dash: signedDash });
        await env.ctx.APE_OUTPUT_TEST_HOOKS.downloadActiveJitMpd(true);
        const files = await fileBytes(env);
        assert.equal(files.length, 1);
        assert.equal(files[0].filename, 'APE_a_diagnostic_snapshot.mpd');
        assert.equal(textOf(files[0]), mpdFixture, 'relative references, timeline and dynamic refresh remain original');
        assert.equal(requests[1], signedDash);
        assert.ok(env.elements['ape-gen-status'].textContent.includes('instantánea'));
    });
    await test('relative MPD resolves against catalog response without query/auth loss', async () => {
        const env = environment();
        const relative = 'live/a/manifest.mpd?sig=%2B+&token=1&token=2';
        const expected = 'https://jit.invalid/redirected/live/a/manifest.mpd?sig=%2B+&token=1&token=2';
        const requests = serveJit(env, { id: 'a', active: true, dash: relative }, { catalogUrl: 'https://jit.invalid/redirected/catalog.json' });
        await env.ctx.APE_OUTPUT_TEST_HOOKS.downloadActiveJitMpd();
        assert.equal(requests[1], expected);
        assert.ok(textOf((await fileBytes(env))[0]).endsWith(expected + '\n'));
    });
    await test('missing dash URL uses configured JIT host and encoded channel ID', async () => {
        const env = environment({ jitBase: 'https://configured.invalid' });
        const requests = serveJit(env, { id: 'a/b', active: true });
        await env.ctx.APE_OUTPUT_TEST_HOOKS.downloadActiveJitMpd();
        assert.equal(requests[1], 'https://configured.invalid/jit/live/a%2Fb/manifest.mpd');
    });
    for (const [label, active, response, error] of [
        ['no active channel', null, {}, /no hay canal JIT activo/],
        ['unsafe scheme', { id: 'a', active: true, dash: 'javascript:alert(1)' }, {}, /HTTP\(S\)/],
        ['line injection', { id: 'a', active: true, dash: signedDash + '\nhttps://other.invalid' }, {}, /URL DASH inválida/],
        ['upstream HTTP error', { id: 'a', active: true, dash: signedDash }, { mpdStatus: 503 }, /MPD HTTP 503/],
        ['non-MPD response', { id: 'a', active: true, dash: signedDash }, { mpd: '<html>unavailable</html>' }, /MPD válido/]
    ]) {
        await test('DASH refuses download on ' + label, async () => {
            const env = environment();
            serveJit(env, active, response);
            await assert.rejects(env.ctx.APE_OUTPUT_TEST_HOOKS.downloadActiveJitMpd(), error);
            assert.equal(env.downloads.length, 0);
        });
    }

    await test('APE_PULSE_WRAP=false desactiva el envoltorio y devuelve la URI del proveedor', async () => {
        // [2026-11-21 · t6] El panel ahora fija este flag POR SALIDA. Esta prueba demuestra que
        // el flag ES el control (la superficie de rollback que antes no existía): en false la
        // línea vuelve a ser la URL del proveedor, byte a byte, sin /pulse/.
        const env = environment();
        env.ctx.APE_PULSE_WRAP = false;
        await env.ctx.APEGenerationController.prepublishAndGenerateDirect({ filename: 'unwrapped', hud: false });
        const text = textOf((await fileBytes(env))[0]);
        const uris = text.split(/\r?\n/).filter(line => /^https?:\/\//.test(line));
        assert.equal(uris.length, env.channels.length, 'one URI per channel');
        for (let i = 0; i < env.channels.length; i++) {
            assert.equal(uris[i].split('|')[0], env.channels[i].url,
                'raw provider URI (auth and query bytes unchanged) when the flag is false');
        }
        assert.ok(!text.includes('/pulse/'), 'no pulse wrapper with APE_PULSE_WRAP=false');
    });

    console.log(JSON.stringify({ passed, scope: 'production_dispatch_small_fixtures', physical_playback_verified: false }));
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
