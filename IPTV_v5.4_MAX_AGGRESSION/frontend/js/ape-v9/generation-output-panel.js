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

  function currentManifestMetadata() {
    var dictator = document.getElementById('dictatorMode');
    var tier = document.querySelector('input[name="dictatorTier"]:checked');
    var maxQ = document.getElementById('ape-max-quality-toggle');
    var perceptual = document.getElementById('ape-perceptual-4k-toggle');
    var maxCompat = document.getElementById('ape-max-compat-toggle');
    return {
      dictatorMode: !!(dictator && dictator.checked),
      dictatorTier: tier ? String(tier.value) : '4K',
      maxQualityMode: !!(maxQ && maxQ.checked),
      perceptual4kMode: !!(perceptual && perceptual.checked),
      maxCompatMode: !!(maxCompat && maxCompat.checked)
    };
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
      currentManifestMetadata: currentManifestMetadata,
      ensureJitCatalog: ensureJitCatalog,
      jitUrlForChannel: jitUrlForChannel,
      runDirect: runDirect,
      runVps: runVps,
      runBoth: runBoth,
      downloadActiveJitMpd: downloadActiveJitMpd,
      // Expuestos para poder probar la logica del guard y del auto-ajuste sin navegador.
      // Son declaraciones de funcion (hoisted), asi que estan disponibles aqui aunque se
      // definan mas abajo.
      guard: guard,
      checkGeneration: checkGeneration,
      sugerirAjuste: sugerirAjuste,
      renderSugerencia: renderSugerencia,
      mejorEscenario: mejorEscenario,
      aplicarEscenario: aplicarEscenario,
      getDeltaPct: function () { return DELTA_PCT; },
      // Expuesto para fijar el delta por funcion desde una prueba. Escribir en localStorage no
      // cambia la variable en memoria, asi que un test no puede provocar un estado con ese truco.
      applyDelta: applyDelta
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
      delta_contract: window.APE_DELTA_CONTRACT || null,
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

  function applyDelta(notify, valorExplicito) {
    // valorExplicito permite aplicar un delta calculado sin depender del input del DOM.
    // Sin esto, aplicarEscenario escribia el input y llamaba aqui; si el input no existia
    // (por ejemplo antes del render completo) se aplicaba el valor VIEJO y el clic no hacia
    // nada. Lo encontro la prueba en navegador real, no la del DOM mockeado.
    var v = (valorExplicito != null) ? Number(valorExplicito) : currentDelta();
    if (!isFinite(v)) v = currentDelta();
    v = Math.round(v);
    if (v < 1) v = 1;
    if (v > 90) v = 90;
    DELTA_PCT = v;
    window.APE_OUTPUT_DELTA_PCT = v;
    window.APE_BUFFER_DELTA_PCT = v;
    var arr = getDeltaArray(v);
    setDeltaArray(arr);
    try { localStorage.setItem('ape_output_delta_pct', String(v)); } catch (_) { }
    var di = document.getElementById('ape-delta-input');
    if (di) di.value = String(v);
    guard();
    renderSugerencia();   // al cambiar el delta, la sugerencia se recalcula sola
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

  function generationResultStatus(result, success) {
    var decision = result && result.decision || '';
    if (decision.indexOf('cancelled') === 0) { status('Generación cancelada.', '#f59e0b'); return; }
    if (decision === 'skipped_already_running') { status('Ya hay una generación en curso.', '#f59e0b'); return; }
    status(result && result.notice ? result.notice : success, '#22c55e');
  }

  function selectedFormat() {
    var r = document.querySelector('input[name="ape-out-format"]:checked');
    return r ? r.value : 'm3u8';
  }

  function isJsonMetadataOutput() {
    var selected = document.getElementById('genExportFormat');
    return !!(selected && selected.value === 'json');
  }

  function formatGuard() {
    if (isJsonMetadataOutput()) {
      status('JSON de metadatos: conserva las URL de origen; DIRECTA/CDN/AMBAS se aplican a M3U.', '#38bdf8');
      return true;
    }
    var f = selectedFormat();
    if (f === 'mpd') {
      toast('DASH: se descargará una M3U con la URL del MPD servido del canal JIT activo.', 'info');
      status('DASH: preparando lista de un canal JIT activo', '#38bdf8');
      return true;
    }
    if (f === 'hybrid') {
      toast('Se generará la lista HLS; el manifiesto DASH se sirve desde JIT.', 'info');
      status('HÍBRIDA: HLS descargable + DASH servido por JIT', '#a855f7');
    }
    return true;
  }

  async function downloadActiveJitMpd(diagnosticSnapshot) {
    var base = JIT_BASE;
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
    var dash = String(active.dash || (base + '/jit/live/' + encodeURIComponent(active.id) + '/manifest.mpd'));
    if (/[\u0000-\u0020\u007f]/.test(dash)) throw new Error('URL DASH inválida');
    var absoluteDash = new URL(dash, catRes.url || base + '/jit/catalog.json');
    if (!/^https?:$/.test(absoluteDash.protocol)) throw new Error('URL DASH debe usar HTTP(S)');
    // Preserve already absolute signed URLs byte for byte, including query
    // ordering, duplicate parameters, percent escapes and authorization.
    if (!/^https?:\/\//i.test(dash)) dash = absoluteDash.href;
    var r = await fetch(dash, { cache: 'no-store' });
    if (!r.ok) throw new Error('MPD HTTP ' + r.status);
    var text = await r.text();
    if (!/<MPD\b/.test(text)) throw new Error('el JIT no devolvió un MPD válido');
    var snapshot = diagnosticSnapshot === true;
    var name = String(active.name || active.id || 'JIT').replace(/[\u0000-\u001f\u007f]/g, ' ');
    var fileId = String(active.id || 'JIT').replace(/[^a-zA-Z0-9_.-]/g, '_');
    // A local live MPD loses the HTTP base for relative segments and refresh.
    // Playback retains the served URL; a separate diagnostic snapshot stays exact.
    var contents = snapshot ? text : '#EXTM3U\n#EXTINF:-1,' + name + ' · DASH JIT\n' + dash + '\n';
    var blob = new Blob([contents], { type: snapshot ? 'application/dash+xml' : 'audio/x-mpegurl;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'APE_' + fileId + (snapshot ? '_diagnostic_snapshot.mpd' : '_DASH.m3u');
    a._gzipProcessing = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    status(snapshot ? 'MPD diagnóstico descargado · instantánea; reproducción mediante la M3U DASH.'
      : 'M3U DASH descargada · un canal JIT; segmentos y actualizaciones desde el MPD servido.', '#22c55e');
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

  // Suelo del perfil, en Mbps. Es el mínimo con el que el perfil ARRANCA; `bitrate` es el techo de su
  // escalera, o sea la calidad máxima que puede alcanzar, no el requisito para emitir la lista.
  //
  // El LAB lo declara en bps: P0=15M, P1=12M, P2=8M, P3=5M, P4=3M, P5=1.5M. La tabla repite esos
  // valores como respaldo para cuando el perfil cargado no traiga el campo, que es el caso hoy en
  // APE_PROFILES_CONFIG.
  var FLOOR_MBPS = { P0: 15, P1: 12, P2: 8, P3: 5, P4: 3, P5: 1.5 };
  function activeFloorMbps() {
    try {
      var cfg = window.APE_PROFILES_CONFIG;
      var id = (cfg && cfg.activeProfileId) || 'P3';
      var p = cfg && cfg.profiles ? cfg.profiles[id] : null;
      var f = p && p.settings ? p.settings.bandwidth_floor : 0;
      if (Number(f) > 0) return Number(f) / 1e6;   // bps -> Mbps
      return Number(FLOOR_MBPS[id]) || 5;
    } catch (_) { return 5; }
  }

  function inputMbps() {
    try {
      var s = window.APE_BW && typeof window.APE_BW.snapshot === 'function' ? window.APE_BW.snapshot() : null;
      return s && Number(s.mbps) > 0 ? Number(s.mbps) : 0;
    } catch (_) { return 0; }
  }

  function guard() {
    var inM = inputMbps(), outM = activeBitrate(), floorM = activeFloorMbps();
    var has = inM > 0 && outM > 0;
    // Dos preguntas distintas, y hasta hoy solo se hacía la primera:
    //   ok       = ¿el enlace puede SOSTENER el techo de la escalera?  -> calidad máxima
    //   canStart = ¿el enlace alcanza el SUELO del perfil?             -> puede arrancar
    // Generar la lista no exige lo primero: la lista lleva escalera y el ABR elige variante. Exige lo
    // segundo, porque por debajo del suelo el perfil no arranca ni en su variante más baja.
    var ok = has && inM >= outM * (1 + DELTA_PCT / 100);
    var canStart = has && inM >= floorM * (1 + DELTA_PCT / 100);
    var b = $('#ape-buf-state');
    if (b) {
      b.textContent = has ? (ok ? 'BUFFER OK' : (canStart ? 'BUFFER RIESGO' : 'BUFFER INSUFICIENTE')) : 'SIN DATO';
      b.style.color = has ? (ok ? '#22c55e' : (canStart ? '#f59e0b' : '#ef4444')) : '#f59e0b';
    }
    return { inM: inM, outM: outM, floorM: floorM, has: has, ok: ok, canStart: canStart };
  }

  // ── AUTO-AJUSTE TEÓRICO ────────────────────────────────────────────────────────────────────────
  //
  // El bloqueo sin salida era el defecto: decía "no cumple" y no ofrecía cómo cumplir. Aquí se
  // despeja la MISMA desigualdad que decide, para devolver números accionables.
  //
  //   inM >= requisito × (1 + delta/100)
  //   inM / requisito >= 1 + delta/100
  //   delta/100 <= inM / requisito - 1
  //   delta_max = (inM / requisito - 1) × 100        ← el delta más alto que AÚN cumple
  //
  // Con delta_max se responde la pregunta del operador: o se baja el delta a ese valor y el perfil
  // entra, o ningún delta (por debajo de 1%) lo salva y hay que bajar de perfil. En ese segundo caso
  // se busca el mejor perfil cuyo suelo sí quepa en el enlace con el delta actual.
  function floorDePerfil(pid) {
    try {
      var cfg = window.APE_PROFILES_CONFIG;
      var p = cfg && cfg.profiles ? cfg.profiles[pid] : null;
      var f = p && p.settings ? p.settings.bandwidth_floor : 0;
      if (Number(f) > 0) return Number(f) / 1e6;
      return Number(FLOOR_MBPS[pid]) || 0;
    } catch (_) { return 0; }
  }

  function sugerirAjuste() {
    var g = guard();
    var out = {
      has: g.has, bloquea: g.has && !g.canStart, delta: DELTA_PCT,
      // inM/outM/floorM viajan en el resultado: renderSugerencia los pinta y sin ellos el
      // render lanzaba "Cannot read properties of undefined (reading toFixed)". Lo detecto
      // la prueba ui-delta-autoajuste antes de que llegara a la interfaz.
      inM: g.inM, outM: g.outM, floorM: g.floorM, ok: g.ok, canStart: g.canStart
    };
    if (!g.has) return out;

    // Mbps que pide el perfil activo con el delta vigente
    out.reqArranque = g.floorM * (1 + DELTA_PCT / 100);
    out.reqTecho = g.outM * (1 + DELTA_PCT / 100);
    out.faltanArranque = Math.max(0, out.reqArranque - g.inM);
    out.faltanTecho = Math.max(0, out.reqTecho - g.inM);

    // delta máximo que despeja la desigualdad contra el SUELO
    out.deltaMax = g.floorM > 0 ? (g.inM / g.floorM - 1) * 100 : 0;
    out.deltaMaxEntero = Math.floor(out.deltaMax);
    // el input admite 1..90; por debajo de 1 no hay delta que salve este perfil
    out.deltaAplicable = out.deltaMaxEntero >= 1 && out.deltaMaxEntero <= 90;

    // delta máximo contra el TECHO (para saber si además sostendría la calidad máxima)
    out.deltaMaxTecho = g.outM > 0 ? (g.inM / g.outM - 1) * 100 : 0;

    // perfiles alcanzables con el delta VIGENTE, de mejor a peor
    out.alcanzables = [];
    var ids = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
    for (var i = 0; i < ids.length; i++) {
      var f = floorDePerfil(ids[i]);
      if (f > 0 && g.inM >= f * (1 + DELTA_PCT / 100)) out.alcanzables.push({ id: ids[i], floor: f });
    }
    out.mejorPerfil = out.alcanzables.length ? out.alcanzables[0].id : null;
    return out;
  }

  // ── MATRIZ COMPLETA DE ESCENARIOS ─────────────────────────────────────────────────────────────
  //
  // La sugerencia anterior daba dos salidas parciales. El operador pidió la matriz entera: recorrer
  // TODOS los perfiles × TODOS los deltas, quedarse con el mejor viable y, si no hay ninguno, decir
  // cuál es el mínimo imprescindible y cuánto falta. Y dejarle aprobar o denegar la propuesta.
  //
  // Criterio de "mejor", en este orden:
  //   1. la calidad más alta posible -> el perfil de índice más bajo (P0 > P1 > ... > P5)
  //   2. con ese perfil, el delta más alto que aún entra -> más margen en entrada
  // La calidad manda porque la salida es lo que el usuario quiere ver y el delta solo reserva margen.
  // ── UMBRAL DE ARRANQUE ────────────────────────────────────────────────────────────────────────
  // El SUELO del perfil y el UMBRAL DE ARRANQUE son dos numeros distintos y hasta ahora solo se
  // usaba el primero.
  //
  //   suelo    = bitrate minimo SOSTENIDO para que la variante mas baja no se corte.
  //   arranque = ancho de banda para bajar manifiesto + PRIMER SEGMENTO en t segundos.
  //
  // Un segmento de D segundos a B Mbps pesa B x D megabits, asi que bajarlo en t segundos exige
  // B x D / t Mbps. Se mide contra el bitrate del perfil, no contra su suelo: el arranque descarga
  // un segmento real de la variante que el perfil declara.
  var SEGMENTO_S = 6;   // duracion tipica de segmento HLS
  var ARRANQUE_S = 3;   // objetivo de time-to-first-frame
  function umbralArranque(bitrateMbps) {
    var b = Number(bitrateMbps) || 0;
    if (!(b > 0)) return 0;
    return b * SEGMENTO_S / ARRANQUE_S;
  }
  function segundosPrimerSegmento(bitrateMbps, inMbps) {
    var b = Number(bitrateMbps) || 0, i = Number(inMbps) || 0;
    if (!(b > 0) || !(i > 0)) return 0;
    return (b * SEGMENTO_S) / i;
  }

  function mejorEscenario() {
    var g = guard();
    var out = { hayMedicion: g.has, viable: null, minimo: null, porPerfil: {}, delta: DELTA_PCT };
    if (!g.has) return out;

    var ids = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
    for (var i = 0; i < ids.length; i++) {
      var pid = ids[i];
      var floor = floorDePerfil(pid);
      if (!(floor > 0)) continue;
      // delta máximo que despeja inM >= floor * (1 + d/100)
      var dMax = Math.floor((g.inM / floor - 1) * 100);
      if (dMax >= 1 && dMax <= 90) {
        out.porPerfil[pid] = { perfil: pid, delta: dMax, floor: floor, req: floor * (1 + dMax / 100) };
      }
    }

    // el perfil más alto que tenga al menos un delta válido
    for (var k = 0; k < ids.length; k++) {
      if (out.porPerfil[ids[k]]) { out.viable = out.porPerfil[ids[k]]; break; }
    }

    // mínimo imprescindible: el perfil más bajo al delta mínimo del input (1%)
    var pisoBajo = floorDePerfil('P5');
    if (pisoBajo > 0) {
      var req = pisoBajo * 1.01;
      out.minimo = { perfil: 'P5', delta: 1, req: req, faltan: Math.max(0, req - g.inM) };
    }
    return out;
  }

  // Aplica un escenario completo (perfil + delta) de una sola vez.
  function aplicarEscenario(perfil, delta) {
    try {
      var cfg = window.APE_PROFILES_CONFIG;
      if (cfg && perfil) {
        cfg.activeProfileId = perfil;
        if (typeof cfg.save === 'function') cfg.save();
        if (window.APEReactiveRules && typeof window.APEReactiveRules.refresh === 'function') {
          window.APEReactiveRules.refresh();
        }
        var sel = document.getElementById('pm9-profile-select');
        if (sel) sel.value = perfil;
      }
      if (delta) {
        applyDelta(true, delta);   // el valor viaja por parametro, no por el DOM
      }
    } catch (_) { }
  }

  // El botón FORZAR no solo autoriza: debe dejar el perfil, el delta, el array por
  // perfil, el contrato y el payload del VPS en el MISMO escenario que se aprueba.
  function aplicarForzadoP5() {
    var g0 = guard();
    var profile = 'P5';
    // El delta NO es fijo: sale del campo. Hoy puede ser 1, 15 o 20.
    var delta = currentDelta();

    // 1) perfil activo + selector visible
    aplicarEscenario(profile, delta);

    // 2) el array por perfil manda en #EXT-X-APE-BUFFER-DELTA-ARRAY y en el POST al VPS.
    //    El mismo porcentaje se escribe en TODOS los perfiles, porque el campo es la base
    //    global del escenario y cada perfil aplica ese % sobre SU propio valor de entrada.
    var arr = getDeltaArray(delta);
    profileIds().forEach(function (id) { arr[id] = delta; });
    setDeltaArray(arr);

    // 3) delta global + input + localStorage + render
    applyDelta(false, delta);

    // 4) contrato delta para el generador (OUT fijo, IN medido).
    try {
      var cfg = window.APE_PROFILES_CONFIG;
      var p = cfg && cfg.profiles ? cfg.profiles[profile] : null;
      var s = p && p.settings ? p.settings : {};
      var outMbps = Number(s.bitrate) || Number(g0.outM) || 0;
      var targetBufferSec = Number(s.bufferTargetSec || s.buffer) || 105;
      var fillTimeSec = Number(s.fillTimeSec) || 300;
      if (window.DeltaContractV9 && typeof window.DeltaContractV9.compute === 'function' && outMbps > 0) {
        window.APE_DELTA_CONTRACT = window.DeltaContractV9.compute({
          outMbps: outMbps,
          deltaPct: delta,
          targetBufferSec: targetBufferSec,
          fillTimeSec: fillTimeSec,
          measuredInputMbps: g0.inM > 0 ? g0.inM : null
        });
      }
    } catch (_e) { window.APE_DELTA_CONTRACT = null; }

    // 5) publicar el array corregido, no el viejo.
    sendDeltaToVps(delta);
    return { profile: profile, delta: delta, array: arr, contract: window.APE_DELTA_CONTRACT || null };
  }

  function hasGeneratableChannels() {
    try {
      return !!(window.app && typeof window.app.getFilteredChannels === 'function'
        && (window.app.getFilteredChannels() || []).length > 0);
    } catch (_) { return false; }
  }

  function runSelectedOutput() {
    try {
      var sb = document.getElementById('ape-sel-both');
      var sv = document.getElementById('ape-sel-vps');
      var sd = document.getElementById('ape-sel-direct');
      if (sb && sb.checked) return runBoth();
      if (sv && sv.checked) return runVps();
      if (sd && sd.checked) return runDirect();
      return runDirect();
    } catch (_) { return runDirect(); }
  }

  // Pinta la sugerencia bajo la condición de buffer. Idempotente: se reescribe entera cada vez.
  function renderSugerencia() {
    var el = document.getElementById('ape-buf-sugerencia');
    if (!el) return;
    var s = sugerirAjuste();
    if (!s.has) { el.innerHTML = ''; return; }

    var act = (window.APE_PROFILES_CONFIG && window.APE_PROFILES_CONFIG.activeProfileId) || 'P3';
    var m = mejorEscenario();
    var html = '';
    var linea = 'font-size:.82rem;margin-top:5px;';

    // ── ESTADO APROBADO: manda sobre el bloqueo ────────────────────────────────────────────
    // Tras pulsar Forzar el panel se repintaba y volvia a decir "Bloqueado", porque guard() sigue
    // bloqueando. El operador aplicaba el ajuste y el anuncio no cambiaba: parecia que no habia
    // hecho nada y no sabia que ya podia generar. Una vez aprobado, eso es lo que hay que decir.
    if (window.__APE_SUG_FORZADO__ === true) {
      el.innerHTML =
        '<div style="' + linea + 'color:#86efac;"><b>APROBADO</b>: ajustes aplicados por el operador.</div>' +
        '<div style="' + linea + 'color:#e2e8f0;">Enlace <b>' + s.inM.toFixed(1) + ' Mbps</b> · perfil <b>' +
        act + '</b> · delta <b>' + s.delta + '%</b>. Por debajo del suelo (' + s.floorM +
        ' Mbps), aceptado a sabiendas.</div>' +
        // El botón que aprueba NO genera: aplica y confirma. Quien elige la forma de
        // salida (VPS / DIRECTO / AMBAS) es el operador, con su botón. Mezclar ambos
        // actos produjo listas duplicadas: se aprobaba, se leía "pulsa Generar" y se
        // generaba una segunda vez.
        '<div style="' + linea + 'color:#86efac;font-weight:800;">Ajustes aplicados. La comprobación pasará cuando pulses generar.</div>' +
        '<div style="' + linea + 'color:#94a3b8;">Elige la salida: <b>Generar VPS</b>, <b>Generar DIRECTO</b> o <b>Generar AMBAS</b>. No se generó nada todavía.</div>' +
        '<div style="display:flex;gap:7px;align-items:center;margin-top:6px;">' +
        '<button type="button" id="ape-sug-revocar" style="background:#334155;color:#e2e8f0;border:1px solid #475569;' +
        'border-radius:6px;padding:5px 12px;font-weight:700;cursor:pointer;">Revocar aprobación</button>' +
        '</div>';
      var brv = document.getElementById('ape-sug-revocar');
      if (brv) brv.onclick = function () {
        window.__APE_SUG_FORZADO__ = false;
        status('Aprobación revocada; vuelve a estar bloqueado', '#94a3b8');
        renderSugerencia();
      };
      return;
    }
    if (window.__APE_SUG_DENEGADO__ === true) {
      el.innerHTML =
        '<div style="' + linea + 'color:#94a3b8;">Propuesta denegada. No se cambió ni el perfil ni el delta. ' +
        'Sigue bloqueado hasta que ajustes el enlace, el perfil o el delta a mano.</div>' +
        '<div style="display:flex;gap:7px;align-items:center;margin-top:6px;">' +
        '<button type="button" id="ape-sug-reabrir" style="background:#0ea5e9;color:#fff;border:0;' +
        'border-radius:6px;padding:5px 12px;font-weight:700;cursor:pointer;">Ver propuesta otra vez</button>' +
        '</div>';
      var bra = document.getElementById('ape-sug-reabrir');
      if (bra) bra.onclick = function () {
        window.__APE_SUG_DENEGADO__ = false;
        renderSugerencia();
      };
      return;
    }

    if (s.bloquea) {
      html += '<div style="' + linea + 'color:#fca5a5;">' +
        '<b>Bloqueado</b>: el perfil ' + act + ' necesita <b>' + s.reqArranque.toFixed(1) +
        ' Mbps</b> para arrancar (suelo ' + s.floorM + ' Mbps × ' + (1 + s.delta / 100).toFixed(2) +
        ') y el enlace mide <b>' + s.inM.toFixed(1) + ' Mbps</b>. Faltan <b>' +
        s.faltanArranque.toFixed(1) + ' Mbps</b>.</div>';

      if (m.viable) {
        // Hay al menos un escenario que entra: se propone EL MEJOR.
        var yaEsElActual = (m.viable.perfil === act && m.viable.delta === s.delta);
        html += '<div style="' + linea + 'color:#e2e8f0;"><b>Mejor escenario posible con lo que mides:</b></div>' +
          '<div style="' + linea + 'color:#86efac;">' +
          'Perfil <b>' + m.viable.perfil + '</b> · delta <b>' + m.viable.delta + '%</b> · ' +
          'pide <b>' + m.viable.req.toFixed(1) + ' Mbps</b> y tienes ' + s.inM.toFixed(1) +
          ' (margen ' + (s.inM - m.viable.req).toFixed(1) + ' Mbps)' +
          (yaEsElActual ? ' — <b>ya está aplicado</b>' : '') + '</div>' +
          '<div style="display:flex;gap:7px;align-items:center;margin-top:6px;flex-wrap:wrap;">' +
          '<button type="button" id="ape-sug-aprobar" style="background:#16a34a;color:#fff;border:0;border-radius:6px;' +
          'padding:5px 12px;font-weight:800;cursor:pointer;">Aprobar y aplicar</button>' +
          '<button type="button" id="ape-sug-denegar" style="background:#334155;color:#e2e8f0;border:1px solid #475569;' +
          'border-radius:6px;padding:5px 12px;font-weight:700;cursor:pointer;">Denegar</button>' +
          '</div>';
      } else {
        // Ninguno entra: se declara el mínimo imprescindible y se deja decidir.
        var mn = m.minimo;
        // Decir además QUÉ SE HIZO YA. Si el delta ya está en el mínimo del input (1 %), no hay nada
        // más que bajar, y hay que decirlo: si no, el operador aplica, sigue viendo el aviso y cree
        // que el ajuste no funcionó.
        var yaEnMinimo = (s.delta <= 1);
        html += '<div style="' + linea + 'color:#fbbf24;"><b>Ningún perfil entra</b> con ' +
          s.inM.toFixed(1) + ' Mbps, ni al delta mínimo del 1 %.</div>';

        // UMBRAL DE ARRANQUE: cuanto hace falta de verdad y cuanto tarda ahora.
        var bitratePerfil = 0;
        try {
          var _pp = window.APE_PROFILES_CONFIG && window.APE_PROFILES_CONFIG.profiles;
          bitratePerfil = Number(_pp && _pp[act] && _pp[act].settings && _pp[act].settings.bitrate) || 0;
        } catch (_e) { }
        if (bitratePerfil > 0) {
          var uArranque = umbralArranque(bitratePerfil);
          var tSeg = segundosPrimerSegmento(bitratePerfil, s.inM);
          html += '<div style="' + linea + 'color:#c4b5fd;"><b>Umbral de arranque</b>: ' + act +
            ' emite ' + bitratePerfil + ' Mbps, y bajar su primer segmento de ' + SEGMENTO_S +
            ' s en ' + ARRANQUE_S + ' s exige <b>' + uArranque.toFixed(1) + ' Mbps</b>. Con ' +
            s.inM.toFixed(1) + ' Mbps ese segmento tarda <b>' + tSeg.toFixed(1) + ' s</b>.</div>';
        }
        if (yaEnMinimo) {
          html += '<div style="' + linea + 'color:#86efac;">El delta ya está en el <b>mínimo posible (1 %)</b>: ' +
            'no queda nada que bajar por ese lado.</div>';
        }
        if (mn) {
          html += '<div style="' + linea + 'color:#94a3b8;">El mínimo imprescindible es <b>' + mn.perfil +
            '</b> con delta <b>1 %</b>: pide <b>' + mn.req.toFixed(2) + ' Mbps</b>. Faltan <b>' +
            mn.faltan.toFixed(2) + ' Mbps</b>.</div>' +
            '<div style="' + linea + 'color:#f59e0b;">No hay ajuste de perfil ni de delta que lo resuelva: ' +
            'solo subir el enlace. Si aun así quieres generar, apruébalo y queda registrado como forzado.</div>' +
            '<div style="display:flex;gap:7px;align-items:center;margin-top:6px;flex-wrap:wrap;">' +
            '<button type="button" id="ape-sug-forzar" style="background:#b45309;color:#fff;border:0;border-radius:6px;' +
            'padding:5px 12px;font-weight:800;cursor:pointer;">Aprobar y generar así</button>' +
            '<button type="button" id="ape-sug-denegar" style="background:#334155;color:#e2e8f0;border:1px solid #475569;' +
            'border-radius:6px;padding:5px 12px;font-weight:700;cursor:pointer;">Denegar</button>' +
            '</div>';
        }
      }
    } else if (!s.ok) {
      html += '<div style="' + linea + 'color:#fbbf24;">' +
        'Arranca (suelo ' + s.floorM + ' Mbps) pero no sostiene el techo de ' + s.outM + ' Mbps: ' +
        'faltan <b>' + s.faltanTecho.toFixed(1) + ' Mbps</b>. Se genera igual y el ABR baja de variante.' +
        '</div>';
    }
    el.innerHTML = html;

    // ── Handlers: actúan de verdad ──────────────────────────────────────────────────────────
    var ba = document.getElementById('ape-sug-aprobar');
    if (ba) ba.onclick = function () {
      aplicarEscenario(m.viable.perfil, m.viable.delta);
      window.__APE_SUG_DENEGADO__ = false;
      status('Aprobado: perfil ' + m.viable.perfil + ' · delta ' + m.viable.delta + '% · ' +
             s.inM.toFixed(1) + ' Mbps ≥ ' + m.viable.req.toFixed(1) + ' Mbps', '#22c55e');
      renderSugerencia();
    };

    var bf = document.getElementById('ape-sug-forzar');
    if (bf) bf.onclick = function () {
      // Aprobación explícita de un escenario que NO cumple: queda marcado para esta sesión.
      window.__APE_SUG_FORZADO__ = true;
      window.__APE_SUG_DENEGADO__ = false;
      var forced = aplicarForzadoP5();
      status('FORZADO: perfil ' + forced.profile + ' · delta ' + forced.delta + ' % con ' +
             s.inM.toFixed(1) + ' Mbps (el mínimo pide ' +
             (m.minimo ? m.minimo.req.toFixed(2) : '?') + ' Mbps). Aprobado por el operador.', '#f59e0b');
      renderSugerencia();
      // AQUÍ NO SE GENERA. Este botón hace dos cosas y solo dos: fijar el modo forzado
      // y escribir perfil + delta. Quien genera es el botón de salida que elija el
      // operador (VPS / DIRECTO / AMBAS), porque es él quien sabe qué lista quiere.
      // Antes esta función llamaba a runSelectedOutput() por su cuenta: el operador
      // aprobaba, leía "ya puedes pulsar Generar" y generaba una segunda vez.
      toast('Ajustes aplicados: perfil ' + forced.profile + ' · delta ' + forced.delta +
            ' %. Elige la salida y pulsa su botón (VPS / DIRECTO / AMBAS).', 'success');
    };

    var bn = document.getElementById('ape-sug-denegar');
    if (bn) bn.onclick = function () {
      window.__APE_SUG_DENEGADO__ = true;
      window.__APE_SUG_FORZADO__ = false;
      el.innerHTML = '<div style="' + linea + 'color:#94a3b8;">Propuesta denegada. ' +
        'No se cambió ni el perfil ni el delta. Sigue bloqueado hasta que ajustes el enlace, ' +
        'el perfil o el delta a mano.</div>';
      status('Propuesta denegada; no se aplicó ningún cambio', '#94a3b8');
    };
  }

  function checkGeneration() {
    var g = guard();
    renderSugerencia();
    if (!g.has) {
      toast('Sin medición de entrada: se permite generar, pero no se puede validar el buffer.', 'warning');
      return true;
    }
    if (g.canStart) {
      // Arranca, aunque no sostenga el techo. Se genera y se avisa; no se bloquea.
      if (!g.ok) {
        toast('El enlace (' + g.inM.toFixed(1) + ' Mbps) sostiene el perfil pero no su techo de ' +
              g.outM + ' Mbps: la lista se genera y el ABR elegirá variante.', 'warning');
      }
      return true;
    }
    // Aprobacion explicita del operador: si forzo el escenario, se respeta y se genera.
    if (window.__APE_SUG_FORZADO__ === true) {
      toast('Generando con aprobacion forzada: el enlace no alcanza el suelo del perfil.', 'warning');
      return true;
    }

    var s = sugerirAjuste();
    var salida = (s.bloquea ? 'Abre la propuesta y apruébala.' : '');
    toast('Buffer insuficiente para el suelo del perfil ' +
          ((window.APE_PROFILES_CONFIG && window.APE_PROFILES_CONFIG.activeProfileId) || '?') +
          ' (' + g.floorM + ' Mbps) con delta ' + DELTA_PCT + '%. ' + salida, 'error');
    status('BLOQUEADO: el perfil activo no cumple el delta ' + DELTA_PCT + '% · ' + salida, '#ef4444');
    return false;
  }

  async function runVps() {
    var d = applyDelta(false);
    if (!checkGeneration() || !formatGuard()) return;
    if (!isJsonMetadataOutput() && selectedFormat() === 'mpd') {
      try { await downloadActiveJitMpd(); }
      catch (e) { status('DASH/MPD: ' + e.message, '#ef4444'); toast('DASH/MPD: ' + e.message, 'error'); }
      return;
    }
    try {
      status('Generando VPS con delta ' + d + '%…', '#38bdf8');
      if (!isJsonMetadataOutput()) sendDeltaToVps(d);
      var result = await window.APEGenerationController.prepublishAndGenerateDual({ buffer_delta_pct: d, buffer_delta_array: getDeltaArray(d) });
      generationResultStatus(result, 'VPS completado · delta ' + d + '% (array por perfil)');
    } catch (e) { status('VPS falló: ' + e.message, '#ef4444'); toast('VPS falló: ' + e.message, 'error'); }
  }

  async function runDirect() {
    var d = applyDelta(false);
    if (!checkGeneration() || !formatGuard()) return;
    if (!isJsonMetadataOutput() && selectedFormat() === 'mpd') {
      try { await downloadActiveJitMpd(); }
      catch (e) { status('DASH/MPD: ' + e.message, '#ef4444'); toast('DASH/MPD: ' + e.message, 'error'); }
      return;
    }
    var out = currentOutOpts();
    if (isJsonMetadataOutput()) out.jit = false;
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
      if (!isJsonMetadataOutput()) sendDeltaToVps(d);
      var controller = window.APEGenerationController;
      var generateDirect = controller.prepublishAndGenerateDirect || controller.prepublishAndGenerate;
      var result = await generateDirect.call(controller, {
        buffer_delta_pct: d,
        buffer_delta_array: getDeltaArray(d),
        jit: out.jit,
        hdrMode: out.hdrMode,
        manifestMetadata: currentManifestMetadata()
      });
      generationResultStatus(result, 'DIRECTO completado · delta ' + d + '% (array por perfil)');
    } catch (e) {
      status('DIRECTO falló: ' + e.message, '#ef4444');
      toast('DIRECTO falló: ' + e.message, 'error');
    } finally {
      window.APE_DIRECT_MODE = prev.direct;
      window.APE_USE_JIT = prev.jit;
      window.APE_HDR_MODE = prev.hdr;
    }
  }

  // AMBAS = dos archivos desde una generación: DIRECTA y CDN.
  async function runBoth() {
    var d = applyDelta(false);
    if (!checkGeneration() || !formatGuard()) return;
    if (!isJsonMetadataOutput() && selectedFormat() === 'mpd') {
      try { await downloadActiveJitMpd(); }
      catch (e) { status('DASH/MPD: ' + e.message, '#ef4444'); toast('DASH/MPD: ' + e.message, 'error'); }
      return;
    }
    try {
      status('Generando AMBAS: DIRECTA + CDN · delta ' + d + '%…', '#38bdf8');
      if (!isJsonMetadataOutput()) sendDeltaToVps(d);
      var result = await window.APEGenerationController.prepublishAndGenerateDual({ dual: 'both', buffer_delta_pct: d, buffer_delta_array: getDeltaArray(d) });
      generationResultStatus(result, 'AMBAS completado: DIRECTA + CDN · delta ' + d + '%');
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
      '<label style="cursor:pointer;"><input type="radio" name="ape-out-format" value="mpd" style="accent-color:#38bdf8;"> DASH (M3U)</label>' +
      '<label style="cursor:pointer;"><input type="radio" name="ape-out-format" value="hybrid" style="accent-color:#a855f7;"> HÍBRIDA</label>' +
      '<span id="ape-out-matrix-state" style="color:#94a3b8;font-size:.74rem;">HLS · .M3U8</span>' +
      '<button type="button" id="ape-mpd-snapshot" style="cursor:pointer;background:#1e293b;color:#cbd5e1;border:1px solid #475569;border-radius:5px;padding:3px 7px;">MPD diagnóstico</button>' +
      '<span style="font-size:.82rem;color:#64748b;flex-basis:100%;">DASH (M3U) enlaza el MPD servido de un canal JIT activo. MPD diagnóstico guarda una instantánea para inspección; usa la M3U DASH para reproducir.</span>' +
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
      '<div style="font-weight:800;color:#67e8f9;font-size:1.05rem;">AMBAS · dos listas</div>' +
      '<div style="font-size:.8rem;color:#94a3b8;margin:4px 0 7px;">Un archivo DIRECTA y otro CDN, con los mismos canales</div>' +
      '<button data-ape-run="both" style="background:linear-gradient(135deg,#0891b2,#22d3ee);color:#06240f;border:0;border-radius:7px;padding:7px 12px;font-size:.82rem;font-weight:800;cursor:pointer;">Generar AMBAS</button>' +
      '<span style="font-size:.84rem;color:#64748b;margin-left:7px;">dos archivos M3U</span></div>' +
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
      '<div id="ape-buf-sugerencia" style="margin-top:7px;"></div>' +
      '<div style="background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.25);border-radius:10px;padding:10px;font-size:.8rem;color:#94a3b8;">' +
      '<div style="font-weight:800;color:#e2e8f0;">MODO</div>' +
      '<select id="ape-gen-mode-select" style="margin-top:5px;width:100%;padding:5px 6px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;font-size:.74rem;">' +
      '<option value="strict_terminal">Strict Terminal · &gt;99% 200</option>' +
      '<option value="balanced_95" selected>Balanced 95 · &gt;95% playback</option>' +
      '<option value="diagnostic">Diagnostic · auditoría</option>' +
      '</select><div id="ape-gen-mode" style="margin-top:3px;color:#c4b5fd;font-size:.82rem;">—</div></div>' +
      '</div>';
    tab.insertBefore(panel, tab.firstChild);

    var snapshotButton = document.getElementById('ape-mpd-snapshot');
    if (snapshotButton) snapshotButton.addEventListener('click', async function () {
      try { await downloadActiveJitMpd(true); }
      catch (e) { status('MPD diagnóstico: ' + e.message, '#ef4444'); toast('MPD diagnóstico: ' + e.message, 'error'); }
    });

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
        (oj && oj.checked ? 'JIT ' : '') + hdrTxt + ' · ' + (f === 'mpd' ? 'M3U → MPD servido' : '.' + f.toUpperCase());
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
