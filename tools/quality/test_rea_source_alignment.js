#!/usr/bin/env node
'use strict';

// Execute the production generator, policy and prober with local manifest
// fixtures. No provider, VPS, credentials, deployment or output files are used.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/frontend');
const POLICY = require(path.join(FRONTEND, 'js/ape-v9/rea-processing-policy.js'));
const quiet = { log() {}, warn() {}, error() {}, debug() {}, info() {}, table() {}, group() {}, groupEnd() {}, time() {}, timeEnd() {} };
let checks = 0;
function check(value, description) { assert(value, description); checks++; }

function environment(extra = {}) {
    const store = new Map();
    const ctx = Object.assign({
        console: quiet, URL, URLSearchParams, TextEncoder, TextDecoder,
        ReadableStream, TransformStream, Blob, AbortController, performance,
        btoa: s => Buffer.from(s, 'binary').toString('base64'),
        atob: s => Buffer.from(s, 'base64').toString('binary'),
        setTimeout: (fn, ms) => ms >= 1000 ? 0 : setTimeout(fn, ms),
        clearTimeout, setInterval: () => 0, clearInterval() {},
        fetch: async () => { throw new Error('Network forbidden in REA regression'); },
        localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
        APE_REA_POLICY: POLICY,
        APE_PROFILES_CONFIG: { reaProcessing: POLICY.policy },
        APE_DIRECT_MODE: true, APE_USE_JIT: false, APE_6K: false,
        APE_FAKE_UHD: false, APE_8K_DECLARE: false
    }, extra);
    ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
    ctx.APE_REA_EXPORT = require(path.join(FRONTEND, 'js/ape-v9/rea-export-finalizer.js'))(ctx);
    vm.createContext(ctx);
    return ctx;
}

function load(ctx, relative) {
    const filename = path.join(FRONTEND, relative);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), ctx, { filename });
}

function makeProbe(uri, resolution, videoRange = 'SDR', videoCodec = 'avc1.640028') {
    const result = { source: 'PROBED_MASTER', resolution, videoCodec, audioCodec: 'ec-3',
        frameRate: 25, videoRange, bandwidth: 2800000, avgBandwidth: 2300000,
        probedAt: '2026-11-07T00:00:00Z' };
    result.provenance = { schema: 'ape.probe-provenance/1', scope: 'channel_url',
        requestedUrl: uri, responseUrl: uri,
        observedFields: ['resolution', 'videoCodec', 'audioCodec', 'frameRate', 'videoRange', 'bandwidth', 'avgBandwidth'] };
    return result;
}

function jsonTag(text, prefix) {
    const line = text.split('\n').find(s => s.startsWith(prefix));
    assert(line, 'Missing ' + prefix);
    return JSON.parse(line.slice(prefix.length));
}

function streamLine(text) { return text.split('\n').find(s => s.startsWith('#EXT-X-STREAM-INF:')); }
function attrs(line) {
    const out = {};
    for (const match of String(line).matchAll(/([A-Z-]+)=("[^"]*"|[^,]+)/g)) out[match[1]] = match[2].replace(/^"|"$/g, '');
    return out;
}

async function generatorTests() {
    const ctx = environment();
    load(ctx, 'js/ape-v9/m3u8-typed-arrays-ultimate.js');
    const gen = ctx.M3U8TypedArraysGenerator;
    const api = ctx.APE_REA_EXPORT;
    check(!!api && typeof api.finalizePlaylist === 'function', 'Shared legacy export API exists');
    check(!gen._generateGlobalHeader(1, {}).split('\n').some(l => l.startsWith('#EXT-X-I-FRAME-STREAM-INF:')), 'Global header does not invent an I-frame rendition');
    const sources = [
        ['P5', '640x480', '1920x1440'], ['P4', '1280x720', '2560x1440'],
        ['P3', '1920x1080', '3840x2160'], ['P1', '3840x2160', '5760x3240'],
        ['P0', '7680x4320', '7680x4320']
    ];
    const modes = [{}, { maxQualityMode: true }, { perceptual4kMode: true },
        { hdr_force: 'pq' }, { hdr_force: 'sdr' }, { dictatorMode: true, dictatorTier: '8K' }];
    for (const [profile, source, target] of sources) {
        const uri = 'https://audit.invalid/live/' + profile + '.m3u8?token=fixture';
        const ch = { id: profile, tvg_id: profile, name: 'Fixture ' + profile, url: uri,
            _probeData: makeProbe(uri, source) };
        const before = JSON.stringify(ch._probeData);
        for (const mode of modes) {
            const out = gen.generateChannelEntry(ch, profile, 0, {}, mode);
            const si = streamLine(out), a = attrs(si);
            const intent = jsonTag(out, '#EXT-X-APE-REA:');
            const observed = jsonTag(out, '#EXT-X-APE-SOURCE:');
            check(a.RESOLUTION === source, 'Observed resolution survives every output mode: ' + source);
            check(a.CODECS === 'avc1.640028,ec-3', 'Exact video/audio codecs survive, including E-AC-3');
            check(a['VIDEO-RANGE'] === 'SDR', 'HDR preference cannot relabel an SDR source');
            check(a.BANDWIDTH === '2800000' && a['AVERAGE-BANDWIDTH'] === '2300000', 'Observed bandwidths survive profile floors');
            check(a['FRAME-RATE'] === '25.000', 'Observed source frame rate survives MEMC intent');
            check(!a['HDCP-LEVEL'] && !a['BIT-DEPTH'], 'No unobserved HDCP/depth declaration');
            check(intent.targetResolution === target && intent.status === 'requested_only', 'REA target is a requested processing result');
            check(intent.hdrVerified === false && intent.execution === 'not_verified', 'Metadata does not certify physical HDR/execution');
            check(observed.status === 'observed' && observed.resolution === source, 'Source tag agrees with source attributes');
            const lines = out.split('\n'), siIndex = lines.indexOf(si);
            check(lines[siIndex + 1].startsWith(uri), 'STREAM-INF remains adjacent to original URI');
            check(lines.filter(l => /^https?:/.test(l)).length === 1, 'One URI per channel in every mode');
            check(api.finalizeChannelBlock(out, { channel: ch, options: mode }) === out, 'Finalizer is idempotent');
            check(JSON.stringify(ch._probeData) === before, 'Source evidence is not mutated');
        }
    }

    const url = 'https://audit.invalid/live/hlg.m3u8';
    const hlg = { id: 'hlg', name: 'HLG fixture', url, _probeData: makeProbe(url, '3840x2160', 'HLG', 'hvc1.2.4.L153.B0') };
    const hlgText = gen.generateChannelEntry(hlg, 'P1', 0, {}, { hdr_force: 'pq', maxQualityMode: true });
    check(attrs(streamLine(hlgText))['VIDEO-RANGE'] === 'HLG', 'HLG stays HLG despite force PQ/max quality');
    check(jsonTag(hlgText, '#EXT-X-APE-REA:').runtimeFallback === 'native_playback', 'HLG specifies native playback fallback');
    const pq = { ...hlg, _probeData: makeProbe(url, '3840x2160', 'PQ', 'hvc1.2.4.L153.B0') };
    check(attrs(streamLine(gen.generateChannelEntry(pq, 'P1', 0, {}, { hdr_force: 'sdr' })))['VIDEO-RANGE'] === 'PQ', 'Forced output SDR does not relabel native PQ');

    const unknowns = [
        { id: 'u1', name: 'Unknown source', url },
        { id: 'u2', name: 'UHD HDR premium hint', url, _probeData: { source: 'PROBED_MASTER', resolution: '3840x2160', videoCodec: 'hvc1.2.4.L153.B0', bandwidth: 50000000 } },
        { id: 'u3', name: 'Other channel sample', url, _probeData: makeProbe('https://audit.invalid/live/other.m3u8', '3840x2160', 'PQ') },
        { id: 'u4', name: 'Expired group semantics', url, _probeData: { ...makeProbe(url, '3840x2160'), provenance: { ...makeProbe(url, '3840x2160').provenance, scope: 'host_profile_estimate' } } }
    ];
    ctx.APE_FAKE_UHD = '8k'; ctx.APE_8K_DECLARE = true; ctx.APE_6K = false;
    check(attrs(streamLine(gen.generateChannelEntry(hlg, 'P0', 0, {}, { maxQualityMode: true }))).RESOLUTION === '3840x2160', 'Fake8K flags cannot replace observed 4K');
    for (const ch of unknowns) {
        const text = gen.generateChannelEntry(ch, 'P0', 0, {}, { maxQualityMode: true, perceptual4kMode: true, hdr_force: 'pq' });
        check(!streamLine(text), 'Unknown source does not invent a HLS variant');
        check(!text.split('\n').some(l => l.startsWith('#EXT-X-I-FRAME-STREAM-INF:')), 'Unknown I-frame rendition is private metadata');
        const evidence = jsonTag(text, '#EXT-X-APE-SOURCE:');
        const intent = jsonTag(text, '#EXT-X-APE-REA:');
        check(evidence.status === 'unknown' && evidence.videoCodec === null && evidence.resolution === null, 'Unknown fields explicit');
        check(intent.targetResolution === null && intent.mode === 'pending_source', 'No target guessed from names/profile');
    }
    const partial = { id: 'partial', name: 'Partial probe', url, _probeData: makeProbe(url, '1920x1080') };
    partial._probeData.provenance.observedFields = ['bandwidth', 'resolution'];
    const partialAttrs = attrs(streamLine(gen.generateChannelEntry(partial, 'P3', 0, {}, {})));
    check(partialAttrs.RESOLUTION === '1920x1080' && !partialAttrs.CODECS && !partialAttrs['VIDEO-RANGE'], 'Only observed fields are declared');

    const raw = '#EXTINF:-1 tvg-id="hlg",HLG\n#EXTHTTP:{"User-Agent":"Fixture","Authorization":"fixture-only"}\n#EXTVLCOPT:network-caching=105000\n#EXT-X-STREAM-INF:BANDWIDTH=90000000,RESOLUTION=7680x4320,CODECS="vvc1.1",VIDEO-RANGE=PQ\n' + url;
    const finalized = api.finalizeChannelBlock(raw, { channel: hlg, options: {} });
    check(finalized.includes('#EXTHTTP:{"User-Agent":"Fixture","Authorization":"fixture-only"}'), 'HTTP headers byte-preserved');
    check(finalized.includes('#EXTVLCOPT:network-caching=105000'), 'Operational buffering preserved');
    check(!jsonTag(finalized, '#EXT-X-APE-SOURCE:').requestedUrl && !finalized.match(/#EXT-X-APE-(SOURCE|REA):[^\n]*https?:/), 'Source/intent metadata never exports probe URLs');
    const prefix = '#EXTM3U\n#EXT-X-SESSION-DATA:DATA-ID="fixture",VALUE="keep"\n';
    const catalog = prefix + raw + '\n#EXTINF:-1 tvg-id="missing",Missing\nhttps://audit.invalid/live/missing.m3u8\n';
    const exported = api.finalizePlaylist(catalog, [hlg], {});
    check(exported.startsWith(prefix), 'Global catalog headers preserved');
    check((exported.match(/^#EXTINF:/gm) || []).length === 2, 'All channels preserved');
    check((exported.match(/^https?:/gm) || []).length === 2, 'All playable URIs preserved');
    check(api.finalizePlaylist(exported, [hlg], {}) === exported, 'Whole catalog finalization idempotent');
    const media = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.000,\nhttps://audit.invalid/segment.ts\n#EXT-X-ENDLIST\n';
    check(api.finalizePlaylist(media, [hlg], {}) === media, 'HLS media playlist byte-identical');
    const wrongToken = raw.replace(url, url + '?changed=1');
    check(!streamLine(api.finalizePlaylist(prefix + wrongToken, [hlg], {})), 'ID cannot verify a different URL/token');
    const narrow = { id: 'narrow', name: 'Aspect fixture', url, _probeData: makeProbe(url, '854x480') };
    const aspect = jsonTag(gen.generateChannelEntry(narrow, 'P5', 0, {}, {}), '#EXT-X-APE-REA:');
    check(aspect.boxHeight === 1440 && aspect.targetResolution === '2560x1438', '854x480 preserves aspect within 1440 processing box');

    // Exercise the real streaming route too; its validator sees finalized bytes.
    const reader = gen.generateStream([hlg, unknowns[0]], { hud: false }).getReader();
    let streamed = '';
    for (;;) { const r = await reader.read(); if (r.done) break; streamed += Buffer.from(r.value).toString('utf8'); }
    check((streamed.match(/^#EXTINF:/gm) || []).length === 2, 'Production streaming preserves observed and unknown channels');
    check((streamed.match(/^#EXT-X-APE-SOURCE:/gm) || []).length === 2, 'Production stream applies the common finalizer');

    let produced = 0;
    const originalFinalize = api.finalizeChannelBlock;
    api.finalizeChannelBlock = function () { produced++; return originalFinalize.apply(this, arguments); };
    const pending = gen.generateStream(Array.from({ length: 20 }, (_, i) => ({ ...hlg, id: 'slow-' + i })), { hud: false });
    await new Promise(resolve => setTimeout(resolve, 0));
    check(produced === 0, 'A stalled reader queues only the header, not the catalog');
    const slowReader = pending.getReader();
    await slowReader.read();
    await new Promise(resolve => setTimeout(resolve, 0));
    check(produced <= 1, 'Backpressure allows at most one queued channel chunk');
    await slowReader.cancel('fixture cancellation');
    const stoppedAt = produced;
    await new Promise(resolve => setTimeout(resolve, 0));
    check(produced === stoppedAt, 'Cancellation stops producing channels');
    api.finalizeChannelBlock = originalFinalize;
}

async function legacyTests() {
    const url = 'http://audit.invalid:80/live/one.m3u8?token=A%2BB+C&expires=123';
    const channel = { id: 'one', stream_id: 'one', tvg_id: 'one', name: 'Legacy fixture', group: 'Audit', serverId: 'B',
        url, profile: 'P3', _probeData: makeProbe(url, '1920x1080') };
    const profiles = {
        P3: { id: 'P3', settings: { resolution: '7680x4320', codec: 'HEVC', fps: 60, bitrate: 60 } },
        P4: { id: 'P4', settings: { resolution: '3840x2160', codec: 'HEVC', fps: 60, bitrate: 20 } }
    };
    const ctx = environment({
        document: { readyState: 'loading', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
        navigator: {}, location: { origin: 'http://local.invalid' },
        alert: () => {},
        APE_PROFILES_CONFIG: { labVersion: 'omega_v1', bulletproof: true, profiles: {}, reaProcessing: POLICY.policy },
        app: { state: { activeHeaders: { 'User-Agent': 'Fixture', Authorization: 'fixture-only' }, streamFormat: 'm3u8',
            currentServer: { id: 'A', baseUrl: 'https://a.invalid', username: 'fixtureA', password: 'passA' },
            activeServers: [{ id: 'B', baseUrl: 'http://b.invalid:80', username: 'fixtureB', password: 'passB' }] },
            getFilteredChannels: () => [channel] }
    });
    let calls = 0;
    const finalize = ctx.APE_REA_EXPORT.finalizeChannelBlock;
    ctx.APE_REA_EXPORT.finalizeChannelBlock = function () { calls++; return finalize.apply(this, arguments); };
    const verify = (text, label, count = 1) => {
        check(typeof text === 'string' && text.includes('#EXT-X-APE-REA:'), label + ' uses the shared finalizer');
        check((text.match(/^#EXTINF:/gm) || []).length === 1, label + ' preserves channel count');
        const urls = text.split('\n').filter(line => /^https?:/.test(line));
        check(urls.length === count && urls.every(line => line === url), label + ' preserves signed query and explicit port byte-for-byte');
        for (const line of text.split('\n').filter(l => l.startsWith('#EXT-X-STREAM-INF:'))) {
            check(attrs(line).RESOLUTION === '1920x1080' && attrs(line)['VIDEO-RANGE'] === 'SDR', label + ' source is not the selected profile');
        }
    };
    load(ctx, 'export-module.js');
    const exporter = new ctx.ExportModule(ctx.app);
    verify(exporter.generateM3U8([channel], { silent: true }), 'ExportModule');
    const absentUrl = { ...channel, url: undefined, _probeData: undefined };
    check(exporter._buildStreamUrl(absentUrl) === 'http://b.invalid:80/live/fixtureB/passB/one.m3u8', 'ExportModule isolates source server B from active A');
    const unresolved = exporter.generateM3U8([{ ...absentUrl, serverId: 'missing' }], { silent: true });
    check(unresolved.includes('#EXTINF:') && unresolved.includes('UNRESOLVED_URL') && !unresolved.includes('https://a.invalid/live/'), 'Missing own server keeps entry and diagnostic, never borrows credentials');

    load(ctx, 'js/m3u8-world-class-generator.js');
    const world = ctx.WorldClassM3U8Generator.generate([channel], {});
    verify(world.content, 'WorldClass');
    check(world.stats.totalChannels === 1 && typeof world.content === 'string', 'WorldClass return type/stats preserved');
    check(ctx.WorldClassM3U8Generator.generateWorldClassM3U8 === ctx.WorldClassM3U8Generator.generate, 'WorldClass compatibility alias exposed');
    check(ctx.WorldClassM3U8Generator.generateURL(absentUrl, 'fixture-token', {}).startsWith('http://b.invalid:80/live/fixtureB/passB/one.m3u8?'), 'WorldClass constructs source-specific server URL only when absent');

    load(ctx, 'js/ape-v9/unified-generator-integration.js');
    verify(ctx.UnifiedGenerator.generate([channel], {}), 'Unified');
    load(ctx, 'js/ape-v9/m3u8-api-wrapper-integrated.js');
    const wrapper = new ctx.M3U8APIWrapper({ validateOnGenerate: false });
    ctx.APE_DIRECT_MODE = false;
    verify(wrapper.generateM3U8([channel], {}), 'APIWrapper');
    check(wrapper._buildChannelUrl(absentUrl, 'fixture-token').startsWith('http://b.invalid:80/live/fixtureB/passB/one.m3u8?'), 'APIWrapper isolates credentials for constructed URLs');
    check(wrapper._buildChannelUrl({ ...absentUrl, serverId: 'missing' }, 'fixture-token') === '', 'APIWrapper does not borrow current server for an unknown source');
    load(ctx, 'js/m3u8-generator-v16-elite.js');
    const elite = ctx.apeEliteGenerator.generate([channel], profiles);
    verify(elite, 'Elite');
    check((elite.match(/^#EXT-X-APE-PROFILE-INTENT:/gm) || []).length === 2, 'Elite preserves every requested profile as private intent');
    check(!/^#EXT-X-MEDIA:/m.test(elite) && !attrs(streamLine(elite)).AUDIO, 'Elite does not declare imagined audio renditions');
    check(calls >= 6, 'Each legacy emitter finalizes per channel/variant, not the whole large Blob');

    // Real Worker entry with importScripts; no document/DOM in its environment.
    const messages = [], worker = environment({ postMessage: message => messages.push(message) });
    delete worker.APE_REA_EXPORT; delete worker.APE_REA_POLICY;
    worker.importScripts = (...scripts) => scripts.forEach(script => load(worker, 'js/' + script));
    load(worker, 'js/ape-worker.js');
    await worker.onmessage({ data: { type: 'start_generation', channels: [channel], config: { obfuscate: false, userAgent: 'Fixture' } } });
    const result = messages.find(message => message.type === 'complete');
    check(!!result && result.stats.total === 1, 'Worker loads the pure module and preserves completion contract');
    check(result.blob.includes('#EXT-X-APE-REA:') && attrs(streamLine(result.blob)).RESOLUTION === '1920x1080', 'Worker executes the same source finalization');
    check(result.blob.split('\n').filter(line => /^https?:/.test(line))[0].startsWith(url + '|'), 'Worker preserves the signed provider URL before its existing pipe headers');
    check(!('document' in worker), 'Worker finalization has no DOM dependency');
    messages.length = 0;
    await worker.onmessage({ data: { type: 'start_generation', channels: [channel], config: { obfuscate: true, userAgent: 'Fixture' } } });
    check(attrs(streamLine(messages.find(message => message.type === 'complete').blob)).RESOLUTION === '1920x1080', 'Worker obfuscated pipe headers do not invalidate exact source URI');
}

async function proberTests() {
    let requests = 0;
    const manifest = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.640028",VIDEO-RANGE=SDR,FRAME-RATE=25\nmedia.m3u8\n';
    const ctx = environment({ fetch: async uri => {
        requests++;
        return { ok: true, status: 200, url: String(uri), text: async () => manifest, headers: { get: () => 'application/vnd.apple.mpegurl' } };
    } });
    load(ctx, 'js/vendor/m3u8-parser.vendor.js');
    load(ctx, 'js/ape-v9/ape-quality-prober.js');
    const a = { url: 'https://audit.invalid/live/1.m3u8', _quickProfile: 'P4' };
    const alias = { url: a.url, _quickProfile: 'P4' };
    const b = { url: 'https://audit.invalid/live/2.m3u8', _quickProfile: 'P4' };
    const result = await ctx.ApeQualityProber.probe([a, alias, b], { skipCorsCheck: true, skipCache: true });
    check(requests === 1 && result.probed === 1, 'Provenance does not increase host/profile sampling load');
    check(a._probeData && alias._probeData && !b._probeData, 'Only exact URI and its alias receive observed probe');
    check(b._probeEstimate && b._probeEstimate.provenance.scope === 'host_profile_estimate', 'Neighbor gets an explicitly unverified group estimate');
    check(a._probeData.provenance.requestedUrl === a.url, 'Probe retains exact requested URI');
    check(a._probeData.provenance.observedFields.includes('resolution'), 'Probe declares observed fields');
    check(a._probeData.audioCodec === '' && !a._probeData.provenance.observedFields.includes('audioCodec'), 'Absent audio codec stays unknown');
    check(a._probeData.avgBandwidth === 0 && !a._probeData.provenance.observedFields.includes('avgBandwidth'), 'Average bandwidth is not synthesized');
    const prior = requests;
    await ctx.ApeQualityProber.probe([a, b], { skipCorsCheck: true });
    check(requests === prior, 'URL-bound cache reused for same sample');
    const c = { url: 'https://audit.invalid/live/3.m3u8', _quickProfile: 'P4' };
    await ctx.ApeQualityProber.probe([c], { skipCorsCheck: true });
    check(requests === prior + 1 && c._probeData.provenance.requestedUrl === c.url, 'Changed sample cannot borrow cached codec from old URI');
    ctx.fetch = async () => { throw new Error('CORS fixture'); };
    const neighbor = { url: 'https://audit.invalid/live/4.m3u8', _quickProfile: 'P4' };
    const offline = await ctx.ApeQualityProber.probe([c, neighbor]);
    check(offline.skipped === 'CORS_BLOCKED' && c._probeData && !neighbor._probeData, 'CORS fallback cannot fan out cached evidence to neighbors');
}

(async () => {
    await generatorTests();
    await legacyTests();
    await proberTests();
    console.log('REA source alignment: ' + checks + ' checks passed; local fixtures only.');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
