/**
 * APE VPS IMAGE PANEL — control remoto del modulo de imagen del JIT
 *
 * Habla con el motor real:
 *   GET  /jit/image/config    -> config efectiva + defaults + capacidades
 *   POST /jit/image/config    -> aplica en caliente (persiste y reinicia el job)
 *   GET  /jit/image/capacity  -> capacidad MEDIDA del host con veredicto
 *
 * Regla que este panel respeta y hace visible: la capacidad medida manda.
 * El VPS da 0,43x tiempo real a 1440p y 0,25x a 2160p con filtros en CPU.
 * Si el operador elige un destino no viable, el panel lo dice ANTES de aplicar
 * y ofrece la alternativa que si cabe.
 *
 * No inventa estado: si el motor no responde, muestra el error tal cual.
 */
(function () {
  'use strict';

  var DEFAULT_BASE = 'https://iptv-ape.duckdns.org/jit';

  var state = {
    base: DEFAULT_BASE,
    config: null,
    capacity: null,
    effectiveFilter: '',
    busy: false,
    lastError: null
  };

  // ── utilidades ────────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      // Sin rama innerHTML: TODO el texto entra como nodo de texto o textContent.
      // Lo que devuelve el motor no se interpreta nunca como HTML.
      if (k === 'style') n.setAttribute('style', attrs[k]);
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function api(path, opts) {
    var url = state.base + path;
    var init = Object.assign({ cache: 'no-store' }, opts || {});
    return fetch(url, init).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || j.ok === false) {
          throw new Error(j.error || j.errors ? (j.errors || []).join('; ') : 'HTTP ' + r.status);
        }
        return j;
      });
    });
  }

  function pct(ratio) {
    if (ratio === null || ratio === undefined) return 'no medido';
    return ratio.toFixed(2) + 'x tiempo real';
  }

  function viability(ratio) {
    if (ratio === null || ratio === undefined) return { label: 'NO MEDIDO', color: '#94a3b8' };
    if (ratio >= 1.2) return { label: 'VIABLE', color: '#10b981' };
    if (ratio >= 1.0) return { label: 'JUSTO', color: '#f59e0b' };
    return { label: 'NO VIABLE', color: '#ef4444' };
  }

  // ── estilos ───────────────────────────────────────────────────────────────
  var CSS = ''
    + '.aip-wrap{background:linear-gradient(135deg,rgba(59,130,246,.08),rgba(139,92,246,.05));'
    + 'border:1px solid rgba(59,130,246,.25);border-radius:16px;padding:20px;margin:16px 0;'
    + 'font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#e2e8f0}'
    + '.aip-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap}'
    + '.aip-title{margin:0;font-size:1rem;color:#e2e8f0}'
    + '.aip-sub{font-size:.75rem;color:#818cf8}'
    + '.aip-sec{font-size:.72rem;text-transform:uppercase;margin:14px 0 8px;font-weight:700;letter-spacing:.5px}'
    + '.aip-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}'
    + '.aip-field{display:flex;flex-direction:column;gap:4px}'
    + '.aip-field label{font-size:.72rem;color:#94a3b8}'
    + '.aip-field select,.aip-field input{background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.25);'
    + 'border-radius:8px;color:#e2e8f0;padding:7px 9px;font-size:.8rem;font-family:inherit;width:100%}'
    + '.aip-field input[type=range]{padding:0}'
    + '.aip-btn{padding:8px 14px;border:1px solid rgba(148,163,184,.2);border-radius:10px;'
    + 'background:rgba(30,41,59,.7);color:#e2e8f0;font-size:.78rem;cursor:pointer;font-family:inherit}'
    + '.aip-btn:hover{background:rgba(51,65,85,.9)}'
    + '.aip-btn.primary{background:rgba(59,130,246,.25);border-color:rgba(59,130,246,.5)}'
    + '.aip-btn:disabled{opacity:.45;cursor:not-allowed}'
    + '.aip-btnrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}'
    + '.aip-out{margin-top:14px;background:rgba(15,23,42,.85);border:1px solid rgba(148,163,184,.15);'
    + 'border-radius:12px;padding:12px;font-family:ui-monospace,monospace;font-size:.74rem;'
    + 'white-space:pre-wrap;max-height:340px;overflow:auto;line-height:1.55}'
    + '.aip-chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.68rem;font-weight:700}'
    + '.aip-table{width:100%;border-collapse:collapse;font-size:.74rem;margin-top:6px}'
    + '.aip-table th,.aip-table td{text-align:left;padding:5px 8px;border-bottom:1px solid rgba(148,163,184,.12)}'
    + '.aip-table th{color:#94a3b8;font-weight:600}'
    + '.aip-warn{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);border-radius:10px;'
    + 'padding:10px;font-size:.76rem;color:#fca5a5;margin-top:10px}';

  // ── render ────────────────────────────────────────────────────────────────
  function render(root) {
    var cfg = state.config || {};
    var cap = state.capacity;

    root.innerHTML = '';
    root.className = 'aip-wrap';

    // cabecera
    var status = el('div', { style: 'font-size:.75rem;color:#64748b' },
      [state.busy ? 'Trabajando…' : (state.lastError ? 'Error' : 'Listo')]);
    root.appendChild(el('div', { class: 'aip-head' }, [
      el('div', { style: 'display:flex;align-items:center;gap:12px' }, [
        el('span', { style: 'font-size:1.5rem' }, ['🎛️']),
        el('div', {}, [
          el('h3', { class: 'aip-title' }, ['MÓDULO DE IMAGEN — JIT APE']),
          el('span', { class: 'aip-sub' }, ['APK solicita → JIT filtra y codifica → APK reproduce'])
        ])
      ]),
      status
    ]));

    // capacidad medida
    root.appendChild(el('div', { class: 'aip-sec', style: 'color:#f59e0b' }, ['📊 Capacidad medida de este VPS']));
    if (cap && cap.rows) {
      var tbody = cap.rows.map(function (r) {
        var v = viability(r.realtime_ratio);
        return el('tr', {}, [
          el('td', {}, [r.target]),
          el('td', {}, [r.recipe]),
          el('td', {}, [r.seconds_for_20s === null ? '—' : r.seconds_for_20s + ' s']),
          el('td', {}, [pct(r.realtime_ratio)]),
          el('td', {}, [el('span', { class: 'aip-chip', style: 'background:' + v.color + '22;color:' + v.color }, [v.label])])
        ]);
      });
      root.appendChild(el('table', { class: 'aip-table' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, ['Destino']), el('th', {}, ['Receta']),
          el('th', {}, ['20 s de vídeo']), el('th', {}, ['Ritmo']), el('th', {}, ['Veredicto'])
        ])]),
        el('tbody', {}, tbody)
      ]));
      if (cap.verdict) {
        root.appendChild(el('div', { class: 'aip-warn' }, [cap.verdict]));
      }
    } else {
      root.appendChild(el('div', { class: 'aip-out' }, ['capacidad no disponible']));
    }

    // controles
    root.appendChild(el('div', { class: 'aip-sec', style: 'color:#3b82f6' }, ['🎯 Destino y receta']));

    function field(label, node) {
      return el('div', { class: 'aip-field' }, [el('label', {}, [label]), node]);
    }
    function select(id, options, current, onchange) {
      var s = el('select', { id: id });
      options.forEach(function (o) {
        var opt = el('option', { value: o }, [o]);
        if (String(o) === String(current)) opt.selected = true;
        s.appendChild(opt);
      });
      if (onchange) s.addEventListener('change', onchange);
      return s;
    }

    var targets = ['source', 'FHD_1080', 'QHD_1440', 'UHD_4K', 'DCI_2K'];
    var recipes = ['none', 'light', 'balanced', 'temporal', 'custom'];
    var presets = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'];
    var fpsOpts = ['preserve', '25', '30', '50', '60'];
    var audioOpts = ['preserve', 'aac', 'drop'];

    var grid = el('div', { class: 'aip-grid' }, [
      field('Destino', select('aip-target', targets, cfg.target)),
      field('Receta', select('aip-recipe', recipes, cfg.recipe)),
      field('Preset x265', select('aip-preset', presets, cfg.preset)),
      field('CRF', el('input', { id: 'aip-crf', type: 'number', min: '0', max: '51', value: cfg.crf })),
      field('FPS', select('aip-fps', fpsOpts, cfg.fps)),
      field('Audio', select('aip-audio', audioOpts, cfg.audio))
    ]);
    root.appendChild(grid);

    // filtros finos
    root.appendChild(el('div', { class: 'aip-sec', style: 'color:#10b981' }, ['⚙️ Parámetros de filtro']));
    var h = cfg.hqdn3d || {}, u = cfg.unsharp || {}, a = cfg.atadenoise || {};
    root.appendChild(el('div', { class: 'aip-grid' }, [
      field('hqdn3d luma_spatial', el('input', { id: 'aip-hq-ls', type: 'number', step: '0.05', min: '0', max: '20', value: h.luma_spatial })),
      field('hqdn3d chroma_spatial', el('input', { id: 'aip-hq-cs', type: 'number', step: '0.05', min: '0', max: '20', value: h.chroma_spatial })),
      field('hqdn3d luma_tmp', el('input', { id: 'aip-hq-lt', type: 'number', step: '0.05', min: '0', max: '20', value: h.luma_tmp })),
      field('unsharp amount', el('input', { id: 'aip-us-am', type: 'number', step: '0.01', min: '-2', max: '5', value: u.luma_amount })),
      field('unsharp msize', el('input', { id: 'aip-us-ms', type: 'number', step: '2', min: '3', max: '13', value: u.luma_msize })),
      field('atadenoise s', el('input', { id: 'aip-at-s', type: 'number', step: '1', min: '0', max: '15', value: a.s }))
    ]));

    // empaquetado
    root.appendChild(el('div', { class: 'aip-sec', style: 'color:#8b5cf6' }, ['📦 Empaquetado (afecta al arranque del player)']));
    root.appendChild(el('div', { class: 'aip-grid' }, [
      field('seg_duration (s)', el('input', { id: 'aip-seg', type: 'number', min: '1', max: '10', value: cfg.seg_duration })),
      field('window_size', el('input', { id: 'aip-win', type: 'number', min: '3', max: '120', value: cfg.window_size })),
      field('extra_window_size', el('input', { id: 'aip-exw', type: 'number', min: '0', max: '60', value: cfg.extra_window_size })),
      field('GOP (s)', el('input', { id: 'aip-gop', type: 'number', min: '1', max: '10', value: cfg.gop_seconds }))
    ]));

    // botones
    var btnApply = el('button', { class: 'aip-btn primary', id: 'aip-apply' }, ['▶ Aplicar al JIT']);
    var btnReload = el('button', { class: 'aip-btn', id: 'aip-reload' }, ['↻ Recargar estado']);
    var btnCap = el('button', { class: 'aip-btn', id: 'aip-cap' }, ['📊 Re-medir capacidad']);
    var btnDefaults = el('button', { class: 'aip-btn', id: 'aip-def' }, ['⟲ Defaults (source / none)']);
    btnApply.disabled = btnReload.disabled = btnCap.disabled = btnDefaults.disabled = state.busy;
    root.appendChild(el('div', { class: 'aip-btnrow' }, [btnApply, btnReload, btnCap, btnDefaults]));

    // salida
    var out = el('div', { class: 'aip-out', id: 'aip-out' });
    var lines = [];
    if (state.lastError) lines.push('ERROR: ' + state.lastError);
    if (state.effectiveFilter !== null) {
      lines.push('filtro efectivo: ' + (state.effectiveFilter || '(sin filtros)'));
    }
    if (cfg.target) {
      lines.push('config: target=' + cfg.target + '  recipe=' + cfg.recipe + '  codec=' + cfg.codec
        + '  preset=' + cfg.preset + '  crf=' + cfg.crf + '  fps=' + cfg.fps + '  audio=' + cfg.audio);
    }
    out.textContent = lines.length ? lines.join('\n') : 'sin datos todavía';
    root.appendChild(out);

    // ── eventos ──
    btnReload.addEventListener('click', function () { load(); });

    btnApply.addEventListener('click', function () {
      var patch = {
        target: document.getElementById('aip-target').value,
        recipe: document.getElementById('aip-recipe').value,
        preset: document.getElementById('aip-preset').value,
        crf: Number(document.getElementById('aip-crf').value),
        fps: document.getElementById('aip-fps').value,
        audio: document.getElementById('aip-audio').value,
        hqdn3d: {
          luma_spatial: Number(document.getElementById('aip-hq-ls').value),
          chroma_spatial: Number(document.getElementById('aip-hq-cs').value),
          luma_tmp: Number(document.getElementById('aip-hq-lt').value)
        },
        unsharp: {
          luma_amount: Number(document.getElementById('aip-us-am').value),
          luma_msize: Number(document.getElementById('aip-us-ms').value)
        },
        atadenoise: { s: Number(document.getElementById('aip-at-s').value) },
        seg_duration: Number(document.getElementById('aip-seg').value),
        window_size: Number(document.getElementById('aip-win').value),
        extra_window_size: Number(document.getElementById('aip-exw').value),
        gop_seconds: Number(document.getElementById('aip-gop').value)
      };
      // aviso de viabilidad ANTES de aplicar
      var warned = false;
      if (state.capacity && state.capacity.rows) {
        var row = state.capacity.rows.filter(function (r) { return r.target === patch.target; })[0];
        if (row && row.realtime_ratio !== null && row.realtime_ratio < 1.2) {
          warned = true;
        }
      }
      if (warned && !window.confirm(
        'El destino ' + patch.target + ' NO es viable en este host con la receta ' + patch.recipe
        + '.\n\nMedido: ' + (state.capacity.rows.filter(function (r) { return r.target === patch.target; })[0].realtime_ratio)
        + 'x tiempo real (se exige >=1,2x).\n\nEl JIT producirá más lento que la emisión y el player se quedará sin segmentos.\n\n¿Aplicar igualmente?'
      )) return;

      state.busy = true; state.lastError = null;
      render(root);
      api('/image/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      }).then(function (j) {
        state.config = j.config;
        state.effectiveFilter = j.effective_filter || '';
        state.busy = false;
        render(root);
      }).catch(function (e) {
        state.busy = false;
        state.lastError = e.message;
        render(root);
      });
    });

    btnDefaults.addEventListener('click', function () {
      state.busy = true; state.lastError = null; render(root);
      api('/image/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'source', recipe: 'none' })
      }).then(function (j) {
        state.config = j.config;
        state.effectiveFilter = j.effective_filter || '';
        state.busy = false; render(root);
      }).catch(function (e) {
        state.busy = false; state.lastError = e.message; render(root);
      });
    });

    btnCap.addEventListener('click', function () {
      state.busy = true; render(root);
      api('/image/capacity').then(function (j) {
        state.capacity = j; state.busy = false; render(root);
      }).catch(function (e) {
        state.busy = false; state.lastError = e.message; render(root);
      });
    });
  }

  // ── carga ─────────────────────────────────────────────────────────────────
  function load() {
    var root = document.getElementById('ape-image-panel');
    if (!root) {
      root = el('div', { id: 'ape-image-panel' });
      document.body.appendChild(root);
    }
    state.busy = true; state.lastError = null;
    render(root);

    Promise.all([
      api('/image/config'),
      api('/image/capacity').catch(function () { return null; })
    ]).then(function (res) {
      state.config = res[0].config;
      state.effectiveFilter = res[0].effective_filter || '';
      state.capacity = res[1];
      state.busy = false;
      render(root);
    }).catch(function (e) {
      state.busy = false;
      state.lastError = e.message;
      render(root);
    });
  }

  // estilos una sola vez
  if (!document.getElementById('aip-css')) {
    var st = el('style', { id: 'aip-css' });
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // API publica
  window.APE_IMAGE_PANEL = {
    load: load,
    mount: function (selector) {
      var root = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!root) return false;
      root.id = 'ape-image-panel';
      load();
      return true;
    },
    setBase: function (base) {
      state.base = String(base).replace(/\/+$/, '');
      load();
    },
    getState: function () {
      return { config: state.config, capacity: state.capacity, effectiveFilter: state.effectiveFilter, error: state.lastError };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { if (document.getElementById('ape-image-panel')) load(); });
  } else if (document.getElementById('ape-image-panel')) {
    load();
  }
})();
