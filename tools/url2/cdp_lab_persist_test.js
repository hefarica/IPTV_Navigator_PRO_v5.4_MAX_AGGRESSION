#!/usr/bin/env node
'use strict';
/**
 * cdp_lab_persist_test.js — prueba con navegador REAL (Chrome headless + CDP)
 * que el LAB completo se guarda y se restaura entre procesos distintos.
 *
 * Usa el WebSocket global de Node (>=22). No requiere dependencias.
 */
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.CDP_TEST_PORT || 9333);
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:8123';
const PROFILE = path.join(os.tmpdir(), 'ape_lab_cdp_profile');
const MODE = process.argv[2] || 'both';
const STATE_FILE = path.join(os.tmpdir(), 'ape_lab_phaseA.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitTargets() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await getJson('http://127.0.0.1:' + PORT + '/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (e) { }
    await sleep(300);
  }
  throw new Error('sin target CDP');
}

function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error('ws error'));
  });
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  return { ws, ready, send };
}

async function evaluate(cdp, expression, awaitPromise = true) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.error) throw new Error(JSON.stringify(r.error));
  const res = r.result || {};
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 400));
  return res.result ? res.result.value : undefined;
}

function portFree() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:' + PORT + '/json/version', () => { resolve(false); req.destroy(); });
    req.on('error', () => resolve(true));
    req.setTimeout(800, () => { req.destroy(); resolve(true); });
  });
}
async function waitPortFree() {
  for (let i = 0; i < 40; i++) { if (await portFree()) return true; await sleep(300); }
  return false;
}
async function launch() {
  await waitPortFree();
  try { fs.rmSync(path.join(PROFILE, 'SingletonLock'), { force: true }); } catch (e) { }
  try { fs.rmSync(path.join(PROFILE, 'SingletonSocket'), { force: true }); } catch (e) { }
  try { fs.rmSync(path.join(PROFILE, 'SingletonCookie'), { force: true }); } catch (e) { }
  const chrome = spawn(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, 'about:blank'
  ], { stdio: 'ignore' });
  let page = null;
  for (let attempt = 0; attempt < 3 && !page; attempt++) {
    try { page = await waitTargets(); } catch (e) { await sleep(800); }
  }
  if (!page) throw new Error('sin target CDP tras 3 intentos');
  const cdp = cdpConnect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return { chrome, cdp };
}
async function closeChrome(ctx) {
  try { await ctx.cdp.send('Browser.close', {}); } catch (e) { }
  await sleep(1500);
  try { ctx.chrome.kill(); } catch (e) { }
  try { execFileSync('taskkill', ['/IM', 'chrome.exe', '/F'], { stdio: 'ignore' }); } catch (e) { }
  await sleep(1500);
}
async function runPhase3() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  const ctx = await launch();
  try {
    await ctx.cdp.send('Page.navigate', { url: BASE + '/phase3.html' });
    await sleep(900);
    let saved = null, hash = null;
    for (let i = 0; i < 50; i++) {
      saved = await evaluate(ctx.cdp, 'window.__LAB_SAVE_RESULT || null');
      hash = await evaluate(ctx.cdp, 'window.__LAB_HASH || null');
      if (saved && hash) break;
      await sleep(300);
    }
    ok('fase A: snapshot guardado (IDB)', !!(saved && saved.idbOk), JSON.stringify(saved));
    ok('fase A: hash del LAB calculado', !!hash, String(hash).slice(0, 16));
    fs.writeFileSync(STATE_FILE, JSON.stringify({ hash: hash, saved: saved }), 'utf8');
  } finally { await closeChrome(ctx); }
  console.log('\nRESUMEN LAB-PERSIST(A): ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exitCode = fail ? 1 : 0;
}
async function runPhase4() {
  const prev = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const ctx = await launch();
  try {
    await ctx.cdp.send('Page.navigate', { url: BASE + '/phase4.html' });
    await sleep(900);
    let res = null;
    for (let i = 0; i < 50; i++) {
      res = await evaluate(ctx.cdp, 'window.__LAB_RESTORE_RESULT || null');
      if (res) break;
      await sleep(300);
    }
    ok('fase B: restauración completa', !!(res && res.ok), JSON.stringify(res && { keys: res.keys, missing: res.missing }));
    ok('fase B: hash idéntico al importado', !!(res && res.hash === prev.hash), (res && res.hash || '') + ' vs ' + prev.hash);
    ok('fase B: extras preservados (dnr_calibration/prisma_lab_sync_v20/synthesized_at)', !!(res && res.has_extras));
  } finally { await closeChrome(ctx); }
  console.log('\nRESUMEN LAB-PERSIST(B): ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exitCode = fail ? 1 : 0;
}
(async () => {
  try {
    if (MODE === 'phase4') return await runPhase4();
    if (MODE === 'phase3') return await runPhase3();
    fs.rmSync(PROFILE, { recursive: true, force: true });
    fs.mkdirSync(PROFILE, { recursive: true });

    const chrome = spawn(CHROME, [
      '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + PROFILE,
      'about:blank'
    ], { stdio: 'ignore' });

    try {
      const page = await waitTargets();
      const cdp = cdpConnect(page.webSocketDebuggerUrl);
      await cdp.ready;
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');

      // ── FASE A: importar y guardar LAB completo ──────────────────────────
      await cdp.send('Page.navigate', { url: BASE + '/phase3.html' });
      await sleep(800);
      let saved = null;
      for (let i = 0; i < 40; i++) {
        saved = await evaluate(cdp, 'window.__LAB_SAVE_RESULT || null');
        if (saved) break;
        await sleep(300);
      }
      ok('fase A: snapshot guardado (IDB)', !!(saved && saved.idbOk), JSON.stringify(saved));
      const hashA = await evaluate(cdp, 'window.__LAB_HASH || null');
      ok('fase A: hash del LAB calculado', !!hashA, String(hashA).slice(0, 16));

      // ── FASE B: proceso NUEVO (cerrar ventana) y restaurar ───────────────
      cdp.ws.close();
      execFileSync('taskkill', ['/IM', 'chrome.exe', '/F'], { stdio: 'ignore' });
      await sleep(1200);

      const chrome2 = spawn(CHROME, [
        '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--no-first-run', '--no-default-browser-check',
        '--remote-debugging-port=' + PORT,
        '--user-data-dir=' + PROFILE,
        'about:blank'
      ], { stdio: 'ignore' });
      try {
        const page2 = await waitTargets();
        const cdp2 = cdpConnect(page2.webSocketDebuggerUrl);
        await cdp2.ready;
        await cdp2.send('Page.enable');
        await cdp2.send('Runtime.enable');
        await cdp2.send('Page.navigate', { url: BASE + '/phase4.html' });
        await sleep(800);
        let restored = null;
        for (let i = 0; i < 40; i++) {
          restored = await evaluate(cdp2, 'window.__LAB_RESTORE_RESULT || null');
          if (restored) break;
          await sleep(300);
        }
        ok('fase B: restauración completa', !!(restored && restored.ok), JSON.stringify(restored && {
          keys: restored.keys, hash: String(restored.hash).slice(0, 16), missing: restored.missing
        }));
        ok('fase B: mismas secciones (hash igual)', !!(restored && restored.hash && hashA && restored.hash === hashA),
          (restored && restored.hash || '') + ' vs ' + (hashA || ''));
        ok('fase B: extras preservados (dnr_calibration/prisma_lab_sync_v20)',
          !!(restored && restored.has_extras));
        cdp2.ws.close();
      } finally {
        try { chrome2.kill(); } catch (e) { }
        try { execFileSync('taskkill', ['/IM', 'chrome.exe', '/F'], { stdio: 'ignore' }); } catch (e) { }
      }
    } finally {
      try { chrome.kill(); } catch (e) { }
    }
  } catch (e) {
    fail++;
    console.log('FAIL excepción :: ' + e.message);
  }
  console.log('\nRESUMEN LAB-PERSIST-BROWSER: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exitCode = fail ? 1 : 0;
})();


