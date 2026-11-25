/**
 * test-crystal-plan.cjs — fija las cadenas exactas del contrato
 * ape.crystal.upscale/1, incluidas las cinco salidas 6K strong del enlace.
 *
 * No requiere ffmpeg: prueba la decisión pura. El encode real se cubre en
 * test-crystal-encode.cjs (si ffmpeg está disponible).
 */
'use strict';

const assert = require('assert');
const { crystalPlan } = require('./crystal-upscale.cjs');

const BWDIF = 'bwdif=mode=send_field:parity=auto:deint=all';
const DEBLOCK = 'deblock=filter=weak:block=8:alpha=0.06:beta=0.035:gamma=0.035:delta=0.035';
const DEBAND = 'deband=1thr=0.008:2thr=0.008:3thr=0.008:range=12:blur=false';
const SCALE = (w, h) => 'scale=' + w + ':' + h + ':flags=lanczos+accurate_rnd+full_chroma_int:threads=2';
const PAD = (w, h) => 'pad=' + w + ':' + h + ':trunc((ow-iw)/4)*2:trunc((oh-ih)/4)*2';

function stream(w, h, fieldOrder = 'progressive', sar = '1:1') {
  return { width: w, height: h, field_order: fieldOrder, sample_aspect_ratio: sar, color_transfer: 'bt709' };
}

function plan(w, h, target, quality, sharpness, fieldOrder = 'tt') {
  return crystalPlan(stream(w, h, fieldOrder), target, quality, sharpness);
}

const expected = {
  'micro-sd': [
    BWDIF, DEBLOCK, 'hqdn3d=1.4:1.0:0.8:0.6', 'format=yuv420p10le', DEBAND,
    SCALE(4320, 3240), 'cas=strength=0.34:planes=1', 'setsar=1', PAD(5760, 3240), 'format=yuv420p10le',
  ],
  sd: [
    BWDIF, DEBLOCK, 'hqdn3d=1.1:0.9:0.65:0.55', 'format=yuv420p10le', DEBAND,
    SCALE(4050, 3240), 'cas=strength=0.30:planes=1', 'setsar=1', PAD(5760, 3240), 'format=yuv420p10le',
  ],
  hd: [
    BWDIF, 'hqdn3d=0.85:0.65:0.55:0.4', 'format=yuv420p10le', DEBAND,
    SCALE(5760, 3240), 'cas=strength=0.13:planes=1', 'setsar=1', PAD(5760, 3240), 'format=yuv420p10le',
  ],
  fhd: [
    BWDIF, 'format=yuv420p10le', DEBAND,
    SCALE(5760, 3240), 'cas=strength=0.09:planes=1', 'setsar=1', PAD(5760, 3240), 'format=yuv420p10le',
  ],
  uhd: [
    BWDIF, 'format=yuv420p10le',
    SCALE(5760, 3240), 'setsar=1', PAD(5760, 3240), 'format=yuv420p10le',
  ],
};

const inputs = [
  ['micro-sd', 320, 240, [4320, 3240]],
  ['sd', 720, 576, [4050, 3240]],
  ['hd', 1280, 720, [5760, 3240]],
  ['fhd', 1920, 1080, [5760, 3240]],
  ['uhd', 2560, 1440, [5760, 3240]],
];

for (const [profile, width, height, active] of inputs) {
  const result = plan(width, height, '6k', 'max', 'strong');
  assert.strictEqual(result.profile, profile);
  assert.deepStrictEqual(result.active_px, active);
  assert.deepStrictEqual(result.output_px, [5760, 3240]);
  assert.deepStrictEqual(result.filters, expected[profile], profile + ' 6K strong');
  assert.strictEqual(result.input_sar, '1:1');
  assert.strictEqual(result.status, undefined);
  console.log('PASS 6K strong', profile, result.active_px.join('x'));
}

// Referencia anamórfica del propietario: SAR 16:15 / 3:4, DAR 4:3.
// Todos los perfiles deben caer en una imagen activa 4320x3240 y 5760x3240 de
// lienzo, y conservar su preset (el SAR cambia el ancho activo, no el preset).
const anamorphic = [
  ['micro-sd', 320, 240, '1:1'],
  ['sd', 720, 576, '16:15'],
  ['hd', 1280, 720, '3:4'],
  ['fhd', 1920, 1080, '3:4'],
  ['uhd', 2560, 1440, '3:4'],
];
for (const [profile, width, height, inputSar] of anamorphic) {
  const result = crystalPlan({
    width, height, field_order: 'tt', sample_aspect_ratio: inputSar,
    display_aspect_ratio: '4:3', color_transfer: 'bt709',
  }, '6k', 'max', 'strong');
  assert.strictEqual(result.profile, profile);
  assert.strictEqual(result.input_sar, inputSar);
  assert.strictEqual(result.display_aspect_ratio, '4:3');
  assert.deepStrictEqual(result.active_px, [4320, 3240], profile + ' anamórfico');
  assert.deepStrictEqual(result.output_px, [5760, 3240], profile + ' anamórfico');
  let expectedFilters = expected[profile];
  if (profile === 'sd') {
    expectedFilters = expectedFilters.map((f) => f.startsWith('scale=') ? f.replace('4050:3240', '4320:3240') : f);
  }
  if (profile === 'hd' || profile === 'fhd' || profile === 'uhd') {
    expectedFilters = expectedFilters.map((f) => f.startsWith('scale=') ? f.replace('5760:3240', '4320:3240') : f);
  }
  assert.deepStrictEqual(result.filters, expectedFilters, profile + ' anamórfico strong');
  console.log('PASS anamórfico 6K', profile, result.active_px.join('x'), 'SAR=' + inputSar);
}

// DAR fallback: sin SAR, display_aspect_ratio=4:3 y 720x576 => SAR 16:15.
const darFallback = crystalPlan({
  width: 720, height: 576, field_order: 'tt', sample_aspect_ratio: '',
  display_aspect_ratio: '4:3', color_transfer: 'bt709',
}, '6k', 'max', 'strong');
assert.deepStrictEqual(darFallback.active_px, [4320, 3240]);
assert.strictEqual(darFallback.input_sar, '1:1');
assert.strictEqual(darFallback.display_aspect_ratio, '4:3');
console.log('PASS DAR fallback 4:3 sin SAR');

// 4:3 se conserva dentro del lienzo (no se estira).
const micro4k = plan(320, 240, '4k', 'max', 'classic');
assert.deepStrictEqual(micro4k.active_px, [2880, 2160]);
assert.deepStrictEqual(micro4k.output_px, [3840, 2160]);
assert.strictEqual(micro4k.filters[6], 'cas=strength=0.19:planes=1');
console.log('PASS 4K 4:3 activo y pad');

// Progresivo: sin bwdif. Strong no cambia HD/FHD/UHD.
const progressive = plan(1280, 720, '4k', 'max', 'strong', 'progressive');
assert.strictEqual(progressive.filters[0].startsWith('bwdif='), false);
const hdStrong = plan(1280, 720, '6k', 'max', 'strong');
const hdClassic = plan(1280, 720, '6k', 'max', 'classic');
assert.deepStrictEqual(hdStrong.filters, hdClassic.filters);
console.log('PASS bwdif solo entrelazado; strong solo Micro-SD/SD');

// Balanced: bicubic, sin deblock/hqdn3d/deband/CAS de max.
const balanced = plan(320, 240, '4k', 'balanced', 'classic');
assert.ok(balanced.filters.some((filter) => filter.includes('flags=bicubic+accurate_rnd')));
assert.ok(!balanced.filters.some((filter) => filter.startsWith('deblock=')));
assert.ok(!balanced.filters.some((filter) => filter.startsWith('cas=')));
console.log('PASS balanced no aplica la cadena max');

// Fuente ya >= objetivo: SOURCE_PRESERVED sin filtros ni salida.
const fourK = plan(3840, 2160, '4k', 'max', 'classic', 'progressive');
assert.strictEqual(fourK.bypass, true);
assert.deepStrictEqual(fourK.output_px, null);
assert.deepStrictEqual(fourK.filters, []);
const eightK = plan(7680, 4320, '4k', 'max', 'classic', 'progressive');
assert.strictEqual(eightK.bypass, true);
console.log('PASS 4K/8K fuente preservada sin downscale');

// Seguridad: HDR/DV y rotación se rechazan.
assert.throws(() => crystalPlan({ ...stream(1920, 1080), color_transfer: 'smpte2084' }, '4k', 'max', 'classic'),
  /HDR o Dolby Vision/);
assert.throws(() => crystalPlan({ ...stream(1920, 1080), side_data_list: [{ rotation: 90 }] }, '4k', 'max', 'classic'),
  /rotación/);
assert.throws(() => plan(1920, 1080, '8k', 'max', 'classic'), /Use --target/);
assert.throws(() => plan(1920, 1080, '4k', 'ultra', 'classic'), /Use --quality/);
assert.throws(() => plan(1920, 1080, '4k', 'max', 'ultra'), /Use --sharpness/);
console.log('PASS seguridad y validación');

console.log('OK — crystal plan tests');
