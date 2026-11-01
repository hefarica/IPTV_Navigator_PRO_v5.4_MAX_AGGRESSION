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
  var MIN_DELTA = 0.15; // entrada >= salida * 1.15

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
    var delta = inM > 0 && outM > 0 ? inM - outM : null;
    var pct = inM > 0 ? delta / inM * 100 : null;
    var ok = delta != null && inM >= outM * (1 + MIN_DELTA);
    var e = $('#ape-buf-in'), s = $('#ape-buf-out'), d = $('#ape-buf-delta'), b = $('#ape-buf-state');
    if (e) e.textContent = inM > 0 ? inM.toFixed(1) + ' Mbps' : 'SIN DATO';
    if (s) s.textContent = outM > 0 ? outM.toFixed(1) + ' Mbps' : 'SIN DATO';
    if (d) d.textContent = delta == null ? '—' : delta.toFixed(1) + ' Mbps (' + pct.toFixed(1) + '%)';
    if (b) {
      b.textContent = delta == null ? 'SIN DATO' : (ok ? 'BUFFER OK' : 'BUFFER RIESGO');
      b.style.color = delta == null ? '#f59e0b' : (ok ? '#22c55e' : '#ef4444');
    }
    return { inM: inM, outM: outM, delta: delta, ok: ok };
  }

  function checkGeneration() {
    var g = guard();
    if (g.delta == null) {
      toast('Sin medición de entrada: se permite generar, pero no se puede validar el buffer.', 'warning');
      return true;
    }
    if (!g.ok) {
      toast('Buffer en riesgo: entrada ' + g.inM.toFixed(1) + ' Mbps vs salida ' + g.outM.toFixed(1) + ' Mbps. No se genera hasta que entre más de lo que sale.', 'error');
      status('BLOQUEADO: entrada <= salida × 1.15', '#ef4444');
      return false;
    }
    return true;
  }

  async function runVps() {
    if (!checkGeneration()) return;
    try {
      status('Generando VPS…', '#38bdf8');
      await window.APEGenerationController.prepublishAndGenerateDual();
      status('VPS completado', '#22c55e');
    } catch (e) { status('VPS falló: ' + e.message, '#ef4444'); toast('VPS falló: ' + e.message, 'error'); }
  }

  async function runDirect() {
    if (!checkGeneration()) return;
    try {
      status('Generando DIRECTO…', '#38bdf8');
      await window.APEGenerationController.prepublishAndGenerate();
      status('DIRECTO completado', '#22c55e');
    } catch (e) { status('DIRECTO falló: ' + e.message, '#ef4444'); toast('DIRECTO falló: ' + e.message, 'error'); }
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
    panel.style.cssText = 'margin:0 0 14px;padding:14px;border:1px solid rgba(56,189,248,.42);border-radius:14px;background:linear-gradient(135deg,rgba(14,165,233,.12),rgba(15,23,42,.72));';
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
      '<div><div style="font-size:.9rem;font-weight:900;color:#7dd3fc;">⚙️ OPTIMIZACIÓN Y SALIDAS</div>' +
      '<div style="font-size:.68rem;color:#94a3b8;margin-top:3px;">Cada tarjeta genera su lista con el generador que le corresponde. Los perfiles no se tocan aquí.</div></div>' +
      '<div id="ape-gen-status" style="font-size:.68rem;color:#94a3b8;font-weight:700;">listo</div></div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:10px;padding:8px 10px;border-radius:9px;background:rgba(2,6,23,.42);border:1px solid rgba(148,163,184,.22);font-size:.7rem;color:#cbd5e1;">' +
      '<strong style="color:#7dd3fc;">Salidas:</strong>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-sel-vps" checked style="accent-color:#0ea5e9;"> VPS</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-sel-direct" style="accent-color:#a855f7;"> DIRECTO</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-sel-both" style="accent-color:#22d3ee;"> AMBAS</label>' +
      '<span id="ape-sel-state" style="color:#94a3b8;font-size:.64rem;">VPS seleccionado</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:9px;margin-top:12px;">' +
      // VPS
      '<div style="background:rgba(2,6,23,.55);border:1px solid rgba(14,165,233,.45);border-radius:11px;padding:11px;">' +
      '<div style="font-weight:800;color:#7dd3fc;font-size:.78rem;">VPS · Lista CDN</div>' +
      '<div style="font-size:.68rem;color:#94a3b8;margin:4px 0 7px;">prepublishAndGenerateDual() · _CDN.m3u8</div>' +
      '<button data-ape-run="vps" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border:0;border-radius:7px;padding:7px 12px;font-size:.7rem;font-weight:800;cursor:pointer;">Generar VPS</button>' +
      '<span style="font-size:.62rem;color:#64748b;margin-left:7px;">VPS + metadata</span></div>' +
      // DIRECTO
      '<div style="background:rgba(2,6,23,.55);border:1px solid rgba(168,85,247,.45);border-radius:11px;padding:11px;">' +
      '<div style="font-weight:800;color:#c4b5fd;font-size:.78rem;">DIRECTO · Lista limpia</div>' +
      '<div style="font-size:.68rem;color:#94a3b8;margin:4px 0 7px;">prepublishAndGenerate() · URLs del proveedor</div>' +
      '<button data-ape-run="direct" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:0;border-radius:7px;padding:7px 12px;font-size:.7rem;font-weight:800;cursor:pointer;">Generar DIRECTO</button>' +
      '<span style="font-size:.62rem;color:#64748b;margin-left:7px;">sin VPS</span></div>' +
      // AMBAS
      '<div style="background:rgba(2,6,23,.55);border:1px solid rgba(34,211,238,.45);border-radius:11px;padding:11px;">' +
      '<div style="font-weight:800;color:#67e8f9;font-size:.78rem;">AMBAS · dos salidas</div>' +
      '<div style="font-size:.68rem;color:#94a3b8;margin:4px 0 7px;">Selecciona y genera una por una para conservar el gesto de guardado.</div>' +
      '<button data-ape-run="vps" style="background:rgba(14,165,233,.2);color:#7dd3fc;border:1px solid rgba(14,165,233,.5);border-radius:7px;padding:6px 9px;font-size:.66rem;font-weight:700;cursor:pointer;">1 · VPS</button>' +
      '<button data-ape-run="direct" style="background:rgba(168,85,247,.2);color:#c4b5fd;border:1px solid rgba(168,85,247,.5);border-radius:7px;padding:6px 9px;font-size:.66rem;font-weight:700;cursor:pointer;">2 · DIRECTO</button></div>' +
      '</div>' +
      // Options
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px;margin-top:9px;">' +
      '<div id="ape-opt-pro" style="background:rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.25);border-radius:9px;padding:9px;cursor:pointer;font-size:.7rem;color:#e2e8f0;"><b><span data-ape-opt-dot>○</span> Pro Streaming</b><div style="color:#64748b;font-size:.62rem;margin-top:2px;">buffer agresivo, cache, reconnect</div></div>' +
      '<div id="ape-opt-ott" style="background:rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.25);border-radius:9px;padding:9px;cursor:pointer;font-size:.7rem;color:#e2e8f0;"><b><span data-ape-opt-dot>○</span> OTT Navigator</b><div style="color:#64748b;font-size:.62rem;margin-top:2px;">UA OTT, catchup, headers VLC</div></div>' +
      '<div id="ape-opt-hdr" style="background:rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.25);border-radius:9px;padding:9px;cursor:pointer;font-size:.7rem;color:#e2e8f0;"><b><span data-ape-opt-dot>○</span> Incluir HTTP Headers</b><div style="color:#64748b;font-size:.62rem;margin-top:2px;">#EXTHTTP / #EXTVLCOPT</div></div>' +
      '</div>' +
      // Buffer + mode
      '<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:9px;margin-top:9px;">' +
      '<div style="background:rgba(2,6,23,.55);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:10px;">' +
      '<div style="font-size:.72rem;font-weight:800;color:#86efac;">CONDICIÓN DE BUFFER</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:.67rem;color:#94a3b8;margin-top:5px;">' +
      '<span>Entrada <b id="ape-buf-in" style="color:#e2e8f0;">SIN DATO</b></span>' +
      '<span>Salida <b id="ape-buf-out" style="color:#e2e8f0;">SIN DATO</b></span>' +
      '<span>Delta <b id="ape-buf-delta" style="color:#e2e8f0;">—</b></span>' +
      '<b id="ape-buf-state" style="color:#f59e0b;">SIN DATO</b></div>' +
      '<div style="font-size:.6rem;color:#64748b;margin-top:4px;">Se exige entrada ≥ salida × 1.15 para generar.</div></div>' +
      '<div style="background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.25);border-radius:10px;padding:10px;font-size:.68rem;color:#94a3b8;">' +
      '<div style="font-weight:800;color:#e2e8f0;">MODO</div>' +
      '<select id="ape-gen-mode-select" style="margin-top:5px;width:100%;padding:5px 6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;font-size:.64rem;">' +
      '<option value="strict_terminal">Strict Terminal · &gt;99% 200</option>' +
      '<option value="balanced_95" selected>Balanced 95 · &gt;95% playback</option>' +
      '<option value="diagnostic">Diagnostic · auditoría</option>' +
      '</select><div id="ape-gen-mode" style="margin-top:3px;color:#c4b5fd;font-size:.6rem;">—</div></div>' +
      '</div>';
    tab.insertBefore(panel, tab.firstChild);

    panel.querySelectorAll('[data-ape-run]').forEach(function (b) {
      b.addEventListener('click', function () { b.getAttribute('data-ape-run') === 'vps' ? runVps() : runDirect(); });
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
    }
    if (sv) sv.addEventListener('change', function () { if (sb) sb.checked = false; selPaint(); });
    if (sd) sd.addEventListener('change', function () { if (sb) sb.checked = false; selPaint(); });
    if (sb) sb.addEventListener('change', function () { if (sb.checked) { sv.checked = true; sd.checked = true; } selPaint(); });
    selPaint();
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
    guard();
    setInterval(function () { guard(); var m = $('#ape-gen-mode'); if (m) m.textContent = modeText(); }, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else setTimeout(render, 0);
})();
