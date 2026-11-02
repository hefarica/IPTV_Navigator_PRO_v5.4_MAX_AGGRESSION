/**
 * APE Generation + Outputs Panel
 * Isolation: only reads existing generators/options and calls their public APIs.
 * Does NOT edit profiles, auto-adjust, solver or generator internals.
 */
(function () {
  'use strict';
  if (window.__APE_GEN_OUTPUT_PANEL__) return;
  window.__APE_GEN_OUTPUT_PANEL__ = true;
  var $ = function (s) { return document.querySelector(s); };
  // Delta relativo por perfil, no un valor absoluto en Mbps.
  var DELTA_PCT = (function () {
    try {
      var v = Number(localStorage.getItem('ape_output_delta_pct'));
      return isFinite(v) && v >= 1 && v <= 90 ? v : 15;
    } catch (_) { return 15; }
  })();
  window.APE_OUTPUT_DELTA_PCT = DELTA_PCT;
  var VPS_BASE = (window.APE_VPS_BASE || 'https://iptv-ape.duckdns.org').replace(/\/+$/, '');
  var VPS_CONFIG_URL = VPS_BASE + '/prisma/api/ape-output-config.php';
  var JIT_BASE = (window.APE_JIT_BASE || 'https://iptv-ape.duckdns.org').replace(/\/+$/, '');
  var OUT_OPTS_KEY = 'ape_out_opts_v1';
  var _jitMap = new Map();
  var _jitLoading = null;

  function loadOutOpts() {
    try {
      var o = JSON.parse(localStorage.getItem(OUT_OPTS_KEY) || '{}');
      var hdr = String(o.hdr || 'auto').toLowerCase();
      if (hdr !== 'pq' && hdr !== 'sdr') hdr = 'auto';
      return { jit: o.jit === true, hdr: hdr };
    } catch (_) {
      return { jit: false, hdr: 'auto' };
    }
  }

  function saveOutOpts(jit, hdr) {
    try {
      localStorage.setItem(OUT_OPTS_KEY, JSON.stringify({
        jit: jit === true,
        hdr: (hdr === 'pq' || hdr === 'sdr') ? hdr : 'auto'
      }));
    } catch (_) { }
  }

  function currentOutOpts() {
    var oj = document.getElementById('ape-out-jit');
    var ohdr = document.getElementById('ape-out-hdr');
    var hdr = ohdr ? String(ohdr.value).toLowerCase() : 'auto';
    if (hdr !== 'pq' && hdr !== 'sdr') hdr = 'auto';
    return { jit: !!(oj && oj.checked), hdrMode: hdr };
  }

  async function ensureJitCatalog() {
    if (_jitMap.size > 0) return true;
    if (_jitLoading) return _jitLoading;

    _jitLoading = (async function () {
      try {
        var r = await fetch(JIT_BASE + '/jit/catalog.json', { cache: 'no-store' });
        if (!r.ok) throw new Error('catalog ' + r.status);
        var j = await r.json();
        var list = Array.isArray(j) ? j : (j.channels || []);
        var map = new Map();
        list.forEach(function (c) {
          if (c && c.id && c.hls) map.set(String(c.id), c.hls);
        });
        _jitMap = map;
        return map.size > 0;
      } catch (e) {
        _jitMap = new Map();
        return false;
      } finally {
        _jitLoading = null;
      }
    })();

    return _jitLoading;
  }

  function jitUrlForChannel(channel) {
    if (!_jitMap || !channel) return null;
    var id = String(
      channel.tvg_id || channel.tvgId || channel.tvgID || channel.id || ''
    ).trim();
    return _jitMap.get(id) || null;
  }

  window.APE_JIT_URL_FOR_CHANNEL = jitUrlForChannel;

  // Test seam: inert unless the harness opts in.
  if (window.__APE_OUTPUT_TEST__ === true) {
    window.APE_OUTPUT_TEST_HOOKS = {
      loadOutOpts: loadOutOpts,
      saveOutOpts: saveOutOpts,
      currentOutOpts: currentOutOpts,
      ensureJitCatalog: ensureJitCatalog,
      jitUrlForChannel: jitUrlForChannel,
      runDirect: runDirect
    };
  }

  function profileIds() {
    try {
      var c = window.APE_PROFILES_CONFIG;
      if (c && c.profiles && Object.keys(c.profiles).length) return Object.keys(c.profiles).sort();
    } catch (_) { }
    return ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
  }

  function normalizeDeltaArray(raw, fallback) {
    var out = {};
    var ids = profileIds();
    if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function (k) {
        var v = Math.round(Number(raw[k]));
        if (isFinite(v) && v >= 1 && v <= 90) out[k] = v;
      });
    }
    if (Object.keys(out).length === 0) {
      var b = Math.round(Number(fallback));
      if (!isFinite(b) || b < 1 || b > 90) b = 15;
      ids.forEach(function (id) { out[id] = b; });
    }
    ids.forEach(function (id) {
      if (!out[id]) out[id] = Number(fallback) >= 1 && Number(fallback) <= 90 ? Math.round(Number(fallback)) : 15;
    });
    return out;
  }

  function getDeltaArray(base) {
    if (window.APE_OUTPUT_DELTA_ARRAY && typeof window.APE_OUTPUT_DELTA_ARRAY === 'object') {
      return normalizeDeltaArray(window.APE_OUTPUT_DELTA_ARRAY, base);
    }
    try {
      var stored = JSON.parse(localStorage.getItem('ape_output_delta_array') || 'null');
      if (stored && typeof stored === 'object') return normalizeDeltaArray(stored, base);
    } catch (_) { }
    return normalizeDeltaArray(null, base);
  }

  function setDeltaArray(arr) {
    var n = normalizeDeltaArray(arr, DELTA_PCT);
    window.APE_OUTPUT_DELTA_ARRAY = n;
    try { localStorage.setItem('ape_output_delta_array', JSON.stringify(n)); } catch (_) { }
    return n;
  }

  // Proceso externo puede actualizar el array entre corridas:
  // window.APE_BUFFER_DELTA_API.set({P0:40,P1:38,...}); luego Generar VPS.
  window.APE_BUFFER_DELTA_API = {
    set: function (arr) { return setDeltaArray(arr); },
    get: function () { return getDeltaArray(currentDelta()); },
    profiles: profileIds
  };

  function currentDelta() {
    var di = document.getElementById('ape-delta-input');
    var v = di ? Number(di.value) : DELTA_PCT;
    if (!isFinite(v)) v = DELTA_PCT;
    v = Math.round(v);
    if (v < 1) v = 1;
    if (v > 90) v = 90;
    return v;
  }

  async function sendDeltaToVps(v) {
    var arr = getDeltaArray(v);
    var payload = {
      delta_pct: v,
      delta_array: arr,
      rule: 'IN >= OUT * (1 + delta)',
      source: 'generation-output-panel',
      generated_at: new Date().toISOString()
    };
    var lastErr = null;
    for (var attempt = 1; attempt <= 2; attempt++) {
      try {
        var r = await fetch(VPS_CONFIG_URL, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify(payload)
        });
        var txt = await r.text();
        var j = {};
        try { j = JSON.parse(txt); } catch (_) {
          throw new Error('respuesta_no_json:' + r.status + ':' + txt.slice(0, 90).replace(/\s+/g, ' '));
        }
        if (!r.ok || j.ok !== true) throw new Error(j.error || ('http_' + r.status));

        // Verificación real: leer de vuelta lo almacenado en el VPS.
        var g = await fetch(VPS_CONFIG_URL, {
          method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
          headers: { 'Accept': 'application/json' }
        });
        var gt = await g.text();
        var gj = {};
        try { gj = JSON.parse(gt); } catch (_) {
          throw new Error('verificacion_no_json:' + g.status + ':' + gt.slice(0, 90).replace(/\s+/g, ' '));
        }
        if (!g.ok || gj.ok !== true || !gj.delta_array) throw new Error(gj.error || 'sin_confirmacion_vps');
        var keys = Object.keys(arr);
        var mismatch = keys.filter(function (k) { return Number(gj.delta_array[k]) !== Number(arr[k]); });
        if (mismatch.length) throw new Error('vps_array_distinto:' + mismatch.join(','));
        return { ok: true, confirmed: true, post: j, readback: gj };
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await new Promise(function (res) { setTimeout(res, 350); });
      }
    }
    console.warn('[APE-OUT] delta VPS no confirmado:', lastErr && lastErr.message);
    return { ok: false, confirmed: false, error: lastErr && lastErr.message };
  }

  function applyDelta(notify) {
    var v = currentDelta();
    DELTA_PCT = v;
    window.APE_OUTPUT_DELTA_PCT = v;
    window.APE_BUFFER_DELTA_PCT = v;
    var arr = getDeltaArray(v);
    setDeltaArray(arr);
    try { localStorage.setItem('ape_output_delta_pct', String(v)); } catch (_) { }
    var di = document.getElementById('ape-delta-input');
    if (di) di.value = String(v);
    guard();
    if (notify) {
      status('Delta ' + v + '% aplicado; enviando al VPS…', '#38bdf8');
      sendDeltaToVps(v).then(function (res) {
        if (res && res.confirmed) status('Delta ' + v + '% guardado y leído de vuelta en VPS', '#22c55e');
        else status('Delta ' + v + '% local; VPS: ' + ((res && res.error) || 'sin respuesta'), '#f59e0b');
      });
    }
    return v;
  }

  function toast(msg, type) {
    try {
      if (window.app && typeof window.app.showToast === 'function') return window.app.showToast(msg, type || 'info');
    } catch (_) { }
    console[type === 'error' ? 'error' : 'log']('[APE-OUT]', msg);
  }

  function status(msg, color) {
    var el = $('#ape-gen-status');
    if (el) { el.textContent = msg; el.style.color = color || '#94a3b8'; }
  }

  function selectedFormat() {
    var r = document.querySelector('input[name="ape-out-format"]:checked');
    return r ? r.value : 'm3u8';
  }

  function formatGuard() {
    var f = selectedFormat();
    if (f === 'mpd') {
      toast('DASH/MPD: se descargará el MPD real del canal JIT activo.', 'info');
      status('DASH/MPD: preparando descarga del canal JIT activo', '#38bdf8');
      return true;
    }
    if (f === 'hybrid') {
      toast('Se generará la lista HLS; el manifiesto DASH se sirve desde JIT.', 'info');
      status('HÍBRIDA: HLS descargable + DASH servido por JIT', '#a855f7');
    }
    return true;
  }

  async function downloadActiveJitMpd() {
    var base = 'https://iptv-ape.duckdns.org';
    status('DASH/MPD: consultando canal JIT activo…', '#38bdf8');
    var catRes = await fetch(base + '/jit/catalog.json', { cache: 'no-store' });
    if (!catRes.ok) throw new Error('catálogo JIT HTTP ' + catRes.status);
    var cat = await catRes.json();
    var list = Array.isArray(cat) ? cat : (cat.channels || cat.items || []);
    var active = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].active === true) { active = list[i]; break; }
    }
    if (!active) {
      throw new Error('no hay canal JIT activo; abre primero su salida HLS/JIT');
    }
    var dash = active.dash || (base + '/jit/live/' + encodeURIComponent(active.id) + '/manifest.mpd');
    var r = await fetch(dash, { cache: 'no-store' });
    if (!r.ok) throw new Error('MPD HTTP ' + r.status);
    var text = await r.text();
    if (text.indexOf('<MPD') === -1) throw new Error('el JIT no devolvió un MPD válido');
    var blob = new Blob([text], { type: 'application/dash+xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'APE_' + active.id + '_manifest.mpd';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    status('DASH/MPD descargado · canal JIT ' + active.id, '#22c55e');
    return true;
  }

  function activeBitrate() {
    try {
      var cfg = window.APE_PROFILES_CONFIG;
      if (!cfg || !cfg.profiles) return 0;
      var id = cfg.activeProfileId || 'P3';
      var p = cfg.profiles[id];
      return Number(p && p.settings && p.settings.bitrate) || 0;
    } catch (_) { return 0; }
  }

  function inputMbps() {
    try {
      var s = window.APE_BW && typeof window.APE_BW.snapshot === 'function' ? window.APE_BW.snapshot() : null;
      return s && Number(s.mbps) > 0 ? Number(s.mbps) : 0;
    } catch (_) { return 0; }
  }

  function guard() {
    var inM = inputMbps(), outM = activeBitrate();
    var has = inM > 0 && outM > 0;
    var ok = has && inM >= outM * (1 + DELTA_PCT / 100);
    var b = $('#ape-buf-state');
    if (b) {
      b.textContent = has ? (ok ? 'BUFFER OK' : 'BUFFER RIESGO') : 'SIN DATO';
      b.style.color = has ? (ok ? '#22c55e' : '#ef4444') : '#f59e0b';
    }
    return { inM: inM, outM: outM, has: has, ok: ok };
  }

  function checkGeneration() {
    var g = guard();
    if (!g.has) {
      toast('Sin medición de entrada: se permite generar, pero no se puede validar el buffer.', 'warning');
      return true;
    }
    if (!g.ok) {
      toast('Buffer insuficiente para el perfil activo con delta ' + DELTA_PCT + '%.', 'error');
      status('BLOQUEADO: el perfil activo no cumple el delta ' + DELTA_PCT + '%', '#ef4444');
      return false;
    }
    return true;
  }

  async function runVps() {
    var d = applyDelta(false);
    if (!checkGeneration() || !formatGuard()) return;
    if (selectedFormat() === 'mpd') {
      try { await downloadActiveJitMpd(); }
      catch (e) { status('DASH/MPD: ' + e.message, '#ef4444'); toast('DASH/MPD: ' + e.message, 'error'); }
      return;
    }
    try {
      status('Generando VPS con delta ' + d + '%…', '#38bdf8');
      sendDeltaToVps(d);
      await window.APEGenerationController.prepublishAndGenerateDual({ buffer_delta_pct: d, buffer_delta_array: getDeltaArray(d) });
      status('VPS completado · delta ' + d + '% (array por perfil)', '#22c55e');
    } catch (e) { status('VPS falló: ' + e.message, '#ef4444'); toast('VPS falló: ' + e.message, 'error'); }
  }

  async function runDirect() {
    var d = applyDelta(false);
    if (!checkGeneration() || !formatGuard()) return;
    if (selectedFormat() === 'mpd') {
      try { await downloadActiveJitMpd(); }
      catch (e) { status('DASH/MPD: ' + e.message, '#ef4444'); toast('DASH/MPD: ' + e.message, 'error'); }
      return;
    }
    var out = currentOutOpts();
    if (out.jit) {
      var jitOk = await ensureJitCatalog();
      if (!jitOk) {
        out.jit = false;
        toast('JIT no disponible: fallback a DIRECTO', 'warning');
      }
    }
    var prev = {
      direct: window.APE_DIRECT_MODE,
      jit: window.APE_USE_JIT,
      hdr: window.APE_HDR_MODE
    };
    try {
      status('Generando DIRECTO con delta ' + d + '%…', '#38bdf8');
      sendDeltaToVps(d);
      await window.APEGenerationController.prepublishAndGenerate({
        buffer_delta_pct: d,
        buffer_delta_array: getDeltaArray(d),
        jit: out.jit,
        hdrMode: out.hdrMode
      });
      status('DIRECTO completado · delta ' + d + '% (array por perfil)', '#22c55e');
    } catch (e) {
      status('DIRECTO falló: ' + e.message, '#ef4444');
      toast('DIRECTO falló: ' + e.message, 'error');
    } finally {
      window.APE_DIRECT_MODE = prev.direct;
      window.APE_USE_JIT = prev.jit;
      window.APE_HDR_MODE = prev.hdr;
    }
  }

  // AMBAS = UNA lista híbrida: URI de canal en VPS y segmentos directos del
  // proveedor (comprobado en APE_LISTA_..._CDN: playlist VPS -> media playlist
  // con segmentos en host del proveedor). Se usa el generador CDN existente.
  async function runBoth() {
    var d = applyDelta(false);
    if (!checkGeneration() || !formatGuard()) return;
    if (selectedFormat() === 'mpd') {
      try { await downloadActiveJitMpd(); }
      catch (e) { status('DASH/MPD: ' + e.message, '#ef4444'); toast('DASH/MPD: ' + e.message, 'error'); }
      return;
    }
    try {
      status('Generando AMBAS (URI VPS + vídeo directo) · delta ' + d + '%…', '#38bdf8');
      sendDeltaToVps(d);
      await window.APEGenerationController.prepublishAndGenerateDual({ buffer_delta_pct: d, buffer_delta_array: getDeltaArray(d) });
      status('AMBAS completado · delta ' + d + '% (array por perfil)', '#22c55e');
    } catch (e) { status('AMBAS falló: ' + e.message, '#ef4444'); toast('AMBAS falló: ' + e.message, 'error'); }
  }

  function bindOption(id, cardId) {
    var input = document.getElementById(id);
    var card = document.getElementById(cardId);
    if (!input || !card) return;
    function paint() {
      card.style.borderColor = input.checked ? 'rgba(34,197,94,.65)' : 'rgba(148,163,184,.25)';
      var dot = card.querySelector('[data-ape-opt-dot]');
      if (dot) dot.textContent = input.checked ? '✓' : '○';
    }
    input.addEventListener('change', paint);
    card.addEventListener('click', function (e) {
      if (e.target.tagName === 'INPUT') return;
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      paint();
    });
    paint();
  }

  function modeText() {
    var p = document.getElementById('publicationMode');
    var v = p ? p.value : (window.APE_PUBLICATION_MODE || 'balanced_95');
    if (v === 'strict_terminal') return 'Strict Terminal · >99% 200';
    if (v === 'diagnostic') return 'Diagnostic · auditoría';
    return 'Balanced 95 · >95% playback';
  }

  function render() {
    var tab = $('#tab-export');
    if (!tab || $('#ape-gen-output-panel')) return;
    var panel = document.createElement('section');
    panel.id = 'ape-gen-output-panel';
    panel.style.cssText = 'margin:0 0 14px;padding:18px;border:1px solid rgba(56,189,248,.46);border-radius:16px;background:linear-gradient(135deg,rgba(14,165,233,.10),rgba(15,23,42,.48));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 12px 40px rgba(0,0,0,.28);';
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
      '<div><div style="font-size:1.05rem;font-weight:900;color:#7dd3fc;">⚙️ OPTIMIZACIÓN Y SALIDAS</div>' +
      '<div style="font-size:.8rem;color:#94a3b8;margin-top:3px;">Cada tarjeta genera su lista con el generador que le corresponde. Los perfiles no se tocan aquí.</div></div>' +
      '<div id="ape-gen-status" style="font-size:.8rem;color:#94a3b8;font-weight:700;">listo</div></div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:10px;padding:8px 10px;border-radius:9px;background:rgba(2,6,23,.28);border:1px solid rgba(148,163,184,.22);font-size:.82rem;color:#cbd5e1;">' +
      '<strong style="color:#7dd3fc;">Salidas:</strong>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-sel-vps" checked style="accent-color:#0ea5e9;"> VPS</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-sel-direct" style="accent-color:#a855f7;"> DIRECTO</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-sel-both" style="accent-color:#22d3ee;"> AMBAS</label>' +
      '<span id="ape-sel-state" style="color:#94a3b8;font-size:.74rem;">VPS seleccionado</span>' +
      '</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:8px;padding:8px 10px;border-radius:9px;background:rgba(2,6,23,.28);border:1px solid rgba(148,163,184,.22);font-size:.82rem;color:#cbd5e1;">' +
      '<strong style="color:#86efac;">SALIDAS:</strong>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-out-hls" checked style="accent-color:#22c55e;"> HLS</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-out-dash" style="accent-color:#38bdf8;"> DASH</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-out-hybrid" style="accent-color:#a855f7;"> HÍBRIDA HLS+DASH</label>' +
      '<label style="cursor:pointer;" title="Usar rutas /jit/live/ del catálogo JIT"><input type="checkbox" id="ape-out-jit" style="accent-color:#f59e0b;"> JIT</label>' +
      '<label style="cursor:pointer;" title="Modo HDR de salida">HDR <select id="ape-out-hdr" style="accent-color:#ef4444;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:2px 4px;font-size:.78rem;">' +
      '<option value="auto">Auto</option><option value="pq">PQ</option><option value="sdr">SDR</option></select></label>' +
      '</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:8px;padding:8px 10px;border-radius:9px;background:rgba(2,6,23,.28);border:1px solid rgba(148,163,184,.22);font-size:.82rem;color:#cbd5e1;">' +
      '<strong style="color:#fbbf24;">FORMATO:</strong>' +
      '<label style="cursor:pointer;"><input type="radio" name="ape-out-format" value="m3u8" checked style="accent-color:#22c55e;"> .M3U8</label>' +
      '<label style="cursor:pointer;"><input type="radio" name="ape-out-format" value="mpd" style="accent-color:#38bdf8;"> .MPD</label>' +
      '<label style="cursor:pointer;"><input type="radio" name="ape-out-format" value="hybrid" style="accent-color:#a855f7;"> HÍBRIDA</label>' +
      '<span id="ape-out-matrix-state" style="color:#94a3b8;font-size:.74rem;">HLS · .M3U8</span>' +
      '<span style="font-size:.82rem;color:#64748b;flex-basis:100%;">.M3U8 genera la lista HLS. .MPD descarga el manifiesto DASH del canal JIT activo; no se fabrica un MPD falso.</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:9px;margin-top:12px;">' +
      // VPS
      '<div style="background:rgba(2,6,23,.38);border:1px solid rgba(14,165,233,.45);border-radius:11px;padding:11px;">' +
      '<div style="font-weight:800;color:#7dd3fc;font-size:1.05rem;">VPS · Lista CDN</div>' +
      '<div style="font-size:.8rem;color:#94a3b8;margin:4px 0 7px;">prepublishAndGenerateDual() · _CDN.m3u8</div>' +
      '<button data-ape-run="vps" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border:0;border-radius:7px;padding:7px 12px;font-size:.82rem;font-weight:800;cursor:pointer;">Generar VPS</button>' +
      '<span style="font-size:.84rem;color:#64748b;margin-left:7px;">VPS + metadata</span></div>' +
      // DIRECTO
      '<div style="background:rgba(2,6,23,.38);border:1px solid rgba(168,85,247,.45);border-radius:11px;padding:11px;">' +
      '<div style="font-weight:800;color:#c4b5fd;font-size:1.05rem;">DIRECTO · Lista limpia</div>' +
      '<div style="font-size:.8rem;color:#94a3b8;margin:4px 0 7px;">prepublishAndGenerate() · URLs del proveedor</div>' +
      '<button data-ape-run="direct" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:0;border-radius:7px;padding:7px 12px;font-size:.82rem;font-weight:800;cursor:pointer;">Generar DIRECTO</button>' +
      '<span style="font-size:.84rem;color:#64748b;margin-left:7px;">sin VPS</span></div>' +
      // AMBAS
      '<div style="background:rgba(2,6,23,.38);border:1px solid rgba(34,211,238,.45);border-radius:11px;padding:11px;">' +
      '<div style="font-weight:800;color:#67e8f9;font-size:1.05rem;">AMBAS · lista híbrida</div>' +
      '<div style="font-size:.8rem;color:#94a3b8;margin:4px 0 7px;">URI del canal en VPS · segmentos directos del proveedor</div>' +
      '<button data-ape-run="both" style="background:linear-gradient(135deg,#0891b2,#22d3ee);color:#06240f;border:0;border-radius:7px;padding:7px 12px;font-size:.82rem;font-weight:800;cursor:pointer;">Generar AMBAS</button>' +
      '<span style="font-size:.84rem;color:#64748b;margin-left:7px;">una sola lista</span></div>' +
      '</div>' +
      // Options
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px;margin-top:9px;">' +
      '<div id="ape-opt-pro" style="background:rgba(2,6,23,.32);border:1px solid rgba(148,163,184,.25);border-radius:9px;padding:9px;cursor:pointer;font-size:.82rem;color:#e2e8f0;"><b><span data-ape-opt-dot>○</span> Pro Streaming</b><div style="color:#64748b;font-size:.84rem;margin-top:2px;">buffer agresivo, cache, reconnect</div></div>' +
      '<div id="ape-opt-ott" style="background:rgba(2,6,23,.32);border:1px solid rgba(148,163,184,.25);border-radius:9px;padding:9px;cursor:pointer;font-size:.82rem;color:#e2e8f0;"><b><span data-ape-opt-dot>○</span> OTT Navigator</b><div style="color:#64748b;font-size:.84rem;margin-top:2px;">UA OTT, catchup, headers VLC</div></div>' +
      '<div id="ape-opt-hdr" style="background:rgba(2,6,23,.32);border:1px solid rgba(148,163,184,.25);border-radius:9px;padding:9px;cursor:pointer;font-size:.82rem;color:#e2e8f0;"><b><span data-ape-opt-dot>○</span> Incluir HTTP Headers</b><div style="color:#64748b;font-size:.84rem;margin-top:2px;">#EXTHTTP / #EXTVLCOPT</div></div>' +
      '</div>' +
      // Buffer + mode
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;padding:7px 9px;border-radius:8px;background:rgba(2,6,23,.24);border:1px solid rgba(148,163,184,.18);font-size:.74rem;color:#94a3b8;">' +
      '<strong style="color:#67e8f9;">JIT:</strong>' +
      '<a href="https://iptv-ape.duckdns.org/jit/playlist.m3u8" target="_blank" rel="noopener" style="color:#7dd3fc;">lista HLS</a>' +
      '<a href="https://iptv-ape.duckdns.org/jit/live/1174213/manifest.mpd" target="_blank" rel="noopener" style="color:#38bdf8;">DASH 4K</a>' +
      '<a href="https://iptv-ape.duckdns.org/jit/live/3/manifest.mpd" target="_blank" rel="noopener" style="color:#38bdf8;">DASH 1080</a>' +
      '<a href="https://iptv-ape.duckdns.org/jit/catalog.json" target="_blank" rel="noopener" style="color:#fbbf24;">catálogo</a>' +
      '<a href="https://iptv-ape.duckdns.org/jit/capabilities.json" target="_blank" rel="noopener" style="color:#fbbf24;">capacidades</a>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:9px;margin-top:9px;">' +
      '<div style="background:rgba(2,6,23,.38);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:10px;">' +
      '<div style="font-size:.84rem;font-weight:800;color:#86efac;">CONDICIÓN DE BUFFER</div>' +
      '<div style="display:flex;align-items:center;gap:9px;font-size:1.05rem;color:#94a3b8;margin-top:7px;">' +
      '<label for="ape-delta-input" style="white-space:nowrap;">Delta por perfil</label>' +
      '<input id="ape-delta-input" type="number" min="1" max="90" step="1" value="' + DELTA_PCT + '" ' +
      'style="width:78px;padding:5px 7px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;font-size:1.05rem;font-weight:800;">' +
      '<span style="color:#e2e8f0;font-weight:800;">%</span>' +
      '<button id="ape-delta-apply" type="button" style="margin-left:5px;background:#0ea5e9;color:#fff;border:0;border-radius:6px;padding:6px 10px;font-size:.8rem;font-weight:800;cursor:pointer;">Aplicar</button>' +
      '</div>' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px;font-size:.8rem;">' +
      '<span style="color:#86efac;border:1px solid rgba(34,197,94,.45);border-radius:999px;padding:3px 8px;">ENTRADA EXTRA · descarga / prefetch / buffer</span>' +
      '<span style="color:#fca5a5;border:1px solid rgba(239,68,68,.4);border-radius:999px;padding:3px 8px;">SALIDA INTACTA · imagen / bitrate del proveedor</span>' +
      '</div>' +
      '<div style="font-size:.82rem;color:#94a3b8;margin-top:6px;">Entrada requerida ≥ salida solicitada × (1 + delta). La salida NO se reduce: es la que pide la reproducción/imagen; el margen se reserva en entrada.</div></div>' +
      '<div style="background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.25);border-radius:10px;padding:10px;font-size:.8rem;color:#94a3b8;">' +
      '<div style="font-weight:800;color:#e2e8f0;">MODO</div>' +
      '<select id="ape-gen-mode-select" style="margin-top:5px;width:100%;padding:5px 6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;font-size:.74rem;">' +
      '<option value="strict_terminal">Strict Terminal · &gt;99% 200</option>' +
      '<option value="balanced_95" selected>Balanced 95 · &gt;95% playback</option>' +
      '<option value="diagnostic">Diagnostic · auditoría</option>' +
      '</select><div id="ape-gen-mode" style="margin-top:3px;color:#c4b5fd;font-size:.82rem;">—</div></div>' +
      '</div>';
    tab.insertBefore(panel, tab.firstChild);

    panel.querySelectorAll('[data-ape-run]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-ape-run');
        if (k === 'vps') runVps();
        else if (k === 'direct') runDirect();
        else runBoth();
      });
    });
    bindOption('proStreamingOptimized', 'ape-opt-pro');
    bindOption('ottNavOptimizedGen', 'ape-opt-ott');
    bindOption('includeHttpHeaders', 'ape-opt-hdr');
    var sv = document.getElementById('ape-sel-vps');
    var sd = document.getElementById('ape-sel-direct');
    var sb = document.getElementById('ape-sel-both');
    var ss = document.getElementById('ape-sel-state');
    function selPaint() {
      if (!sv || !sd || !sb || !ss) return;
      if (sb.checked) { sv.checked = true; sd.checked = true; }
      else if (sv.checked && sd.checked) sb.checked = true;
      else sb.checked = false;
      var active = [];
      if (sv.checked) active.push('VPS');
      if (sd.checked) active.push('DIRECTO');
      ss.textContent = active.length ? active.join(' + ') + ' seleccionado(s)' : 'ninguna salida seleccionada';
      ss.style.color = active.length ? '#86efac' : '#f59e0b';
      panel.querySelectorAll('[data-ape-run="vps"]').forEach(function (b) {
        b.disabled = !sv.checked; b.style.opacity = sv.checked ? '1' : '.4'; b.style.cursor = sv.checked ? 'pointer' : 'not-allowed';
      });
      panel.querySelectorAll('[data-ape-run="direct"]').forEach(function (b) {
        b.disabled = !sd.checked; b.style.opacity = sd.checked ? '1' : '.4'; b.style.cursor = sd.checked ? 'pointer' : 'not-allowed';
      });
      panel.querySelectorAll('[data-ape-run="both"]').forEach(function (b) {
        b.disabled = !sb.checked; b.style.opacity = sb.checked ? '1' : '.4'; b.style.cursor = sb.checked ? 'pointer' : 'not-allowed';
      });
    }
    if (sv) sv.addEventListener('change', function () { if (sb) sb.checked = false; selPaint(); });
    if (sd) sd.addEventListener('change', function () { if (sb) sb.checked = false; selPaint(); });
    if (sb) sb.addEventListener('change', function () { if (sb.checked) { sv.checked = true; sd.checked = true; } selPaint(); });
    selPaint();

    // SALIDAS + FORMATO: la selección de formato manda sobre HLS/DASH.
    var oh = document.getElementById('ape-out-hls');
    var od = document.getElementById('ape-out-dash');
    var ox = document.getElementById('ape-out-hybrid');
    var oj = document.getElementById('ape-out-jit');
    var ohdr = document.getElementById('ape-out-hdr');
    var ofs = document.querySelectorAll('input[name="ape-out-format"]');
    var om = document.getElementById('ape-out-matrix-state');
    var restored = loadOutOpts();
    if (oj) oj.checked = restored.jit;
    if (ohdr) ohdr.value = restored.hdr;
    function formatValue() {
      for (var i = 0; i < ofs.length; i++) if (ofs[i].checked) return ofs[i].value;
      return 'm3u8';
    }
    function paintOutputs() {
      if (!oh || !od || !ox) return;
      if (ox.checked) { oh.checked = true; od.checked = true; }
      if (oh.checked && od.checked) ox.checked = true;
      else ox.checked = false;
      var f = oh.checked && od.checked ? 'hybrid' : (od.checked ? 'mpd' : 'm3u8');
      ofs.forEach(function (r) { if (r.value === f) r.checked = true; });
      var hdrVal = ohdr ? String(ohdr.value).toLowerCase() : 'auto';
      var hdrTxt = hdrVal === 'pq' ? 'PQ' : (hdrVal === 'sdr' ? 'SDR' : 'HDR auto');
      if (om) om.textContent = (oh.checked ? 'HLS ' : '') + (od.checked ? 'DASH ' : '') +
        (oj && oj.checked ? 'JIT ' : '') + hdrTxt + ' · .' + f.toUpperCase();
    }
    ofs.forEach(function (r) {
      r.addEventListener('change', function () {
        if (r.value === 'm3u8') { oh.checked = true; od.checked = false; ox.checked = false; }
        if (r.value === 'mpd') { oh.checked = false; od.checked = true; ox.checked = false; }
        if (r.value === 'hybrid') { oh.checked = true; od.checked = true; ox.checked = true; }
        paintOutputs();
      });
    });
    [oh, od, ox, oj, ohdr].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () {
        var cur = currentOutOpts();
        saveOutOpts(cur.jit, cur.hdrMode);
        paintOutputs();
      });
    });
    paintOutputs();
    var p = document.getElementById('publicationMode');
    var ps = document.getElementById('ape-gen-mode-select');
    function paintMode() {
      var v = p ? p.value : (window.APE_PUBLICATION_MODE || 'balanced_95');
      if (ps) ps.value = v;
      var m = $('#ape-gen-mode'); if (m) m.textContent = modeText();
    }
    if (p) p.addEventListener('change', paintMode);
    if (ps) ps.addEventListener('change', function () {
      window.APE_PUBLICATION_MODE = ps.value;
      if (p) { p.value = ps.value; p.dispatchEvent(new Event('change', { bubbles: true })); }
      paintMode();
    });
    paintMode();
    var di = document.getElementById('ape-delta-input');
    if (di) {
      di.value = String(DELTA_PCT);
      di.addEventListener('input', function () { applyDelta(false); });
      di.addEventListener('change', function () { applyDelta(false); });
    }
    var da = document.getElementById('ape-delta-apply');
    if (da) da.addEventListener('click', function () { applyDelta(true); });
    guard();
    setInterval(function () { guard(); var m = $('#ape-gen-mode'); if (m) m.textContent = modeText(); }, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else setTimeout(render, 0);
})();

