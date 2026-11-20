(async function () {
  if (location.hash !== '#ape-e2e') return;
  var R = { filas: [], err: [] };
  var IDs = ['P0','P1','P2','P3','P4','P5','P0.5','P1.5','P2.5','P3.5','P4.5','P5.5'];
  function q(s) { return document.querySelector(s); }
  function esp(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function sha(buf) { var h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2,'0'); }).join('').slice(0,16); }
  try {
    var lab = await (await fetch('/lab.json')).text();
    var norm = window.APELabNormalize.normalize(JSON.parse(lab));
    await window.APE_PROFILES_CONFIG.importFromLABData(norm.data);
    var txt = await (await fetch('/entrada.m3u8')).text();
    var inp = document.getElementById('apeM3uLocal');
    var dt = new DataTransfer();
    dt.items.add(new File([txt], 'entrada_3ch.m3u8', { type: 'audio/x-mpegurl' }));
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    await esp(600);
    var base = (window.app.state.channelsMaster || []).map(function (c) { return c.name + '|' + c.url; });
    var cap = []; var orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { cap.push(b); return orig.call(URL, b); };
    var pm = window.ProfileManagerV9;

    for (var i = 0; i < IDs.length; i++) {
      var pid = IDs[i], fila = { id: pid };
      try { if (pm) pm.selectProfile(pid); } catch (e) {}
      await esp(150);
      window.APE_4K6K_AUDIT = false; cap.length = 0; q('#btnGenerateAudited').click(); await esp(1800);
      if (cap.length) { var bo = await cap[0].arrayBuffer(); fila.off = { bytes: bo.byteLength, sha: await sha(bo) }; }
      window.APE_4K6K_AUDIT = true; cap.length = 0; q('#btnGenerateAudited').click(); await esp(2200);
      if (!cap.length) { fila.on = 'sin blob'; R.filas.push(fila); continue; }
      var buf = await cap[0].arrayBuffer(); var t = new TextDecoder().decode(buf);
      var linea = t.split('\n').filter(function (l) { return l.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0; })[0];
      fila.on = { bytes: buf.byteLength, sha: await sha(buf),
        sidecar: t.split('\n').filter(function (l) { return l.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0; }).length };
      if (linea) { try { var j = JSON.parse(linea.slice('#EXT-X-APE-4K6K-INTENT:'.length));
        fila.on.profile = j.outputPolicy.profile; fila.on.target = j.targetResolution; } catch (e) {} }

      /* EXPORT a archivo privado (loopback -> APE_PRIVADO) */
      try {
        var r = await fetch('/guardar', { method: 'POST', headers: { 'X-Perfil': pid }, body: t });
        fila.export = await r.json();
      } catch (e) { fila.export = 'error: ' + e.message; }

      /* REIMPORT del archivo recién exportado por el MISMO control de la app */
      try {
        var r2 = await fetch('/salida.m3u8?p=' + encodeURIComponent(pid));
        var t2 = await r2.text();
        var dt2 = new DataTransfer();
        dt2.items.add(new File([t2], 'salida.m3u8', { type: 'audio/x-mpegurl' }));
        inp.files = dt2.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
        await esp(500);
        var ahora = (window.app.state.channelsMaster || []).map(function (c) { return c.name + '|' + c.url; });
        fila.reimport = { canales: ahora.length,
          mismaSecuencia: JSON.stringify(ahora) === JSON.stringify(base) };
      } catch (e) { fila.reimport = 'error: ' + e.message; }
      R.filas.push(fila);
    }
    URL.createObjectURL = orig;
    window.APE_4K6K_AUDIT = false;
  } catch (e) { R.err.push(String(e && e.message || e)); }
  var pre = document.createElement('pre'); pre.id = 'ape-e2e-out';
  pre.textContent = 'E2E:' + JSON.stringify(R);
  document.body.appendChild(pre);
})();