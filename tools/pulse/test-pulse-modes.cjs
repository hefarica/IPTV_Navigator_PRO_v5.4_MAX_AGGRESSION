/**
 * test-pulse-modes.cjs — modos de lista del despachador 1.8.1.
 *
 * Cubre:
 *   - `--format iptv` idéntico al modo por defecto;
 *   - URL nuevas con `m=proxy` por defecto (fix del "Loaded playlist has
 *     unexpected type.");
 *   - `--mode cartridge|redirect` se honra;
 *   - una URL ya /pulse/ se conserva sin reescribir su firma;
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

const defaultText = fs.readFileSync(defaultOut, 'utf8');
assert.ok(/[?&]m=proxy/.test(defaultText), 'default debe pedir m=proxy');
assert.ok(!/[?&]m=cartridge/.test(defaultText), 'default no debe pedir cartridge');
console.log('PASS default m=proxy (evita master inesperado)');

const cartridgeOut = path.join(TMP, 'cartridge.m3u8');
run(['--in', catalogPath, '--out', cartridgeOut, '--mode', 'cartridge']);
assert.ok(/[?&]m=cartridge/.test(fs.readFileSync(cartridgeOut, 'utf8')));
console.log('PASS --mode cartridge honrado');

const invalidOut = path.join(TMP, 'invalid.m3u8');
let invalidRejected = false;
try {
  run(['--in', catalogPath, '--out', invalidOut, '--mode', 'bogus']);
} catch (error) {
  invalidRejected = true;
  assert.notStrictEqual(error.status, 0);
  assert.ok(String(error.stderr || '').includes('proxy|cartridge|redirect'));
}
assert.ok(invalidRejected, 'un modo desconocido debe rechazarse');
console.log('PASS modo desconocido rechazado');

const redirectOut = path.join(TMP, 'redirect.m3u8');
run(['--in', catalogPath, '--out', redirectOut, '--mode', 'redirect']);
const redirectText = fs.readFileSync(redirectOut, 'utf8');
assert.ok(/_m=redirect/.test(redirectText) || /[?&]m=redirect/.test(redirectText), redirectText);
assert.ok(!/[?&]m=cartridge/.test(redirectText), 'redirect no debe emitir cartridge');
console.log('PASS --mode redirect honrado');

const signedCatalog = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="a" tvg-name="A" group-title="TEST",A',
  'https://iptv-ape.duckdns.org/pulse/7.m3u8?u=https%3A%2F%2Fprovider.invalid%2Flive%2Fu%2Fp%2F1.m3u8&d=x&p=P1&m=cartridge&l=vieja&fp=abc&sig=deadbeef',
  '',
].join('\n');
const signedPath = path.join(TMP, 'signed.m3u8');
const signedOut = path.join(TMP, 'signed.out.m3u8');
fs.writeFileSync(signedPath, signedCatalog, 'utf8');
run(['--in', signedPath, '--out', signedOut]);
const signedText = fs.readFileSync(signedOut, 'utf8');
assert.ok(signedText.includes('m=cartridge'), 'una URL ya envuelta no debe cambiar de modo');
assert.ok(signedText.includes('sig=deadbeef'), 'la firma debe conservarse byte a byte');
console.log('PASS URL /pulse ya envuelta intacta');

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
