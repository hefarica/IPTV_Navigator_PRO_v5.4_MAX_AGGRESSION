/**
 * Test unitario (sin red) de frontend/js/ape-publisher.js
 *
 * Cubre:
 *  - normalización de nombre plano vs .gz y sufijo _SHIELDED
 *  - sonda de cabecera gz (prefijo, sin descomprimir el fichero completo)
 *  - sonda de lista plana
 *  - detección de magia gzip
 *
 * Ejecutar: node frontend/tests/ape-publisher.unit.test.js
 */
'use strict';

const assert = require('assert');
const zlib = require('zlib');
const pub = require('../js/ape-publisher.js');

const RAW = [
    '#EXTM3U',
    '#EXT-X-VERSION:9',
    '#EXT-X-APE-CHANNELS:2',
    '#EXTINF:-1 tvg-id="a",A',
    'http://example.test/a.m3u8',
    '#EXTINF:-1 tvg-id="b",B',
    'http://example.test/b.m3u8',
    ''
].join('\n');

(async () => {
    // 1. Nombres
    assert.strictEqual(pub.normalizeFilename('APE_X.m3u8.gz', true), 'APE_X.m3u8.gz');
    assert.strictEqual(pub.normalizeFilename('APE_X.m3u8', true), 'APE_X.m3u8.gz');
    assert.strictEqual(pub.normalizeFilename('APE_X.m3u8.gz', false), 'APE_X.m3u8');
    assert.strictEqual(pub.normalizeFilename('APE X (1).m3u8.gz', true), 'APE_X_1.m3u8.gz');
    assert.strictEqual(pub.normalizeFilename('', true), 'APE_UPLOAD.m3u8.gz');
    assert.strictEqual(pub.withShieldedSuffix('APE_X.m3u8.gz'), 'APE_X_SHIELDED.m3u8.gz');
    assert.strictEqual(pub.withShieldedSuffix('APE_X.m3u8'), 'APE_X_SHIELDED.m3u8');
    assert.strictEqual(pub.withShieldedSuffix('APE_X_SHIELDED.m3u8.gz'), 'APE_X_SHIELDED.m3u8.gz');
    console.log('PASS nombres');

    // 2. Sonda gz: declarado, primera línea, magia
    const gz = zlib.gzipSync(Buffer.from(RAW), { level: 9 });
    const gzInfo = await pub.probeGz(new Blob([gz]));
    assert.strictEqual(gzInfo.magicOk, true);
    assert.strictEqual(gzInfo.magicHex, '1f8b');
    assert.strictEqual(gzInfo.isM3U, true);
    assert.strictEqual(gzInfo.declared, 2);
    assert.ok(gzInfo.firstLine.startsWith('#EXTM3U'));
    console.log('PASS probeGz');

    // 3. Sonda plana
    const plainInfo = await pub.probePlain(new Blob([Buffer.from(RAW)]));
    assert.strictEqual(plainInfo.magicOk, true);
    assert.strictEqual(plainInfo.isM3U, true);
    assert.strictEqual(plainInfo.declared, 2);
    console.log('PASS probePlain');

    // 4. Magia: un .gz falso no se detecta como gzip
    const fake = await pub.inspect(new Blob([Buffer.from(RAW)]));
    assert.strictEqual(fake.isM3U, true);
    assert.strictEqual(fake.declared, 2);
    console.log('PASS inspect');

    console.log('OK — ape-publisher unit tests');
})().catch(err => {
    console.error('FAIL', err);
    process.exit(1);
});
