/**
 * UI VERIFY — carga el panel REAL en Chrome headless vía CDP.
 * Ejecutar: node frontend/tests/ui-predictive-prefetch.verify.js
 * Requiere Chrome (o CHROME_PATH) y red loopback local.
 * - Sirve el frontend real + /probe.bin (bytes reales) desde loopback.
 * - La página mide de verdad (fetch) → APE_BW → APE_PREDICT.
 * - Renderiza ProfileManagerV9 y extrae el HTML de la sección Prefetch.
 * - Captura screenshot.
 * Uso: node ui-verify.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const FRONTEND = path.resolve(__dirname, '..');
const OUT_DIR = path.join(os.tmpdir(), 'dsh-ui-verify');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.PREDICT_UI_PORT || 9337);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  \u2705 ' + m); } else { fail++; console.error('  \u274c ' + m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MIME = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><title>APE UI VERIFY</title>
<style>body{background:#0b1220;color:#cbd5e1;font-family:system-ui;margin:0;padding:16px}</style></head>
<body>
<div id="probe-status">iniciando…</div>
<div id="profile-manager-container"></div>
<script src="/js/ape-v9/streaming/bw-estimator-v9.js"></script>
<script src="/js/ape-v9/streaming/predictive-prefetch-v9.js"></script>
<script src="/js/ape-v9/prefetch-presets.js"></script>
<script src="/js/ape-v9/streaming/streaming-input-resolver.js"></script>
<script src="/js/ape-v9/streaming/streaming-calculator-v3.js"></script>
<script src="/js/ape-v9/streaming/streaming-policy.js"></script>
<script src="/js/ape-v9/streaming/streaming-engine.js"></script>
<script src="/js/ape-v9/ape-profiles-config.js"></script>
<script src="/js/ape-v9/profile-manager-v9.js"></script>
<script>
window.__UI = { stage: 'loaded' };
(async function () {
  try {
    window.__UI.hasBW = !!window.APE_BW;
    window.__UI.hasPredict = !!window.APE_PREDICT;
    window.__UI.hasConfig = !!window.APE_PROFILES_CONFIG;
    let measured = 0, bytes = 0, msTotal = 0;
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      const res = await fetch('/probe.bin?i=' + i, { cache: 'no-store' });
      const buf = await res.arrayBuffer();
      const ms = performance.now() - t0;
      if (buf.byteLength > 0 && window.APE_BW && window.APE_PREDICT) {
        APE_BW.sample(buf.byteLength, ms, 'segmento');
        APE_PREDICT.observe();
        measured++; bytes += buf.byteLength; msTotal += ms;
      }
    }
    window.__UI.measured = measured;
    window.__UI.bytes = bytes;
    window.__UI.msTotal = Math.round(msTotal);
    window.__UI.snapshot = APE_PREDICT ? APE_PREDICT.snapshot() : null;
    if (window.APE_PROFILES_CONFIG && APE_PROFILES_CONFIG.updatePrefetchSetting) {
      try { APE_PROFILES_CONFIG.updatePrefetchSetting('P3', 'ai_prediction_enabled', true); } catch (e) {}
      try { APE_PROFILES_CONFIG.updatePrefetchSetting('P3', 'adaptive_enabled', true); } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 400));   // deja que ProfileManagerV9._init termine
    try {
      window.ProfileManagerV9.activeProfileId = 'P3';
      const prof = APE_PROFILES_CONFIG.getProfile('P3');
      window.__UI.sectionHtml = window.ProfileManagerV9._renderPrefetchSection(prof);
      window.ProfileManagerV9.render();
      window.__UI.renderOk = true;
    } catch (e) {
      window.__UI.renderErr = String((e && e.stack) || e);
    }
    await new Promise(r => setTimeout(r, 400));
    try { window.ProfileManagerV9.togglePrefetchDropdown(); } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
    try {
      const aiEl = document.querySelector('.pm9-ai-status');
      if (aiEl) {
        aiEl.scrollIntoView({ block: 'center' });
        window.__UI.aiVisible = aiEl.offsetParent !== null && aiEl.getBoundingClientRect().height > 10;
        window.__UI.aiText = aiEl.textContent.replace(/\\s+/g, ' ').trim();
      }
    } catch (e) { window.__UI.aiErr = String(e); }
    await new Promise(r => setTimeout(r, 300));
    const c = document.getElementById('profile-manager-container');
    window.__UI.panelLen = c ? c.innerHTML.length : -1;
    window.__UI.panelText = c ? c.textContent.replace(/\\s+/g, ' ').slice(0, 4000) : '';
    window.__UI.stage = 'done';
    const st = document.getElementById('probe-status');
    if (st) st.textContent = 'medido ' + measured + ' descargas · ' + bytes + ' bytes';
  } catch (e) {
    window.__UI.stage = 'error';
    window.__UI.error = String((e && e.stack) || e);
  }
})();
</script>
</body></html>`;

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const payload = crypto.randomBytes(1024 * 1024);

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        if (url.pathname === '/harness.html') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(HARNESS);
        }
        if (url.pathname === '/probe.bin') {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.length), 'Cache-Control': 'no-store' });
            return res.end(payload);
        }
        const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const abs = path.resolve(FRONTEND, rel);
        if (!abs.startsWith(path.resolve(FRONTEND)) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            res.writeHead(404); return res.end('nf');
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(abs).pipe(res);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const appPort = server.address().port;
    const appUrl = 'http://127.0.0.1:' + appPort + '/harness.html';

    const profile = fs.mkdtempSync(path.join(OUT_DIR, 'profile-'));
    const chrome = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--mute-audio', '--window-size=1400,1000',
        '--user-data-dir=' + profile,
        '--remote-debugging-port=' + PORT,
        appUrl
    ], { stdio: 'ignore' });

    // esperar al endpoint CDP
    let targets = null;
    for (let i = 0; i < 80; i++) {
        try {
            const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
            if (r.ok) { targets = await r.json(); if (targets.length) break; }
        } catch (e) { /* aún arrancando */ }
        await sleep(250);
    }
    if (!targets || !targets.length) { console.error('❌ Chrome/CDP no respondió'); chrome.kill(); server.close(); process.exit(2); }
    const page = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

    const send = (method, params) => new Promise((resolve) => {
        const id = ++msgId;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params: params || {} }));
    });

    const evalJs = async (expr, awaitPromise) => {
        const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: !!awaitPromise, returnByValue: true });
        if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
        return r.result && r.result.result ? r.result.result.value : undefined;
    };

    await send('Runtime.enable');
    await send('Page.enable');

    // esperar a que la página termine
    for (let i = 0; i < 120; i++) {
        const st = await evalJs('window.__UI && window.__UI.stage');
        if (st === 'done' || st === 'error') break;
        await sleep(250);
    }
    const ui = await evalJs('window.__UI');
    console.log('\n=== UI STATE ===');
    console.log(JSON.stringify({
        stage: ui && ui.stage, hasBW: ui && ui.hasBW, hasPredict: ui && ui.hasPredict,
        hasConfig: ui && ui.hasConfig, measured: ui && ui.measured, bytes: ui && ui.bytes,
        msTotal: ui && ui.msTotal, renderOk: ui && ui.renderOk, renderErr: ui && ui.renderErr,
        panelLen: ui && ui.panelLen, error: ui && ui.error
    }, null, 2));
    if (ui && ui.snapshot) {
        console.log('snapshot:', JSON.stringify({
            base: ui.snapshot.base, predicted: ui.snapshot.predicted, trend: ui.snapshot.trend,
            confidence: ui.snapshot.confidence, evidence: ui.snapshot.evidence, jitter: ui.snapshot.jitter
        }));
    }

    const section = (ui && ui.sectionHtml) || '';
    const panelText = (ui && ui.panelText) || '';

    console.log('\n=== ASSERTS ===');
    ok(ui && ui.hasBW && ui.hasPredict, 'APE_BW y APE_PREDICT cargados en el navegador');
    ok(ui && ui.hasConfig, 'APE_PROFILES_CONFIG cargado');
    ok(ui && ui.measured >= 6, 'mediciones REALES en navegador: ' + (ui && ui.measured));
    ok(ui && ui.snapshot && ui.snapshot.evidence.source === 'resource-timing', 'predictor declara evidencia resource-timing');
    ok(ui && ui.snapshot && ui.snapshot.confidence > 0, 'confianza > 0 (' + (ui && ui.snapshot && ui.snapshot.confidence) + ')');
    ok(!ui.renderErr, 'ProfileManagerV9.render() sin error' + (ui.renderErr ? ': ' + ui.renderErr : ''));
    ok(section.length > 0, 'sección Prefetch renderizada (' + section.length + ' chars)');
    ok(section.includes('Predicción AI'), 'HTML contiene el toggle "Predicción AI"');
    ok(section.includes('Medir ahora'), 'HTML contiene el botón "Medir ahora"');
    ok(section.includes('MEDIDO') && !section.includes('SIN EVIDENCIA'), 'estado MEDIDO con evidencia real');
    ok(/Riesgo\s+\d/.test(section) || /aplicado\s+\d+x\d+/.test(section), 'muestra riesgo/aplicado del predictor');
    ok(panelText.includes('Prefetch Inteligente'), 'panel completo renderizado en el DOM');
    ok(ui && ui.aiVisible === true, 'bloque Predicción AI VISIBLE tras expandir (offsetParent != null)');
    ok(!!(ui && ui.aiText && ui.aiText.includes('MEDIDO')), 'texto visible: estado MEDIDO');
    ok(!!(ui && ui.aiText && /Riesgo\s+\d/.test(ui.aiText)), 'texto visible: riesgo/aplicado del predictor');
    const hr = (ui && ui.aiText && (ui.aiText.match(/headroom\s+([0-9.]+)×/) || [])[1]) || null;
    ok(hr !== null && Number(hr) < 100, 'headroom coherente (Mbps→kbps, got ' + hr + '×)');
    if (ui && ui.aiText) console.log('  ℹ️ bloque AI visible: ' + ui.aiText);
    // El bloque NUEVO no debe contener undefined/NaN (el resto del panel puede tener
    // texto preexistente de otras secciones; se reporta sin fallar la verificación).
    const aiBlock = (section.match(/<div class="pm9-ai-status"[\s\S]*?<\/div>\s*<\/div>/) || [''])[0] || section;
    ok(!/undefined|NaN/.test(aiBlock), 'bloque Predicción AI sin undefined/NaN');
    const panelBad = (panelText.match(/undefined|NaN/g) || []).length;
    console.log('  \u2139\ufe0f panel completo: ' + panelBad + ' coincidencias undefined/NaN');
    ok(panelBad === 0, 'panel completo sin undefined/NaN (con StreamingEngine real)');

    // screenshot
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot.result && shot.result.data) {
        const p = path.join(OUT_DIR, 'ui-prediccion-ai.png');
        fs.writeFileSync(p, Buffer.from(shot.result.data, 'base64'));
        console.log('\nScreenshot: ' + p);
    }
    const dump = path.join(OUT_DIR, 'panel.html');
    fs.writeFileSync(dump, section, 'utf8');
    console.log('Sección HTML: ' + dump);

    ws.close();
    try { chrome.kill(); } catch (e) {}
    server.close();
    console.log('\n═══ UI RESULTADO: ' + pass + ' PASS / ' + fail + ' FAIL ═══');
    process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('ERR', e); process.exit(2); });





