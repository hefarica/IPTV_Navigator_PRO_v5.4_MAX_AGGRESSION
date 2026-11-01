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
      toast('DASH/MPD lo sirve el JIT; el generador actual descarga HLS .m3u8. No se genera un MPD falso.', 'warning');
      status('DASH/MPD: usar salida JIT; no hay generador MPD de descarga', '#f59e0b');
      return false;
    }
    if (f === 'hybrid') {
      toast('Se generará la lista HLS; el manifiesto DASH se sirve desde JIT.', 'info');
      status('HÍBRIDA: HLS descargable + DASH servido por JIT', '#a855f7');
    }
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
    if (!checkGeneration() || !formatGuard()) return;
    try {
      status('Generando VPS…', '#38bdf8');
      await window.APEGenerationController.prepublishAndGenerateDual();
      status('VPS completado', '#22c55e');
    } catch (e) { status('VPS falló: ' + e.message, '#ef4444'); toast('VPS falló: ' + e.message, 'error'); }
  }

  async function runDirect() {
    if (!checkGeneration() || !formatGuard()) return;
    try {
      status('Generando DIRECTO…', '#38bdf8');
      await window.APEGenerationController.prepublishAndGenerate();
      status('DIRECTO completado', '#22c55e');
    } catch (e) { status('DIRECTO falló: ' + e.message, '#ef4444'); toast('DIRECTO falló: ' + e.message, 'error'); }
  }

  // AMBAS = UNA lista híbrida: URI de canal en VPS y segmentos directos del
  // proveedor (comprobado en APE_LISTA_..._CDN: playlist VPS -> media playlist
  // con segmentos en host del proveedor). Se usa el generador CDN existente.
  async function runBoth() {
    if (!checkGeneration() || !formatGuard()) return;
    try {
      status('Generando AMBAS (URI VPS + vídeo directo)…', '#38bdf8');
      await window.APEGenerationController.prepublishAndGenerateDual();
      status('AMBAS completado: URI VPS · segmentos directos', '#22c55e');
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
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-out-jit" checked style="accent-color:#f59e0b;"> JIT</label>' +
      '<label style="cursor:pointer;" title="Una sola casilla para ambas calidades"><input type="checkbox" id="ape-out-hdr" checked style="accent-color:#ef4444;"> 4K HDR / 1080 HDR</label>' +
      '</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:8px;padding:8px 10px;border-radius:9px;background:rgba(2,6,23,.28);border:1px solid rgba(148,163,184,.22);font-size:.82rem;color:#cbd5e1;">' +
      '<strong style="color:#fbbf24;">FORMATO:</strong>' +
      '<label style="cursor:pointer;"><input type="radio" name="ape-out-format" value="m3u8" checked style="accent-color:#22c55e;"> .M3U8</label>' +
      '<label style="cursor:pointer;"><input type="radio" name="ape-out-format" value="mpd" style="accent-color:#38bdf8;"> .MPD</label>' +
      '<label style="cursor:pointer;"><input type="radio" name="ape-out-format" value="hybrid" style="accent-color:#a855f7;"> HÍBRIDA</label>' +
      '<span id="ape-out-matrix-state" style="color:#94a3b8;font-size:.74rem;">HLS · .M3U8</span>' +
      '<span style="font-size:.82rem;color:#64748b;flex-basis:100%;">HLS descargable con el generador actual. DASH/MPD se sirve desde JIT; no se fabrica un MPD falso.</span>' +
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
      '</div>' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px;font-size:.8rem;">' +
      '<span style="color:#86efac;border:1px solid rgba(34,197,94,.45);border-radius:999px;padding:3px 8px;">ENTRA MÁS · descarga / prefetch / buffer</span>' +
      '<span style="color:#fca5a5;border:1px solid rgba(239,68,68,.4);border-radius:999px;padding:3px 8px;">SALE MENOS · reproducción / bitrate</span>' +
      '</div>' +
      '<div style="font-size:.82rem;color:#94a3b8;margin-top:6px;">Entrada ≥ salida × (1 + delta). Cada perfil aplica el cálculo sobre sus propios valores; aquí no se muestran Mbps absolutos.</div></div>' +
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
      if (om) om.textContent = (oh.checked ? 'HLS ' : '') + (od.checked ? 'DASH ' : '') +
        (oj && oj.checked ? 'JIT ' : '') + (ohdr && ohdr.checked ? 'HDR' : '') + ' · .' + f.toUpperCase();
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
      if (el) el.addEventListener('change', paintOutputs);
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
      di.addEventListener('input', function () {
        var v = Number(di.value);
        if (isFinite(v) && v >= 1 && v <= 90) {
          DELTA_PCT = v;
          try { localStorage.setItem('ape_output_delta_pct', String(v)); } catch (_) { }
          guard();
        }
      });
    }
    guard();
    setInterval(function () { guard(); var m = $('#ape-gen-mode'); if (m) m.textContent = modeText(); }, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else setTimeout(render, 0);
})();

