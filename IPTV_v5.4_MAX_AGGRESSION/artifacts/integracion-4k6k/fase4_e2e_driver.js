(async function () {
  if (location.hash !== '#ape-e2e') return;
  var R = { pasadas: [], err: [] };
  function q(s) { return document.querySelector(s); }
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function sha256(buf) {
    var h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  try {
    var lab = await (await fetch('/lab.json')).text();
    var norm = window.APELabNormalize.normalize(JSON.parse(lab));
    await window.APE_PROFILES_CONFIG.importFromLABData(norm.data);
    var txt = await (await fetch('/entrada.m3u8')).text();
    var inp = document.getElementById('apeM3uLocal');
    var dt = new DataTransfer();
    dt.items.add(new File([txt], 'entrada_3ch.m3u8', { type: 'audio/x-mpegurl' }));
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    await esperar(700);
    R.canales = (window.app.state.channelsMaster || []).length;

    var capturado = [];
    var orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { capturado.push(b); return orig.call(URL, b); };

    for (var i = 0; i < 3; i++) {
      var flag = (i === 1);                       /* OFF, ON, OFF */
      window.APE_4K6K_AUDIT = flag;
      capturado.length = 0;
      q('#btnGenerateAudited').click();
      await esperar(5000);
      var fila = { paso: i, flag: flag, blobs: capturado.length };
      if (capturado.length) {
        var buf = await capturado[0].arrayBuffer();
        var texto = new TextDecoder().decode(buf);
        fila.bytes = buf.byteLength;
        fila.sha = (await sha256(buf)).slice(0, 16);
        fila.lineas = texto.split('\n').length;
        fila.sidecar = texto.split('\n').filter(function (l) { return l.indexOf('#EXT-X-APE-4K6K-INTENT:') === 0; }).length;
        fila.extinf = (texto.match(/^#EXTINF:/gm) || []).length;
        fila.uris = (texto.match(/^https?:\/\//gm) || []).length;
      }
      R.pasadas.push(fila);
    }
    URL.createObjectURL = orig;
    window.APE_4K6K_AUDIT = false;
  } catch (e) { R.err.push(String(e && e.message || e)); }
  var pre = document.createElement('pre'); pre.id = 'ape-e2e-out';
  pre.textContent = 'E2E:' + JSON.stringify(R);
  document.body.appendChild(pre);
})();