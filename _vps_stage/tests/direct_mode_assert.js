#!/usr/bin/env node
/**
 * direct_mode_assert.js — GATE del MODO DIRECTO (sin VPS) · t61
 * ============================================================================
 * En modo DIRECTO (`window.APE_DIRECT_MODE === true`) la lista debe llevar la
 * URL del PROVEEDOR sin envolver, y TODAS las mejoras de declaración, porque
 * sin VPS no hay gateway que reescriba nada y los headers son lo único que
 * autentica al player contra el proveedor.
 *
 * COMPRUEBA (modo directo, sobre un fixture de URLs del proveedor):
 *   A · 0 URLs contienen el path del resolver/gateway (`resolve_quality`,
 *       `/cdn/`, `ape_gateway`, `srv=`/`ctx=`/`url=` como envoltorio)
 *   B · toda URL conserva el host del proveedor
 *   C · `#EXTHTTP` presente por canal con >= MIN_KEYS claves
 *   D · ancla `:fake8k`/`:fake4k` por canal
 *   E · 0 tóxicos (denylist real del emisor)
 *   F · N/N canales (no se pierde ninguno)
 *   G · G1 `#EXT-X-APE-LAB-EXTRAS` y `#EXT-X-APE-LAB-DNA` presentes
 *   H · niveles legales presentes y 0 `L153` en STREAM-INF 8K
 *   W · el WRAPPER integrado (2º generador real) también emite URL del proveedor
 *   F · escala real: 2754/2754 canales, 1 URL cada uno, 0 envueltas
 *
 * Y comprueba que el modo VPS **no se rompe**: sin el flag, las URLs pueden
 * venir reconstruidas y el gate NO falla por ello.
 *
 * [UNKNOWN] declarados al final: lo que depende del reproductor.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const EMITTER = path.join(REPO, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const WRAPPER_PATH = path.join(REPO, "IPTV_v5.4_MAX_AGGRESSION", "frontend", "js", "ape-v9", "m3u8-api-wrapper-integrated.js");
const MIN_KEYS = 10;

let pass = 0; const fail = []; const unknown = [];
const ok = (n, c, d) => { if (c) { pass++; return true; } fail.push(d ? `${n} — ${d}` : n); return false; };
const unk = (t) => unknown.push(t);

const TOX = ['Range: bytes=', 'If-None-Match', 'If-Modified-Since', 'TE: trailers', 'Priority: u=0', 'Upgrade-Insecure-Requests'];
// Marcadores de "URL envuelta por el VPS"
const WRAP = [/resolve_quality/i, /\/cdn\//i, /ape_gateway/i, /resolve_quality_unified/i, /[?&]srv=/i, /[?&]ctx=/i, /[?&]url=/i];

// ── Fixture DIRECTO en memoria: URLs del PROVEEDOR, sin envolver ──────────
function directFixture(n) {
    const ch = [];
    for (let i = 1; i <= n; i++) {
        ch.push({
            tvgId: String(i),
            tvgName: `Canal ${i} HD`,
            tvgLogo: `http://provider.example:8080/logos/${i}.png`,
            groupTitle: 'RESTO DEL MUNDO/DEPORTES/FULL HD',
            name: `Canal ${i} HD`,
            // URL del proveedor: host propio, ruta xtream, sin gateway ni resolver
            url: `http://provider.example:8080/live/usuarioEjemplo/claveEjemplo/${1000 + i}.m3u8`,
        });
    }
    return ch;
}

// ── Sandbox mínimo (mismo patrón que regen_headless) ──────────────────────
function makeSandbox(apeFakeUhd, directMode) {
    const store = new Map();
    const noop = () => { };
    const el = () => ({
        style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        appendChild: noop, removeChild: noop, setAttribute: noop, getAttribute: () => null,
        addEventListener: noop, removeEventListener: noop, append: noop, remove: noop,
        innerHTML: '', textContent: '', value: '', children: [], dataset: {},
        querySelector: () => null, querySelectorAll: () => [], getContext: () => null,
        focus: noop, click: noop, scrollIntoView: noop,
    });
    const doc = {
        createElement: el, createElementNS: el, createTextNode: () => el(),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        getElementsByTagName: () => [], getElementsByClassName: () => [],
        addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
        body: el(), head: el(), documentElement: el(), cookie: '', readyState: 'complete',
        hidden: false, visibilityState: 'visible', createDocumentFragment: el,
        createComment: () => el(), fonts: { ready: Promise.resolve(), add: noop },
    };
    const ls = {
        getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k), clear: () => store.clear(),
        key: (i) => Array.from(store.keys())[i] ?? null, get length() { return store.size; },
    };
    const sb = {
        console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, table: noop, group: noop, groupEnd: noop, groupCollapsed: noop, count: noop, countReset: noop, time: noop, timeEnd: noop, timeLog: noop, trace: noop, dir: noop, assert: noop, clear: noop },
        setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
        Promise, Object, Array, String, Number, Boolean, RegExp, Error, TypeError,
        Map, Set, WeakMap, WeakSet, Symbol, Buffer, TextEncoder, TextDecoder,
        URL, URLSearchParams, Intl, parseInt, parseFloat, isNaN, isFinite,
        encodeURIComponent, decodeURIComponent, escape, unescape, atob, btoa,
        JSON, Math, Date, performance: { now: () => Date.now() },
        crypto: globalThis.crypto,
        ReadableStream: (typeof ReadableStream !== 'undefined' ? ReadableStream : undefined),
        WritableStream: (typeof WritableStream !== 'undefined' ? WritableStream : undefined),
        TransformStream: (typeof TransformStream !== 'undefined' ? TransformStream : undefined),
        AbortController, AbortSignal, structuredClone,
        APE_FAKE_UHD: apeFakeUhd,
        APE_DIRECT_MODE: directMode === true,
        document: doc, localStorage: ls, sessionStorage: ls,
        location: { href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:', host: 'localhost', pathname: '/', search: '', hash: '' },
        navigator: { userAgent: 'node-headless', language: 'es', languages: ['es'], platform: 'node', hardwareConcurrency: 8, onLine: true },
        screen: { width: 1920, height: 1080, colorDepth: 24 },
        matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop }),
        requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
        cancelAnimationFrame: (id) => clearTimeout(id),
        fetch: () => Promise.resolve({ ok: false, status: 0, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
        XMLHttpRequest: function () { this.open = noop; this.send = noop; this.setRequestHeader = noop; this.addEventListener = noop; this.readyState = 0; this.status = 0; this.responseText = ''; },
        alert: noop, confirm: () => false, prompt: () => null,
        Blob: function () { this.size = 0; }, FileReader: function () { this.readAsText = noop; this.addEventListener = noop; },
        Worker: function () { this.postMessage = noop; this.addEventListener = noop; this.terminate = noop; },
        CustomEvent: function (t, o) { this.type = t; this.detail = (o || {}).detail; }, Event: function (t) { this.type = t; },
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        devicePixelRatio: 1, innerWidth: 1920, innerHeight: 1080,
        scrollTo: noop, focus: noop, blur: noop, print: noop,
        HUD_TYPED_ARRAYS: undefined, APE_PROFILES_CONFIG: undefined, app: undefined,
    };
    sb.window = sb; sb.self = sb; sb.globalThis = sb; sb.top = sb; sb.parent = sb;
    return sb;
}

function loadEmitter(apeFakeUhd, directMode) {
    const raw = fs.readFileSync(EMITTER);
    const before = crypto.createHash('sha256').update(raw).digest('hex');
    const src = raw.toString('utf8') + '\n;try{window.__G__=generateM3U8Stream;}catch(e){window.__GERR__=e.message;}\n';
    const sb = makeSandbox(apeFakeUhd, directMode);
    let loadError = null;
    try { vm.runInContext(src, vm.createContext(sb), { filename: 'emitter.js', timeout: 120000 }); }
    catch (e) { loadError = String((e && e.message) || e); }
    const after = crypto.createHash('sha256').update(fs.readFileSync(EMITTER)).digest('hex');
    return { fn: sb.window.APE_GEN || sb.window.__G__, loadError, unchanged: before === after };
}

async function drain(out) {
    if (!out) return null;
    if (typeof out === 'string') return out;
    const dec = new TextDecoder();
    if (typeof out.getReader === 'function') {
        const r = out.getReader(); let s = '';
        for (;;) { const { done, value } = await r.read(); if (done) break; s += (typeof value === 'string') ? value : dec.decode(value, { stream: true }); }
        return s + dec.decode();
    }
    if (typeof out[Symbol.asyncIterator] === 'function') {
        let s = ''; for await (const c of out) s += (typeof c === 'string') ? c : dec.decode(c, { stream: true });
        return s + dec.decode();
    }
    for (const k of ['content', 'text', 'm3u8', 'list', 'playlist', 'output', 'data', 'result']) {
        if (typeof out[k] === 'string' && out[k].length > 0) return out[k];
    }
    return null;
}

async function generate(channels, apeFakeUhd, directMode) {
    const r = loadEmitter(apeFakeUhd, directMode);
    if (typeof r.fn !== 'function') return { error: r.loadError || 'generador no accesible', unchanged: r.unchanged };
    let out;
    try {
        out = r.fn(channels, { profile: 'P3', hud: false, includeLabExtras: true, fakeUhd: apeFakeUhd, lab_metadata: { dna_sha256: 'direct-mode' } });
        out = await drain(out);
    } catch (e) { return { error: String((e && e.message) || e), unchanged: r.unchanged }; }
    return { text: out, unchanged: r.unchanged };
}

// Extrae las URLs de canal (la línea siguiente a cada #EXTHTTP/CABECERA… en
// realidad: en este formato la URL es la línea que no empieza por '#').
function channelUrls(text) {
    const urls = []; const lines = text.split('\n');
    for (const raw of lines) {
        const l = raw.trim();
        if (!l || l.startsWith('#')) continue;
        if (/^https?:\/\//i.test(l)) urls.push(l);
    }
    return urls;
}

function exthttpKeys(text) {
    const out = [];
    const re = /^#EXTHTTP:(.+)$/gm; let m;
    while ((m = re.exec(text)) !== null) {
        try { out.push(Object.keys(JSON.parse(m[1])).length); } catch (e) { out.push(-1); }
    }
    return out;
}

// Contador de subcadenas sin crear arrays gigantes (modo escala 2754).
function countSub(hay, needle) {
    let n = 0, at = hay.indexOf(needle);
    while (at >= 0) { n++; at = hay.indexOf(needle, at + 1); }
    return n;
}

// Escáner de una sola pasada sobre la salida (137 MB con 2 754 canales).
function scanOutput(text) {
    const res = { extinf: 0, urls: 0, wrapped: 0, badHost: 0, exthttp: 0, minKeys: Infinity, fake8k: 0, toxics: 0 };
    let i = 0; const n = text.length;
    while (i < n) {
        let k = text.indexOf("\n", i);
        if (k < 0) k = n;
        const line = text.slice(i, k);
        i = k + 1;
        if (!line) continue;
        const c0 = line.charCodeAt(0);
        if (c0 === 35) {
            if (line.startsWith("#EXTINF")) res.extinf++;
            else if (line.startsWith("#EXTHTTP:")) {
                res.exthttp++;
                try { const kk = Object.keys(JSON.parse(line.slice(9))).length; if (kk < res.minKeys) res.minKeys = kk; }
                catch (e) { res.minKeys = -1; }
            }
        } else if (c0 === 104 || c0 === 72) {
            if (/^https?:\/\//i.test(line)) {
                res.urls++;
                if (WRAP.some(re => re.test(line))) res.wrapped++;
                if (!/provider\.example/i.test(line)) res.badHost++;
            }
        }
        if (line.indexOf(":fake8k") >= 0) res.fake8k += countSub(line, ":fake8k");
        for (let t = 0; t < TOX.length; t++) if (line.indexOf(TOX[t]) >= 0) res.toxics++;
    }
    return res;
}

// Carga el WRAPPER integrado (otro generador real del repo) en el sandbox.
async function generateViaWrapper(channels, directMode) {
    const rawW = fs.readFileSync(WRAPPER_PATH);
    const sb = makeSandbox("8k", directMode);
    let loadError = null;
    try { vm.runInContext(rawW.toString("utf8"), vm.createContext(sb), { filename: "wrapper.js", timeout: 120000 }); }
    catch (e) { loadError = String((e && e.message) || e); }
    const W = sb.window.M3U8APIWrapper;
    if (typeof W !== "function") return { error: loadError || "M3U8APIWrapper no expuesto" };
    try {
        const inst = new W({ defaultProfile: "P3", defaultDeviceType: "desktop_chrome", defaultStrategy: "balanced", availableBandwidth: 100 });
        const out = inst.generateM3U8(channels, { profile: "P3" });
        return { text: typeof out === "string" ? out : null };
    } catch (e) { return { error: String((e && e.message) || e) }; }
}

(async () => {
    console.log('── direct_mode_assert · t61');
    if (!fs.existsSync(EMITTER)) { console.error('FATAL: no existe el emisor'); process.exit(2); }

    // ── 1 · MODO DIRECTO sobre fixture de URLs del proveedor ──────────────
    const N = 12;
    const fixture = directFixture(N);
    console.log(`\n── MODO DIRECTO (APE_DIRECT_MODE=true) · fixture de ${N} canales del proveedor`);
    const d = await generate(fixture, '8k', true);
    ok('D0 el emisor cargó y generó', typeof d.text === 'string' && d.text.length > 0, d.error || 'sin texto');
    ok('D0b emisor NO modificado por el gate', d.unchanged === true);

    if (typeof d.text === 'string' && d.text.length) {
        const t = d.text;
        const urls = channelUrls(t);
        const wrapped = urls.filter(u => WRAP.some(re => re.test(u)));
        const badHost = urls.filter(u => !/provider\.example/i.test(u));

        ok("D1 " + N + "/" + N + " canales", (t.match(/^#EXTINF/gm) || []).length === N, `${(t.match(/^#EXTINF/gm) || []).length}`);
        ok('D2 1 URL por canal', urls.length === N, `${urls.length} URLs`);
        ok('D3 (a) 0 URLs con path de resolver/gateway', wrapped.length === 0, wrapped.slice(0, 2).join(' | '));
        ok('D4 (b) toda URL conserva el host del proveedor', badHost.length === 0, badHost.slice(0, 2).join(' | '));

        const keys = exthttpKeys(t);
        ok("D5 (c) #EXTHTTP presente por canal", keys.length >= N, `${keys.length} bloques`);
        ok("D6 (c) cada #EXTHTTP con >= " + MIN_KEYS + " claves", keys.length > 0 && keys.every(k => k >= MIN_KEYS), "min=" + Math.min(...keys));
        ok('D7 (d) ancla :fake8k por canal', (t.split(':fake8k').length - 1) >= N, `${t.split(':fake8k').length - 1}`);
        ok('D8 (e) 0 tóxicos', TOX.reduce((n, x) => n + (t.split(x).length - 1), 0) === 0);
        ok("D9 G1 #EXT-X-APE-LAB-EXTRAS presente", /^#EXT-X-APE-LAB-EXTRAS:/m.test(t));
        ok("D10 #EXT-X-APE-LAB-DNA presente", /^#EXT-X-APE-LAB-DNA:/m.test(t));
        ok("D11 #EXT-X-APE-UPSCALE:fake8k por canal", (t.match(/^#EXT-X-APE-UPSCALE:fake8k/gm) || []).length >= N);
        ok("D12 #EXTM3U linea 1", /^#EXTM3U(\s|$)/.test(t.split('\n')[0].trim()));
        ok("D13 #EXTVLCOPT y #KODIPROP por canal",
            (t.match(/^#EXTVLCOPT:/gm) || []).length >= N && (t.match(/^#KODIPROP:/gm) || []).length >= N);
        // niveles + freeze (por origen)
        let si8k = 0, si8kL153 = 0;
        for (const ln of t.split('\n')) {
            if (!ln.startsWith('#EXT-X-STREAM-INF')) continue;
            if (/RESOLUTION=7680x4320/.test(ln)) { si8k++; if (ln.includes('L153')) si8kL153++; }
        }
        ok("D14 0 L153 en STREAM-INF 8K", si8kL153 === 0, `${si8kL153} de ${si8k}`);
        const lv = ['L180', 'L183', 'L150', 'L153'].reduce((a, k) => { a[k] = (t.match(new RegExp(k, 'g')) || []).length; return a; }, {});
        ok('D15 niveles declarados (algún Lxxx presente)', Object.values(lv).some(v => v > 0), JSON.stringify(lv));
        console.log(`      URLs muestra: ${urls[0] || '(ninguna)'}`);
        console.log(`      niveles: ${JSON.stringify(lv)}`);
    }

    // ── 2 · MODO 4K directo (opción segura por el riesgo de pantalla negra) ─
    console.log('\n── MODO DIRECTO con APE_FAKE_UHD=\'4k\' (opción segura)');
    const d4 = await generate(fixture.slice(0, 4), '4k', true);
    ok('S1 4K directo genera', typeof d4.text === 'string' && d4.text.length > 0, d4.error || 'sin texto');
    if (typeof d4.text === 'string' && d4.text.length) {
        ok('S2 ancla :fake4k por canal', (d4.text.split(':fake4k').length - 1) >= 4);
        ok('S3 4K sin envoltorio', channelUrls(d4.text).every(u => !WRAP.some(re => re.test(u))));
    }

    // ── 3 · NO REGRESIÓN: modo VPS (sin el flag) ──────────────────────────
    console.log('\n── NO REGRESIÓN · modo VPS (APE_DIRECT_MODE ausente)');
    const v = await generate(fixture.slice(0, 4), '8k', false);
    ok('V1 el modo VPS sigue generando', typeof v.text === 'string' && v.text.length > 0, v.error || 'sin texto');
    if (typeof v.text === 'string' && v.text.length) {
        ok('V2 el modo VPS conserva sus canales', (v.text.match(/^#EXTINF/gm) || []).length === 4);
        ok('V3 el modo VPS conserva anclas y headers',
            (v.text.split(':fake8k').length - 1) >= 4 && exthttpKeys(v.text).length >= 4);
    }

    // ── 4 · Estático: el flag existe y gatea `buildChannelUrl` ────────────
    const src = fs.readFileSync(EMITTER, 'utf8');
    ok("E1 el emisor referencia window.APE_DIRECT_MODE", /window\.APE_DIRECT_MODE\s*===\s*true/.test(src));
    ok("E2 el corte esta DENTRO de buildChannelUrl",
        /function buildChannelUrl\([\s\S]{0,1200}?APE_DIRECT_MODE/.test(src));
    ok("E3 el modo directo devuelve la URL propia del canal (preferHttps)",
        /APE_DIRECT_MODE[\s\S]{0,600}?return preferHttps\(_directUrl\)/.test(src));

    // ── 5 · WRAPPER INTEGRADO: también debe respetar el modo directo ────────
    console.log("\n── WRAPPER (m3u8-api-wrapper-integrated.js) · MODO DIRECTO");
    const w = await generateViaWrapper(fixture.slice(0, 4), true);
    ok("W0 el wrapper cargó y generó", typeof w.text === "string" && w.text.length > 0, w.error || "sin texto");
    if (typeof w.text === "string" && w.text.length) {
        const wu = channelUrls(w.text);
        const wWrap = wu.filter(u => WRAP.some(re => re.test(u)));
        ok("W1 (a) 0 URLs con path de resolver/gateway en el wrapper", wWrap.length === 0, wWrap.slice(0, 2).join(" | "));
        ok("W2 (b) el wrapper conserva el host del proveedor", wu.length === 4 && wu.every(u => /provider\.example/i.test(u)), wu.slice(0, 2).join(" | "));
        ok("W3 el wrapper emite la URL del proveedor SIN ape_jwt", wu.length > 0 && wu.every(u => u.indexOf("ape_jwt") < 0));
        ok("W4 el wrapper suprime #EXTATTRFROMURL (bloque VPS) en directo", w.text.indexOf("#EXTATTRFROMURL") < 0);
    }
    const wv = await generateViaWrapper(fixture.slice(0, 2), false);
    ok("W5 NO REGRESIÓN: el wrapper en modo VPS sigue generando", typeof wv.text === "string" && wv.text.length > 0, wv.error || "sin texto");
    if (typeof wv.text === "string" && wv.text.length) {
        ok("W6 el modo VPS del wrapper conserva su envoltura (ape_jwt)", wv.text.indexOf("ape_jwt") >= 0);
    }

    // ── 6 · ESCALA REAL: 2754 canales del proveedor en modo directo ─────────
    console.log("\n── ESCALA · 2754 canales del proveedor en MODO DIRECTO");
    const N_REAL = 2754;
    const bigFx = directFixture(N_REAL);
    const tBig0 = Date.now();
    const dB = await generate(bigFx, "8k", true);
    const bigMs = Date.now() - tBig0;
    ok("F0 2754 canales generan", typeof dB.text === "string" && dB.text.length > 0, dB.error || "sin texto");
    if (typeof dB.text === "string" && dB.text.length) {
        const sc = scanOutput(dB.text);
        ok("F1 (f) 2754/2754 #EXTINF", sc.extinf === N_REAL, String(sc.extinf));
        ok("F2 1 URL por canal (2754)", sc.urls === N_REAL, String(sc.urls));
        ok("F3 (a) 0 URLs envueltas a escala", sc.wrapped === 0, String(sc.wrapped));
        ok("F4 (b) host del proveedor en 2754/2754", sc.badHost === 0, String(sc.badHost));
        ok("F5 (c) #EXTHTTP 2754/2754", sc.exthttp === N_REAL, String(sc.exthttp));
        ok("F6 (c) cada #EXTHTTP con >= " + MIN_KEYS + " claves", sc.minKeys >= MIN_KEYS, "min=" + sc.minKeys);
        ok("F7 (d) ancla :fake8k 2754/2754", sc.fake8k >= N_REAL, String(sc.fake8k));
        ok("F8 (e) 0 tóxicos a escala", sc.toxics === 0, String(sc.toxics));
        ok("F9 un solo #EXTM3U y en la línea 1", (dB.text.split("#EXTM3U").length - 1) === 1 && /^#EXTM3U(\s|$)/.test(dB.text.split("\n")[0].trim()));
        console.log("      " + N_REAL + " canales · " + bigMs + " ms · " + (dB.text.length / 1048576).toFixed(1) + " MB");
    }

    // ── 7 · QUERY INTACTA · una URL de proveedor con token no se puede recortar ─
    console.log("\n── QUERY INTACTA · URL del proveedor con token en MODO DIRECTO");
    const qFx = [{
        tvgId: "9001", tvgName: "Canal Token HD", name: "Canal Token HD", groupTitle: "TEST",
        url: "http://provider.example:8080/live/u/p/9001.m3u8?token=abc123&exp=9999999999",
    }];
    const qe = await generate(qFx, "8k", true);
    ok("Q0 el emisor genera con URL con query", typeof qe.text === "string" && qe.text.length > 0, qe.error || "sin texto");
    if (typeof qe.text === "string" && qe.text.length) {
        const qu = channelUrls(qe.text);
        ok("Q1 el emisor CONSERVA la query del proveedor (token)", qu.length === 1 && qu[0].indexOf("token=abc123") >= 0 && qu[0].indexOf("exp=9999999999") >= 0, qu[0] || "sin URL");
        ok("Q2 el emisor NO añade ape_jwt ni envuelve", qu.length === 1 && qu[0].indexOf("ape_jwt") < 0 && !WRAP.some(re => re.test(qu[0])), qu[0] || "sin URL");
    }
    const qw = await generateViaWrapper(qFx, true);
    ok("Q3 el wrapper genera con URL con query", typeof qw.text === "string" && qw.text.length > 0, qw.error || "sin texto");
    if (typeof qw.text === "string" && qw.text.length) {
        const qwu = channelUrls(qw.text);
        ok("Q4 el wrapper CONSERVA la query del proveedor (antes la recortaba con split('?'))", qwu.length === 1 && qwu[0].indexOf("token=abc123") >= 0 && qwu[0].indexOf("exp=9999999999") >= 0, qwu[0] || "sin URL");
        ok("Q5 el wrapper NO añade ape_jwt en directo", qwu.length === 1 && qwu[0].indexOf("ape_jwt") < 0, qwu[0] || "sin URL");
    }

    // ── [UNKNOWN] ─────────────────────────────────────────────────────────
    unk('Si un player honra 8K declarado sobre bytes 1080p/4K: depende del reproductor y del VPP del device. NO se promete 4K/8K real desde una lista.');
    unk('Un player que FILTRE por RESOLUTION puede rechazar la variante 8K (pantalla negra). Por eso `APE_FAKE_UHD=\'4k\'` se ofrece como opción segura; el default \'8k\' requiere confirmación del propietario.');
    unk('Con un catálogo de ENTRADA ya envuelto (`resolve_quality.php?...`), el modo directo NO desenvuelve: no se inventa derivación. Se necesita el catálogo de URLs del PROVEEDOR.');
    unk('No hay remux ni transcode en una lista: remux cambia contenedor, no píxeles. El upscale real lo hace el device (VPP) o el player.');

    console.log('\n── [UNKNOWN] declarados');
    unknown.forEach(u => console.log(`   · ${u}`));

// ═══════════════════════════════════════════════════════════════════════════
// [t87] INTERRUPTOR DE MODO DIRECTO EN LA UI (estático: HTML + controlador)
// Sin DOM en Node, se verifica el CABLEADO: que el control existe, que escribe
// window.APE_DIRECT_MODE, que persiste en localStorage y que se aplica al arrancar.
// ═══════════════════════════════════════════════════════════════════════════
console.log(''); console.log("── [t87] interruptor de modo directo (UI + controlador)");
{
    const fs2 = require('node:fs');
    const path2 = require('node:path');
    const ROOT2 = path.join(__dirname, '..', '..');
    const HTML = path2.join(ROOT2, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'index-v4.html');
    const CTRL = path2.join(ROOT2, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'generation-controller.js');
    const html = fs2.readFileSync(HTML, 'utf8');
    const ctrl = fs2.readFileSync(CTRL, 'utf8');

    // (a) el control EXISTE en la UI y está etiquetado
    ok('t87.a1 existe #apeDirectModeToggle en index-v4.html',
        /id="apeDirectModeToggle"/.test(html));
    ok('t87.a2 la etiqueta dice "Modo DIRECTO (sin VPS)"',
        /Modo DIRECTO \(sin VPS\)/.test(html));
    ok('t87.a3 es un control de estado (checkbox)',
        /id="apeDirectModeToggle"[^>]*type="checkbox"|type="checkbox"[^>]*id="apeDirectModeToggle"/.test(html));

    // (b) el controlador ASIGNA window.APE_DIRECT_MODE (hoy nadie lo asignaba)
    ok('t87.b1 generation-controller.js asigna window.APE_DIRECT_MODE',
        /window\.APE_DIRECT_MODE\s*=/.test(ctrl));
    ok('t87.b2 usa la clave de persistencia ape_direct_mode',
        /ape_direct_mode/.test(ctrl));

    // (c) persistencia + lectura al arrancar
    ok('t87.c1 escribe en localStorage', /localStorage\.setItem\(APE_DIRECT_MODE_KEY/.test(ctrl));
    ok('t87.c2 lee de localStorage al arrancar', /localStorage\.getItem\(APE_DIRECT_MODE_KEY/.test(ctrl));
    ok('t87.c3 engancha el evento change (en caliente, sin recargar)',
        /addEventListener\('change'/.test(ctrl));
    ok('t87.c4 se aplica al cargar (DOMContentLoaded o invocación directa)',
        /attachDirectModeToggle\(\)/.test(ctrl));

    // (d) los DOS botones existen y hay manejador para cada uno
    ok('t87.d1 existe el botón audited (data-ape-generate-audited)',
        /data-ape-generate-audited/.test(html));
    ok('t87.d2 existe el botón #btnGenerateDual',
        /id="btnGenerateDual"/.test(html));
    ok('t87.d3 #btnGenerateDual tiene manejador (onclick inline)',
        /id="btnGenerateDual"[\s\S]{0,400}?onclick=/.test(html));

    // (e) el modo directo se LEE en el emisor y en el wrapper (precondición del método)
    const EMIT = path2.join(ROOT2, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
    const emit = fs2.readFileSync(EMIT, 'utf8');
    ok('t87.e1 el emisor LEE window.APE_DIRECT_MODE', /window\.APE_DIRECT_MODE\s*===?\s*true/.test(emit));
}
    console.log('\n════════════════════════════════════════════════════════');
    if (fail.length === 0) {
        console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
        console.log('════════════════════════════════════════════════════════');
        process.exit(0);
    } else {
        console.log(`RESULTADO: FAIL — ${pass} OK, ${fail.length} fallo(s)`);
        fail.forEach(f => console.log(`  ✗ ${f}`));
        console.log('════════════════════════════════════════════════════════');
        process.exit(1);
    }
})().catch((e) => { console.error('FATAL', (e && e.stack) || e); process.exit(3); });
