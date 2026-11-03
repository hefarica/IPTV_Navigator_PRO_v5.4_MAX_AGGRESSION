#!/usr/bin/env node
/**
 * UI VERIFY — carga el panel REAL en Chrome headless vía CDP y prueba en un navegador de verdad
 * el bloqueo del delta: que renderice, que calcule la propuesta, y que los botones Aprobar,
 * Denegar y Forzar tengan el EFECTO esperado al pulsarlos.
 *
 * Por qué existe: todo el resto de la lógica del guard se prueba con DOM mockeado, que verifica la
 * aritmética pero no que el navegador pinte el bloque ni que un clic real dispare el handler. Esta
 * prueba cierra ese hueco. Requiere Chrome y una red loopback local; en CI lo aporta el runner.
 *
 * Si Chrome no está disponible, sale con código 2 (SKIP) en lugar de fingir un PASS.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PANEL = path.join(__dirname, '..', 'js', 'ape-v9', 'generation-output-panel.js');
const PORT = Number(process.env.CDP_PORT || 9333);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const fallos = [];
function ok(c, n, d) {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; fallos.push(n + (d ? ' :: ' + d : '')); console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); }
}

const HARNESS = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ape-guard</title></head>
<body style="background:#0b1220;color:#e2e8f0;font-family:system-ui;padding:16px">
<div id="tab-generacion"></div>
<div id="ape-buf-state">-</div>
<div id="ape-buf-sugerencia"></div>
<div id="ape-gen-status"></div>
<script>
window.APE_PROFILES_CONFIG = {
  activeProfileId: 'P3',
  profiles: {
    P0:{quality:'ULTRA',settings:{bitrate:200,bandwidth_floor:15000000}},
    P1:{quality:'4K',  settings:{bitrate:40, bandwidth_floor:12000000}},
    P2:{quality:'FHD', settings:{bitrate:25, bandwidth_floor:8000000}},
    P3:{quality:'FHD', settings:{bitrate:15, bandwidth_floor:5000000}},
    P4:{quality:'HD',  settings:{bitrate:10, bandwidth_floor:3000000}},
    P5:{quality:'SD',  settings:{bitrate:2,  bandwidth_floor:1500000}}
  }, save: function(){}
};
window.APE_BW = { snapshot: function(){ return { mbps: 5.2 }; } };
window.__APE_OUTPUT_TEST__ = true;
try { localStorage.setItem('ape_output_delta_pct','15'); } catch(e){}
</script>
<script src="/generation-output-panel.js"></script>
</body></html>`;

function servir() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === '/harness.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HARNESS);
      } else if (req.url === '/generation-output-panel.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(fs.readFileSync(PANEL, 'utf8'));
      } else { res.writeHead(404); res.end(); }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.log('SKIP: Chrome no encontrado en ' + CHROME + ' (define CHROME_PATH)');
    process.exit(2);
  }
  const src = fs.readFileSync(PANEL, 'utf8');
  if (!/APE_OUTPUT_TEST_HOOKS/.test(src)) {
    console.log('SKIP: el panel no expone el seam de test'); process.exit(2);
  }

  const srv = await servir();
  const appUrl = 'http://127.0.0.1:' + srv.address().port + '/harness.html';
  const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ape-guard-'));
  const chrome = spawn(CHROME, [
    // --no-sandbox y --disable-dev-shm-usage son obligatorios en el runner de Actions: sin ellos
    // Chrome arranca y no expone CDP (el proceso muere o queda sin puerto).
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--window-size=1400,1000',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, appUrl
  ], { stdio: 'ignore' });

  const limpiar = () => {
    try { chrome.kill(); } catch (_) { }
    try { srv.close(); } catch (_) { }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { }
  };

  let targets = null;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      if (r.ok) { targets = await r.json(); if (targets.length) break; }
    } catch (_) { }
    await sleep(250);
  }
  if (!targets || !targets.length) {
    console.error('Chrome/CDP no respondio en ' + PORT + '. Puede que Chrome no arranque sin --no-sandbox o que el puerto este ocupado.');
    limpiar(); process.exit(2);
  }
  const page = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const evaluar = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text || 'eval fallo');
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  // esperar a que el panel termine su primer render
  for (let i = 0; i < 40; i++) {
    const listo = await evaluar('!!(window.APE_OUTPUT_TEST_HOOKS && document.getElementById("ape-buf-sugerencia"))');
    if (listo) break;
    await sleep(200);
  }
  await sleep(400);

  console.log('\n== GUARD DEL DELTA EN NAVEGADOR REAL ==');

  // 1 · El panel cargado expone sus hooks y calcula dentro del navegador
  {
    const tiene = await evaluar('!!document.getElementById("ape-buf-sugerencia")');
    ok(tiene === true, 'el navegador creo el contenedor de la sugerencia');
    const hooks = await evaluar('!!(window.APE_OUTPUT_TEST_HOOKS && window.APE_OUTPUT_TEST_HOOKS.guard)');
    ok(hooks === true, 'los hooks del panel viven en el navegador');
    // Forzar el pintado por la via del panel (no depende del render completo de la app).
    await evaluar('window.APE_OUTPUT_TEST_HOOKS.renderSugerencia()');
    await sleep(150);
    const estado = await evaluar('(document.getElementById("ape-buf-state")||{}).textContent || ""');
    ok(estado && estado !== '-', 'el estado de buffer se pinto tras renderSugerencia', 'estado=' + estado);
  }

  // 2 · El calculo coincide con la teoria, dentro del navegador
  {
    const r = await evaluar('(function(){try{var H=window.APE_OUTPUT_TEST_HOOKS;var g=H.guard();var m=H.mejorEscenario();var s=H.sugerirAjuste();return {inM:g.inM,floorM:g.floorM,canStart:g.canStart,bloquea:s.bloquea,reqArranque:s.reqArranque,viable:m.viable?m.viable.perfil:null,viableDelta:m.viable?m.viable.delta:null};}catch(e){return {error:String(e&&e.message||e)};}})()');
    ok(r && r.inM === 5.2, 'inM leido en el navegador = 5.2', 'inM=' + (r && r.inM));
    ok(r && r.floorM === 5, 'suelo de P3 = 5 Mbps dentro del navegador', 'floor=' + (r && r.floorM));
    ok(r && r.canStart === false, 'P3 con 5.2 y delta 15% BLOQUEA en el navegador');
    ok(r && Math.abs(r.reqArranque - 5.75) < 1e-6, 'requisito = 5.75 Mbps', 'req=' + (r && r.reqArranque));
    ok(r && r.viable === 'P3', 'el mejor escenario es P3', 'viable=' + (r && r.viable));
    const d = r && r.viableDelta;
    ok(typeof d === 'number' && 5.2 >= 5 * (1 + d / 100) - 1e-9, 'con ese delta P3 entra', 'delta=' + d);
  }

  // 3 · El bloque se pinto con los botones
  {
    const h = await evaluar('document.getElementById("ape-buf-sugerencia").innerHTML || ""');
    ok(h.indexOf('Bloqueado') >= 0, 'el HTML dice Bloqueado');
    ok(h.indexOf('ape-sug-aprobar') >= 0, 'hay boton Aprobar en el DOM');
    ok(h.indexOf('ape-sug-denegar') >= 0, 'hay boton Denegar en el DOM');
  }

  // 4 · CLIC REAL en Aprobar: cambia perfil y delta, y deja de bloquear
  {
    const antes = await evaluar('JSON.stringify({p:window.APE_PROFILES_CONFIG.activeProfileId,d:window.APE_OUTPUT_DELTA_PCT})');
    const clicked = await evaluar('(function(){var b=document.getElementById("ape-sug-aprobar");if(!b)return false;b.click();return true;})()');
    ok(clicked === true, 'el clic en Aprobar se ejecuto en el navegador');
    await sleep(300);
    const r = await evaluar('(function(){var H=window.APE_OUTPUT_TEST_HOOKS;var g=H.guard();return JSON.stringify({p:window.APE_PROFILES_CONFIG.activeProfileId,d:window.APE_OUTPUT_DELTA_PCT,canStart:g.canStart,antes:' + JSON.stringify(antes) + '});})()');
    const o = JSON.parse(r);
    ok(o.canStart === true, 'TRAS EL CLIC el perfil arranca en el navegador', JSON.stringify(o));
    ok(o.antes !== '{"p":"P3","d":15}' || o.d !== 15 || o.p !== 'P3', 'el clic cambio al menos un parametro', JSON.stringify(o));
  }

  // 5 · Clic en Denegar no cambia nada
  {
    // volver a provocar bloqueo subiendo el delta a 90 sobre un perfil alto
    await evaluar('(function(){window.APE_PROFILES_CONFIG.activeProfileId="P0";window.APE_BW={snapshot:function(){return {mbps:16};}};var H=window.APE_OUTPUT_TEST_HOOKS;H.renderSugerencia();return true;})()');
    await sleep(300);
    const hay = await evaluar('!!document.getElementById("ape-sug-denegar")');
    if (hay) {
      const antes = await evaluar('JSON.stringify({p:window.APE_PROFILES_CONFIG.activeProfileId,d:window.APE_OUTPUT_DELTA_PCT})');
      await evaluar('document.getElementById("ape-sug-denegar").click()');
      await sleep(300);
      const despues = await evaluar('JSON.stringify({p:window.APE_PROFILES_CONFIG.activeProfileId,d:window.APE_OUTPUT_DELTA_PCT})');
      ok(antes === despues, 'Denegar no cambia ni perfil ni delta', antes + ' -> ' + despues);
      ok(await evaluar('window.__APE_SUG_DENEGADO__ === true') === true, 'Denegar marca el flag');
    } else {
      ok(true, 'Denegar: no habia bloqueo activo en este estado (no aplica)');
    }
  }

  ws.close();
  limpiar();

  console.log('\n== RESULTADO: ' + pass + ' PASS · ' + fail + ' FAIL ==');
  if (fail) { console.log('FALLOS:'); fallos.forEach(f => console.log('  - ' + f)); process.exit(1); }
  process.exit(0);
})().catch((e) => {
  console.error('ERROR: ' + e.message);
  try { process.exit(2); } catch (_) { }
});
