/**
 * test-crystal-encode.cjs — encode real 4K HLS con ffmpeg local.
 *
 * Genera un clip sintético entrelazado 320x240 de 1 s (30 frames), ejecuta el
 * CLI `--format upscale --target 4k --quality max` y verifica:
 *   - status FILTERS_EXECUTED;
 *   - init.mp4 + segmentos + ENDLIST + master.m3u8;
 *   - HEVC 3840x2160 y10 bits según ffprobe.
 *
 * Si ffmpeg/ffprobe no están instalados, imprime SKIP y sale 0 (el CI que
 * exige el encode debe instalarlos). El 6K se prueba con APE_TEST_6K=1.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

function has(binary) {
  return spawnSync(binary, ['-version'], { stdio: 'ignore' }).status === 0;
}

if (!has('ffmpeg') || !has('ffprobe')) {
  console.log('SKIP — ffmpeg/ffprobe no disponibles');
  process.exit(0);
}

const ROOT = path.resolve(__dirname, '..', '..');
const WRAP = path.join(ROOT, 'tools', 'pulse', 'ape-pulse-wrap.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-crystal-encode-'));
const input = path.join(TMP, 'source.mp4');

execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30',
  '-t', '1', '-vf', 'setsar=1', '-flags', '+ilme+ildct',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', input,
], { stdio: 'ignore' });

const output = path.join(TMP, 'crystal-4k');
const stdout = execFileSync(process.execPath, [
  WRAP, '--format', 'upscale', '--in', input, '--out', output,
  '--target', '4k', '--quality', 'max', '--sharpness', 'classic',
], { encoding: 'utf8', maxBuffer: 2 ** 20 });
const result = JSON.parse(stdout.trim());
assert.strictEqual(result.status, 'FILTERS_EXECUTED');
assert.strictEqual(result.profile, 'micro-sd');
assert.deepStrictEqual(result.source_px, [320, 240]);
assert.deepStrictEqual(result.output_px, [3840, 2160]);
assert.ok(result.verification && result.verification.codec === 'hevc');
assert.ok(fs.existsSync(path.join(output, 'init.mp4')));
assert.ok(fs.existsSync(path.join(output, 'master.m3u8')));
assert.ok(fs.existsSync(path.join(output, 'video.m3u8')));
assert.ok(fs.readFileSync(path.join(output, 'video.m3u8'), 'utf8').includes('#EXT-X-ENDLIST'));

const probe = JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,codec_name,pix_fmt',
  '-of', 'json', path.join(output, 'init.mp4'),
], { encoding: 'utf8' }));
const video = probe.streams && probe.streams[0];
assert.ok(video);
assert.strictEqual(video.width, 3840);
assert.strictEqual(video.height, 2160);
assert.strictEqual(video.codec_name, 'hevc');
assert.strictEqual(video.pix_fmt, 'yuv420p10le');
console.log('PASS encode 4K HEVC 10-bit fMP4 HLS');

// --plan no crea el directorio de salida.
const planOut = path.join(TMP, 'plan-no-write');
const planText = execFileSync(process.execPath, [
  WRAP, '--format', 'upscale', '--in', input, '--out', planOut,
  '--target', '6k', '--quality', 'max', '--sharpness', 'strong', '--plan',
], { encoding: 'utf8' });
const plan = JSON.parse(planText.trim());
assert.strictEqual(plan.status, 'PLANNED');
assert.deepStrictEqual(plan.output_px, [5760, 3240]);
assert.ok(!fs.existsSync(planOut), '--plan no debe crear el directorio');
console.log('PASS --plan 6K strong no escribe');

if (process.env.APE_TEST_6K === '1') {
  const out6k = path.join(TMP, 'crystal-6k');
  const six = JSON.parse(execFileSync(process.execPath, [
    WRAP, '--format', 'upscale', '--in', input, '--out', out6k,
    '--target', '6k', '--quality', 'max', '--sharpness', 'classic',
  ], { encoding: 'utf8', maxBuffer: 2 ** 20 }).trim());
  assert.strictEqual(six.status, 'FILTERS_EXECUTED');
  assert.deepStrictEqual(six.output_px, [5760, 3240]);
  console.log('PASS encode 6K HEVC 10-bit');
}

console.log('OK — crystal encode tests');
