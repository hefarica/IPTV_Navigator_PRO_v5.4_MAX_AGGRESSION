#!/usr/bin/env node
/* Verificacion FINAL en Chromium: recarga, comprueba que la alineacion y el
 * loop existen, que la lista de perfiles del Gestor trae los 12, y que al
 * seleccionar un perfil los campos del modulo se llenan con SUS valores. */
const PORT = process.argv[2] || '9225';
const CDP = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ev(ws, expr) {
  return new Promise((res, rej) => {
    const id = Math.floor(Math.random() * 1e9);
    const h = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m.id !== id) return;
      ws.removeEventListener('message', h);
      if (m.error) return rej(new Error(JSON.stringify(m.error)));
      if (m.result && m.result.exceptionDetails) return rej(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400)));
      const r = m.result && m.result.result;
      res(r ? (r.value !== undefined ? r.value : r.description) : null);
    };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true, allowUnsafeEvalBlockedByCSP: true } }));
    setTimeout(() => { ws.removeEventListener('message', h); rej(new Error('timeout')); }, 90000);
  });
}

(async () => {
  const list = await fetch(CDP + '/json/list').then(r => r.json());
  const page = list.find(t => t.type === 'page' && /iptv-ape\.duckdns\.org/.test(t.url || ''));
  if (!page) { console.log('  sin pestana del sitio'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((a, b) => { ws.addEventListener('open', a); ws.addEventListener('error', b); setTimeout(() => b(new Error('ws')), 15000); });
  let mid = 1;
  const send = (m, p) => ws.send(JSON.stringify({ id: mid++, method: m, params: p || {} }));
  send('Runtime.enable'); send('Page.enable');
  await sleep(300);
  send('Page.reload', { ignoreCache: true });
  console.log('  recarga con ignoreCache...');
  await sleep(17000);

  const r1 = JSON.parse(await ev(ws, `(async()=>{
    const P=window.APE_IMAGE_PANEL, S=P.getState();
    const b=document.getElementById('aip-b-profile');
    const a=document.getElementById('aip-al-profile');
    const root=document.getElementById('ape-image-panel');
    return JSON.stringify({
      gestorCount: S.gestor?S.gestor.count:null,
      gestorIds: (S.gestor&&S.gestor.profiles)?S.gestor.profiles.map(p=>p.id):null,
      sinDisp: root?root.innerText.indexOf('gestor de perfiles no disponible')>=0:null,
      bExists: !!b, bN: b?b.options.length:null,
      aExists: !!a, aN: a?a.options.length:null,
      aLabels: a?Array.from(a.options).map(o=>o.text).slice(0,12):null,
      loop: !!document.getElementById('aip-loop'),
      alignAll: !!document.getElementById('aip-align-all'),
      alignLlm: !!document.getElementById('aip-align-llm'),
      loopScope: !!document.getElementById('aip-loop-scope'),
      lastError: S.lastError||null
    });
  })()`));

  console.log('');
  console.log('  === LISTA DE PERFILES ===');
  console.log('   S.gestor.count      : ' + r1.gestorCount + '  ' + JSON.stringify(r1.gestorIds));
  console.log('   "no disponible"     : ' + r1.sinDisp + '   lastError: ' + r1.lastError);
  console.log('');
  console.log('  === SELECTS ===');
  console.log('   #aip-b-profile      : ' + (r1.bExists ? r1.bN + ' opciones' : 'NO EXISTE'));
  console.log('   #aip-al-profile     : ' + (r1.aExists ? r1.aN + ' opciones' : 'NO EXISTE'));
  if (r1.aLabels) r1.aLabels.forEach(l => console.log('      · ' + l));
  console.log('');
  console.log('  === BOTONES ===');
  console.log('   alinear             : ' + r1.alignAll + ' | con LLM: ' + r1.alignLlm);
  console.log('   iterar (aip-loop)   : ' + r1.loop + ' | selector de alcance: ' + r1.loopScope);

  // ahora probar la carga de un perfil REAL distinto en los dos extremos
  for (const pid of ['P0', 'P3', 'P5']) {
    const r2 = JSON.parse(await ev(ws, `(async()=>{
      const sel=document.getElementById('aip-b-profile');
      sel.value='${pid}'; sel.dispatchEvent(new Event('change'));
      await new Promise(r=>setTimeout(r,3500));
      const g=id=>{const e=document.getElementById(id);return e?e.value:null;};
      const S=window.APE_IMAGE_PANEL.getState();
      return JSON.stringify({
        p:'${pid}', outW:g('aip-b-outW'), outH:g('aip-b-outH'), fps:g('aip-b-outFps'),
        codec:g('aip-b-codec'), mode:g('aip-b-mode'),
        hq:g('aip-hq-ls'), us:g('aip-us-am'), usms:g('aip-us-ms'), at:g('aip-at-s'),
        seg:g('aip-seg'), from:S.build.loadedFrom, bitrate:S.build.loadedBitrate, hdr:S.build.loadedHdr
      });
    })()`));
    console.log('');
    console.log('  === ' + pid + ' CARGADO EN EL MODULO ===');
    console.log('   ' + r2.outW + 'x' + r2.outH + ' @ ' + r2.fps + 'fps · codec ' + r2.codec +
                ' · ' + r2.bitrate + ' Mbps · HDR ' + r2.hdr + ' · fuente ' + r2.from);
    console.log('   hqdn3d.ls ' + r2.hq + ' · unsharp ' + r2.us + '/msize ' + r2.usms +
                ' · atadenoise.s ' + r2.at + ' · seg ' + r2.seg);
  }
  ws.close(); process.exit(0);
})().catch(e => { console.log('  FATAL: ' + e.message); process.exit(1); });
