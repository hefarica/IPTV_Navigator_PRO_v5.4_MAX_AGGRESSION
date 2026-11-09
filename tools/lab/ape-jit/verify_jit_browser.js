#!/usr/bin/env node
/* Verificacion REAL en Chromium via CDP (sin libs): abre la pagina, espera a
 * que el panel se monte y lee los selects que el operador ve.
 *
 *   node verify_jit_browser.js [puertoCDP] [url]
 */
const PORT = process.argv[2] || '9225';
const URL_ = process.argv[3] || 'https://iptv-ape.duckdns.org/index-v4.html';
const CDP = 'http://127.0.0.1:' + PORT;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function evalJs(ws, expr, awaitPromise) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMsg = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.id !== id) return;
      ws.removeEventListener('message', onMsg);
      if (m.error) return reject(new Error(JSON.stringify(m.error)));
      const r = m.result && m.result.result;
      if (m.result && m.result.exceptionDetails) {
        return reject(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 300)));
      }
      resolve(r ? (r.value !== undefined ? r.value : r.description) : null);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({
      id, method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: !!awaitPromise, returnByValue: true, allowUnsafeEvalBlockedByCSP: true }
    }));
    setTimeout(() => { ws.removeEventListener('message', onMsg); reject(new Error('eval timeout')); }, 45000);
  });
}

(async () => {
  const list = await fetch(CDP + '/json/list').then(r => r.json());
  let page = list.find(t => t.type === 'page' && /iptv-ape\.duckdns\.org/.test(t.url || ''));
  if (!page) {
    console.log('  no hay pestana del sitio; abriendo una');
    page = await fetch(CDP + '/json/new?' + encodeURIComponent(URL_)).then(r => r.json()).catch(() => null);
  }
  if (!page) { console.log('  ERROR: no pude obtener un target'); process.exit(1); }
  console.log('  target: ' + String(page.url).slice(0, 80));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
    setTimeout(() => rej(new Error('ws timeout')), 15000);
  });

  let msgId = 1;
  const send = (method, params) => ws.send(JSON.stringify({ id: msgId++, method, params: params || {} }));

  send('Runtime.enable');
  send('Page.enable');
  await sleep(400);
  // recarga para coger el panel nuevo y el catalogo nuevo
  send('Page.reload', { ignoreCache: true });
  await sleep(300);
  console.log('  recargando con ignoreCache...');
  await sleep(14000);

  const probe = `(async () => {
    const out = { url: location.href, api: {}, dom: {} };
    const J = (window.APE_JIT_BASE || 'https://iptv-ape.duckdns.org') + '/jit';
    try {
      const c = await fetch(J + '/image/catalog', { cache: 'no-store' }).then(r => r.json());
      out.api.catalogProfiles = c.profiles || [];
      out.api.catalogCount = (c.profiles || []).length;
    } catch (e) { out.api.catalogError = String(e); }
    try {
      const g = await fetch(J + '/image/gestor/profiles', { cache: 'no-store' }).then(r => r.json());
      out.api.gestorCount = g.count;
      out.api.gestorIds = (g.profiles || []).map(p => p.id);
    } catch (e) { out.api.gestorError = String(e); }

    const root = document.getElementById('ape-image-panel');
    out.dom.panelExists = !!root;
    out.dom.panelChildren = root ? root.children.length : 0;

    const selB = document.getElementById('aip-b-profile');
    const selA = document.getElementById('aip-al-profile');
    out.dom.bProfileExists = !!selB;
    out.dom.bProfileOptions = selB ? Array.from(selB.options).map(o => o.value) : null;
    out.dom.alProfileExists = !!selA;
    out.dom.alProfileOptions = selA ? Array.from(selA.options).map(o => o.value) : null;
    return JSON.stringify(out);
  })()`;

  let raw;
  try {
    raw = await evalJs(ws, probe, true);
  } catch (e) {
    console.log('  probe fallo: ' + e.message);
    ws.close();
    process.exit(1);
  }
  const d = JSON.parse(raw);
  console.log('');
  console.log('  === API ===');
  console.log('  catalog.profiles : ' + d.api.catalogCount + '  ' + JSON.stringify(d.api.catalogProfiles));
  console.log('  gestor.count     : ' + d.api.gestorCount + '  ' + JSON.stringify(d.api.gestorIds));
  console.log('');
  console.log('  === DOM ===');
  console.log('  #ape-image-panel existe    : ' + d.dom.panelExists + ' (hijos ' + d.dom.panelChildren + ')');
  console.log('  #aip-b-profile existe      : ' + d.dom.bProfileExists);
  console.log('  #aip-b-profile opciones    : ' + (d.dom.bProfileOptions ? d.dom.bProfileOptions.length : 'n/a') +
              (d.dom.bProfileOptions ? '  ' + JSON.stringify(d.dom.bProfileOptions) : ''));
  console.log('  #aip-al-profile existe     : ' + d.dom.alProfileExists);
  console.log('  #aip-al-profile opciones   : ' + (d.dom.alProfileOptions ? d.dom.alProfileOptions.length : 'n/a') +
              (d.dom.alProfileOptions ? '  ' + JSON.stringify(d.dom.alProfileOptions) : ''));

  // Si los selects existen, simular el cambio a P0.5 y ver que campos se llenan
  if (d.dom.bProfileExists) {
    const sim = `(async () => {
      const selB = document.getElementById('aip-b-profile');
      selB.value = 'P0.5';
      selB.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 4000));
      const g = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
      return JSON.stringify({
        perfil: selB.value,
        outW: g('aip-b-outW'), outH: g('aip-b-outH'), outFps: g('aip-b-outFps'),
        codec: g('aip-b-codec'), mode: g('aip-b-mode'),
        hq_ls: g('aip-hq-ls'), hq_cs: g('aip-hq-cs'),
        us_am: g('aip-us-am'), us_ms: g('aip-us-ms'),
        at_s: g('aip-at-s'), seg: g('aip-seg'), win: g('aip-win')
      });
    })()`;
    try {
      const s = JSON.parse(await evalJs(ws, sim, true));
      console.log('');
      console.log('  === SELECCIONANDO P0.5 EN EL NAVEGADOR ===');
      Object.keys(s).forEach(k => console.log('   ' + k.padEnd(10) + ' = ' + s[k]));
    } catch (e) {
      console.log('  simulacion fallo: ' + e.message);
    }
  }

  ws.close();
  process.exit(0);
})().catch(e => { console.log('  FATAL: ' + e.message); process.exit(1); });
