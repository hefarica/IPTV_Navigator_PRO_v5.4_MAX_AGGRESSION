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
    const ctx = {
        console: quiet, document, HTMLAnchorElement: Anchor, URL: TestURL, URLSearchParams,
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
        get networkRequests() { return networkRequests; } };
}

async function fileBytes(env) {
    const files = env.fsTargets.filter(f => f.closed).map(f => ({ filename: f.filename, bytes: Buffer.concat(f.chunks), destination: 'fs' }));
    for (const saved of env.downloads) files.push({ filename: saved.filename, bytes: Buffer.from(await saved.blob.arrayBuffer()), destination: 'blob', managedGzip: saved.managedGzip });
    return files;
}

function textOf(file) {
    return (file.filename.endsWith('.gz') ? zlib.gunzipSync(file.bytes) : file.bytes).toString('utf8');
}

function checkPlaylist(text, channels, cdn) {
    const uris = text.split(/\r?\n/).filter(line => /^https?:\/\//.test(line));
    assert.equal((text.match(/^#EXTINF:/gm) || []).length, channels.length, 'channel count');
    assert.equal(uris.length, channels.length, 'one URI per channel');
    for (let i = 0; i < channels.length; i++) {
        const expected = cdn && i === 0 ? channels[i].url.replace('https://', 'https://relay.invalid/cdn/') : channels[i].url;
        // Includes pipe headers if the real generator appends them; source URI
        // itself, including encoded auth/query bytes, must be unchanged.
        assert.equal(uris[i].split('|')[0], expected, 'exact source/auth URI');
    }
    assert.equal((text.match(/^#EXT-X-APE-REA:/gm) || []).length, channels.length, 'REA request on every channel');
    assert.ok(!/#EXT-X-STREAM-INF:/.test(text), 'unknown fixture source does not gain invented native attributes');
}

async function test(label, body) { await body(); passed++; console.log('PASS ' + label); }

async function main() {
    for (const picker of [false, true]) for (const gzip of [false, true]) for (const mode of ['direct', 'cdn', 'both']) {
        await test(mode + ' / ' + (picker ? 'FSAA' : 'Blob') + ' / gzip=' + gzip, async () => {
            const env = environment({ picker, gzip });
            const opts = { filename: 'dispatch.m3u8', hud: false };
            const result = mode === 'direct'
                ? await env.ctx.APEGenerationController.prepublishAndGenerateDirect(opts)
                : await env.ctx.APEGenerationController.prepublishAndGenerateDual({ ...opts, dual: mode });
            assert.equal(result.decision, 'generated_no_audit');
            assert.equal(env.generationCalls, 1, 'single producer pass');
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
        assert.equal(env.generationCalls, 1);
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

    console.log(JSON.stringify({ passed, scope: 'production_dispatch_small_fixtures', physical_playback_verified: false }));
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
