#!/usr/bin/env node
'use strict';
/**
 * tools/quality/test_jit_receipt_emitter.js — prueba del emisor §4.
 *
 * Cuatro casos, y cada uno se juzga con el JUEZ REAL del contrato
 * (`validateReceipt` de test_canary_jit_contract.js), no con una copia de su
 * logica:
 *   C1 RECIBO HONESTO     motor real en loopback -> recibo -> ACCEPT
 *   C2 CONTROL NEGATIVO   recibo que declara aplicado lo que no se ejecuto -> REJECT
 *   C3 CONTROL DE AUSENCIA sin requested / sin output / policy a ceros -> REJECT
 *   C4 AUSENCIA DE TEATRO el emisor no puede emitir APPLIED_MEASURED si no se ejecuto nada
 *
 * Sin red (todo loopback), sin VPS. Monta el motor en os.tmpdir, lo mata y
 * borra los temporales al terminar.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const emitter = require('../canary/jit_receipt_emitter.js');
const judge = require('./test_canary_jit_contract.js');

const CONTRACT_PATH = emitter.CONTRACT_PATH;
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const ENGINE_PATH = path.join(ROOT, 'tools', 'lab', 'ape-jit', 'server.js');
const PORT = 3199;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-receipt-test-'));
let engine = null;
let srcServer = null;
let engineLog = '';

/* ── utilidades de medicion ─────────────────────────────────────────────── */
function ffprobeJson(args) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-of', 'json'].concat(args), { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('ffprobe fallo (' + r.status + '): ' + (r.stderr || '').slice(0, 300));
  return JSON.parse(r.stdout);
}

/* Bitrate del flujo elemental: suma de tamaños de paquete / duracion. Se usa
 * la MISMA formula en los dos lados para no comparar pera con manzana. */
function esBitrate(file, seconds) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=size', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const sizes = String(r.stdout || '').split(/\r?\n/).map((l) => (l.match(/\d+/) || [])[0]).filter(Boolean).map(Number);
  if (!sizes.length || !seconds) return null;
  return Math.round(sizes.reduce((a, b) => a + b, 0) * 8 / seconds);
}

const getJson = async (p, ms) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms || 20000);
  try {
    const r = await fetch('http://127.0.0.1:' + PORT + p, { signal: ac.signal, redirect: 'manual' });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* no json */ }
    return { status: r.status, headers: Object.fromEntries(r.headers), text, json };
  } catch (e) {
    return { status: 0, error: String((e && e.message) || e) };
  } finally { clearTimeout(t); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── arranque: clip local + servidor estatico + motor ───────────────────── */
async function startStack() {
  const clip = path.join(TMP, 'src.ts');
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', 'testsrc2=size=1280x720:rate=25:duration=2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-f', 'mpegts', clip], { encoding: 'utf8' });
  if (ff.status !== 0 || !fs.existsSync(clip)) throw new Error('no se pudo generar el clip de prueba: ' + (ff.stderr || '').slice(0, 200));

  srcServer = http.createServer((req, res) => {
    try {
      const b = fs.readFileSync(clip);
      res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': b.length });
      res.end(b);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => srcServer.listen(0, '127.0.0.1', r));
  const clipPort = srcServer.address().port;

  const engineCopy = path.join(TMP, 'server.js');
  fs.copyFileSync(ENGINE_PATH, engineCopy);
  const mapFile = path.join(TMP, 'map.json');
  fs.writeFileSync(mapFile, JSON.stringify({
    1: { url: 'http://127.0.0.1:' + clipPort + '/src.ts', name: 'receipt-probe' },
    2: { url: 'http://127.0.0.1:' + clipPort + '/src.ts', name: 'receipt-probe-2' }
  }));
  /* El motor busca la sesion en RECEIPT_SESSION_ROOT=/dev/shm/ape-jit (L5752),
   * que en este host resuelve a <unidad>:\dev\shm\ape-jit. Se crea para que el
   * recibo del motor pueda LEER lo que el propio motor escribio. */
  try { fs.mkdirSync('/dev/shm/ape-jit', { recursive: true }); } catch (e) { /* best effort */ }

  engine = spawn(process.execPath, [engineCopy], {
    cwd: TMP,
    env: Object.assign({}, process.env, {
      PORT: String(PORT), BIND: '127.0.0.1', MAP_FILE: mapFile,
      IDLE_MS: '180000', WAIT_MS: '60000', BOOT_GRACE_MS: '60000', APE_2K: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  engineLog = '';
  engine.stdout.on('data', (d) => { engineLog += String(d); });
  engine.stderr.on('data', (d) => { engineLog += String(d); });

  for (let i = 0; i < 60; i++) {
    const h = await getJson('/health', 3000);
    if (h.status === 200) return { clip };
    await sleep(500);
  }
  throw new Error('el motor no respondio /health en 30 s: ' + engineLog.slice(-400));
}

function stopStack() {
  try { if (engine) engine.kill('SIGKILL'); } catch (e) { /* ya muerto */ }
  try {
    if (srcServer) { srcServer.closeAllConnections && srcServer.closeAllConnections(); srcServer.close(); }
  } catch (e) { /* ya cerrado */ }
}

/* ── UNA EJECUCION REAL, medida sobre sus artefactos ────────────────────── */
async function runRealExecution() {
  const { clip } = await startStack();
  const go = await getJson('/go/1?p=P4.5', 15000);
  const pl = await getJson('/live/1/media_0.m3u8?p=P4.5', 90000);

  /* Se espera a que el motor escriba el master (lo escribe ffmpeg, no el test). */
  let receipt = null;
  for (let i = 0; i < 40; i++) {
    const r = await getJson('/image/receipt?channel=1', 20000);
    if (r.json) receipt = r.json;
    if (receipt && receipt.live && receipt.live.media_segments > 0) break;
    await sleep(1500);
  }
  if (!receipt || !receipt.session_dir) throw new Error('el motor no reporto sesion: ' + JSON.stringify(receipt));
  const sessionDir = receipt.session_dir;
  if (!fs.existsSync(sessionDir)) throw new Error('el motor reporta session_dir inexistente: ' + sessionDir);

  const files = fs.readdirSync(sessionDir);
  const master = fs.readFileSync(path.join(sessionDir, 'master.m3u8'), 'utf8');
  const initName = files.filter((f) => /^init-.+-0\.m4s$/.test(f))[0];
  const chunkName = files.filter((f) => /^chunk-.+-0-\d+\.m4s$/.test(f)).sort().pop();
  if (!initName || !chunkName) throw new Error('sin init/chunk de video en la sesion');
  const chunkPath = path.join(sessionDir, chunkName);

  /* El motor concatena init+chunk para medir (receiptProbeSegment). Aqui igual,
   * para que la medida sea sobre los mismos bytes que sirve el motor. */
  const probeFile = path.join(TMP, 'out_probe.mp4');
  fs.writeFileSync(probeFile, Buffer.concat([fs.readFileSync(path.join(sessionDir, initName)), fs.readFileSync(chunkPath)]));
  const probe = ffprobeJson(['-show_streams', '-show_format', probeFile]);
  const v = (probe.streams || []).find((s) => s.codec_type === 'video') || {};
  const a = (probe.streams || []).find((s) => s.codec_type === 'audio') || null;

  const src = ffprobeJson(['-show_streams', '-show_format', clip]);
  const sv = (src.streams || []).find((s) => s.codec_type === 'video') || {};
  const sa = (src.streams || []).find((s) => s.codec_type === 'audio') || null;
  const srcDur = Number(src.format && src.format.duration) || 2;

  const chunkBytes = fs.statSync(chunkPath).size;
  const chunkSeconds = 2; /* EXTINF medido de media_0.m3u8: 2.000000 */
  const srcTransfer = sv.color_transfer || 'unknown';
  const outTransfer = v.color_transfer || 'unknown';

  /* codec_mode: el motor NO expone el argv en este host (su receiptFindFfmpeg
   * lee /proc). Se deriva de tres hechos medidos y se declara como tal. */
  const masterRes = (master.match(/RESOLUTION=(\d+)x(\d+)/) || []);
  const sameGeom = Number(masterRes[1]) === sv.width && Number(masterRes[2]) === sv.height;
  const sameCodec = /avc1/.test(master) && /^h264$/.test(String(v.codec_name));
  const copyEvidence = sameGeom && sameCodec;

  return {
    receipt,
    files,
    descriptor: {
      engine_path: ENGINE_PATH,
      engine_receipt: receipt,
      stated_status: null,
      requested_mode: 'CANARY_SPATIAL_4K',
      desired: receipt.profile_declared
        ? { width: receipt.profile_declared.outW, height: receipt.profile_declared.outH, video_codec: 'libx265', level: 'L153' }
        : null,
      source: {
        width: sv.width, height: sv.height, fps: 25,
        transfer: srcTransfer, pix_fmt: sv.pix_fmt, video_codec: sv.codec_name,
        bitrate_bps: esBitrate(clip, srcDur),
        audio: { codec: sa ? sa.codec_name : null, channels: sa ? Number(sa.channels) : 0 }
      },
      output: {
        width: v.width, height: v.height, fps: 25,
        transfer: outTransfer, pix_fmt: v.pix_fmt, video_codec: v.codec_name,
        level: Number(v.level), sar: v.sample_aspect_ratio || 'unknown',
        bitrate_bps: Number(v.bit_rate) || Math.round(chunkBytes * 8 / chunkSeconds),
        audio: { codec: a ? a.codec_name : null, channels: a ? Number(a.channels) : 0 },
        artifact: { path: chunkPath, sha256: sha256(fs.readFileSync(chunkPath)), bytes: chunkBytes }
      },
      recipe: {
        codec_mode: copyEvidence ? 'copy' : 'transcode',
        filtergraph: '',
        encoder: null,
        evidence: null,
        measured_encode_fps: null,
        _derived_from: copyEvidence
          ? 'master.m3u8 declara RESOLUTION=' + masterRes[1] + 'x' + masterRes[2] + ' y CODECS avc1 = la MISMA geometria y familia de codec que la fuente; sin argv disponible (el motor lee /proc para el suyo)'
          : 'geometria o codec distintos de la fuente'
      },
      trace: {
        note: 'ejecucion local en loopback; el motor del VPS es otro sha',
        engine_log_start: (engineLog.match(/START .*/) || [''])[0].slice(0, 300),
        master_header: master.split('\n').filter((l) => l.startsWith('#EXT-X-STREAM-INF')).join(' | '),
        chunk_count: files.filter((f) => /^chunk-/.test(f)).length
      }
    },
    measured: { probeFile, master, chunkPath, sessionDir }
  };
}

module.exports = { runRealExecution, startStack, stopStack, TMP, PORT };

/* ── casos ──────────────────────────────────────────────────────────────── */
const cases = [];
const check = (id, name, fn) => cases.push({ id, name, fn });
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const clone = (o) => JSON.parse(JSON.stringify(o));
let STATE = {};

check('C1', 'RECIBO HONESTO: motor real en loopback -> juez real ACCEPT', async () => {
  const run = await runRealExecution();
  const rec = emitter.emitReceipt(run.descriptor, contract);
  const v = judge.validateReceipt(rec, contract);
  STATE.receipt = rec;
  STATE.verdict = v;
  STATE.descriptor = run.descriptor;
  STATE.run = run;
  assert(v.decision === 'ACCEPT', 'el juez REAL rechazo el recibo honesto: ' + v.code + ' :: ' + (v.reasons || []).join(' | '));
  assert(v.code === 'OK_APPLIED_MEASURED' || v.code === 'OK_NOT_APPLIED', 'codigo inesperado: ' + v.code);
  const names = rec.prompt_fields.map((f) => f.field);
  assert(names.length === 18, 'prompt_fields debe tener 18 entradas, tiene ' + names.length);
  for (const n of emitter.PROMPT_FIELDS) assert(names.indexOf(n) >= 0, 'falta el campo del prompt: ' + n);
  const medidos = rec.prompt_fields.filter((f) => f.status === 'MEDIDO').length;
  const noDisp = rec.prompt_fields.filter((f) => f.status === 'NO_DISPONIBLE').length;
  assert(medidos + noDisp === 18, 'cada campo debe ser MEDIDO o NO_DISPONIBLE (' + medidos + '+' + noDisp + ')');
  assert(rec.deployability.state === 'NOT_DEPLOYED', 'deployability.state debe ser NOT_DEPLOYED, es ' + rec.deployability.state);
  assert(rec.engine_sha256 === emitter.sha256File(ENGINE_PATH), 'engine_sha256 debe salir del fichero del motor');
  assert(rec.applied.status === 'NOT_APPLIED', 'una copia no puede declararse APPLIED_MEASURED (salio ' + rec.applied.status + ')');
  return 'decision=' + v.decision + ' code=' + v.code + ' · ' + medidos + ' MEDIDO + ' + noDisp + ' NO_DISPONIBLE · engine=' + rec.engine_sha256.slice(0, 12) + '… · deployability=' + rec.deployability.state;
});

check('C2', 'CONTROL NEGATIVO: declarar aplicado lo que no se ejecuto -> juez real REJECT', () => {
  const base = STATE.receipt;
  assert(base, 'C1 debe haber corrido antes');

  /* (a) el mismo recibo declarando APPLIED_MEASURED con una cadena de filtros
   *     que no se ejecuto (la ejecucion real fue una copia, sin -vf). */
  const a = clone(base);
  a.applied.status = 'APPLIED_MEASURED';
  a.applied.filtergraph = 'deblock,scale=3840:2160:flags=lanczos,unsharp=5:5:0.8:3:3:0.4';
  a.output.filters_applied = 3;
  const va = judge.validateReceipt(a, contract);
  assert(va.decision === 'REJECT', 'TEATRO ACEPTADO: el juez acepto un APPLIED_MEASURED sobre una copia (' + va.code + ')');

  /* (b) sin cambiar el estado: declarar filtros aplicados sobre un NOT_APPLIED. */
  const b = clone(base);
  b.output.filters_applied = 8;
  const vb = judge.validateReceipt(b, contract);
  assert(vb.decision === 'REJECT', 'TEATRO ACEPTADO: filtros>0 sobre NOT_APPLIED (' + vb.code + ')');

  /* (c) la cadena canonica COMPLETA y el encoder del contrato (no se llama a
   *     honestReceipt(): depende del estado interno del juez), para intentar
   *     disfrazar la copia de transcode. Se reporta lo que diga el juez. */
  const c = clone(base);
  c.applied.status = 'APPLIED_MEASURED';
  c.applied.codec_mode = 'transcode';
  c.applied.filtergraph = (contract.chain.stages || []).map((s) => s.filter).join(',');
  c.applied.encoder = {
    video_codec: contract.encoder.video_codec,
    preset: contract.encoder.preset,
    tune: contract.encoder.tune,
    x265_params: clone(contract.encoder.x265_params),
    rate_control: clone(contract.encoder.rate_control),
    gop: clone(contract.encoder.gop)
  };
  c.applied.parity = { computed: true, derived_from: 'applied.filtergraph', identical: true };
  c.applied.measured_encode_fps = 25;
  /* OJO: el juez exige aqui un STRING (artifactBytes -> path.isAbsolute).
   * Con el objeto {path,sha256,bytes} que documenta el propio esquema, el juez
   * LANZA TypeError en vez de rechazar: es el defecto D-1, y se demuestra en
   * la variante (d) sin parchear el validador. */
  c.applied.evidence = { frames: 50, seconds: 2, decode_errors: 0, artifact: STATE.run.measured.chunkPath };
  c.output.filters_applied = 8;
  const vc = judge.validateReceipt(c, contract);

  /* (d) DEFECTO D-1 del juez: applied.evidence.artifact como OBJETO (la forma
   *     que documenta el esquema) no produce un RECHAZO: produce una excepcion
   *     sin capturar. Un juez fail-closed debe RECHAZAR, no romperse. */
  const d = clone(c);
  d.applied.evidence.artifact = { path: STATE.run.measured.chunkPath, sha256: 'x', bytes: 1 };
  let crash = null;
  try { judge.validateReceipt(d, contract); } catch (e) { crash = e; }
  assert(crash, 'D-1 no reproducido: el juez acepto o rechazo un objeto sin lanzar');

  return 'a) APPLIED_MEASURED sobre copia -> ' + va.code
    + ' | b) filtros>0 sobre NOT_APPLIED -> ' + vb.code
    + ' | c) disfraz completo -> ' + vc.decision + ' ' + vc.code
    + ' | d) D-1: artifact como objeto lanza ' + crash.constructor.name + ' (' + String(crash.message).slice(0, 70) + '…)';
});

check('C3', 'CONTROL DE AUSENCIA: sin requested / sin output / policy a ceros -> REJECT', () => {
  const base = STATE.receipt;
  assert(base, 'C1 debe haber corrido antes');

  const noReq = clone(base); delete noReq.requested;
  const v1 = judge.validateReceipt(noReq, contract);
  assert(v1.decision === 'REJECT', 'acepto un recibo sin requested por omision');

  const noOut = clone(base); delete noOut.output;
  const v2 = judge.validateReceipt(noOut, contract);
  assert(v2.decision === 'REJECT', 'acepto un recibo sin output por omision');

  const zeros = clone(base); zeros.requested.policy_sha256 = '0'.repeat(64);
  const v3 = judge.validateReceipt(zeros, contract);
  assert(v3.decision === 'REJECT', 'acepto un policy_sha256 todo ceros');

  const noOrigin = clone(base); delete noOrigin.requested.source;
  const v4 = judge.validateReceipt(noOrigin, contract);
  assert(v4.decision === 'REJECT', 'acepto un recibo sin requested.source por omision');

  assert(v3.code === 'E_POLICY_PIN_MISMATCH', 'el pin a ceros debe dar E_POLICY_PIN_MISMATCH, dio ' + v3.code);
  return 'sin requested -> ' + v1.code + ' | sin output -> ' + v2.code + ' | policy a ceros -> ' + v3.code + ' | sin source -> ' + v4.code;
});

check('C4', 'AUSENCIA DE TEATRO: el emisor no puede emitir APPLIED_MEASURED si no se ejecuto nada', () => {
  assert(STATE.descriptor, 'C1 debe haber corrido antes');

  /* El llamador AFIRMA que se aplico. El emisor no le cree: deriva del hecho. */
  const d = clone(STATE.descriptor);
  d.stated_status = 'APPLIED_MEASURED';
  const rec = emitter.emitReceipt(d, contract);
  assert(rec.applied.status === 'NOT_APPLIED', 'el emisor acepto el estado del llamador: ' + rec.applied.status);
  assert(rec.claimed_status_ignored && rec.claimed_status_ignored.claimed === 'APPLIED_MEASURED',
    'el emisor debe registrar que ignoro el estado declarado');
  const v = judge.validateReceipt(rec, contract);
  assert(v.decision === 'ACCEPT' && v.code === 'OK_NOT_APPLIED', 'el recibo derivado debe ser aceptado como NOT_APPLIED');

  /* Y si a un campo obligatorio le falta la medida, el emisor LANZA: no emite
   * un recibo incompleto "para que pase". */
  const bad = clone(STATE.descriptor);
  delete bad.output.sar;
  let threw = null;
  try { emitter.emitReceipt(bad, contract); } catch (e) { threw = e; }
  assert(threw, 'el emisor emitio un recibo sin output.sar: deberia haber lanzado');
  assert(threw.code === 'E_EMITTER_REQUIRED_MISSING', 'codigo de error inesperado: ' + threw.code);

  return 'stated_status=APPLIED_MEASURED -> emitido ' + rec.applied.status + ' (' + v.code + ') · sin output.sar -> lanza ' + threw.code;
});

/* ── runner ─────────────────────────────────────────────────────────────── */
async function main() {
  console.log('== PRUEBA DEL EMISOR DE RECIBOS JIT (§4) — juez: ' + path.basename(CONTRACT_PATH) + ' ==');
  console.log('tmp: ' + TMP);
  console.log('');
  let pass = 0;
  let fail = 0;
  try {
    for (const c of cases) {
      try {
        const detail = await c.fn();
        pass++;
        console.log('  PASS  ' + c.id + '  ' + c.name);
        console.log('        ' + String(detail).replace(/\n/g, '\n        '));
      } catch (e) {
        fail++;
        console.log('  FAIL  ' + c.id + '  ' + c.name);
        console.log('        ' + String((e && e.message) || e).split('\n').join('\n        '));
      }
    }
  } finally {
    stopStack();
    await sleep(600);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* best effort: el motor puede retener handles */ }
    /* La sesion que el motor escribe en RECEIPT_SESSION_ROOT se borra tambien:
     * si no, cada corrida dejaria decenas de MB en /dev/shm/ape-jit/<id>. */
    try {
      const sd = path.join('/dev/shm/ape-jit');
      if (fs.existsSync(sd)) fs.rmSync(sd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (e) { /* best effort */ }
  }
  console.log('');
  console.log('-- resumen --');
  console.log('  casos: ' + cases.length + ' | PASS ' + pass + ' | FAIL ' + fail);
  console.log('  RESULT=' + (fail === 0 ? 'PASS' : 'FAIL'));
  process.exit(fail === 0 ? 0 : 1);
}

if (require.main === module) main().catch((e) => { console.error('TEST ERROR: ' + ((e && e.stack) || e)); stopStack(); process.exit(1); });

