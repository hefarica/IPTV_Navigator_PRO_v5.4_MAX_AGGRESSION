/**
 * APE Output Status Panel
 * Visual matrix of implemented outputs + real HTTP probes.
 * Isolated: no generator, VPS or JIT logic is modified here.
 */
(function () {
  'use strict';
  if (window.__APE_OUTPUT_PANEL__) return;
  window.__APE_OUTPUT_PANEL__ = true;

  var BASE = window.APE_JIT_BASE || 'https://iptv-ape.duckdns.org/jit';
  var $ = function (sel) { return document.querySelector(sel); };

  var CARDS = [
    { id: 'list', title: 'HLS · Lista JIT', sub: '10.573 canales · HLS', url: BASE + '/playlist.m3u8', kind: 'list' },
    { id: 'hls4k', title: '4K · HLS', sub: '3840x2160 · HDR10 · passthrough', url: BASE + '/live/1174213/master.m3u8', kind: 'media' },
    { id: 'dash4k', title: '4K · DASH', sub: 'CMAF/fMP4 · CICP PQ', url: BASE + '/live/1174213/manifest.mpd', kind: 'media' },
    { id: 'json4k', title: '4K · Manifest JSON', sub: 'salida y metadatos', url: BASE + '/live/1174213/manifest.json', kind: 'media' },
    { id: 'range4k', title: '4K · Range 206', sub: 'init-0.m4s · bytes 0-1023', url: BASE + '/live/1174213/init-0.m4s', kind: 'range' },
    { id: 'hls1080', title: '1080 · HLS', sub: '1920x1080 · HDR10 · zscale', url: BASE + '/live/3/master.m3u8', kind: 'media' },
    { id: 'dash1080', title: '1080 · DASH', sub: 'CMAF/fMP4 · CICP PQ', url: BASE + '/live/3/manifest.mpd', kind: 'media' },
    /* [2026-11-19] PROVIDER-DIRECT: la unica salida que NO depende del slot unico
     * del proveedor (max_connections=1). El motor JIT se niega a abrir una segunda
     * conexion y devuelve PROVIDER_SLOT_BUSY; su propio codigo dice que el player
     * elija provider-direct. Esta tarjeta prueba ESA ruta con tu URL real. */
    { id: 'direct', title: 'Provider-direct · siempre sirve', sub: 'tu URL de canal · sin JIT', url: '', kind: 'media', dynamic: true, range: true }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  var VERDICT = {
    listo:     { color: '#22c55e', label: 'listo' },
    range_ok:  { color: '#06b6d4', label: '206 OK' },
    ocupado:   { color: '#f59e0b', label: 'slot ocupado' },
    pendiente: { color: '#94a3b8', label: 'declarada sin salida' },
    no_listo:  { color: '#94a3b8', label: 'no lista' },
    timeout:   { color: '#94a3b8', label: 'timeout' },
    error:     { color: '#ef4444', label: 'error' }
};
function colour(status) {
    var v = VERDICT[status];
    if (v) return v.color;
    if (status === '206') return '#06b6d4';
    if (/^4|^5/.test(status)) return '#ef4444';
    return '#94a3b8';
}

  function setStatus(id, text, detail) {
    var el = document.querySelector('[data-ape-out-status="' + id + '"]');
    if (!el) return;
    el.textContent = text;
    el.style.color = colour(text);
    el.title = detail || '';
  }

  function render() {
    if ($('#ape-output-matrix')) return;
    var tab = $('#tab-export') || $('#exportStatus') || document.body;
    var host = document.createElement('section');
    host.id = 'ape-output-matrix';
    host.style.cssText = 'margin:14px 0 18px;padding:14px;border:1px solid rgba(56,189,248,.38);border-radius:14px;background:linear-gradient(135deg,rgba(14,165,233,.10),rgba(15,23,42,.55));';

    var cards = CARDS.map(function (c) {
      return '<div style="background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.22);border-radius:10px;padding:10px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
        '<b style="font-size:.78rem;color:#e2e8f0;">' + esc(c.title) + '</b>' +
        '<span data-ape-out-status="' + c.id + '" style="font-size:.72rem;font-weight:800;color:#94a3b8;">—</span>' +
        '</div>' +
        '<div style="font-size:.66rem;color:#94a3b8;margin:5px 0;">' + esc(c.sub) + '</div>' +
        '<div style="font-size:.62rem;color:#64748b;word-break:break-all;">' + esc(c.url.replace(BASE, '/jit')) + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px;">' +
        '<button data-ape-probe="' + c.id + '" style="background:rgba(14,165,233,.18);color:#7dd3fc;border:1px solid rgba(14,165,233,.45);border-radius:6px;padding:4px 8px;font-size:.62rem;font-weight:700;cursor:pointer;">Probar</button>' +
        '<button data-ape-copy="' + c.id + '" style="background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,.25);border-radius:6px;padding:4px 8px;font-size:.62rem;cursor:pointer;">Copiar</button>' +
        '<button data-ape-open="' + c.id + '" style="background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,.25);border-radius:6px;padding:4px 8px;font-size:.62rem;cursor:pointer;">Abrir</button>' +
        '</div></div>';
    }).join('');

    host.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">' +
      '<div><div style="font-weight:800;color:#7dd3fc;font-size:.85rem;">🔎 Salidas implementadas · prueba real</div>' +
      '<div style="font-size:.68rem;color:#94a3b8;margin-top:4px;">HLS + DASH + CMAF · 4K HDR passthrough · 1080/720/480 → 1080 HDR10</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      '<span id="ape-out-mode" style="font-size:.64rem;color:#c4b5fd;border:1px solid rgba(139,92,246,.45);border-radius:999px;padding:4px 9px;">modo: —</span>' +
      '<button id="ape-out-probe-all" style="background:rgba(16,185,129,.2);color:#6ee7b7;border:1px solid rgba(16,185,129,.45);border-radius:7px;padding:6px 10px;font-size:.66rem;font-weight:800;cursor:pointer;">Probar todas</button>' +
      '</div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:12px;">' + cards + '</div>' +
      '<div id="ape-out-summary" style="font-size:.64rem;color:#94a3b8;margin-top:9px;">Los estados — no son éxito: se llenan solo con probes HTTP reales.</div>';

    if (tab.id === 'exportStatus') tab.insertAdjacentElement('beforebegin', host);
    else tab.appendChild(host);

    host.querySelectorAll('[data-ape-probe]').forEach(function (b) {
      b.addEventListener('click', function () { probeById(b.getAttribute('data-ape-probe')); });
    });
    host.querySelectorAll('[data-ape-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = CARDS.find(function (x) { return x.id === b.getAttribute('data-ape-copy'); });
        if (!c) return;
        navigator.clipboard && navigator.clipboard.writeText(c.url);
        setStatus(c.id, 'copy', c.url);
        setTimeout(function () { setStatus(c.id, '—', 'sin probar'); }, 900);
      });
    });
    host.querySelectorAll('[data-ape-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = CARDS.find(function (x) { return x.id === b.getAttribute('data-ape-open'); });
        if (c) window.open(c.url, '_blank', 'noopener');
      });
    });
    var all = $('#ape-out-probe-all');
    if (all) all.addEventListener('click', probeAll);
    updateMode();
  }

  function updateMode() {
    var el = $('#ape-out-mode');
    if (!el) return;
    var direct = false;
    try {
      direct = window.APE_DIRECT_MODE === true ||
        ($('#apeDirectModeToggle') && $('#apeDirectModeToggle').checked);
    } catch (e) { }
    var pub = $('#publicationMode') ? $('#publicationMode').value : 'balanced_95';
    el.textContent = (direct ? 'DIRECTO' : 'VPS') + ' · ' + pub + ' · JIT HLS+DASH';
  }

  async function fetchStatus(c) {
    var headers = {};
    /* [2026-11-19] tarjeta dinamica: la URL sale del canal cargado, no de una
       constante. Si no hay lista cargada se declara, no se inventa. */
    if (c.dynamic) {
        var u = null;
        try {
            var st = (window.app && window.app.state) || {};
            var chs = st.channelsMaster || st.channels || [];
            var f0 = chs[0] || null;
            u = (f0 && (f0.url || f0.stream_url || f0.streamUrl || f0.link)) || null;
        } catch (_e) { u = null; }
        if (!u) return { code: 'local', verdict: 'no_listo', reason: 'sin canales cargados: carga una lista primero' };
        c.url = u;
    }
    if (c.kind === 'range' || c.range) headers.Range = 'bytes=0-1023';
    var ctrl = new AbortController();
    /* 8 s, no 20: si el borde no contesta en 8 s no esta sirviendo, y el
     * operador no debe quedarse mirando "probando". */
    var timer = setTimeout(function () { ctrl.abort(); }, 8000);
    try {
        var r = await fetch(c.url, {
            method: 'GET', headers: headers, redirect: 'manual',
            cache: 'no-store', signal: ctrl.signal
        });
        clearTimeout(timer);
        if (r.status === 0) return { code: '0', verdict: 'no_listo', reason: 'opaque/redirect (CORS)' };
        var body = '';
        try { body = (await r.text()).slice(0, 1200); } catch (_e) { body = ''; }
        var info = classify(c, r.status, body, r.headers.get('content-type') || '');
        return { code: String(r.status), verdict: info.verdict, reason: info.reason, detail: info.detail };
    } catch (e) {
        clearTimeout(timer);
        var aborted = (e && (e.name === 'AbortError' || /abort/i.test(e.message || '')));
        return { code: aborted ? 'timeout' : 'error', verdict: aborted ? 'timeout' : 'error',
                 reason: aborted ? 'sin respuesta en 8 s' : ((e && e.message) || 'fetch error') };
    }
}

/* Clasifica por CONTENIDO. Un codigo 2xx solo pasa a 'listo' si el cuerpo es
 * realmente la salida declarada. */
function classify(c, status, body, ctype) {
    var b = String(body || '').trim();

    if (status === 206) return { verdict: 'range_ok', reason: 'bytes servidos', detail: ctype };

    if (status === 503) {
        var why = /PROVIDER_SLOT_BUSY/.test(b) ? 'PROVIDER_SLOT_BUSY' : (b.slice(0, 80) || 'servicio no disponible');
        return { verdict: 'ocupado', reason: why, detail: ctype };
    }
    if (status === 404) {
        return { verdict: 'no_listo', reason: b ? b.slice(0, 80) : '404', detail: ctype };
    }
    if (/^4|^5/.test(String(status))) {
        return { verdict: 'error', reason: b.slice(0, 80) || ('HTTP ' + status), detail: ctype };
    }

    if (c.kind === 'json') {
        var j = null;
        try { j = JSON.parse(b); } catch (_e) { j = null; }
        if (!j) return { verdict: 'error', reason: 'JSON invalido', detail: ctype };
        var inactivo = (String(j.status || '').toLowerCase() === 'inactive') ||
                       (String(j.output_status || '').toLowerCase() === 'pending_output') ||
                       (j.rea_executed === false);
        if (inactivo) {
            return { verdict: 'pendiente',
                     reason: 'status=' + (j.status || '?') + ' · output=' + (j.output_status || '?') +
                             ' · rea=' + (j.rea_executed === true ? 'true' : 'false'),
                     detail: ctype };
        }
        return { verdict: 'listo', reason: 'metadatos activos', detail: ctype };
    }

    if (c.kind === 'list' || c.kind === 'media') {
        var okList = (b.indexOf('#EXTM3U') === 0);
        var okDash = /<MPD[\s>]/i.test(b) || b.indexOf('<?xml') === 0;
        if (okList || okDash) return { verdict: 'listo', reason: okList ? '#EXTM3U' : 'MPD valido', detail: ctype };
        if (/PROVIDER_SLOT_BUSY/.test(b)) return { verdict: 'ocupado', reason: 'PROVIDER_SLOT_BUSY', detail: ctype };
        if (/not ready/i.test(b)) return { verdict: 'no_listo', reason: 'not ready', detail: ctype };
        return { verdict: 'pendiente', reason: 'cuerpo no es playlist/DASH (' + b.slice(0, 40) + ')', detail: ctype };
    }
    return { verdict: 'listo', reason: 'HTTP ' + status, detail: ctype };
}
async function probeById(id, retries) {
    var c = CARDS.find(function (x) { return x.id === id; });
    if (!c) return;
    var n = retries == null ? 1 : retries;
    var total = n + 1;
    setStatus(id, 'probando 1/' + total, c.url);
    var r = await fetchStatus(c);
    var intento = 1;
    while ((r.verdict === 'ocupado' || r.verdict === 'timeout') && n > 0) {
        n--; intento++;
        setStatus(id, 'probando ' + intento + '/' + total, c.url + ' · ' + r.reason);
        await new Promise(function (res) { setTimeout(res, 1200); });
        r = await fetchStatus(c);
    }
    var lbl = (VERDICT[r.verdict] || {}).label || r.verdict || r.code;
    setStatus(id, lbl, c.url + ' · HTTP ' + r.code + ' · ' + r.reason);
    return r.verdict;
}
async function probeAll() {
    var summary = $('#ape-out-summary');
    if (summary) summary.textContent = 'Probando salidas en secuencia…';
    var out = [];
    for (var i = 0; i < CARDS.length; i++) {
      var code = await probeById(CARDS[i].id, 2);
      out.push(CARDS[i].id + '=' + code);
    }
    if (summary) summary.textContent = 'Resultados reales: ' + out.join(' · ');
  }

  function boot() {
    render();
    var d = $('#apeDirectModeToggle');
    if (d) d.addEventListener('change', updateMode);
    var p = $('#publicationMode');
    if (p) p.addEventListener('change', updateMode);
    setInterval(updateMode, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
