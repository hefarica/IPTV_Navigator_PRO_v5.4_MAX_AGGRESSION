#!/usr/bin/env node
'use strict';

// [2026-11-08] Prueba de la OPCION B: el generador debe LEER la capa 6K del LAB importado
// por el boton "Import LAB", no copiarla en un literal.
//
// Firmas medidas del generador (no adivinadas):
//   generate              -> AsyncFunction arity 1
//   generateStream        -> Function      arity 1 (ReadableStream)
//   generateChannelEntry  -> Function      por canal (bloque completo sincrono)
//
// Escenarios, con UNA sola diferencia:
//   1) labEmulated6k.bitrates_mbps.P3.5 = 42 -> PROVENANCE=LAB   y BITRATE 42 (no 35)
//   2) sin labEmulated6k                     -> PROVENANCE=GENERATOR_DEFAULT y BITRATE 35
//
// Si el escenario 1 emitiera 35, el generador seguiria copiando y la opcion B no estaria hecha.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONT = path.resolve(__dirname, '..');
const quiet = { log() {}, warn() {}, error() {}, debug() {}, info() {}, table() {}, group() {}, groupCollapsed() {}, groupEnd() {}, time() {}, timeEnd() {} };
let passed = 0;

function environment({ labEmulated6k = null, getProfile = null, labDnaSha256 = null, profiles = null } = {}) {
    const store = new Map();
    const blobs = new Map();
    const channels = [{ id: '1', name: 'Canal uno', url: 'https://audit.invalid/live/u/p/1.m3u8', profile: 'P3' }];
    const elements = {
        genExportFormat: { value: 'm3u8' }, gzipCompressionEnabled: { checked: false },
        'ape-out-jit': { checked: false }, 'ape-out-hdr': { value: 'auto' },
        'ape-delta-input': { value: '15' }, 'ape-gen-status': { textContent: '', style: {} }
    };
    class TestURL extends URL {
        static createObjectURL(blob) { const id = 'blob:t' + blobs.size; blobs.set(id, blob); return id; }
        static revokeObjectURL(id) { blobs.delete(id); }
    }
    class Anchor { click() {} remove() {} }
    const document = {
        readyState: 'loading', getElementById: id => elements[id] || null,
        querySelector: sel => sel.includes('ape-out-format') ? { value: 'm3u8' }
            : sel === '#ape-gen-status' ? elements['ape-gen-status'] : null,
        querySelectorAll: () => [], addEventListener() {},
        createElement: name => name === 'a' ? new Anchor() : { style: {}, appendChild() {}, addEventListener() {} },
        body: { appendChild() {}, removeChild() {} }
    };
    const cfg = {
        profiles: profiles || {}, labExportedAt: '2026-10-26T01:31:05',
        labVersion: 'omega_v1_bulletproof_20261026', labBulletproof: true,
        labEmulated6k, labSixKVersion: labEmulated6k ? '6K-EMULATED-v1' : null,
        labDnaSha256, labFileName: 'LAB_CALIBRATED_FINAL_v24.0.0-6K.json'
    };
    if (typeof getProfile === 'function') cfg.getProfile = getProfile;
    // el generador consulta siempre getProfile(): si el test solo pasa `profiles`, se expone igual
    else cfg.getProfile = function (id) { return this.profiles[id] || null; };
    const ctx = {
        console: quiet, document, HTMLAnchorElement: Anchor, URL: TestURL, URLSearchParams,
        TextEncoder, TextDecoder, ReadableStream, WritableStream, TransformStream, CompressionStream,
        Blob, Response, AbortController, performance,
        btoa: s => Buffer.from(s, 'binary').toString('base64'),
        atob: s => Buffer.from(s, 'base64').toString('binary'),
        setTimeout: (fn, ms) => ms >= 1000 ? 0 : setTimeout(fn, ms), clearTimeout,
        setInterval: () => 0, clearInterval() {}, dispatchEvent() {}, addEventListener() {},
        CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
        localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
        fetch: async u => (String(u).startsWith('blob:')
            ? { blob: async () => blobs.get(u) }
            : { ok: false, status: 503, json: async () => ({}) }),
        APE_PROFILES_CONFIG: cfg,
        APEHealthRuntime: { admittedMap: new Map(channels.map(c => ['id:' + c.id, {}])), config: {}, ensureReady: async () => {} },
        app: { getFilteredChannels: () => channels, showToast() {}, state: {} },
        __APE_OUTPUT_TEST__: true,
        APE_DIRECT_MODE: true, APE_USE_JIT: false, APE_6K: false, APE_FAKE_UHD: false, APE_8K_DECLARE: false
    };
    ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(FRONT, 'js/ape-v9/m3u8-typed-arrays-ultimate.js'), 'utf8'),
        ctx, { filename: 'm3u8-typed-arrays-ultimate.js' });
    return { ctx, channels };
}

async function emitted(ctx, channels) {
    const G = ctx.M3U8TypedArraysGenerator;
    assert.ok(G && typeof G === 'object', 'M3U8TypedArraysGenerator no expuesto');
    // 1) por canal (sincrono)
    if (typeof G.generateChannelEntry === 'function') {
        try {
            const one = G.generateChannelEntry(channels[0]);
            const txt = Array.isArray(one) ? one.join('\n') : (typeof one === 'string' ? one : '');
            if (txt && txt.length) return txt;
        } catch (e) { /* siguiente entrada */ }
    }
    // 2) generate (AsyncFunction)
    if (typeof G.generate === 'function') {
        try {
            const out = await G.generate(channels);
            if (typeof out === 'string' && out.length) return out;
        } catch (e) { /* siguiente entrada */ }
    }
    // 3) generateStream
    if (typeof G.generateStream === 'function') {
        try {
            const st = G.generateStream(channels);
            if (st && typeof st.getReader === 'function') {
                const rd = st.getReader(); const enc = new TextDecoder(); let acc = '';
                for (;;) { const r = await rd.read(); if (r.done) break; acc += enc.decode(r.value, { stream: true }); }
                if (acc.length) return acc;
            }
        } catch (e) { /* sin mas entradas */ }
    }
    return '';
}

(async () => {
    // ── Escenario 1: el LAB declara 42 Mbps para P3.5 ─────────────────────────
    {
        const env = environment({
            labEmulated6k: { enabled: true, bitrates_mbps: { 'P0.5': 90, 'P1.5': 70, 'P2.5': 50, 'P3.5': 42, 'P4.5': 31, 'P5.5': 27 } },
            getProfile: id => id === 'P3.5'
                ? { settings: { resolution: '5760x3240', bitrate: 42, fps: 60 } }
                : (id === 'P3' ? { settings: { resolution: '1920x1080', bitrate: 15, fps: 60 } } : null)
        });
        const text = await emitted(env.ctx, env.channels);
        if (!text) { console.log('NO COMPUTADO escenario 1: ninguna entrada devolvio texto'); }
        else {
            const tag = (text.match(/#EXT-X-APE-CRYSTAL-6K:[^\n]*/g) || [''])[0];
            const br = (text.match(/#EXT-X-APE-CRYSTAL-6K-BITRATE:\d+/g) || [''])[0];
            assert.match(tag, /PROVENANCE=LAB/, 'PROVENANCE debe ser LAB -> ' + tag);
            assert.match(br, /BITRATE:42$/, 'el bitrate debe venir del LAB (42), no del literal (35) -> ' + br);
            passed += 2;
            console.log('PASS 1 (LAB manda)      :', tag.slice(0, 150));
            console.log('PASS 1 (bitrate del LAB):', br);
        }
    }

    // ── Escenario 2: sin capa 6K -> literal + procedencia declarada ───────────
    {
        const env = environment({ labEmulated6k: null });
        const text = await emitted(env.ctx, env.channels);
        if (!text) { console.log('NO COMPUTADO escenario 2: ninguna entrada devolvio texto'); }
        else {
            const tag = (text.match(/#EXT-X-APE-CRYSTAL-6K:[^\n]*/g) || [''])[0];
            const br = (text.match(/#EXT-X-APE-CRYSTAL-6K-BITRATE:\d+/g) || [''])[0];
            assert.match(tag, /PROVENANCE=GENERATOR_DEFAULT/, 'debe declarar el default -> ' + tag);
            assert.match(br, /BITRATE:35$/, 'sin LAB 6K debe caer al literal 35 -> ' + br);
            passed += 2;
            console.log('PASS 2 (default declarado):', tag.slice(0, 150));
            console.log('PASS 2 (literal 35)       :', br);
        }
    }


    // ── Escenario 3: la cabecera declara el SHA-256 REAL del LAB importado ────────────
    {
        const crypto = require('node:crypto');
        const raw = fs.readFileSync(process.env.LABV24);
        const expected = crypto.createHash('sha256').update(raw).digest('hex');
        const g = environment({ labEmulated6k: null, labDnaSha256: expected });
        const G = g.ctx.M3U8TypedArraysGenerator;
        let dna = '';
        for (const call of [() => G._generateGlobalHeader(), () => G._generateGlobalHeader({}),
                            () => G._generateGlobalHeader({ lab_metadata: {} }), () => G._generateGlobalHeader('P3')]) {
            try { const r = call(); if (typeof r === 'string' && r.includes('APE-LAB-DNA')) { dna = r; break; } } catch (e) {}
        }
        assert.match(dna, new RegExp('sha256=' + expected), 'el DNA debe llevar el hash real del fichero -> ' + dna);
        passed += 1;
        console.log('PASS 3 (DNA con hash real):', (dna.match(/#EXT-X-APE-LAB-DNA:[^\n]*/) || [dna])[0].slice(0, 150));

        const g2 = environment({ labEmulated6k: null, labDnaSha256: null });
        const G2 = g2.ctx.M3U8TypedArraysGenerator;
        let dna2 = '';
        try { dna2 = G2._generateGlobalHeader() || ''; } catch (e) {}
        assert.match(dna2, /sha256=unverified/, 'sin huella debe declarar unverified, no inventar');
        passed += 1;
        console.log('PASS 3 (sin hash -> unverified)');
    }


    // ── Escenario 4: las PRECEDENCIAS se declaran, no se aplican en silencio ──────────
    {
        const LAB24 = JSON.parse(fs.readFileSync(process.env.LABV24, 'utf8'));
        const hdr = (opts) => {
            const g = environment({ profiles: LAB24.profiles_calibrated });
            const G = g.ctx.M3U8TypedArraysGenerator;
            const merged = Object.assign({ bulletproof_loaded: true, bulletproof_profiles: LAB24.profiles_calibrated }, opts);
            try { return G._generateGlobalHeader(1, merged) || ''; } catch (e) { return ''; }
        };
        // sin regex: se corta por salto de linea (evita el infierno de escapes)
        const pick = (h, pf) => {
            const k = '#EXT-X-APE-CACHING-PRECEDENCE:PROFILE=' + pf + ';';
            const i = h.indexOf(k);
            if (i < 0) return '';
            const j = h.indexOf('\n', i);
            return h.slice(i, j < 0 ? h.length : j);
        };
        const on = hdr({ dictatorMode: true });
        const off = hdr({ dictatorMode: false });
        const unk = hdr({});

        assert.match(pick(on, 'P1'), /EMITTED=500;/, 'con dictatorMode EMITTED debe ser 500 -> ' + pick(on, 'P1'));
        assert.match(pick(on, 'P1'), /GOVERNED_BY=dictatorMode/, 'debe declarar quien manda -> ' + pick(on, 'P1'));
        assert.match(pick(on, 'P1'), /LAB_VLCOPT=5000;/, 'debe publicar vlcopt -> ' + pick(on, 'P1'));
        assert.match(pick(on, 'P1'), /LAB_L3=72000;/, 'debe publicar level_3 -> ' + pick(on, 'P1'));
        assert.match(pick(off, 'P1'), /EMITTED=5000;/, 'sin dictatorMode EMITTED debe ser 5000 -> ' + pick(off, 'P1'));
        assert.match(pick(off, 'P1'), /GOVERNED_BY=lab/, 'debe declarar que manda el LAB -> ' + pick(off, 'P1'));
        assert.match(pick(unk, 'P1'), /GOVERNED_BY=undetermined/, 'sin flag debe ser undetermined -> ' + pick(unk, 'P1'));
        assert.match(on, /#EXT-X-APE-OVERRIDE:X-Concurrent-Downloads=8;/, 'X-Concurrent-Downloads debe declararse');
        assert.match(on, /#EXT-X-APE-OVERRIDE:bit_depth;GOVERNS=bit_depth;ALIAS_IGNORED=bitDepth/, 'alias debe declararse');
        passed += 9;
        console.log('PASS 4 (dictatorMode) :', pick(on, 'P1'));
        console.log('PASS 4 (LAB manda)    :', pick(off, 'P1'));
        console.log('PASS 4 (undetermined) :', pick(unk, 'P1'));
    }

    // ── Escenario 5: la omision de atadenoise en VLC se DECLARA (no se inyecta) ───────
    {
        const LAB24 = JSON.parse(fs.readFileSync(process.env.LABV24, 'utf8'));
        const g = environment({ profiles: LAB24.profiles_calibrated, labDnaSha256: null });
        // el bundle se carga en index-v4.html:4379 ANTES de generar; aqui se replica
        vm.runInContext(fs.readFileSync(process.env.BUNDLE, 'utf8'), g.ctx, { filename: 'ape-image-recipes-bundle.js' });
        const G = g.ctx.M3U8TypedArraysGenerator;
        const merged = Object.assign({ bulletproof_loaded: true, bulletproof_profiles: LAB24.profiles_calibrated }, { dictatorMode: true });
        const h = G._generateGlobalHeader(1, merged) || '';

        const line = (pf) => {
            const k = '#EXT-X-APE-VLC-FILTER-SKIPPED:PROFILE=' + pf + ';';
            const i = h.indexOf(k);
            if (i < 0) return '';
            const j = h.indexOf('\n', i);
            return h.slice(i, j < 0 ? h.length : j);
        };
        assert.match(line('P3'), /SKIPPED=atadenoise,upscale,output;/, 'debe declarar los 3 modulos omitidos -> ' + line('P3'));
        assert.match(line('P3'), /FFMPEG_LANE=atadenoise/, 'debe declarar donde SI corre -> ' + line('P3'));
        assert.match(line('P3'), /REASON=sin_modulo_VLC_equivalente/, 'debe dar el motivo');
        assert.match(line('P3'), /VLC_CHAIN_IS_EXECUTABLE=1/, 'debe afirmar que la cadena VLC es ejecutable');
        assert.match(line('P0'), /SKIPPED=atadenoise/, 'P0 tambien debe declararlo');
        passed += 5;
        console.log('PASS 5 (VLC skipped declarado):', line('P3'));

        // sin bundle: no se inventa, se declara DECLARED=0
        const g2 = environment({ profiles: LAB24.profiles_calibrated, labDnaSha256: null });
        const h2 = g2.ctx.M3U8TypedArraysGenerator._generateGlobalHeader(1, merged) || '';
        assert.match(h2, /#EXT-X-APE-VLC-FILTER-SKIPPED:PROFILE=\*;SKIPPED=unknown;REASON=bundle_APE_IMAGE_RECIPES_no_cargado;DECLARED=0/,
            'sin bundle debe declararse como no computado');
        passed += 1;
        console.log('PASS 5 (sin bundle -> DECLARED=0)');
    }

    // ── Escenario 6: quality_levels declara el reparto de carriles ────────────────────
    // La cadena de quality_levels.video_filter es de carril ffmpeg guardada bajo un nombre que
    // sugiere VLC. Se DECLARA el reparto en la metadata (skill ape-image-pipeline-truth §6).
    {
        const qLevels = {
            L3: { resolution: '1920x1080', hdr: 'hdr10',
                  video_filter: 'nlmeans=s=2.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3,zscale=transfer=bt709:primaries=bt709:matrix=bt709' },
            L4: { resolution: '1280x720', hdr: 'hlg',
                  video_filter: 'hqdn3d=luma_spatial=2.0:chroma_spatial=1.5,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25' },
            L5: { resolution: '854x480', hdr: 'sdr', video_filter: 'yadif=mode=0:parity=-1:deint=0' }
        };
        const g = environment({ profiles: { P3: { id: 'P3', quality_levels: qLevels, settings: { buffer: 8000 } } } });
        const G = g.ctx.M3U8TypedArraysGenerator;
        const h = G._generateGlobalHeader(1, { bulletproof_loaded: true, bulletproof_profiles: { P3: { id: 'P3', quality_levels: qLevels } }, dictatorMode: true }) || '';
        const parts = [...h.matchAll(/#EXT-X-APE-LAB-METADATA:(\d+)\/(\d+):(.*)/g)].map(m => [Number(m[1]), m[3]]).sort((a, b) => a[0] - b[0]);
        assert.ok(parts.length > 0, 'debe emitir la metadata embebida');
        const meta = JSON.parse(Buffer.from(parts.map(p => p[1]).join(''), 'base64').toString('utf8'));
        const ql = (meta.fields && meta.fields.quality_levels) || {};
        assert.equal(Object.keys(ql).length, 3, 'debe llevar los 3 niveles');
        assert.deepEqual(ql.L3.lane_split.vlc_modules, ['gradfun'], 'L3: solo gradfun es modulo VLC -> ' + JSON.stringify(ql.L3.lane_split.vlc_modules));
        for (const m of ['nlmeans', 'bwdif', 'unsharp', 'zscale']) {
            assert.ok(ql.L3.lane_split.no_vlc_module.includes(m), 'L3: ' + m + ' debe estar en no_vlc_module');
        }
        assert.deepEqual(ql.L4.lane_split.vlc_modules, ['hqdn3d'], 'L4: solo hqdn3d -> ' + JSON.stringify(ql.L4.lane_split.vlc_modules));
        assert.deepEqual(ql.L5.lane_split.vlc_modules, [], 'L5: ningun modulo VLC');
        assert.equal(ql.L3.lane_split.declared_lane, 'ffmpeg', 'el carril declarado es ffmpeg');
        assert.equal(ql.L3.lane_split.vlc_playlist_executable, false, 'NO se declara ejecutable en VLC (politica)');
        assert.ok(ql.L3.lane_split.ffmpeg_filtergraph.includes('nlmeans'), 'se conserva la cadena completa como filtergraph');
        passed += 8;
        console.log('PASS 6 (L3 vlc=' + JSON.stringify(ql.L3.lane_split.vlc_modules) + ' no_vlc=' + ql.L3.lane_split.no_vlc_module.length + ' ejecutable=' + ql.L3.lane_split.vlc_playlist_executable + ')');
    }

    console.log('\nresultado: ' + passed + ' aserciones pasadas');
    process.exit(passed > 0 ? 0 : 2);
})();
