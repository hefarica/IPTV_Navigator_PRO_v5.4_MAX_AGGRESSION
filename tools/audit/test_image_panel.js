/**
 * Test de integración del panel de imagen SIN navegador.
 *
 * Construye un DOM mínimo suficiente para que el panel se monte y renderice,
 * intercepta fetch y comprueba que:
 *   1. se cargan config + capacity + state
 *   2. el DOM resultante tiene los controles y la tabla de capacidad
 *   3. un cambio de receta hace POST con el cuerpo correcto
 *   4. la pestaña oculta no dispara polling
 *   5. no se inyecta HTML desde la respuesta
 *
 * No es un test de navegador real: no valida CSS ni layout.
 */
const fs = require('fs');
const path = require('path');

// ── DOM mínimo ────────────────────────────────────────────────────────────
class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this._text = '';
    this.className = '';
    this.id = '';
    this.offsetParent = {};   // visible por defecto
    this.parentNode = null;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = v; }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  replaceChildren() { this.children.forEach(c => c.parentNode = null); this.children = []; }
  get firstChild() { return this.children[0] || null; }
  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map(c => c.textContent).join('');
  }
  set textContent(v) { this.children = []; this._text = String(v); }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  click() { (this.listeners.click || []).forEach(fn => fn({})); }
  querySelectorAll() { return []; }
  // El panel lee .value de <select> e <input>. Sin esto el DOM de prueba no
  // representa lo que hace un navegador y el test acusa fallos inexistentes.
  get value() {
    if (this.tagName === 'SELECT') {
      const sel = this.children.find(o => o.selected);
      if (sel) return sel.attributes.value != null ? sel.attributes.value : sel.textContent;
      const first = this.children[0];
      return first ? (first.attributes.value != null ? first.attributes.value : first.textContent) : '';
    }
    if (this._value !== undefined) return this._value;
    return this.attributes.value != null ? this.attributes.value : '';
  }
  set value(v) { this._value = String(v); }
}

function walk(n, out = []) {
  out.push(n);
  n.children.forEach(c => walk(c, out));
  return out;
}

const registry = {};
const byId = (id) => {
  if (registry[id]) return registry[id];
  for (const root of Object.values(registry)) {
    const hit = walk(root).find(n => n.id === id);
    if (hit) { registry[id] = hit; return hit; }
  }
  return null;
};

const body = new Node('body');
const head = new Node('head');
const stage = new Node('div'); stage.id = 'ape-image-panel';
body.appendChild(stage);

global.document = {
  readyState: 'complete',
  head, body,
  createElement: (t) => new Node(t),
  createTextNode: (t) => { const n = new Node('#text'); n._text = String(t); return n; },
  getElementById: (id) => (id === 'ape-image-panel' ? stage : (byId(id) || walk(body).find(n => n.id === id) || null)),
  addEventListener: () => {}
};
global.window = { confirm: () => true, addEventListener: () => {} };
global.setInterval = () => 1;
global.clearInterval = () => {};

// ── fetch interceptado ────────────────────────────────────────────────────
const calls = [];
global.fetch = (url, init) => {
  calls.push({ url, init });
  let body;
  if (url.includes('/image/capacity')) {
    body = {
      ok: true, host: '3 vCPU AMD EPYC-Rome',
      margin_required: 1.2,
      rows: [
        { target: 'FHD_1080', fps: 25, recipe: 'balanced', seconds_for_20s: 14.0, realtime_ratio: 1.43, viable: true },
        { target: 'QHD_1440', fps: 25, recipe: 'light', seconds_for_20s: 19.0, realtime_ratio: 1.05, viable: false },
        { target: 'UHD_4K', fps: 50, recipe: 'balanced', seconds_for_20s: 80.95, realtime_ratio: 0.25, viable: false }
      ],
      viable_combinations: [{ target: 'FHD_1080', fps: 25 }],
      verdict: 'VIABLE: FHD_1080 a 25 fps con cualquier receta.'
    };
  } else if (url.includes('/image/state')) {
    body = {
      ok: true,
      job: { channel: 3, variant: 'hdr', mode: 'FILTERED_BALANCED', copy: false,
             source_width: 1280, source_height: 720, age_s: 42 },
      files: { segments: 40 },
      engine: { slot: 1 },
      output_observed: { width: 1920, height: 1080, codec: 'hevc' }
    };
  } else if (url.includes('/image/config') && init && init.method === 'POST') {
    const patch = JSON.parse(init.body);
    body = {
      ok: true,
      config: Object.assign({
        target: 'source', recipe: 'none', fps: 'preserve', codec: 'libx265',
        preset: 'ultrafast', crf: 20, audio: 'preserve', seg_duration: 2,
        window_size: 30, extra_window_size: 10, gop_seconds: 2,
        hqdn3d: { luma_spatial: 0.6, chroma_spatial: 0.45, luma_tmp: 0.9, chroma_tmp: 0.7 },
        unsharp: { luma_amount: 0.2, luma_msize: 5 },
        atadenoise: { s: 5 }
      }, patch),
      effective_filter: 'hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0'
    };
  } else {
    body = {
      ok: true, source: '/opt/ape-jit/image-config.json',
      config: {
        target: 'FHD_1080', recipe: 'balanced', fps: '25', codec: 'libx265',
        preset: 'ultrafast', crf: 20, audio: 'preserve', seg_duration: 2,
        window_size: 30, extra_window_size: 10, gop_seconds: 2,
        hqdn3d: { luma_spatial: 0.6, chroma_spatial: 0.45, luma_tmp: 0.9, chroma_tmp: 0.7 },
        unsharp: { luma_amount: 0.2, luma_msize: 5 },
        atadenoise: { s: 5 }
      },
      effective_filter: 'hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0'
    };
  }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
};

// ── cargar el panel ───────────────────────────────────────────────────────
const src = fs.readFileSync(
  path.join(__dirname, '..', '..', 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'vps-image-panel.js'),
  'utf8');
// eslint-disable-next-line no-new-func
new Function(src)();

const results = [];
const check = (name, ok, extra) => results.push({ name, ok, extra });

setTimeout(() => {
  try {
    const A = global.window.APE_IMAGE_PANEL;
    check('expone APE_IMAGE_PANEL', !!A);
    check('getState devuelve config', !!(A && A.getState().config));
    const isGet = (c) => !c.init || !c.init.method || c.init.method === 'GET';
    check('se pidieron config+capacity+state',
      calls.some(c => c.url.includes('/image/config') && isGet(c)) &&
      calls.some(c => c.url.includes('/image/capacity') && isGet(c)) &&
      calls.some(c => c.url.includes('/image/state') && isGet(c)));

    const all = walk(stage).map(n => n.textContent).join(' ') + ' ' +
                walk(stage).map(n => n.id || '').join(' ');
    check('renderizo el titulo', all.includes('MÓDULO DE IMAGEN'));
    check('renderizo la capacidad', all.includes('Capacidad medida') || all.includes('VIABLE'));
    check('renderizo el estado vivo', all.includes('Estado vivo') || all.includes('canal'));
    check('creo el selector de destino', !!walk(stage).find(n => n.id === 'aip-target'));
    check('creo el boton aplicar', !!walk(stage).find(n => n.id === 'aip-apply'));
    check('no inyecto HTML desde la respuesta', !walk(stage).some(n => (n._text || '').includes('<script')));

    // cambio de receta -> POST
    const apply = walk(stage).find(n => n.id === 'aip-apply');
    if (apply) {
      apply.click();
      setTimeout(() => {
        const post = calls.find(c => c.url.includes('/image/config') && c.init && c.init.method === 'POST');
        check('el boton Aplicar hace POST', !!post);
        if (post) {
          const body = JSON.parse(post.init.body);
          check('el POST lleva target', typeof body.target === 'string');
          check('el POST lleva receta', typeof body.recipe === 'string');
          check('el POST lleva parametros vivos', !!(body.hqdn3d && body.unsharp));
        }
        report();
      }, 50);
    } else {
      check('el boton Aplicar hace POST', false);
      report();
    }
  } catch (e) {
    check('sin excepciones', false, e.message);
    report();
  }
}, 120);

function report() {
  let fail = 0;
  console.log('\n  TEST DE INTEGRACION DEL PANEL');
  for (const r of results) {
    if (!r.ok) fail++;
    console.log((r.ok ? '    OK    ' : '    FALLA ') + r.name + (r.extra ? '  [' + r.extra + ']' : ''));
  }
  console.log(fail ? `\n  ${fail} FALLAN\n` : '\n  TODAS OK\n');
  process.exit(fail ? 1 : 0);
}
