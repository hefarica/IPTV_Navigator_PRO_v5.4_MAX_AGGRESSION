#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * CONTRATO DE /resolve EN SOLO-LECTURA (R11 / W-01)
 *
 * POR QUE EXISTE (2026-11-21)
 *   `/resolve` (y su alias `/jit/resolve`) es la URL que OTT consulta al abrir
 *   un canal. Hasta R11, un GET con `?p=` distinto del vigente ESCRIBIA
 *   IMAGE_CONFIG_FILE sin normalizar ni atomicidad y llamaba stopCurrent: una
 *   ruta de LECTURA mutaba el estado global y mataba el ffmpeg vivo.
 *
 * QUE FIJA ESTE TEST (debe FALLAR si alguien vuelve a hacerlo)
 *   1. GET con `?p=` valido y distinto del vigente -> 200, gate=read,
 *      el sha256 de image-config.json NO cambia y stopCurrent NO se invoca.
 *   2. Escritura EXPLICITA (POST + X-APE-Write: 1 + X-APE-Key) -> gate=applied,
 *      el config cambia, deja backup y el JSON escrito es valido/legible.
 *   3. `?p=` vacio -> 400 rejected con motivo; el config NO cambia.
 *   4. `?p=` desconocido -> 400 rejected con motivo; el config NO cambia.
 *   Extra: `?write=1` por GET NO autoriza (la escritura exige POST).
 *
 * COMO
 *   Levanta el motor CANONICO en 127.0.0.1:<puerto libre> con TODOS los
 *   ficheros de estado en un directorio temporal (nada de /opt/ape-jit), lee
 *   el sha256 del config antes/despues de cada caso y parsea las lineas
 *   RESOLVE/GO del stdout para demostrar que `stop_calls` no sube en lectura.
 *   No toca el VPS, ni nginx, ni el servicio real.
 *
 * USO
 *   node tools/quality/test_jit_resolve_readonly.js            (0 = cumple)
 *   node tools/quality/test_jit_resolve_readonly.js --quiet
 *   APE_JIT_SERVER=<ruta server.js>   KEEP=1 (no borra el sandbox)
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.resolve(process.env.APE_JIT_SERVER || path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'ape-jit', 'server.js'));
const quiet = process.argv.includes('--quiet');
const KEEP = process.env.KEEP === '1';

const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-jit-r11-'));
const F = {
  map: path.join(SB, 'channels.json'),
  imageConfig: path.join(SB, 'image-config.json'),
  matrix: path.join(SB, 'profile-matrix.json'),
  governance: path.join(SB, 'governance.json'),
  rules: path.join(SB, 'transform-rules.json'),
  signals: path.join(SB, 'channel-signals.json'),
  llmKey: path.join(SB, 'llm-key.json'),
  profiles: path.join(SB, 'profiles.json'),
  gestorStore: path.join(SB, 'gestor-profiles.json'),
  gestorBackup: path.join(SB, 'backups'),
  gestureJournal: path.join(SB, 'gestor-journal.jsonl'),
  gestorPending: path.join(SB, 'pending'),
  tuneJournal: path.join(SB, 'tune-journal.jsonl'),
  lists: path.join(SB, 'lists'),
  out: path.join(SB, 'out'),
  apiKey: path.join(SB, 'api-key.txt')
};
const TOKEN = 'R11-TEST-TOKEN-0123456789';

const results = [];
let failures = 0;
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: String(detail === undefined ? '' : detail) });
  if (!cond) failures++;
  if (!quiet) console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
}
function sha256File(p) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (_) { return null; }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function req(method, urlPath, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const r = http.request({
      host: '127.0.0.1', port: o.port, method, path: urlPath,
      headers: o.headers || {}, timeout: 6000
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, headers: {}, body: '__timeout__' }); });
    r.on('error', (e) => resolve({ status: 0, headers: {}, body: '__error__:' + e.message }));
    if (o.body) r.write(o.body);
    r.end();
  });
}

function freePort() {
  return new Promise((resolve) => {
    const s = require('net').createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

(async function main() {
  // ── fixtures: estado inicial conocido ─────────────────────────────────────
  fs.writeFileSync(F.map, JSON.stringify({ C1: { url: 'http://127.0.0.1:9/x.m3u8', name: 'C1', group: 'TEST' } }));
  fs.writeFileSync(F.imageConfig, JSON.stringify({ profile: 'P3', target: 'FHD_1080', recipe: 'light', crf: 22, force_transcode: false }, null, 2));
  fs.writeFileSync(F.profiles, JSON.stringify({ profiles: { P0: { id: 'P0', name: 'P0' }, P3: { id: 'P3', name: 'P3' } } }));
  fs.writeFileSync(F.apiKey, TOKEN);

  const port = await freePort();
  const env = Object.assign({}, process.env, {
    PORT: String(port), BIND: '127.0.0.1',
    MAP_FILE: F.map, OUT_ROOT: F.out,
    IMAGE_CONFIG_FILE: F.imageConfig, PROFILE_MATRIX_FILE: F.matrix,
    GOVERNANCE_FILE: F.governance, RULES_FILE: F.rules,
    CHANNEL_SIGNAL_FILE: F.signals, LLM_KEY_FILE: F.llmKey,
    PROFILES_JSON: F.profiles, GESTOR_STORE: F.gestorStore,
    GESTOR_BACKUP_DIR: F.gestorBackup, GESTOR_JOURNAL: F.gestureJournal,
    GESTOR_PENDING_DIR: F.gestorPending, TUNE_JOURNAL: F.tuneJournal,
    LISTS_DIR: F.lists, APE_JIT_API_KEY_FILE: F.apiKey
  });

  const child = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => { stdout += d; });

  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await sleep(100);
      const h = await req('GET', '/health', { port });
      if (h.status === 200) up = true;
    }
    if (!up) {
      check('motor arriba en 127.0.0.1:' + port, false, stdout.slice(-300) + stderr.slice(-300));
      throw new Error('el motor no arranco');
    }
    check('motor arriba (gate de identidad: /health 200 + /image/config GET 200)', true, 'puerto=' + port);
    const idCheck = await req('GET', '/image/config', { port });
    check('identidad: /image/config responde 200 (el stub no tiene la ruta)', idCheck.status === 200, 'status=' + idCheck.status);

    // ── caso 1: GET con p distinto del vigente NO escribe ni corta ──────────
    const sha0 = sha256File(F.imageConfig);
    const r1 = await req('GET', '/resolve?channel=C1&p=P0', { port });
    const sha1 = sha256File(F.imageConfig);
    check('1 GET ?p=P0 -> 200', r1.status === 200, 'status=' + r1.status);
    check('1 gate=read', r1.headers['x-ape-resolve'] === 'read', 'X-APE-Resolve=' + r1.headers['x-ape-resolve']);
    check('1 config NO cambia (sha256)', sha0 === sha1, 'antes=' + String(sha0).slice(0, 16) + ' despues=' + String(sha1).slice(0, 16));
    check('1 responde el plan de P0', /^\d+x\d+\//.test(String(r1.headers['x-ape-resolve-plan'] || '')), 'plan=' + r1.headers['x-ape-resolve-plan']);
    check('1 declara que NO corto el job', r1.headers['x-ape-resolve-stop'] === 'not-stopped', 'Stop=' + r1.headers['x-ape-resolve-stop']);
    check('1 cuerpo lleva el recibo legible', /# APE-RESOLVE: read/.test(r1.body), r1.body.split('\n')[1]);

    // ── caso 2: p vacio y p desconocido se rechazan ────────────────────────
    const r2 = await req('GET', '/resolve?channel=C1&p=', { port });
    const sha2 = sha256File(F.imageConfig);
    check('2 ?p= -> 400', r2.status === 400, 'status=' + r2.status);
    check('2 gate=rejected con motivo "p vacio"', r2.headers['x-ape-resolve'] === 'rejected' && /p vacio/.test(r2.headers['x-ape-resolve-reason'] || ''), 'reason=' + r2.headers['x-ape-resolve-reason']);
    check('2 config NO cambia', sha1 === sha2, 'sha=' + String(sha2).slice(0, 16));

    const r3 = await req('GET', '/resolve?channel=C1&p=BOGUS', { port });
    const sha3 = sha256File(F.imageConfig);
    check('3 ?p=BOGUS -> 400', r3.status === 400, 'status=' + r3.status);
    check('3 gate=rejected con motivo "perfil desconocido"', r3.headers['x-ape-resolve'] === 'rejected' && /perfil desconocido/.test(r3.headers['x-ape-resolve-reason'] || ''), 'reason=' + r3.headers['x-ape-resolve-reason']);
    check('3 config NO cambia', sha2 === sha3, 'sha=' + String(sha3).slice(0, 16));

    // ── extra: ?write=1 por GET no autoriza (exige POST) ───────────────────
    const r4 = await req('GET', '/resolve?channel=C1&p=P0&write=1', { port });
    const sha4 = sha256File(F.imageConfig);
    check('4 GET ?write=1 -> 405 rejected "exige POST"', r4.status === 405 && /exige POST/.test(r4.headers['x-ape-resolve-reason'] || ''), 'status=' + r4.status + ' reason=' + r4.headers['x-ape-resolve-reason']);
    check('4 config NO cambia', sha3 === sha4, 'sha=' + String(sha4).slice(0, 16));

    // ── extra 4b: POST con señal pero SIN key -> 403 y no escribe ─────────
    const r4b = await req('POST', '/resolve?channel=C1&p=P0', { port, headers: { 'X-APE-Write': '1', 'Content-Length': 0 } });
    const sha4b = sha256File(F.imageConfig);
    check('4b POST sin key -> 403 rejected', r4b.status === 403 && r4b.headers['x-ape-resolve'] === 'rejected', 'status=' + r4b.status + ' reason=' + r4b.headers['x-ape-resolve-reason']);
    check('4b config NO cambia', sha4 === sha4b, 'sha=' + String(sha4b).slice(0, 16));

    // ── caso 5: escritura explicita autenticada SI escribe, con backup ─────
    const r5 = await req('POST', '/resolve?channel=C1&p=P0', {
      port, headers: { 'X-APE-Write': '1', 'X-APE-Key': TOKEN, 'Content-Length': 0 }
    });
    const sha5 = sha256File(F.imageConfig);
    let parsed = null;
    try { parsed = JSON.parse(fs.readFileSync(F.imageConfig, 'utf8')); } catch (_) { }
    const backups = fs.existsSync(path.join(path.dirname(F.imageConfig), 'backups', 'image-config'))
      ? fs.readdirSync(path.join(path.dirname(F.imageConfig), 'backups', 'image-config')).filter((x) => x.endsWith('.json'))
      : [];
    check('5 POST + X-APE-Write + key -> 200', r5.status === 200, 'status=' + r5.status);
    check('5 gate=applied', r5.headers['x-ape-resolve'] === 'applied', 'X-APE-Resolve=' + r5.headers['x-ape-resolve']);
    check('5 config SI cambia', sha4 !== sha5, 'antes=' + String(sha4).slice(0, 16) + ' despues=' + String(sha5).slice(0, 16));
    check('5 JSON escrito es valido y con profile=P0', !!parsed && parsed.profile === 'P0', 'profile=' + (parsed && parsed.profile));
    check('5 deja backup del previo', backups.length >= 1, 'backups=' + backups.join(','));
    check('5 declara el backup en la respuesta', !!(r5.headers['x-ape-resolve-backup'] || ''), 'backup=' + r5.headers['x-ape-resolve-backup']);

    // ── caso 6: la misma escritura SIN key no escribe ─────────────────────
    const r6 = await req('POST', '/resolve?channel=C1&p=P3', { port, headers: { 'X-APE-Write': '1', 'Content-Length': 0 } });
    const sha6 = sha256File(F.imageConfig);
    check('6 POST sin key -> no escribe (gate != applied)', r6.headers['x-ape-resolve'] !== 'applied', 'gate=' + r6.headers['x-ape-resolve'] + ' reason=' + r6.headers['x-ape-resolve-reason']);
    check('6 config NO cambia', sha5 === sha6, 'sha=' + String(sha6).slice(0, 16));

    // ── caso 6b/6c: /go/<id> (el otro escritor de W-01) es lectura por defecto ──
    const r6b = await req('GET', '/go/C1?p=P3', { port });
    const sha6b = sha256File(F.imageConfig);
    check('6b GET /go?p=P3 -> 302 lectura', r6b.status === 302 && r6b.headers['x-ape-resolve'] === 'read', 'status=' + r6b.status + ' gate=' + r6b.headers['x-ape-resolve']);
    check('6b /go config NO cambia', sha6 === sha6b, 'sha=' + String(sha6b).slice(0, 16));
    const r6c = await req('GET', '/go/C1?p=', { port });
    check('6c GET /go?p= -> 400 rejected', r6c.status === 400 && r6c.headers['x-ape-resolve'] === 'rejected', 'status=' + r6c.status + ' reason=' + r6c.headers['x-ape-resolve-reason']);

    // ── stopCurrent: prueba por contador en el log ────────────────────────
    const lines = stdout.split('\n').filter((l) => /(^|\s)(RESOLVE|GO)\s/.test(l));
    const seq = lines
      .map((l) => ({
        gate: (l.match(/gate=(\w+)/) || [])[1],
        n: Number((l.match(/stop_calls=(\d+)/) || [])[1])
      }))
      .filter((x) => x.gate && Number.isFinite(x.n));
    let readFlat = seq.length > 1;
    let appliedPlus = false;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i].gate === 'read' && seq[i].n !== seq[i - 1].n) readFlat = false;
      if (seq[i].gate === 'applied' && seq[i].n === seq[i - 1].n + 1) appliedPlus = true;
    }
    check('7 lectura: stop_calls NO incrementa (stopCurrent no invocado)', readFlat, seq.map((s) => s.gate + ':' + s.n).join(' '));
    check('7 escritura explicita: stop_calls +1 (el contador no es vacuo)', appliedPlus, seq.map((s) => s.gate + ':' + s.n).join(' '));

    // ── resumen ────────────────────────────────────────────────────────────
    const total = results.length;
    const pass = total - failures;
    if (!quiet) {
      console.log('\n== RESOLVE READONLY: ' + pass + '/' + total + ' PASS' + (failures ? ' · ' + failures + ' FAIL' : '') + ' ==');
      console.log('motor: ' + path.relative(ROOT, SERVER));
      console.log('sha256 motor: ' + sha256File(SERVER));
      console.log('sandbox: ' + SB);
      console.log('\n-- lineas RESOLVE/GO del motor --');
      for (const l of lines) console.log('  ' + l.trim());
    }
    process.exitCode = failures ? 1 : 0;
  } catch (e) {
    console.error('TEST ERROR: ' + (e && e.message));
    process.exitCode = 2;
  } finally {
    try { child.kill('SIGTERM'); } catch (_) { }
    await sleep(300);
    try { child.kill('SIGKILL'); } catch (_) { }
    if (!KEEP) { try { fs.rmSync(SB, { recursive: true, force: true }); } catch (_) { } }
  }
})();
