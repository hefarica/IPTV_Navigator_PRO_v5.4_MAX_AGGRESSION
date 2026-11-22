#!/usr/bin/env node
'use strict';
/*
 * multiparser-audit.js — MULTIPARSEADOR v2: ¿qué entiende CADA familia de players de nuestra lista?
 *
 * POR QUÉ. Una lista APE lleva ~965 líneas por canal con capas propietarias. El objetivo no es
 * que "un" player la lea, sino saber para CADA familia qué entiende, qué debe IGNORAR por RFC 8216
 * §6.3.1 (tags desconocidos son legales) y qué RECHAZA. Un tag desconocido no rompe nada; un
 * atributo mal formado SÍ, y en hls.js se traduce en "la rendition desaparece sin error".
 *
 * LÍMITE DECLARADO (medido por parser-auditor / t6): la capa #EXT-X-APE-* es de SÓLO ESCRITURA:
 * 199 familias emitidas y 0 lectores family-aware en parsers/. Este tool NO es un lector de esa
 * capa; es verificación TEXTO-PLANO de lo que rompe a un parser real. La opción (b) —lector APE
 * family-aware— es código nuevo y va aparte.
 *
 * USO:
 *   node multiparser-audit.js                    (genera los 12 perfiles con el generador REAL)
 *   node multiparser-audit.js <archivo.m3u8>     (audita una lista existente)
 *   node multiparser-audit.js --profile=P4.5     (un solo perfil)
 *   node multiparser-audit.js --json             (salida machine-readable)
 *   node multiparser-audit.js --selftest         (planta 7 defectos y exige que se detecten)
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const args = process.argv.slice(2);
const onlyProfile = (args.find(a => a.startsWith('--profile=')) || '').split('=')[1] || null;
const asJson = args.includes('--json');
const SELFTEST = args.includes('--selftest');
const filePath = args.find(a => !a.startsWith('--'));

/* Opciones EXTVLCOPT que existen en los binarios reales (tool/ape-image-recipes/VLC_OPT_AUDIT.md +
 * catálogo mínimo). Es una COTA SUPERIOR honesta: "existe" = la conocemos; "no existe" = no está
 * en el inventario auditado, no prueba de imposibilidad. */
const VLC_REAL = new Set([
    'network-caching', 'live-caching', 'file-caching', 'clock-jitter', 'clock-synchro',
    'http-user-agent', 'http-referrer', 'video-filter', 'avcodec-hw', 'avcodec-threads',
    'saturation', 'tonemap', 'colorspace', 'format', 'deinterlace', 'deinterlace-mode',
    'audio-language', 'audio-track', 'sub-language', 'sub-track', 'sub-autodetect-file',
    'start-time', 'stop-time', 'input-repeat', 'no-video-title-show', 'video-on-top',
    'fullscreen', 'aspect-ratio', 'crop', 'zoom', 'gamma', 'contrast', 'brightness', 'hue'
]);
const VLC_PREFIX = ['audio-', 'sub-', 'video-title', 'input-', 'http-'];
const TOXIC = new Set(['range', 'if-none-match', 'if-modified-since', 'te', 'priority',
    'upgrade-insecure-requests', 'connection', 'keep-alive', 'proxy-connection', 'traceparent']);
const APE_PUBLIC = ['X-APE-Profile', 'X-APE-Tier', 'X-APE-Max-Quality', 'X-APE-Codec-Cascade', 'X-APE-Channel-Id'];

const P = (name) => ({ name, bad: [], notes: [], understood: 0 });

/* ══════════ 1 · hls.js 1.5.17 (M3U8Parser REAL) ══════════
 * Semántica MEDIDA ejecutando el parser vendorizado (t8), no doctrina de memoria:
 *  · isMediaPlaylist() = true si hay #EXT-X-TARGETDURATION / MEDIA-SEQUENCE / EXTINF en un
 *    catálogo con STREAM-INF → hls.js usa el parser de MEDIA y TODOS los STREAM-INF quedan
 *    inertes. Es la rotura más grave y no produce ningún error visible.
 *  · #EXTINF con duración NO numérica (-1) → regex \d*(?:\.\d+)? no casa: duration=0 y el
 *    RESTO de la línea se captura como URI.
 *  · #EXT-X-SESSION-KEY:METHOD=NONE → warning real de hls.js (Keys).
 *  · Tags de media playlist (SERVER-CONTROL, PART-INF, START) en el catálogo.
 *  · hls.js 1.5.17 NO rechaza: FRAME-RATE en fracción, BANDWIDTH ausente, coma final, ni exige
 *    #EXTM3U/orden de VERSION. Eso vive en el perfil RFC 8216 estricto, no aquí.
 *  · Sí corrompe en silencio: CODECS sin comillas (pierde audioCodec y FRAME-RATE) y
 *    RESOLUTION con espacios (width/height=null).
 */
function auditHlsjs(lines) {
    const r = P('hls.js 1.5.17 (real)');
    const hasStreamInf = lines.some(l => l.startsWith('#EXT-X-STREAM-INF:'));
    const hasTarget = lines.some(l => l.startsWith('#EXT-X-TARGETDURATION:'));
    const hasMediaSeq = lines.some(l => l.startsWith('#EXT-X-MEDIA-SEQUENCE:'));
    const hasExtinf = lines.some(l => l.startsWith('#EXTINF:'));

    /* 1 · contaminación de tipo: el catálogo se parsea como MEDIA */
    if (hasStreamInf && (hasTarget || hasMediaSeq)) {
        const why = hasTarget ? '#EXT-X-TARGETDURATION' : '#EXT-X-MEDIA-SEQUENCE';
        const ln = lines.findIndex(l => l.startsWith(hasTarget ? '#EXT-X-TARGETDURATION:' : '#EXT-X-MEDIA-SEQUENCE:')) + 1;
        r.bad.push([ln, 'FATAL: ' + why + ' hace isMediaPlaylist()=true → hls.js parsea como MEDIA y los ' +
            lines.filter(l => l.startsWith('#EXT-X-STREAM-INF:')).length + ' STREAM-INF quedan INERTES (sin error)', '']);
    }

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i], l = raw.trim();

        /* 2 · EXTINF con duración no numérica */
        if (l.startsWith('#EXTINF:')) {
            r.understood++;
            const durMatch = l.match(/^#EXTINF:(\d+(?:\.\d+)?)/);
            const dur = durMatch ? durMatch[1] : '';
            if (!durMatch) {
                r.bad.push([i + 1, 'duración "' + dur + '" no parseable por hls.js (regex \\d*(?:\\.\\d+)?): duration=0 y el resto de la línea se toma como URI falso', l.slice(0, 80)]);
            }
        }

        /* 3 · SESSION-KEY inválido */
        if (l.startsWith('#EXT-X-SESSION-KEY:') && /METHOD=NONE/i.test(l)) {
            r.bad.push([i + 1, 'warning real de hls.js: EXT-X-SESSION-KEY con METHOD=NONE se ignora', l.slice(0, 80)]);
        }

        /* 4 · tags de media playlist en el catálogo */
        for (const tag of ['#EXT-X-SERVER-CONTROL:', '#EXT-X-PART-INF:', '#EXT-X-START:']) {
            if (l.startsWith(tag) && (hasStreamInf || hasExtinf)) {
                r.bad.push([i + 1, 'tag de MEDIA playlist (' + tag.slice(0, -1) + ') en un catálogo de canales', l.slice(0, 70)]);
            }
        }

        /* 5 · corrupción silenciosa de atributos */
        if (l.startsWith('#EXT-X-STREAM-INF:')) {
            r.understood++;
            const attrs = l.slice('#EXT-X-STREAM-INF:'.length);
            const cm = attrs.match(/CODECS=([^,]*)/);
            if (cm && !/^"/.test(cm[1])) r.bad.push([i + 1, 'CODECS sin comillas: hls.js pierde audioCodec y FRAME-RATE (clave basura)', l.slice(0, 90)]);
            const rm = attrs.match(/RESOLUTION=([^,]*)/);
            if (rm && !/^\d+x\d+$/.test(rm[1].trim())) r.bad.push([i + 1, 'RESOLUTION no WxH literal: hls.js deja width/height=null', l.slice(0, 90)]);
            if (!/(^|,)\s*BANDWIDTH=\d+/.test(attrs)) r.notes.push('STREAM-INF sin BANDWIDTH: hls.js NO la rechaza (bitrate=null, la variante sobrevive) — dato de t8');
        }
        if (l.startsWith('#EXT-X-MEDIA:')) {
            r.understood++;
            if (!/TYPE=(AUDIO|VIDEO|SUBTITLES|CLOSED-CAPTIONS)/.test(l)) r.bad.push([i + 1, 'EXT-X-MEDIA sin TYPE válido', l.slice(0, 80)]);
        }
    }
    r.notes.push('modo detectado por hls.js: ' + (hasStreamInf && !(hasTarget || hasMediaSeq) ? 'MASTER' : 'MEDIA'));
    r.notes.push('medido con el parser real (t8): FRAME-RATE en fracción, coma final y BANDWIDTH ausente NO se rechazan');
    return r;
}

/* ══════════ 2 · RFC 8216 ══════════ */
function auditRfc8216(lines) {
    const r = P('RFC 8216');
    const first = lines[0].trim();
    if (first.startsWith('#EXTM3U')) {
        if (first === '#EXTM3U') r.notes.push('#EXTM3U limpio');
        else r.notes.push('EXTENSIÓN-ACEPTADA: #EXTM3U con atributos M3U Plus (x-tvg-url=…) — la aceptan los players reales, no es violación RFC');
    } else {
        r.bad.push([1, '#EXTM3U no es la primera línea', lines[0] || '']);
    }
    const isMaster = lines.some(l => l.startsWith('#EXT-X-STREAM-INF:'));
    const isMedia = lines.some(l => l.startsWith('#EXTINF:'));
    if (isMaster && isMedia) r.notes.push('conviven EXTINF (media) y STREAM-INF (master): RFC las separa en dos archivos');
    if (isMedia && !lines.some(l => l.startsWith('#EXT-X-TARGETDURATION:'))) {
        r.notes.push('sin #EXT-X-TARGETDURATION (propio de media playlist; aquí es catálogo M3U Plus)');
    }
    /* coma final en lista de atributos: la prohibe el ABNF del RFC (hls.js la TOLERA: medido en t8) */
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (/^#EXT-X-[A-Z-]+:/.test(l) && /,$/.test(l)) r.bad.push([i + 1, 'coma final en la lista de atributos (ABNF RFC 8216); hls.js la tolera', l.slice(0, 70)]);
    }

    let pending = false, sinUri = 0, uriSinExtinf = 0;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l) continue;
        if (l.startsWith('#EXTINF:')) { pending = true; r.understood++; continue; }
        if (l.startsWith('#')) continue;
        if (pending) pending = false; else uriSinExtinf++;
    }
    if (pending) sinUri++;
    if (sinUri) r.bad.push([0, sinUri + ' #EXTINF sin URI detrás', '']);
    if (uriSinExtinf) r.notes.push(uriSinExtinf + ' URI sin #EXTINF previo (tolerado, fuera de RFC)');
    r.notes.push('tags desconocidos son LEGALES e ignorables (§6.3.1): no son defecto');
    return r;
}

/* ══════════ 3 · M3U Plus ══════════ */
function auditM3uPlus(lines) {
    const r = P('M3U Plus');
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l.startsWith('#EXTINF:')) continue;
        r.understood++;
        const comma = l.lastIndexOf(',');
        if (comma < 0) { r.bad.push([i + 1, '#EXTINF sin coma de nombre', l]); continue; }
        const head = l.slice('#EXTINF:'.length, comma);
        for (const m of head.matchAll(/([\w-]+)=("[^"]*"|[^,\s]+)/g)) {
            if (!/^".*"$/.test(m[2]) && /\s/.test(m[2])) r.bad.push([i + 1, 'atributo con espacio sin comillas: ' + m[1], l]);
        }
    }
    r.notes.push('atributos y nombre en formato M3U Plus');
    return r;
}

/* ══════════ 4 · libVLC (registro REAL: vlc --longhelp) ══════════
 * Fuente primaria: la salida de `vlc --longhelp` capturada en artifacts/parsers/vlc-longhelp.txt
 * (208.666 B, 3.866 líneas, 1.917 opciones --x). Ese fichero lo produjo el host; el registro del
 * binario es MÁS FUERTE que el documento VLC_OPT_AUDIT.md y que cualquier allowlist escrita a mano.
 *
 * MEDIDO contra las 130 opciones que emitimos: 39 existen, 91 NO existen (70%).
 * Las inexistentes se descartan EN SILENCIO (exit=0, cero log): son decorativas e inocuas.
 * Corrige a t7 en dos puntos: `sout-keep` y `codec` SÍ existen en el registro; y
 * `audio-channels` NO existe en esta build, así que no puede forzar upmix.
 * La capa que SÍ importa es la que existe y VLC rechaza por política: video-filter y avcodec-hw
 * son opciones reales pero `unsafe option`, ignoradas desde playlist.
 */
const VLC_REGISTRY = (() => {
    try {
        const f = path.join(__dirname, '..', '..', '..', 'artifacts', 'parsers', 'vlc-longhelp.txt');
        const txt = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
        const set = new Set();
        for (const m of txt.matchAll(/--([a-z0-9][a-z0-9-]{1,60})/g)) set.add(m[1]);
        return { available: set.size > 500, set, size: set.size, source: 'vlc --longhelp (' + set.size + ' opciones)' };
    } catch (e) {
        return { available: false, set: null, size: 0, source: 'allowlist mínima (falta artifacts/parsers/vlc-longhelp.txt)' };
    }
})();

function auditVlc(lines) {
    const r = P('libVLC');
    const FALLBACK = new Set(['network-caching', 'live-caching', 'file-caching', 'clock-jitter', 'clock-synchro',
        'http-user-agent', 'http-referrer', 'video-filter', 'avcodec-hw', 'saturation', 'tonemap', 'grayscale',
        'gamma', 'contrast', 'brightness', 'hue', 'aspect-ratio', 'crop', 'zoom', 'fullscreen', 'audio-desync']);
    const unknown = new Map();
    let exist = 0;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l.startsWith('#EXTVLCOPT:')) continue;
        r.understood++;
        const k = l.slice('#EXTVLCOPT:'.length).split('=')[0].trim();
        const known = VLC_REGISTRY.available ? VLC_REGISTRY.set.has(k) : FALLBACK.has(k);
        if (known) { exist++; continue; }
        unknown.set(k, (unknown.get(k) || 0) + 1);
    }
    if (exist) r.notes.push(exist + ' usos de opciones que EXISTEN en el registro');
    if (unknown.size) {
        r.notes.push(unknown.size + ' opciones NO existen (' + VLC_REGISTRY.source + '): se descartan EN SILENCIO, sin log y sin romper nada. ' +
            [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => k + 'x' + n).join(', '));
    }
    if (!VLC_REGISTRY.available) r.notes.push('SIN registro real: allowlist mínima = COTA SUPERIOR, no verdad medida');
    /* unsafe options: existen y VLC las rechaza por POLÍTICA, no por sintaxis */
    for (const banned of ['video-filter', 'avcodec-hw']) {
        if (new RegExp('#EXTVLCOPT:' + banned + '=').test(lines.join('\n'))) {
            r.notes.push(banned + ' EXISTE pero es unsafe option: VLC la ignora por política en playlist (no se arregla desde el manifiesto)');
        }
    }
    return r;
}

/* ══════════ 5 · Kodi ISA ══════════ */
function auditKodi(lines) {
    const r = P('Kodi ISA');
    const ns = new Map();
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l.startsWith('#KODIPROP:')) continue;
        r.understood++;
        const k = l.slice('#KODIPROP:'.length).split('=')[0].trim();
        if (k === 'inputstream' || /^inputstream\.(adaptive|hlsjs|ffmpegdirect|rtmp)\./.test(k)) {
            const n = k.split('.').slice(0, 2).join('.');
            ns.set(n, (ns.get(n) || 0) + 1);
        } else {
            r.bad.push([i + 1, 'clave KODIPROP fuera de namespace inputstream.*', l]);
        }
    }
    if (ns.size) r.notes.push('namespaces: ' + [...ns.entries()].map(([k, n]) => k + '×' + n).join(', '));
    return r;
}

/* ══════════ 6 · ExoPlayer / Android ══════════ */
function auditExo(lines) {
    const r = P('ExoPlayer/Android');
    const idx = lines.findIndex(l => l.startsWith('#EXTHTTP:'));
    if (idx >= 0) {
        r.understood++;
        const body = lines[idx].slice('#EXTHTTP:'.length);
        try { JSON.parse(body); } catch (e) { r.bad.push([idx + 1, 'EXTHTTP con JSON inválido: OkHttp descarta TODAS las cabeceras', body.slice(0, 60)]); }
        if (Buffer.byteLength(body, 'utf8') > 8192) r.bad.push([idx + 1, 'EXTHTTP > 8192 B', Buffer.byteLength(body, 'utf8') + 'B']);
    }
    /* OkHttp rechaza valores con coma en cabeceras de un solo valor (trampa TiviMate/OkHttp) */
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l.startsWith('#EXTHTTP:')) continue;
        let o; try { o = JSON.parse(l.slice('#EXTHTTP:'.length)); } catch (e) { continue; }
        for (const [k, v] of Object.entries(o)) {
            if (typeof v === 'string' && v.includes(',') && /^(User-Agent|Referer|Origin)$/i.test(k)) {
                r.notes.push('cabecera de valor único con coma: ' + k + ' (OkHttp puede rechazarla)');
            }
        }
    }
    r.notes.push('ignora EXTVLCOPT/KODIPROP; #EXT-X-APE-* son tags desconocidos (legales)');
    return r;
}

/* ══════════ 7 · Apple AVPlayer ══════════ */
function auditApple(lines) {
    const r = P('Apple AVPlayer');
    const hasFmp4 = lines.some(l => l.startsWith('#EXT-X-MAP:'));
    const ver = (lines.find(l => l.startsWith('#EXT-X-VERSION:')) || '').slice('#EXT-X-VERSION:'.length).trim();
    if (hasFmp4 && !ver) r.bad.push([0, 'EXT-X-MAP sin #EXT-X-VERSION declarado', '']);
    if (hasFmp4 && ver && Number(ver) < 6) r.bad.push([0, 'EXT-X-MAP exige EXT-X-VERSION >= 6', 'version=' + ver]);
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l.startsWith('#EXTVLCOPT:') || l.startsWith('#KODIPROP:')) continue; // ignorados
        if (l.startsWith('#EXTINF:')) r.understood++;
    }
    r.notes.push('ignora EXTVLCOPT/KODIPROP por completo; reproduce EXTINF + URI');
    r.notes.push('sin #EXT-X-STREAM-INF no hay variante que elegir: usa la URI directa');
    return r;
}

/* ══════════ 8 · parser hostil ══════════ */
function auditHostile(rawLines) {
    const r = P('parser hostil');
    const raw = rawLines.join('\n');
    if (raw.charCodeAt(0) === 0xFEFF) r.bad.push([1, 'BOM UTF-8 al inicio: algunos parsers leen "#\\uFEFFEXTM3U" y rechazan la lista', '']);
    const crlf = rawLines.filter(l => l.endsWith('\r')).length;
    if (crlf) r.notes.push(crlf + ' líneas con CR (tolerado por casi todos; algunos M3U estrictos lo dejan en el nombre del canal)');
    for (let i = 0; i < rawLines.length; i++) {
        const b = Buffer.byteLength(rawLines[i], 'utf8');
        if (b > 8192) r.bad.push([i + 1, 'línea de ' + b + ' B (> 8192): buffers de cabecera/parseo truncados', '']);
    }
    for (let i = 0; i < rawLines.length; i++) {
        const l = rawLines[i];
        if (l.startsWith('#EXT-X-STREAM-INF:') && /CODECS="[^"]*"[^,]*,.*"/.test(l) === false && /CODECS="[^"]*,[^"]*"/.test(l) === false && /CODECS=[^"]/.test(l)) {
            r.bad.push([i + 1, 'CODECS sin comillas con coma: parser ingenuo corta el atributo', l.slice(0, 90)]);
        }
    }
    r.notes.push('detecta BOM, CRLF, líneas >8192 y comas sin comillas');
    return r;
}

const AUDITORS = [auditHlsjs, auditRfc8216, auditM3uPlus, auditVlc, auditKodi, auditExo, auditApple, auditHostile];

/* ══════════ generación / lectura ══════════ */
async function buildText() {
    if (filePath) return fs.readFileSync(filePath, 'utf8');
    const FE = path.join(__dirname, '..', '..', 'frontend');
    const noop = () => {};
    const store = Object.create(null);
    const fe = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, appendChild: noop, setAttribute: noop, addEventListener: noop, remove: noop, value: '', textContent: '', innerHTML: '' });
    const ctx = {
        console: { log: noop, warn: noop, error: noop }, btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'), atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
        setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear: noop, key: () => null, length: 0 },
        sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        document: { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: fe, createTextNode: fe, body: fe(), head: fe(), documentElement: fe(), readyState: 'complete', cookie: '' },
        navigator: { userAgent: 'node-multiparser' }, location: { href: 'http://localhost/' }, fetch: () => Promise.reject(new Error('sin red')),
        Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
        Blob: class {}, URL: { createObjectURL: () => 'x', revokeObjectURL: noop }, performance: { now: () => Date.now() },
        TextEncoder, TextDecoder, ReadableStream, TransformStream, WritableStream, queueMicrotask
    };
    ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js'), 'utf8'), ctx, { filename: 'gen.js', timeout: 60000 });
    vm.runInContext(fs.readFileSync(path.join(FE, 'js', 'ape-v9', 'ape-profiles-config.js'), 'utf8'), ctx, { filename: 'cfg.js', timeout: 60000 });
    const NORM = require(path.join(FE, 'js', 'ape-lab-normalize.js'));
    const REPO = path.join(FE, '..', '..');
    const fx = [process.env.APE_LAB_CALIBRATED_JSON, path.join(REPO, 'artifacts', 'lab', 'calibrated', 'APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF.json')]
        .filter(Boolean).find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
    if (!fx) throw new Error('sin fixture LAB');
    const J = JSON.parse(fs.readFileSync(fx, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.APE_PROFILES_CONFIG.importFromLABData(NORM.normalize(J).data);
    const ids = onlyProfile ? [onlyProfile] : Object.keys(J.profiles);
    const chans = ids.map((id, i) => ({ name: 'T ' + id, url: 'http://example.invalid/live/t/' + (i + 1) + '.m3u8', group: 'G', tvg_id: 't.' + id, 'ape-profile': id, profile: id, id: 5000 + i, stream_id: 5000 + i }));
    const r = ctx.APE_GEN(chans, {});
    if (r && typeof r.getReader === 'function') {
        const rd = r.getReader(); let s = '';
        for (;;) { const { done, value } = await rd.read(); if (done) break; s += (typeof value === 'string' ? value : Buffer.from(value).toString('utf8')); }
        return s;
    }
    return String(r);
}

function runAll(text) {
    const lines = text.split('\n');
    return AUDITORS.map(a => a(lines));
}

/* ══════════ autotest: 7 defectos plantados ══════════ */
function selftest() {
    const base = [
        '#EXTM3U x-tvg-url="http://epg"',
        '#EXTINF:10 tvg-id="a" group-title="G",Canal A',
        '#EXT-X-STREAM-INF:BANDWIDTH=8000000,CODECS="hvc1.2.4.L153.B0",RESOLUTION=1920x1080',
        '#EXTHTTP:{"User-Agent":"VLC/3.0.20"}',
        '#EXTVLCOPT:network-caching=3000',
        '#KODIPROP:inputstream.adaptive.manifest_type=hls',
        'http://example.test/live/a/1.m3u8'
    ].join('\n');

    const cases = [
        { id: 'C1 CODECS sin comillas', mutate: (t) => t.replace('CODECS="hvc1.2.4.L153.B0"', 'CODECS=hvc1.2.4.L153.B0,mp4a.40.2'), expect: 'hls.js' },
        { id: 'C2 RESOLUTION con espacio', mutate: (t) => t.replace('RESOLUTION=1920x1080', 'RESOLUTION=1920 x 1080'), expect: 'hls.js' },
        { id: 'C3 coma final de atributos', mutate: (t) => t.replace('RESOLUTION=1920x1080', 'RESOLUTION=1920x1080,'), expect: 'RFC 8216' },
        { id: 'C4 EXTHTTP JSON inválido', mutate: (t) => t.replace('#EXTHTTP:{"User-Agent":"VLC/3.0.20"}', '#EXTHTTP:{User-Agent:VLC}'), expect: 'ExoPlayer' },
        { id: 'C5 EXTHTTP > 8192 B', mutate: (t) => t.replace('#EXTHTTP:{"User-Agent":"VLC/3.0.20"}', '#EXTHTTP:{"X":"' + 'A'.repeat(8250) + '"}'), expect: 'ExoPlayer' },
        { id: 'C6 BOM UTF-8', mutate: (t) => '\uFEFF' + t, expect: 'hostil' },
        { id: 'C7 KODIPROP fuera de namespace', mutate: (t) => t.replace('#KODIPROP:inputstream.adaptive.manifest_type=hls', '#KODIPROP:manifest_type=hls'), expect: 'Kodi' },
        { id: 'C8 EXTINF con duracion -1', mutate: (t) => t.replace('#EXTINF:10', '#EXTINF:-1'), expect: 'hls.js' },
        { id: 'C9 TARGETDURATION en catalogo (fuerza MEDIA)', mutate: (t) => t.replace('#EXTM3U x-tvg-url="http://epg"', '#EXTM3U x-tvg-url="http://epg"' + String.fromCharCode(10) + '#EXT-X-TARGETDURATION:2'), expect: 'hls.js' },
        { id: 'C10 SESSION-KEY METHOD=NONE', mutate: (t) => t.replace('#EXT-X-STREAM-INF:', '#EXT-X-SESSION-KEY:METHOD=NONE' + String.fromCharCode(10) + '#EXT-X-STREAM-INF:'), expect: 'hls.js' }
    ];

    let ok = 0;
    const rows = [];
    for (const c of cases) {
        const text = c.mutate(base);
        const results = runAll(text);
        const hit = results.find(r => r.bad.length && r.name.includes(c.expect));
        if (hit) ok++; else {
            const anyBad = results.filter(r => r.bad.length).map(r => r.name);
            rows.push({ caso: c.id, detectado: false, esperado: c.expect, detectaron: anyBad });
        }
    }
    /* la base limpia NO debe tener rechazos */
    const clean = runAll(base).filter(r => r.bad.length);
    if (asJson) {
        console.log(JSON.stringify({ selftest: { detectados: ok, total: cases.length, fallos: rows }, base_limpia_sin_rechazos: clean.length === 0, rechazos_base: clean.map(r => r.name) }, null, 2));
    } else {
        console.log('AUTOTEST: ' + ok + '/' + cases.length + ' defectos detectados');
        for (const r of rows) console.log('  ✗ ' + r.caso + ' — esperaba ' + r.esperado + ' · detectaron: ' + (r.detectaron.join(', ') || 'nadie'));
        console.log('BASE LIMPIA sin rechazos: ' + (clean.length === 0 ? 'SI' : 'NO → ' + clean.map(r => r.name).join(', ')));
    }
    process.exit(ok === cases.length && clean.length === 0 ? 0 : 1);
}

(async () => {
    if (SELFTEST) { selftest(); return; }
    let text;
    try { text = await buildText(); } catch (e) { console.error('No se pudo obtener la lista: ' + e.message); process.exit(2); }
    const lines = text.split('\n');
    const profiles = runAll(text);

    const totalBad = profiles.reduce((a, p) => a + p.bad.length, 0);
    if (asJson) {
        console.log(JSON.stringify({
            lineas: lines.length,
            perfiles: profiles.map(p => ({ perfil: p.name, entendidas: p.understood, rechazos: p.bad.length, notas: p.notes })),
            total_rechazos: totalBad
        }, null, 2));
    } else {
        console.log('LISTA AUDITADA: ' + lines.length + ' líneas · origen=' + (filePath ? filePath : 'generador real (12 perfiles)'));
        for (const p of profiles) {
            console.log('\n── ' + p.name.padEnd(20) + (p.bad.length ? 'RECHAZA ' + p.bad.length : 'OK') + ' · entendidas=' + p.understood);
            for (const n of p.notes) console.log('     · ' + n);
            for (const [ln, why, snip] of p.bad.slice(0, 6)) console.log('     ✗ L' + ln + ' ' + why + (snip ? '  → ' + String(snip).slice(0, 80) : ''));
            if (p.bad.length > 6) console.log('     … y ' + (p.bad.length - 6) + ' más');
        }
        console.log('\nTOTAL líneas que algún player RECHAZARÍA: ' + totalBad);
    }
    process.exit(totalBad === 0 ? 0 : 1);
})();
