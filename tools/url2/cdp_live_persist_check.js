#!/usr/bin/env node
'use strict';
/**
 * cdp_live_persist_check.js — verifica en la página DESPLEGADA que
 * APE_UI_PERSIST está cargado, que hay controles y que el LAB (si está) persiste.
 * Uso: node cdp_live_persist_check.js [url]
 */
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.CDP_PORT || 9444);
const URL_PAGE = process.argv[2] || 'https://iptv-ape.duckdns.org/index-v4.html';
const PROFILE = path.join(os.tmpdir(), 'ape_live_persist_profile_' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on('error', reject);
  });
}
async function waitTargets() {
  for (let i = 0; i < 80; i++) {
    try { const list = await getJson('http://127.0.0.1:' + PORT + '/json/list'); const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); if (p) return p; } catch (e) { }
    await sleep(300);
  }
  throw new Error('sin target CDP');
}
function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws error')); });
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
  return { ws, ready, send };
}
async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const res = r.result || {};
  if (res.exceptionDetails) return { error: JSON.stringify(res.exceptionDetails).slice(0, 300) };
  return res.result ? res.result.value : undefined;
}

(async () => {
  let code = 1;
  try {
    fs.mkdirSync(PROFILE, { recursive: true });
    const chrome = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + PROFILE, 'about:blank'], { stdio: 'ignore' });
    try {
      const page = await waitTargets();
      const cdp = cdpConnect(page.webSocketDebuggerUrl);
      await cdp.ready;
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Page.navigate', { url: URL_PAGE });
      await sleep(4000);
      const hasModule = await evaluate(cdp, 'typeof window.APE_UI_PERSIST');
      const status = await evaluate(cdp, 'window.APE_UI_PERSIST ? window.APE_UI_PERSIST.status() : null');
      const controls = await evaluate(cdp, 'window.APE_UI_PERSIST ? Object.keys(window.APE_UI_PERSIST._collect(document).controls).length : -1');
      const labGate = await evaluate(cdp, '!!(window.APE_PROFILES_CONFIG && window.APE_PROFILES_CONFIG.labExportedAt)');
      // ── roundtrip REAL: marcar un control → guardar → RECARGAR → verificar ──
      const roundtrip = await evaluate(cdp, `(function(){
        var el = document.querySelector('input[type=checkbox]:not([disabled])');
        if (!el) return { ok:false, reason:'sin checkbox' };
        var key = APE_UI_PERSIST._keyOf(el);
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        var st = APE_UI_PERSIST.saveNow();
        return { ok:true, key:key, wanted: el.checked ? 1 : 0, saved_count: Object.keys(st.controls).length };
      })()`);
      await sleep(800);
      await cdp.send('Page.reload', {});
      await sleep(4500);
      const after = await evaluate(cdp, `(function(){
        var el = document.querySelector('input[type=checkbox]:not([disabled])');
        if (!el) return null;
        return { key: APE_UI_PERSIST._keyOf(el), checked: el.checked ? 1 : 0, status: APE_UI_PERSIST.status() };
      })()`);
      const restoredOk = !!(roundtrip && roundtrip.ok && after && after.checked === roundtrip.wanted);
      const out = { url: URL_PAGE, module: hasModule, controls_in_dom: controls, lab_gate_open: labGate, status: status,
                    roundtrip: roundtrip, after_reload: after, restored: restoredOk };
      console.log(JSON.stringify(out, null, 2));
      code = (hasModule === 'object' && controls > 0 && restoredOk) ? 0 : 1;
      cdp.ws.close();
    } finally {
      try { chrome.kill(); } catch (e) { }
      try { execFileSync('taskkill', ['/IM', 'chrome.exe', '/F'], { stdio: 'ignore' }); } catch (e) { }
    }
  } catch (e) {
    console.log('FAIL :: ' + e.message);
  }
  process.exitCode = code;
})();


