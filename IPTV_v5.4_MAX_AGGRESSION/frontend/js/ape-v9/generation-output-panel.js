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
  // [2026-11-21] Motivo REAL del ultimo fallo del catalogo JIT.
  // Antes ensureJitCatalog() devolvia solo `false` y el motivo moria en el catch: runDirect
  // anunciaba "JIT no disponible: fallback a DIRECTO" sin decir por que, y la lista salia
  // sin JIT sin dejar rastro. Medido: un catalogo que responde 503 y un catalogo valido
  // pero vacio producian el MISMO mensaje, asi que el operador no podia distinguirlos.
  var _jitLastReason = '';
  // Clave estable del registro durable del fallback: sobrevive a la recarga del panel.
  var JIT_FALLBACK_KEY = 'ape_last_jit_fallback';

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
    // [HÍBRIDO APE CRYSTAL · 2026-11-24] El JIT queda fuera del camino híbrido:
    // en la ventana medida devolvió 503 PROVIDER_SLOT_BUSY y no trae fallback.
    // Todo va por /pulse con p=P1 (P0 para 8K). Sólo se fuerza cuando la App
    // declara el flag explícitamente; el arnés Node (sin flag) conserva su JIT.
    // Rollback: window.APE_HYBRID_CRYSTAL=false.
    var hybrid = (typeof window !== 'undefined' && window.APE_HYBRID_CRYSTAL === true);
    return { jit: hybrid ? false : !!(oj && oj.checked), hdrMode: hdr };
  }

  // [2026-11-15] OPCIONES COMUNES DE GENERACION, para que las selecciones valgan
  // en LAS CUATRO salidas y no solo en DIRECTO.
  //
  // Medido antes de este cambio: runDirect() pasaba {jit, hdrMode} a
  // prepublishAndGenerateDirect, y runVps()/runBoth()/runLight() llamaban a
  // prepublishAndGenerateDual con SOLO el delta. Resultado: marcar JIT o elegir PQ
  // no tenia ningun efecto sobre la lista VPS, AMBAS ni LIGHT — la casilla pintaba
  // y el generador no se enteraba.
  //
  // Y si se entera: generation-controller.js:1359-1360 hace
  //   window.APE_USE_JIT = options.jit === true;
  //   window.APE_HDR_MODE = options.hdrMode || 'auto';
  // y el generador consume APE_USE_JIT en m3u8-typed-arrays-ultimate.js:8685 y
  // APE_HDR_MODE -> merged.hdr_force en generation-controller.js:1532-1533.
  function genOpts(d) {
    var out = currentOutOpts();
    var o = { buffer_delta_pct: d, buffer_delta_array: getDeltaArray(d) };
    // En JSON de metadatos no se aplica routing ni HDR: es el catalogo tal cual.
    if (!isJsonMetadataOutput()) {
      o.jit = out.jit === true;
      o.hdrMode = out.hdrMode || 'auto';
      // [2026-11-15] HIBRIDA = los DOS formatos en UN fichero.
      // Antes la opcion descargaba un segundo archivo (la M3U que apunta al MPD del JIT),
      // con dos problemas medidos: dos descargas que el operador tenia que emparejar, y la
      // segunda podia fallar sola (503 PROVIDER_SLOT_BUSY) dejando la salida a medias.
      // Ahora el generador emite #EXT-X-APE-DASH-CONTAINER con el manifiesto DASH como
      // metadata JSON DENTRO del mismo .m3u8: un reproductor HLS lo ignora (RFC 8216) y un
      // consumidor DASH lee solo ese tag. Nada se pisa porque nadie lee lo mismo.
      o.hybrid = (selectedFormat() === 'hybrid');
      // [2026-11-23 · INTEGRACIÓN 4K/6K EN LA LISTA] La intención declarada viaja con
      // la generación, además del global window.APE_4K6K_AUDIT que consulta el emisor
      // por canal. Así queda declarada en el mismo objeto de opciones que JIT y HDR, y
      // una prueba puede pedirla sin depender del estado de la página.
      o.intent4k6k = intentOn();
    }
    return o;
  }

  // [2026-11-15] Etiqueta honesta de lo que se esta aplicando, para que la barra de
  // estado diga la verdad de lo que va a salir en la lista y no solo el delta.
  // Si no hay JIT ni HDR forzado no añade ruido: devuelve cadena vacia.
  function _outOptsLabel() {
    try {
      if (isJsonMetadataOutput()) return ' · JSON metadatos (rutas de origen)';
      var o = currentOutOpts();
      var parts = [];
      if (o.jit) parts.push('JIT');
      if (o.hdrMode && o.hdrMode !== 'auto') parts.push('HDR ' + String(o.hdrMode).toUpperCase());
      // [2026-11-23 · INTEGRACIÓN 4K/6K] Si la casilla está encendida, la barra de estado
      // lo dice: la lista llevará una línea #EXT-X-APE-4K6K-INTENT por canal.
      if (intentOn()) parts.push('4K6K');
      return parts.length ? ' · ' + parts.join(' · ') : '';
    } catch (_) { return ''; }
  }

  // [2026-11-15 · MANDATO DEL OPERADOR] HIBRIDA EN UN SOLO FICHERO.
  // Antes esta opcion descargaba un SEGUNDO archivo (la M3U que enlaza el MPD del JIT).
  // Dos descargas que emparejar, y la segunda podia fallar sola (503 PROVIDER_SLOT_BUSY
  // medido) dejando la salida a medias sin que la primera lo supiera.
  // Ahora NO se descarga nada aparte: el generador emite #EXT-X-APE-DASH-CONTAINER con el
  // manifiesto DASH como metadata JSON dentro del MISMO .m3u8. El reproductor HLS lo
  // ignora (RFC 8216 6.3.1) y el consumidor DASH lee solo ese tag: los dos formatos
  // integrados, ninguno se pisa y ninguno depende del otro para existir.
  function deliverHybridDash() {
    if (selectedFormat() !== 'hybrid' || isJsonMetadataOutput()) return;
    status('HÍBRIDA: los dos formatos van en el MISMO archivo · HLS en el cuerpo, DASH en '
      + '#EXT-X-APE-DASH-CONTAINER', '#a855f7');
  }

  // ── CABLEADO EXPLÍCITO POR SALIDA · APE_PULSE_WRAP ────────────────────────────────────────
  //
  // [2026-11-21 · ORDEN DEL OPERADOR] Medido antes de este cambio: NADIE en todo el frontend
  // escribía window.APE_PULSE_WRAP (grep: solo las 2 referencias del generador, comentario y
  // lectura). El default del generador decidía por todos, así que TODAS las salidas salían
  // envueltas por /pulse/ — incluida DIRECTO, cuyo rótulo decía "URLs del proveedor · sin CDN".
  // El rollback documentado no tenía superficie de control: no había forma de pedir otra cosa.
  //
  // Ahora el panel lo fija POR SALIDA y lo restaura en finally. El generador lo lee una vez por
  // ejecución en m3u8-typed-arrays-ultimate.js:13344 (`APE_PULSE_WRAP === false` desactiva).
  // true  = la URL emitida es /pulse/<id>.m3u8?u=<url origen>&d=<dev>: el vídeo pasa por el VPS.
  // false = la URL del proveedor tal cual.
  function pulseWrapForOutput() {
    // Export JSON de metadatos = catálogo de ORIGEN: envolver sus URL cambiaría el catálogo.
    // Es la ÚNICA salida sin cablear, y el estado lo declara en vez de dejarlo a la deducción.
    return !isJsonMetadataOutput();
  }

  function applyPulseWrap(value) {
    var prev = window.APE_PULSE_WRAP;
    window.APE_PULSE_WRAP = value;
    return prev;
  }

  function restorePulseWrap(prev) {
    // Se restaura el valor EXACTO previo, incluido el caso de que la clave no existiera.
    // Dejarla en `undefined` sería equivalente para el generador (solo compara con false),
    // pero no es lo mismo que no existir; un test de restauración debe poder distinguirlo.
    if (prev === undefined) {
      try { delete window.APE_PULSE_WRAP; } catch (_) { window.APE_PULSE_WRAP = undefined; }
      return;
    }
    window.APE_PULSE_WRAP = prev;
  }

  // Etiqueta del cableado para la línea de estado. Sin adjetivos: el dato.
  // [2026-11-21 · t16 (hallazgo t8)] La forma anterior —'cableada por VPS (/pulse/)'— era un
  // hecho NO medido: _apePulseWrap (m3u8-typed-arrays-ultimate.js) sólo envuelve URLs con id
  // numérico; un canal sin id numérico sale TAL CUAL al proveedor. Medido y fijado en
  // rea-generation-dispatch.test.js ('una URL sin id numérico NO se envuelve').
  // Y el panel NO recibe del generador el conteo de envueltas/omitidas, así que no puede
  // pintar 'N/M cableadas' sin inventárselo: declara INTENCIÓN + ALCANCE.
  function _pulseLabel(flag) {
    if (flag === true) return ' · cableado solicitado por VPS (/pulse/); los canales sin id numérico quedan directos';
    if (isJsonMetadataOutput()) return ' · catálogo de origen (sin /pulse/)';
    return ' · directa al proveedor';
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
    if (_jitMap.size > 0) { _jitLastReason = ''; return true; }
    if (_jitLoading) return _jitLoading;

    _jitLoading = (async function () {
      _jitLastReason = '';
      try {
        var r = await fetch(JIT_BASE + '/jit/catalog.json', { cache: 'no-store' });
        if (!r.ok) throw new Error('catalog HTTP ' + r.status);
        var j = await r.json();
        var list = Array.isArray(j) ? j : (j.channels || []);
        var map = new Map();
        list.forEach(function (c) {
          if (c && c.id && c.hls) map.set(String(c.id), c.hls);
        });
        _jitMap = map;
        if (map.size === 0) {
          // Catalogo servido y valido pero sin ninguna fila usable: NO es un error de red,
          // y decirlo como "fallo" seria otra mentira. Se nombra lo que se midio.
          _jitLastReason = 'catálogo JIT sin canales usables (' + list.length + ' filas, 0 con id+hls)';
          return false;
        }
        return true;
      } catch (e) {
        _jitMap = new Map();
        _jitLastReason = (e && e.message) ? String(e.message) : 'error desconocido al leer el catálogo JIT';
        return false;
      } finally {
        _jitLoading = null;
      }
    })();

    return _jitLoading;
  }

  function jitCatalogReason() {
    return _jitLastReason;
  }

  // [2026-11-21 · DEFECTO (1) CERRADO: EL FALLBACK DEJA DE SER SILENCIOSO]
  // Medido antes: con JIT marcado y ensureJitCatalog() fallando, runDirect ponia
  // out.jit = false y lanzaba un toast generico. La lista salia con las URL del proveedor,
  // el operador creia haber generado una lista JIT y no quedaba ni el motivo ni la fecha.
  // Dos piezas: una linea de estado en rojo con el motivo real, y un registro durable en
  // localStorage para que el fallo siga siendo auditable despues de recargar el panel.
  function recordJitFallback(reason) {
    var at = Date.now();
    var rec = { at: at, iso: new Date(at).toISOString(), reason: String(reason || ''), requested: true };
    // [2026-11-21 · t3] persisted dice si el registro REALMENTE quedo escrito.
    // Se devuelve a quien anuncia, porque "consta en localStorage" solo se puede afirmar
    // cuando setItem no lanzo. Con el storage bloqueado o sin cuota el throw es la unica
    // respuesta y NO se escribe nada: decir lo contrario seria vender una durabilidad falsa.
    // Dejar constancia tampoco puede romper la generacion: se traga el error y se sigue.
    try {
      localStorage.setItem(JIT_FALLBACK_KEY, JSON.stringify(rec));
      rec.persisted = true;
    } catch (_) {
      rec.persisted = false;
    }
    return rec;
  }

  function announceJitFallback(reason, persisted) {
    var why = String(reason || '').trim() || 'motivo no devuelto por el catálogo';
    if (persisted === true) {
      status('DIRECTO sin JIT: fallback registrado · ' + why +
        ' · consta en localStorage.' + JIT_FALLBACK_KEY + ' (se repinta al recargar el panel)', '#ef4444');
      // El registro existe: se pinta ya el badge persistente, sin esperar a un re-render.
      renderJitFallbackBadge();
      return;
    }
    // persisted=false: setItem lanzo. Se dice tal cual y se conserva el motivo en el DOM,
    // que es el unico sitio donde queda. No se promete durabilidad que no hubo.
    status('DIRECTO sin JIT: fallback · ' + why +
      ' · registro NO persistido (storage bloqueado/sin cuota) · el motivo queda solo en este estado', '#ef4444');
  }

  // [2026-11-21 · t3] READ-BACK del registro. Antes el estado afirmaba "consta en
  // localStorage" y NINGUN codigo volvia a leer esa clave: el registro existia, pero el panel
  // nunca lo mostraba, asi que "no lo pierdes" era una promesa sin comprobacion. Ahora se lee
  // al pintar el panel y se pinta en una linea persistente.
  function readJitFallback() {
    try {
      var raw = localStorage.getItem(JIT_FALLBACK_KEY);
      if (!raw) return null;
      var rec = JSON.parse(raw);
      // Sin un reason de texto no hay nada que contar: un objeto raro no se pinta como fallo.
      return rec && typeof rec === 'object' && typeof rec.reason === 'string' ? rec : null;
    } catch (_) {
      // Storage bloqueado o JSON corrupto: NO hay dato. No se inventa uno.
      return null;
    }
  }

  function renderJitFallbackBadge() {
    var rec = readJitFallback();
    if (!rec) return null;
    var when = rec.iso || (rec.at ? new Date(rec.at).toISOString() : 'fecha no registrada');
    var el = document.getElementById('ape-jit-fallback');
    if (el) {
      el.textContent = 'Último fallback de JIT · ' + when + ' · ' + rec.reason;
      el.style.color = '#f59e0b';
      el.title = 'Registro durable en localStorage.' + JIT_FALLBACK_KEY +
        ' · requested=' + (rec.requested !== false);
    }
    // Tambien por consola: si el panel no llego a pintarse (o el badge no existe en este
    // DOM), el dato sigue siendo visible sin abrir el inspector de localStorage a mano.
    try { console.info('[APE-OUT] último fallback de JIT:', when, rec.reason); } catch (_) { }
    return rec;
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
      // [2026-11-21] Expuesto para poder comprobar, sin navegador, que el motivo que se
      // pinta en el estado es el REAL que devolvio el catalogo y no una cadena fija.
      jitCatalogReason: jitCatalogReason,
      recordJitFallback: recordJitFallback,
      // [2026-11-21 · t3] Read-back del registro durable: la prueba comprueba que lo escrito
      // se vuelve a leer y se pinta, no solo que se escribio.
      readJitFallback: readJitFallback,
      renderJitFallbackBadge: renderJitFallbackBadge,
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
      // [ronda 19] Expuestos para comprobar sin navegador que el aviso, la tabla y el badge de
      // estado usan TODOS la misma cifra de enlace y el mismo suelo por perfil.
      linkInfo: linkInfo,
      floorDePerfil: floorDePerfil,
      aplicarForzadoP5: aplicarForzadoP5,
      renderSugerencia: renderSugerencia,
    renderBufferPlan: renderBufferPlan,
      mejorEscenario: mejorEscenario,
      aplicarEscenario: aplicarEscenario,
      getDeltaPct: function () { return DELTA_PCT; },
      // [2026-11-15] Expuestos para probar que JIT y HDR llegan a LAS CUATRO salidas
      // y que la HIBRIDA entrega tambien la parte DASH. Sin esto la unica forma de
      // verificar la promesa seria a ojo en el navegador.
      genOpts: genOpts,
      outOptsLabel: _outOptsLabel,
      deliverHybridDash: deliverHybridDash,
      runLight: runLight,
      // selPaint se expone mas abajo, dentro de render(), que es donde se define.
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
    renderBufferPlan();   // y la tabla por perfil se repinta con el delta nuevo
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

  // Lectura del estado ya pintado. La necesita runDirect para CONSERVAR el mensaje que dejo
  // generationResultStatus (cancelada / ya hay una generacion en curso) y solo ANADIR el
  // motivo del JIT como sufijo, en vez de reemplazarlo.
  function statusText() {
    var el = $('#ape-gen-status');
    return el && el.textContent ? String(el.textContent) : '';
  }

  function generationResultStatus(result, success, suffix) {
    var decision = result && result.decision || '';
    if (decision.indexOf('cancelled') === 0) { status('Generación cancelada.', '#f59e0b'); return; }
    if (decision === 'skipped_already_running') { status('Ya hay una generación en curso.', '#f59e0b'); return; }
    // suffix opcional: el cableado real de la lista (o el catalogo de origen). No se añade en
    // cancelada ni en skip porque ahi NO hay lista producida que cablear.
    status((result && result.notice ? result.notice : success) + (suffix || ''), '#22c55e');
  }

  // [2026-11-21 · t19] CRITERIO ÚNICO de «generación completada».
  // Antes vivía inline en la rama JIT de runDirect; ahora es una función para que runLight use
  // EL MISMO criterio y no exista un segundo criterio paralelo que pueda divergir. La semántica
  // es la de siempre, sin cambios: una decisión que EMPIEZA por 'cancelled' (cancelled_by_user,
  // cancelled_*) o 'skipped_already_running' NO es una lista producida; cualquier otra cosa
  // (incluido un `notice`, o un result sin decision) cuenta como completada, como hasta hoy.
  function generationCompleted(result) {
    var decision = String((result && result.decision) || '');
    return decision.indexOf('cancelled') !== 0 && decision !== 'skipped_already_running';
  }

  function selectedFormat() {
    var r = document.querySelector('input[name="ape-out-format"]:checked');
    return r ? r.value : 'm3u8';
  }

  function isJsonMetadataOutput() {
    var selected = document.getElementById('genExportFormat');
    return !!(selected && selected.value === 'json');
  }

  // opts.dashNotice === false silencia SOLO el aviso informativo de la rama DASH.
  // [2026-11-21] Lo necesita LIGHT: llama a este guard igual que las otras tres salidas,
  // pero su rama DASH no genera nada, asi que el aviso "se descargara una M3U con la URL
  // del MPD" seria falso justo antes de abortar. Las otras tres salidas no pasan opts y
  // conservan su comportamiento byte a byte.
  function formatGuard(opts) {
    var dashNotice = !(opts && opts.dashNotice === false);
    if (isJsonMetadataOutput()) {
      status('JSON de metadatos: conserva las URL de origen; DIRECTA/CDN/AMBAS se aplican a M3U.', '#38bdf8');
      return true;
    }
    var f = selectedFormat();
    if (f === 'mpd') {
      if (dashNotice) {
        toast('DASH: se descargará una M3U con la URL del MPD servido del canal JIT activo.', 'info');
        status('DASH: preparando lista de un canal JIT activo', '#38bdf8');
      }
      return true;
    }
    if (f === 'hybrid') {
      // [2026-11-15 · MANDATO DEL OPERADOR] HIBRIDA = los DOS formatos en UN SOLO fichero.
      // Antes decia "se descargaran DOS archivos" y asi era: la lista HLS y aparte una M3U
      // que apuntaba al MPD del JIT. El operador lo corrigio: un fichero con los dos
      // formatos integrados, sin que ninguno se pise y sin que ninguno falle.
      toast('HÍBRIDA: un solo archivo .m3u8 con los DOS formatos — HLS en el cuerpo y el manifiesto DASH en #EXT-X-APE-DASH-CONTAINER.', 'info');
      status('HÍBRIDA: HLS + DASH integrados en el mismo archivo', '#a855f7');
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
      // Honesto: el JIT sirve un canal a la vez y ahora mismo ninguno tiene pipeline.
      // No se inventa un id ni se cae a un enlace fijo que devolveria 503.
      throw new Error('no hay canal JIT activo (0 de ' + list.length + '); abre primero su salida HLS/JIT');
    }
    var dash = String(active.dash || (base + '/jit/live/' + encodeURIComponent(active.id) + '/manifest.mpd'));
    if (/[\u0000-\u0020\u007f]/.test(dash)) throw new Error('URL DASH inválida');
    var absoluteDash = new URL(dash, catRes.url || base + '/jit/catalog.json');
    if (!/^https?:$/.test(absoluteDash.protocol)) throw new Error('URL DASH debe usar HTTP(S)');
    // Preserve already absolute signed URLs byte for byte, including query
    // ordering, duplicate parameters, percent escapes and authorization.
    if (!/^https?:\/\//i.test(dash)) dash = absoluteDash.href;
    var r = await fetch(dash, { cache: 'no-store' });
    if (!r.ok) {
      // [2026-11-15] El motivo real del fallo, no solo el codigo. Medido en produccion:
      // el JIT responde 503 con "PROVIDER_SLOT_BUSY: use provider-direct; source
      // unchanged" cuando el proveedor ya tiene su unica conexion ocupada. Decir solo
      // "MPD HTTP 503" oculta la causa y hace pensar que el panel esta roto.
      var why = '';
      try { why = (await r.text()).slice(0, 160).trim(); } catch (_) { }
      throw new Error('MPD HTTP ' + r.status + (why ? ' · ' + why : ''));
    }
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
  // El suelo bueno es el que declara el catálogo cargado (`settings.bandwidth_floor`, en bps), que
  // a su vez viene del JSON LAB CALIBRATED. La tabla de abajo es SOLO respaldo para cuando un perfil
  // llegue sin ese campo; sus números son los del LAB medidos en esta ronda (perfil: bps -> Mbps):
  //   P0 52 325 000 -> 52.325 | P1 24 700 000 -> 24.7  | P2 12 259 000 -> 12.259
  //   P3  6 500 000 ->  6.5   | P4  1 345 500 ->  1.3455| P5  1 300 000 ->  1.3
  // Antes decía 15 / 12 / 8 / 5 / 3 / 1.5, que no son los del LAB: daba un suelo falso en los seis
  // perfiles si el catálogo no estaba cargado.
  var FLOOR_MBPS = { P0: 52.325, P1: 24.7, P2: 12.259, P3: 6.5, P4: 1.3455, P5: 1.3 };
  function activeFloorMbps() {
    try {
      var cfg = window.APE_PROFILES_CONFIG;
      var id = (cfg && cfg.activeProfileId) || 'P3';
      var p = cfg && cfg.profiles ? cfg.profiles[id] : null;
      var f = p && p.settings ? p.settings.bandwidth_floor : 0;
      if (Number(f) > 0) return Number(f) / 1e6;   // bps -> Mbps
      return Number(FLOOR_MBPS[id]) || 0;
    } catch (_) { return 0; }
  }

  // ── DE DÓNDE SALE LA CIFRA DE ENLACE (ronda 19) ─────────────────────────────────────────────
  // El aviso trataba la SEMILLA del medidor como si fuera una medición. `APE_BW.snapshot()`
  // devuelve `seed().mbps` mientras no haya muestras reales, y esa semilla es o
  // `navigator.connection.downlink` (estimación del navegador, en escalones: 0,3 es uno de
  // ellos) o los 10 Mbps del arranque. Pintar eso como «el enlace mide 0,3 Mbps» afirma una
  // medición que nadie hizo, y además bloqueaba la generación por ella.
  // Aquí se separa medición de estimación, y el valor escrito a mano en «Enlace medido» manda
  // sobre todo lo demás: es el único número que alguien afirma.
  // Compatibilidad: si el snapshot no declara NI fuente NI muestras (los arneses de prueba), se
  // sigue aceptando como medición. Desconocido no es igual a semilla.
  function manualLinkMbps() {
    try {
      var li = document.getElementById('ape-link-input');
      var v = li ? parseFloat(li.value) : NaN;
      if (isFinite(v) && v > 0) return v;
    } catch (_) { }
    return 0;
  }

  function linkInfo() {
    var man = manualLinkMbps();
    if (man > 0) {
      return { mbps: man, kind: 'manual', source: 'escrito en Enlace medido', samples: null, confidence: 'declarado', measured: true };
    }
    var s = null;
    try { s = window.APE_BW && typeof window.APE_BW.snapshot === 'function' ? window.APE_BW.snapshot() : null; } catch (_) { s = null; }
    var mbps = s && Number(s.mbps) > 0 ? Number(s.mbps) : 0;
    if (!(mbps > 0)) {
      return { mbps: 0, kind: 'none', source: 'sin medidor de enlace', samples: 0, confidence: 'none', measured: false };
    }
    var src = String(s.source || '');
    var conf = String(s.confidence || '');
    var samples = (s.samples == null) ? null : Number(s.samples);
    var esSemilla = src === 'startup-default' || src === 'connection.downlink' || conf === 'none' || samples === 0;
    return {
      mbps: mbps,
      kind: esSemilla ? 'seed' : 'measured',
      source: src || 'medidor',
      samples: samples,
      confidence: conf || 'sin declarar',
      measured: !esSemilla
    };
  }

  function inputMbps() { return linkInfo().mbps; }

  function guard() {
    var L = linkInfo();
    var inM = L.mbps, outM = activeBitrate(), floorM = activeFloorMbps();
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
      // Con una estimación del navegador no se puede afirmar que el buffer esté bien o mal: se dice
      // que no hay medición, en vez de colgarle al operador una etiqueta que nadie midió.
      b.textContent = !has ? 'SIN DATO' : (!L.measured ? 'SIN MEDICIÓN' : (ok ? 'BUFFER OK' : (canStart ? 'BUFFER RIESGO' : 'BUFFER INSUFICIENTE')));
      b.style.color = !has ? '#f59e0b' : (!L.measured ? '#94a3b8' : (ok ? '#22c55e' : (canStart ? '#f59e0b' : '#ef4444')));
    }
    return { inM: inM, outM: outM, floorM: floorM, has: has, ok: ok, canStart: canStart, link: L, linkMeasured: L.measured, linkKind: L.kind };
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
      inM: g.inM, outM: g.outM, floorM: g.floorM, ok: g.ok, canStart: g.canStart,
      // ronda 19: de dónde sale inM y si eso es una medición de verdad
      linkKind: g.linkKind, linkMeasured: g.linkMeasured, linkSource: g.link ? g.link.source : '',
      linkSamples: g.link ? g.link.samples : null,
      sinMedida: g.has && !g.linkMeasured
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

    // perfiles alcanzables con el delta VIGENTE, de mejor a peor.
    // El catálogo manda: antes había aquí una lista fija de 6 ('P0'…'P5') y el catálogo tiene 12,
    // así que medio catálogo (P0.5…P5.5) no se consideraba nunca.
    out.alcanzables = [];
    var ids = profileIds();
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

    // El catálogo manda: la lista fija de 6 dejaba fuera P0.5…P5.5, o sea la mitad del catálogo.
    var ids = profileIds();
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

    // mínimo imprescindible: el perfil con el SUELO más bajo de todo el catálogo, a delta 1 %.
    // Estaba clavado en 'P5': con 12 perfiles eso ignoraba P0.5…P5.5 y podía señalar como mínimo
    // un perfil que no lo es. Se busca en el catálogo, no en una lista fija.
    var pisoId = null, pisoBajo = 0;
    for (var q = 0; q < ids.length; q++) {
      var fq = floorDePerfil(ids[q]);
      if (fq > 0 && (pisoId === null || fq < pisoBajo)) { pisoId = ids[q]; pisoBajo = fq; }
    }
    if (pisoId && pisoBajo > 0) {
      var req = pisoBajo * 1.01;
      out.minimo = { perfil: pisoId, delta: 1, req: req, faltan: Math.max(0, req - g.inM), floor: pisoBajo };
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
  function aplicarForzadoP5(perfilPedido) {
    var g0 = guard();
    // El perfil forzado NO es fijo: se usa el que la matriz señala como mínimo imprescindible y, si
    // no hay matriz, el de suelo más bajo del catálogo. Antes estaba clavado en 'P5': con 12
    // perfiles podía forzar un perfil que no es el mínimo y anunciarlo como si lo fuera.
    var profile = perfilPedido || (function () {
      try {
        var m = mejorEscenario();
        if (m && m.minimo && m.minimo.perfil) return m.minimo.perfil;
      } catch (_) { }
      return 'P5';
    })();
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
  // ── RONDA 18 · tabla por perfil DENTRO de la tarjeta CONDICIÓN DE BUFFER ──────────────
  // Los bitrates salen del catálogo del gestor de perfiles (window.APE_PROFILES_CONFIG, el
  // que se rellena con el JSON LAB CALIBRATED) y la aritmética la pone buffer-input-demand.js
  // (window.APE_BUF_DEMAND). Aquí no hay ni una cifra de perfil escrita a mano: si el catálogo
  // no trae el bitrate de un perfil, se dice, no se rellena.
  function renderBufferPlan() {
    var box = document.getElementById('ape-buf-plan');
    if (!box) return;
    var D = window.APE_BUF_DEMAND;
    if (!D || typeof D.plan !== 'function') {
      box.innerHTML = '<div style="color:#fbbf24;">Aritmética no disponible (js/ape-v9/buffer-input-demand.js no cargado): tabla NO COMPUTADA.</div>';
      return;
    }
    var profs = [];
    try {
      var cfg = window.APE_PROFILES_CONFIG;
      var raw = null;
      if (cfg && typeof cfg.getAllProfiles === 'function') raw = cfg.getAllProfiles();
      else if (cfg && cfg.profiles) raw = cfg.profiles;
      if (Array.isArray(raw)) {
        raw.forEach(function (p) { if (p) profs.push({ id: p.id || p.profile || p.name, settings: p.settings || p }); });
      } else if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(function (k) {
          var p = raw[k] || {};
          profs.push({ id: p.id || k, settings: p.settings || p });
        });
      }
    } catch (_) { profs = []; }

    var delta = (typeof DELTA_PCT === 'number' && isFinite(DELTA_PCT)) ? DELTA_PCT : 10;
    // La MISMA cifra de enlace que usa el aviso (y el mismo origen declarado). Antes la tabla leía
    // sólo el campo a mano y el aviso leía sólo el medidor: dos verdades en la misma tarjeta.
    var L = linkInfo();
    var linkBps = (L.mbps > 0) ? Math.round(L.mbps * 1e6) : undefined;
    var origen = (L.kind === 'manual')
      ? 'escrito a mano en «Enlace medido»'
      : (L.kind === 'measured'
        ? 'medición del medidor de enlace' + (L.samples ? ' (' + L.samples + ' muestras)' : '')
        : (L.kind === 'seed' ? 'estimación del navegador, NO una medición' : 'sin medidor de enlace'));

    if (!profs.length) {
      box.innerHTML = '<div style="color:#fbbf24;">Sin catálogo de perfiles cargado: no hay tabla que comparar (NO COMPUTADO).</div>';
      return;
    }

    var plan;
    try {
      plan = window.APE_BUF_DEMAND.plan(profs, { deltaPct: delta, linkBps: linkBps, bufferMs: 15000 });
    } catch (e) {
      box.innerHTML = '<div style="color:#fca5a5;">La tabla no se pudo calcular: ' + String((e && e.message) || e) + '</div>';
      return;
    }

    var mbps = function (bps) {
      if (bps == null || !isFinite(bps)) return '—';
      return (bps / 1e6).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' Mbps';
    };

    var rows = ['<div style="color:#86efac;font-weight:800;">Condición de buffer por perfil con delta ' + plan.delta_pct +
      ' % · cifras del gestor de perfiles (suelo de arranque y techo de la escalera)</div>'];
    if (plan.delta_pct !== delta) {
      rows.push('<div style="margin-top:3px;color:#fbbf24;">La aritmética de buffer no acepta delta 0 (lo trata como no ' +
        'especificado): ha calculado con ' + plan.delta_pct + ' %. Se declara aquí en vez de mentir en la tabla.</div>');
    }
    if (linkBps != null) {
      rows.push('<div style="margin-top:3px;color:#94a3b8;font-style:italic;">Enlace ' + mbps(linkBps) +
        ': ' + origen + '. Las dos columnas se miden contra ese mismo número.</div>');
    }
    var list = plan.profiles || [];
    var nArranca = 0, nTecho = 0, nConDato = 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r.output_known) {
        rows.push('<div style="margin-top:3px;color:#fbbf24;">' + r.id + ' · sin bitrate declarado en el perfil: no se calcula</div>');
        continue;
      }
      // SUELO: el mínimo con el que el perfil ARRANCA (el mismo campo que usa el aviso).
      // TECHO: el bitrate que declara el perfil, que es otra pregunta distinta.
      var sueloM = floorDePerfil(r.id);
      var reqArranque = sueloM > 0 ? sueloM * (1 + plan.delta_pct / 100) : 0;
      var arranca = (linkBps != null && reqArranque > 0) ? (linkBps >= Math.round(reqArranque * 1e6)) : null;
      nConDato++;
      if (arranca === true) nArranca++;
      if (r.feasible === true) nTecho++;
      var txt = r.id + ' · para arrancar pide ' + (sueloM > 0 ? sueloM + ' × ' + (1 + plan.delta_pct / 100).toFixed(2) +
        ' = ' + reqArranque.toFixed(2) + ' Mbps' : '— (sin suelo declarado)') +
        ' · techo ' + mbps(r.output_bps) + ' → ' + mbps(r.required_bps) + ' para sostenerlo';
      var col = '#e2e8f0';
      if (linkBps != null) {
        var trozos = [];
        if (arranca === true) trozos.push('arranca');
        else if (arranca === false) trozos.push('NO arranca (faltan ' + (reqArranque - L.mbps).toFixed(2) + ' Mbps)');
        if (r.feasible === true) trozos.push('sostiene el techo');
        else trozos.push('no sostiene el techo (faltan ' + mbps(r.deficit_bps) + ')');
        txt += ' · ' + trozos.join(' · ');
        if (L.measured && arranca === true && r.feasible === true) col = '#86efac';
        else if (arranca === true) col = '#fbbf24';
        else col = '#fca5a5';
      }
      rows.push('<div style="margin-top:3px;color:' + col + ';">' + txt + '</div>');
    }
    if (linkBps != null) {
      // Una sola frase de cierre y las dos cuentas, para que no pueda decir una cosa aquí y otra
      // en el aviso de arriba: las dos usan el MISMO enlace y el MISMO suelo.
      var etiqueta = L.measured ? '' : ' (estimación, no medición: no es un veredicto)';
      rows.push('<div style="margin-top:5px;color:' + (L.measured ? '#86efac' : '#fbbf24') + ';">Con ' +
        mbps(linkBps) + etiqueta + ': arrancan ' + nArranca + ' de ' + nConDato +
        ' perfiles y sostienen su techo ' + nTecho + ' de ' + nConDato +
        (plan.minimum_profile ? '. El que menos techo pide es ' + plan.minimum_profile +
          ' (' + mbps(plan.minimum_required_bps) : '') + '.</div>');
    } else {
      rows.push('<div style="margin-top:5px;color:#94a3b8;">Sin cifra de enlace: ' + plan.output_known +
        ' perfiles con bitrate declarado; no se puede decir cuántos arrancan ni cuántos sostienen el techo ' +
        '(no comprobado, no inventado). Escribe el enlace medido para que la tabla decida.</div>');
    }
    box.innerHTML = rows.join('');
  }

  // Delegado: se engancha una vez y sigue funcionando aunque el panel se repinte.
  // Cambiar el enlace a mano tiene que mover LAS DOS piezas: la tabla y el aviso. Si sólo se
  // repintara la tabla, el aviso seguiría hablando del enlace anterior (ese era el defecto:
  // «los avisos no responden a la realidad del momento»).
  function refrescarCondicionBuffer() {
    try { guard(); } catch (_) { }
    try { renderBufferPlan(); } catch (_) { }
    try { renderSugerencia(); } catch (_) { }
  }
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t && (t.id === 'ape-link-input' || t.id === 'ape-delta-input')) refrescarCondicionBuffer();
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t && t.id === 'ape-link-input') refrescarCondicionBuffer();
  });

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

    // ── SIN MEDICIÓN DE ENLACE (ronda 19) ────────────────────────────────────────────────────
    // `APE_BW.snapshot()` devuelve una SEMILLA mientras no haya muestras: o los 10 Mbps del
    // arranque, o `navigator.connection.downlink`, una estimación del navegador que va por
    // escalones (0,3 es uno de ellos). Eso no es una medición. Antes se pintaba como «el enlace
    // mide 0,3 Mbps» y encima bloqueaba la generación: el operador veía un bloqueo basado en un
    // número que nadie midió. Aquí se dice de dónde sale la cifra y no se bloquea por ella.
    var origenEnlace = (s.linkKind === 'manual')
      ? 'escrito a mano en «Enlace medido»'
      : (s.linkKind === 'measured'
        ? 'medición del medidor de enlace' + (s.linkSamples ? ' con ' + s.linkSamples + ' muestras' : '')
        : 'estimación del navegador, NO una medición');

    if (s.sinMedida) {
      el.innerHTML =
        '<div style="' + linea + 'color:#fbbf24;"><b>Sin medición de enlace</b>: la única cifra ' +
        'disponible es <b>' + s.inM.toFixed(2) + ' Mbps</b> y es una <b>' + origenEnlace +
        '</b> (' + s.linkSource + '). No se bloquea la generación por un número que nadie midió.</div>' +
        '<div style="' + linea + 'color:#94a3b8;">Para decidir con datos: escribe el enlace que ' +
        'midas en <b>Enlace medido</b> (aquí arriba) o deja que el medidor tome muestras abriendo ' +
        'una lista. En cuanto haya una cifra real, esta misma tarjeta vuelve a decidir.</div>' +
        '<div style="' + linea + 'color:#c4b5fd;">Con esa estimación, el perfil <b>' + act +
        '</b> pide <b>' + s.reqArranque.toFixed(2) + ' Mbps</b> para arrancar (suelo ' + s.floorM +
        ' Mbps × ' + (1 + s.delta / 100).toFixed(2) + ') y <b>' + s.reqTecho.toFixed(2) +
        ' Mbps</b> para sostener su techo de ' + s.outM + ' Mbps.</div>';
      return;
    }

    if (s.bloquea) {
      html += '<div style="' + linea + 'color:#94a3b8;font-size:.75rem;font-style:italic;">Enlace ' +
        s.inM.toFixed(2) + ' Mbps (' + origenEnlace + ').</div>';
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
      var forced = aplicarForzadoP5(m.minimo ? m.minimo.perfil : null);
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
    // CABLEADO [2026-11-21]: VPS sirve la lista, así que va por /pulse/. Export JSON → false.
    var pulse = pulseWrapForOutput();
    var prevPulse = applyPulseWrap(pulse);
    try {
      status('Generando VPS con delta ' + d + '%' + _outOptsLabel() + '…', '#38bdf8');
      if (!isJsonMetadataOutput()) sendDeltaToVps(d);
      var result = await window.APEGenerationController.prepublishAndGenerateDual(genOpts(d));
      generationResultStatus(result, 'VPS completado · delta ' + d + '% (array por perfil)', _pulseLabel(pulse));
      await deliverHybridDash();
    } catch (e) { status('VPS falló: ' + e.message, '#ef4444'); toast('VPS falló: ' + e.message, 'error'); }
    finally { restorePulseWrap(prevPulse); }
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
    // [2026-11-21 · DEFECTO (1) CERRADO] El fallback de JIT era SILENCIOSO.
    // ensureJitCatalog() devolvia false y aqui solo se ponia out.jit = false + un toast
    // generico: ni motivo, ni fecha, ni rastro durable. La lista salia con las URL del
    // proveedor y el operador creia haber generado una lista JIT.
    // Ahora el motivo REAL del catalogo se guarda en localStorage (recordJitFallback) y se
    // anuncia en rojo al cerrar la generacion, que es cuando el mensaje de exito lo pisaria.
    var jitFallback = null;
    var jitFallbackPersisted = false;
    if (out.jit) {
      var jitOk = await ensureJitCatalog();
      if (!jitOk) {
        out.jit = false;
        jitFallback = jitCatalogReason() || 'el catálogo JIT no devolvió ningún canal usable';
        // persisted=false significa que el storage lanzo: el anuncio lo dira y no prometera
        // durabilidad que no existe.
        jitFallbackPersisted = recordJitFallback(jitFallback).persisted === true;
        toast('JIT no disponible: fallback a DIRECTO · ' + jitFallback, 'warning');
      }
    }
    // CABLEADO [2026-11-21 · ORDEN DEL OPERADOR]: la lista de DIRECTO TAMBIÉN pasa por el VPS
    // (/pulse/), así que el rótulo de la tarjeta ya no promete "sin CDN" ni "URL del proveedor".
    // Única excepción: el export JSON de metadatos, que conserva las URL de origen porque es un
    // catálogo, no una lista de reproducción.
    var pulseDirect = pulseWrapForOutput();
    var prevPulse = applyPulseWrap(pulseDirect);
    var prev = {
      direct: window.APE_DIRECT_MODE,
      jit: window.APE_USE_JIT,
      hdr: window.APE_HDR_MODE
    };
    // [2026-11-21 · t3] 'generated' NO se promueve antes de tener el resultado: se marca solo
    // si generateDirect RESUELVE y su decision no es una cancelacion (ni un skip por haber ya
    // una generacion en curso). Antes se anunciaba el fallback de JIT incondicionalmente en el
    // finally, asi que una generacion que fallo o que el operador cancelo igualmente leia
    // "la lista sale sin JIT" — hablando de una lista que no existia.
    var generated = false;
    var failed = null;
    try {
      status('Generando DIRECTO con delta ' + d + '%' + _outOptsLabel() + '…', '#38bdf8');
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
      // [2026-11-21 · t19] Criterio COMPARTIDO con LIGHT (generationCompleted): la misma
      // función, no una copia inline que pueda divergir. La semántica no cambia.
      generated = generationCompleted(result);
      generationResultStatus(result, 'DIRECTO completado · delta ' + d + '% (array por perfil)', _pulseLabel(pulseDirect));
      // [2026-11-15] La parte DASH de la HIBRIDA tambien se entrega en DIRECTO.
      await deliverHybridDash();
    } catch (e) {
      failed = e;
      // Se CONSERVA el mensaje de fallo y el motivo del JIT va como SUFIJO. Antes el anuncio
      // del finally lo reemplazaba por "la lista sale sin JIT", borrando la causa real del
      // fallo de generacion: dos sintomas, un solo renglon, y se perdia el importante.
      status('DIRECTO falló: ' + e.message + (jitFallback ? ' · JIT no disponible: ' + jitFallback : ''), '#ef4444');
      toast('DIRECTO falló: ' + e.message, 'error');
    } finally {
      window.APE_DIRECT_MODE = prev.direct;
      window.APE_USE_JIT = prev.jit;
      window.APE_HDR_MODE = prev.hdr;
      // El cableado se restaura SIEMPRE, con éxito o con error: si se quedara en true/false
      // el siguiente botón heredaría la decisión de este.
      restorePulseWrap(prevPulse);
      if (jitFallback) {
        if (generated) {
          // El rojo del fallback va DESPUES del mensaje de exito, no antes: dentro del try lo
          // pisa "Generando DIRECTO…" y luego el verde de completado. Lo que el operador tiene
          // que leer al final es que la lista salio SIN JIT, por que, y donde queda constancia.
          announceJitFallback(jitFallback, jitFallbackPersisted);
        } else if (!failed) {
          // Cancelada o ya habia una generacion en curso: NO se afirma lista producida.
          // Se conserva el mensaje que dejo generationResultStatus y se añade el motivo.
          status((statusText() || 'DIRECTO sin lista nueva') + ' · JIT no disponible: ' + jitFallback, '#f59e0b');
        }
        // Con failed, el sufijo ya se compuso en el catch: no se duplica.
      }
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
    // CABLEADO [2026-11-21]: las dos listas de AMBAS salen por el VPS → /pulse/. JSON → false.
    var pulse = pulseWrapForOutput();
    var prevPulse = applyPulseWrap(pulse);
    try {
      status('Generando AMBAS: DIRECTA + CDN · delta ' + d + '%' + _outOptsLabel() + '…', '#38bdf8');
      if (!isJsonMetadataOutput()) sendDeltaToVps(d);
      var bothOpts = genOpts(d);
      bothOpts.dual = 'both';
      var result = await window.APEGenerationController.prepublishAndGenerateDual(bothOpts);
      generationResultStatus(result, 'AMBAS completado: DIRECTA + CDN · delta ' + d + '%', _pulseLabel(pulse));
      await deliverHybridDash();
    } catch (e) { status('AMBAS falló: ' + e.message, '#ef4444'); toast('AMBAS falló: ' + e.message, 'error'); }
    finally { restorePulseWrap(prevPulse); }
  }

  // ── LIGHT · proyeccion por perfil (cuarta salida) ───────────────────────────
  // Contrato que se VALIDA antes de dar por buena la lista. Si algo no cuadra,
  // se dice y NO se entrega como verde. Ningun numero se inventa.
  // OJO: el NUMERO de canales es el RESULTADO DEL FILTRO, no un invariante.
  // 100 canales filtrados con LIGHT marcado deben salir LIGHT. Vetar por conteo
  // seria vetar el filtro del operador. Solo se exige que haya al menos 1.
  // SOLO tres cosas son ESTRUCTURALES de una lista LIGHT:
  //   - 9 plantillas y 1 indice en la cabecera
  //   - 0 lineas #EXT-X-APE- en el cuerpo
  //   - al menos un canal (si no, no hay lista)
  // NO son invariantes, y por tanto NO se gatean:
  //   - el NUMERO de canales: lo fija el FILTRO del operador (100 o 21.224, da igual)
  //   - las LINEAS POR CANAL: medido 6 en P1, 7 en P4 y 10 en P5, porque cada canal
  //     arrastra sus propias lineas extra. Exigir un valor fijo veta listas validas.
  var LIGHT_CONTRACT = {
    canalesMin: 1,
    plantillas: 9,
    apeEnCuerpo: 0
  };

  function setLightState(text, color) {
    var el = document.getElementById('ape-light-state');
    if (!el) return;
    el.textContent = text;
    el.style.color = color || '#64748b';
  }

  function lightBaseUrl() {
    try {
      var l = window.APE_LIST_NAME || window.APE_LAST_LIST || '';
      if (l) return l.replace(/\.m3u8$/i, '') + '_CABLEADA_LIGHT.m3u8';
    } catch (e) { /* noop */ }
    return null;
  }

  // Valida la lista servida SIN descargar 241 MB: pide las cabeceras y usa
  // el endpoint de estado del VPS, que ya cuenta EXTINF y plantillas.
  async function validateLight() {
    var base = lightBaseUrl();
    if (!base) return { ok: false, reason: 'NO_LIST_NAME' };
    // [FIX 2026-11-15] ruta absoluta contra el VPS, no relativa: en el servidor local
    // (127.0.0.1:5500) no existe /prisma/ y devolvia 404 en vez de validar.\n    var url = VPS_BASE + '/prisma/api/list-light-verify.php?lista=' + encodeURIComponent(base);
    var r;
    try {
      r = await fetch(url, { cache: 'no-store' });
    } catch (e) {
      return { ok: false, reason: 'VERIFY_UNREACHABLE', detail: e.message };
    }
    if (r.status === 404) return { ok: false, reason: 'VERIFY_ENDPOINT_ABSENT' };
    if (!r.ok) return { ok: false, reason: 'VERIFY_HTTP_' + r.status };
    var j;
    try { j = await r.json(); } catch (e) { return { ok: false, reason: 'VERIFY_NOT_JSON' }; }

    var fallos = [];
    if (!(j.canales >= LIGHT_CONTRACT.canalesMin)) fallos.push('canales=' + j.canales + ' < ' + LIGHT_CONTRACT.canalesMin + ' (la lista esta vacia)');
    if (j.plantillas !== LIGHT_CONTRACT.plantillas) fallos.push('plantillas=' + j.plantillas + ' != ' + LIGHT_CONTRACT.plantillas);
    if ((j.ape_cuerpo || 0) !== LIGHT_CONTRACT.apeEnCuerpo) fallos.push('ape_cuerpo=' + j.ape_cuerpo + ' != 0');

    if (fallos.length) return { ok: false, reason: 'CONTRACT_FAIL', fallos: fallos, raw: j };
    return { ok: true, raw: j };
  }

  async function runLight() {
    var d = applyDelta(false);
    if (!checkGeneration()) return;
    // [2026-11-21 · DEFECTO (2) CERRADO] Esta salida NO pasaba por formatGuard() y no tenia
    // rama mpd. Medido: con DASH marcado generaba igualmente una base HLS y la publicaba,
    // asi que el operador pedia DASH y recibia una lista HLS normal SIN aviso.
    // Las otras tres salidas (runVps, runDirect, runBoth) ya cortaban por las dos vias.
    //
    // dashNotice:false porque la rama DASH del guard describe lo que hacen VPS/DIRECTO/AMBAS
    // ("se descargara una M3U con la URL del MPD") y aqui no va a descargarse nada: LIGHT
    // aborta justo debajo con su propio motivo. El resto de reglas del guard son las mismas.
    if (!formatGuard({ dashNotice: false })) return;
    if (!isJsonMetadataOutput() && selectedFormat() === 'mpd') {
      // El motivo se nombra entero: que entrega LIGHT de verdad, que no aplica y que elegir.
      // Se comprueba ANTES del checkbox de autorizacion a proposito: si el operador tiene
      // DASH marcado, marcar LIGHT y volver a pulsar solo para leer que DASH no aplica son
      // dos viajes. Este aviso se da en el primero.
      var whyDash = 'LIGHT entrega una lista HLS (base CDN + 9 plantillas + índice); ' +
        'DASH no aplica en esta salida. Elige .M3U8 o HÍBRIDA.';
      setLightState('DASH no aplica · LIGHT entrega HLS', '#ef4444');
      status('LIGHT no entrega DASH: ' + whyDash, '#ef4444');
      toast('LIGHT + DASH: no se generó nada. ' + whyDash, 'error');
      return;
    }
    var cb = document.getElementById('ape-out-light');
    if (!cb || !cb.checked) {
      status('LIGHT: marca el checkbox LIGHT para poder generarla', '#f59e0b');
      toast('LIGHT: el checkbox es la autorización explícita de esta variante', 'warning');
      return;
    }
    // CABLEADO [2026-11-21]: la base LIGHT se publica en el VPS y la sirve el, asi que va por
    // /pulse/. JSON de metadatos → false (catalogo de origen).
    var pulseLight = pulseWrapForOutput();
    var prevPulse = applyPulseWrap(pulseLight);
    try {
      status('LIGHT: generando la base CDN con delta ' + d + '%…', '#e879f9');
      setLightState('generando base…', '#e879f9');
      if (!isJsonMetadataOutput()) sendDeltaToVps(d);

      // 1) base CDN (la materia prima real de la proyeccion)
      // [2026-11-15] genOpts(d) en vez de solo el delta: la base LIGHT tambien debe
      // honrar JIT y HDR, o la proyeccion por perfil saldria de una base distinta
      // a la que el operador pidio.
      var result = await window.APEGenerationController.prepublishAndGenerateDual(genOpts(d));
      // [2026-11-21 · t19] ANTES de tocar el VPS: si la base no se generó (cancelada, o ya había
      // una generación en curso), publicar proyectaría y enlazaría una base VIEJA —la de una
      // corrida anterior que sí existía en el VPS— y el operador leería 'LIGHT PUBLICADA' con un
      // enlace que no corresponde a lo que acaba de pedir. Misma clase de defecto que t1/t4/t16
      // (afirmar un hecho que no consta), pero aquí lo que se afirma es un ENLACE.
      // Criterio: EL MISMO que la rama JIT de runDirect (generationCompleted), no uno paralelo.
      generationResultStatus(result, 'LIGHT: base CDN lista · proyectando…');
      if (!generationCompleted(result)) {
        var baseDecision = String((result && result.decision) || 'sin decision');
        setLightState('NO PUBLICADA · ' + baseDecision, '#f59e0b');
        status((statusText() || 'LIGHT: base no generada') +
          ' · la base no se generó (' + baseDecision + ') · no se publica en el VPS', '#f59e0b');
        toast('LIGHT: la base no se generó (' + baseDecision + '); no se publica en el VPS', 'warning');
        return;
      }

      // 2) PUBLICACION ATOMICA EN EL VPS
      // [2026-11-15] ANTES se llamaba a list-light-project.php, que hacia SOLO la
      // proyeccion. El problema: este boton genera la base y acto seguido pide la
      // proyeccion, pero la base todavia NO esta en el VPS — se sube aparte. El
      // endpoint respondia E_LISTA_NO_EXISTE y el navegador lo mostraba como
      // "Failed to fetch" porque CORS se come el cuerpo del 404.
      //
      // AHORA se llama a list-publish.php, que encadena los pasos 3-6 en UNA sola
      // operacion: proyeccion -> plantillas -> verificacion del contrato -> enlace.
      // Falla cerrado: si cualquier paso o el contrato fallan, responde ok:false con
      // la razon literal y NO publica. Si la base no esta en el VPS lo dice con
      // E_LISTA_NO_EXISTE y el mensaje explica que falta subirla.
      var base = lightBaseUrl();
      setLightState('publicando en el VPS…', '#e879f9');
      var pr = await fetch(VPS_BASE + '/prisma/api/list-publish.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lista: base })
      });
      var pj = null;
      try { pj = await pr.json(); } catch (_) { pj = null; }

      if (pr.status === 404) {
        setLightState('FALTA SUBIR · la base no está en el VPS', '#f59e0b');
        status('LIGHT: la base ' + base + ' no está en el VPS. SUBILA y vuelve a pulsar. ' +
               '(La base CDN SÍ se generó y está descargada.)', '#f59e0b');
        toast('LIGHT: sube la base al VPS antes de proyectar', 'warning');
        return;
      }
      if (pr.status === 422 && pj && pj.reason === 'E_CONTRATO_INCUMPLIDO') {
        var errs = (pj.errores || []).join(' · ');
        var med = pj.medido || {};
        setLightState('RECHAZADA · contrato incumplido', '#ef4444');
        status('LIGHT RECHAZADA: ' + errs + ' · medido: ' +
               (med.canales || '?') + ' canales · ' + (med.plantillas || '?') + ' plantillas · ' +
               (med.ape_en_cuerpo === undefined ? '?' : med.ape_en_cuerpo) + ' APE en cuerpo', '#ef4444');
        toast('LIGHT no cumple el contrato: ' + errs, 'error');
        return;
      }
      if (!pr.ok || !pj || pj.ok !== true) {
        var rz = (pj && (pj.reason || pj.error)) || ('HTTP ' + pr.status);
        setLightState('FALLÓ · ' + rz, '#ef4444');
        status('LIGHT falló en el paso ' + ((pj && pj.paso) || '?') + ': ' + rz, '#ef4444');
        toast('LIGHT falló: ' + rz, 'error');
        return;
      }

      // 3) publicado: el endpoint ya verifico el contrato antes de enlazar
      var m = pj.medido || {};
      setLightState('PUBLICADA · ' + (m.canales || '?') + ' canales · ' + (m.plantillas || '?') + ' plantillas', '#22c55e');
      status('LIGHT PUBLICADA: ' + (m.canales || '?') + ' canales · ' + (m.plantillas || '?') + ' plantillas · ' +
             (m.indice || '?') + ' índice · ' + (m.ape_en_cuerpo === undefined ? '?' : m.ape_en_cuerpo) + ' APE en cuerpo · ' +
             (m.lab ? m.lab + ' LAB · ' : '') +
             (pj.placeholder_bytes ? Math.round(pj.placeholder_bytes / 1048576) + ' MB' : '?') + ' (' +
             (pj.placeholder_gz_bytes ? Math.round(pj.placeholder_gz_bytes / 1048576) + ' MB gz' : '? gz') + ')' +
             ' · enlace de ' + (pj.enlace_bytes || '?') + ' B · ' + ((pj.ms || 0) / 1000).toFixed(1) + ' s' +
             _pulseLabel(pulseLight), '#22c55e');
      // El cableado se repite en la linea de URL porque es la ULTIMA que queda a la vista:
      // sin esto el operador veria la URL y tendria que adivinar por donde pasa la lista.
      if (pj.url) status('LIGHT URL: ' + pj.url + _pulseLabel(pulseLight), '#22c55e');
      toast('LIGHT publicada y verificada', 'success');
    } catch (e) {
      setLightState('FALLÓ · ' + e.message, '#ef4444');
      status('LIGHT falló: ' + e.message, '#ef4444');
      toast('LIGHT falló: ' + e.message, 'error');
    } finally {
      // Restauracion SIEMPRE: la base publicada ya lleva su cableado; el flag no debe quedar
      // encendido para el siguiente boton (ni tras un return dentro del try, ni tras el catch).
      restorePulseWrap(prevPulse);
    }
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

  /* ── [2026-11-23 · INTEGRACIÓN 4K/6K] INTENCIÓN DECLARADA POR CANAL ────────────
   * Una sola fuente de verdad: window.APE_4K6K_AUDIT. Es el flag que ya lee el
   * adaptador (ape-4k6k-audit-adapter.js:52, isEnabled()) y el que ahora consulta el
   * emisor en cada canal (ape-4k6k-intent-emit.js → m3u8-typed-arrays-ultimate.js,
   * una guarda junto a generateChannelEntry).
   *
   * Por qué el cableado vive AQUÍ y no en el HTML: el panel se construye en tiempo de
   * ejecución (render() inyecta el <section> dentro de #tab-export). Un
   * document.getElementById escrito en línea en el HTML se ejecuta ANTES de que el
   * panel exista y devolvería null: la casilla se vería y no haría nada. El HTML
   * tenía exactamente eso (index-v4.html, label suelto junto a "Modo DIRECTO"); ese
   * label se ha quitado de allí para que no haya dos elementos con el mismo id.
   *
   * Persistencia: localStorage, por defecto APAGADA (lista byte a byte como antes).
   */
  var INTENT_KEY = 'ape_4k6k_intent_enabled';
  function intentOn() { return window.APE_4K6K_AUDIT === true; }
  function setIntent(on, silent) {
    var v = (on === true);
    window.APE_4K6K_AUDIT = v;
    try { localStorage.setItem(INTENT_KEY, v ? '1' : '0'); } catch (_) { /* modo privado */ }
    var cb = document.getElementById('ape4k6kIntentToggle');
    if (cb) cb.checked = v;
    var st = document.getElementById('ape4k6kIntentState');
    if (st) {
      st.textContent = v ? 'encendido · +1 línea por canal' : 'apagado · lista intacta';
      st.style.color = v ? '#f0abfc' : '#94a3b8';
    }
    if (!silent) status(v ? 'Intención 4K/6K ENCENDIDA' : 'Intención 4K/6K apagada', v ? '#e879f9' : '#94a3b8');
  }

  /* ── [2026-11-23 · MODO UNIVERSAL] INTERRUPTOR DE LA LISTA UNIVERSAL ──────────
   * Una sola fuente de verdad: window.APE_UNIVERSAL_MODE. Es lo que lee el emisor
   * (js/ape-v9/ape-universal-emit.js → isOn) desde la guarda que el generador tiene
   * junto a generateChannelEntry.
   * Persistencia: localStorage, por defecto APAGADA (la lista sale byte a byte como
   * antes). setUniversal() es el único sitio que escribe el flag: la casilla, el
   * arranque de la página y cualquier prueba pasan por aquí, así que no puede haber
   * dos verdades distintas.
   */
  var UNIVERSAL_KEY = 'ape_universal_intent_enabled';
  function universalOn() { return window.APE_UNIVERSAL_MODE === true; }
  function setUniversal(on, silent) {
    var v = (on === true);
    window.APE_UNIVERSAL_MODE = v;
    try { localStorage.setItem(UNIVERSAL_KEY, v ? '1' : '0'); } catch (_) { /* modo privado */ }
    var cb = document.getElementById('apeUniversalToggle');
    if (cb) cb.checked = v;
    var st = document.getElementById('apeUniversalState');
    if (st) {
      var em = window.APE_UNIVERSAL_EMIT;
      var n = (em && em.DIALECTS && em.DIALECTS.length) ? em.DIALECTS.length : null;
      st.textContent = v ? ('encendido · +1 línea por canal' + (n ? ' · ' + n + ' dialectos' : '')) : 'apagado · lista intacta';
      st.style.color = v ? '#c4b5fd' : '#94a3b8';
    }
    if (!silent) status(v ? 'Lista universal ENCENDIDA' : 'Lista universal apagada', v ? '#8b5cf6' : '#94a3b8');
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
      // [2026-11-15] AMBAS NO es una tercera salida: es un ATAJO que enciende VPS y
      // DIRECTO a la vez, y se desmarca desmarcando las dos. El title lo dice para que
      // no se lea como una opcion independiente.
      '<label style="cursor:pointer;" title="Atajo: marca VPS y DIRECTO a la vez. No es una tercera salida — se deriva de las dos."><input type="checkbox" id="ape-sel-both" style="accent-color:#22d3ee;"> AMBAS</label>' +
      '<span id="ape-sel-state" style="color:#94a3b8;font-size:.74rem;">VPS seleccionado</span>' +
      '</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:8px;padding:8px 10px;border-radius:9px;background:rgba(2,6,23,.28);border:1px solid rgba(148,163,184,.22);font-size:.82rem;color:#cbd5e1;">' +
      '<strong style="color:#86efac;">SALIDAS:</strong>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-out-hls" checked style="accent-color:#22c55e;"> HLS</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-out-dash" style="accent-color:#38bdf8;"> DASH</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="ape-out-hybrid" style="accent-color:#a855f7;"> HÍBRIDA HLS+DASH</label>' +
      '<label style="cursor:pointer;opacity:.55;" title="Desactivado por Híbrido APE Crystal: el JIT devolvió 503 PROVIDER_SLOT_BUSY y no trae fallback; todo va por /pulse con p=P1 (P0 para 8K)."><input type="checkbox" id="ape-out-jit" disabled style="accent-color:#f59e0b;"> JIT</label>' +
      // [LIGHT 2026-11-15] Cuarta salida: proyeccion por perfil. NO la produce ninguna
      // de las tres tarjetas existentes: nace de la CABLEADA y la transforma
      //  1) ape-pulse-wrap.js reescribe el d= DE LA URL desde #EXT-X-APE-STREAM-TRUTH
      //     (tools/pulse/ape-pulse-wrap.js:334-364 — el d= lleva la resolucion real
      //     del canal, no una constante). OJO: ese d= NO es el "Delta por perfil";
      //     son dos cosas distintas y el rotulo lo decia ambiguo.
      //  2) ape-profile-project.js light escribe 9 plantillas + 1 indice en cabecera
      //  3) resultado: ~1.037 lineas por canal recuperables desde 9 plantillas
      //     (medido sobre APE_LISTA_1794758247679_CDN: 21.224 canales, 1.037/canal)
      // El checkbox VALIDA (gate fail-closed) y no solo genera.
      '<label style="cursor:pointer;" title="Proyeccion LIGHT por perfil: ~1.037 lineas por canal recuperables desde 9 plantillas. El d= de cada URL /pulse sale del #EXT-X-APE-STREAM-TRUTH (resolucion real del canal). El &quot;Delta por perfil&quot; de abajo es otra cosa: el margen de buffer."><input type="checkbox" id="ape-out-light" style="accent-color:#e879f9;"> LIGHT</label>' +
      '<label style="cursor:pointer;" title="Modo HDR de salida">HDR <select id="ape-out-hdr" style="accent-color:#ef4444;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:2px 4px;font-size:.78rem;">' +
      '<option value="auto">Auto</option><option value="pq">PQ</option><option value="sdr">SDR</option></select></label>' +
      '</div>' +
      // ══ [2026-11-23 · INTEGRACIÓN 4K/6K] ═══════════════════════════════════════
      // El propietario trajo esta casilla SUELTA en el HTML (label + script en línea,
      // junto a "Modo DIRECTO"). Medido: escribía window.APE_4K6K_AUDIT y NINGÚN punto
      // del emisor leía ese flag (grep de 'insertIntentTag(' en frontend/js: sólo la
      // definición y las pruebas), así que no añadía ni una línea a la lista.
      // Ahora vive aquí, en la fila de opciones de salida, con su mismo id y su mismo
      // texto, y SÍ manda: el generador llama al módulo de emisión por canal.
      // Es METADATA declarada: no cambia el vídeo, el bitrate ni ninguna URL, y al
      // apagarla la lista sale byte a byte igual que antes.
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:8px;padding:8px 10px;border-radius:9px;background:rgba(2,6,23,.28);border:1px solid rgba(232,121,249,.30);font-size:.82rem;color:#cbd5e1;">' +
      '<strong style="color:#f0abfc;">INTENCIÓN:</strong>' +
      '<label id="ape4k6kIntentLabel" for="ape4k6kIntentToggle" title="Añade una línea #EXT-X-APE-4K6K-INTENT por canal con el perfil elegido y la resolución objetivo. No cambia el vídeo: es metadata declarada." style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-weight:700;color:#e2e8f0;">' +
      '<input type="checkbox" id="ape4k6kIntentToggle" style="width:16px;height:16px;accent-color:#e879f9;cursor:pointer;">' +
      '<span>INTENCIÓN 4K/6K EN LA LISTA</span></label>' +
      '<span id="ape4k6kIntentState" style="color:#94a3b8;font-size:.74rem;font-weight:700;">apagado · lista intacta</span>' +
      '<span style="font-size:.78rem;color:#64748b;flex-basis:100%;">Una línea declarativa por canal al generar la lista (perfil elegido + resolución objetivo). No cambia el vídeo, el bitrate ni las URLs. Vale para VPS, DIRECTO y AMBAS y para los tres formatos (HLS, DASH, HÍBRIDA); el JSON de metadatos no lleva lista que anotar.</span>' +
      '</div>' +
      // [2026-11-23 · MODO UNIVERSAL] Interruptor de la lista universal. Se pinta AQUÍ (no
      // en el HTML) por lo mismo que la casilla 4K/6K: el panel se construye después del
      // parseo, y un getElementById escrito en el HTML devolvería null. Manda de verdad: el
      // generador llama a window.APE_UNIVERSAL_EMIT.apply() por canal (una guarda junto a
      // generateChannelEntry), y ese módulo añade UNA línea declarativa por canal.
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:8px;padding:8px 10px;border-radius:9px;background:rgba(2,6,23,.28);border:1px solid rgba(139,92,246,.34);font-size:.82rem;color:#cbd5e1;">' +
      '<strong style="color:#c4b5fd;">UNIVERSAL:</strong>' +
      '<label id="apeUniversalLabel" for="apeUniversalToggle" title="Añade una línea #EXT-X-APE-UNIVERSAL por canal: declara los dialectos de player que cubre la lista, que los tags desconocidos y los #EXT-X-APE-* se conservan, y la guía canónica 12P seguida. No cambia el vídeo, el bitrate ni las URLs." style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-weight:700;color:#e2e8f0;">' +
      '<input type="checkbox" id="apeUniversalToggle" style="width:16px;height:16px;accent-color:#8b5cf6;cursor:pointer;">' +
      '<span>LISTA UNIVERSAL · TODOS LOS PLAYERS</span></label>' +
      '<span id="apeUniversalState" style="color:#94a3b8;font-size:.74rem;font-weight:700;">apagado · lista intacta</span>' +
      '<span style="font-size:.78rem;color:#64748b;flex-basis:100%;">Una línea declarativa por canal al generar la lista: los dialectos que cubre, tags desconocidos conservados, cabeceras tóxicas limpiadas al exportar y la guía canónica 12P. El ZIP por player sigue saliendo de 🧬 MULTIPARSER aquí abajo y NO modifica la lista.</span>' +
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
      // [2026-11-21 · t3] Linea PERSISTENTE del ultimo fallback de JIT. La rellena
      // renderJitFallbackBadge() al pintar el panel y cada vez que ocurre un fallback: el
      // motivo sobrevive a la recarga en vez de vivir solo en el estado efimero.
      '<div id="ape-jit-fallback" style="font-size:.76rem;color:#f59e0b;font-weight:700;margin-top:6px;"></div>' +
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
      // [2026-11-15] El rotulo nombraba prepublishAndGenerate(), pero runDirect llama a
      // prepublishAndGenerateDirect (que es prepublishAndGenerateDual con dual:false,
      // generation-controller.js:1796-1797). Se describe la OPERACION, que es lo que el
      // operador necesita saber, y el nombre real va entre parentesis.
      // [2026-11-21 · t16 (hallazgo t8)] Dos correcciones seguidas del mismo rotulo:
      //   t6  quito "URLs del proveedor · sin CDN" porque el cableado /pulse/ ya existe.
      //   t16 quita "la lista pasa por el VPS (/pulse/)" como HECHO: el envoltorio solo actua
      //       sobre URLs con id numerico, y el panel no recibe del generador el conteo de
      //       envueltas/omitidas. Medido en rea-generation-dispatch.test.js: un canal sin id
      //       numerico sale directo al proveedor. Se declara INTENCION + ALCANCE, y el JIT
      //       (que no va por /pulse/) se nombra aparte: se sirve en /jit/.
      '<div style="font-size:.8rem;color:#94a3b8;margin:4px 0 7px;">Un solo archivo · cableado solicitado por VPS (/pulse/); los canales sin id numérico quedan directos y el JIT se sirve en /jit/ (prepublishAndGenerateDirect)</div>' +
      '<button data-ape-run="direct" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:0;border-radius:7px;padding:7px 12px;font-size:.82rem;font-weight:800;cursor:pointer;">Generar DIRECTO</button>' +
      '<span style="font-size:.84rem;color:#64748b;margin-left:7px;">cableado solicitado por VPS</span></div>' +
      // AMBAS
      '<div style="background:rgba(2,6,23,.38);border:1px solid rgba(34,211,238,.45);border-radius:11px;padding:11px;">' +
      '<div style="font-weight:800;color:#67e8f9;font-size:1.05rem;">AMBAS · dos listas</div>' +
      '<div style="font-size:.8rem;color:#94a3b8;margin:4px 0 7px;">Un archivo DIRECTA y otro CDN, con los mismos canales</div>' +
      '<button data-ape-run="both" style="background:linear-gradient(135deg,#0891b2,#22d3ee);color:#06240f;border:0;border-radius:7px;padding:7px 12px;font-size:.82rem;font-weight:800;cursor:pointer;">Generar AMBAS</button>' +
      '<span style="font-size:.84rem;color:#64748b;margin-left:7px;">dos archivos M3U</span></div>' +
      // LIGHT
      '<div style="background:rgba(2,6,23,.38);border:1px solid rgba(232,121,249,.45);border-radius:11px;padding:11px;">' +
      '<div style="font-weight:800;color:#f0abfc;font-size:1.05rem;">LIGHT · proyección por perfil</div>' +
      // [2026-11-15] "d= desde STREAM-TRUTH" era ambiguo: hay DOS d=. El de la URL
      // (/pulse/<id>?…&d=<b64>) lo reescribe el envoltorio desde STREAM-TRUTH; el
      // "Delta por perfil" del panel NO. Se dice cual es cual y de donde sale cada uno.
      '<div style="font-size:.8rem;color:#94a3b8;margin:4px 0 7px;">9 plantillas + índice · URL d= desde STREAM-TRUTH · delta de buffer desde el panel · valida antes de entregar · solo HLS (DASH no aplica)</div>' +
      '<button data-ape-run="light" style="background:linear-gradient(135deg,#a21caf,#e879f9);color:#fff;border:0;border-radius:7px;padding:7px 12px;font-size:.82rem;font-weight:800;cursor:pointer;">Generar LIGHT</button>' +
      '<span id="ape-light-state" style="font-size:.84rem;color:#64748b;margin-left:7px;">sin validar</span></div>' +
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
      // [2026-11-15] Aqui habia DOS enlaces fijos a /jit/live/1174213/manifest.mpd y
      // /jit/live/3/manifest.mpd. Medido: los dos devuelven 503
      // "PROVIDER_SLOT_BUSY: use provider-direct; source unchanged", porque el JIT
      // sirve UN canal a la vez (server.js:4 "one active channel at a time") y solo el
      // canal con pipeline vivo responde (server.js:5615). Un enlace fijo a un id
      // concreto no puede cumplir lo que promete. En su lugar va un control que
      // resuelve el canal ACTIVO en el momento del clic, y si no hay ninguno lo dice.
      '<button type="button" id="ape-jit-dash-live" style="cursor:pointer;background:#1e293b;color:#7dd3fc;border:1px solid #334155;border-radius:5px;padding:2px 7px;font-size:.74rem;">DASH del canal activo</button>' +
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
      '<div style="font-size:.82rem;color:#94a3b8;margin-top:6px;">Entrada requerida ≥ salida solicitada × (1 + delta). La salida NO se reduce: es la que pide la reproducción/imagen; el margen se reserva en entrada.</div>' +
      // RONDA 18 · el bloque suelto #ape-buf-demand-panel se integra AQUÍ dentro de la tarjeta:
      // un solo dueño de los ids (ape-link-input, ape-buf-plan) y los valores por perfil salen
      // del catálogo del gestor de perfiles (el que trae los bitrates del LAB), nunca escritos a mano.
      '<div style="display:flex;align-items:center;gap:9px;font-size:.8rem;color:#94a3b8;margin-top:7px;flex-wrap:wrap;">' +
      '<label for="ape-link-input" style="white-space:nowrap;">Enlace medido</label>' +
      '<input id="ape-link-input" type="number" min="0" max="100000" step="0.01" placeholder="Mbps (opcional)" ' +
      'style="width:120px;padding:4px 7px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;">' +
      '<span style="color:#64748b;">sin medida no se diagnostica déficit</span>' +
      '</div>' +
      '<div id="ape-buf-plan" style="margin-top:7px;font-size:.78rem;color:#94a3b8;">Cargando perfiles…</div></div>' +
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
    // RONDA 18: en cuanto la tarjeta CONDICIÓN DE BUFFER está en el DOM, se pinta la tabla
    // por perfil con los bitrates del catálogo. Si el catálogo aún no está, dice NO COMPUTADO.
    try { renderBufferPlan(); } catch (_) { }
    // RONDA 19: el aviso se pinta en el mismo momento y con la misma cifra de enlace que la
    // tabla. Antes sólo se recalculaba al aplicar un delta, así que podía quedarse con un
    // veredicto de otro momento (o no aparecer hasta que el operador tocara algo).
    try { renderSugerencia(); } catch (_) { }

    // ══ [2026-11-23 · MULTIPARSER DENTRO DEL GENERADOR] ══════════════════════
    // El propietario trajo el bloque #apeMultiParserPanel PEGADO en el HTML, como
    // hermano de la tarjeta de exportación: fuera del panel que genera las listas.
    // Aquí se MUEVE ese mismo nodo (no se copia) al final del panel del generador,
    // para que la lista y sus traducciones por player se pidan desde el mismo sitio.
    // Se mueve, no se clona, por tres razones medidas:
    //   · los dos <button> llevan onclick EN LÍNEA (btnMultiExportView /
    //     btnMultiParseFile): mover el nodo conserva el listener sin reescribirlo;
    //   · clonar crearía DOS #apeMultiParserStatus y getElementById devolvería el
    //     primero, así que los mensajes del exportador irían a un div que el
    //     operador ya no ve;
    //   · si el bloque no está en el DOM (alguien lo quitó), NO se inventa: el
    //     panel sigue funcionando sin multiparser en vez de romperse.
    try {
      var mpPanel = document.getElementById('apeMultiParserPanel');
      if (mpPanel && mpPanel.parentNode !== panel) panel.appendChild(mpPanel);
    } catch (_mpErr) { /* DOM inesperado: el generador no depende del multiparser */ }

    var snapshotButton = document.getElementById('ape-mpd-snapshot');
    if (snapshotButton) snapshotButton.addEventListener('click', async function () {
      try { await downloadActiveJitMpd(true); }
      catch (e) { status('MPD diagnóstico: ' + e.message, '#ef4444'); toast('MPD diagnóstico: ' + e.message, 'error'); }
    });

    // [2026-11-15] Boton que sustituye a los dos enlaces DASH fijos. Resuelve el canal
    // ACTIVO en el momento del clic contra /jit/catalog.json: si hay uno, descarga la
    // M3U que enlaza su MPD; si no hay ninguno, lo dice con el numero exacto.
    var jitDashBtn = document.getElementById('ape-jit-dash-live');
    if (jitDashBtn) jitDashBtn.addEventListener('click', async function () {
      try {
        await downloadActiveJitMpd();
      } catch (e) {
        status('DASH JIT: ' + e.message, '#f59e0b');
        toast('DASH JIT: ' + e.message, 'warning');
      }
    });

    panel.querySelectorAll('[data-ape-run]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-ape-run');
        if (k === 'vps') runVps();
        else if (k === 'direct') runDirect();
        else if (k === 'light') runLight();
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
    // [2026-11-15] TRES CASILLAS NO SON TRES SALIDAS.
    // VPS y DIRECTO son las dos salidas. AMBAS NO es una tercera: es la dos a la vez.
    // El codigo anterior las trataba como tres independientes y tenia tres defectos
    // medidos en la UI (captura del operador: las tres marcadas y el rotulo diciendo
    // solo "VPS + DIRECTO"):
    //   1) AMBAS no se podia DESMARCAR: se desmarcaba, y la linea siguiente
    //      `else if (sv.checked && sd.checked) sb.checked = true` la volvia a marcar.
    //   2) El rotulo no nombraba AMBAS aunque estuviera marcada.
    //   3) Los listeners hacian `sb.checked = false` mientras selPaint lo derivaba a
    //      true: dos reglas contradictorias sobre el mismo control.
    // Ahora hay UNA regla: AMBAS se DERIVA de (VPS && DIRECTO), y el clic en AMBAS es
    // un atajo en las dos direcciones (marcar = marcar las dos, desmarcar = ninguna).
    function selPaint() {
      if (!sv || !sd || !sb || !ss) return;
      // Regla unica: AMBAS refleja el AND de las dos salidas reales.
      sb.checked = (sv.checked && sd.checked);
      var active = [];
      if (sv.checked) active.push('VPS');
      if (sd.checked) active.push('DIRECTO');
      if (active.length === 2) {
        ss.textContent = 'AMBAS · VPS + DIRECTO (dos listas)';
      } else if (active.length === 1) {
        ss.textContent = active[0] + ' (una lista)';
      } else {
        ss.textContent = 'ninguna salida seleccionada';
      }
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
      // LIGHT: su propio checkbox es la autorizacion. Sin marcar, el boton NO se puede pulsar.
      var sl = document.getElementById('ape-out-light');
      panel.querySelectorAll('[data-ape-run="light"]').forEach(function (b) {
        var on = !!(sl && sl.checked);
        b.disabled = !on; b.style.opacity = on ? '1' : '.4'; b.style.cursor = on ? 'pointer' : 'not-allowed';
      });
    }
    var slCb = document.getElementById('ape-out-light');
    if (slCb) slCb.addEventListener('change', function () {
      selPaint();
      if (slCb.checked) { setLightState('seleccionada · sin validar', '#e879f9'); }
      else { setLightState('sin validar', '#64748b'); }
    });
    // Las dos salidas reales solo cambian su propia casilla; AMBAS se deriva en selPaint.
    if (sv) sv.addEventListener('change', selPaint);
    if (sd) sd.addEventListener('change', selPaint);
    // AMBAS es atajo bidireccional: marcar enciende las dos, desmarcar apaga las dos.
    if (sb) sb.addEventListener('change', function () {
      var on = sb.checked;
      sv.checked = on;
      sd.checked = on;
      selPaint();
    });
    selPaint();
    // [2026-11-15] Expuesto AQUI porque selPaint se define dentro de render().
    // Sirve para probar que AMBAS se deriva de (VPS && DIRECTO) y que el rotulo de la
    // fila dice la verdad en los cuatro estados posibles, sin abrir un navegador.
    if (window.APE_OUTPUT_TEST_HOOKS) window.APE_OUTPUT_TEST_HOOKS.selPaint = selPaint;

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
    // [2026-11-23 · INTEGRACIÓN 4K/6K] Restaurar y enganchar la casilla de intención.
    // Se hace AQUÍ porque el panel acaba de existir: antes, el elemento no está en el DOM.
    // setIntent(saved, true) pinta la casilla y deja window.APE_4K6K_AUDIT como estaba
    // guardado (por defecto apagado), sin escribir en la barra de estado.
    var intentCb = document.getElementById('ape4k6kIntentToggle');
    if (intentCb) {
      var savedIntent = false;
      try { savedIntent = (localStorage.getItem(INTENT_KEY) === '1'); } catch (_) { savedIntent = false; }
      setIntent(savedIntent, true);
      intentCb.addEventListener('change', function () { setIntent(intentCb.checked, false); });
    }
    // [2026-11-23 · MODO UNIVERSAL] Mismo patrón, y por la misma razón: el elemento acaba
    // de existir ahora. Por defecto APAGADO (0 líneas añadidas a la lista).
    var uniCb = document.getElementById('apeUniversalToggle');
    if (uniCb) {
      var savedUni = false;
      try { savedUni = (localStorage.getItem(UNIVERSAL_KEY) === '1'); } catch (_) { savedUni = false; }
      setUniversal(savedUni, true);
      uniCb.addEventListener('change', function () { setUniversal(uniCb.checked, false); });
    }
    // [2026-11-21 · t3] Read-back al pintar: si la ultima corrida dejo un fallback de JIT
    // registrado, se vuelve a mostrar aqui. Sin esta lectura, "consta en localStorage" era
    // una afirmacion que nadie comprobaba nunca.
    renderJitFallbackBadge();
    var p = document.getElementById('publicationMode');
    var ps = document.getElementById('ape-gen-mode-select');
    // [2026-11-15] Hay DOS selects del mismo modo: #publicationMode vive en
    // index-v4.html:2776 y #ape-gen-mode-select en este panel. La sincronizacion solo
    // iba en una direccion (panel -> global), asi que cambiar el select de fuera
    // dejaba al panel mostrando un modo y al generador aplicando otro.
    // Ahora la fuente de verdad es window.APE_PUBLICATION_MODE y los dos selects la
    // reflejan; ademas se fija al arrancar para que generation-controller.js:1452 lo
    // lea desde la primera generacion, no solo despues de tocar el selector.
    function syncMode(v) {
      var val = (v === 'strict_terminal' || v === 'diagnostic') ? v : 'balanced_95';
      window.APE_PUBLICATION_MODE = val;
      if (ps && ps.value !== val) ps.value = val;
      if (p && p.value !== val) p.value = val;
      var m = $('#ape-gen-mode'); if (m) m.textContent = modeText();
      return val;
    }
    function paintMode() {
      var v = p ? p.value : (ps ? ps.value : (window.APE_PUBLICATION_MODE || 'balanced_95'));
      syncMode(v);
    }
    if (p) p.addEventListener('change', function () { syncMode(p.value); });
    if (ps) ps.addEventListener('change', function () { syncMode(ps.value); });
    paintMode();
    // Se publica en la superficie para que una prueba pueda verificarlo sin navegador.
    if (window.APE_OUTPUT_TEST_HOOKS) window.APE_OUTPUT_TEST_HOOKS.syncMode = syncMode;
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
