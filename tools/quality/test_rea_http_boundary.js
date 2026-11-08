#!/usr/bin/env node
'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const front = path.resolve(__dirname, '../../IPTV_v5.4_MAX_AGGRESSION/frontend');
const policy = require(path.join(front, 'js/ape-v9/rea-processing-policy.js'));
const factory = require(path.join(front, 'js/ape-v9/rea-export-finalizer.js'));
let checks = 0;
function ok(value) { assert.ok(value); checks++; }
function eq(a, b) { assert.deepEqual(a, b); checks++; }
function env(extra = {}) {
    const quiet = Object.fromEntries(['log','warn','error','debug','info','table','group','groupEnd','time','timeEnd'].map(k => [k, () => {}]));
    const ctx = Object.assign({ console: quiet, URL, URLSearchParams, TextEncoder, TextDecoder, ReadableStream,
        TransformStream, Blob, AbortController, performance, btoa: s => Buffer.from(s, 'binary').toString('base64'),
        atob: s => Buffer.from(s, 'base64').toString('binary'), setTimeout: (fn, ms) => ms >= 1000 ? 0 : setTimeout(fn, ms), clearTimeout, setInterval: () => 0, clearInterval() {},
        fetch: async () => { throw new Error('Network forbidden in HTTP boundary regression'); },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        document: { readyState: 'loading', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
        navigator: {}, location: { origin: 'https://fixture.invalid' }, alert() {},
        APE_REA_POLICY: policy, APE_PROFILES_CONFIG: { reaProcessing: policy.policy, labVersion: 'omega_v1', bulletproof: true, profiles: {} },
        APE_DIRECT_MODE: true, APE_USE_JIT: false, APE_6K: false, APE_FAKE_UHD: false, APE_8K_DECLARE: false,
        app: { state: { activeHeaders: {}, activeServers: [] }, getFilteredChannels: () => [] }
    }, extra);
    ctx.window = ctx; ctx.self = ctx; ctx.global = ctx; ctx.APE_REA_EXPORT = factory(ctx); vm.createContext(ctx); return ctx;
}
function load(ctx, file) { vm.runInContext(fs.readFileSync(path.join(front, file), 'utf8'), ctx, { filename: file }); }
const headers = { Authorization: 'Bearer fixture-only', Cookie: 'session=fixture', Referer: 'https://ref.fixture.invalid/',
    'User-Agent': 'Fixture/1+original', Origin: 'https://ref.fixture.invalid', 'X-Provider-Token': 'fixture-token' };
const url = 'http://fixture.invalid:80/live/1.m3u8?sig=a%2Bb+c&expires=1';
const ch = { id: '1', stream_id: '1', tvg_id: '1', name: 'Fixture', group: 'Fixture', profile: 'P3', url, headers };
function inspect(text) {
    const tags = text.split('\n').filter(l => l.startsWith('#EXTHTTP:'));
    eq(tags.length, 1);
    const raw = tags[0].slice(9), parsed = JSON.parse(raw);
    ok(Object.keys(parsed).length <= 200); ok(Buffer.byteLength(raw, 'utf8') <= 8192);
    const lower = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k.toLowerCase(), v]));
    eq(Object.keys(lower).length, Object.keys(parsed).length);
    for (const [k, v] of Object.entries(headers)) eq(lower[k.toLowerCase()], v);
    ok(text.split('\n').some(line => line === url || line.startsWith(url + '|')));
    for (const line of text.split('\n').filter(l => /^#KODIPROP:inputstream\.adaptive\.(stream|manifest)_headers=/.test(l))) {
        const decoded = new URLSearchParams(line.slice(line.indexOf('=') + 1));
        eq(decoded.get('Authorization'), headers.Authorization);
    }
}
async function main() {
    const ctx = env(); load(ctx, 'js/ape-v9/m3u8-typed-arrays-ultimate.js');
    const gen = ctx.M3U8TypedArraysGenerator;
    inspect(gen.generateChannelEntry(ch, 'P3', 0, {}, {}));
    const late = Object.fromEntries(Array.from({ length: 150 }, (_, i) => ['X-Optional-' + i, '漢'.repeat(60)]));
    const large = gen.generateChannelEntry(ch, 'P3', 0, {}, { bulletproof_profiles: { P3: { player_enslavement: { level_3_per_channel: { EXTHTTP: late } } } } });
    inspect(large); ok(large.includes('#EXT-X-APE-REA-HTTP-OVERFLOW:'));
    for (const bad of [{ Authorization: 'fixture\r\nInjected: fixture' }, { 'Bad\nName': 'fixture' },
        { Authorization: 'é'.repeat(4500) }, Object.fromEntries(Array.from({ length: 201 }, (_, i) => ['X-Required-' + i, 'fixture']))]) {
        assert.throws(() => gen.generateStream([{ ...ch, headers: bad }], { hud: false }), error => {
            ok(error.message.startsWith('REA_EXTHTTP_')); ok(!error.message.includes(url)); ok(!error.message.includes('Injected')); return true;
        }); checks++;
    }
    for (const field of ['http_headers', 'httpHeaders', 'requestHeaders']) {
        inspect(gen.generateChannelEntry({ ...ch, headers: undefined, [field]: headers }, 'P3', 0, {}, {}));
    }
    inspect(gen.generateChannelEntry({ ...ch, headers: undefined, base: { headers } }, 'P3', 0, {}, {}));
    const signed = url + '|Authorization=Bearer%20fixture-only&User-Agent=Fixture%2F1%2Boriginal';
    const inline = ctx.APE_REA_EXPORT.finalizeChannelBlock('#EXTINF:-1,Fixture\n' + signed, { channel: { url: signed } });
    ok(inline.split('\n').includes(signed));
    eq(JSON.parse(inline.split('\n').find(l => l.startsWith('#EXTHTTP:')).slice(9)).Authorization, headers.Authorization);
    const duplicate = ctx.APE_REA_EXPORT.finalizeChannelBlock('#EXTINF:-1,Fixture\n#EXTHTTP:{"authorization":"old","User-Agent":"old"}\n' + url, { channel: ch });
    inspect(duplicate);
    eq(ctx.APE_REA_EXPORT.finalizeChannelBlock(duplicate, { channel: ch }), duplicate);
    load(ctx, 'export-module.js'); inspect(new ctx.ExportModule(ctx.app).generateM3U8([ch], { silent: true }));
    const neighbour = { ...ch, id: '2', stream_id: '2', tvg_id: '2', name: 'Neighbour', url: url.replace('/1.', '/2.'),
        headers: { ...headers, Authorization: 'Bearer second-fixture', Cookie: 'session=second-fixture' } };
    const pair = new ctx.ExportModule(ctx.app).generateM3U8([ch, neighbour], { silent: true });
    const blocks = pair.split(/(?=^#EXTINF:)/m);
    eq(blocks.length, 3); ok(!blocks[0].includes('#EXTHTTP:'));
    for (const [index, channel] of [ch, neighbour].entries()) {
        const block = blocks[index + 1], lines = block.split('\n');
        eq(lines.filter(line => line.startsWith('#EXTHTTP:')).length, 1);
        const auth = JSON.parse(lines.find(line => line.startsWith('#EXTHTTP:')).slice(9));
        eq(auth.Authorization, channel.headers.Authorization); eq(auth.Cookie, channel.headers.Cookie);
        ok(lines.indexOf('#EXTHTTP:' + JSON.stringify(auth)) > lines.findIndex(line => line.startsWith('#EXTINF:')));
        ok(lines.includes(channel.url));
    }
    const barUrl = 'https://fixture.invalid/live.m3u8?selection=a|b&signed=literal%2B';
    const barOutput = ctx.APE_REA_EXPORT.finalizeChannelBlock('#EXTINF:-1,Bar\n' + barUrl, { channel: { url: barUrl } });
    ok(barOutput.split('\n').includes(barUrl)); ok(!barOutput.includes('#EXTHTTP:'));
    for (const media of [
        '#EXTM3U\r\n#EXT-X-TARGETDURATION:6\r\n#EXT-X-MEDIA-SEQUENCE:0\r\n#EXT-X-MAP:URI="init.mp4"\r\n#EXTINF:0.000,\r\nchunk.m4s\r\n',
        '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:1\n#EXT-X-TARGETDURATION:2\n#EXTINF:0,\nsegment.ts\n',
        '#EXTM3U\n#EXT-X-PART:DURATION=0.5,URI="part.m4s"\n#EXT-X-PRELOAD-HINT:TYPE=PART,URI="next.m4s"\n'
    ]) {
        eq(ctx.APE_REA_EXPORT.finalizePlaylist(media, [ch], {}), media);
        eq(ctx.APE_REA_EXPORT.finalizeChannelBlock(media, { channel: ch }), media);
    }
    load(ctx, 'js/m3u8-world-class-generator.js'); inspect(ctx.WorldClassM3U8Generator.generate([ch], {}).content);
    load(ctx, 'js/ape-v9/unified-generator-integration.js'); inspect(ctx.UnifiedGenerator.generate([ch], {}));
    load(ctx, 'js/ape-v9/m3u8-api-wrapper-integrated.js'); inspect(new ctx.M3U8APIWrapper({ validateOnGenerate: false }).generateM3U8([ch], {}));
    load(ctx, 'js/m3u8-generator-v16-elite.js'); inspect(ctx.apeEliteGenerator.generate([ch], { P3: { id: 'P3', settings: { resolution: '1920x1080', codec: 'HEVC', fps: 60, bitrate: 15 } } }));
    const messages = [], worker = env({ postMessage: message => messages.push(message) }); delete worker.document;
    worker.importScripts = (...files) => files.forEach(file => load(worker, 'js/' + file));
    load(worker, 'js/ape-worker.js');
    await worker.onmessage({ data: { type: 'start_generation', channels: [ch], config: { obfuscate: false, userAgent: 'Fixture' } } });
    inspect(messages.find(message => message.type === 'complete').blob);
    const keys = JSON.parse('{"__proto__":"fixture-only"}');
    const guarded = ctx.APE_REA_EXPORT.finalizeChannelBlock('#EXTINF:-1,Fixture\n' + url, { channel: { url, headers: keys } });
    eq(JSON.parse(guarded.split('\n').find(l => l.startsWith('#EXTHTTP:')).slice(9)).__proto__, 'fixture-only');
    eq(Object.prototype['fixture-only'], undefined);
    console.log(JSON.stringify({ ok: true, checks, scope: 'production finalizer and seven emitters, UTF-8 final budgets, exact auth, signed URI, stream preflight; no network/device' }));
}
const completionGuard = setTimeout(() => { console.error('HTTP boundary regression did not complete'); process.exitCode = 1; }, 15000);
main().then(() => clearTimeout(completionGuard)).catch(error => { clearTimeout(completionGuard); console.error(error.stack); process.exitCode = 1; });
