#!/usr/bin/env node
/**
 * Extrae el CARTUCHO real por perfil (P0..P5) del GENERADOR REAL y lo deja en
 * un JSON listo para plantillas. No inventa directivas: las produce el mismo
 * código que generó la lista buena.
 *
 * Salida: %TEMP%/ape_url2/blocks.json  { ok, profiles: { P0: {lines:[...]}, ... } }
 */
'use strict';
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const { spawn } = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9997;
const ROOT = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend';
const OUT = path.join(os.tmpdir(), 'ape_url2');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HARNESS = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>\n' +
  '<script>window.APE_PROFILES_CONFIG={activeProfileId:"P3",labExportedAt:"x",profiles:{' +
  'P0:{quality:"ULTRA",settings:{bitrate:200}},P1:{quality:"4K",settings:{bitrate:40}},' +
  'P2:{quality:"4K",settings:{bitrate:25}},P3:{quality:"FHD",settings:{bitrate:15}},' +
  'P4:{quality:"HD",settings:{bitrate:10}},P5:{quality:"SD",settings:{bitrate:2}}},save:function(){}};' +
  'try{localStorage.clear()}catch(e){}</script>\n' +
  '<script src="/generation-validator-v9.js"></script><script src="/m3u8-typed-arrays-ultimate.js"></script></body></html>';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    const send = (c, t, b) => { res.writeHead(c, { 'Content-Type': t }); res.end(b); };
    if (u === '/harness.html') return send(200, 'text/html', HARNESS);
    if (u === '/generation-validator-v9.js') return send(200, 'application/javascript', fs.readFileSync(path.join(ROOT, 'js/ape-v9/generation-validator-v9.js')));
    if (u === '/m3u8-typed-arrays-ultimate.js') return send(200, 'application/javascript', fs.readFileSync(path.join(ROOT, 'js/ape-v9/m3u8-typed-arrays-ultimate.js')));
    return send(404, 'text/plain', 'nf');
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-cart-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT,
    'http://127.0.0.1:' + srv.address().port + '/harness.html'], { stdio: 'ignore' });
  const cleanup = () => { try { chrome.kill(); } catch (_) { } try { srv.close(); } catch (_) { } try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { } };
  let targets = null;
  for (let i = 0; i < 120; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/list'); if (r.ok) { targets = await r.json(); if (targets.length) break; } } catch (_) { } await sleep(250); }
  if (!targets) { console.error('CDP no respondió'); cleanup(); process.exit(2); }
  const page = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 120; i++) { if (await ev('!!(window.M3U8TypedArraysGenerator && window.GENERATION_VALIDATOR_V9)')) break; await sleep(250); }

  const result = {};
  for (const p of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
    const raw = await ev(`(async function(){
      var p = ${JSON.stringify(p)};
      var srv = { id:'srv_URL2', name:'Line', baseUrl:'http://line.tivi-ott.net', username:'USER', password:'PASS', active:true };
      window.app = { state: { activeServers:[srv], currentServer:srv } };
      var ch = { name:'CANAL', stream_id:1001, serverId:'srv_URL2', serverName:'Line', type:'live', group:'GRP', logo:'', url:'' };
      var res = window.GENERATION_VALIDATOR_V9.validateAndTranslate([ch]);
      var safe = res.valid ? res.cleanChannels : [ch];
      var options = { _activeServers:[srv], _currentServer:srv, forceProfile:p, hud:false };
      var st = window.APE_GEN(safe, options);
      var rd = st.getReader(), dec = new TextDecoder(), txt = '';
      while (true) { var r = await rd.read(); if (r.done) break; txt += dec.decode(r.value, { stream:true }); }
      txt += dec.decode();
      var lines = txt.split(String.fromCharCode(10));
      var start = -1, end = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('#EXTINF:') === 0) { start = i; continue; }
        if (start >= 0 && /^https?:/.test(lines[i])) { end = i; break; }
      }
      return JSON.stringify({ ok: start >= 0 && end > start, start: start, end: end, total: lines.length,
        block: start >= 0 && end > start ? lines.slice(start, end) : [],
        url: start >= 0 && end > start ? lines[end] : '' });
    })()`);
    const o = JSON.parse(raw);
    result[p] = { ok: o.ok, lines: o.block, url: o.url, total: o.total };
    const si = (o.block || []).find(l => l.startsWith('#EXT-X-STREAM-INF:')) || '';
    console.log(`${p}: ok=${o.ok} lines=${(o.block || []).length} url=${o.url} streaminf=${si.slice(0, 150)}`);
  }
  fs.writeFileSync(path.join(OUT, 'blocks.json'), JSON.stringify(result, null, 1));
  console.log('escrito:', path.join(OUT, 'blocks.json'));
  cleanup();
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
