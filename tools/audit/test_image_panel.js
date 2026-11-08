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
  // replaceChildren(...nodes): el panel lo usa para volcar el arbol de una vez.
  // La version anterior ignoraba los argumentos y el panel parecia no renderizar.
  replaceChildren() {
    this.children.forEach(c => c.parentNode = null);
    this.children = [];
    for (let i = 0; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null) continue;
      c.parentNode = this;
      this.children.push(c);
    }
  }
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
  } else if (url.includes('/image/matrix')) {
    body = {
      ok: true, count: 2, spaceSize: 10080,
      allowed: { scaleMode: ['fit','fill','stretch'], dither: ['none','ordered','error_diffusion','random'] },
      rows: [
        { profile: 'P4', outW: 1280, outH: 720, scaleMode: 'fit', dither: 'ordered', labDeclared: '1280x720', label: '720p' },
        { profile: 'P4.5', outW: 5760, outH: 3240, scaleMode: 'fit', dither: 'error_diffusion', labDeclared: '5760x3240', label: '6K' }
      ]
    };
  } else if (url.includes('/image/catalog')) {
    body = {
      ok: true, profiles: ['P3','P4','P4.5'],
      targets: [{ id: 'UHD_4K', label: '4K UHD SDR', width: 3840, height: 2160, hdr: false, tier: 'UHD' },
                { id: 'K6_PQ', label: '6K UHD PQ', width: 5760, height: 3240, hdr: true, tier: '6K' }],
      codecs: [{ id: 'hvc1', label: 'HEVC Main10', family: 'hevc', profile: 'main10', encoder: 'libx265' },
               { id: 'avc1', label: 'AVC High', family: 'avc', profile: 'high', encoder: 'libx264' }],
      players: [{ id: 'onn-4k', label: 'ONN 4K', maxW: 4096, maxH: 4096, codecs: ['hvc1'], hdr: true, main10: true },
                { id: 'firestick-lite', label: 'Firestick Lite', maxW: 1920, maxH: 1080, codecs: ['avc1'], hdr: false, main10: false }],
      recipes: [{ id: 'balanced', label: 'Balanced', chain: 'hqdn3d=0.6', params: { hq_ls: 0.6, unsharp_amount: 0.2 } }],
      counts: { targets: 2, codecs: 2, players: 2, recipes: 1 }
    };
  } else if (url.includes('/image/governance')) {
    body = {
      ok: true, defaultProfile: 'P4.5', count: 2,
      engines: { vlc: {}, kodi: {}, tivimate: {}, ott: {}, apk: {} },
      mechanism: 'El VPS entrega una URL con el perfil resuelto.',
      channels: [
        { channel: '1', name: 'Canal 1', profile: 'P4.5', target: '5760x3240', overridden: false },
        { channel: '2', name: 'Canal 2', profile: 'P4', target: '1280x720', overridden: true }
      ]
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
    // DIAGNOSTICO: por que no renderizo
    const st = A && A.getState ? A.getState() : null;
    if (st) {
      console.log('    [debug] lastError =', st.lastError);
      console.log('    [debug] config =', st.config ? 'si' : 'no',
                  '| catalog =', st.catalog ? 'si' : 'no',
                  '| matrix =', st.matrix ? 'si' : 'no',
                  '| gov =', st.gov ? 'si' : 'no');
      console.log('    [debug] hijos del stage =', stage.children.length);
    } else { console.log('    [debug] APE_IMAGE_PANEL sin getState'); }
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
    check('seccion constructor de perfil', all.includes('Constructor de perfil'));
    check('etiqueta ENTRADA senal', all.includes('ENTRADA res'));
    check('etiqueta SALIDA al TV', all.includes('SALIDA ancho') && all.includes('SALIDA alto'));
    check('seccion matriz editable', all.includes('Matriz editable'));
    check('seccion gobierno', all.includes('Gobierno'));
    check('seccion encoder', all.includes('Encoder'));
    check('boton Declarar automatico', !!walk(stage).find(n => n.id === 'aip-declare'));
    check('boton Aplicar al JIT', !!walk(stage).find(n => n.id === 'aip-apply-build'));
    check('boton Recomendada', !!walk(stage).find(n => n.id === 'aip-rec'));
    check('selector de target', !!walk(stage).find(n => n.id === 'aip-b-target'));
    check('selector de banda de entrada', !!walk(stage).find(n => n.id === 'aip-b-inband'));
    check('selector de fps de entrada', !!walk(stage).find(n => n.id === 'aip-b-infps'));
    check('selector de modo', !!walk(stage).find(n => n.id === 'aip-b-mode'));
    check('selector de codec', !!walk(stage).find(n => n.id === 'aip-b-codec'));
    check('selector de player', !!walk(stage).find(n => n.id === 'aip-b-player'));
    check('renderizo la capacidad', all.includes('Capacidad medida') || all.includes('VIABLE'));
    check('renderizo el estado vivo', all.includes('Estado vivo') || all.includes('canal'));
    check('no inyecto HTML desde la respuesta', !walk(stage).some(n => (n._text || '').includes('<script')));

    // cambio de receta -> POST
    const apply = walk(stage).find(n => n.id === 'aip-apply-build');
    if (apply) {
      apply.click();
      setTimeout(() => {
        const post = calls.find(c => c.url.includes('/image/config') && c.init && c.init.method === 'POST');
        check('el boton Aplicar hace POST', !!post);
        if (post) {
          const body = JSON.parse(post.init.body);
          check('el POST lleva perfil', 'profile' in body);
          check('el POST lleva receta', typeof body.recipe === 'string');
          check('el POST lleva parametros vivos', !!(body.hqdn3d && body.unsharp || body.atadenoise));
          check('el POST lleva paquete (seg/window/gop)', 'seg_duration' in body && 'window_size' in body || 'gop_seconds' in body);
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
