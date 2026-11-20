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
    var cap = []; var orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { cap.push(b); return orig.call(URL, b); };
    var pm = window.ProfileManagerV9;

    for (var i = 0; i < IDs.length; i++) {
      var pid = IDs[i], fila = { id: pid };
      if (pm && typeof pm.selectProfile === 'function') { try { pm.selectProfile(pid); fila.sel = true; } catch (e) { fila.sel = String(e.message); } }
      else { fila.sel = 'sin ProfileManagerV9'; }
      await esp(200);
      for (var k = 0; k < 2; k++) {
        window.APE_4K6K_AUDIT = (k === 1);          /* OFF, ON */
        cap.length = 0;
        q('#btnGenerateAudited').click();
        await esp(2500);
        if (!cap.length) { fila[k === 1 ? 'on' : 'off'] = 'sin blob'; continue; }
        var buf = await cap[0].arrayBuffer();
        var t = new TextDecoder().decode(buf);
        var linea = t.split('\n').filter(function (l) { return l.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0; })[0];
        var d = { bytes: buf.byteLength, sha: await sha(buf),
                  sidecar: t.split('\n').filter(function (l) { return l.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0; }).length };
        if (linea) { try { var j = JSON.parse(linea.slice('#EXT-X-APE-4K6K-INTENT:'.length));
          d.intentProfile = j.outputPolicy.profile; d.target = j.targetResolution;
          d.premium = j.outputPolicy.premiumResolution; } catch (e) { d.parse = String(e.message); } }
        fila[k === 1 ? 'on' : 'off'] = d;
      }
      R.filas.push(fila);
    }
    URL.createObjectURL = orig;
    window.APE_4K6K_AUDIT = false;
  } catch (e) { R.err.push(String(e && e.message || e)); }
  var pre = document.createElement('pre'); pre.id = 'ape-e2e-out';
  pre.textContent = 'E2E:' + JSON.stringify(R);
  document.body.appendChild(pre);
})();