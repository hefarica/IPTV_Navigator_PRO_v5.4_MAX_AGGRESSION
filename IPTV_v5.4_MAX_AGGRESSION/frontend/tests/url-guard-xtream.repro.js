#!/usr/bin/env node
/**
 * REPRO + REGRESIÓN — URL-GUARD sobre canales Xtream reales.
 *
 * Por qué existe: la app carga canales de un servidor Xtream (`get_live_streams`).
 * Ese payload NO trae URL: el campo `direct_source` viene vacío en el 100% de los
 * canales medidos y no existe ninguna clave `url`. La URI de reproducción se
 * construye en `buildChannelUrl()` con base+user+pass+stream_id.
 *
 * El pipeline real (`generateAndDownloadStreaming`) mete los canales por
 * `GENERATION_VALIDATOR_V9.validateAndTranslate()` ANTES de que corra el
 * preflight `[URL-GUARD]` de `generateM3U8Stream()`. Si el traductor no conserva
 * el contrato de URL, el preflight ve 10.573 canales "sin URI" y aborta la
 * generación completa.
 *
 * Esta prueba carga el validador REAL y el generador REAL en Chrome headless,
 * alimenta el payload REAL del proveedor y exige que TODOS los canales resuelvan
 * una URI absoluta reproducible, en todos los estados de credenciales posibles.
 *
 * Fixture: `fixtures/xtream-live-streams-sample.json` (120 canales reales).
 * Para correr los 10.573+ del catálogo completo:
 *   APE_URL_GUARD_FULL_FIXTURE=<ruta al json completo> node frontend/tests/url-guard-xtream.repro.js
 *
 * Sale 2 (SKIP) si no hay Chrome, igual que el resto de las pruebas de navegador.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = Number(process.env.CDP_PORT || 9444);
const ROOT = path.join(__dirname, '..');
const VALIDATOR = path.join(ROOT, 'js', 'ape-v9', 'generation-validator-v9.js');
const GENERATOR = path.join(ROOT, 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const SAMPLE = path.join(__dirname, 'fixtures', 'xtream-live-streams-sample.json');
const FULL = process.env.APE_URL_GUARD_FULL_FIXTURE || '';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const fallos = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; fallos.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

const HARNESS = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ape-url-guard</title></head>
<body><div id="hud"></div>
<script>
window.APE_PROFILES_CONFIG = {
  activeProfileId:'P3', labExportedAt:'fixture',
  profiles:{ P0:{quality:'ULTRA',settings:{bitrate:200}}, P1:{quality:'4K',settings:{bitrate:40}},
             P2:{quality:'FHD',settings:{bitrate:25}},  P3:{quality:'FHD',settings:{bitrate:15}},
             P4:{quality:'HD',settings:{bitrate:10}},   P5:{quality:'SD',settings:{bitrate:2}} },
  save:function(){}
};
try { localStorage.clear(); } catch(e) {}
// Réplica fiel de app.normalizeChannel() para el payload Xtream medido
// (app.js L7107-7212): el origen NO trae clave url ni direct_source util,
// así que url y base.url quedan vacíos y la URI debe reconstruirse.
window.__normApp = function (c, idx) {
  var url = '';
  return {
    serverId: 'srv-A', serverName: 'Tivi',
    id: String(c.stream_id), stream_id: c.stream_id, _idx: idx,
    base: { name: c.name, group: String(c.category_id), logo: c.stream_icon, url: url,
            country:'', language:'', codec:'', bitrate:0, resolution:'',
            width:null, height:null, fps:null, type:'live',
            tvg_id: c.epg_channel_id || '', tvg_name:'', is_adult:false, raw: c },
    heuristics:{}, tech:{}, meta:{ enriched:false, probed:false },
    name: c.name, group: String(c.category_id), logo: c.stream_icon, url: url,
    codec:'', bitrate:0, resolution:'', language:'', type:'live',
    enabled:0, tvarchive:0, added:null, frames:0, rating:0,
    tvgId: c.epg_channel_id || null, tvgName: null, country:null, provider:null,
    epgUrl:null, status:'unknown', bitrateTierCode:'SD_480', qualityTags:[],
    isLive:true, displayName: c.name, description:'',
    raw: Object.assign({ plot:'', directsource:'', num: c.num }, c)
  };
};
window.__mkServers = function (S) {
  var srv = { id:'srv-A', name:'Tivi', baseUrl:'http://line.tivi-ott.net',
              username:'3JHFTC', password:'U56BDP', active:true };
  var servers = [];
  if (S.active) servers.push(Object.assign({}, srv, S.mismatch ? { id:'srv-OTRO' } : {}));
  var currentServer = S.current ? Object.assign({}, srv, S.mismatch ? { id:'srv-OTRO' } : {}) : null;
  window.app = { state: { activeServers: servers, currentServer: currentServer } };
  try {
    if (S.library) localStorage.setItem('iptv_server_library', JSON.stringify([srv]));
    else localStorage.removeItem('iptv_server_library');
  } catch(e) {}
  return { servers: servers, currentServer: currentServer };
};
</script>
<script src="/generation-validator-v9.js"></script>
<script src="/m3u8-typed-arrays-ultimate.js"></script>
</body></html>`;

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = req.url.split('?')[0];
      const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
      try {
        if (u === '/harness.html') return send(200, 'text/html; charset=utf-8', HARNESS);
        if (u === '/generation-validator-v9.js') return send(200, 'application/javascript; charset=utf-8', fs.readFileSync(VALIDATOR));
        if (u === '/m3u8-typed-arrays-ultimate.js') return send(200, 'application/javascript; charset=utf-8', fs.readFileSync(GENERATOR));
        if (u === '/channels.json') {
          const p = FULL && fs.existsSync(FULL) ? FULL : SAMPLE;
          return send(200, 'application/json; charset=utf-8', fs.readFileSync(p));
        }
        return send(404, 'text/plain', 'not found');
      } catch (e) { return send(500, 'text/plain', String(e && e.message)); }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  if (!fs.existsSync(CHROME)) { console.log('SKIP: Chrome no encontrado en ' + CHROME); process.exit(2); }
  if (!fs.existsSync(SAMPLE)) { console.log('SKIP: falta fixture ' + SAMPLE); process.exit(2); }

  const srv = await serve();
  const appUrl = 'http://127.0.0.1:' + srv.address().port + '/harness.html';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-urlguard-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + CDP_PORT, appUrl
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { chrome.kill(); } catch (_) { }
    try { srv.close(); } catch (_) { }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { }
  };

  let targets = null;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list'); if (r.ok) { targets = await r.json(); if (targets.length) break; } } catch (_) { }
    await sleep(250);
  }
  if (!targets || !targets.length) { console.error('Chrome/CDP no respondió en ' + CDP_PORT); cleanup(); process.exit(2); }

  const page = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const evaluar = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text || 'eval fallo');
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send('Runtime.enable');
  await send('Page.enable');

  let listo = false;
  for (let i = 0; i < 120; i++) {
    listo = await evaluar('!!(window.GENERATION_VALIDATOR_V9 && window.M3U8TypedArraysGenerator)');
    if (listo) break;
    await sleep(250);
  }
  if (!listo) { console.error('Los módulos reales no cargaron en el navegador'); cleanup(); process.exit(2); }

  console.log('\n== URL-GUARD · CANALES XTREAM REALES (Chrome headless) ==');

  // Instala el escenario y devuelve el diagnóstico del pipeline REAL.
  const correr = async (escenario) => evaluar(`(async function(){
    try {
      var raw = await (await fetch('/channels.json')).json();
      var S = ${JSON.stringify(escenario)};
      var _env = window.__mkServers(S);
      var servers = _env.servers, currentServer = _env.currentServer;
      var normalized = raw.map(window.__normApp);

      // Pipeline REAL: gate del validador + traductor de schema
      var res = window.GENERATION_VALIDATOR_V9.validateAndTranslate(normalized);
      var safe = res.valid ? res.cleanChannels : normalized;

      // Preflight REAL del generador
      var options = { _activeServers: servers, _currentServer: currentServer, profile:'P3' };
      var creds = window.APE_URL_RESOLVE.creds(options);
      var malos = [], ejemplos = [], primeraUrl = '';
      for (var i = 0; i < safe.length; i++) {
        var c = safe[i];
        var u = '';
        try { u = window.APE_URL_RESOLVE.build(c, null, 'P3', i, creds) || ''; } catch (e) { u = ''; }
        if (!u && !primeraUrl) primeraUrl = '';
        if (u && !primeraUrl) primeraUrl = u;
        if (!window.APE_URL_RESOLVE.isPlayable(u)) {
          malos.push(i);
          if (ejemplos.length < 3) {
            ejemplos.push({
              idx: i, nombre: c.name, build: String(u).slice(0, 120),
              keys: Object.keys(c).join(','),
              tieneBase: !!c.base, baseUrl: c.base && c.base.url,
              url: c.url, stream_id: c.stream_id, serverId: c.serverId
            });
          }
        }
      }
      // ¿el contrato del traductor conserva el material de URL?
      var t0 = safe[0] || {};
      // Ejercita el GENERADOR REAL (misma función que el botón Generar).
      // No se exige que complete: se exige que el preflight URL-GUARD no aborte.
      var genOk = false, genError = '';
      try {
        window.APE_GEN(safe.slice(0, 5), { _activeServers: servers, _currentServer: currentServer, profile: 'P3' });
        genOk = true;
      } catch (e) { genError = String(e && e.message || e); }
      return {
        total: safe.length, malos: malos.length,
        genOk: genOk, genError: genError,
        guardAborta: /URL-GUARD/.test(genError),
        primeraUrl: primeraUrl,
        translatedValid: !!res.valid,
        stats: res.stats,
        translatorKeepsBase: !!t0.base,
        translatorKeys: Object.keys(t0).join(','),
        credsKeys: Object.keys(creds).join(','),
        credsCount: Object.keys(creds).length,
        ejemplos: ejemplos
      };
    } catch (e) { return { error: String(e && e.message || e) + ' | ' + String(e && e.stack || '').slice(0, 300) }; }
  })()`);

  let r = await correr({ active: true, current: true, mismatch: false });

  // 1 · El payload real no trae URL: el guard no puede depender de un campo inexistente
  {
    ok(r && !r.error, 'el pipeline real corre sobre el payload del proveedor', r && r.error);
    ok(r && r.total > 0, 'canales llegaron al preflight', 'total=' + (r && r.total));
    ok(r && r.translatedValid === true, 'el Schema Gate acepta los canales reales', 'valid=' + (r && r.translatedValid));
  }

  // 2 · ESTADO SANO: servidor activo + credenciales ⇒ 0 canales sin URI
  {
    ok(r && r.malos === 0, 'estado sano: TODOS los canales resuelven URI absoluta',
      'malos=' + (r && r.malos) + '/' + (r && r.total) + ' ' + JSON.stringify((r && r.ejemplos) || []).slice(0, 600));
    // La URI resuelta debe ser la del proveedor, forma Xtream canónica
    // /live/<usuario>/<password>/<stream_id>.<ext> — no un host suelto ni /hls/.
    ok(r && /^http:\/\/line\.tivi-ott\.net\/live\/3JHFTC\/U56BDP\/\d+\.m3u8$/.test(r.primeraUrl || ''),
      'la URI resuelta tiene la forma Xtream canónica', 'primeraUrl=' + (r && r.primeraUrl));
  }

  // 3 · El traductor NO puede tirar el contrato que el generador necesita
  {
    ok(r && r.translatorKeepsBase === true, 'el traductor conserva base hacia el generador',
      'keys=' + ((r && r.translatorKeys) || '').slice(0, 220));
  }

  // 4 · Sin currentServer (solo activeServers): debe seguir resolviendo
  {
    const s = await correr({ active: true, current: false, mismatch: false });
    ok(!s.error, 'sin currentServer: el pipeline corre', s.error);
    ok(s.malos === 0, 'sin currentServer: TODOS resuelven', 'malos=' + s.malos + '/' + s.total + ' ' + JSON.stringify(s.ejemplos || []).slice(0, 500));
  }

  // 5 · serverId desalineado (biblioteca recargada con otro id): debe recuperar por host
  {
    const s = await correr({ active: true, current: false, mismatch: true });
    ok(!s.error, 'serverId desalineado: el pipeline corre', s.error);
    ok(s.malos === 0, 'serverId desalineado: TODOS resuelven por host', 'malos=' + s.malos + '/' + s.total + ' ' + JSON.stringify(s.ejemplos || []).slice(0, 500));
  }

  // 6 · Sin servidores en memoria pero con biblioteca en localStorage: debe recuperar
  {
    const s = await correr({ active: false, current: false, mismatch: false, library: true });
    ok(!s.error, 'solo biblioteca: el pipeline corre', s.error);
    ok(s.malos === 0, 'solo biblioteca: TODOS resuelven', 'malos=' + s.malos + '/' + s.total + ' ' + JSON.stringify(s.ejemplos || []).slice(0, 500));
  }

  // 7 · Sin ninguna credencial: NO se puede inventar la URI ⇒ el guard debe abortar con diagnóstico
  {
    const s = await correr({ active: false, current: false, mismatch: false, library: false });
    ok(!s.error, 'sin credenciales: el pipeline corre', s.error);
    ok(s.malos === s.total && s.total > 0, 'sin credenciales: el guard detecta que NO hay URI',
      'malos=' + s.malos + '/' + s.total);
  }

  // 8 · El generador REAL no aborta por URL-GUARD con el catálogo del proveedor
  {
    ok(r && r.guardAborta === false, 'generateM3U8Stream NO aborta por URL-GUARD',
      'genError=' + ((r && r.genError) || '').slice(0, 300));
  }

  // 9 · Sin credenciales el aborto es correcto pero debe decir la CAUSA y el REMEDIO
  {
    const s = await correr({ active: false, current: false, mismatch: false, library: false });
    ok(s && s.guardAborta === true, 'sin credenciales: el generador aborta por URL-GUARD',
      'genError=' + ((s && s.genError) || '').slice(0, 200));
    ok(s && /CAUSA:/.test(s.genError || '') && /REMEDIO:/.test(s.genError || ''),
      'el aborto explica CAUSA y REMEDIO', (s && s.genError || '').slice(0, 260));
  }

  // 10 · EMISIÓN REAL: el generador produce un bloque por canal y cada bloque
  //      termina en la URI del proveedor (no en un host suelto ni en /hls/).
  {
    const e = await evaluar(`(async function(){
      try {
        var raw = await (await fetch('/channels.json')).json();
        var _env = window.__mkServers({ active:true, current:true, mismatch:false });
        var slot = raw.slice(0, 200).map(window.__normApp);
        var res = window.GENERATION_VALIDATOR_V9.validateAndTranslate(slot);
        var safe = res.valid ? res.cleanChannels : slot;
        var stream = window.APE_GEN(safe, { _activeServers:_env.servers, _currentServer:_env.currentServer, profile:'P3' });
        var reader = stream.getReader(), dec = new TextDecoder(), txt = '';
        while (true) { var r = await reader.read(); if (r.done) break; txt += dec.decode(r.value, { stream:true }); }
        txt += dec.decode();
        var lines = txt.split('\\n');
        var extinf = 0, urls = 0, malas = 0, ejemplo = '';
        for (var i = 0; i < lines.length; i++) {
          var l = lines[i];
          if (l.indexOf('#EXTINF:') === 0) extinf++;
          else if (/^https?:\\/\\//.test(l)) {
            urls++;
            var u = l.trim();
            if (!ejemplo) ejemplo = u;
            if (!/^http:\\/\\/line\\.tivi-ott\\.net\\/live\\/3JHFTC\\/U56BDP\\/\\d+\\.m3u8$/.test(u)) malas++;
          }
        }
        return { ok:true, pedidos: slot.length, extinf:extinf, urls:urls, malas:malas, ejemplo:ejemplo, bytes:txt.length };
      } catch (err) { return { ok:false, error:String(err && err.message || err).slice(0,300) }; }
    })()`);
    ok(e && e.ok === true, 'el generador emite sin abortar', e && e.error);
    ok(e && e.extinf === e.pedidos && e.pedidos > 0, 'un #EXTINF por canal emitido',
      'extinf=' + (e && e.extinf) + ' pedidos=' + (e && e.pedidos));
    ok(e && e.urls === e.extinf, 'una URI por canal emitido', 'urls=' + (e && e.urls) + ' extinf=' + (e && e.extinf));
    ok(e && e.malas === 0, 'TODAS las URIs son del proveedor y reproducibles',
      'malas=' + (e && e.malas) + ' ejemplo=' + (e && e.ejemplo));
  }

  console.log('\n== RESULTADO: ' + pass + ' PASS · ' + fail + ' FAIL ==');
  if (fail) { console.log('Fallos:'); fallos.forEach(f => console.log('  - ' + f)); }
  cleanup();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(1); });
