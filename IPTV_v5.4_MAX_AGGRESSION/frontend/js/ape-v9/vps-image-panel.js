/**
 * APE VPS IMAGE MODULE PANEL — control remoto del módulo de imagen del JIT
 *
 * Mismo lenguaje visual que VPS OPS: tarjeta con gradiente, categorías por
 * color, botones con icono y salida en consola.
 *
 * Habla con el motor real:
 *   GET  /jit/image/config    -> config efectiva + defaults + capacidades
 *   POST /jit/image/config    -> aplica en caliente (persiste y reinicia el job)
 *   GET  /jit/image/capacity  -> capacidad MEDIDA con veredicto
 *
 * Regla que el panel hace visible y respeta: la capacidad medida manda.
 * FHD_1080 a 25 fps con cualquier receta es viable (1,37x-1,76x).
 * QHD_1440 a 25 fps está al límite (1,05x); 50 fps no cabe (0,75x).
 * Si se elige una combinación no viable, el panel lo dice con el número
 * medido ANTES de aplicar, y ofrece la que sí cabe.
 */
(function () {
  'use strict';

  var DEFAULT_BASE = 'https://iptv-ape.duckdns.org/jit';

  var S = {
    base: DEFAULT_BASE,
    config: null,
    capacity: null,
    effectiveFilter: '',
    busy: false,
    lastError: null,
    live: null,
    profiles: null,
    matrix: null,
    plan: null,
    log: []
  };

  // ── helpers DOM: sin marcado dinámico, todo nodo de texto ────────────────
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'style') n.setAttribute('style', attrs[k]);
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
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

  function logLine(t) {
    var ts = new Date().toISOString().slice(11, 19);
    S.log.push(ts + '  ' + t);
    if (S.log.length > 60) S.log.shift();
  }

  function verdict(r) {
    if (r === null || r === undefined) return { t: 'NO MEDIDO', c: '#94a3b8' };
    if (r >= 1.2) return { t: 'VIABLE', c: '#10b981' };
    if (r >= 1.0) return { t: 'AL LÍMITE', c: '#f59e0b' };
    return { t: 'NO VIABLE', c: '#ef4444' };
  }

  var CSS = [
    '.aip{background:linear-gradient(135deg,rgba(59,130,246,.08),rgba(139,92,246,.05));',
    'border:1px solid rgba(59,130,246,.25);border-radius:16px;padding:20px;margin:16px 0;',
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#e2e8f0}',
    '.aip h3{margin:0;font-size:1rem;color:#e2e8f0}',
    '.aip .sub{font-size:.75rem;color:#818cf8}',
    '.aip .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap}',
    '.aip .stat{font-size:.75rem;color:#64748b}',
    '.aip .sec{font-size:.72rem;text-transform:uppercase;margin:16px 0 8px;font-weight:700;letter-spacing:.5px}',
    '.aip .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}',
    '.aip .fld{display:flex;flex-direction:column;gap:4px}',
    '.aip .fld label{font-size:.72rem;color:#94a3b8}',
    '.aip .fld select,.aip .fld input{background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.25);',
    'border-radius:8px;color:#e2e8f0;padding:7px 9px;font-size:.8rem;font-family:inherit;width:100%;box-sizing:border-box}',
    '.aip .row{display:flex;flex-wrap:wrap;gap:8px}',
    '.aip button{padding:8px 14px;background:rgba(30,41,59,.7);border:1px solid rgba(148,163,184,.2);',
    'border-radius:10px;color:#e2e8f0;font-size:.78rem;cursor:pointer;transition:.2s;',
    'display:flex;align-items:center;gap:6px;font-family:inherit}',
    '.aip button:hover{background:rgba(51,65,85,.9)}',
    '.aip button.pri{background:rgba(59,130,246,.25);border-color:rgba(59,130,246,.5)}',
    '.aip button.ok{background:rgba(16,185,129,.2);border-color:rgba(16,185,129,.45)}',
    '.aip button:disabled{opacity:.45;cursor:not-allowed}',
    '.aip table{width:100%;border-collapse:collapse;font-size:.74rem}',
    '.aip th,.aip td{text-align:left;padding:5px 8px;border-bottom:1px solid rgba(148,163,184,.12)}',
    '.aip th{color:#94a3b8;font-weight:600}',
    '.aip .chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.68rem;font-weight:700}',
    '.aip .out{margin-top:14px;background:rgba(15,23,42,.85);border:1px solid rgba(148,163,184,.15);',
    'border-radius:12px;padding:12px;font-family:ui-monospace,monospace;font-size:.74rem;',
    'white-space:pre-wrap;max-height:320px;overflow:auto;line-height:1.55}',
    '.aip .warn{border-radius:10px;padding:10px;font-size:.76rem;line-height:1.55;margin-top:10px}'
  ].join('');

  function saveMatrixRow(profile) {
    var g = function (k) { var e = document.getElementById('mx-' + profile + '-' + k); return e ? e.value : null; };
    var patch = {
      outW: Number(g('outW')), outH: Number(g('outH')),
      scaleMode: g('scaleMode'), flags: g('flags'), dither: g('dither')
    };
    post('/image/matrix', { profile: profile, patch: patch }).then(function (r) {
      if (r && r.ok) { S.notice = profile + ' guardado'; reload(); }
      else { S.notice = 'ERROR: ' + ((r && r.errors) || ['fallo']).join('; '); render(document.getElementById('ape-image-panel')); }
    });
  }

  function runPlan() {
    var p = document.getElementById('mx-test-profile');
    var w = document.getElementById('mx-test-w');
    var h = document.getElementById('mx-test-h');
    if (!p || !w || !h) return;
    post('/image/plan', { profile: p.value, input: { width: Number(w.value), height: Number(h.value) } })
      .then(function (r) { S.plan = r; render(document.getElementById('ape-image-panel')); });
  }

  function render(root) {
    var cfg = S.config || {};
    var cap = S.capacity;
    if (root.replaceChildren) root.replaceChildren();
    else while (root.firstChild) root.removeChild(root.firstChild);
    root.className = 'aip';

    root.appendChild(el('div', { class: 'head' }, [
      el('div', { style: 'display:flex;align-items:center;gap:12px' }, [
        el('span', { style: 'font-size:1.5rem' }, ['🖼️']),
        el('div', {}, [
          el('h3', {}, ['MÓDULO DE IMAGEN — JIT APE']),
          el('span', { class: 'sub' }, ['APK solicita → JIT filtra y codifica → APK reproduce'])
        ])
      ]),
      el('div', { class: 'stat' }, [S.busy ? 'Trabajando…' : (S.lastError ? 'Error' : 'Listo')])
    ]));

    root.appendChild(el('div', { class: 'sec', style: 'color:#f59e0b' }, ['📊 Capacidad medida de este host']));
    if (cap && cap.rows && cap.rows.length) {
      var tb = el('tbody', {});
      cap.rows.forEach(function (r) {
        var v = verdict(r.realtime_ratio);
        tb.appendChild(el('tr', {}, [
          el('td', {}, [r.target]),
          el('td', {}, [String(r.fps || '') + ' fps']),
          el('td', {}, [r.recipe]),
          el('td', {}, [r.seconds_for_20s + ' s']),
          el('td', {}, [r.realtime_ratio + 'x']),
          el('td', {}, [el('span', { class: 'chip', style: 'background:' + v.c + '22;color:' + v.c }, [v.t])])
        ]));
      });
      root.appendChild(el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, ['Destino']), el('th', {}, ['FPS']), el('th', {}, ['Receta']),
          el('th', {}, ['20 s →']), el('th', {}, ['Ritmo']), el('th', {}, ['Veredicto'])
        ])]),
        tb
      ]));
      if (cap.verdict) {
        var okCap = (cap.viable_combinations || []).length > 0;
        root.appendChild(el('div', {
          class: 'warn',
          style: 'background:' + (okCap ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)') + ';'
            + 'border:1px solid ' + (okCap ? 'rgba(16,185,129,.35)' : 'rgba(239,68,68,.35)') + ';'
            + 'color:' + (okCap ? '#6ee7b7' : '#fca5a5')
        }, [cap.verdict]));
      }
    } else {
      root.appendChild(el('div', { class: 'out' }, ['capacidad no disponible']));
    }

    // ── ESTADO VIVO del modulo ──
    root.appendChild(el('div', { class: 'sec', style: 'color:#22d3ee' }, ['📡 Estado vivo del módulo']));
    var L = S.live;
    if (L && L.job) {
      var J = L.job;
      var O = L.output_observed || {};
      root.appendChild(el('div', { class: 'grid' }, [
        el('div', { class: 'fld' }, [el('label', {}, ['canal / variante']),
          el('div', { style: 'font-size:.85rem' }, [String(J.channel) + ' · ' + String(J.variant)])]),
        el('div', { class: 'fld' }, [el('label', {}, ['modo']),
          el('div', { style: 'font-size:.85rem;color:#6ee7b7' }, [String(J.mode || '—')])]),
        el('div', { class: 'fld' }, [el('label', {}, ['copia sin filtrar']),
          el('div', { style: 'font-size:.85rem;color:' + (J.copy ? '#ef4444' : '#10b981') },
            [J.copy ? 'SÍ (-c:v copy)' : 'NO (transcode)']) ]),
        el('div', { class: 'fld' }, [el('label', {}, ['salida / fuente']),
          el('div', { style: 'font-size:.85rem' }, [String(J.output_width) + 'x' + String(J.output_height)
            + ' ← ' + String(J.source_width) + 'x' + String(J.source_height)])]),
        el('div', { class: 'fld' }, [el('label', {}, ['vivo desde']),
          el('div', { style: 'font-size:.85rem' }, [String(J.age_s) + ' s']) ]),
        el('div', { class: 'fld' }, [el('label', {}, ['segmentos / slot']),
          el('div', { style: 'font-size:.85rem' }, [String((L.files || {}).segments || 0)
            + ' · slot ' + String((L.engine || {}).slot)]) ])
      ]));
      if (O && Object.keys(O).length) {
        root.appendChild(el('div', { style: 'font-size:.74rem;color:#94a3b8;margin-top:8px' },
          ['observado por ffprobe: ' + JSON.stringify(O)]));
      }
    } else if (L) {
      root.appendChild(el('div', { class: 'out' }, ['sin trabajo activo · el motor arranca al pedir un canal']));
    } else {
      root.appendChild(el('div', { class: 'out' }, ['estado no consultado']));
    }

    // ── MATRIZ EDITABLE: entrada -> salida por perfil ──
    if (S.matrix && S.matrix.rows) {
      root.appendChild(el('div', { class: 'sec', style: 'color:#22d3ee' },
        ['🎛️ Matriz editable — entrada → salida (' + S.matrix.count + ' perfiles, ' +
         Number(S.matrix.spaceSize).toLocaleString('es') + ' calculos)']));

      var mtb = el('tbody', {});
      S.matrix.rows.forEach(function (r) {
        var row = el('tr', {}, [
          el('td', { style: 'font-weight:600' }, [r.profile]),
          el('td', { style: 'font-size:.7rem;color:#94a3b8' }, [r.labDeclared || '—'])
        ]);
        // outW / outH editables
        ['outW', 'outH'].forEach(function (k) {
          row.appendChild(el('td', {}, [inp('mx-' + r.profile + '-' + k, r[k], 'number')]));
        });
        ['scaleMode', 'flags', 'dither'].forEach(function (k) {
          var opts = (S.matrix.allowed && S.matrix.allowed[k]) || [r[k]];
          row.appendChild(el('td', {}, [sel('mx-' + r.profile + '-' + k, opts, r[k])]));
        });
        var btn = el('button', { class: 'btn', id: 'mx-save-' + r.profile }, ['Guardar']);
        btn.addEventListener('click', function () { saveMatrixRow(r.profile); });
        row.appendChild(el('td', {}, [btn]));
        mtb.appendChild(row);
      });
      root.appendChild(el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, ['Perfil']), el('th', {}, ['LAB']), el('th', {}, ['Ancho']),
          el('th', {}, ['Alto']), el('th', {}, ['Modo']), el('th', {}, ['Flags']),
          el('th', {}, ['Dither']), el('th', {}, [''])
        ])]),
        mtb
      ]));

      // probador de entrada -> salida
      var pr = el('div', { class: 'row', style: 'margin-top:10px' }, [
        el('span', { style: 'font-size:.75rem;color:#94a3b8' }, ['Probar:']),
        sel('mx-test-profile', S.matrix.rows.map(function (x) { return x.profile; }), 'P4.5'),
        inp('mx-test-w', 1280, 'number'),
        inp('mx-test-h', 720, 'number'),
        (function () {
          var b = el('button', { class: 'btn', id: 'mx-plan' }, ['Calcular plan']);
          b.addEventListener('click', function () { runPlan(); });
          return b;
        })()
      ]);
      root.appendChild(pr);

      if (S.plan) {
        var p = S.plan;
        if (p.ok) {
          root.appendChild(el('div', { class: 'out', style: 'margin-top:8px' }, [
            'entrada ' + p.input.width + 'x' + p.input.height + ' -> salida ' +
            p.output.width + 'x' + p.output.height +
            '  |  escalado ' + p.scaled.width + 'x' + p.scaled.height +
            '  |  bandas L' + p.pad.left + ' R' + p.pad.right + ' T' + p.pad.top + ' B' + p.pad.bottom +
            '  |  ' + p.metrics.areaRatio + 'x area  |  coste ' + p.metrics.relativeCost + 'x',
            el('div', { style: 'margin-top:4px;color:#7dd3fc;word-break:break-all;font-size:.72rem' }, [p.filter]),
            el('div', { style: 'margin-top:4px;color:#fbbf24;font-size:.72rem' }, [p.honesty])
          ]));
        } else {
          root.appendChild(el('div', { class: 'warn' }, ['plan: ' + (p.error || 'error')]));
        }
      }
    }

    // ── PERFILES DEL LAB (los 12) ──
    if (S.profiles && S.profiles.rows) {
      root.appendChild(el('div', { class: 'sec', style: 'color:#f472b6' },
        ['🧬 Perfiles del LAB (' + S.profiles.count + ') — declarado vs viable']));
      var ptb = el('tbody', {});
      S.profiles.rows.forEach(function (r) {
        var vc = r.measured_viable ? '#10b981' : '#ef4444';
        ptb.appendChild(el('tr', {}, [
          el('td', {}, [r.profile]),
          el('td', {}, [r.declared]),
          el('td', {}, [r.target]),
          el('td', {}, [el('span', { class: 'chip', style: 'background:' + vc + '22;color:' + vc },
            [r.measured_viable ? 'VIABLE' : 'NO VIABLE'])]),
          el('td', {}, [r.fallback_viable || '—']),
          el('td', { style: 'font-size:.7rem;color:#94a3b8' }, [r.note || ''])
        ]));
      });
      root.appendChild(el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, ['Perfil']), el('th', {}, ['LAB declara']), el('th', {}, ['Target']),
          el('th', {}, ['En este host']), el('th', {}, ['Alternativa']), el('th', {}, [''])
        ])]),
        ptb
      ]));
      if (S.profiles.measured_reality) {
        root.appendChild(el('div', {
          class: 'warn',
          style: 'background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);color:#fca5a5'
        }, [S.profiles.measured_reality]));
      }
    }

    root.appendChild(el('div', { class: 'sec', style: 'color:#3b82f6' }, ['🎯 Destino y receta']));
    function fld(label, node) { return el('div', { class: 'fld' }, [el('label', {}, [label]), node]); }
  function inp(id, val, type) {
    return el('input', { id: id, type: type || 'text', value: String(val == null ? '' : val) }, []);
  }
  // POST JSON al motor. Devuelve el JSON parseado o {ok:false}.
  function post(path, body) {
    return api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(function (e) { return { ok: false, error: String(e && e.message || e) }; });
  }
  function reload() { S.plan = null; load(); }
    function sel(id, opts, cur) {
      var s = el('select', { id: id });
      opts.forEach(function (o) {
        var op = el('option', { value: String(o) }, [String(o)]);
        if (String(o) === String(cur)) op.selected = true;
        s.appendChild(op);
      });
      return s;
    }
    root.appendChild(el('div', { class: 'grid' }, [
      fld('Perfil LAB', sel('aip-profile', ['', 'P0', 'P0.5', 'P1', 'P1.5', 'P2', 'P2.5', 'P3', 'P3.5', 'P4', 'P4.5', 'P5', 'P5.5'], cfg.profile)),
      fld('Destino', sel('aip-target', ['source', 'FHD_1080', 'QHD_1440', 'UHD_4K', 'DCI_2K'], cfg.target)),
      fld('Receta', sel('aip-recipe', ['none', 'light', 'balanced', 'temporal', 'custom'], cfg.recipe)),
      fld('FPS', sel('aip-fps', ['preserve', '25', '30', '50', '60'], cfg.fps)),
      fld('Preset x265', sel('aip-preset', ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'], cfg.preset)),
      fld('CRF', el('input', { id: 'aip-crf', type: 'number', min: '0', max: '51', value: cfg.crf })),
      fld('Audio', sel('aip-audio', ['preserve', 'aac', 'drop'], cfg.audio))
    ]));

    var h = cfg.hqdn3d || {}, u = cfg.unsharp || {}, a = cfg.atadenoise || {};
    root.appendChild(el('div', { class: 'sec', style: 'color:#10b981' }, ['⚙️ Parámetros de filtro (vivos)']));
    root.appendChild(el('div', { class: 'grid' }, [
      fld('hqdn3d luma_spatial', el('input', { id: 'aip-hq-ls', type: 'number', step: '0.05', min: '0', max: '20', value: h.luma_spatial })),
      fld('hqdn3d chroma_spatial', el('input', { id: 'aip-hq-cs', type: 'number', step: '0.05', min: '0', max: '20', value: h.chroma_spatial })),
      fld('hqdn3d luma_tmp', el('input', { id: 'aip-hq-lt', type: 'number', step: '0.05', min: '0', max: '20', value: h.luma_tmp })),
      fld('unsharp amount', el('input', { id: 'aip-us-am', type: 'number', step: '0.01', min: '-2', max: '5', value: u.luma_amount })),
      fld('unsharp msize (impar)', el('input', { id: 'aip-us-ms', type: 'number', step: '2', min: '3', max: '13', value: u.luma_msize })),
      fld('atadenoise s', el('input', { id: 'aip-at-s', type: 'number', step: '1', min: '0', max: '15', value: a.s }))
    ]));

    root.appendChild(el('div', { class: 'sec', style: 'color:#8b5cf6' }, ['📦 Empaquetado (afecta al arranque del player)']));
    root.appendChild(el('div', { class: 'grid' }, [
      fld('seg_duration (s)', el('input', { id: 'aip-seg', type: 'number', min: '1', max: '10', value: cfg.seg_duration })),
      fld('window_size', el('input', { id: 'aip-win', type: 'number', min: '3', max: '120', value: cfg.window_size })),
      fld('extra_window_size', el('input', { id: 'aip-exw', type: 'number', min: '0', max: '60', value: cfg.extra_window_size })),
      fld('GOP (s)', el('input', { id: 'aip-gop', type: 'number', min: '1', max: '10', value: cfg.gop_seconds }))
    ]));

    var bApply = el('button', { class: 'pri', id: 'aip-apply' }, ['▶ Aplicar al JIT']);
    var bRec = el('button', { class: 'ok', id: 'aip-rec' }, ['✅ Recomendada (FHD 25 fps)']);
    var bReload = el('button', { id: 'aip-reload' }, ['↻ Recargar']);
    var bDefaults = el('button', { id: 'aip-def' }, ['⟲ Defaults']);
    [bApply, bRec, bReload, bDefaults].forEach(function (b) { b.disabled = S.busy; });
    root.appendChild(el('div', { class: 'row', style: 'margin-top:14px' }, [bApply, bRec, bReload, bDefaults]));

    var out = el('div', { class: 'out', id: 'aip-out' });
    var lines = [];
    if (S.lastError) lines.push('ERROR: ' + S.lastError);
    if (S.effectiveFilter !== null && S.effectiveFilter !== undefined) {
      lines.push('filtro efectivo: ' + (S.effectiveFilter || '(sin filtros)'));
    }
    if (cfg.target !== undefined) {
      lines.push('perfil LAB: ' + (cfg.profile || '(ninguno)'));
      lines.push('config: target=' + cfg.target + '  recipe=' + cfg.recipe + '  fps=' + cfg.fps
        + '  codec=' + cfg.codec + '  preset=' + cfg.preset + '  crf=' + cfg.crf + '  audio=' + cfg.audio);
      lines.push('pack: seg=' + cfg.seg_duration + 's  window=' + cfg.window_size + '  extra=' + cfg.extra_window_size + '  gop=' + cfg.gop_seconds + 's');
    }
    if (S.log.length) { lines.push(''); lines = lines.concat(S.log.slice(-9)); }
    out.textContent = lines.length ? lines.join('\n') : 'sin datos todavía';
    root.appendChild(out);

    function collect() {
      return {
        profile: document.getElementById('aip-profile').value,
        target: document.getElementById('aip-target').value,
        recipe: document.getElementById('aip-recipe').value,
        fps: document.getElementById('aip-fps').value,
        preset: document.getElementById('aip-preset').value,
        crf: Number(document.getElementById('aip-crf').value),
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
    }

    function push(patch, note) {
      S.busy = true; S.lastError = null; render(root);
      api('/image/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      }).then(function (j) {
        S.config = j.config;
        S.effectiveFilter = j.effective_filter || '';
        S.busy = false;
        logLine('APLICADO ' + j.config.target + '/' + j.config.recipe + '/' + j.config.fps + 'fps'
          + (note ? ' (' + note + ')' : ''));
        render(root);
      }).catch(function (e) {
        S.busy = false; S.lastError = e.message; logLine('FALLO ' + e.message); render(root);
      });
    }

    bApply.addEventListener('click', function () {
      var p = collect();
      var row = null;
      if (S.capacity && S.capacity.rows) {
        var wantFps = p.fps === 'preserve' ? null : Number(p.fps);
        row = S.capacity.rows.filter(function (r) {
          return r.target === p.target && (wantFps === null || r.fps === wantFps);
        })[0] || null;
      }
      if (row && row.realtime_ratio < 1.2) {
        var ok = window.confirm(
          'El destino ' + p.target + ' a ' + row.fps + ' fps con receta ' + row.recipe
          + ' NO cumple el margen.\n\n'
          + 'Medido: ' + row.realtime_ratio + 'x tiempo real (se exige >=1,2x).\n'
          + '20 s de vídeo tardan ' + row.seconds_for_20s + ' s en este host.\n\n'
          + 'El JIT producirá más lento que la emisión y el player se quedará sin segmentos.\n\n'
          + '¿Aplicar igualmente?'
        );
        if (!ok) { logLine('CANCELADO por no viable'); render(root); return; }
      }
      push(p, 'manual');
    });

    bRec.addEventListener('click', function () {
      push({ target: 'FHD_1080', recipe: 'balanced', fps: '25', preset: 'ultrafast', crf: 20, audio: 'preserve' }, 'recomendada');
    });

    bReload.addEventListener('click', function () { load(); });

    bDefaults.addEventListener('click', function () {
      push({ target: 'source', recipe: 'none', fps: 'preserve' }, 'defaults');
    });
  }

  function load() {
    // NUNCA crear el div fuera de su sitio: el panel vive SOLO dentro de la
    // pestana Telemetria (#tab-telemetry). Si no existe, no se monta nada.
    // Antes habia un fallback que lo anadia al body y eso lo hacia visible
    // en todas las pestanas.
    var root = document.getElementById('ape-image-panel');
    if (!root) return;
    S.busy = true; S.lastError = null;
    render(root);
    Promise.all([
      api('/image/config'),
      api('/image/capacity').catch(function () { return null; }),
      api('/image/state').catch(function () { return null; }),
      api('/image/profiles').catch(function () { return null; }),
      api('/image/matrix').catch(function () { return null; })
    ]).then(function (r) {
      S.config = r[0].config;
      S.effectiveFilter = r[0].effective_filter || '';
      S.capacity = r[1];
      S.live = r[2];
      S.profiles = r[3];
      S.matrix = r[4];
      S.busy = false;
      logLine('estado cargado');
      render(root);
    }).catch(function (e) {
      S.busy = false; S.lastError = e.message; render(root);
    });
  }

  if (!document.getElementById('aip-css')) {
    var st = el('style', { id: 'aip-css' });
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // refresco del estado vivo: solo si el panel esta montado
  var liveTimer = null;
  function startLive() {
    if (liveTimer) return;
    liveTimer = setInterval(function () {
      var r0 = document.getElementById('ape-image-panel');
      if (!r0) return;
      if (S.busy) return;
      // Solo refrescar si la pestana Telemetria esta visible: no gastar
      // peticiones ni repintar un panel que el usuario no esta mirando.
      var r1 = document.getElementById('ape-image-panel');
      if (!r1 || !r1.offsetParent) return;
      api('/image/state').then(function (j) {
        S.live = j;
        var r2 = document.getElementById('ape-image-panel');
        if (r2 && !S.busy && r2.offsetParent) render(r2);
      }).catch(function () { /* silencioso: el polling no debe romper la UI */ });
    }, 3000);
  }

  window.APE_IMAGE_PANEL = {
    load: load,
    mount: function (sel) {
      var root = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!root) return false;
      root.id = 'ape-image-panel';
      load();
      startLive();
      return true;
    },
    setBase: function (b) { S.base = String(b).replace(/\/+$/, ''); load(); },
    getState: function () {
      return {
        config: S.config, capacity: S.capacity, effectiveFilter: S.effectiveFilter,
        error: S.lastError, log: S.log.slice()
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (document.getElementById('ape-image-panel')) load();
    });
  } else if (document.getElementById('ape-image-panel')) {
    load();
  }
})();
