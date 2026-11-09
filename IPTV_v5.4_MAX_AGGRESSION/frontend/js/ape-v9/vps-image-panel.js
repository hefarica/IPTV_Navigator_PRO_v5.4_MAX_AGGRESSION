/**
 * MÓDULO DE IMAGEN — JIT APE · panel único
 *
 * Un solo panel con:
 *   1. CONSTRUCTOR DE PERFIL: perfil -> entrada -> target -> codec -> player ->
 *      receta, con boton DECLARAR AUTOMATICO que llena lo que falte con la mejor
 *      alternativa posible y declara lo que NO se puede cumplir.
 *   2. MATRIZ EDITABLE de los 12 perfiles (entrada -> salida).
 *   3. GOBIERNO VPS -> player: genera la lista por motor.
 *   4. Capacidad medida, estado vivo y empaquetado.
 *
 * No usa innerHTML en ningun punto: el DOM se construye con replaceChildren y
 * textContent, para que ninguna respuesta del motor pueda inyectar HTML.
 */
(function () {
  'use strict';

  var S = {
    base: (window.APE_JIT_BASE || 'https://iptv-ape.duckdns.org') + '/jit',
    config: null, effectiveFilter: '', capacity: null, live: null,
    profiles: null, matrix: null, plan: null, catalog: null,
    declared: null, gov: null, cascade: null, fallback: null, rules: null, autoRow: null, optimized: null, llm: null, align: null,
    busy: false, lastError: null, log: [],
    build: { profile: 'P4.5', w: 1280, h: 720, target: 'UHD_4K', codec: 'hvc1',
             player: 'onn-4k', recipe: 'balanced', fps: 25,
             outW: 3840, outH: 2160, outFps: '', dither: 'error_diffusion', mode: 'real',
             inband: '720p', inFps: 30 }
  };

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'style') n.setAttribute('style', attrs[k]);
        else n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number'
        ? document.createTextNode(String(c)) : c);
    });
    return n;
  }

  function api(path, opts) {
    return fetch(S.base + path, Object.assign({ cache: 'no-store' }, opts || {}))
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || j.ok === false) {
            throw new Error(j.error || (j.errors && j.errors.join('; ')) || ('HTTP ' + r.status));
          }
          return j;
        });
      });
  }

  function post(path, body) {
    return api(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).catch(function (e) { return { ok: false, error: String((e && e.message) || e) }; });
  }

  function logLine(t) {
    var ts = new Date().toISOString().slice(11, 19);
    S.log.push(ts + '  ' + t);
    if (S.log.length > 60) S.log.shift();
  }

  function fld(label, node) { return el('div', { class: 'fld' }, [el('label', {}, [label]), node]); }
  function inp(id, val, type) {
    var n = el('input', { id: id, type: type || 'text' }, []);
    n.value = String(val == null ? '' : val);
    return n;
  }
  function sel(id, opts, cur) {
    var s = el('select', { id: id }, []);
    (opts || []).forEach(function (o) {
      var val = (typeof o === 'string') ? o : o.id;
      var txt = (typeof o === 'string') ? o : o.label;
      var op = el('option', { value: val }, [txt]);
      if (String(val) === String(cur)) op.selected = true;
      s.appendChild(op);
    });
    return s;
  }
  function sec(txt, color) {
    return el('div', { class: 'sec', style: 'color:' + (color || '#3b82f6') }, [txt]);
  }
  function chip(txt, color) {
    return el('span', { class: 'chip', style: 'background:' + color + '22;color:' + color }, [txt]);
  }
  function warn(txt, color) {
    var c = color || '#ef4444';
    return el('div', { class: 'warn', style: 'background:' + c + '1a;border:1px solid ' + c + '66;color:' + c }, [txt]);
  }

  var CSS = [
    '.aip{background:linear-gradient(135deg,rgba(59,130,246,.08),rgba(139,92,246,.05));',
    'border:1px solid rgba(59,130,246,.25);border-radius:16px;padding:20px;margin:16px 0;',
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#e2e8f0}',
    '.aip h3{margin:0;font-size:1rem}',
    '.aip .sub{font-size:.75rem;color:#818cf8}',
    '.aip .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap}',
    '.aip .stat{font-size:.75rem;color:#64748b}',
    '.aip .sec{font-size:.72rem;text-transform:uppercase;margin:18px 0 8px;font-weight:700;letter-spacing:.5px}',
    '.aip .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}',
    '.aip .fld{display:flex;flex-direction:column;gap:4px}',
    '.aip .fld label{font-size:.72rem;color:#94a3b8}',
    '.aip .fld select,.aip .fld input{background:#0f172a;border:1px solid #334155;border-radius:8px;',
    'color:#e2e8f0;padding:7px 9px;font-size:.82rem;font-family:inherit}',
    '.aip table{width:100%;border-collapse:collapse;font-size:.76rem;margin-top:6px}',
    '.aip th{text-align:left;color:#94a3b8;font-weight:600;padding:5px 6px;border-bottom:1px solid #1e293b;font-size:.7rem}',
    '.aip td{padding:4px 6px;border-bottom:1px solid rgba(30,41,59,.6)}',
    '.aip td input{width:88px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;padding:4px 6px;font-size:.76rem}',
    '.aip td select{background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;padding:4px 6px;font-size:.74rem}',
    '.aip button{background:#1e293b;border:1px solid #334155;border-radius:9px;color:#e2e8f0;',
    'padding:8px 14px;font-size:.78rem;cursor:pointer;font-family:inherit;transition:.15s}',
    '.aip button:hover{border-color:#3b82f6}',
    '.aip button.pri{background:linear-gradient(135deg,#3b82f6,#8b5cf6);border:0;font-weight:600}',
    '.aip button.ok{background:#10b98122;border-color:#10b98155;color:#6ee7b7}',
    '.aip button.go{background:#f59e0b22;border-color:#f59e0b55;color:#fbbf24;font-weight:600}',
    '.aip .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
    '.aip .out{background:#0b1220;border:1px solid #1e293b;border-radius:10px;padding:12px;',
    'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.72rem;color:#93c5fd;',
    'white-space:pre-wrap;word-break:break-all;max-height:320px;overflow:auto;margin-top:10px}',
    '.aip .chip{display:inline-block;padding:2px 8px;border-radius:6px;font-size:.68rem;font-weight:600}',
    '.aip .warn{border-radius:9px;padding:9px 12px;font-size:.75rem;margin-top:8px}',
    '.aip .decl{background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.4);',
    'border-radius:10px;padding:12px;margin-top:10px;font-size:.78rem;color:#bfdbfe;line-height:1.5}'
  ].join('');

  function injectCss() {
    if (document.getElementById('aip-css')) return;
    var st = document.createElement('style');
    st.id = 'aip-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ── 1. CONSTRUCTOR DE PERFIL ─────────────────────────────────────────── */

  function buildSection(root) {
    var cat = S.catalog;
    root.appendChild(sec('⚡ Constructor de perfil — entrada → target → codec → player', '#f59e0b'));
    if (!cat) { root.appendChild(el('div', { class: 'stat' }, ['catalogo no disponible'])); return; }

    var b = S.build;

    root.appendChild(el('div', { class: 'grid' }, [
      fld('Perfil', (function () {
        var sl = sel('aip-b-profile', cat.profiles.map(function (p) { return { id: p, label: p }; }), b.profile);
        // al cambiar de perfil se TRAE todo lo que ese perfil tiene cargado
        sl.addEventListener('change', function () { loadProfile(sl.value); });
        return sl;
      })()),
      fld('ENTRADA res (señal)', (function () {
        var e = sel('aip-b-inband', [
          { id: '480p', label: '480p (854x480)' }, { id: '576p', label: '576p (1024x576)' },
          { id: '720p', label: '720p (1280x720)' }, { id: '1080p', label: '1080p (1920x1080)' },
          { id: '1440p', label: '1440p (2560x1440)' }, { id: '4K', label: '4K (3840x2160)' },
          { id: '8K', label: '8K (7680x4320)' }
        ], b.inband || '720p');
        e.addEventListener('change', function () { applyBand(); recalcOptimos('entrada'); });
        return e;
      })()),
      fld('ENTRADA fps (señal)', (function () {
        var e = sel('aip-b-infps', [
          { id: '24', label: '24' }, { id: '25', label: '25' }, { id: '30', label: '30' },
          { id: '50', label: '50' }, { id: '60', label: '60' }, { id: '120', label: '120' }
        ], String(b.inFps || 30));
        e.addEventListener('change', function () { recalcOptimos('entrada'); });
        return e;
      })())
    ]));

    // salida explicita: CUALQUIER resolucion, no solo la del catalogo
    root.appendChild(el('div', { class: 'grid' }, [
      fld('SALIDA ancho (al TV)', (function () {
        var e = inp('aip-b-outW', b.outW || 3840, 'number');
        e.addEventListener('change', function () { recalcOptimos('salida'); });
        return e;
      })()),
      fld('SALIDA alto (al TV)', (function () {
        var e = inp('aip-b-outH', b.outH || 2160, 'number');
        e.addEventListener('change', function () { recalcOptimos('salida'); });
        return e;
      })()),
      fld('SALIDA fps', inp('aip-b-outFps', b.outFps || '', 'number')),
      fld('Modo', sel('aip-b-mode', [{ id: 'real', label: 'REAL (decoder exigido)' },
        { id: 'emulado', label: 'EMULADO (se declara igual)' }], b.mode || 'real')),
      fld('Dither', sel('aip-b-dither', ['none', 'ordered', 'error_diffusion', 'random'], b.dither || 'error_diffusion'))
    ]));

    root.appendChild(el('div', { class: 'grid' }, [
      fld('TARGET del catálogo (o escribe ancho/alto a mano)', (function () {
        var e = sel('aip-b-target', cat.targets.map(function (t) {
          return { id: t.id, label: t.label + '  ' + t.width + 'x' + t.height };
        }), b.target);
        e.addEventListener('change', function () {
          // el target rellena ancho y alto, y RECALCULA los optimos
          var t = cat.targets.filter(function (x) { return x.id === e.value; })[0];
          if (t) { setVal('aip-b-outW', t.width); setVal('aip-b-outH', t.height); }
          recalcOptimos('target');
        });
        return e;
      })()),
      fld('CODEC', sel('aip-b-codec', cat.codecs.map(function (c) {
        return { id: c.id, label: c.label };
      }), b.codec)),
      fld('PLAYER', sel('aip-b-player', cat.players.map(function (p) {
        return { id: p.id, label: p.label };
      }), b.player)),
      fld('RECETA de filtros', sel('aip-b-recipe', cat.recipes.map(function (r) {
        return { id: r.id, label: r.label };
      }), b.recipe))
    ]));

    // parametros de la receta, preseleccionados y editables
    var rec = (cat.recipes.filter(function (r) { return r.id === b.recipe; })[0] || { params: {} });
    var p = rec.params || {};
    var pk = Object.keys(p);
    root.appendChild(sec('⚙️ Parámetros de la receta (preseleccionados, editables)', '#10b981'));
    if (pk.length === 0) {
      root.appendChild(el('div', { class: 'stat' }, ['esta receta no tiene parametros ajustables (o es custom)']));
    } else {
      var pgrid = el('div', { class: 'grid' }, []);
      pk.forEach(function (k) { pgrid.appendChild(fld(k, inp('aip-p-' + k, p[k], 'number'))); });
      root.appendChild(pgrid);
    }

    /* ENCODER: el paquete completo, editable a mano o por el boton automatico */
    root.appendChild(sec('🎚️ Encoder (editable manual o automático)', '#f472b6'));
    var cfg0 = S.config || {};
    root.appendChild(el('div', { class: 'grid' }, [
      fld('preset x265', sel('aip-b-preset', ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'], cfg0.preset || 'ultrafast')),
      fld('CRF', inp('aip-b-crf', cfg0.crf != null ? cfg0.crf : 20, 'number')),
      fld('audio', sel('aip-b-audio', ['preserve', 'aac', 'drop'], cfg0.audio || 'preserve')),
      fld('GOP (s)', inp('aip-b-gop', cfg0.gop_seconds != null ? cfg0.gop_seconds : 2, 'number'))
    ]));

    /* FILTROS: todos los parametros vivos */
    root.appendChild(sec('⚙️ Filtros (todos los parámetros)', '#10b981'));
    var h = cfg0.hqdn3d || {}, u = cfg0.unsharp || {}, at = cfg0.atadenoise || {};
    root.appendChild(el('div', { class: 'grid' }, [
      fld('hqdn3d luma_spatial', inp('aip-hq-ls', h.luma_spatial != null ? h.luma_spatial : 0.6, 'number')),
      fld('hqdn3d chroma_spatial', inp('aip-hq-cs', h.chroma_spatial != null ? h.chroma_spatial : 0.45, 'number')),
      fld('hqdn3d luma_tmp', inp('aip-hq-lt', h.luma_tmp != null ? h.luma_tmp : 0.9, 'number')),
      fld('hqdn3d chroma_tmp', inp('aip-hq-ct', h.chroma_tmp != null ? h.chroma_tmp : 0.7, 'number')),
      fld('unsharp amount', inp('aip-us-am', u.luma_amount != null ? u.luma_amount : 0.2, 'number')),
      fld('unsharp msize (impar)', inp('aip-us-ms', u.luma_msize != null ? u.luma_msize : 5, 'number')),
      fld('atadenoise s', inp('aip-at-s', at.s != null ? at.s : 5, 'number'))
    ]));

    /* EMPAQUETADO */
    root.appendChild(sec('📦 Empaquetado (arranque del player)', '#8b5cf6'));
    root.appendChild(el('div', { class: 'grid' }, [
      fld('seg_duration (s)', inp('aip-seg', cfg0.seg_duration != null ? cfg0.seg_duration : 2, 'number')),
      fld('window_size', inp('aip-win', cfg0.window_size != null ? cfg0.window_size : 30, 'number')),
      fld('extra_window_size', inp('aip-exw', cfg0.extra_window_size != null ? cfg0.extra_window_size : 10, 'number')),
      fld('x265_threads', inp('aip-thr', cfg0.x265_threads != null ? cfg0.x265_threads : 1, 'number'))
    ]));

    var bOpt = el('button', { class: 'go', id: 'aip-optimize', style: 'background:#8b5cf622;border-color:#8b5cf655;color:#c4b5fd;font-weight:600' },
      ['⚡ Optimizar (función objetivo)']);
    bOpt.title = 'Calcula TODOS los campos para la entrada/salida/modo actual. Usa el LLM si esta configurado; si no, el motor deterministico.';
    bOpt.addEventListener('click', doOptimize);
    var bDecl = el('button', { class: 'go', id: 'aip-declare' }, ['🎯 Declarar automático']);
    bDecl.addEventListener('click', doDeclare);
    var bApply = el('button', { class: 'pri', id: 'aip-apply-build' }, ['▶ Aplicar al JIT']);
    bApply.addEventListener('click', applyBuild);
    var bRec = el('button', { class: 'ok', id: 'aip-rec' }, ['✅ Recomendada (FHD 25 fps)']);
    bRec.addEventListener('click', applyRecommended);
    var bRel = el('button', { id: 'aip-reload' }, ['↻ Recargar']);
    bRel.addEventListener('click', load);
    var bDef = el('button', { id: 'aip-def' }, ['⟲ Defaults']);
    bDef.addEventListener('click', applyDefaults);
    root.appendChild(el('div', { class: 'row', style: 'margin-top:14px' }, [bOpt, bDecl, bApply, bRec, bRel, bDef]));

    if (S.optimized && S.optimized.ok) renderOptimized(root);
    if (S.autoRow && S.autoRow.ok) renderAutoRow(root);
    if (S.declared) renderDeclaration(root);
  }

  /* Resultado del recalculo automatico: se ve en el constructor, con el porque
   * de cada campo y lo que no se puede. */
  /* Resultado de OPTIMIZAR: cada campo con su valor y su razon, la cadena, el
   * coste y el origen (LLM o deterministico). */
  function renderOptimized(root) {
    var o = S.optimized;
    var src = (o.llm && o.llm.used) ? ('LLM ' + (o.llm.ms ? '(' + o.llm.ms + ' ms)' : '')) : 'determinístico';
    var box = el('div', { class: 'decl', style: 'border-color:rgba(139,92,246,.5);background:rgba(139,92,246,.08)' }, [
      el('div', { style: 'font-weight:700;color:#c4b5fd;margin-bottom:6px' }, [
        '⚡ OPTIMIZADO [' + src + '] — ' + o.mode.toUpperCase() +
        ' · ' + o.areaRatio + 'x área · coste ' + o.cost.relative + 'x (' + o.cost.estimatedRatio + 'x rt)'
      ]),
      el('div', { style: 'font-size:.73rem;color:#a5b4fc;margin-bottom:6px' }, [o.modeMeaning])
    ]);
    // cada campo con su razon
    ['codec', 'preset', 'crf', 'audio', 'seg_duration', 'window_size', 'x265_threads'].forEach(function (k) {
      var f = o.fields[k];
      box.appendChild(el('div', { style: 'font-size:.72rem;margin-top:1px' }, [
        '· ' + k + ' = ' + f.value + ' — ' + f.reason
      ]));
    });
    // filtros activos
    var F = o.filters;
    var act = [];
    if (F.nlmeans.enabled) act.push('nlmeans s=' + F.nlmeans.s);
    if (F.minterpolate.enabled) act.push('minterpolate ' + F.minterpolate.outFps + 'fps');
    if (F.cas.enabled) act.push('cas ' + F.cas.strength);
    if (F.gradfun.enabled) act.push('gradfun ' + F.gradfun.strength);
    if (F.hqdn3d.luma_spatial > 0) act.push('hqdn3d ' + F.hqdn3d.luma_spatial);
    if (F.atadenoise.s > 0) act.push('atadenoise s=' + F.atadenoise.s);
    if (F.unsharp.luma_amount > 0) act.push('unsharp ' + F.unsharp.luma_amount);
    box.appendChild(el('div', { style: 'font-size:.72rem;margin-top:5px;color:#7dd3fc' }, [
      'filtros activos: ' + (act.length ? act.join(' · ') : 'ninguno')
    ]));
    box.appendChild(el('div', { class: 'out', style: 'margin-top:6px' }, [o.chain]));
    if (o.llm && o.llm.used) {
      if (o.llm.razon) box.appendChild(el('div', { style: 'font-size:.72rem;color:#c4b5fd;margin-top:4px' }, ['LLM: ' + o.llm.razon]));
      if (o.llm.rejected && o.llm.rejected.length) {
        box.appendChild(warn('LLM descartado en ' + o.llm.rejected.length + ' campo(s): ' + o.llm.rejected.join('; '), '#f59e0b'));
      }
    } else if (o.llm && o.llm.error) {
      box.appendChild(el('div', { style: 'font-size:.7rem;color:#94a3b8;margin-top:4px' }, [
        'LLM no usado: ' + o.llm.error
      ]));
    }
    (o.impossible || []).forEach(function (i) { box.appendChild(warn('IMPOSIBLE: ' + i)); });
    (o.warnings || []).slice(0, 3).forEach(function (w) { box.appendChild(warn('AVISO: ' + w, '#f59e0b')); });
    root.appendChild(box);
  }

  function renderAutoRow(root) {
    var a = S.autoRow;
    var box = el('div', { class: 'decl' }, [
      el('div', { style: 'font-weight:700;color:#60a5fa;margin-bottom:6px' }, [
        (a.mode === 'emulado' ? 'EMULADO — ' : 'REAL — ') + 'ÓPTIMO calculado para ' +
        a.input.band + '@' + (a.input.fps || '?') + ' → ' +
        a.output.width + 'x' + a.output.height + '  (' + a.areaRatio + 'x área)'
      ])
    ]);
    ['codec', 'recipe', 'outFps', 'dither'].forEach(function (k) {
      var f = a.fields[k];
      box.appendChild(el('div', { style: 'font-size:.73rem;margin-top:2px' }, [
        '· ' + k + ' = ' + String(f.value) + (f.op ? ' (' + f.op + ')' : '') + ' — ' + f.reason
      ]));
    });
    if (a.hostCost) {
      box.appendChild(el('div', { style: 'font-size:.73rem;margin-top:4px;color:' +
        (a.hostCost.viable ? '#6ee7b7' : '#fca5a5') }, [
        '· coste ' + a.hostCost.relative + 'x → ' + a.hostCost.estimatedRatio +
        'x tiempo real' + (a.hostCost.viable ? '' : ' (NO VIABLE en este host)')
      ]));
    }
    (a.impossible || []).forEach(function (i) { box.appendChild(warn('IMPOSIBLE: ' + i)); });
    (a.warnings || []).forEach(function (w) { box.appendChild(warn('AVISO: ' + w, '#f59e0b')); });
    box.appendChild(el('div', { style: 'font-size:.7rem;color:#94a3b8;margin-top:4px' }, [
      'Todo sigue EDITABLE. Cambiar aquí no aplica nada hasta pulsar «Aplicar al JIT».'
    ]));
    root.appendChild(box);
  }

  function renderDeclaration(root) {
    var d = S.declared;
    if (!d || !d.ok) {
      root.appendChild(warn('declarar: ' + ((d && d.error) || 'error')));
      return;
    }
    var dd = d.declared;
    var box = el('div', { class: 'decl' }, [
      el('div', { style: 'font-weight:700;color:#60a5fa;margin-bottom:6px' }, ['DECLARACIÓN RESUELTA']),
      el('div', {}, [dd.declaration]),
      el('div', { style: 'margin-top:8px;display:flex;gap:6px;flex-wrap:wrap' }, [
        chip('codec ' + dd.codec.rfc, '#8b5cf6'),
        chip(dd.codec.encoder + ' / ' + dd.codec.preset, '#22d3ee'),
        chip('pix ' + dd.codec.pixFmt, '#10b981'),
        chip(dd.metrics.areaRatio + 'x area', '#f59e0b'),
        chip('coste ' + dd.metrics.relativeCost + 'x', '#f59e0b'),
        dd.hostViable && dd.hostViable.viable === false ? chip('HOST NO VIABLE ' + dd.hostViable.ratio + 'x', '#ef4444') : null,
        dd.hostViable && dd.hostViable.viable === true ? chip('HOST VIABLE ' + dd.hostViable.ratio + 'x', '#10b981') : null
      ])
    ]);
    if (dd.downgraded) {
      box.appendChild(warn('DEGRADADO: ' + dd.downgraded.from + ' → ' + dd.downgraded.to + ' — ' + dd.downgraded.reason, '#f59e0b'));
    }
    (dd.impossible || []).forEach(function (t) { box.appendChild(warn('NO CUMPLE: ' + t)); });
    box.appendChild(el('div', { class: 'out', style: 'margin-top:8px' }, [dd.filter]));
    root.appendChild(box);
  }

  function readBuild() {
    function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
    S.build.profile = v('aip-b-profile');
    S.build.inband = v('aip-b-inband') || '720p';
    S.build.inFps = Number(v('aip-b-infps')) || 30;
    var B2 = { '480p': [854, 480], '576p': [1024, 576], '720p': [1280, 720],
               '1080p': [1920, 1080], '1440p': [2560, 1440], '4K': [3840, 2160], '8K': [7680, 4320] };
    var bb = B2[S.build.inband] || [1280, 720];
    S.build.w = bb[0];
    S.build.h = bb[1];
    S.build.target = v('aip-b-target');
    S.build.codec = v('aip-b-codec');
    S.build.player = v('aip-b-player');
    S.build.recipe = v('aip-b-recipe');
    S.build.fps = v('aip-b-fps');
    S.build.outW = Number(v('aip-b-outW')) || 3840;
    S.build.outH = Number(v('aip-b-outH')) || 2160;
    S.build.outFps = v('aip-b-outFps');
    S.build.dither = v('aip-b-dither');
    S.build.mode = v('aip-b-mode');
    S.build.preset = v('aip-b-preset');
    S.build.crf = Number(v('aip-b-crf'));
    S.build.audio = v('aip-b-audio');
    S.build.gop = Number(v('aip-b-gop'));
    return S.build;
  }

  // patch COMPLETO: encoder + filtros + empaquetado, todo lo que el operador edito
  function fullPatch() {
    var b = readBuild();
    function n(id, d) { var e = document.getElementById(id); return e ? Number(e.value) : d; }
    return {
      profile: b.profile, target: 'source', recipe: b.recipe, fps: String(b.fps),
      preset: b.preset, crf: b.crf, audio: b.audio, gop_seconds: b.gop,
      force_transcode: true,
      hqdn3d: { luma_spatial: n('aip-hq-ls', 0.6), chroma_spatial: n('aip-hq-cs', 0.45),
                luma_tmp: n('aip-hq-lt', 0.9), chroma_tmp: n('aip-hq-ct', 0.7) },
      unsharp: { luma_amount: n('aip-us-am', 0.2), luma_msize: n('aip-us-ms', 5) },
      atadenoise: { s: n('aip-at-s', 5) },
      seg_duration: n('aip-seg', 2), window_size: n('aip-win', 30),
      extra_window_size: n('aip-exw', 10), x265_threads: n('aip-thr', 1)
    };
  }

  function applyRecommended() {
    post('/image/config', {
      target: 'FHD_1080', recipe: 'balanced', fps: '25', profile: 'P3',
      force_transcode: true, seg_duration: 2, window_size: 30, extra_window_size: 10, gop_seconds: 2
    }).then(function (r) {
      logLine(r && r.ok ? 'APLICADO recomendada FHD_1080/balanced/25fps' : 'fallo al aplicar la recomendada');
      load();
    });
  }

  function applyDefaults() {
    post('/image/config', { target: 'source', recipe: 'none', fps: 'preserve', profile: '' })
      .then(function () { logLine('defaults aplicados'); load(); });
  }

  /* OPTIMIZAR: llama a la funcion objetivo completa y escribe TODOS los campos.
   * Con LLM configurado, el LLM propone y la validacion por rangos decide. Sin
   * LLM, responde el motor deterministico. En ambos casos se declara cual fue. */
  function doOptimize() {
    var b = readBuild();
    S.busy = true;
    post('/image/optimize-llm', {
      inW: b.w, inH: b.h, inFps: b.inFps,
      outW: b.outW, outH: b.outH,
      player: b.player, mode: b.mode
    }).then(function (r) {
      S.busy = false;
      if (!r || !r.ok) { logLine('optimizar: ' + ((r && r.error) || 'fallo')); return; }
      // se rellenan TODOS los campos con el resultado
      var f = r.fields, F = r.filters;
      setVal('aip-b-codec', f.codec.value);
      setVal('aip-b-preset', f.preset.value);
      setVal('aip-b-crf', f.crf.value);
      setVal('aip-b-audio', f.audio.value);
      setVal('aip-b-gop', f.gop_seconds.value);
      setVal('aip-seg', f.seg_duration.value);
      setVal('aip-win', f.window_size.value);
      setVal('aip-exw', f.extra_window_size.value);
      setVal('aip-thr', f.x265_threads.value);
      setVal('aip-hq-ls', F.hqdn3d.luma_spatial);
      setVal('aip-hq-cs', F.hqdn3d.chroma_spatial);
      setVal('aip-hq-lt', F.hqdn3d.luma_tmp);
      setVal('aip-hq-ct', F.hqdn3d.chroma_tmp);
      setVal('aip-us-am', F.unsharp.luma_amount);
      setVal('aip-us-ms', F.unsharp.luma_msize);
      setVal('aip-at-s', F.atadenoise.s);
      // dither segun codec
      setVal('aip-b-dither', (f.codec.value === 'hvc1' || f.codec.value === 'hvc1_8') ? 'error_diffusion' : 'ordered');
      S.optimized = r;
      var src = (r.llm && r.llm.used) ? 'LLM' : 'deterministico';
      logLine('OPTIMIZADO [' + src + '] ' + r.mode + ': preset=' + f.preset.value +
              ' crf=' + f.crf.value + ' coste=' + r.cost.relative + 'x');
      render(document.getElementById('ape-image-panel'));
    });
  }

  function doDeclare() {
    var b = readBuild();
    S.busy = true;
    post('/image/declare', {
      profile: b.profile, input: { width: b.w, height: b.h },
      target: b.target, codec: b.codec, player: b.player, recipe: b.recipe, fps: b.fps
    }).then(function (r) {
      S.declared = r; S.busy = false;
      logLine('DECLARADO ' + (r.ok ? r.declared.declaration : ('FALLO ' + r.error)));
      render(document.getElementById('ape-image-panel'));
    });
  }

  function applyBuild() {
    var b = readBuild();
    post('/image/config', fullPatch()).then(function (r) {
      if (r && r.ok) {
        S.config = r.config; S.effectiveFilter = r.effective_filter || '';
        logLine('APLICADO ' + b.profile + ' / ' + b.recipe + ' / ' + b.fps + 'fps');
      } else {
        logLine('FALLO al aplicar: ' + ((r && r.error) || 'desconocido'));
      }
      render(document.getElementById('ape-image-panel'));
    });
  }

  /* ── 2. MATRIZ EDITABLE ───────────────────────────────────────────────── */

  /* ── CARGAR TODO LO QUE TIENE UN PERFIL ──────────────────────────────────
   * Al elegir un perfil se traen su resolucion de entrada y salida, su codec,
   * su receta, su encoder completo, sus seis filtros y su empaquetado.
   * Antes el select solo cambiaba de nombre: los valores seguian siendo los del
   * perfil anterior. */
  var BANDS = { '480p': [854, 480], '576p': [1024, 576], '720p': [1280, 720],
                '1080p': [1920, 1080], '1440p': [2560, 1440], '4K': [3840, 2160], '8K': [7680, 4320] };

  function applyBand() {
    var e = document.getElementById('aip-b-inband');
    if (!e) return;
    var b = BANDS[e.value];
    if (b) { /* la banda se lee en readBuild; aqui solo se declara */ }
  }

  /* RECALCULO DE OPTIMOS al cambiar la salida o la entrada.
   *
   * El operador: "cuando ya dentro cambie la resolucion, los valores internos que
   * sean los optimos para cada campo tambien lo hagan, queda editable por si quiero
   * modificar alguno".
   *
   * Se piden los optimos al motor y se ESCRIBEN en las cajas. Siguen siendo
   * editables: nada se bloquea. Y no se guarda nada: cambiar la resolucion no
   * altera la configuracion del motor hasta que se pulse Aplicar. */
  function recalcOptimos(origen) {
    var b = readBuild();
    var band = BANDS[b.inband] || [1280, 720];
    post('/image/rules/auto', {
      inW: band[0], inH: band[1], inFps: b.inFps,
      outW: b.outW, outH: b.outH,
      player: b.player, mode: b.mode
    }).then(function (r) {
      if (!r || !r.ok) { logLine('auto tras ' + origen + ': ' + (r && r.error)); return; }
      // los campos se reescriben con el optimo; el operador puede cambiarlos luego
      setVal('aip-b-codec', r.fields.codec.value);
      setVal('aip-b-recipe', r.fields.recipe.value);
      setVal('aip-b-dither', r.fields.dither.value);
      if (r.fields.outFps.value && r.fields.outFps.value !== 'preserve') {
        setVal('aip-b-outFps', r.fields.outFps.value);
      }
      S.autoRow = r;
      logLine('optimos recalculados por ' + origen + ': codec=' + r.fields.codec.value +
              ' receta=' + r.fields.recipe.value +
              (r.impossible.length ? ' | ' + r.impossible.length + ' imposible(s)' : ''));
      var root = document.getElementById('ape-image-panel');
      if (root) render(root);
    });
  }

  function setVal(id, v) {
    var e = document.getElementById(id);
    if (e && v != null && v !== '') e.value = String(v);
  }

  function loadProfile(pid) {
    if (!pid) return;
    S.build.profile = pid;
    api('/image/profile/' + encodeURIComponent(pid) + '/full?player=' +
        encodeURIComponent(S.build.player) + '&w=' + S.build.w + '&h=' + S.build.h)
      .then(function (r) {
        if (!r || !r.ok || !r.load) { logLine('perfil ' + pid + ': sin datos'); return; }
        var L = r.load;
        var bands = { '480p': [854, 480], '576p': [1024, 576], '720p': [1280, 720],
                      '1080p': [1920, 1080], '1440p': [2560, 1440], '4K': [3840, 2160], '8K': [7680, 4320] };
        // ENTRADA
        if (L.input && bands[L.input]) {
          setVal('aip-b-w', bands[L.input][0]);
          setVal('aip-b-h', bands[L.input][1]);
        }
        // SALIDA
        setVal('aip-b-outW', L.outW);
        setVal('aip-b-outH', L.outH);
        setVal('aip-b-outFps', L.outFps || '');
        setVal('aip-b-codec', L.codec);
        setVal('aip-b-recipe', L.recipe);
        setVal('aip-b-dither', L.dither);
        setVal('aip-b-mode', L.mode);
        // ENCODER
        setVal('aip-b-preset', L.preset);
        setVal('aip-b-crf', L.crf);
        setVal('aip-b-audio', L.audio);
        setVal('aip-b-gop', L.gop_seconds);
        // FILTROS (los seis)
        setVal('aip-hq-ls', (L.hqdn3d || {}).luma_spatial);
        setVal('aip-hq-cs', (L.hqdn3d || {}).chroma_spatial);
        setVal('aip-hq-lt', (L.hqdn3d || {}).luma_tmp);
        setVal('aip-hq-ct', (L.hqdn3d || {}).chroma_tmp);
        setVal('aip-us-am', (L.unsharp || {}).luma_amount);
        setVal('aip-us-ms', (L.unsharp || {}).luma_msize);
        setVal('aip-at-s', (L.atadenoise || {}).s);
        // EMPAQUETADO
        setVal('aip-seg', L.seg_duration);
        setVal('aip-win', L.window_size);
        setVal('aip-exw', L.extra_window_size);
        setVal('aip-thr', L.x265_threads);
        logLine('perfil ' + pid + ' cargado (' + (r.ruleCount || 0) + ' reglas, ' +
                (r.matrix ? r.matrix.outW + 'x' + r.matrix.outH : 'sin matriz') + ')');
        var root = document.getElementById('ape-image-panel');
        if (root) render(root);
      })
      .catch(function (e) { logLine('perfil ' + pid + ': ' + e.message); });
  }

  /* ── LLM + ALINEACION CON EL GESTOR DE PERFILES ───────────────────────── */

  function llmSection(root) {
    var L = S.llm;
    root.appendChild(sec('🤖 Motor LLM — ' + (L && L.configured ? 'ACTIVO' : 'sin key'), '#a78bfa'));

    // estado y campo de key
    root.appendChild(el('div', { class: 'grid' }, [
      fld('API key (se guarda en el motor, no en el navegador)',
        inp('aip-llm-key', '', 'password')),
      fld('Modelo', el('div', { style: 'font-size:.8rem' }, [L ? L.model : '—'])),
      fld('Origen de la key', el('div', { style: 'font-size:.8rem' }, [L ? (L.source || '—') : '—']))
    ]));

    var bSave = el('button', { class: 'pri', id: 'aip-llm-save' }, ['💾 Guardar key (en caliente)']);
    bSave.addEventListener('click', function () {
      var e = document.getElementById('aip-llm-key');
      if (!e || !e.value) { logLine('escribe la key primero'); return; }
      post('/image/llm-key', { key: e.value }).then(function (r) {
        logLine(r && r.ok ? ('key guardada (' + r.chars + ' chars), sin reiniciar') : ('fallo: ' + (r && r.error)));
        if (e) e.value = '';
        load();
      });
    });
    var bClear = el('button', {}, ['🗑 Borrar key']);
    bClear.addEventListener('click', function () {
      post('/image/llm-key', { clear: true }).then(function () { logLine('key borrada'); load(); });
    });
    root.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [bSave, bClear]));

    if (L && L.note) root.appendChild(warn(L.note, '#a78bfa'));

    // ── ALINEACION ──
    root.appendChild(sec('🔗 Alinear Gestor de Perfiles ↔ Módulo de imagen', '#f472b6'));
    var profs = (S.gestor && S.gestor.profiles) ? S.gestor.profiles : [];
    if (!profs.length) {
      root.appendChild(el('div', { class: 'stat' }, ['gestor de perfiles no disponible']));
      return;
    }
    root.appendChild(el('div', { class: 'stat', style: 'margin-bottom:8px' }, [
      profs.length + ' perfiles del gestor · ' +
      Number(profs.reduce(function (a, p) { return a + p.fields; }, 0)).toLocaleString('es') +
      ' campos en total. La alineación PROPONE; no aplica hasta confirmar.'
    ]));

    root.appendChild(el('div', { class: 'grid' }, [
      fld('Perfil del gestor', sel('aip-al-profile', profs.map(function (p) {
        return { id: p.id, label: p.id + '  ' + p.name + '  (' + p.fields + ' campos)' };
      }), S.build.profile ? S.build.profile.split('.')[0] : 'P0'))
    ]));

    var bAlign = el('button', { class: 'go', id: 'aip-align' }, ['🔗 Proponer alineación']);
    bAlign.addEventListener('click', doAlign);
    root.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [bAlign]));

    if (S.align && S.align.ok) renderAlign(root);
    else if (S.align) root.appendChild(warn('alinear: ' + (S.align.error || 'error')));
  }

  function doAlign() {
    var b = readBuild();
    var pe = document.getElementById('aip-al-profile');
    var pid = pe ? pe.value : 'P0';
    post('/image/profile/align', {
      profile: pid,
      inW: b.w, inH: b.h, inFps: b.inFps,
      outW: b.outW, outH: b.outH,
      player: b.player, mode: b.mode
    }).then(function (r) {
      S.align = r;
      logLine(r && r.ok ? ('alineacion: ' + r.proposed + ' cambios de ' + r.totalFields + ' campos (' + pid + ')')
                        : ('fallo alinear: ' + (r && r.error)));
      render(document.getElementById('ape-image-panel'));
    });
  }

  function renderAlign(root) {
    var a = S.align;
    var box = el('div', { class: 'decl', style: 'border-color:rgba(244,114,182,.5);background:rgba(244,114,182,.08)' }, [
      el('div', { style: 'font-weight:700;color:#f9a8d4;margin-bottom:6px' }, [
        '🔗 ALINEACIÓN PROPUESTA — ' + a.profile + ' · ' + a.mode.toUpperCase() +
        ' · ' + a.proposed + ' cambios de ' + Number(a.totalFields).toLocaleString('es') + ' campos'
      ]),
      el('div', { style: 'font-size:.72rem;color:#fbcfe8;margin-bottom:8px' }, [
        a.unchanged.toLocaleString('es') + ' campos se heredan sin tocar. NADA se ha aplicado.'
      ])
    ]);
    // tabla de cambios
    var tb = el('tbody', {});
    (a.diffs || []).forEach(function (d) {
      var bef = d.before == null ? '(nuevo)' : String(d.before);
      var aft = String(d.after);
      if (bef.length > 26) bef = bef.slice(0, 25) + '…';
      if (aft.length > 26) aft = aft.slice(0, 25) + '…';
      tb.appendChild(el('tr', {}, [
        el('td', { style: 'font-size:.7rem;font-family:ui-monospace,monospace' }, [d.path]),
        el('td', { style: 'font-size:.7rem;color:#f87171' }, [bef]),
        el('td', { style: 'font-size:.7rem;color:#6ee7b7' }, [aft])
      ]));
    });
    box.appendChild(el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, ['Campo']), el('th', {}, ['Antes']), el('th', {}, ['Después'])
      ])]), tb
    ]));
    // razones
    var why = el('div', { style: 'margin-top:8px;font-size:.7rem;color:#94a3b8' }, []);
    (a.diffs || []).slice(0, 5).forEach(function (d) {
      why.appendChild(el('div', {}, ['· ' + d.path + ' — ' + d.reason]));
    });
    box.appendChild(why);
    if (a.objective) {
      box.appendChild(el('div', { style: 'font-size:.7rem;margin-top:6px;color:' +
        (a.objective.cost.viable ? '#6ee7b7' : '#fca5a5') }, [
        'coste del objetivo: ' + a.objective.cost.relative + 'x → ' +
        a.objective.cost.estimatedRatio + 'x tiempo real' +
        (a.objective.cost.viable ? '' : ' (NO VIABLE en este host)')
      ]));
      (a.objective.impossible || []).forEach(function (i) { box.appendChild(warn('IMPOSIBLE: ' + i)); });
    }
    root.appendChild(box);
  }

  /* ── TABLA DE REGLAS: ENTRADA -> SALIDA (manual + auto por campo) ─────── */

  function rulesSection(root) {
    var R = S.rules;
    root.appendChild(sec('📐 Tabla de reglas — ENTRADA → SALIDA' +
      (R ? ' (' + R.count + ' reglas)' : ''), '#f472b6'));
    if (!R || !R.rules) {
      root.appendChild(el('div', { class: 'stat' }, ['reglas no disponibles']));
      return;
    }

    root.appendChild(el('div', { class: 'stat', style: 'margin-bottom:8px' }, [
      'Cada fila es manual. (A) = auto de ESE campo. [ ★ ] = auto de TODA la fila. ' +
      'El auto no propone configuraciones imposibles.'
    ]));

    var tb = el('tbody', {});
    R.rules.forEach(function (r) {
      var tr = el('tr', {}, [
        el('td', {}, [inp('rl-' + r.id + '-input', r.input, 'text')]),
        el('td', {}, [inp('rl-' + r.id + '-inFps', r.inFps || '', 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-outW', r.outW, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-outH', r.outH, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-outFps', r.outFps || '', 'number')]),
        el('td', {}, [sel('rl-' + r.id + '-codec', ['hvc1', 'hvc1_8', 'avc1', 'av01'], r.codec)]),
        el('td', {}, [sel('rl-' + r.id + '-recipe', ['none', 'light', 'balanced', 'temporal', 'custom'], r.recipe)]),
        el('td', {}, [sel('rl-' + r.id + '-dither', ['none', 'ordered', 'error_diffusion', 'random'], r.dither || 'ordered')]),
        // REAL: exige que el decoder lo decodifique. EMULADO: se declara igual.
        el('td', {}, [sel('rl-' + r.id + '-mode', [
          { id: 'real', label: 'REAL' }, { id: 'emulado', label: 'EMULADO' }
        ], r.mode || 'real')]),
        // ENCODER
        el('td', {}, [sel('rl-' + r.id + '-preset', ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'], r.preset || 'ultrafast')]),
        el('td', {}, [inp('rl-' + r.id + '-crf', r.crf != null ? r.crf : 20, 'number')]),
        el('td', {}, [sel('rl-' + r.id + '-audio', ['preserve', 'aac', 'drop'], r.audio || 'preserve')]),
        // FILTROS
        el('td', {}, [inp('rl-' + r.id + '-hqls', (r.hqdn3d || {}).luma_spatial, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-hqcs', (r.hqdn3d || {}).chroma_spatial, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-hqlt', (r.hqdn3d || {}).luma_tmp, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-hqct', (r.hqdn3d || {}).chroma_tmp, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-usam', (r.unsharp || {}).luma_amount, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-usms', (r.unsharp || {}).luma_msize, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-ats', (r.atadenoise || {}).s, 'number')]),
        // EMPAQUETADO
        el('td', {}, [inp('rl-' + r.id + '-seg', r.seg_duration, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-win', r.window_size, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-exw', r.extra_window_size, 'number')]),
        el('td', {}, [inp('rl-' + r.id + '-gop', r.gop_seconds, 'number')])
      ]);
      // botones: guardar, auto de fila, borrar
      var bSave = el('button', { style: 'padding:4px 8px;font-size:.7rem' }, ['💾']);
      bSave.title = 'Guardar esta fila';
      bSave.addEventListener('click', function () { saveRule(r.id); });
      var bAuto = el('button', { class: 'go', style: 'padding:4px 8px;font-size:.7rem' }, ['★']);
      bAuto.title = 'Configuracion optima para esta fila';
      bAuto.addEventListener('click', function () { autoFillRow(r.id); });
      var bDel = el('button', { style: 'padding:4px 8px;font-size:.7rem;color:#f87171' }, ['✕']);
      bDel.title = 'Borrar esta regla';
      bDel.addEventListener('click', function () { deleteRule(r.id); });
      tr.appendChild(el('td', { style: 'white-space:nowrap' }, [bSave, bAuto, bDel]));
      tb.appendChild(tr);
    });

    root.appendChild(el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, ['Entrada res']), el('th', {}, ['in fps']),
        el('th', {}, ['Ancho']), el('th', {}, ['Alto']), el('th', {}, ['out fps']),
        el('th', {}, ['Codec (A)']), el('th', {}, ['Receta (A)']),
        el('th', {}, ['Dither (A)']), el('th', {}, ['Modo']),
        el('th', {}, ['Preset']), el('th', {}, ['CRF']), el('th', {}, ['Audio']),
        el('th', {}, ['hq_ls']), el('th', {}, ['hq_cs']), el('th', {}, ['hq_lt']), el('th', {}, ['hq_ct']),
        el('th', {}, ['us_amt']), el('th', {}, ['us_msz']), el('th', {}, ['at_s']),
        el('th', {}, ['seg(s)']), el('th', {}, ['window']), el('th', {}, ['extra']), el('th', {}, ['GOP(s)']),
        el('th', {}, [''])
      ])]), tb
    ]));

    // nueva regla
    var bNew = el('button', { class: 'pri', style: 'margin-top:10px' }, ['+ Añadir regla']);
    bNew.addEventListener('click', function () {
      var id = 'r-' + Date.now().toString(36);
      post('/image/rules', {
        id: id, input: '720p', inFps: 30, outW: 3840, outH: 2160, outFps: 30,
        codec: 'hvc1', recipe: 'balanced', dither: 'ordered', mode: 'real'
      }).then(function (res) {
        logLine(res && res.ok ? ('regla ' + id + ' creada') : 'fallo al crear regla');
        load();
      });
    });
    root.appendChild(el('div', { class: 'row' }, [bNew]));

    // resultado del auto de la ultima fila pulsada
    if (S.autoRow && S.autoRow.ok) {
      var a = S.autoRow;
      var box = el('div', { class: 'decl' }, [
        el('div', { style: 'font-weight:700;color:#60a5fa;margin-bottom:6px' }, [
          (a.mode === 'emulado' ? 'EMULADO — ' : 'REAL — ') + 'ÓPTIMO para ' +
          a.input.band + (a.input.fps ? '@' + a.input.fps : '') +
          ' → ' + a.output.width + 'x' + a.output.height + '  (' + a.areaRatio + 'x area)'
        ]),
        el('div', { style: 'font-size:.72rem;color:#94a3b8;margin-top:2px' }, [a.modeMeaning || ''])
      ]);
      ['codec', 'recipe', 'outFps', 'dither'].forEach(function (k) {
        var f = a.fields[k];
        box.appendChild(el('div', { style: 'font-size:.74rem;margin-top:3px' }, [
          k + ' = ' + String(f.value) + (f.op ? ' (' + f.op + ')' : '') + '  — ' + f.reason
        ]));
      });
      if (a.hostCost) {
        box.appendChild(el('div', { style: 'font-size:.74rem;margin-top:5px;color:' +
          (a.hostCost.viable ? '#6ee7b7' : '#fca5a5') }, [
          'coste ' + a.hostCost.relative + 'x → ' + a.hostCost.estimatedRatio +
          'x tiempo real en este host' + (a.hostCost.viable ? '' : ' (NO VIABLE)')
        ]));
      }
      box.appendChild(el('div', { style: 'font-size:.7rem;color:#94a3b8;margin-top:4px' }, [
        'Los valores de arriba son el ÓPTIMO para esta combinación. Todos siguen editables.'
      ]));
      (a.warnings || []).forEach(function (w) { box.appendChild(warn('AVISO: ' + w, '#f59e0b')); });
      (a.impossible || []).forEach(function (i) { box.appendChild(warn('IMPOSIBLE: ' + i)); });
      root.appendChild(box);
    }
  }

  function ruleVal(id, k) {
    var e = document.getElementById('rl-' + id + '-' + k);
    return e ? e.value : '';
  }

  function saveRule(id) {
    post('/image/rules', {
      id: id,
      input: ruleVal(id, 'input'),
      inFps: Number(ruleVal(id, 'inFps')) || 0,
      outW: Number(ruleVal(id, 'outW')),
      outH: Number(ruleVal(id, 'outH')),
      outFps: Number(ruleVal(id, 'outFps')) || 0,
      codec: ruleVal(id, 'codec'),
      recipe: ruleVal(id, 'recipe'),
      dither: ruleVal(id, 'dither'),
      mode: ruleVal(id, 'mode'),
      preset: ruleVal(id, 'preset'),
      crf: Number(ruleVal(id, 'crf')),
      audio: ruleVal(id, 'audio'),
      hqdn3d: {
        luma_spatial: Number(ruleVal(id, 'hqls')), chroma_spatial: Number(ruleVal(id, 'hqcs')),
        luma_tmp: Number(ruleVal(id, 'hqlt')), chroma_tmp: Number(ruleVal(id, 'hqct'))
      },
      unsharp: { luma_amount: Number(ruleVal(id, 'usam')), luma_msize: Number(ruleVal(id, 'usms')) },
      atadenoise: { s: Number(ruleVal(id, 'ats')) },
      seg_duration: Number(ruleVal(id, 'seg')), window_size: Number(ruleVal(id, 'win')),
      extra_window_size: Number(ruleVal(id, 'exw')), gop_seconds: Number(ruleVal(id, 'gop'))
    }).then(function (r) {
      logLine(r && r.ok ? ('regla ' + id + ' guardada') : ('fallo: ' + String((r && r.errors) || '?')));
      load();
    });
  }

  function autoFillRow(id) {
    var w = Number(ruleVal(id, 'outW')) || 3840;
    var h = Number(ruleVal(id, 'outH')) || 2160;
    var band = ruleVal(id, 'input') || '720p';
    var BANDS = { '480p': [854, 480], '576p': [1024, 576], '720p': [1280, 720],
                  '1080p': [1920, 1080], '1440p': [2560, 1440], '4K': [3840, 2160], '8K': [7680, 4320] };
    var bi = BANDS[band] || [1280, 720];
    post('/image/rules/auto', {
      inW: bi[0], inH: bi[1], inFps: Number(ruleVal(id, 'inFps')) || 0,
      outW: w, outH: h, player: S.build.player,
      mode: ruleVal(id, 'mode') || 'real'
    }).then(function (r) {
      S.autoRow = r;
      if (!r.ok) { logLine('auto fallo: ' + r.error); render(document.getElementById('ape-image-panel')); return; }
      // se rellenan los campos con la sugerencia, SIN guardar: el operador decide
      var setv = function (k, v) {
        var e = document.getElementById('rl-' + id + '-' + k);
        if (e) e.value = v;
      };
      setv('codec', r.fields.codec.value);
      setv('recipe', r.fields.recipe.value);
      setv('dither', r.fields.dither.value);
      if (r.fields.outFps.value && r.fields.outFps.value !== 'preserve') setv('outFps', r.fields.outFps.value);
      logLine('auto aplicado a ' + id + ' (sin guardar)');
      render(document.getElementById('ape-image-panel'));
    });
  }

  function deleteRule(id) {
    api('/image/rules/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
      logLine('regla ' + id + ' borrada');
      load();
    }).catch(function (e) { logLine('fallo al borrar: ' + e.message); });
  }

  /* ── CASCADA DE CODECS + FALLBACK ARMABLE ─────────────────────────────── */

  function cascadeSection(root) {
    var cas = S.cascade;
    if (!cas || !cas.tiers) return;
    root.appendChild(sec('🧬 Cascada de codecs — ' + cas.count + ' tiers con serial RFC 6381', '#22d3ee'));

    // selector de tier + boton de fallback
    var tierOpts = cas.tiers.map(function (t) {
      return { id: String(t.tier), label: 'T' + t.tier + '  ' + t.hvc1 + '  (' + t.role.slice(0, 26) + ')' };
    });
    root.appendChild(el('div', { class: 'grid' }, [
      fld('Tier / serial', sel('aip-c-tier', tierOpts, S.build.tier || '5')),
      fld('Cadena a mano (tiers, coma)', inp('aip-c-chain', S.build.chain || '', 'text'))
    ]));

    var bFb = el('button', { class: 'go', id: 'aip-fallback' }, ['🔀 Resolver fallback']);
    bFb.addEventListener('click', doFallback);
    root.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [bFb]));

    // tabla de la cascada
    var tb = el('tbody', {});
    cas.tiers.forEach(function (t) {
      tb.appendChild(el('tr', {}, [
        el('td', { style: 'font-weight:600' }, ['T' + t.tier]),
        el('td', { style: 'font-family:ui-monospace,monospace;font-size:.72rem' }, [t.hvc1]),
        el('td', { style: 'font-size:.7rem;color:#94a3b8' }, [t.level]),
        el('td', { style: 'font-size:.7rem' }, [t.maxW + 'x' + t.maxH + '@' + t.maxFps]),
        el('td', { style: 'font-size:.68rem;color:#94a3b8' }, [t.role])
      ]));
    });
    root.appendChild(el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, ['Tier']), el('th', {}, ['Serial hvc1']), el('th', {}, ['Nivel']),
        el('th', {}, ['Capacidad']), el('th', {}, ['Rol'])
      ])]), tb
    ]));
    root.appendChild(el('div', { class: 'stat', style: 'margin-top:6px' }, [cas.goldenRule || '']));

    // resultado del fallback
    if (S.fallback && S.fallback.ok) {
      var f = S.fallback;
      var r = f.chosen
        ? ('ELEGIDO tier ' + f.chosen.tier + ' → ' + f.chosen.serial + ' (nivel ' + f.chosen.level + ')')
        : ('NINGÚN TIER → ' + (f.fallbackToAvc ? f.fallbackToAvc.serial : '?'));
      var box = el('div', { class: 'decl' }, [
        el('div', { style: 'font-weight:700;color:#60a5fa;margin-bottom:6px' }, ['RESOLUCIÓN DEL FALLBACK']),
        el('div', {}, [f.player.label + ' · target ' + f.target.label +
          ' ' + f.target.w + 'x' + f.target.h + ' @ ' + f.fps + 'fps']),
        el('div', { style: 'margin-top:6px' }, [r]),
        el('div', { style: 'margin-top:6px;font-size:.72rem;color:#94a3b8' }, [
          'saltados ' + (f.skipped || 0) + ' de ' + (f.trace ? f.trace.length : 0)
        ])
      ]);
      if (f.chosen) {
        box.appendChild(el('div', { style: 'margin-top:6px;display:flex;gap:6px;flex-wrap:wrap' }, [
          chip('KODIPROP ' + f.chosen.serialKodiprop, '#8b5cf6'),
          chip('STREAM-INF ' + f.chosen.serial, '#22d3ee')
        ]));
      }
      (f.trace || []).forEach(function (t) {
        if (t.verdict !== 'USADO') {
          box.appendChild(el('div', { style: 'font-size:.7rem;color:#f87171;margin-top:2px' }, [
            'T' + t.tier + ' saltado: ' + (t.reason || '')
          ]));
        }
      });
      root.appendChild(box);
    } else if (S.fallback) {
      root.appendChild(warn('fallback: ' + (S.fallback.error || 'error')));
    }
  }

  function doFallback() {
    var t = document.getElementById('aip-c-tier');
    var ch = document.getElementById('aip-c-chain');
    var payload = {
      player: S.build.player, target: S.build.target, fps: S.build.fps
    };
    var chainTxt = ch ? String(ch.value || '').trim() : '';
    if (chainTxt) {
      payload.tiers = chainTxt.split(',').map(function (x) { return Number(x.trim()); })
        .filter(function (n) { return Number.isFinite(n) && n > 0; });
    } else if (t && t.value) {
      payload.tier = Number(t.value);
    }
    post('/image/fallback', payload).then(function (r) {
      S.fallback = r;
      logLine('FALLBACK ' + (r.ok ? (r.chosen ? ('tier ' + r.chosen.tier) : 'AVC') : ('FALLO ' + r.error)));
      render(document.getElementById('ape-image-panel'));
    });
  }

  function matrixSection(root) {
    var m = S.matrix;
    if (!m || !m.rows) return;
    root.appendChild(sec('🎛️ Matriz editable — ' + m.count + ' perfiles · ' +
      Number(m.spaceSize).toLocaleString('es') + ' cálculos', '#22d3ee'));

    var tb = el('tbody', {});
    m.rows.forEach(function (r) {
      var tr = el('tr', {}, [
        el('td', { style: 'font-weight:600' }, [r.profile]),
        el('td', { style: 'font-size:.68rem;color:#94a3b8' }, [r.labDeclared || '—']),
        el('td', {}, [inp('mx-' + r.profile + '-outW', r.outW, 'number')]),
        el('td', {}, [inp('mx-' + r.profile + '-outH', r.outH, 'number')]),
        el('td', {}, [sel('mx-' + r.profile + '-scaleMode', (m.allowed && m.allowed.scaleMode) || [r.scaleMode], r.scaleMode)]),
        el('td', {}, [sel('mx-' + r.profile + '-dither', (m.allowed && m.allowed.dither) || [r.dither], r.dither)])
      ]);
      var b = el('button', {}, ['Guardar']);
      b.addEventListener('click', function () { saveMatrixRow(r.profile); });
      tr.appendChild(el('td', {}, [b]));
      tb.appendChild(tr);
    });

    root.appendChild(el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, ['Perfil']), el('th', {}, ['LAB']), el('th', {}, ['Ancho']),
        el('th', {}, ['Alto']), el('th', {}, ['Modo']), el('th', {}, ['Dither']), el('th', {}, [''])
      ])]),
      tb
    ]));
  }

  function saveMatrixRow(profile) {
    function g(k) { var e = document.getElementById('mx-' + profile + '-' + k); return e ? e.value : null; }
    post('/image/matrix', {
      profile: profile,
      patch: { outW: Number(g('outW')), outH: Number(g('outH')), scaleMode: g('scaleMode'), dither: g('dither') }
    }).then(function (r) {
      logLine(r && r.ok ? (profile + ' guardado') : ('FALLO ' + profile + ': ' + String((r && r.errors) || ['?'])));
      load();
    });
  }

  /* ── 3. GOBIERNO VPS -> PLAYER ────────────────────────────────────────── */

  function governSection(root) {
    var gov = S.gov;
    root.appendChild(sec('🌐 Gobierno — el VPS dirige al player', '#a78bfa'));
    if (!gov) { root.appendChild(el('div', { class: 'stat' }, ['gobernanza no disponible'])); return; }

    var profileIds = S.matrix ? S.matrix.rows.map(function (x) { return x.profile; }) : ['P4.5'];

    root.appendChild(el('div', { class: 'grid' }, [
      fld('Perfil por defecto (todos los canales)',
        sel('aip-g-default', profileIds.map(function (p) { return { id: p, label: p }; }), gov.defaultProfile)),
      fld('Motor del player',
        sel('aip-g-engine', ['ott', 'vlc', 'kodi', 'tivimate', 'apk'], 'ott'))
    ]));

    var bSet = el('button', { class: 'pri' }, ['Fijar perfil global']);
    bSet.addEventListener('click', function () {
      var e = document.getElementById('aip-g-default');
      if (!e) return;
      post('/image/governance', { defaultProfile: e.value }).then(function (r) {
        logLine(r && r.ok ? ('perfil global -> ' + e.value) : 'fallo al fijar perfil global');
        load();
      });
    });
    var bDl = el('button', { class: 'ok' }, ['⬇ Descargar lista para el motor']);
    bDl.addEventListener('click', function () {
      var e = document.getElementById('aip-g-engine');
      var eng = e ? e.value : 'ott';
      var a = document.createElement('a');
      a.href = S.base + '/image/lineup?engine=' + encodeURIComponent(eng);
      a.download = 'APE_' + eng.toUpperCase() + '_governed.m3u8';
      a.click();
      logLine('lista pedida para ' + eng);
    });
    root.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [bSet, bDl]));

    root.appendChild(el('div', { class: 'stat', style: 'margin-top:8px' }, [
      Number(gov.count).toLocaleString('es') + ' canales · perfil actual: ' + gov.defaultProfile +
      ' · motores: ' + Object.keys(gov.engines).join(', ')
    ]));
    if (gov.mechanism) root.appendChild(warn(gov.mechanism, '#a78bfa'));

    var tb = el('tbody', {});
    (gov.channels || []).slice(0, 12).forEach(function (c) {
      tb.appendChild(el('tr', {}, [
        el('td', {}, [c.channel]),
        el('td', { style: 'font-size:.7rem;color:#94a3b8' }, [String(c.name || '').slice(0, 30)]),
        el('td', {}, [c.profile]),
        el('td', { style: 'font-size:.7rem' }, [c.target || '—']),
        el('td', {}, [c.overridden ? chip('override', '#f59e0b') : ''])
      ]));
    });
    root.appendChild(el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, ['Canal']), el('th', {}, ['Nombre']), el('th', {}, ['Perfil']),
        el('th', {}, ['Salida']), el('th', {}, [''])
      ])]), tb
    ]));
  }

  /* ── 4. CAPACIDAD + ESTADO VIVO ───────────────────────────────────────── */

  function capacitySection(root) {
    var c = S.capacity;
    if (!c || !c.rows) return;
    root.appendChild(sec('📊 Capacidad medida de este host', '#f59e0b'));
    var tb = el('tbody', {});
    c.rows.forEach(function (r) {
      var v = r.realtime_ratio >= 1.2 ? ['VIABLE', '#10b981']
        : (r.realtime_ratio >= 1.0 ? ['AL LÍMITE', '#f59e0b'] : ['NO VIABLE', '#ef4444']);
      tb.appendChild(el('tr', {}, [
        el('td', {}, [r.target]), el('td', {}, [r.fps + ' fps']), el('td', {}, [r.recipe]),
        el('td', {}, [r.seconds_for_20s + ' s']), el('td', {}, [r.realtime_ratio + 'x']),
        el('td', {}, [chip(v[0], v[1])])
      ]));
    });
    root.appendChild(el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, ['Destino']), el('th', {}, ['FPS']), el('th', {}, ['Receta']),
        el('th', {}, ['20 s →']), el('th', {}, ['Ritmo']), el('th', {}, ['Veredicto'])
      ])]), tb
    ]));
    if (c.verdict) root.appendChild(warn(c.verdict, '#10b981'));
  }

  function liveSection(root) {
    var L = S.live;
    root.appendChild(sec('📡 Estado vivo del módulo', '#22d3ee'));
    if (!L || !L.job) {
      root.appendChild(el('div', { class: 'stat' }, ['sin trabajo activo']));
    } else {
      var j = L.job, o = L.output_observed || {};
      root.appendChild(el('div', { class: 'grid' }, [
        fld('canal / variante', el('div', {}, [(j.channel || '-') + ' · ' + (j.variant || '-')])),
        fld('modo', el('div', { style: 'color:#6ee7b7' }, [j.mode || '-'])),
        fld('copia sin filtrar', el('div', { style: 'color:' + (j.copy === false ? '#10b981' : '#ef4444') },
          [j.copy === false ? 'NO (transcode)' : String(j.copy)])),
        fld('fuente', el('div', {}, [(j.source_width || '?') + 'x' + (j.source_height || '?')])),
        fld('observado', el('div', {}, [o.width ? (o.width + 'x' + o.height) : 'no sondado'])),
        fld('codec', el('div', {}, [o.codecString || o.codec || '-']))
      ]));
    }
    if (S.config) {
      var cfg = S.config;
      root.appendChild(el('div', { class: 'stat', style: 'margin-top:8px' }, [
        'perfil ' + (cfg.profile || '—') + ' · target ' + cfg.target + ' · receta ' + cfg.recipe +
        ' · ' + cfg.fps + ' fps · idle ' + (cfg.idle_stop_s != null ? cfg.idle_stop_s + ' s' : 'NO COMPUTADO')
      ]));
      if (S.effectiveFilter) {
        root.appendChild(el('div', { class: 'out', style: 'margin-top:6px' }, ['filtro efectivo: ' + S.effectiveFilter]));
      }
    }
    if (S.log.length) {
      root.appendChild(el('div', { class: 'out', style: 'margin-top:6px;max-height:140px' }, [S.log.join('\n')]));
    }
  }

  /* ── 5. EMPAQUETADO ───────────────────────────────────────────────────── */

  function packSection(root) {
    if (!S.config) return;
    var cfg = S.config;
    root.appendChild(sec('📦 Empaquetado (afecta al arranque del player)', '#8b5cf6'));
    root.appendChild(el('div', { class: 'grid' }, [
      fld('seg_duration (s)', inp('aip-seg', cfg.seg_duration != null ? cfg.seg_duration : 2, 'number')),
      fld('window_size', inp('aip-win', cfg.window_size != null ? cfg.window_size : 30, 'number')),
      fld('extra_window_size', inp('aip-exw', cfg.extra_window_size != null ? cfg.extra_window_size : 10, 'number')),
      fld('GOP (s)', inp('aip-gop', cfg.gop_seconds != null ? cfg.gop_seconds : 2, 'number'))
    ]));
    var b = el('button', { class: 'pri' }, ['Guardar empaquetado']);
    b.addEventListener('click', function () {
      function g(id, d) { var e = document.getElementById(id); return e ? Number(e.value) : d; }
      post('/image/config', {
        seg_duration: g('aip-seg', 2), window_size: g('aip-win', 30),
        extra_window_size: g('aip-exw', 10), gop_seconds: g('aip-gop', 2)
      }).then(function (r) {
        logLine(r && r.ok ? 'empaquetado guardado' : 'fallo al guardar empaquetado');
        load();
      });
    });
    root.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [b]));
  }

  /* ── RENDER ───────────────────────────────────────────────────────────── */

  function render(root) {
    if (!root) return;
    /* Las secciones reciben un NODO contenedor, no un array: antes se les pasaba
     * `nodes` y fallaban con "appendChild is not a function". Se construye en un
     * contenedor temporal y se vuelca al root con replaceChildren. */
    var box = el('div', {}, []);
    var nodes = box;
    nodes.appendChild(el('div', { class: 'head' }, [
      el('div', { style: 'display:flex;align-items:center;gap:12px' }, [
        el('span', { style: 'font-size:1.5rem' }, ['🖼️']),
        el('div', {}, [
          el('h3', {}, ['MÓDULO DE IMAGEN — JIT APE']),
          el('span', { class: 'sub' }, ['Matriz · Constructor · Gobierno → OTT/VLC/Kodi/TiviMate/APK'])
        ])
      ]),
      el('div', { class: 'stat' }, [S.busy ? 'trabajando…' : (S.lastError || 'Listo')])
    ]));

    buildSection(nodes);
    llmSection(nodes);
    rulesSection(nodes);
    cascadeSection(nodes);
    matrixSection(nodes);
    governSection(nodes);
    capacitySection(nodes);
    liveSection(nodes);

    // .children (no .childNodes): solo elementos, y funciona igual en navegador
    // y en el DOM minimo del test de integracion.
    var kids = [];
    for (var i = 0; i < box.children.length; i++) kids.push(box.children[i]);
    root.replaceChildren.apply(root, kids);
  }

  /* ── LOAD ─────────────────────────────────────────────────────────────── */

  function load() {
    var root = document.getElementById('ape-image-panel');
    if (!root) return;
    injectCss();
    root.className = 'aip';

    Promise.all([
      api('/image/config').catch(function () { return null; }),
      api('/image/capacity').catch(function () { return null; }),
      api('/image/state').catch(function () { return null; }),
      api('/image/matrix').catch(function () { return null; }),
      api('/image/catalog').catch(function () { return null; }),
      api('/image/governance').catch(function () { return null; }),
      api('/image/cascade').catch(function () { return null; }),
      api('/image/rules').catch(function () { return null; }),
      api('/image/llm-status').catch(function () { return null; }),
      api('/image/gestor/profiles').catch(function () { return null; })
    ]).then(function (r) {
      S.config = r[0] ? r[0].config : null;
      S.effectiveFilter = (r[0] && r[0].effective_filter) || '';
      S.capacity = r[1];
      S.live = r[2];
      S.matrix = r[3];
      S.catalog = r[4];
      S.gov = r[5];
      S.cascade = r[6];
      S.rules = r[7];
      S.llm = r[8];
      S.gestor = r[9];
      if (S.config && S.config.profile) S.build.profile = S.config.profile;
      render(root);
      if (S.build.profile) loadProfile(S.build.profile);
    }).catch(function (e) {
      S.lastError = String((e && e.message) || e);
      render(root);
    });
  }

  function startLive() {
    setInterval(function () {
      var r = document.getElementById('ape-image-panel');
      if (!r || !r.offsetParent) return;   // solo con la pestana visible
      if (S.busy) return;
      api('/image/state').then(function (j) {
        S.live = j;
        var r2 = document.getElementById('ape-image-panel');
        if (r2 && r2.offsetParent && !S.busy) render(r2);
      }).catch(function () { /* silencioso */ });
    }, 4000);
  }

  window.APE_IMAGE_PANEL = {
    mount: function (target) {
      var root = typeof target === 'string' ? document.querySelector(target) : target;
      if (!root) return false;
      injectCss();
      load();
      startLive();
      return true;
    },
    reload: load,
    getState: function () { return S; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
