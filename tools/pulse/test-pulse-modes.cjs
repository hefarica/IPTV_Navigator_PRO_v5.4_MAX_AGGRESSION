/**
 * test-pulse-modes.cjs — modos de lista del despachador 1.8.0.
 *
 * Cubre:
 *   - `--format iptv` idéntico al modo por defecto;
 *   - `--mode redirect` se honra (m=redirect, no cartridge);
 *   - `--format hls-master` conserva STREAM-INF→URI e I-FRAME y retira IPTV;
 *   - el maestro rechaza catálogos/listas de segmentos.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WRAP = path.join(ROOT, 'tools', 'pulse', 'ape-pulse-wrap.js');
const BUILDER = path.join(ROOT, 'tools', 'url2', 'ape-url-builder.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-pulse-modes-'));

const catalog = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="a" tvg-name="A" group-title="TEST",A',
  '#EXT-X-APE-STREAM-TRUTH:src=real,w=1920,h=1080,fps=30,family=HEVC',
  'http://provider.invalid/live/u/p/1.m3u8',
  '',
].join('\n');
const catalogPath = path.join(TMP, 'catalog.m3u8');
fs.writeFileSync(catalogPath, catalog, 'utf8');

function run(args) {
  return execFileSync(process.execPath, [WRAP].concat(args), {
    env: Object.assign({}, process.env, { APE_URL_BUILDER: BUILDER }),
    encoding: 'utf8',
  });
}

const defaultOut = path.join(TMP, 'default.m3u8');
const explicitOut = path.join(TMP, 'explicit.m3u8');
run(['--in', catalogPath, '--out', defaultOut]);
run(['--format', 'iptv', '--in', catalogPath, '--out', explicitOut]);
assert.deepStrictEqual(fs.readFileSync(explicitOut), fs.readFileSync(defaultOut));
console.log('PASS --format iptv == default');

const redirectOut = path.join(TMP, 'redirect.m3u8');
run(['--in', catalogPath, '--out', redirectOut, '--mode', 'redirect']);
const redirectText = fs.readFileSync(redirectOut, 'utf8');
assert.ok(/_m=redirect/.test(redirectText) || /[?&]m=redirect/.test(redirectText), redirectText);
assert.ok(!/[?&]m=cartridge/.test(redirectText), 'redirect no debe emitir cartridge');
console.log('PASS --mode redirect honrado');

const master = [
  '#EXTM3U',
  '#EXT-X-VERSION:7',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="es",URI="audio.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0"',
  'video-4k.m3u8',
  '#EXT-X-I-FRAME-STREAM-INF:URI="iframes.m3u8",BANDWIDTH=1000000',
  '#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080',
  'video-1080.m3u8',
  '#EXT-X-APE-DECLARED:SHOULD_DROP',
  '#EXTSHIMOTT:{"ver":1}',
  '',
].join('\n');
const masterPath = path.join(TMP, 'master.m3u8');
const masterOut = path.join(TMP, 'master.out.m3u8');
fs.writeFileSync(masterPath, master, 'utf8');
const masterResult = JSON.parse(run(['--format', 'hls-master', '--in', masterPath, '--out', masterOut]).trim());
const masterText = fs.readFileSync(masterOut, 'utf8');
assert.strictEqual(masterResult.status, 'MASTER_WRITTEN');
assert.strictEqual(masterResult.variants, 2);
assert.ok(masterText.includes('#EXT-X-I-FRAME-STREAM-INF:URI="iframes.m3u8"'));
assert.ok(masterText.includes('#EXT-X-STREAM-INF:BANDWIDTH=28000000'));
assert.ok(masterText.includes('\nvideo-4k.m3u8\n'));
assert.ok(!masterText.includes('EXT-X-APE-'));
assert.ok(!masterText.includes('EXTSHIMOTT'));
console.log('PASS hls-master conserva STREAM-INF/URI/I-FRAME y retira IPTV');

const badPath = path.join(TMP, 'catalog-as-master.m3u8');
fs.writeFileSync(badPath, catalog, 'utf8');
let rejected = false;
try {
  execFileSync(process.execPath, [WRAP, '--format', 'hls-master', '--in', badPath, '--out', path.join(TMP, 'bad.out')], {
    encoding: 'utf8', stdio: 'pipe',
  });
} catch (error) {
  rejected = true;
  assert.notStrictEqual(error.status, 0);
  assert.ok(String(error.stderr || '').includes('hls-master no admite'));
}
assert.ok(rejected, 'un catálogo no puede pasar como maestro');
console.log('PASS hls-master rechaza catálogo');

console.log('OK — pulse modes tests');
