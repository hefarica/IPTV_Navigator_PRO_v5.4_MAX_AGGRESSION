/**
 * test-light-click.mjs — prueba el CLICK REAL del checkbox y del boton "Generar LIGHT".
 *
 * POR QUE EXISTE
 *   Hasta ahora lo verificado era: el DOM pinta el checkbox, el boton nace cerrado, y los
 *   endpoints responden por separado. Lo que NUNCA se probo es el click: que al marcar el
 *   checkbox el boton se habilite, y que al pulsarlo ocurra algo observable.
 *
 * QUE HACE
 *   1. lanza Chrome headless con --remote-debugging-port
 *   2. abre la pagina (por defecto la de produccion; --url para la local)
 *   3. espera a que el panel se monte
 *   4. lee el estado del boton ANTES de marcar
 *   5. hace click en #ape-out-light
 *   6. lee el estado DESPUES
 *   7. hace click en el boton [data-ape-run="light"]
 *   8. espera y lee el span #ape-light-state (el estado que el panel reporta)
 *   9. cierra Chrome
 *
 * FAIL-HONEST: si un paso no ocurre, dice exactamente cual y por que. No inventa PASS.
 *
 * USO
 *   node test-light-click.mjs [--url URL] [--wait-ms N] [--keep-open]
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const URL_TARGET = getArg('--url', 'https://iptv-ape.duckdns.org/index-v4.html');
const WAIT_MS = Number(getArg('--wait-ms', '9000'));
const KEEP = args.includes('--keep-open');

const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9444 + Math.floor(Math.random() * 400);

const steps = [];
const rec = (name, ok, detail) => {
  steps.push({ name, ok, detail: String(detail ?? '') });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};

const profile = mkdtempSync(join(tmpdir(), 'ape-click-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--disable-extensions', '--disable-background-networking',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpTargets() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const j = await r.json();
      const page = (j || []).find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page;
    } catch { /* aun arrancando */ }
    await sleep(250);
  }
  return null;
}

function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  const open = new Promise((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', (e) => rej(new Error('ws: ' + (e.message || 'error'))));
  });
  ws.addEventListener('message', (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message || 'cdp error')) : res(m.result);
    } else if (m.method) {
      events.push(m);
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const myId = ++id;
    pending.set(myId, { res, rej });
    ws.send(JSON.stringify({ id: myId, method, params }));
    setTimeout(() => { if (pending.has(myId)) { pending.delete(myId); rej(new Error('timeout ' + method)); } }, 30000);
  });
  return { send, open, events, close: () => { try { ws.close(); } catch {} } };
}

const evaluate = async (s, expr) => {
  const r = await s.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval exception');
  }
  return r.result?.value;
};

let session = null;
let exitCode = 0;

try {
  const target = await cdpTargets();
  if (!target) {
    rec('chrome arranca', false, 'no respondio /json/list tras 10 s');
    exitCode = 2;
  } else {
    rec('chrome arranca', true, `puerto ${PORT}`);
    session = cdpSession(target.webSocketDebuggerUrl);
    await session.open;
    await session.send('Page.enable');
    await session.send('Runtime.enable');

    const errors = [];
    session.events.length = 0;

    await session.send('Page.navigate', { url: URL_TARGET });
    rec('navega', true, URL_TARGET);

    // esperar a que el panel exista de verdad
    let mounted = false;
    const t0 = Date.now();
    while (Date.now() - t0 < WAIT_MS) {
      try {
        mounted = await evaluate(session, `!!document.getElementById('ape-gen-output-panel')`);
      } catch { mounted = false; }
      if (mounted) break;
      await sleep(400);
    }
    rec('el panel se monta', mounted, mounted ? `${Date.now() - t0} ms` : `no aparecio en ${WAIT_MS} ms`);

    if (!mounted) {
      exitCode = 3;
    } else {
      // ── estado ANTES de marcar ────────────────────────────────────────────
      const before = await evaluate(session, `(() => {
        const cb = document.getElementById('ape-out-light');
        const btn = document.querySelector('[data-ape-run="light"]');
        const st = document.getElementById('ape-light-state');
        return {
          checkbox: !!cb,
          checked: cb ? cb.checked : null,
          btn: !!btn,
          disabled: btn ? btn.disabled : null,
          opacity: btn ? (btn.style.opacity || '') : '',
          cursor: btn ? (btn.style.cursor || '') : '',
          state: st ? st.textContent : null,
        };
      })()`);
      rec('checkbox existe', before.checkbox === true, before.checkbox ? 'si' : 'NO');
      rec('boton existe', before.btn === true, before.btn ? 'si' : 'NO');
      rec('boton nace CERRADO', before.disabled === true,
        `disabled=${before.disabled} opacity=${before.opacity} cursor=${before.cursor}`);
      rec('estado inicial honesto', /sin validar|seleccionada/i.test(before.state || ''),
        `"${before.state}"`);

      // ── CLICK REAL en el checkbox ─────────────────────────────────────────
      const clickedCb = await evaluate(session, `(() => {
        const cb = document.getElementById('ape-out-light');
        if (!cb) return { ok: false, why: 'sin checkbox' };
        cb.click();                                  // click REAL del DOM
        const btn = document.querySelector('[data-ape-run="light"]');
        const st = document.getElementById('ape-light-state');
        return {
          ok: true,
          checked: cb.checked,
          disabled: btn ? btn.disabled : null,
          opacity: btn ? (btn.style.opacity || '') : '',
          cursor: btn ? (btn.style.cursor || '') : '',
          state: st ? st.textContent : null,
        };
      })()`);
      rec('click en el checkbox', clickedCb.ok === true, `checked=${clickedCb.checked}`);
      rec('al marcar, el boton se HABILITA', clickedCb.disabled === false,
        `disabled=${clickedCb.disabled} opacity=${clickedCb.opacity} cursor=${clickedCb.cursor}`);
      rec('el estado cambia al marcar', /seleccionada|generando|proyectando|validando|VALIDADA|FALL/i.test(clickedCb.state || ''),
        `"${clickedCb.state}"`);

      // ── CLICK REAL en el boton ────────────────────────────────────────────
      const beforeClick = Date.now();
      const clickedBtn = await evaluate(session, `(() => {
        const btn = document.querySelector('[data-ape-run="light"]');
        if (!btn) return { ok: false, why: 'sin boton' };
        if (btn.disabled) return { ok: false, why: 'el boton sigue cerrado' };
        btn.click();
        const st = document.getElementById('ape-light-state');
        return { ok: true, stateAfter: st ? st.textContent : null };
      })()`);
      rec('click en Generar LIGHT', clickedBtn.ok === true,
        clickedBtn.ok ? `estado inmediato "${clickedBtn.stateAfter}"` : clickedBtn.why);

      // ── esperar a que el panel reaccione ──────────────────────────────────
      let settled = null;
      const t1 = Date.now();
      while (Date.now() - t1 < 20000) {
        await sleep(700);
        settled = await evaluate(session, `(() => {
          const st = document.getElementById('ape-light-state');
          const g = document.getElementById('ape-gen-status');
          return { light: st ? st.textContent : null, gen: g ? g.textContent : null };
        })()`);
        const txt = (settled && settled.light) || '';
        if (/VALIDADA|NO VALIDADA|FALLÓ|NOT_AVAILABLE|generando|proyectando|validando/i.test(txt)) {
          if (!/^(sin validar|seleccionada)/i.test(txt)) break;
        }
      }
      const elapsed = Date.now() - beforeClick;
      const lightState = (settled && settled.light) || '';
      rec('el panel REPORTA algo tras el click',
        lightState.length > 0 && !/^sin validar$/i.test(lightState),
        `${elapsed} ms · "${lightState}"`);
      if (settled && settled.gen) rec('la barra de estado del panel', true, `"${settled.gen}"`);

      // errores de consola relevantes
      const consoleErrs = session.events
        .filter((e) => e.method === 'Runtime.exceptionThrown')
        .map((e) => e.params?.exceptionDetails?.exception?.description || e.params?.exceptionDetails?.text)
        .filter(Boolean);
      rec('sin excepciones JS', consoleErrs.length === 0,
        consoleErrs.length ? consoleErrs.join(' | ').slice(0, 200) : 'ninguna');

      const fails = steps.filter((x) => !x.ok).length;
      console.log(`\nRESULTADO: ${steps.length - fails} PASS · ${fails} FAIL`);
      exitCode = fails === 0 ? 0 : 1;
    }
  }
} catch (e) {
  rec('excepcion del test', false, e.message);
  exitCode = 2;
} finally {
  if (session) session.close();
  if (!KEEP) {
    try { chrome.kill(); } catch {}
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  if (process.env.APE_CLICK_JSON) {
    try { writeFileSync(process.env.APE_CLICK_JSON, JSON.stringify({ url: URL_TARGET, steps }, null, 2)); } catch {}
  }
}
process.exit(exitCode);
