/**
 * VERIFICACIÓN POST-DEPLOY contra el sitio REAL (https://iptv-ape.duckdns.org).
 * Solo GETs + evaluación de APIs del propio sitio. Chrome headless + CDP.
 * Ejecutar: node frontend/tests/deploy-live-predictive-prefetch.verify.js
 * Opcional: APP_URL=... CHROME_PATH=... DEPLOY_VERIFY_PORT=...
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const URL_APP = process.env.APP_URL || 'https://iptv-ape.duckdns.org/index-v4.html';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.DEPLOY_VERIFY_PORT || 9338);
const OUT = path.join(os.tmpdir(), 'dsh-deploy-verify');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  \u2705 ' + m); } else { fail++; console.error('  \u274c ' + m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const profile = fs.mkdtempSync(path.join(OUT, 'profile-'));
    const chrome = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--mute-audio', '--window-size=1400,1000',
        '--ignore-certificate-errors',
        '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, URL_APP
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 100; i++) {
        try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/list'); if (r.ok) { targets = await r.json(); if (targets.length) break; } } catch (e) {}
        await sleep(300);
    }
    if (!targets || !targets.length) { console.error('❌ CDP no respondió'); chrome.kill(); process.exit(2); }
    const page = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const send = (method, params) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
    const evalJs = async (expr, awaitPromise) => {
        const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: !!awaitPromise, returnByValue: true });
        if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
        return r.result && r.result.result ? r.result.result.value : undefined;
    };

    await send('Runtime.enable'); await send('Page.enable');
    // espera activa a que la app termine de bootear (hasta 45 s)
    let boot = null;
    for (let i = 0; i < 90; i++) {
        boot = await evalJs(`(function(){ try { return {
            pct: (document.body.innerText.match(/(\\d+)%/) || [null,null])[1],
            hasGestor: document.body.innerText.indexOf('Gestor de Perfiles') !== -1,
            container: !!document.getElementById('profile-manager-container'),
            pmReady: !!(window.ProfileManagerV9 && window.ProfileManagerV9.config),
            ready: document.body.innerText.indexOf('Sistema listo') !== -1
        }; } catch(e){ return {err:String(e)}; } })()`);
        if (boot && (boot.hasGestor || boot.ready || (boot.pmReady && boot.container))) break;
        await sleep(500);
    }
    console.log('boot state:', JSON.stringify(boot));
    let ready = !!(boot && boot.ready);
    for (let i = 0; i < 60 && !ready; i++) {
        ready = await evalJs("document.body.innerText.indexOf('Sistema listo') !== -1");
        if (!ready) await sleep(500);
    }
    console.log('app ready marker:', ready);
    // los modulos AI se cargan en orden del HTML; esperar a que existan
    let mods = false;
    for (let i = 0; i < 60 && !mods; i++) {
        mods = await evalJs('!!(window.APE_PREDICT && window.APE_BW && window.ProfileManagerV9 && window.APE_PROFILES_CONFIG)');
        if (!mods) await sleep(500);
    }
    console.log('modulos AI cargados:', mods);

    const info = await evalJs(`(async () => {
      const out = { url: location.href, title: document.title };
      out.hasPredict = !!window.APE_PREDICT;
      out.hasBW = !!window.APE_BW;
      out.hasPM = !!window.ProfileManagerV9;
      out.hasConfig = !!window.APE_PROFILES_CONFIG;
      out.scripts = Array.from(document.scripts).map(s => s.src).filter(Boolean).length;
      let n = 0;
      try {
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const r = await fetch('/js/ape-v9/streaming/bw-estimator-v9.js?probe=' + i, { cache: 'no-store' });
          const b = await r.arrayBuffer();
          const ms = performance.now() - t0;
          if (b.byteLength > 0 && window.APE_BW && window.APE_PREDICT) { APE_BW.sample(b.byteLength, ms, 'js'); APE_PREDICT.observe(); n++; }
        }
      } catch (e) { out.measErr = String(e); }
      out.measured = n;
      out.snapshot = window.APE_PREDICT ? APE_PREDICT.snapshot() : null;
      try {
        const p = window.APE_PROFILES_CONFIG.getProfile('P3');
        const html = window.ProfileManagerV9._renderPrefetchSection(p);
        out.sectionHasButton = html.includes('Medir ahora');
        out.sectionHasAI = html.includes('Predicción AI');
      } catch (e) { out.sectionErr = String(e); }
      return out;
    })()`, true);

    console.log(JSON.stringify(info, null, 2));
    console.log('\n=== POST-DEPLOY ASSERTS ===');
    ok(info && info.title && info.title.length > 0, 'la página carga con título');
    ok(ready === true, 'la app alcanza Sistema listo (arranque completo)');
    ok(info && info.hasPredict, 'window.APE_PREDICT presente en producción');
    ok(info && info.hasBW, 'window.APE_BW presente en producción');
    ok(info && info.hasPM, 'ProfileManagerV9 cargado en producción');
    ok(info && info.hasConfig, 'APE_PROFILES_CONFIG cargado en producción');
    ok(info && info.measured >= 3, 'mediciones reales same-origin en el dominio: ' + (info && info.measured));
    ok(info && info.snapshot && info.snapshot.evidence.source === 'resource-timing', 'evidencia resource-timing en producción');
    ok(info && info.sectionHasButton && info.sectionHasAI, 'sección Prefetch con toggle IA + botón Medir ahora');

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot.result && shot.result.data) {
        const p = path.join(OUT, 'deploy-verificado.png');
        fs.writeFileSync(p, Buffer.from(shot.result.data, 'base64'));
        console.log('\nScreenshot: ' + p);
    }
    ws.close(); try { chrome.kill(); } catch (e) {}
    console.log('\n═══ POST-DEPLOY: ' + pass + ' PASS / ' + fail + ' FAIL ═══');
    process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e); process.exit(2); });




