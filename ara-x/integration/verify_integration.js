#!/usr/bin/env node
'use strict';

/**
 * X1 · Verificador de la integración staged (opt-in) sin tocar los archivos calientes.
 *
 * Comprueba, en este orden:
 *   1. Los DOS hot files conservan el sha256 del baseline (no se editaron en X1).
 *   2. El hook (ara-x/integration/ara-x-hook.js) es DEFAULT-OFF e identidad con el flag apagado.
 *   3. Con ON: bloque de 27 líneas entre header y primer #EXTINF; 0 URLs mutadas; idempotente.
 *   4. Equivalencia byte a byte con ara-x/playlist/ara_x_injector.js (bloque, applyText, per-channel).
 *   5. Per-channel OFF por defecto; ON solo con ARA_X_PER_CHANNEL; augmentEntry no toca URLs.
 *   6. Fail-open: entradas inválidas y flags que lanzan excepción ⇒ identidad.
 *   7. Patch: 3 archivos, 1 nuevo; aplica con `git apply --check` sobre el árbol actual;
 *      aplicado en un repo temporal, los archivos parcheados pasan `node -c`;
 *      el generador parcheado NO contiene el bloque hardcodeado y sí los guards.
 *   8. Simulación de frontera del stream (header + entries): OFF byte-idéntico al baseline;
 *      ON byte-idéntico a injectText del inyector.
 *
 * Uso: node ara-x/integration/verify_integration.js [--keep]
 * Sin red, sin DOM, sin dependencias npm. No escribe en los hot files.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const HERE = __dirname;
const ARAX = path.resolve(HERE, '..');
const ROOT = path.resolve(ARAX, '..');
const REL_GEN = 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js';
const REL_HTML = 'IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html';
const REL_HOOK = 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ara-x-hook.js';
const HOOK = path.join(HERE, 'ara-x-hook.js');
const PATCH = path.join(HERE, 'ara-x-hook.patch');
const BASELINE = path.join(HERE, 'baseline.json');

const checks = [];
const check = (id, name, ok, detail) => checks.push({ id, name, ok: !!ok, detail });
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const sha256Text = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

function run(cmd, args, opts = {}) {
  return cp.spawnSync(cmd, args, { encoding: 'utf8', ...opts });
}

// ── muestras de catálogo (sin credenciales: hosts .example) ──────────────────
const SAMPLE = [
  '#EXTM3U x-tvg-url="" refresh="1800"',
  '#EXT-X-VERSION:9',
  '#EXT-X-APE-CHANNELS:3',
  '',
  '#EXTINF:-1 tvg-id="10" tvg-name="A" group-title="G" ape-profile="P3",A',
  '#EXTVLCOPT:network-caching=5000',
  '#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160',
  'https://cdn.example/live/10.m3u8',
  '',
  '#EXTINF:-1 tvg-id="11" tvg-name="B" group-title="G",B',
  '#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160',
  'https://cdn.example/live/11.m3u8',
  '',
  '#EXTINF:-1 tvg-id="12" tvg-name="C" group-title="G" ape-profile="P1",C',
  'https://cdn.example/live/12.m3u8',
  ''
].join('\n');

const URL_RE = /^https?:\/\/\S+$/gm;
const urlsOf = (text) => (text.match(URL_RE) || []).slice();

function main() {
  const keep = process.argv.includes('--keep');
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const hook = require(HOOK);
  const injector = require(path.join(ARAX, 'playlist', 'ara_x_injector.js'));

  // 1 · hot files intactos
  for (const [rel, meta] of Object.entries(baseline.hot_files)) {
    const abs = path.join(ROOT, rel);
    const exists = fs.existsSync(abs);
    const bytes = exists ? fs.statSync(abs).size : -1;
    const hash = exists ? sha256(abs) : '';
    check('X1-1:' + path.basename(rel), 'hot file sin cambios respecto al baseline',
      exists && bytes === meta.bytes && hash === meta.sha256,
      `${bytes} B · ${hash.slice(0, 16)}… (esperado ${meta.bytes} B · ${meta.sha256.slice(0, 16)}…)`);
  }
  check('X1-1:hook-exists', 'el hook staged existe (no se copió al frontend)',
    fs.existsSync(HOOK) && !fs.existsSync(path.join(ROOT, REL_HOOK)),
    `hook=${fs.existsSync(HOOK)} · frontend/hook=${fs.existsSync(path.join(ROOT, REL_HOOK))}`);

  // 2 · default OFF + identidad
  const savedEnabled = globalThis.ARA_X_ENABLED;
  const savedPerChannel = globalThis.ARA_X_PER_CHANNEL;
  delete globalThis.ARA_X_ENABLED;
  delete globalThis.ARA_X_PER_CHANNEL;
  const offDefault = hook.enabled();
  const offApplied = hook.applyText(SAMPLE, { listVersion: 'v-off' });
  check('X1-2:default-off', 'ARA_X_ENABLED ausente ⇒ hook OFF', offDefault === false, String(offDefault));
  check('X1-2:identity', 'OFF ⇒ applyText devuelve el mismo string (byte-idéntico)',
    offApplied === SAMPLE && sha256Text(offApplied) === sha256Text(SAMPLE), sha256Text(offApplied).slice(0, 16) + '…');
  check('X1-2:perchannel-off', 'per-channel OFF por defecto aunque el hook esté ON',
    (() => { globalThis.ARA_X_ENABLED = true; const r = hook.perChannelEnabled(); globalThis.ARA_X_ENABLED = false; return r === false; })(), 'false');

  // 3 · ON: bloque, posición, integridad
  globalThis.ARA_X_ENABLED = true;
  const onApplied = hook.applyText(SAMPLE, { listVersion: 'v-on' });
  const blockLines = hook.buildGlobalBlock({ listVersion: 'v-on' });
  const headerEnd = SAMPLE.indexOf('#EXTINF');
  const blockPos = onApplied.indexOf('#EXT-X-ARA-VERSION:');
  const firstExtinf = onApplied.indexOf('#EXTINF');
  check('X1-3:on-changes', 'ON ⇒ el texto cambia exactamente en el bloque', onApplied !== SAMPLE, 'delta=' + (onApplied.length - SAMPLE.length) + ' B');
  check('X1-3:lines', 'bloque de 27 líneas', blockLines.length === 27 && hook.BLOCK_LINES === 27, blockLines.length);
  check('X1-3:before-extinf', 'bloque antes del primer #EXTINF y después del header',
    blockPos > 0 && blockPos < firstExtinf && firstExtinf > headerEnd, `block@${blockPos} extinf@${firstExtinf}`);
  check('X1-3:idempotent', '2ª aplicación no duplica', hook.applyText(onApplied, { listVersion: 'v-on' }) === onApplied, 'idempotente');
  check('X1-3:no-url-mutation', '0 URLs mutadas y mismo número',
    JSON.stringify(urlsOf(onApplied)) === JSON.stringify(urlsOf(SAMPLE)) && urlsOf(onApplied).length === 3,
    urlsOf(SAMPLE).length + ' URLs');

  // 4 · equivalencia con el inyector Node
  const LIST_VERSIONS = ['v-on', '2026-10-30T22:07:37Z', 'unknown'];
  let equivalenceOk = true;
  const equivalenceDetail = [];
  for (const lv of LIST_VERSIONS) {
    const a = hook.buildGlobalBlock({ listVersion: lv });
    const b = injector.buildGlobalBlock({ listVersion: lv });
    const sameBlock = JSON.stringify(a) === JSON.stringify(b);
    const inj = injector.injectText(SAMPLE, { listVersion: lv }).text;
    const sameText = hook.applyText(SAMPLE, { listVersion: lv }) === inj;
    if (!sameBlock || !sameText) equivalenceOk = false;
    equivalenceDetail.push(lv + ':' + (sameBlock ? 'block-ok' : 'block-DIFF') + '/' + (sameText ? 'text-ok' : 'text-DIFF'));
  }
  globalThis.ARA_X_ENABLED = false;
  check('X1-4:injector-equivalence', 'hook ≡ ara_x_injector.js (bloque y applyText)', equivalenceOk, equivalenceDetail.join(' · '));

  // 5 · per-channel
  globalThis.ARA_X_ENABLED = true;
  globalThis.ARA_X_PER_CHANNEL = true;
  const perOn = hook.perChannelEnabled();
  const augmented = hook.augmentEntry('#EXTINF:-1 tvg-id="10" tvg-name="A" ape-profile="P3",A\n#EXTVLCOPT:x\nhttps://cdn.example/live/10.m3u8');
  const augmentedNoEvidence = hook.augmentEntry('#EXTINF:-1 tvg-name="B",B\nhttps://cdn.example/live/11.m3u8');
  check('X1-5:flag', 'ARA_X_PER_CHANNEL=true ⇒ per-channel ON', perOn === true, String(perOn));
  check('X1-5:evidence', 'directivas solo con evidencia (CHANNEL-ID + PROFILE-HINT)',
    augmented.startsWith('#EXTINF:-1 tvg-id="10" tvg-name="A" ape-profile="P3",A\n#EXT-X-ARA-CHANNEL-ID:10\n#EXT-X-ARA-PROFILE-HINT:P3\n#EXTVLCOPT:x\n'),
    JSON.stringify(augmented.split('\n').slice(1, 3)));
  check('X1-5:no-evidence', 'sin evidencia ⇒ entrada intacta', augmentedNoEvidence === '#EXTINF:-1 tvg-name="B",B\nhttps://cdn.example/live/11.m3u8', 'intacta');
  const injPer = injector.injectText(SAMPLE, { listVersion: 'v-on', perChannel: true }).text;
  const simPer = hook.applyText(SAMPLE, { listVersion: 'v-on' }).split('\n').map((l) => (l.startsWith('#EXTINF') ? hook.augmentEntry(l + '\n').replace(/\n$/, '') : l)).join('\n');
  check('X1-5:injector-equivalence', 'per-channel ≡ injector(perChannel:true)',
    hook.applyText(SAMPLE, { listVersion: 'v-on' }) === injector.injectText(SAMPLE, { listVersion: 'v-on' }).text &&
    simPer === injPer, simPer === injPer ? 'entry-aligned' : 'DIFF');

  // 6 · fail-open
  const throwing = {};
  Object.defineProperty(throwing, 'ARA_X_ENABLED', { get() { throw new Error('boom'); } });
  const failOpen = hook.enabled(throwing) === false &&
    hook.applyText(null) === null &&
    hook.applyText(12345) === 12345 &&
    hook.augmentEntry(null) === null &&
    hook.augmentEntry('no-extinf') === 'no-extinf';
  check('X1-6:fail-open', 'entradas inválidas y flag que lanza ⇒ identidad', failOpen, 'ok');
  globalThis.ARA_X_ENABLED = savedEnabled;
  if (savedPerChannel === undefined) delete globalThis.ARA_X_PER_CHANNEL; else globalThis.ARA_X_PER_CHANNEL = savedPerChannel;

  // 7 · patch
  const patchText = fs.readFileSync(PATCH, 'utf8');
  const diffFiles = patchText.split('\n').filter((l) => l.startsWith('diff --git')).length;
  const newFiles = patchText.split('\n').filter((l) => l.startsWith('new file mode')).length;
  const hunks = patchText.split('\n').filter((l) => l.startsWith('@@')).length;
  check('X1-7:shape', 'patch con 3 archivos (1 nuevo) y 4 hunks', diffFiles === 3 && newFiles === 1 && hunks === 4, `${diffFiles} files · ${newFiles} new · ${hunks} hunks`);
  const applyCheck = run('git', ['apply', '--check', '--whitespace=nowarn', PATCH], { cwd: ROOT });
  check('X1-7:applies', 'git apply --check sobre el árbol actual', applyCheck.status === 0,
    (applyCheck.stderr || applyCheck.stdout || '').trim().slice(0, 200) || 'exit 0');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x1-verify-'));
  let tmpDetail = '';
  try {
    const g = (args) => run('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', ...args], { cwd: tmp });
    g(['init', '-q']);
    g(['-c', 'user.email=x@y.z', '-c', 'user.name=x1', 'config', 'user.email', 'x@y.z']);
    g(['config', 'user.name', 'x1']);
    for (const rel of [REL_GEN, REL_HTML]) {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel));
    }
    g(['add', '-A']);
    run('git', ['-c', 'user.email=x@y.z', '-c', 'user.name=x1', 'commit', '-qm', 'base'], { cwd: tmp });
    const applied = run('git', ['apply', '--whitespace=nowarn', PATCH], { cwd: tmp });
    const nodeCheck = (rel) => run(process.execPath, ['-c', path.join(tmp, rel)]).status;
    const genPatched = fs.readFileSync(path.join(tmp, REL_GEN), 'utf8');
    const htmlPatched = fs.readFileSync(path.join(tmp, REL_HTML), 'utf8');
    const hookPatched = fs.existsSync(path.join(tmp, REL_HOOK));
    const checksTmp = {
      applied: applied.status === 0,
      hookCreated: hookPatched,
      genCheck: nodeCheck(REL_GEN) === 0,
      hookCheck: hookPatched && nodeCheck(REL_HOOK) === 0,
      guards: (genPatched.match(/window\.ARA_X_HOOK\.enabled\(\)/g) || []).length === 1 &&
        (genPatched.match(/window\.ARA_X_HOOK\.perChannelEnabled\(\)/g) || []).length === 1 &&
        (genPatched.match(/_araXErr/g) || []).length === 2,
      noHardcodedBlock: !genPatched.includes('#EXT-X-ARA-VERSION:'),
      letEntry: genPatched.includes('let entry = generateChannelEntry('),
      scriptOrder: (() => {
        const hookTag = htmlPatched.indexOf('<script src="js/ape-v9/ara-x-hook.js');
        const genTag = htmlPatched.indexOf('<script src="js/ape-v9/m3u8-typed-arrays-ultimate.js');
        return hookTag !== -1 && genTag !== -1 && hookTag < genTag;
      })()
    };
    tmpDetail = JSON.stringify(checksTmp);
    check('X1-7:apply-temp', 'aplicado en repo temporal: hook creado + node -c del generador y del hook',
      checksTmp.applied && checksTmp.hookCreated && checksTmp.genCheck && checksTmp.hookCheck, tmpDetail);
    check('X1-7:guards', 'generador parcheado: 2 guards fail-open, 0 bloque hardcodeado, let entry, orden de scripts',
      checksTmp.guards && checksTmp.noHardcodedBlock && checksTmp.letEntry && checksTmp.scriptOrder, tmpDetail);
  } finally {
    if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
  }

  // 8 · simulación de la frontera del stream (header + entries)
  const headerChunk = SAMPLE.slice(0, SAMPLE.indexOf('#EXTINF'));
  const entriesChunk = SAMPLE.slice(SAMPLE.indexOf('#EXTINF'));
  const streamOff = headerChunk + entriesChunk;
  globalThis.ARA_X_ENABLED = true;
  const streamOn = headerChunk + hook.blockChunk({ listVersion: 'v-stream' }) + entriesChunk;
  const injStream = injector.injectText(SAMPLE, { listVersion: 'v-stream' }).text;
  globalThis.ARA_X_ENABLED = false;
  check('X1-8:stream-off', 'frontera OFF ⇒ byte-idéntico al baseline', streamOff === SAMPLE, sha256Text(streamOff).slice(0, 16) + '…');
  check('X1-8:stream-on', 'frontera ON ⇒ byte-idéntico a injectText del inyector', streamOn === injStream,
    sha256Text(streamOn).slice(0, 16) + '… vs ' + sha256Text(injStream).slice(0, 16) + '…');

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.id} · ${c.name}`);
    if (!c.ok || process.env.X1_VERBOSE === '1') console.log('      ' + c.detail);
  }
  console.log(`\nchecks=${checks.length} pass=${checks.length - failed.length} fail=${failed.length}`);
  console.log(JSON.stringify({
    ok: failed.length === 0,
    checks: checks.length,
    failed: failed.map((c) => c.id),
    hook_sha256: sha256(HOOK),
    patch_sha256: sha256(PATCH),
    hot_files_unchanged: checks.filter((c) => c.id.startsWith('X1-1:')).every((c) => c.ok)
  }));
  console.log(failed.length === 0 ? 'ALL_OK' : 'NOT_OK');
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
