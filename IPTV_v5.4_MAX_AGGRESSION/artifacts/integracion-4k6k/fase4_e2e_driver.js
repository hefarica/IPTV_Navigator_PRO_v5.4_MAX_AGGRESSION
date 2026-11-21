(async function () {
  var h = location.hash || '';
  if (h.indexOf('#ape-e2e') !== 0) return;
  var P = {}; h.replace(/([?&#])(t|p)=([^&]*)/g, function (m, s, k, v) { P[k] = decodeURIComponent(v); return m; });
  var token = P.t || '', lista = (P.p || '').split(',').filter(Boolean);
  var R = { filas: [], err: [], log: [] };
  (function () { var oe = console.error, ow = console.warn;
    console.error = function () { try { R.log.push('E:' + Array.prototype.join.call(arguments, ' ').slice(0, 160)); } catch (e) {} return oe.apply(console, arguments); };
    console.warn = function () { try { R.log.push('W:' + Array.prototype.join.call(arguments, ' ').slice(0, 160)); } catch (e) {} return ow.apply(console, arguments); };
  })();
  window.addEventListener('error', function (ev) { R.log.push('X:' + String(ev && ev.message).slice(0, 160)); });
  var H = { 'X-APE-Token': token };

  /* CONDICIÓN DE ARNÉS (documentada): el pipeline intenta primero la File System
     Access API (showSaveFilePicker) y, sin gesto de usuario real, esa promesa no
     resuelve y no emite archivo. En headless se fuerza la ruta de respaldo que el
     propio codigo implementa (blob + ancla). No cambia el producto: cambia el
     camino que el test puede observar. */
  try { delete window.showSaveFilePicker; } catch (e) { }
  window.showSaveFilePicker = undefined;
  /* CONDICIÓN DE ARNÉS: staging sin salida a Internet. Se abortan al instante las
     llamadas al host de produccion para que el pipeline no espere reintentos. */
  (function () { var of = window.fetch;
    window.fetch = function (u, o) {
      var s = String(u && u.url ? u.url : u);
      if (s.indexOf('iptv-ape.duckdns.org') >= 0) return Promise.reject(new Error('staging_sin_red'));
      return of.apply(window, arguments);
    };
  })();
  function q(s) { return document.querySelector(s); }
  function esp(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function sha(buf) { var d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function perfilCanal() { var cs = (window.app && window.app.state && window.app.state.channelsMaster) || []; return cs[0] ? (cs[0].profile || cs[0].ape_profile || null) : null; }
  function uris(t) { return (t.match(/^https?:\/\/.*$/gm) || []).join('\n'); }
  function extinf(t) { return (t.match(/^#EXTINF:.*$/gm) || []).join('\n'); }
  function sinSidecar(t) { return t.split('\n').filter(function (l) { return l.indexOf('#EXT-X-APE-4K6K-INTENT:') !== 0; }).join('\n'); }
  function sidecarJson(t) { var l = t.split('\n').filter(function (x) { return x.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0; })[0];
    return l ? l.slice('#EXT-X-APE-4K6K-INTENT:'.length) : null; }

  /* Señal determinista: se intercepta la DESCARGA (ancla con download) y cada
     generación se correlaciona con SU href. Sin esperas fijas ni cap[0]. */
  var pendientes = [];
  var blobMap = new Map();
  var origCOU = URL.createObjectURL;
  URL.createObjectURL = function (b) { var u = origCOU.call(URL, b); try { blobMap.set(u, b); } catch (e) {} return u; };
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    try {
      var href = this.href || '';
      if (href.indexOf('blob:') === 0 && pendientes.length) {
        var p = pendientes.shift();
        p({ href: href, name: this.download || '', blob: blobMap.get(href) || null });
      }
    } catch (e) {}
    return origClick.apply(this, arguments);
  };
  function generar(flag) {
    return new Promise(function (resolve, reject) {
      var resuelto = false;
      function uno(cap) { resuelto = true; resolve(cap); }
      pendientes.push(uno);
      window.APE_4K6K_AUDIT = flag;
      q('#btnGenerateAudited').click();
      setTimeout(function () {
        if (resuelto) return;
        pendientes = pendientes.filter(function (x) { return x !== uno; });
        reject(new Error('sin descarga en 12s'));
      }, 12000);
    });
  }
  async function leer(cap) {
    var b = cap.blob, buf;
    if (b) buf = await b.arrayBuffer();
    else buf = await (await fetch(cap.href)).arrayBuffer();
    var texto = new TextDecoder().decode(buf);
    return { texto: texto, sha: await sha(buf), bytes: buf.byteLength, nombre: cap.name };
  }

  try {
    var lab = await (await fetch('/lab.json', { headers: H })).text();
    var norm = window.APELabNormalize.normalize(JSON.parse(lab));
    await window.APE_PROFILES_CONFIG.importFromLABData(norm.data);
    var txt = await (await fetch('/entrada.m3u8', { headers: H })).text();
    var inp = document.getElementById('apeM3uLocal');
    var dt = new DataTransfer(); dt.items.add(new File([txt], 'entrada_3ch.m3u8', { type: 'audio/x-mpegurl' }));
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    await esp(600);
    var base = (window.app.state.channelsMaster || []).map(function (c) { return c.name + '|' + c.url; });
    var cont = q('#profile-manager-container');

    for (var i = 0; i < lista.length; i++) {
      var pid = lista[i], fila = { id: pid };
      var btn = null;
      if (cont) {
        var ns = cont.querySelectorAll('[onclick]');
        for (var k = 0; k < ns.length; k++) {
          if ((ns[k].getAttribute('onclick') || '').indexOf("'" + pid + "'") >= 0) { btn = ns[k]; break; }
        }
      }
      fila.clickVisible = btn ? 'ok' : 'sin-boton';
      if (btn) { btn.click(); await esp(120); }
      else if (window.ProfileManagerV9 && window.ProfileManagerV9.selectProfile) { try { window.ProfileManagerV9.selectProfile(pid); fila.clickVisible = 'fallback-selectProfile'; await esp(120); } catch (e) {} }

      /* restablecer la entrada original de este perfil antes de medir */
      inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
      await esp(300);
      fila.perfilCanalAntes = perfilCanal();

      try {
        var off = await leer(await generar(false));
        var on1 = await leer(await generar(true));
        var on2 = await leer(await generar(true));
        fila.perfilCanalDespues = perfilCanal();
        fila.off = { bytes: off.bytes, sha: off.sha.slice(0,16), sidecar: (off.texto.match(/^#EXT-X-APE-4K6K-INTENT:/gm) || []).length };
        fila.on = { bytes: on1.bytes, sha256: on1.sha, sha: on1.sha.slice(0,16),
          sidecar: (on1.texto.match(/^#EXT-X-APE-4K6K-INTENT:/gm) || []).length, nombre: on1.nombre };
        var js = sidecarJson(on1.texto);
        if (js) {
          var j = JSON.parse(js);
          fila.on.profile = j.outputPolicy.profile;
          fila.on.selectedProfile = j.selectedProfile || null;
          fila.on.target = j.targetResolution;
          fila.on.premium = j.outputPolicy.premiumResolution;
          fila.on.reaFieldsWritten = j.reaFieldsWritten;
          fila.on.executed = j.outputPolicy.executed;
        }
        fila.idempotente = (sidecarJson(on1.texto) === sidecarJson(on2.texto));
        var rec = sinSidecar(on1.texto);
        /* Recuperación dentro del MISMO archivo: quitar el sidecar no debe tocar
         * EXTINF ni URIs. Comparar contra OTRA generación no es válido (el
         * generador es polimórfico); la igualdad byte a byte se prueba aparte,
         * con el generador sembrado. */
        fila.recuperacionExacta = (uris(rec) === uris(on1.texto) && extinf(rec) === extinf(on1.texto) &&
          rec.split('\n').length === on1.texto.split('\n').length - 3);
        var r = await fetch('/guardar', { method: 'POST', headers: Object.assign({ 'X-Perfil': pid }, H), body: on1.texto });
        fila.export = await r.json();
        var t2 = await (await fetch('/salida.m3u8?f=' + encodeURIComponent((fila.export && fila.export.archivo) || '') + '&t=' + encodeURIComponent(token), { headers: { 'X-APE-Token': token } })).text();
        var dt2 = new DataTransfer(); dt2.items.add(new File([t2], 'salida.m3u8', { type: 'audio/x-mpegurl' }));
        inp.files = dt2.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
        await esp(500);
        var ahora = (window.app.state.channelsMaster || []).map(function (c) { return c.name + '|' + c.url; });
        fila.reimport = { canales: ahora.length, mismaSecuencia: JSON.stringify(ahora) === JSON.stringify(base),
          bytes: t2.length, tieneSidecar: t2.indexOf('#EXT-X-APE-4K6K-INTENT:') >= 0 };
      } catch (e) {
        fila.motivo = String(e && e.message || e);
        fila.perfilCanalDespues = fila.perfilCanalAntes;
        R.err.push(pid + ': ' + fila.motivo);
      }
      R.filas.push(fila);
    }
    window.APE_4K6K_AUDIT = false;
  } catch (e) { R.err.push(String(e && e.message || e)); }
  URL.createObjectURL = origCOU;
  HTMLAnchorElement.prototype.click = origClick;
  var pre = document.createElement('pre'); pre.id = 'ape-e2e-out';
  pre.textContent = 'E2E:' + JSON.stringify(R);
  try { fetch('/resultado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(R) }); } catch (e) { }
  document.body.appendChild(pre);
})();
