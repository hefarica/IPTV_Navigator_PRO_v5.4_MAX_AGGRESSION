#!/usr/bin/env node
'use strict';
// Exercise the real metadata exporters, shared evidence gate and compression.
// Fixtures use reserved .invalid URLs; no provider or device is contacted.
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { gunzipSync } = require('zlib');
const rootDir = path.resolve(__dirname, '../..');
const frontend = path.join(rootDir, 'IPTV_v5.4_MAX_AGGRESSION/frontend');
const policy = require(path.join(frontend, 'js/ape-v9/rea-processing-policy.js'));
const root = { APE_REA_POLICY: policy, CompressionStream };
root.APE_REA_EXPORT = require(path.join(frontend, 'js/ape-v9/rea-export-finalizer.js'))(root);
const api = require(path.join(frontend, 'js/ape-v9/rea-catalog-export.js'))(root);
root.APE_REA_CATALOG = api;
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }
function ok(value) { assert.ok(value); checks++; }

const uri = 'http://stream.invalid:80/path/a.m3u8?sig=a%2Bb+c&token=unchanged|User-Agent=Player%2F1';
const rawUri = uri.split('|')[0];
const channel = { stream_id: 71, name: 'Canal, "prueba"\nLínea 2', group: 'Deportes', url: uri,
    resolution: '8K', fps: 120, codec: 'invented_catalog_hint',
    httpHeaders: { Authorization: 'Bearer fixture-only', Cookie: 'fixture=one', Referer: 'https://ref.invalid/' },
    _probeData: { source: 'PROBED_MASTER', resolution: '1920x1080', videoCodec: 'avc1.640028',
        audioCodec: 'ec-3', frameRate: 29.97, bandwidth: 6000000, videoRange: 'SDR',
        provenance: { schema: 'ape.probe-provenance/1', scope: 'channel_url', requestedUrl: rawUri,
            responseUrl: rawUri, observedFields: ['resolution', 'videoCodec', 'audioCodec', 'frameRate', 'bandwidth', 'videoRange'] } } };
const neighbor = { ...channel, stream_id: 72, url: 'http://stream.invalid:80/path/other.m3u8?sig=other' };
const missing = { stream_id: 73, name: 'Sin URL', serverId: 'absent' };

async function main() {
    const catalog = JSON.parse(api.toJSON([channel, neighbor, missing], { dual: 'both' }));
    equal(catalog.channelCount, 3);
    equal(catalog.channels.length, 3);
    equal(catalog.requestedDelivery, 'both');
    equal(catalog.delivery, 'source_urls');
    equal(catalog.transportApplied, false);
    const first = catalog.channels[0];
    equal(first.url, uri);
    equal(first.requestHeaders, channel.httpHeaders);
    equal(first.source.resolution, '1920x1080');
    equal(first.source.codecs, 'avc1.640028,ec-3');
    equal(first.source.frameRate, 29.97);
    equal(first.source.videoRange, 'SDR');
    equal(first.processing.targetResolution, '3840x2160');
    equal(first.processing.hdr, 'sdr_to_pq_conditional');
    equal(first.processing.hdrVerified, false);
    equal(first.processing.execution, 'not_verified');
    equal(first.catalogHints.fps, 120);
    equal(first.catalogHints.status, 'unverified_catalog_metadata');
    equal(catalog.channels[1].source.status, 'unknown');
    equal(catalog.channels[1].processing.targetResolution, null);
    equal(catalog.channels[2].urlStatus, 'missing');
    const app = { state: { currentServer: { id: 'wrong', baseUrl: 'https://wrong.invalid', username: 'wrong', password: 'wrong' },
        activeServers: [{ id: 'own', baseUrl: 'http://own.invalid:80/sub/player_api.php', username: 'u+one', password: 'p/two' }] } };
    equal(api.sourceUrl({ stream_id: 5, serverId: 'own' }, { app }), 'http://own.invalid:80/sub/live/u%2Bone/p%2Ftwo/5.ts');
    equal(api.sourceUrl({ stream_id: 5, serverId: 'missing' }, { app }), '');
    equal(api.sourceUrl(channel, { app }), uri);
    const streamed = JSON.parse(await new Response(api.createJSONStream([channel, neighbor, missing], { dual: 'both' })).text());
    equal(streamed, catalog);

    const rows = api.toRows([channel, neighbor]);
    equal(rows[0].URL, uri);
    equal(rows[0].SourceResolution, '1920x1080');
    equal(rows[0].REA_TargetResolution, '3840x2160');
    equal(rows[1].SourceResolution, '');
    const csv = await new Response(api.createCSVStream([channel, neighbor])).text();
    const parsed = spawnSync('python3', ['-c', 'import csv,io,json,sys; print(json.dumps(list(csv.DictReader(io.StringIO(sys.stdin.read())))))'], { input: csv, encoding: 'utf8' });
    equal(parsed.status, 0);
    const csvRows = JSON.parse(parsed.stdout);
    equal(csvRows[0].Name, channel.name);
    equal(csvRows[0].URL, uri);
    equal(JSON.parse(csvRows[0].RequestHeadersJSON), channel.httpHeaders);
    equal(csvRows[1].REA_TargetResolution, '');
    equal(csvRows.length, 2);
    const formulaNames = ['=1+1', '+SUM(1,2)', '-1+2', '@SUM(1,2)', ' \t=1+1', '\ufeff=1+1'];
    const formulaChannels = formulaNames.map((name, id) => ({ ...channel, stream_id: id, name, group: '@SUM(1,2)' }));
    const safeCsv = await new Response(api.createCSVStream(formulaChannels)).text();
    const safeParsed = spawnSync('python3', ['-c', 'import csv,io,json,sys; print(json.dumps(list(csv.DictReader(io.StringIO(sys.stdin.read())))))'], { input: safeCsv, encoding: 'utf8' });
    equal(safeParsed.status, 0);
    const safeRows = JSON.parse(safeParsed.stdout);
    safeRows.forEach((record, i) => {
        equal(record.Name, "'" + formulaNames[i]);
        equal(record.Group, "'@SUM(1,2)");
        equal(record.URL, uri);
        equal(record.ID, String(i));
    });
    equal(JSON.parse(api.toJSON(formulaChannels)).channels[0].name, '=1+1');

    const chunks = [];
    const result = await api.downloadJSON([channel, neighbor], { gzip: true, dual: 'cdn', filename: 'catalog.json',
        writable: new WritableStream({ write(chunk) { chunks.push(Buffer.from(chunk)); } }) });
    equal(result.filename, 'catalog.json.gz');
    equal(result.count, 2);
    equal(result.transportApplied, false);
    equal(result.requestedDelivery, 'cdn');
    equal(result.gzip, true);
    equal(JSON.parse(gunzipSync(Buffer.concat(chunks)).toString()).channels[0].url, uri);
    // Merely constructing an unconsumed stream must not process the full catalog.
    let visits = 0;
    const lazy = Array.from({ length: 2000 }, (_, id) => ({ id, get url() { visits++; return 'https://lazy.invalid/' + id; } }));
    const stream = api.createJSONStream(lazy);
    await new Promise(resolve => setImmediate(resolve));
    equal(visits, 0);
    await stream.cancel();

    // Execute the application's actual methods with output libraries observed at
    // their boundary. This checks per-server selection and XLSX row semantics,
    // not Excel's rendering or a workbook macro execution.
    const appSource = fs.readFileSync(path.join(frontend, 'app.js'), 'utf8');
    const method = (name, next) => appSource.slice(appSource.indexOf('    ' + name + '('), appSource.indexOf('    ' + next + '(', appSource.indexOf('    ' + name + '(')));
    const methodText = method('buildStreamUrl', 'enrichChannel');
    const context = vm.createContext({ window: root });
    const build = vm.runInContext('({' + methodText + '}).buildStreamUrl', context);
    equal(build.call(app, { stream_id: 5, serverId: 'own' }), 'http://own.invalid:80/sub/live/u%2Bone/p%2Ftwo/5.ts');
    equal(build.call(app, channel), uri);
    ok(appSource.includes("$('btnCopyJSON').onclick = () => this.copyCatalogJSON()"));
    ok(appSource.includes("'REA_Contract'"));
    const index = fs.readFileSync(path.join(frontend, 'index-v4.html'), 'utf8');
    ok(index.indexOf('rea-processing-policy.js') < index.indexOf('ape-profiles-config.js?'));
    ok(index.indexOf('rea-export-finalizer.js') < index.indexOf('rea-catalog-export.js'));
    ok(index.indexOf('rea-catalog-export.js') < index.indexOf('<script src="app.js?'));
    console.log(JSON.stringify({ ok: true, checks, scope: 'actual serializers, source gate, gzip, lazy stream, app URL method; no device playback' }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
