(async function () {
  var h = location.hash || '';
  if (h.indexOf('#ape-e2e') !== 0) return;
  var P = {}; h.replace(/([?&#])(t|p)=([^&]*)/g, function (m, s, k, v) { P[k] = decodeURIComponent(v); return m; });
  var token = P.t || '', lista = (P.p || '').split(',');
  var R = { filas: [], err: [] };
  var H = { 'X-APE-Token': token };
  function q(s) { return document.querySelector(s); }
  function esp(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function sha(buf) { var d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('').slice(0, 16); }
  function perfilCanal() { var cs = (window.app && window.app.state && window.app.state.channelsMaster) || []; return cs[0] ? (cs[0].profile || cs[0].ape_profile || null) : null; }
  function uris(t) { return (t.match(/^https?:\/\/.*$/gm) || []).join('\n'); }
  function extinf(t) { return (t.match(/^#EXTINF:.*$/gm) || []).join('\n'); }
  function sinSidecar(t) { return t.split('\n').filter(function (l) { return l.indexOf('#EXT-X-APE-4K6K-INTENT:') !== 0; }).join('\n'); }
  function sidecarJson(t) { var l = t.split('\n').filter(function (x) { return x.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0; })[0];
    if (!l) return null; try { return l.slice('#EXT-X-APE-4K6K-INTENT:'.length); } catch (e) { return null; } }

  /* correlación: cada generación resuelve SU promesa cuando el hook captura su blob */
  var pendientes = [];
  var orig = URL.createObjectURL;
  URL.createObjectURL = function (b) { /* solo blobs de lista (grandes) resuelven la generacion pendiente */
    if (b && b.size > 1000 && pendientes.length) { var p = pendientes.shift(); p(b); }
    return orig.call(URL, b); };
  function generar(flag) {
    return new Promise(function (resolve, reject) {
      pendientes.push(resolve);
      window.APE_4K6K_AUDIT = flag;
      q('#btnGenerateAudited').click();
      setTimeout(function () { if (pendientes.indexOf(resolve) >= 0) { pendientes = pendientes.filter(function (x) { return x !== resolve; }); reject(new Error('sin blob')); } }, 9000);
    });
  }
  async function leer(b) { var buf = await b.arrayBuffer(); return { buf: buf, texto: new TextDecoder().decode(buf), sha: await sha(buf), bytes: buf.byteLength }; }

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
      if (cont) { var ns = cont.querySelectorAll('[onclick]');
        for (var k = 0; k < ns.length; k++) { if ((ns[k].getAttribute('onclick') || '').indexOf("'" + pid + "'") >= 0) { btn = ns[k]; break; } } }
      fila.clickVisible = btn ? 'ok' : 'sin-boton';
      if (btn) { btn.click(); await esp(120); }
      fila.perfilCanalAntes = perfilCanal();
      try {
        var off = await leer(await generar(false));
        var on1 = await leer(await generar(true));
        var on2 = await leer(await generar(true));
        fila.perfilCanalDespues = perfilCanal();
        fila.off = { bytes: off.bytes, sha: off.sha, sidecar: (off.texto.match(/^#EXT-X-APE-4K6K-INTENT:/gm) || []).length };
        fila.on = { bytes: on1.bytes, sha: on1.sha, sha256: on1.sha, sidecar: (on1.texto.match(/^#EXT-X-APE-4K6K-INTENT:/gm) || []).length };
        var js = sidecarJson(on1.texto);
        if (js) { var j = JSON.parse(js); fila.on.profile = j.outputPolicy.profile; fila.on.selectedProfile = j.selectedProfile || null; fila.on.target = j.targetResolution; }
        fila.idempotente = (sidecarJson(on1.texto) === sidecarJson(on2.texto));
        var rec = sinSidecar(on1.texto);
        fila.recuperacionExacta = (rec.split('\n').length === off.texto.split('\n').length &&
          uris(rec) === uris(off.texto) && extinf(rec) === extinf(off.texto));
        var r = await fetch('/guardar', { method: 'POST', headers: Object.assign({ 'X-Perfil': pid }, H), body: on1.texto });
        fila.export = await r.json();
        var t2 = await (await fetch('/salida.m3u8?p=' + encodeURIComponent(pid), { headers: H })).text();
        var dt2 = new DataTransfer(); dt2.items.add(new File([t2], 'salida.m3u8', { type: 'audio/x-mpegurl' }));
        inp.files = dt2.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
        await esp(500);
        var ahora = (window.app.state.channelsMaster || []).map(function (c) { return c.name + '|' + c.url; });
        fila.reimport = { canales: ahora.length, mismaSecuencia: JSON.stringify(ahora) === JSON.stringify(base),
          bytes: t2.length, tieneSidecar: t2.indexOf('#EXT-X-APE-4K6K-INTENT:') >= 0 };
      } catch (e) { fila.on = 'sin blob'; fila.perfilCanalDespues = fila.perfilCanalAntes; fila.motivo = String(e.message || e); R.err.push(pid + ': ' + String(e.message || e)); }
      R.filas.push(fila);
    }
    window.APE_4K6K_AUDIT = false;
  } catch (e) { R.err.push(String(e && e.message || e)); }
  URL.createObjectURL = orig;
  var pre = document.createElement('pre'); pre.id = 'ape-e2e-out';
  pre.textContent = 'E2E:' + JSON.stringify(R);
  document.body.appendChild(pre);
})();