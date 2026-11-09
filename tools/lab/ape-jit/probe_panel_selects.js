#!/usr/bin/env node
/* Sondea el DOM del panel JIT: todos los SELECT con sus opciones, y busca
 * cualquier lista de perfiles del Gestor que pueda haberse quedado corta. */
const PORT = process.argv[2] || '9225';
const CDP = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function evalJs(ws, expr) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMsg = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.id !== id) return;
      ws.removeEventListener('message', onMsg);
      if (m.error) return reject(new Error(JSON.stringify(m.error)));
      if (m.result && m.result.exceptionDetails) return reject(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 300)));
      const r = m.result && m.result.result;
      resolve(r ? (r.value !== undefined ? r.value : r.description) : null);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true, allowUnsafeEvalBlockedByCSP: true } }));
    setTimeout(() => { ws.removeEventListener('message', onMsg); reject(new Error('timeout')); }, 60000);
  });
}

(async () => {
  const list = await fetch(CDP + '/json/list').then(r => r.json());
  const page = list.find(t => t.type === 'page' && /iptv-ape\.duckdns\.org/.test(t.url || ''));
  if (!page) { console.log('  sin pestana'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); setTimeout(() => rej(new Error('ws')), 15000); });
  let mid = 1;
  const send = (m, p) => ws.send(JSON.stringify({ id: mid++, method: m, params: p || {} }));
  send('Runtime.enable'); send('Page.enable');
  await sleep(300);
  send('Page.reload', { ignoreCache: true });
  await sleep(16000);

  const probe = `(async () => {
    const sels = Array.from(document.querySelectorAll('select')).map(s => ({
      id: s.id || '(sin id)', n: s.options.length,
      opts: Array.from(s.options).slice(0, 14).map(o => o.value || o.text)
    }));
    const root = document.getElementById('ape-image-panel');
    const txt = root ? root.innerText : '';
    return JSON.stringify({
      selects: sels,
      secciones: (txt.match(/^[^\\n]{0,70}$/gm) || []).filter(s => /Mil|Motor LLM|Alinear|Iterar|Perfil|Gestor/.test(s)).slice(0, 22),
      tieneAlinear: txt.indexOf('Alinear') >= 0,
      tieneLoop: txt.indexOf('Iterar') >= 0,
      tieneLLM: txt.indexOf('Motor LLM') >= 0
    });
  })()`;
  const d = JSON.parse(await evalJs(ws, probe));
  console.log('  === SELECTS DEL PANEL ===');
  d.selects.forEach(s => console.log('   #' + String(s.id).padEnd(22) + ' n=' + String(s.n).padEnd(3) + ' ' + JSON.stringify(s.opts)));
  console.log('');
  console.log('  === SECCIONES ===');
  console.log('   tiene "Alinear": ' + d.tieneAlinear + ' | "Iterar": ' + d.tieneLoop + ' | "Motor LLM": ' + d.tieneLLM);
  d.secciones.forEach(s => console.log('   · ' + s.trim().slice(0, 74)));
  ws.close(); process.exit(0);
})().catch(e => { console.log('  FATAL: ' + e.message); process.exit(1); });
