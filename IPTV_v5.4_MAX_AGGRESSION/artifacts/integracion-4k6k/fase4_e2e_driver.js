(async function () {
  if (location.hash !== '#ape-e2e') return;
  var R = { filas: [], auto: {}, err: [] };
  var IDs = ['P0','P1','P2','P3','P4','P5','P0.5','P1.5','P2.5','P3.5','P4.5','P5.5'];
  function q(s) { return document.querySelector(s); }
  function esp(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function sha(buf) { var h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2,'0'); }).join('').slice(0,16); }
  function perfilCanal() { var cs = (window.app && window.app.state && window.app.state.channelsMaster) || []; return cs[0] ? (cs[0].profile || cs[0].ape_profile || null) : null; }
  try {
    var lab = await (await fetch('/lab.json')).text();
    var norm = window.APELabNormalize.normalize(JSON.parse(lab));
    await window.APE_PROFILES_CONFIG.importFromLABData(norm.data);
    var txt = await (await fetch('/entrada.m3u8')).text();
    var inp = document.getElementById('apeM3uLocal');
    var dt = new DataTransfer(); dt.items.add(new File([txt], 'entrada_3ch.m3u8', { type: 'audio/x-mpegurl' }));
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    await esp(600);

    R.auto.determineProfileGlobal = typeof window.determineProfile === 'function';
    R.auto.perfilCanalInicial = perfilCanal();

    var cont = q('#profile-manager-container');
    R.auto.controlVisible = !!cont;
    R.auto.botonesVisibles = cont ? cont.querySelectorAll('[onclick]').length : 0;

    var cap = []; var orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { cap.push(b); return orig.call(URL, b); };

    for (var i = 0; i < IDs.length; i++) {
      var pid = IDs[i], fila = { id: pid };
      /* 1) selección por el CONTROL VISIBLE (clic en el botón renderizado) */
      var b = null;
      if (cont) {
        var nodes = cont.querySelectorAll('[onclick]');
        for (var k = 0; k < nodes.length; k++) {
          var oc = nodes[k].getAttribute('onclick') || '';
          if (oc.indexOf("'" + pid + "'") >= 0) { b = nodes[k]; break; }
        }
      }
      fila.clickVisible = b ? 'ok' : 'sin-boton';
      if (b) { b.click(); await esp(120); }
      fila.perfilCanalAntes = perfilCanal();

      /* 2) generar con ON y leer el sidecar */
      window.APE_4K6K_AUDIT = true; cap.length = 0;
      q('#btnGenerateAudited').click();
      await esp(2200);
      fila.perfilCanalDespues = perfilCanal();
      if (!cap.length) { fila.on = 'sin blob'; R.filas.push(fila); continue; }
      var buf = await cap[0].arrayBuffer(); var t = new TextDecoder().decode(buf);
      var linea = t.split('\n').filter(function (l) { return l.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0; })[0];
      fila.on = { bytes: buf.byteLength, sha: await sha(buf),
        sidecar: t.split('\n').filter(function (l) { return l.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0; }).length };
      if (linea) { try { var j = JSON.parse(linea.slice('#EXT-X-APE-4K6K-INTENT:'.length));
        fila.on.profile = j.outputPolicy.profile; fila.on.selectedProfile = j.selectedProfile || null;
        fila.on.target = j.targetResolution; } catch (e) {} }
      R.filas.push(fila);
    }
    URL.createObjectURL = orig; window.APE_4K6K_AUDIT = false;
  } catch (e) { R.err.push(String(e && e.message || e)); }
  var pre = document.createElement('pre'); pre.id = 'ape-e2e-out';
  pre.textContent = 'E2E:' + JSON.stringify(R);
  document.body.appendChild(pre);
})();