#!/usr/bin/env node
/**
 * VOLCADO DEL PERFIL — lee lo que el Profile Manager APE v9.0 tiene REALMENTE en
 * `localStorage['ape_profiles_v9']` y lo compara con lo que el generador consume vía
 * `getProfileConfig(profile)`.
 *
 * POR QUÉ EXISTE: la auditoría del 2026-11-04 encontró que el panel P3 muestra 8 s / 14,9 Mbps /
 * floor 5 / T1 19,4, mientras la lista servida emite 55000 ms / 8000000 bps / floor 8000000.
 * Tres conjuntos de valores en juego. Antes de tocar más código hay que saber cuál es el real.
 *
 * En un navegador limpio `localStorage` está vacío y el módulo siembra sus defaults: ese volcado
 * muestra qué valores pone el CÓDIGO. Si no coinciden con lo que el panel pinta, el fallo está
 * en el render, no en el storage.
 *
 * Requiere Chrome. Sin Chrome sale con código 2 (SKIP), nunca con un PASS fingido.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe';
const JS_DIR = path.join(__dirname, '..', 'js', 'ape-v9');
const CONFIG = path.join(JS_DIR, 'ape-profiles-config.js');
const PORT = Number(process.env.CDP_PORT || 9431);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (s) => console.log(s);

if (!fs.existsSync(CONFIG)) { console.log('SKIP: falta ape-profiles-config.js'); process.exit(2); }

// HTML mínimo: carga el módulo real del Profile Manager y nada más.
const HARNESS = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ape-profiles-dump</title></head>
<body>
<div id="out">cargando</div>
<script src="/ape-profiles-config.js"></script>
<script>
  window.__DUMP__ = null;
  try {
    var api = window.APE_PROFILES_CONFIG || null;
    if (!api) { window.__DUMP__ = { error: 'APE_PROFILES_CONFIG no definido' }; }
    else {
      var raw = null;
      try { raw = localStorage.getItem('ape_profiles_v9'); } catch (e) { raw = 'ERR:' + e.message; }
      var stored = null;
      try { stored = raw ? JSON.parse(raw) : null; } catch (e) { stored = 'PARSE_ERR'; }
      var out = { storageRaw: raw === null ? 'VACIO' : 'PRESENTE',
                  storageBytes: raw ? raw.length : 0,
                  perfiles: {}, delModulo: {}, getProfile: {} };
      var ids = ['P0','P1','P2','P3','P4','P5'];
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var s = null;
        if (stored && stored[id] && stored[id].settings) s = stored[id].settings;
        else if (stored && stored[id]) s = stored[id];
        out.perfiles[id] = s ? {
          resolution: s.resolution, bitrate: s.bitrate, bitrate_floor_mbps: s.bitrate_floor_mbps,
          buffer: s.buffer, bufferSeconds: s.bufferSeconds, t1: s.t1, t2: s.t2,
          playerBuffer: s.playerBuffer, headersCount: s.headersCount,
          clock_jitter: s.clock_jitter, clockJitter: s.clockJitter,
          clock_synchro: s.clock_synchro, fps: s.fps, codec: s.codec,
          strategy: s.strategy
        } : null;
        // lo que el generador ve: api.getProfile(id)
        try {
          var g = (api && typeof api.getProfile === 'function') ? api.getProfile(id) : null;
          out.getProfile[id] = (g && g.settings) ? {
            resolution: g.settings.resolution, bitrate: g.settings.bitrate,
            bitrate_floor_mbps: g.settings.bitrate_floor_mbps,
            buffer: g.settings.buffer, playerBuffer: g.settings.playerBuffer,
            t1: g.settings.t1, t2: g.settings.t2, headersCount: g.settings.headersCount,
            clock_jitter: g.settings.clock_jitter, clock_synchro: g.settings.clock_synchro
          } : null;
        } catch (e) { out.getProfile[id] = 'ERR:' + e.message; }
      }
      // keys que el modulo conoce internamente
      try {
        var all = (api && typeof api.getAllProfiles === 'function') ? api.getAllProfiles() : null;
        if (all) for (var k in all) {
          var st = all[k] && all[k].settings ? all[k].settings : null;
          if (st) out.delModulo[k] = { resolution: st.resolution, bitrate: st.bitrate,
            bitrate_floor_mbps: st.bitrate_floor_mbps, buffer: st.buffer,
            playerBuffer: st.playerBuffer, t1: st.t1, t2: st.t2,
            headersCount: st.headersCount, clock_jitter: st.clock_jitter, clock_synchro: st.clock_synchro };
        }
      } catch (e) { out.delModulo = 'ERR:' + e.message; }
      window.__DUMP__ = out;
    }
  } catch (e) { window.__DUMP__ = { error: String(e && e.message || e) }; }
  document.getElementById('out').textContent = 'listo';
</script>
</body></html>`;

function servir() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const url = (req.url || '/').split('?')[0];
            if (url === '/' || url === '/index.html') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(HARNESS);
            }
            const f = path.join(JS_DIR, path.basename(url));
            if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(fs.readFileSync(f));
        });
        srv.listen(PORT, '127.0.0.1', () => resolve(srv));
    });
}

async function cdp(wsUrl) {
    // WebSocket mínimo por http upgrade — Node 22+ trae WebSocket global
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pend = new Map();
    ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    };
    const send = (method, params) => new Promise((res) => {
        const mid = ++id;
        pend.set(mid, res);
        ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
    return { send, close: () => ws.close() };
}

(async () => {
    if (!fs.existsSync(CHROME)) {
        console.log('SKIP: Chrome no disponible en ' + CHROME);
        process.exit(2);
    }
    const srv = await servir();
    const userDir = path.join(require('os').tmpdir(), 'ape-dump-' + Date.now());
    // perfil temporal limpio => localStorage VACIO => el modulo siembra sus defaults
    const chrome = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
        '--remote-debugging-port=' + (PORT + 1), '--user-data-dir=' + userDir,
        'about:blank'
    ], { stdio: 'ignore' });

    let dump = null;
    try {
        let target = null;
        for (let i = 0; i < 40 && !target; i++) {
            await sleep(250);
            try {
                const r = await fetch('http://127.0.0.1:' + (PORT + 1) + '/json/list');
                const arr = await r.json();
                target = (arr || []).find(t => t.type === 'page');
            } catch (e) { /* aun arrancando */ }
        }
        if (!target) throw new Error('Chrome no expuso target CDP');
        const c = await cdp(target.webSocketDebuggerUrl);
        await c.send('Page.enable');
        await c.send('Runtime.enable');
        await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' });
        for (let i = 0; i < 40; i++) {
            await sleep(300);
            const r = await c.send('Runtime.evaluate', {
                expression: 'window.__DUMP__ ? JSON.stringify(window.__DUMP__) : null',
                returnByValue: true
            });
            const v = r && r.result && r.result.result && r.result.result.value;
            if (v && v !== 'null') { dump = JSON.parse(v); break; }
        }
        c.close();
    } catch (e) {
        console.log('ERROR: ' + e.message);
    } finally {
        try { chrome.kill(); } catch (e) { }
        try { srv.close(); } catch (e) { }
        try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { }
    }

    if (!dump) { console.log('SKIP: no se pudo leer el volcado'); process.exit(2); }

    log('══════════════════════════════════════════════════════════════════');
    log(' VOLCADO DEL PROFILE MANAGER APE v9.0');
    log('══════════════════════════════════════════════════════════════════');
    log('  localStorage["ape_profiles_v9"] : ' + dump.storageRaw +
        (dump.storageBytes ? ' (' + dump.storageBytes + ' B)' : ''));
    log('');
    if (dump.storageRaw === 'VACIO') {
        log('  El navegador estaba limpio: el modulo SIEMBRA sus defaults.');
        log('  Los valores de abajo son los DEFAULTS DEL CODIGO, no los editados por el operador.');
        log('');
    }
    const CAMPOS = ['resolution','bitrate','bitrate_floor_mbps','buffer','bufferSeconds','t1','t2',
                    'playerBuffer','headersCount','clock_jitter','clock_synchro','fps','codec','strategy'];
    for (const id of ['P0','P1','P2','P3','P4','P5']) {
        const st = dump.perfiles && dump.perfiles[id];
        const gp = dump.getProfile && dump.getProfile[id];
        log('── ' + id + ' ─────────────────────────────────────────────');
        if (!st) { log('   (sin settings en storage)'); continue; }
        for (const k of CAMPOS) {
            if (st[k] === undefined || st[k] === null) continue;
            log('   ' + k.padEnd(20) + ' = ' + String(st[k]));
        }
        log('');
    }
    log('── lo que ve el GENERADOR via getProfile() ───────────────');
    log(JSON.stringify(dump.getProfile, null, 1));
    log('');
    log('── lo que el modulo tiene en memoria (getAllProfiles) ─────');
    log(JSON.stringify(dump.delModulo, null, 1));
    log('══════════════════════════════════════════════════════════════════');
    process.exit(0);
})();
